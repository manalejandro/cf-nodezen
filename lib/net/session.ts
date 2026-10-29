/**
 * RoomSession — orchestrates the workspace: transport (WebRTC/WS), the
 * persistent file system (ZenFS/IndexedDB), the code sandbox and the UI
 * store. One session per open room.
 */
import {
	randomId,
	type ChatMessage,
	type FsOp,
	type NetMessage,
	type Profile,
	type TerminalLine,
	type WorkspaceSnapshot,
} from "../protocol";
import SandboxWorker from "../../runtime/sandbox.worker.ts?worker";
import { workspaceFS } from "../workspace/fs";
import { sortTree, type FileContent } from "../workspace/types";
import { RoomStore, type PeerState } from "../store";
import { RoomTransport, type TransportStatus } from "./transport";

const SNAPSHOT_REQUEST_DELAY_MS = 500;
const SNAPSHOT_RETRIES = 3;
const SNAPSHOT_RETRY_MS = 2500;
const EDITOR_THROTTLE_MS = 120;
const MAX_PEERS = 16;

interface SandboxHandle {
	worker: Worker;
	entry: string;
	stopped: boolean;
}

export class RoomSession {
	readonly transport: RoomTransport;
	private sandbox: SandboxHandle | null = null;
	private snapshotRetries = 0;
	private snapshotReceived = false;
	private editorThrottle = 0;
	private disposed = false;

	constructor(
		readonly roomId: string,
		readonly self: Profile,
		readonly store: RoomStore,
	) {
		this.transport = new RoomTransport(roomId, self, {
			onStatus: (status) => this.onStatus(status),
			onRoster: (peers) => this.onRoster(peers),
			onPeerJoined: (peer) => this.onPeerJoined(peer),
			onPeerLeft: (peerId) => this.onPeerLeft(peerId),
			onMessage: (msg, from) => this.onNetMessage(msg, from),
		});
	}

	async start(): Promise<void> {
		await workspaceFS.mount(this.roomId, this.self.id);
		this.store.set({
			workspaceReady: true,
			tree: sortTree(workspaceFS.list()),
			chat: workspaceFS.chatLoad(),
		});

		window.addEventListener("beforeunload", this.onBeforeUnload);
		document.addEventListener("visibilitychange", this.onVisibility);

		await this.transport.connect();
		this.requestSnapshotLater();
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		window.removeEventListener("beforeunload", this.onBeforeUnload);
		document.removeEventListener("visibilitychange", this.onVisibility);
		this.stopRun(false);
		void workspaceFS.flush().catch(() => {});
		this.transport.close();
	}

	private onBeforeUnload = (): void => {
		void workspaceFS.flush().catch(() => {});
	};

	private onVisibility = (): void => {
		if (document.visibilityState === "hidden") {
			void workspaceFS.flush().catch(() => {});
		}
	};

	/* ------------------------------ transport ------------------------------ */

	private onStatus(status: TransportStatus): void {
		this.store.set({
			status,
			p2pCount: this.transport.p2pCount,
		});
		if (status === "online") {
			this.store.set({ p2pCount: this.transport.p2pCount });
		}
	}

	private onRoster(peers: Profile[]): void {
		const next: Record<string, PeerState> = {};
		for (const profile of peers) {
			const existing = this.store.state.peers[profile.id];
			const transportState = this.transport.peerProfiles().find((p) => p.id === profile.id);
			next[profile.id] = {
				profile,
				transport: transportState?.transport ?? "relay",
				openFile: existing?.openFile ?? null,
				running: existing?.running ?? false,
				cursor: existing?.cursor ?? null,
			};
		}
		this.store.set({ peers: next, p2pCount: this.transport.p2pCount });
	}

	private onPeerJoined(peer: Profile): void {
		if (this.store.state.peers[peer.id]) return;
		this.store.set({
			peers: {
				...this.store.state.peers,
				[peer.id]: { profile: peer, transport: "relay", openFile: null, running: false, cursor: null },
			},
		});
		this.pushSystemLine(`${peer.name} joined the room`);
	}

	private onPeerLeft(peerId: string): void {
		const peer = this.store.state.peers[peerId];
		const peers = { ...this.store.state.peers };
		delete peers[peerId];
		this.store.set({ peers, p2pCount: this.transport.p2pCount });
		if (peer) this.pushSystemLine(`${peer.profile.name} left the room`);
	}

	/* ---------------------------- net messages ---------------------------- */

