/**
 * RoomStore — a tiny observable state container for the workspace UI.
 * Components subscribe through `useRoom(selector)` (useSyncExternalStore).
 * State fields are replaced immutably so selectors can rely on references.
 */
"use client";

import { useSyncExternalStore, useRef, useCallback, createContext, useContext } from "react";
import type { ChatMessage, Profile, TerminalLine } from "./protocol";
import type { FileContent, TreeNode } from "./workspace/types";
import type { TransportStatus } from "./net/transport";

export interface PeerState {
	profile: Profile;
	transport: "p2p" | "relay";
	openFile: string | null;
	running: boolean;
	cursor: { lineNumber: number; column: number } | null;
}

export interface RoomState {
	roomId: string;
	self: Profile;
	status: TransportStatus;
	p2pCount: number;
	peers: Record<string, PeerState>;
	workspaceReady: boolean;
	tree: TreeNode[];
	openTabs: string[];
	activePath: string | null;
	contents: Record<string, FileContent>;
	chat: ChatMessage[];
	terminal: TerminalLine[];
	runState: "idle" | "running";
	runBy: Profile | null;
	runEntry: string | null;
	rightPanel: "chat" | "people";
	rightPanelOpen: boolean;
	leftPanelOpen: boolean;
	bottomPanelOpen: boolean;
	selfCursor: { lineNumber: number; column: number } | null;
	/** Path of a modal the UI should show, if any. */
	modal: null | "profile" | "invite" | "new-file";
	modalContext: string | null;
}

export class RoomStore {
	private listeners = new Set<() => void>();

	state: RoomState;

	constructor(roomId: string, self: Profile) {
		this.state = {
			roomId,
			self,
			status: "connecting",
			p2pCount: 0,
			peers: {},
			workspaceReady: false,
			tree: [],
			openTabs: [],
			activePath: null,
			contents: {},
			chat: [],
			terminal: [],
			runState: "idle",
			runBy: null,
			runEntry: null,
			rightPanel: "chat",
			rightPanelOpen: true,
			leftPanelOpen: true,
			bottomPanelOpen: true,
			selfCursor: null,
			modal: null,
			modalContext: null,
		};
	}

	getState = (): RoomState => this.state;

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	set(patch: Partial<RoomState>): void {
		this.state = { ...this.state, ...patch };
		this.emit();
	}

	update(updater: (state: RoomState) => Partial<RoomState>): void {
		this.set(updater(this.state));
	}

	private emit(): void {
		for (const listener of this.listeners) listener();
	}

	/* ------------------------------ slices ------------------------------ */

	peerList(): PeerState[] {
		return Object.values(this.state.peers);
	}

	appendTerminal(lines: TerminalLine[]): void {
		const terminal = [...this.state.terminal, ...lines];
		const MAX = 2500;
		this.set({ terminal: terminal.length > MAX ? terminal.slice(terminal.length - MAX) : terminal });
	}

	clearTerminal(): void {
		this.set({ terminal: [] });
	}

	appendChat(messages: ChatMessage[]): void {
		const seen = new Map(this.state.chat.map((m) => [m.id, m]));
		for (const m of messages) if (!seen.has(m.id)) seen.set(m.id, m);
		const chat = [...seen.values()].sort((a, b) => a.ts - b.ts);
		this.set({ chat });
	}

	setPeer(id: string, patch: Partial<PeerState> | ((peer: PeerState) => Partial<PeerState>)): void {
		const peers = { ...this.state.peers };
		const existing = peers[id];
		if (!existing) return;
		peers[id] = { ...existing, ...(typeof patch === "function" ? patch(existing) : patch) };
		this.set({ peers });
	}
}

export const RoomStoreContext = createContext<RoomStore | null>(null);

export function useRoomStore(): RoomStore {
	const store = useContext(RoomStoreContext);
	if (!store) throw new Error("useRoomStore must be used within RoomStoreContext");
	return store;
}

/**
 * Select a slice of room state. The selector result is cached and compared
 * with `isEqual` (default: Object.is) so getSnapshot stays referentially
 * stable as required by useSyncExternalStore.
 */
export function useRoom<T>(selector: (state: RoomState) => T, isEqual: (a: T, b: T) => boolean = Object.is): T {
	const store = useRoomStore();
	const selectorRef = useRef(selector);
	selectorRef.current = selector;
	const equalRef = useRef(isEqual);
	equalRef.current = isEqual;
	const lastRef = useRef<{ value: T } | null>(null);

	const getSnapshot = useCallback(() => {
		const next = selectorRef.current(store.getState());
		if (lastRef.current && equalRef.current(lastRef.current.value, next)) {
			return lastRef.current.value;
		}
		lastRef.current = { value: next };
		return next;
	}, [store]);

	return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

export function shallowEqual<T>(a: T, b: T): boolean {
	if (Object.is(a, b)) return true;
	if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
	const ka = Object.keys(a as object);
	const kb = Object.keys(b as object);
	if (ka.length !== kb.length) return false;
	for (const key of ka) {
		if (!Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false;
	}
	return true;
}
