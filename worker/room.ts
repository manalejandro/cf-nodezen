/**
 * NodeZenRoom — a Durable Object that acts as the signaling + presence hub
 * for a NodeZen room.
 *
 * It never stores workspace data (workspaces live in the participants'
 * browsers and sync peer-to-peer over WebRTC data channels). The DO only:
 *
 *  - accepts WebSocket connections at `/rt/<roomId>`
 *  - tracks who is in the room (presence)
 *  - relays signaling payloads (WebRTC offer/answer/ICE) between peers
 *  - relays messages when a direct data channel is not (yet) available
 *
 * Wire protocol (JSON over WebSocket):
 *
 *  client -> DO
 *    { t: "relay",     to: peerId, payload: unknown }   forwarded to one peer
 *    { t: "broadcast", payload: unknown }               forwarded to every other peer
 *    { t: "ping" }                                      keep-alive
 *
 *  DO -> client
 *    { t: "room",      peers: PeerInfo[] }              full roster, on join
 *    { t: "joined",    peer: PeerInfo }                 a peer joined
 *    { t: "left",      id: peerId }                     a peer left
 *    { t: "relay",     from: peerId, payload: unknown }
 *    { t: "broadcast", from: peerId, payload: unknown }
 *    { t: "error",     message: string }
 *    { t: "pong" }
 */

export interface PeerInfo {
	/** Unique per-session peer id. */
	id: string;
	/** Display name chosen by the user. */
	name: string;
	/** Hex color used for avatars and remote cursors. */
	color: string;
	/** Unix ms timestamp of when the peer joined. */
	joinedAt: number;
}

interface Session {
	ws: WebSocket;
	peer: PeerInfo;
	/** Simple sliding-window rate limiter (message timestamps). */
	hits: number[];
}

const MAX_PEERS = 16;
const MAX_MESSAGE_BYTES = 1024 * 1024; // 1 MiB per WS frame
const RATE_WINDOW_MS = 10_000;
const RATE_MAX_MESSAGES = 1200;
const ROOM_ID_RE = /^[a-z0-9][a-z0-9-]{2,63}$/;

export class NodeZenRoom {
	private readonly sessions = new Map<string, Session>();

	constructor(
		private readonly state: DurableObjectState,
		private readonly env: unknown,
	) {}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
			return new Response(
				JSON.stringify({
					ok: true,
					room: url.pathname.split("/").pop() ?? "",
					peers: this.peerList().length,
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		}

		// The room id is the DO name; we re-validate it here defensively.
		const roomId = url.searchParams.get("room") ?? "";
		if (!ROOM_ID_RE.test(roomId)) {
			return new Response("Invalid room id", { status: 400 });
		}

		const peerId = (url.searchParams.get("p") ?? "").slice(0, 64);
		if (!/^[a-zA-Z0-9_-]{4,64}$/.test(peerId)) {
			return new Response("Invalid peer id", { status: 400 });
		}
		if (this.sessions.size >= MAX_PEERS && !this.sessions.has(peerId)) {
			return new Response("Room is full", { status: 503 });
		}

		const peer: PeerInfo = {
			id: peerId,
			name: (url.searchParams.get("n") ?? "anonymous").slice(0, 48),
			color: normalizeColor(url.searchParams.get("c")),
			joinedAt: Date.now(),
		};

		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);
		this.attach(server, peer);
		return new Response(null, { status: 101, webSocket: client });
	}

	private peerList(): PeerInfo[] {
		return [...this.sessions.values()].map((s) => s.peer);
	}

	private attach(ws: WebSocket, peer: PeerInfo) {
		ws.accept();

		// Replace any stale socket for the same peer id (e.g. after a refresh).
		const stale = this.sessions.get(peer.id);
		if (stale) {
			this.sessions.delete(peer.id);
			try {
				stale.ws.close(4000, "replaced");
			} catch {
				// ignore
			}
		}

		const session: Session = { ws, peer, hits: [] };
		this.sessions.set(peer.id, session);

		// Send the current roster to the newcomer, then announce them.
		this.send(ws, { t: "room", peers: this.peerList().filter((p) => p.id !== peer.id) });
		this.broadcast(
			{ t: "joined", peer },
			(from) => from.id !== peer.id,
		);

		ws.addEventListener("message", (event) => {
			try {
				this.onMessage(session, String(event.data));
			} catch {
				// Malformed frames are ignored; the rate limiter guards abuse.
			}
		});

		const cleanup = () => {
			if (this.sessions.get(peer.id) !== session) return;
			this.sessions.delete(peer.id);
			this.broadcast({ t: "left", id: peer.id }, (from) => from.id !== peer.id);
		};
		ws.addEventListener("close", cleanup);
		ws.addEventListener("error", cleanup);
	}

	private onMessage(session: Session, raw: string) {
		if (raw.length * 2 > MAX_MESSAGE_BYTES) {
			this.send(session.ws, { t: "error", message: "message too large" });
			return;
		}

		// Sliding-window rate limit.
		const now = Date.now();
		session.hits.push(now);
		while (session.hits.length && session.hits[0]! < now - RATE_WINDOW_MS) {
			session.hits.shift();
		}
		if (session.hits.length > RATE_MAX_MESSAGES) {
			session.ws.close(4008, "rate limited");
			return;
		}

		const msg = JSON.parse(raw) as Record<string, unknown>;
		switch (msg.t) {
			case "ping": {
				this.send(session.ws, { t: "pong" });
				return;
			}
			case "relay": {
				const to = this.sessions.get(String(msg.to ?? ""));
				if (to) {
					this.send(to.ws, { t: "relay", from: session.peer.id, payload: msg.payload });
				}
				return;
			}
			case "broadcast": {
				this.broadcast(
					{ t: "broadcast", from: session.peer.id, payload: msg.payload },
					(from) => from.id !== session.peer.id,
				);
				return;
			}
			default:
				return;
		}
	}

	private broadcast(message: unknown, filter: (peer: PeerInfo) => boolean) {
		for (const session of this.sessions.values()) {
			if (filter(session.peer)) {
				this.send(session.ws, message);
			}
		}
	}

	private send(ws: WebSocket, message: unknown) {
		try {
			ws.send(JSON.stringify(message));
		} catch {
			// The socket may have closed between events; ignore.
		}
	}
}

function normalizeColor(input: string | null): string {
	const value = (input ?? "").replace("#", "");
	return /^[0-9a-fA-F]{6}$/.test(value) ? `#${value.toLowerCase()}` : "#2dd4bf";
}
