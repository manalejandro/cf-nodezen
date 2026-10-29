/**
 * WorkspaceFS — the main-thread owner of a room's persistent file system.
 *
 * Backed by ZenFS with an IndexedDB store (one database per room). All
 * mutations are stamped with a hybrid logical clock and recorded in an
 * internal metadata file so peers can merge with last-writer-wins semantics.
 *
 * Internal layout:
 *   /.nodezen/meta.json   path -> HLC (+ tombstone flag) of the last mutation
 *   /.nodezen/chat.json   { msgs: ChatMessage[] } — the room's chat history
 */
import { configureSingle, fs as zenfs, sync as zenfsSync } from "@zenfs/core";
import { IndexedDB } from "@zenfs/dom";
import {
	type ChatMessage,
	type FileEntry,
	type FsOp,
	type HLC,
	type WorkspaceSnapshot,
	Clock,
	hlcCompare,
} from "../protocol";
import {
	CHAT_FILE,
	CHAT_LIMIT,
	INTERNAL_DIR,
	META_FILE,
	chatUnion,
	isInternalPath,
	metaUnion,
	type FileContent,
	type FileEncoding,
	type TreeNode,
} from "./types";
import { SEED_FILES } from "./templates";

type MetaMap = Record<string, HLC & { del?: 1 }>;

const textEncoder = new TextEncoder();
const textDecoderFatal = new TextDecoder("utf-8", { fatal: true });

function isUtf8(bytes: Uint8Array): boolean {
	try {
		textDecoderFatal.decode(bytes);
		return true;
	} catch {
		return false;
	}
}

function bytesToBase64(bytes: Uint8Array): string {
	let bin = "";
	const CHUNK = 0x8000;
	for (let i = 0; i < bytes.length; i += CHUNK) {
		bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
	}
	return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
	const bin = atob(b64);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes;
}

function encodeFileContent(bytes: Uint8Array): FileContent {
	if (isUtf8(bytes)) return { content: new TextDecoder().decode(bytes), enc: "utf8" };
	return { content: bytesToBase64(bytes), enc: "b64" };
}

function decodeFileContent(content: string, enc: FileEncoding): Uint8Array {
	return enc === "b64" ? base64ToBytes(content) : textEncoder.encode(content);
}

function readBytes(path: string): Uint8Array {
	const raw = zenfs.readFileSync(path) as unknown;
	if (raw instanceof Uint8Array) return raw;
	if (typeof raw === "string") return textEncoder.encode(raw);
	if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
	if (ArrayBuffer.isView(raw)) return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
	throw new Error(`Unexpected file content for ${path}`);
}

export class WorkspaceFS {
	private clock!: Clock;
	private meta: MetaMap = {};
	private mountedRoom: string | null = null;
	private mounting: Promise<void> | null = null;
	private syncTimer: number | undefined;

	async mount(roomId: string, peerId: string): Promise<void> {
		if (this.mountedRoom === roomId) return;
		if (this.mounting) await this.mounting.catch(() => {});
		if (this.mountedRoom === roomId) return;

		const task = (async () => {
			await configureSingle({ backend: IndexedDB, storeName: `nodezen-${roomId}` });
			this.mountedRoom = roomId;
			this.clock = new Clock(peerId);
			this.meta = {};
			zenfs.mkdirSync(`/${INTERNAL_DIR}`, { recursive: true } as never);
			this.loadMeta();
			if (!this.hasContent()) this.seed();
		})();
		this.mounting = task;
		try {
			await task;
		} finally {
			if (this.mounting === task) this.mounting = null;
		}
	}

	/** Debounced flush of the ZenFS write-back cache into IndexedDB. */
	private scheduleSync(): void {
		if (this.syncTimer !== undefined) return;
		this.syncTimer = self.setTimeout(() => {
			this.syncTimer = undefined;
			void zenfsSync().catch(() => {});
		}, 250);
	}

	flush(): Promise<void> {
		return zenfsSync();
	}

	private loadMeta(): void {
		try {
			if (zenfs.existsSync(META_FILE)) {
				const parsed = JSON.parse(String(zenfs.readFileSync(META_FILE, "utf8"))) as MetaMap;
				this.meta = parsed ?? {};
			}
		} catch {
			this.meta = {};
		}
	}

	private saveMeta(): void {
		try {
			zenfs.writeFileSync(META_FILE, JSON.stringify(this.meta));
			this.scheduleSync();
		} catch {
			// Non-fatal: metadata will be rebuilt from the next mutation.
		}
	}

