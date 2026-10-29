/**
 * Shared wire protocol for NodeZen rooms.
 *
 * Every logical message is a `NetMessage`. Messages travel either over a
 * WebRTC data channel (preferred, peer-to-peer) or are relayed through the
 * room's Durable Object WebSocket when a direct channel is not available.
 * Each message carries a unique id so receivers can deduplicate deliveries.
 */

export interface Profile {
	/** Stable-per-session peer id. */
	id: string;
	/** Display name. */
	name: string;
	/** Avatar / cursor color, hex. */
	color: string;
}

/** Hybrid logical clock stamp used for last-writer-wins merging. */
export interface HLC {
	/** Physical time in unix ms. */
	t: number;
	/** Logical counter for same-ms ordering. */
	c: number;
	/** Peer that produced the stamp (final tie-breaker). */
	id: string;
}

export function hlcCompare(a: HLC, b: HLC): number {
	if (a.t !== b.t) return a.t - b.t;
	if (a.c !== b.c) return a.c - b.c;
	return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export type FsOpKind = "write" | "delete" | "mkdir" | "rename";

/** A single replicated file-system mutation. */
export interface FsOp {
	kind: FsOpKind;
	/** Absolute workspace path, e.g. "/src/index.ts". */
	path: string;
	/** Rename target. */
	to?: string;
	/** File content for writes. */
	content?: string;
	/** "b64" when content is base64-encoded binary data. */
	enc?: "utf8" | "b64";
	/** Stamp of the mutation. */
	hlc: HLC;
	/** Peer that originated the mutation. */
	origin: string;
}

export interface ChatMessage {
	id: string;
	author: Profile;
	text: string;
	ts: number;
	/** System notices (joins, runs) are rendered differently. */
	system?: boolean;
}

export interface FileEntry {
	path: string;
	content: string;
	enc: "utf8" | "b64";
}

export interface WorkspaceSnapshot {
	files: FileEntry[];
	/** path -> HLC of the last mutation (tombstones included). */
	meta: Record<string, HLC & { del?: 1 }>;
	chat: ChatMessage[];
	/** Snapshot producer, used for tie-breaks. */
	by: string;
}

export type TerminalKind = "stdout" | "stderr" | "system" | "info";

export interface TerminalLine {
	id: string;
	kind: TerminalKind;
	text: string;
	ts: number;
	/** Peer that produced the line (runs are shared with the room). */
	peer?: Profile;
}

/** WebRTC signaling payload relayed through the DO or an open channel. */
export interface SignalMessage {
	kind: "signal";
	sdp?: RTCSessionDescriptionInit;
	ice?: RTCIceCandidateInit;
}

export interface SyncHelloMessage {
	kind: "sync-hello";
	/** True when the peer has a non-empty workspace. */
	hasWorkspace: boolean;
	/** Highest HLC time known to the peer (cheap freshness hint). */
	clock: number;
}

export interface SnapshotRequestMessage {
	kind: "snapshot-req";
}

export interface SnapshotMessage {
	kind: "snapshot";
	snapshot: WorkspaceSnapshot;
}

export interface FsOpMessage {
	kind: "fs-op";
	op: FsOp;
}

export interface ChatNetMessage {
	kind: "chat";
	message: ChatMessage;
}

export interface PresenceMessage {
	kind: "presence";
	openFile: string | null;
	running: boolean;
}

export interface EditorStateMessage {
	kind: "editor";
	path: string | null;
	cursor: { lineNumber: number; column: number } | null;
}

export interface RunNetMessage {
	kind: "run";
	phase: "start" | "line" | "end";
	runner: Profile;
	entry?: string;
	line?: TerminalLine;
	code?: number | null;
}

export type NetMessage =
	| SignalMessage
	| SyncHelloMessage
	| SnapshotRequestMessage
	| SnapshotMessage
	| FsOpMessage
	| ChatNetMessage
	| PresenceMessage
	| EditorStateMessage
	| RunNetMessage;

/** Envelope placed on the wire; `id` powers deduplication. */
export interface WireMessage {
	id: string;
	from: string;
	msg: NetMessage;
}

/* ------------------------------------------------------------------ */
/* Chunking: large payloads (workspace snapshots) are split so they     */
/* fit comfortably in data channel frames and DO websocket limits.      */
/* ------------------------------------------------------------------ */

export const CHUNK_SIZE = 120_000;

export interface ChunkPart {
	kind: "__chunk";
	/** Wire id of the reassembled message. */
	cid: string;
	from: string;
	i: number;
	n: number;
	data: string;
}

export function isChunkPart(value: unknown): value is ChunkPart {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as { kind?: unknown }).kind === "__chunk"
	);
}

export function encodeWire(wire: WireMessage): string[] {
	const json = JSON.stringify(wire);
	if (json.length <= CHUNK_SIZE) return [json];
	const parts: string[] = [];
	const n = Math.ceil(json.length / CHUNK_SIZE);
	for (let i = 0; i < n; i++) {
		const chunk: ChunkPart = {
			kind: "__chunk",
			cid: wire.id,
			from: wire.from,
			i,
			n,
			data: json.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
		};
		parts.push(JSON.stringify(chunk));
	}
	return parts;
}

/* ------------------------------------------------------------------ */
/* HLC helpers                                                          */
/* ------------------------------------------------------------------ */

export class Clock {
	private t = 0;
	private c = 0;

	constructor(private readonly id: string) {}

	get peerId(): string {
		return this.id;
	}

	now(): HLC {
		const phys = Date.now();
		if (phys > this.t) {
			this.t = phys;
			this.c = 0;
		} else {
			this.c += 1;
		}
		return { t: this.t, c: this.c, id: this.id };
	}

	observe(remote: HLC): void {
		const phys = Date.now();
		if (remote.t > this.t && remote.t > phys) {
			this.t = remote.t;
			this.c = remote.c + 1;
		} else if (remote.t === this.t) {
			this.c = Math.max(this.c, remote.c) + 1;
		} else {
			this.t = Math.max(this.t, phys);
			this.c += 1;
		}
	}
}

/* ------------------------------------------------------------------ */
/* Ids and misc                                                         */
/* ------------------------------------------------------------------ */

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // no l/o/0/1

export function randomId(length = 10): string {
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	let out = "";
	for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
	return out;
}

export function newRoomId(): string {
	return `nz-${randomId(10)}`;
}

export const ROOM_ID_RE = /^[a-z0-9][a-z0-9-]{2,63}$/;

/** Curated peer colors that read well on both light and dark themes. */
export const PEER_COLORS = [
	"#0d9488", // jade
	"#e0762c", // amber
	"#7c6cf0", // iris
	"#d64f7e", // rose
	"#3f8fe0", // azure
	"#5aa02c", // moss
	"#c2543a", // terracotta
	"#9371d6", // lilac
];
