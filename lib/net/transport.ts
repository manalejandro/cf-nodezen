/**
 * RoomTransport — connectivity layer for a NodeZen room.
 *
 * Topology:
 *  - One WebSocket to the room's Durable Object (`/rt/<roomId>`) used for
 *    presence, WebRTC signaling and as a relay fallback.
 *  - A full WebRTC mesh between peers. Once a data channel opens, messages
 *    flow peer-to-peer; before that (or if P2P fails) they are relayed
 *    through the Durable Object, so the room always works.
 *
 * Delivery is at-least-once with deduplication by wire message id.
 */
import {
	type NetMessage,
	type Profile,
	type WireMessage,
	encodeWire,
	isChunkPart,
	randomId,
	type ChunkPart,
} from "../protocol";

export type TransportStatus = "connecting" | "online" | "reconnecting" | "offline";

export interface PeerConnectionState {
	id: string;
	profile: Profile;
	/** "p2p" once a data channel is open, otherwise "relay". */
	transport: "p2p" | "relay";
}

export interface TransportCallbacks {
	onStatus(status: TransportStatus): void;
	/** Full roster refresh from the DO. */
	onRoster(peers: Profile[]): void;
	onPeerJoined(peer: Profile): void;
	onPeerLeft(peerId: string): void;
	onMessage(msg: NetMessage, from: string): void;
}

interface PendingChunk {
	from: string;
	n: number;
	parts: Map<number, string>;
	expires: number;
}

interface PeerLink {
	profile: Profile;
	pc: RTCPeerConnection | null;
	dc: RTCDataChannel | null;
	p2p: boolean;
}

const WS_RECONNECT_BASE_MS = 500;
const WS_RECONNECT_MAX_MS = 15_000;
const HEARTBEAT_MS = 25_000;
const DEDUPE_MAX = 800;
const CHUNK_TTL_MS = 30_000;
const DC_MAX_BUFFERED = 4 * 1024 * 1024;

export class RoomTransport {
	private ws: WebSocket | null = null;
	private closed = false;
	private reconnectAttempt = 0;
	private heartbeat: number | undefined;
	private readonly peers = new Map<string, PeerLink>();
	private readonly seen = new Set<string>();
	private readonly seenOrder: string[] = [];
	private readonly chunkBuffers = new Map<string, PendingChunk>();
	private iceServers: RTCIceServer[] = [{ urls: ["stun:stun.cloudflare.com:3478"] }];
	private iceFetched = false;

	readonly self: Profile;

	constructor(
		private readonly roomId: string,
		self: Profile,
		private readonly callbacks: TransportCallbacks,
	) {
		this.self = self;
		// Debug handle (handy in the devtools console).
		if (typeof window !== "undefined") {
			(window as unknown as Record<string, unknown>).__nodezenTransport = this;
		}
	}

	get peerCount(): number {
		return this.peers.size;
	}

	get p2pCount(): number {
		return [...this.peers.values()].filter((p) => p.p2p).length;
	}

	get status(): TransportStatus {
		if (!this.ws) return "offline";
		switch (this.ws.readyState) {
			case WebSocket.OPEN:
				return this.reconnectAttempt > 0 ? "online" : "online";
			case WebSocket.CONNECTING:
				return this.reconnectAttempt > 0 ? "reconnecting" : "connecting";
			default:
				return "offline";
		}
	}

	peerProfiles(): PeerConnectionState[] {
		return [...this.peers.values()].map((p) => ({
			id: p.profile.id,
			profile: p.profile,
			transport: p.p2p ? "p2p" : "relay",
		}));
	}

	/** Diagnostics for the devtools console. */
	debugInfo() {
		return {
			self: this.self.id,
			ws: this.ws?.readyState,
			iceServers: this.iceServers,
			peers: [...this.peers.values()].map((p) => ({
				id: p.profile.id,
				p2p: p.p2p,
				dc: p.dc?.readyState ?? null,
				pc: p.pc?.connectionState ?? null,
				ice: p.pc?.iceConnectionState ?? null,
				signaling: p.pc?.signalingState ?? null,
			})),
		};
	}

