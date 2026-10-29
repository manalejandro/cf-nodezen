"use client";

import { useRoom } from "@/lib/store";
import { IconBroadcast, IconWifi } from "@/components/icons";

export function StatusBar() {
	const status = useRoom((s) => s.status);
	const p2pCount = useRoom((s) => s.p2pCount);
	const peers = useRoom((s) => s.peers);
	const roomId = useRoom((s) => s.roomId);
	const activePath = useRoom((s) => s.activePath);
	const cursor = useRoom((s) => s.selfCursor);
	const runState = useRoom((s) => s.runState);
	const tree = useRoom((s) => s.tree);

	const peerCount = Object.keys(peers).length;
	const fileCount = countFiles(tree);

	const dot =
		status === "online" ? "bg-ok" : status === "connecting" || status === "reconnecting" ? "bg-warn nz-anim-pulse" : "bg-danger";

	return (
		<footer className="z-40 flex h-6 shrink-0 items-center gap-3 border-t border-line bg-surface px-3 font-mono text-[10.5px] text-ink-faint">
			<span className="flex items-center gap-1.5" title={`Room ${roomId}`}>
				<span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
				{status}
			</span>
			<span className="hidden items-center gap-1 sm:flex" title="Peer-to-peer WebRTC connections / total peers">
				{p2pCount > 0 ? <IconWifi size={10} className="text-accent" /> : <IconBroadcast size={10} />}
				{p2pCount}/{peerCount} p2p
			</span>
			<span className="hidden md:inline">{roomId}</span>
			{runState === "running" ? (
				<span className="flex items-center gap-1.5 text-accent-ink">
					<span className="nz-anim-pulse h-1.5 w-1.5 rounded-full bg-accent" />
					running
				</span>
			) : null}
			<span className="ml-auto hidden lg:inline">{fileCount} file{fileCount === 1 ? "" : "s"}</span>
			{activePath ? (
				<span className="max-w-[40vw] truncate">
					{activePath}
					{cursor ? ` · Ln ${cursor.lineNumber}, Col ${cursor.column}` : ""}
				</span>
			) : null}
			<span className="hidden text-accent-ink sm:inline" title="Node-compatible sandbox: fs, path, process, events, Buffer…">
				zen-runtime v1
			</span>
		</footer>
	);
}

function countFiles(nodes: { type: string; children?: unknown[] }[]): number {
	let n = 0;
	for (const node of nodes) {
		if (node.type === "file") n++;
		else if (node.children) n += countFiles(node.children as never);
	}
	return n;
}