	hasContent(): boolean {
		try {
			const entries = zenfs.readdirSync("/") as unknown as string[];
			return entries.some((name) => name !== INTERNAL_DIR);
		} catch {
			return false;
		}
	}

	private seed(): void {
		for (const file of SEED_FILES) {
			const dir = file.path.slice(0, file.path.lastIndexOf("/"));
			if (dir && dir !== "/") zenfs.mkdirSync(dir, { recursive: true } as never);
			zenfs.writeFileSync(file.path, file.content);
			this.meta[file.path] = this.clock.now();
		}
		this.saveMeta();
		void zenfsSync().catch(() => {});
	}

	/* ------------------------------ tree ------------------------------ */

	list(): TreeNode[] {
		const walk = (dir: string): TreeNode[] => {
			const entries = zenfs.readdirSync(dir, { withFileTypes: true } as never) as unknown as Array<{
				name: string;
				isDirectory(): boolean;
				isFile(): boolean;
			}>;
			const nodes: TreeNode[] = [];
			for (const entry of entries) {
				const path = dir === "/" ? `/${entry.name}` : `${dir}/${entry.name}`;
				if (isInternalPath(path)) continue;
				if (entry.isDirectory()) {
					nodes.push({ name: entry.name, path, type: "dir", children: walk(path) });
				} else {
					nodes.push({ name: entry.name, path, type: "file" });
				}
			}
			return nodes;
		};
		try {
			return walk("/");
		} catch {
			return [];
		}
	}

	exists(path: string): boolean {
		try {
			return zenfs.existsSync(path);
		} catch {
			return false;
		}
	}

	isDirectory(path: string): boolean {
		try {
			return zenfs.statSync(path).isDirectory();
		} catch {
			return false;
		}
	}

	read(path: string): FileContent | null {
		try {
			return encodeFileContent(readBytes(path));
		} catch {
			return null;
		}
	}

	/* --------------------------- mutations ---------------------------- */

	write(path: string, content: string, enc: FileEncoding = "utf8"): FsOp {
		const dir = path.slice(0, path.lastIndexOf("/"));
		if (dir && dir !== "/" && !this.exists(dir)) {
			zenfs.mkdirSync(dir, { recursive: true } as never);
		}
		const bytes = decodeFileContent(content, enc);
		zenfs.writeFileSync(path, bytes);
		const hlc = this.clock.now();
		this.meta[path] = hlc;
		this.saveMeta();
		return { kind: "write", path, content, enc, hlc, origin: this.origin() };
	}

	mkdir(path: string): FsOp {
		zenfs.mkdirSync(path, { recursive: true } as never);
		const hlc = this.clock.now();
		this.meta[path] = hlc;
		this.saveMeta();
		return { kind: "mkdir", path, hlc, origin: this.origin() };
	}

	delete(path: string): FsOp {
		if (path === "/" || isInternalPath(path)) {
			throw new Error(`Refusing to delete ${path}`);
		}
		zenfs.rmSync(path, { recursive: true, force: true } as never);
		const hlc = this.clock.now();
		this.meta[path] = { ...hlc, del: 1 };
		this.saveMeta();
		return { kind: "delete", path, hlc, origin: this.origin() };
	}

	rename(from: string, to: string): FsOp {
		if (from === "/" || isInternalPath(from) || isInternalPath(to)) {
			throw new Error(`Invalid rename ${from} -> ${to}`);
		}
		const dir = to.slice(0, to.lastIndexOf("/"));
		if (dir && dir !== "/" && !this.exists(dir)) {
			zenfs.mkdirSync(dir, { recursive: true } as never);
		}
		zenfs.renameSync(from, to);
		const hlc = this.clock.now();
		this.meta[to] = hlc;
		this.meta[from] = { ...hlc, del: 1 };
		// Carry over tombstones for children of a renamed directory.
		for (const key of Object.keys(this.meta)) {
			if (key.startsWith(`${from}/`)) {
				const moved = to + key.slice(from.length);
				this.meta[moved] = this.meta[key]!;
				delete this.meta[key];
			}
		}
		this.saveMeta();
		return { kind: "rename", path: from, to, hlc, origin: this.origin() };
	}