	async connect(): Promise<void> {
		if (this.closed) return;
		if (!this.iceFetched) {
			this.iceFetched = true;
			// Best effort: richer ICE config (Cloudflare TURN) from the server.
			try {
				const response = await fetch("/api/turn");
				if (response.ok) {
					const data = (await response.json()) as { iceServers?: RTCIceServer[] };
					if (data.iceServers?.length) this.iceServers = data.iceServers;
				}
			} catch {
				// fall back to default STUN
			}
		}
		this.openSocket();
	}

	close(): void {
		this.closed = true;
		if (this.heartbeat !== undefined) self.clearInterval(this.heartbeat);
		for (const link of this.peers.values()) {
			try {
				link.dc?.close();
			} catch {
				/* noop */
			}
			link.pc?.close();
		}
		this.peers.clear();
		try {
			this.ws?.close(1000, "leaving");
		} catch {
			/* noop */
		}
		this.ws = null;
	}

	/* ------------------------------ WebSocket ------------------------------ */

	private wsUrl(): string {
		const proto = location.protocol === "https:" ? "wss:" : "ws:";
		const params = new URLSearchParams({
			p: this.self.id,
			n: this.self.name,
			c: this.self.color.replace("#", ""),
		});
		return `${proto}//${location.host}/rt/${encodeURIComponent(this.roomId)}?${params}`;
	}

	private openSocket(): void {
		if (this.closed) return;
		this.callbacks.onStatus(this.reconnectAttempt === 0 ? "connecting" : "reconnecting");
		const ws = new WebSocket(this.wsUrl());
		this.ws = ws;

		ws.addEventListener("open", () => {
			this.reconnectAttempt = 0;
			this.callbacks.onStatus("online");
			if (this.heartbeat !== undefined) self.clearInterval(this.heartbeat);
			this.heartbeat = self.setInterval(() => {
				this.sendRaw(JSON.stringify({ t: "ping" }));
			}, HEARTBEAT_MS);
		});

		ws.addEventListener("message", (event) => {
			this.handleSocketMessage(String(event.data));
		});

		const scheduleReconnect = () => {
			if (this.closed || this.ws !== ws) return;
			this.ws = null;
			this.callbacks.onStatus("reconnecting");
			const delay = Math.min(WS_RECONNECT_BASE_MS * 2 ** this.reconnectAttempt, WS_RECONNECT_MAX_MS);
			this.reconnectAttempt++;
			setTimeout(() => this.openSocket(), delay);
		};
		ws.addEventListener("close", scheduleReconnect);
		ws.addEventListener("error", () => {
			try {
				ws.close();
			} catch {
				/* noop */
			}
		});
	}

	private sendRaw(data: string): void {
		if (this.ws?.readyState === WebSocket.OPEN) {
			this.ws.send(data);
		}
	}

	private handleSocketMessage(raw: string): void {
		let envelope: Record<string, unknown>;
		try {
			envelope = JSON.parse(raw) as Record<string, unknown>;
		} catch {
			return;
		}
		switch (envelope.t) {
			case "room": {
				const peers = (envelope.peers as Profile[]) ?? [];
				// Forget peers that are no longer in the room.
				const ids = new Set(peers.map((p) => p.id));
				for (const id of [...this.peers.keys()]) {
					if (!ids.has(id)) this.removePeer(id, false);
				}
				for (const peer of peers) this.ensurePeer(peer);
				this.callbacks.onRoster(peers);
				// Deterministic offerer: the lexicographically smaller id dials.
				for (const peer of peers) {
					if (this.self.id < peer.id) void this.startConnection(peer.id);
				}
				break;
			}
			case "joined": {
				const peer = envelope.peer as Profile;
				if (peer?.id && peer.id !== this.self.id) {
					this.ensurePeer(peer);
					this.callbacks.onPeerJoined(peer);
					if (this.self.id < peer.id) void this.startConnection(peer.id);
				}
				break;
			}
			case "left": {
				const id = String(envelope.id ?? "");
				if (id) {
					this.removePeer(id, true);
				}
				break;
			}
			case "relay":
			case "broadcast": {
				const from = String(envelope.from ?? "");
				const payload = envelope.payload as WireMessage | ChunkPart | undefined;
				if (from && payload) this.receive(from, payload);
				break;
			}
			case "error":
				console.warn("[nodezen] room error:", envelope.message);
				break;
			default:
				break;
		}
	}

