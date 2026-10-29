"use client";

import { useEffect, useRef, useState } from "react";
import { useRoom, useRoomStore } from "@/lib/store";
import { useSession } from "@/lib/session-context";
import { Avatar } from "@/components/avatar";
import { IconChat, IconSend, IconUsers, IconX } from "@/components/icons";
import type { ChatMessage } from "@/lib/protocol";

export function RightPanel() {
	const panel = useRoom((s) => s.rightPanel);
	const store = useRoomStore();

	return (
		<aside className="absolute inset-y-0 right-0 z-30 flex w-80 max-w-[85vw] shrink-0 flex-col border-l border-line bg-surface shadow-2xl md:static md:z-auto md:w-80 md:shadow-none">
			<div className="flex h-9 shrink-0 items-center border-b border-line px-2">
				<PanelTab active={panel === "chat"} icon={<IconChat size={13} />} label="Chat" onClick={() => store.set({ rightPanel: "chat" })} />
				<PanelTab active={panel === "people"} icon={<IconUsers size={13} />} label="People" onClick={() => store.set({ rightPanel: "people" })} />
				<button
					aria-label="Close panel"
					className="nz-icon-btn !h-6 !w-6 ml-auto"
					onClick={() => store.set({ rightPanelOpen: false })}
					type="button"
				>
					<IconX size={13} />
				</button>
			</div>
			{panel === "chat" ? <ChatPanel /> : <PeoplePanel />}
		</aside>
	);
}