	/** Apply a mutation produced by the local sandbox run. */
	applySandboxMutation(mutation: {
		kind: "write" | "delete" | "mkdir" | "rename";
		path: string;
		to?: string;
		data?: Uint8Array;
	}): FsOp | null {
		try {
			switch (mutation.kind) {
				case "write": {
					const dir = mutation.path.slice(0, mutation.path.lastIndexOf("/"));
					if (dir && dir !== "/" && !this.exists(dir)) {
						zenfs.mkdirSync(dir, { recursive: true } as never);
					}
					const data = mutation.data ?? new Uint8Array(0);
					zenfs.writeFileSync(mutation.path, data);
					const hlc = this.clock.now();
					this.meta[mutation.path] = hlc;
					this.saveMeta();
					const encoded = encodeFileContent(data);
					return {
						kind: "write",
						path: mutation.path,
						content: encoded.content,
						enc: encoded.enc,
						hlc,
						origin: this.origin(),
					};
				}
				case "mkdir": {
					if (this.exists(mutation.path)) return null;
					zenfs.mkdirSync(mutation.path, { recursive: true } as never);
					const hlc = this.clock.now();
					this.meta[mutation.path] = hlc;
					this.saveMeta();
					return { kind: "mkdir", path: mutation.path, hlc, origin: this.origin() };
				}
				case "delete": {
					if (!this.exists(mutation.path)) {
						const hlc = this.clock.now();
						this.meta[mutation.path] = { ...hlc, del: 1 };
						this.saveMeta();
						return { kind: "delete", path: mutation.path, hlc, origin: this.origin() };
					}
					zenfs.rmSync(mutation.path, { recursive: true, force: true } as never);
					const hlc = this.clock.now();
					this.meta[mutation.path] = { ...hlc, del: 1 };
					this.saveMeta();
					return { kind: "delete", path: mutation.path, hlc, origin: this.origin() };
				}
				case "rename": {
					if (!mutation.to || !this.exists(mutation.path)) return null;
					return this.rename(mutation.path, mutation.to);
				}
			}
		} catch {
			return null;
		}
	}

	private origin(): string {
		return this.clock.peerId;
	}

	/* ---------------------------- merging ----------------------------- */

	/** Apply a remote op. Returns true when it changed local state. */
	applyRemote(op: FsOp): boolean {
		if (isInternalPath(op.path) || (op.to && isInternalPath(op.to))) return false;
		this.clock.observe(op.hlc);

		const known = this.meta[op.path];
		if (known && hlcCompare(known, op.hlc) >= 0) return false;

		try {
			switch (op.kind) {
				case "write": {
					const dir = op.path.slice(0, op.path.lastIndexOf("/"));
					if (dir && dir !== "/" && !this.exists(dir)) {
						zenfs.mkdirSync(dir, { recursive: true } as never);
					}
					zenfs.writeFileSync(op.path, decodeFileContent(op.content ?? "", op.enc ?? "utf8"));
					this.meta[op.path] = op.hlc;
					break;
				}
				case "mkdir": {
					if (!this.exists(op.path)) {
						zenfs.mkdirSync(op.path, { recursive: true } as never);
					}
					this.meta[op.path] = op.hlc;
					break;
				}
				case "delete": {
					if (this.exists(op.path)) {
						zenfs.rmSync(op.path, { recursive: true, force: true } as never);
					}
					this.meta[op.path] = { ...op.hlc, del: 1 };
					break;
				}
				case "rename": {
					if (!op.to) return false;
					const knownTo = this.meta[op.to];
					if (knownTo && hlcCompare(knownTo, op.hlc) >= 0) return false;
					if (this.exists(op.path)) {
						const dir = op.to.slice(0, op.to.lastIndexOf("/"));
						if (dir && dir !== "/" && !this.exists(dir)) {
							zenfs.mkdirSync(dir, { recursive: true } as never);
						}
						zenfs.renameSync(op.path, op.to);
					}
					this.meta[op.to] = op.hlc;
					this.meta[op.path] = { ...op.hlc, del: 1 };
					for (const key of Object.keys(this.meta)) {
						if (key.startsWith(`${op.path}/`)) {
							this.meta[op.to + key.slice(op.path.length)] = this.meta[key]!;
							delete this.meta[key];
						}
					}
					break;
				}
			}
		} catch {
			return false;
		}
		this.saveMeta();
		this.scheduleSync();
		return true;
	}

	snapshot(by: string): WorkspaceSnapshot {
		const files: FileEntry[] = [];
		const walk = (dir: string) => {
			const entries = zenfs.readdirSync(dir, { withFileTypes: true } as never) as unknown as Array<{
				name: string;
				isDirectory(): boolean;
			}>;
			for (const entry of entries) {
				const path = dir === "/" ? `/${entry.name}` : `${dir}/${entry.name}`;
				if (isInternalPath(path)) continue;
				if (entry.isDirectory()) walk(path);
				else {
					try {
						const encoded = encodeFileContent(readBytes(path));
						files.push({ path, content: encoded.content, enc: encoded.enc });
					} catch {
						// skip unreadable files
					}
				}
			}
		};
		try {
			walk("/");
		} catch {
			// empty workspace
		}
		return { files, meta: this.meta, chat: this.chatLoad(), by };
	}