	/* ------------------------------- WebRTC -------------------------------- */

	private ensurePeer(profile: Profile): PeerLink {
		const existing = this.peers.get(profile.id);
		if (existing) {
			existing.profile = profile;
			return existing;
		}
		const link: PeerLink = { profile, pc: null, dc: null, p2p: false };
		this.peers.set(profile.id, link);
		return link;
	}

	private removePeer(id: string, notify: boolean): void {
		const link = this.peers.get(id);
		if (!link) return;
		this.peers.delete(id);
		try {
			link.dc?.close();
		} catch {
			/* noop */
		}
		link.pc?.close();
		if (notify) this.callbacks.onPeerLeft(id);
	}

	private getOrCreatePc(peerId: string): RTCPeerConnection | null {
		const link = this.peers.get(peerId);
		if (!link) return null;
		if (link.pc) return link.pc;

		const pc = new RTCPeerConnection({ iceServers: this.iceServers });
		link.pc = pc;

		pc.addEventListener("icecandidate", (event) => {
			if (event.candidate) {
				this.sendTo(peerId, { kind: "signal", ice: event.candidate.toJSON() });
			}
		});

		pc.addEventListener("connectionstatechange", () => {
			if (pc.connectionState === "failed") {
				// Tear down and let the next roster/joined event rebuild it.
				pc.close();
				link.pc = null;
				link.dc = null;
				if (link.p2p) {
					link.p2p = false;
					this.callbacks.onRoster([...this.peers.values()].map((p) => p.profile));
				}
				if (this.self.id < peerId) {
					setTimeout(() => void this.startConnection(peerId), 1000 + Math.random() * 2000);
				}
			} else if (pc.connectionState === "closed" || pc.connectionState === "disconnected") {
				if (link.p2p) {
					link.p2p = false;
					this.callbacks.onRoster([...this.peers.values()].map((p) => p.profile));
				}
			} else if (pc.connectionState === "connected") {
				// Data channel open event drives p2p state.
			}
		});

		pc.addEventListener("datachannel", (event) => {
			this.attachDataChannel(peerId, event.channel);
		});

		return pc;
	}

	private async startConnection(peerId: string): Promise<void> {
		const link = this.peers.get(peerId);
		if (!link || link.pc) return;
		const pc = this.getOrCreatePc(peerId);
		if (!pc) return;

		const dc = pc.createDataChannel("nodezen", { ordered: true });
		this.attachDataChannel(peerId, dc);

		try {
			const offer = await pc.createOffer();
			await pc.setLocalDescription(offer);
			this.sendTo(peerId, { kind: "signal", sdp: pc.localDescription?.toJSON() });
		} catch (err) {
			console.warn("[nodezen] offer failed", err);
		}
	}

	private attachDataChannel(peerId: string, dc: RTCDataChannel): void {
		const link = this.peers.get(peerId);
		if (!link) return;
		link.dc = dc;

		dc.addEventListener("open", () => {
			link.p2p = true;
			this.callbacks.onRoster([...this.peers.values()].map((p) => p.profile));
		});

		dc.addEventListener("close", () => {
			link.p2p = false;
			if (link.dc === dc) link.dc = null;
			this.callbacks.onRoster([...this.peers.values()].map((p) => p.profile));
		});

		dc.addEventListener("message", (event) => {
			this.receiveFromFrame(peerId, String(event.data));
		});
	}

	private async handleSignal(from: string, msg: { sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit }): Promise<void> {
		const pc = this.getOrCreatePc(from);
		if (!pc) return;

		if (msg.sdp) {
			const description = msg.sdp;
			// Perfect negotiation: the offerer is the smaller id; the other peer is polite.
			const polite = this.self.id > from;
			const offerCollision = description.type === "offer" && pc.signalingState !== "stable";
			if (offerCollision && !polite) return; // ignore the colliding offer
			try {
				if (offerCollision) {
					await Promise.all([pc.setLocalDescription({ type: "rollback" }), pc.setRemoteDescription(description)]);
				} else {
					await pc.setRemoteDescription(description);
				}
				if (description.type === "offer") {
					const answer = await pc.createAnswer();
					await pc.setLocalDescription(answer);
					this.sendTo(from, { kind: "signal", sdp: pc.localDescription?.toJSON() });
				}
			} catch (err) {
				console.warn("[nodezen] signaling error", err);
			}
			return;
		}

		if (msg.ice) {
			try {
				await pc.addIceCandidate(msg.ice);
			} catch {
				// candidates arriving before the remote description are harmless here
			}
		}
	}