function PanelTab({
	active,
	icon,
	label,
	onClick,
}: {
	active: boolean;
	icon: React.ReactNode;
	label: string;
	onClick(): void;
}) {
	return (
		<button
			className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
				active ? "bg-accent-soft text-accent-ink" : "text-ink-faint hover:bg-surface-3 hover:text-ink-soft"
			}`}
			onClick={onClick}
			type="button"
		>
			{icon}
			{label}
		</button>
	);
}

/* --------------------------------- chat --------------------------------- */

function ChatPanel() {
	const chat = useRoom((s) => s.chat);
	const self = useRoom((s) => s.self);
	const session = useSession();
	const [draft, setDraft] = useState("");
	const scrollerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const el = scrollerRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [chat]);

	function send() {
		const text = draft.trim();
		if (!text) return;
		session.sendChat(text);
		setDraft("");
	}

	let lastDay = "";

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="min-h-0 flex-1 overflow-y-auto px-3 py-2" ref={scrollerRef}>
				{chat.length === 0 ? (
					<p className="px-1 py-6 text-center text-xs leading-5 text-ink-faint">
						No messages yet.
						<br />
						Say hello — messages sync over WebRTC
						<br />
						and are shared with the room.
					</p>
				) : null}
				{chat.map((message) => {
					const day = dayLabel(message.ts);
					const showDay = day !== lastDay;
					lastDay = day;
					return (
						<div key={message.id}>
							{showDay ? (
								<div className="my-2 flex items-center gap-2">
									<span className="h-px flex-1 bg-line" />
									<span className="text-[10px] font-medium uppercase tracking-wide text-ink-faint">{day}</span>
									<span className="h-px flex-1 bg-line" />
								</div>
							) : null}
							<ChatBubble message={message} selfId={self.id} />
						</div>
					);
				})}
			</div>
			<div className="shrink-0 border-t border-line p-2.5">
				<div className="flex items-end gap-1.5">
					<textarea
						className="nz-input max-h-28 min-h-[38px] flex-1 resize-none !py-2 !text-[13px] leading-5"
						onChange={(e) => setDraft(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault();
								send();
							}
						}}
						placeholder="Message the room…"
						rows={1}
						value={draft}
					/>
					<button
						aria-label="Send message"
						className={`nz-btn ${draft.trim() ? "nz-btn-primary" : "nz-btn-ghost"} !px-2.5`}
						disabled={!draft.trim()}
						onClick={send}
						type="button"
					>
						<IconSend size={14} />
					</button>
				</div>
			</div>
		</div>
	);
}

function ChatBubble({ message, selfId }: { message: ChatMessage; selfId: string }) {
	if (message.system) {
		return <p className="px-1 py-1 text-center text-[11px] italic text-ink-faint">{message.text}</p>;
	}
	const mine = message.author.id === selfId;
	return (
		<div className={`mb-1.5 flex items-start gap-2 ${mine ? "flex-row-reverse" : ""}`}>
			<Avatar profile={message.author} size={24} />
			<div className={`max-w-[78%] ${mine ? "items-end" : ""}`}>
				<div className={`mb-0.5 flex items-baseline gap-1.5 ${mine ? "justify-end" : ""}`}>
					<span className="text-[11px] font-semibold" style={{ color: message.author.color }}>
						{mine ? "you" : message.author.name}
					</span>
					<span className="text-[10px] text-ink-faint">{timeLabel(message.ts)}</span>
				</div>
				<div
					className={`whitespace-pre-wrap break-words rounded-lg px-2.5 py-1.5 text-[13px] leading-5 ${
						mine
							? "rounded-tr-sm bg-accent-soft text-accent-ink"
							: "rounded-tl-sm bg-surface-3 text-ink"
					}`}
				>
					{message.text}
				</div>
			</div>
		</div>
	);
}

/* -------------------------------- people --------------------------------- */

function PeoplePanel() {
	const peers = useRoom((s) => s.peers);
	const self = useRoom((s) => s.self);
	const session = useSession();
	const list = Object.values(peers);

	return (
		<div className="min-h-0 flex-1 overflow-y-auto p-2.5">
			<PersonRow color={self.color} name={`${self.name} (you)`} openFile={null} running={false} transport="p2p" />
			{list.map((p) => (
				<PersonRow
					color={p.profile.color}
					key={p.profile.id}
					name={p.profile.name}
					openFile={p.openFile}
					running={p.running}
					transport={p.transport}
				/>
			))}
			{list.length === 0 ? (
				<div className="px-2 py-6 text-center">
					<p className="text-xs leading-5 text-ink-faint">You are alone in this room.</p>
					<button className="nz-btn nz-btn-ghost mt-3 w-full" onClick={() => session.store.set({ modal: "invite" })} type="button">
						Invite someone
					</button>
				</div>
			) : null}
			<p className="mt-4 px-2 text-[11px] leading-4 text-ink-faint">
				Peers connect peer-to-peer over WebRTC when possible; otherwise messages relay through the room&apos;s Cloudflare
				Durable Object.
			</p>
		</div>
	);
}

function PersonRow({
	name,
	color,
	transport,
	openFile,
	running,
}: {
	name: string;
	color: string;
	transport: "p2p" | "relay";
	openFile: string | null;
	running: boolean;
}) {
	return (
		<div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-2">
			<Avatar profile={{ id: name, name, color }} size={28} />
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-1.5">
					<span className="truncate text-[13px] font-medium text-ink">{name}</span>
					{running ? <span className="nz-anim-pulse h-1.5 w-1.5 shrink-0 rounded-full bg-accent" title="running code" /> : null}
				</div>
				<div className="truncate font-mono text-[10.5px] text-ink-faint">
					{openFile ? openFile : "idle"}
				</div>
			</div>
			<span
				className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide ${
					transport === "p2p"
						? "border-accent/30 bg-accent-soft text-accent-ink"
						: "border-line bg-surface-2 text-ink-faint"
				}`}
				title={transport === "p2p" ? "Direct WebRTC data channel" : "Relayed via Durable Object"}
			>
				{transport}
			</span>
		</div>
	);
}

/* -------------------------------- helpers -------------------------------- */

function timeLabel(ts: number): string {
	return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function dayLabel(ts: number): string {
	const date = new Date(ts);
	const today = new Date();
	const yesterday = new Date(today.getTime() - 86_400_000);
	if (date.toDateString() === today.toDateString()) return "Today";
	if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
	return date.toLocaleDateString([], { month: "short", day: "numeric" });
}