	/** Merge a peer snapshot (LWW per path + union for chat/meta). Returns true if anything changed. */
	applySnapshot(snapshot: WorkspaceSnapshot): boolean {
		let changed = false;

		for (const [path, remote] of Object.entries(snapshot.meta ?? {})) {
			if (isInternalPath(path)) continue;
			this.clock.observe(remote);
			const local = this.meta[path];
			if (local && hlcCompare(local, remote) >= 0) continue;

			try {
				if (remote.del) {
					if (this.exists(path)) {
						zenfs.rmSync(path, { recursive: true, force: true } as never);
					}
					this.meta[path] = remote;
					changed = true;
					continue;
				}
				const file = snapshot.files.find((f) => f.path === path);
				if (file) {
					const dir = path.slice(0, path.lastIndexOf("/"));
					if (dir && dir !== "/" && !this.exists(dir)) {
						zenfs.mkdirSync(dir, { recursive: true } as never);
					}
					zenfs.writeFileSync(path, decodeFileContent(file.content, file.enc));
					this.meta[path] = remote;
					changed = true;
					continue;
				}
				// Meta says a directory (or a file we cannot materialize).
				if (!this.exists(path)) {
					zenfs.mkdirSync(path, { recursive: true } as never);
					this.meta[path] = remote;
					changed = true;
				}
			} catch {
				// keep going; partial merges are acceptable
			}
		}

		// Files present in the snapshot but missing from meta (defensive).
		for (const file of snapshot.files) {
			if (isInternalPath(file.path) || this.meta[file.path]) continue;
			try {
				const dir = file.path.slice(0, file.path.lastIndexOf("/"));
				if (dir && dir !== "/" && !this.exists(dir)) {
					zenfs.mkdirSync(dir, { recursive: true } as never);
				}
				if (!this.exists(file.path)) {
					zenfs.writeFileSync(file.path, decodeFileContent(file.content, file.enc));
					this.meta[file.path] = { t: Date.now(), c: 0, id: snapshot.by };
					changed = true;
				}
			} catch {
				// ignore
			}
		}

		if (changed) {
			this.saveMeta();
			this.scheduleSync();
		}

		// Chat history is merged as a union, never overwritten.
		if (snapshot.chat?.length) {
			const local = this.chatLoad();
			const merged = chatUnion(local, snapshot.chat);
			if (merged.length !== local.length) {
				this.chatSave(merged);
				changed = true;
			}
		}
		return changed;
	}

	/* ------------------------------ chat ------------------------------ */

	chatLoad(): ChatMessage[] {
		try {
			if (zenfs.existsSync(CHAT_FILE)) {
				const parsed = JSON.parse(String(zenfs.readFileSync(CHAT_FILE, "utf8"))) as { msgs?: ChatMessage[] };
				return parsed?.msgs ?? [];
			}
		} catch {
			// corrupted history is non-fatal
		}
		return [];
	}

	chatSave(messages: ChatMessage[]): void {
		const capped = messages.length > CHAT_LIMIT ? messages.slice(messages.length - CHAT_LIMIT) : messages;
		try {
			zenfs.writeFileSync(CHAT_FILE, JSON.stringify({ msgs: capped }));
			this.scheduleSync();
		} catch {
			// non-fatal
		}
	}

	chatAppend(message: ChatMessage): ChatMessage[] {
		const messages = this.chatLoad();
		if (messages.some((m) => m.id === message.id)) return messages;
		messages.push(message);
		messages.sort((a, b) => a.ts - b.ts);
		this.chatSave(messages);
		return messages.slice(-CHAT_LIMIT);
	}

	chatMerge(incoming: ChatMessage[]): { messages: ChatMessage[]; added: boolean } {
		const local = this.chatLoad();
		const merged = chatUnion(local, incoming);
		const added = merged.length !== local.length;
		if (added) this.chatSave(merged);
		return { messages: merged, added };
	}

	metaSnapshot(): MetaMap {
		return { ...this.meta };
	}

	mergeMeta(remote: MetaMap): void {
		this.meta = metaUnion(this.meta, remote, hlcCompare);
		this.saveMeta();
	}

	clockTime(): number {
		return this.clock.now().t;
	}
}

export const workspaceFS = new WorkspaceFS();