	/* ------------------------------ messaging ------------------------------ */

	private isDuplicate(id: string): boolean {
		if (this.seen.has(id)) return true;
		this.seen.add(id);
		this.seenOrder.push(id);
		while (this.seenOrder.length > DEDUPE_MAX) {
			const old = this.seenOrder.shift();
			if (old) this.seen.delete(old);
		}
		return false;
	}

	/** Deliver a wire payload (possibly a chunk part) coming from `from`. */
	private receive(from: string, payload: WireMessage | ChunkPart): void {
		if (isChunkPart(payload)) {
			const key = `${from}:${payload.cid}`;
			let pending = this.chunkBuffers.get(key);
			if (!pending) {
				pending = { from, n: payload.n, parts: new Map(), expires: Date.now() + CHUNK_TTL_MS };
				this.chunkBuffers.set(key, pending);
			}
			pending.parts.set(payload.i, payload.data);
			if (pending.parts.size === pending.n) {
				this.chunkBuffers.delete(key);
				let json = "";
				for (let i = 0; i < pending.n; i++) json += pending.parts.get(i) ?? "";
				this.receiveFromFrame(from, json);
			} else {
				// Lazy expiry sweep.
				const now = Date.now();
				for (const [k, v] of this.chunkBuffers) {
					if (v.expires < now) this.chunkBuffers.delete(k);
				}
			}
			return;
		}

		const wire = payload as WireMessage;
		if (!wire?.id || !wire.msg) return;
		if (this.isDuplicate(wire.id)) return;
		const sender = wire.from || from;
		if (wire.msg.kind === "signal") {
			void this.handleSignal(sender, wire.msg);
			return;
		}
		this.callbacks.onMessage(wire.msg, sender);
	}

	private receiveFromFrame(from: string, frame: string): void {
		try {
			const parsed = JSON.parse(frame) as WireMessage | ChunkPart;
			this.receive(from, parsed);
		} catch {
			// ignore malformed frames
		}
	}

	private sendViaSocket(peerId: string, frame: string): void {
		this.sendRaw(JSON.stringify({ t: "relay", to: peerId, payload: JSON.parse(frame) }));
	}

	private sendWire(peerId: string, wire: WireMessage): void {
		const frames = encodeWire(wire);
		const link = this.peers.get(peerId);
		const dc = link?.dc;
		const useP2P = link?.p2p && dc && dc.readyState === "open";

		for (const frame of frames) {
			if (useP2P && dc) {
				if (dc.bufferedAmount > DC_MAX_BUFFERED) {
					// Backpressure: fall back to the socket relay for this frame.
					this.sendViaSocket(peerId, frame);
					continue;
				}
				try {
					dc.send(frame);
					continue;
				} catch {
					// fall through to socket
				}
			}
			this.sendViaSocket(peerId, frame);
		}
	}

	/** Send a message to one peer. */
	sendTo(peerId: string, msg: NetMessage): void {
		if (peerId === this.self.id) return;
		this.sendWire(peerId, { id: randomId(16), from: this.self.id, msg });
	}

	/** Send a message to every peer. Falls back to a single socket broadcast. */
	broadcast(msg: NetMessage): void {
		const wire: WireMessage = { id: randomId(16), from: this.self.id, msg };
		const frames = encodeWire(wire);
		const targets = [...this.peers.keys()];

		const anyP2P = targets.some((id) => {
			const link = this.peers.get(id);
			return link?.p2p && link.dc?.readyState === "open";
		});

		if (!anyP2P && this.ws?.readyState === WebSocket.OPEN) {
			// Let the DO fan out; every frame of the (possibly chunked) message.
			for (const frame of frames) {
				this.sendRaw(JSON.stringify({ t: "broadcast", payload: JSON.parse(frame) }));
			}
			return;
		}

		for (const id of targets) this.sendWire(id, wire);
	}
}
