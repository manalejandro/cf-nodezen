"use client";

import { useEffect, useRef } from "react";
import { useRoom, useRoomStore } from "@/lib/store";
import { useSession } from "@/lib/session-context";
import { IconTerminal, IconTrash, IconChevronDown } from "@/components/icons";

export function TerminalPanel() {
	const terminal = useRoom((s) => s.terminal);
	const runState = useRoom((s) => s.runState);
	const runBy = useRoom((s) => s.runBy);
	const self = useRoom((s) => s.self);
	const store = useRoomStore();
	const session = useSession();
	const scrollerRef = useRef<HTMLDivElement>(null);
	const stickToBottom = useRef(true);

	useEffect(() => {
		const el = scrollerRef.current;
		if (!el) return;
		if (stickToBottom.current) el.scrollTop = el.scrollHeight;
	}, [terminal]);

	function onScroll() {
		const el = scrollerRef.current;
		if (!el) return;
		stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 36;
	}

	return (
		<section className="flex h-52 shrink-0 flex-col border-t border-line bg-surface md:h-56">
			<header className="flex h-8 shrink-0 items-center gap-2 border-b border-line px-3">
				<span className="text-ink-faint">
					<IconTerminal size={13} />
				</span>
				<span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Terminal</span>
				{runState === "running" ? (
					<span className="flex items-center gap-1.5 rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-medium text-accent-ink">
						<span className="nz-anim-pulse h-1.5 w-1.5 rounded-full bg-accent" />
						{runBy?.id === self.id ? "running…" : `${runBy?.name ?? "peer"} is running…`}
					</span>
				) : null}
				<span className="ml-auto flex items-center gap-0.5">
					<button
						aria-label="Clear terminal"
						className="nz-icon-btn !h-6 !w-6"
						onClick={() => session.clearTerminal()}
						title="Clear"
						type="button"
					>
						<IconTrash size={12} />
					</button>
					<button
						aria-label="Hide terminal"
						className="nz-icon-btn !h-6 !w-6"
						onClick={() => store.set({ bottomPanelOpen: false })}
						title="Hide panel"
						type="button"
					>
						<IconChevronDown size={13} />
					</button>
				</span>
			</header>
			<div className="nz-terminal min-h-0 flex-1 overflow-y-auto px-3 py-2" onScroll={onScroll} ref={scrollerRef}>
				{terminal.length === 0 ? (
					<p className="text-ink-faint">
						Output from your runs appears here — and is shared with everyone in the room.
						<span className="nz-caret" />
					</p>
				) : null}
				{terminal.map((line) => (
					<div className="flex gap-2" key={line.id}>
						{line.peer && line.peer.id !== self.id ? (
							<span className="shrink-0 select-none font-semibold" style={{ color: line.peer.color }}>
								{line.peer.name}:
							</span>
						) : null}
						<span className={`t-${line.kind} min-w-0 flex-1`}>{line.text}</span>
					</div>
				))}
			</div>
		</section>
	);
}