	private onNetMessage(msg: NetMessage, from: string): void {
		switch (msg.kind) {
			case "signal":
				return; // handled inside the transport
			case "snapshot-req": {
				// Only the lowest-id existing peer answers, exactly once per request.
				const others = Object.keys(this.store.state.peers).filter((id) => id !== from);
				const amSmallest = others.every((id) => this.self.id < id);
				if (amSmallest) this.sendSnapshotTo(from);
				return;
			}
			case "snapshot": {
				this.snapshotReceived = true;
				const changed = workspaceFS.applySnapshot(msg.snapshot);
				if (changed) {
					this.store.set({
						tree: sortTree(workspaceFS.list()),
						chat: workspaceFS.chatLoad(),
					});
					this.refreshOpenContents();
				}
				return;
			}
			case "fs-op": {
				this.applyRemoteOp(msg.op);
				return;
			}
			case "chat": {
				const messages = workspaceFS.chatLoad();
				if (messages.some((m) => m.id === msg.message.id)) return;
				this.store.set({ chat: workspaceFS.chatAppend(msg.message) });
				return;
			}
			case "presence": {
				this.store.setPeer(from, { openFile: msg.openFile, running: msg.running });
				return;
			}
			case "editor": {
				this.store.setPeer(from, { openFile: msg.path, cursor: msg.cursor });
				return;
			}
			case "run": {
				this.onRemoteRun(msg, from);
				return;
			}
			case "sync-hello":
				return;
			default:
				return;
		}
	}

	private sendSnapshotTo(peerId: string): void {
		const snapshot: WorkspaceSnapshot = workspaceFS.snapshot(this.self.id);
		this.transport.sendTo(peerId, { kind: "snapshot", snapshot });
	}

	private requestSnapshotLater(): void {
		setTimeout(() => {
			if (this.disposed || this.snapshotReceived) return;
			if (Object.keys(this.store.state.peers).length === 0) return; // alone: keep local seed
			this.transport.broadcast({ kind: "snapshot-req" });
			if (this.snapshotRetries++ < SNAPSHOT_RETRIES) {
				setTimeout(() => this.retrySnapshot(), SNAPSHOT_RETRY_MS);
			}
		}, SNAPSHOT_REQUEST_DELAY_MS);
	}

	private retrySnapshot(): void {
		if (this.disposed || this.snapshotReceived) return;
		if (Object.keys(this.store.state.peers).length === 0) return;
		this.transport.broadcast({ kind: "snapshot-req" });
	}

	/* ----------------------------- fs actions ----------------------------- */

	applyRemoteOp(op: FsOp): void {
		const applied = workspaceFS.applyRemote(op);
		if (!applied) return;
		this.store.set({ tree: sortTree(workspaceFS.list()) });

		if (op.kind === "delete") {
			for (const tab of this.store.state.openTabs) {
				if (tab === op.path || tab.startsWith(`${op.path}/`)) this.closeTab(tab);
			}
		}
		if (op.kind === "write" && this.store.state.openTabs.includes(op.path)) {
			const content = workspaceFS.read(op.path);
			if (content) {
				this.store.set({ contents: { ...this.store.state.contents, [op.path]: content } });
			}
		}
		if (op.kind === "rename" && op.to) {
			this.remapTabs(op.path, op.to);
		}
	}

	/** Move open tabs/contents from an old path to a new one (rename aware). */
	private remapTabs(from: string, to: string): void {
		const mapPath = (p: string) => (p === from ? to : p.startsWith(`${from}/`) ? to + p.slice(from.length) : p);
		const openTabs = [...new Set(this.store.state.openTabs.map(mapPath))];
		const contents: Record<string, FileContent> = {};
		for (const [path, value] of Object.entries(this.store.state.contents)) {
			contents[mapPath(path)] = value;
		}
		const activePath = this.store.state.activePath ? mapPath(this.store.state.activePath) : null;
		this.store.set({ openTabs, contents, activePath });
	}

	private refreshOpenContents(): void {
		const contents = { ...this.store.state.contents };
		for (const path of this.store.state.openTabs) {
			const content = workspaceFS.read(path);
			if (content) contents[path] = content;
		}
		this.store.set({ contents });
	}

	writeFile(path: string, content: string): void {
		const op = workspaceFS.write(path, content);
		this.transport.broadcast({ kind: "fs-op", op });
		this.store.set({
			tree: sortTree(workspaceFS.list()),
			contents: { ...this.store.state.contents, [path]: { content, enc: "utf8" } },
		});
	}

	createFile(path: string, content = ""): FsOp {
		const op = workspaceFS.write(path, content);
		this.transport.broadcast({ kind: "fs-op", op });
		this.store.set({
			tree: sortTree(workspaceFS.list()),
			contents: { ...this.store.state.contents, [path]: { content, enc: "utf8" } },
		});
		return op;
	}

