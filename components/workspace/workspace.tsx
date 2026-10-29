"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { RoomSession } from "@/lib/net/session";
import { RoomStore, RoomStoreContext, useRoom, useRoomStore } from "@/lib/store";
import { loadProfile, rememberRoom } from "@/lib/identity";
import { SessionContext } from "@/lib/session-context";
import type { TreeNode } from "@/lib/workspace/types";
import { Logo } from "@/components/logo";
import { TopBar } from "./top-bar";
import { FileExplorer } from "./file-tree";
import { EditorTabs } from "./tabs";
import { TerminalPanel } from "./terminal";
import { RightPanel } from "./right-panel";
import { StatusBar } from "./status-bar";
import { WorkspaceModals } from "./modals";

// Monaco is client-only; ssr:false keeps it (and its workers) out of the
// server bundle entirely.
const CodeEditor = dynamic(() => import("./editor").then((m) => m.CodeEditor), {
	ssr: false,
	loading: () => <div className="h-full w-full bg-surface" />,
});

export function Workspace({ roomId }: { roomId: string }) {
	const [boot, setBoot] = useState<{ store: RoomStore; session: RoomSession } | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		const profile = loadProfile();
		rememberRoom(roomId);
		const store = new RoomStore(roomId, profile);
		const session = new RoomSession(roomId, profile, store);

		session
			.start()
			.then(() => {
				if (cancelled) return;
				setBoot({ store, session });
				// Debug handle for the devtools console (mirrors the one on
				// RoomTransport).
				if (typeof window !== "undefined") {
					(window as unknown as Record<string, unknown>).__nodezenSession = session;
				}
				// Open a sensible default file on first load.
				const paths = flattenPaths(store.state.tree);
				const preferred = ["/README.md", "/index.ts", "/index.js"];
				const initial = preferred.find((p) => paths.includes(p)) ?? paths.find((p) => isCode(p)) ?? paths[0];
				if (initial) session.openFile(initial);
			})
			.catch((err) => {
				if (!cancelled) setError(String(err?.message ?? err));
			});

		return () => {
			cancelled = true;
			session.dispose();
		};
	}, [roomId]);

	if (error) {
		return (
			<div className="flex h-dvh flex-col items-center justify-center gap-4 bg-bg p-8 text-center">
				<Logo className="text-danger" size={44} />
				<h1 className="text-lg font-semibold text-ink">The workspace failed to start</h1>
				<p className="max-w-md text-sm text-ink-soft">{error}</p>
				<p className="max-w-md text-xs text-ink-faint">
					If this room was stored by an incompatible browser engine, try a different browser or create a new room.
				</p>
				<a className="nz-btn nz-btn-primary" href="/">
					Back home
				</a>
			</div>
		);
	}

	if (!boot) return <BootScreen />;

	return (
		<RoomStoreContext.Provider value={boot.store}>
			<SessionContext.Provider value={boot.session}>
				<WorkspaceLayout />
			</SessionContext.Provider>
		</RoomStoreContext.Provider>
	);
}

function WorkspaceLayout() {
	const leftOpen = useRoom((s) => s.leftPanelOpen);
	const rightOpen = useRoom((s) => s.rightPanelOpen);
	const bottomOpen = useRoom((s) => s.bottomPanelOpen);
	const store = useRoomStore();

	return (
		<div className="flex h-dvh flex-col overflow-hidden bg-bg">
			<TopBar />
			<div className="relative flex min-h-0 flex-1">
				{/* File explorer: static column on desktop, overlay drawer on mobile */}
				{leftOpen ? (
					<>
						<div
							aria-hidden
							className="absolute inset-0 z-20 bg-black/40 md:hidden"
							onClick={() => store.set({ leftPanelOpen: false })}
						/>
						<aside className="absolute inset-y-0 left-0 z-30 flex w-64 shrink-0 flex-col border-r border-line bg-surface md:static md:z-auto md:w-60">
							<FileExplorer />
						</aside>
					</>
				) : null}

				<main className="flex min-w-0 flex-1 flex-col">
					<EditorTabs />
					<div className="relative min-h-0 flex-1">
						<CodeEditor />
					</div>
					{bottomOpen ? <TerminalPanel /> : null}
				</main>

				{rightOpen ? <RightPanel /> : null}
				<WorkspaceModals />
			</div>
			<StatusBar />
		</div>
	);
}

function BootScreen() {
	return (
		<div className="flex h-dvh flex-col items-center justify-center gap-5 bg-bg">
			<div className="nz-anim-pulse text-accent">
				<Logo size={52} />
			</div>
			<div className="flex flex-col items-center gap-2">
				<p className="text-sm font-medium text-ink-soft">Preparing your workspace…</p>
				<p className="font-mono text-xs text-ink-faint">mounting zenfs · joining room</p>
			</div>
		</div>
	);
}

function flattenPaths(nodes: TreeNode[], out: string[] = []): string[] {
	for (const node of nodes) {
		if (node.type === "file") out.push(node.path);
		else if (node.children) flattenPaths(node.children, out);
	}
	return out;
}

function isCode(path: string): boolean {
	return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(path);
}
