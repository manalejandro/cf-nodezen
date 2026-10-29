"use client";

import { useRouter } from "next/navigation";
import { useRoom, useRoomStore } from "@/lib/store";
import { useSession } from "@/lib/session-context";
import { Avatar } from "@/components/avatar";
import { Wordmark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/components/toast";
import {
	IconBroadcast,
	IconChat,
	IconLink,
	IconLogout,
	IconPlay,
	IconSidebar,
	IconStop,
	IconTerminal,
	IconUsers,
	IconWifi,
} from "@/components/icons";

export function TopBar() {
	const store = useRoomStore();
	const session = useSession();
	const router = useRouter();
	const { toast } = useToast();

	const roomId = useRoom((s) => s.roomId);
	const status = useRoom((s) => s.status);
	const p2pCount = useRoom((s) => s.p2pCount);
	const peers = useRoom((s) => s.peers);
	const runState = useRoom((s) => s.runState);
	const runBy = useRoom((s) => s.runBy);
	const activePath = useRoom((s) => s.activePath);
	const self = useRoom((s) => s.self);
	const rightPanel = useRoom((s) => s.rightPanel);
	const rightPanelOpen = useRoom((s) => s.rightPanelOpen);
	const leftPanelOpen = useRoom((s) => s.leftPanelOpen);
	const bottomPanelOpen = useRoom((s) => s.bottomPanelOpen);

	const peerList = Object.values(peers);
	const myRun = runState === "running" && runBy?.id === self.id;
	const isRunning = runState === "running";

	const statusColor =
		status === "online" ? "bg-ok" : status === "reconnecting" || status === "connecting" ? "bg-warn nz-anim-pulse" : "bg-danger";
	const statusLabel =
		status === "online"
			? peerList.length === 0
				? "Online · solo"
				: `Online · ${peerList.length} peer${peerList.length === 1 ? "" : "s"} · ${p2pCount} p2p`
			: status === "connecting"
				? "Connecting…"
				: status === "reconnecting"
					? "Reconnecting…"
					: "Offline";

	function toggleRightPanel(panel: "chat" | "people") {
		if (rightPanelOpen && rightPanel === panel) store.set({ rightPanelOpen: false });
		else store.set({ rightPanelOpen: true, rightPanel: panel });
	}

	function run() {
		if (myRun) {
			session.stopRun();
			return;
		}
		if (!activePath) {
			toast("Open a file to run it first", "error");
			return;
		}
		void session.startRun(activePath);
	}

	function leave() {
		session.dispose();
		router.push("/");
	}

	return (
		<header className="z-40 flex h-12 shrink-0 items-center gap-2 border-b border-line bg-surface px-2 sm:px-3">
			{/* Left: brand + room */}
			<button
				aria-label={leftPanelOpen ? "Hide files" : "Show files"}
				className={`nz-icon-btn ${leftPanelOpen ? "text-accent" : ""}`}
				onClick={() => store.set({ leftPanelOpen: !leftPanelOpen })}
				type="button"
			>
				<IconSidebar size={15} />
			</button>
			<a className="hidden sm:block" href="/" title="NodeZen home">
				<Wordmark size={24} />
			</a>
			<a className="sm:hidden" href="/" title="NodeZen home">
				<span className="text-accent">
					<Wordmark size={22} className="[&_span:last-child]:hidden" />
				</span>
			</a>

			<span className="mx-1 hidden h-5 w-px bg-line sm:block" />

			<button
				className="nz-chip hidden hover:border-line-strong sm:inline-flex"
				onClick={() => store.set({ modal: "invite" })}
				title="Copy invite link"
				type="button"
			>
				<IconLink size={12} />
				{roomId}
			</button>
			<button
				aria-label="Copy invite link"
				className="nz-icon-btn sm:hidden"
				onClick={() => store.set({ modal: "invite" })}
				type="button"
			>
				<IconLink size={15} />
			</button>

			{/* Center: run controls */}
			<div className="ml-auto flex items-center gap-1.5 md:ml-2 md:mr-auto">
				<button
					className={`nz-btn ${myRun ? "nz-btn-danger" : "nz-btn-primary"}`}
					onClick={run}
					title={
						myRun
							? "Stop the run"
							: isRunning
								? `${runBy?.name ?? "A peer"} is running — click to run yours anyway`
								: `Run ${activePath ?? "file"} (Ctrl/Cmd+Enter)`
					}
					type="button"
				>
					{myRun ? (
						<>
							<IconStop size={12} />
							<span className="hidden sm:inline">Stop</span>
						</>
					) : (
						<>
							<IconPlay size={12} />
							<span className="hidden sm:inline">Run</span>
						</>
					)}
				</button>
			</div>

			{/* Right: presence + panels */}
			<div className="ml-auto flex items-center gap-1.5">
				<span
					className="hidden items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-ink-soft lg:inline-flex"
					title={statusLabel}
				>
					<span className={`h-1.5 w-1.5 rounded-full ${statusColor}`} />
					{status === "online" && p2pCount > 0 ? (
						<IconWifi size={11} className="text-accent" />
					) : (
						<IconBroadcast size={11} />
					)}
					{statusLabel}
				</span>

				<div className="mr-1 hidden items-center sm:flex">
					{peerList.slice(0, 4).map((p, i) => (
						<span key={p.profile.id} className={i > 0 ? "-ml-1.5" : ""}>
							<Avatar profile={p.profile} ring size={24} title={`${p.profile.name}${p.transport === "p2p" ? " (p2p)" : " (relay)"}`} />
						</span>
					))}
					{peerList.length > 4 ? (
						<span className="-ml-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full border border-line bg-surface-2 font-mono text-[10px] text-ink-faint ring-2 ring-surface">
							+{peerList.length - 4}
						</span>
					) : null}
				</div>

				<button
					aria-label="Toggle terminal"
					className={`nz-icon-btn ${bottomPanelOpen ? "text-accent" : ""}`}
					onClick={() => store.set({ bottomPanelOpen: !bottomPanelOpen })}
					type="button"
				>
					<IconTerminal size={15} />
				</button>
				<button
					aria-label="Toggle chat"
					className={`nz-icon-btn ${rightPanelOpen && rightPanel === "chat" ? "text-accent" : ""}`}
					onClick={() => toggleRightPanel("chat")}
					type="button"
				>
					<IconChat size={15} />
				</button>
				<button
					aria-label="Toggle people"
					className={`nz-icon-btn hidden ${rightPanelOpen && rightPanel === "people" ? "text-accent" : ""} sm:inline-flex`}
					onClick={() => toggleRightPanel("people")}
					type="button"
				>
					<IconUsers size={15} />
				</button>

				<ThemeToggle />

				<button
					aria-label="Your profile"
					className="ml-0.5 rounded-full transition hover:opacity-85"
					onClick={() => store.set({ modal: "profile" })}
					type="button"
				>
					<Avatar profile={self} size={26} title={`${self.name} (you)`} />
				</button>

				<button
					aria-label="Leave room"
					className="nz-icon-btn danger"
					onClick={leave}
					title="Leave room"
					type="button"
				>
					<IconLogout size={15} />
				</button>
			</div>
		</header>
	);
}