	createDirectory(path: string): void {
		const op = workspaceFS.mkdir(path);
		this.transport.broadcast({ kind: "fs-op", op });
		this.store.set({ tree: sortTree(workspaceFS.list()) });
	}

	deletePath(path: string): void {
		const op = workspaceFS.delete(path);
		this.transport.broadcast({ kind: "fs-op", op });
		this.store.set({ tree: sortTree(workspaceFS.list()) });
		for (const tab of this.store.state.openTabs) {
			if (tab === path || tab.startsWith(`${path}/`)) this.closeTab(tab);
		}
	}

	renamePath(from: string, to: string): void {
		const op = workspaceFS.rename(from, to);
		this.transport.broadcast({ kind: "fs-op", op });
		this.store.set({ tree: sortTree(workspaceFS.list()) });
		this.remapTabs(from, to); // update local tabs/contents for our own rename
	}

	openFile(path: string): void {
		if (workspaceFS.isDirectory(path)) return;
		const { openTabs, contents } = this.store.state;
		const nextContents = { ...contents };
		if (!nextContents[path]) {
			const content = workspaceFS.read(path);
			if (!content) return;
			nextContents[path] = content;
		}
		this.store.set({
			openTabs: openTabs.includes(path) ? openTabs : [...openTabs, path],
			activePath: path,
			contents: nextContents,
		});
		this.broadcastPresence();
	}

	closeTab(path: string): void {
		const openTabs = this.store.state.openTabs.filter((t) => t !== path);
		let activePath = this.store.state.activePath;
		if (activePath === path) activePath = openTabs[openTabs.length - 1] ?? null;
		const contents = { ...this.store.state.contents };
		delete contents[path];
		this.store.set({ openTabs, activePath, contents });
		this.broadcastPresence();
	}

	/* -------------------------------- chat -------------------------------- */

	sendChat(text: string): void {
		const trimmed = text.trim();
		if (!trimmed) return;
		const message: ChatMessage = {
			id: randomId(16),
			author: this.self,
			text: trimmed.slice(0, 4000),
			ts: Date.now(),
		};
		this.store.set({ chat: workspaceFS.chatAppend(message) });
		this.transport.broadcast({ kind: "chat", message });
	}

	/* ------------------------------ presence ------------------------------ */

	broadcastPresence(): void {
		this.transport.broadcast({
			kind: "presence",
			openFile: this.store.state.activePath,
			running: this.store.state.runState === "running",
		});
	}

	broadcastEditorState(path: string | null, cursor: { lineNumber: number; column: number } | null): void {
		const now = Date.now();
		if (now - this.editorThrottle < EDITOR_THROTTLE_MS) return;
		this.editorThrottle = now;
		this.transport.broadcast({ kind: "editor", path, cursor });
	}

	/* -------------------------------- run --------------------------------- */

	async startRun(entry: string): Promise<void> {
		this.stopRun(false);

		if (!workspaceFS.exists(entry)) {
			this.pushTerminalLine({ kind: "stderr", text: `Entry module not found: ${entry}` });
			return;
		}

		const snapshot = workspaceFS.snapshot(this.self.id);
		const files = snapshot.files.map((f) => ({
			path: f.path,
			data: f.enc === "b64" ? base64ToBytes(f.content) : new TextEncoder().encode(f.content),
		}));

		// Imported with ?worker so the SSR build can stub it (see vite.config.ts).
		const worker = new SandboxWorker();
		const handle: SandboxHandle = { worker, entry, stopped: false };
		this.sandbox = handle;

		const runner = this.self;
		this.store.set({ runState: "running", runBy: runner, runEntry: entry });
		this.pushTerminalLine({ kind: "system", text: `▶ node ${entry}` });
		this.transport.broadcast({ kind: "run", phase: "start", runner, entry });
		this.broadcastPresence();

		worker.addEventListener("message", (event: MessageEvent) => {
			const data = event.data as
				| { t: "ready" }
				| { t: "console"; method: string; text: string }
				| { t: "fs"; op: { kind: "write" | "delete" | "mkdir" | "rename"; path: string; to?: string; data?: Uint8Array } }
				| { t: "exit"; code: number | null; error?: { message: string; stack?: string } };

			switch (data.t) {
				case "ready": {
					worker.postMessage({ t: "run", files, entry, argv: [entry], env: { HOME: "/home/zen" } });
					return;
				}
				case "console": {
					if (data.method === "system") {
						// console.clear()
						this.store.clearTerminal();
						return;
					}
					const kind = data.method === "error" || data.method === "stderr" ? "stderr" : data.method === "warn" ? "stderr" : "stdout";
					const line: TerminalLine = {
						id: randomId(12),
						kind: kind as TerminalLine["kind"],
						text: data.text,
						ts: Date.now(),
						peer: runner,
					};
					this.pushTerminalLine(line);
					this.transport.broadcast({ kind: "run", phase: "line", runner, line });
					return;
				}
				case "fs": {
					const op = workspaceFS.applySandboxMutation(data.op);
					if (op) {
						this.transport.broadcast({ kind: "fs-op", op });
						this.store.set({ tree: sortTree(workspaceFS.list()) });
						if (op.kind === "write" && this.store.state.openTabs.includes(op.path)) {
							const content = workspaceFS.read(op.path);
							if (content) {
								this.store.set({ contents: { ...this.store.state.contents, [op.path]: content } });
							}
						}
					}
					return;
				}
				case "exit": {
					this.endRun(handle, data.code, data.error);
					return;
				}
			}
		});

		worker.addEventListener("error", (event) => {
			this.endRun(handle, 1, { message: String((event as ErrorEvent).message ?? "sandbox worker crashed") });
		});
	}

	private endRun(handle: SandboxHandle, code: number | null, error?: { message: string; stack?: string }): void {
		if (this.sandbox === handle) this.sandbox = null;
		try {
			handle.worker.terminate();
		} catch {
			// ignore
		}
		if (handle.stopped) return;
		const text = error ? `✖ ${error.message}` : code === 0 ? "✔ process exited with code 0" : `✖ process exited with code ${code ?? "?"}`;
		const line: TerminalLine = {
			id: randomId(12),
			kind: code === 0 && !error ? "info" : "stderr",
			text,
			ts: Date.now(),
			peer: this.self,
		};
		this.pushTerminalLine(line);
		this.transport.broadcast({ kind: "run", phase: "end", runner: this.self, code });
		if (this.store.state.runBy?.id === this.self.id) {
			this.store.set({ runState: "idle", runBy: null, runEntry: null });
		}
		this.broadcastPresence();
	}

	stopRun(notify = true): void {
		const handle = this.sandbox;
		if (!handle) return;
		handle.stopped = true;
		this.sandbox = null;
		try {
			handle.worker.terminate();
		} catch {
			// ignore
		}
		this.pushTerminalLine({ kind: "system", text: "■ stopped by user" });
		if (notify) {
			this.transport.broadcast({ kind: "run", phase: "end", runner: this.self, code: null });
			this.store.set({ runState: "idle", runBy: null, runEntry: null });
			this.broadcastPresence();
		}
	}

	private onRemoteRun(msg: Extract<NetMessage, { kind: "run" }>, from: string): void {
		const peer = this.store.state.peers[from];
		const runner = peer?.profile ?? msg.runner ?? { id: from, name: "peer", color: "#2dd4bf" };
		switch (msg.phase) {
			case "start": {
				this.store.setPeer(from, { running: true });
				this.store.set({ runState: "running", runBy: runner, runEntry: msg.entry ?? null });
				this.pushTerminalLine({ kind: "system", text: `▶ ${runner.name} is running ${msg.entry ?? "code"}`, peer: runner });
				return;
			}
			case "line": {
				if (msg.line) this.pushTerminalLine({ ...msg.line, peer: runner });
				return;
			}
			case "end": {
				this.store.setPeer(from, { running: false });
				if (this.store.state.runBy?.id === from) {
					this.store.set({ runState: "idle", runBy: null, runEntry: null });
				}
				const text =
					msg.code === 0 ? `✔ ${runner.name}'s process exited with code 0` : `■ ${runner.name}'s process ended${msg.code !== null && msg.code !== undefined ? ` with code ${msg.code}` : ""}`;
				this.pushTerminalLine({ kind: "info", text, peer: runner });
				return;
			}
		}
	}

	/* ------------------------------ terminal ------------------------------ */

	pushTerminalLine(partial: Omit<TerminalLine, "id" | "ts"> & { id?: string; ts?: number }): void {
		const line: TerminalLine = { id: partial.id ?? randomId(12), ts: partial.ts ?? Date.now(), ...partial } as TerminalLine;
		this.store.appendTerminal([line]);
	}

	private pushSystemLine(text: string): void {
		this.pushTerminalLine({ kind: "system", text });
	}

	clearTerminal(): void {
		this.store.clearTerminal();
		this.pushTerminalLine({ kind: "system", text: "terminal cleared" });
	}

	get peerCount(): number {
		return Object.keys(this.store.state.peers).length;
	}

	get maxPeers(): number {
		return MAX_PEERS;
	}
}

function base64ToBytes(b64: string): Uint8Array {
	const bin = atob(b64);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes;
}
