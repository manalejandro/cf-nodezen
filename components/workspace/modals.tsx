"use client";

import { useEffect, useState } from "react";
import { useRoom, useRoomStore } from "@/lib/store";
import { useSession } from "@/lib/session-context";
import { Modal } from "@/components/modal";
import { Avatar } from "@/components/avatar";
import { useToast } from "@/components/toast";
import { IconCheck, IconCopy, IconLink } from "@/components/icons";
import { PEER_COLORS } from "@/lib/protocol";
import { loadProfile, saveProfile } from "@/lib/identity";

export function WorkspaceModals() {
	const modal = useRoom((s) => s.modal);
	const store = useRoomStore();
	const close = () => store.set({ modal: null, modalContext: null });

	return (
		<>
			<InviteModal onClose={close} open={modal === "invite"} />
			<ProfileModal onClose={close} open={modal === "profile"} />
			<NewFileModal context={store.state.modalContext ?? "/"} onClose={close} open={modal === "new-file"} />
		</>
	);
}

/* -------------------------------- invite --------------------------------- */

function InviteModal({ open, onClose }: { open: boolean; onClose(): void }) {
	const roomId = useRoom((s) => s.roomId);
	const peers = useRoom((s) => s.peers);
	const { toast } = useToast();
	const [copied, setCopied] = useState(false);
	const link = typeof window !== "undefined" ? `${location.origin}/r/${roomId}` : `/r/${roomId}`;

	useEffect(() => {
		if (!open) setCopied(false);
	}, [open]);

	async function copy() {
		try {
			await navigator.clipboard.writeText(link);
			setCopied(true);
			toast("Invite link copied", "success");
			setTimeout(() => setCopied(false), 1800);
		} catch {
			toast("Could not access the clipboard", "error");
		}
	}

	const peerCount = Object.keys(peers).length;

	return (
		<Modal
			footer={
				<button className="nz-btn nz-btn-primary" onClick={copy} type="button">
					{copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
					{copied ? "Copied" : "Copy link"}
				</button>
			}
			onClose={onClose}
			open={open}
			title="Invite to this room"
		>
			<div className="flex flex-col gap-3">
				<p className="text-sm leading-6 text-ink-soft">
					Anyone with this link joins the room and syncs the workspace, chat and runs in real time.
				</p>
				<div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 p-2.5">
					<span className="shrink-0 text-accent">
						<IconLink size={15} />
					</span>
					<span className="min-w-0 flex-1 truncate font-mono text-xs text-ink" dir="rtl" title={link}>
						{link}
					</span>
				</div>
				<p className="text-xs text-ink-faint">
					Room <span className="font-mono text-ink-soft">{roomId}</span> · {peerCount === 0 ? "just you here" : `${peerCount} other${peerCount === 1 ? "" : "s"} connected`}
				</p>
			</div>
		</Modal>
	);
}

/* -------------------------------- profile --------------------------------- */

function ProfileModal({ open, onClose }: { open: boolean; onClose(): void }) {
	const self = useRoom((s) => s.self);
	const store = useRoomStore();
	const session = useSession();
	const { toast } = useToast();
	const [name, setName] = useState(self.name);
	const [color, setColor] = useState(self.color);

	useEffect(() => {
		if (open) {
			const profile = loadProfile();
			setName(profile.name);
			setColor(profile.color);
		}
	}, [open]);

	function save() {
		const trimmed = name.trim().slice(0, 32);
		if (!trimmed) return;
		const profile = { ...self, name: trimmed, color };
		saveProfile(profile);
		// Mutate in place so chat authorship and outgoing messages pick it up
		// immediately; the room roster updates when you rejoin.
		Object.assign(session.self, { name: trimmed, color });
		store.set({ self: { ...profile } });
		toast("Profile saved — the room roster updates when you rejoin", "success");
		onClose();
	}

	return (
		<Modal
			footer={
				<>
					<button className="nz-btn nz-btn-ghost" onClick={onClose} type="button">
						Cancel
					</button>
					<button className="nz-btn nz-btn-primary" onClick={save} type="button">
						Save profile
					</button>
				</>
			}
			onClose={onClose}
			open={open}
			title="Your profile"
			width={380}
		>
			<div className="flex flex-col gap-4">
				<div className="flex items-center gap-3">
					<Avatar profile={{ ...self, name: name || self.name, color }} size={44} />
					<div className="flex-1">
						<label className="mb-1 block text-xs font-medium text-ink-soft" htmlFor="nz-profile-name">
							Display name
						</label>
						<input
							className="nz-input"
							id="nz-profile-name"
							maxLength={32}
							onChange={(e) => setName(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && save()}
							value={name}
						/>
					</div>
				</div>
				<div>
					<span className="mb-1.5 block text-xs font-medium text-ink-soft">Color</span>
					<div className="flex flex-wrap gap-2">
						{PEER_COLORS.map((c) => (
							<button
								aria-label={`Color ${c}`}
								className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition ${
									color === c ? "scale-110 border-ink" : "border-transparent hover:scale-105"
								}`}
								key={c}
								onClick={() => setColor(c)}
								style={{ backgroundColor: c }}
								type="button"
							>
								{color === c ? <IconCheck className="text-white drop-shadow" size={13} /> : null}
							</button>
						))}
					</div>
				</div>
				<p className="text-[11px] leading-4 text-ink-faint">
					Your name and color identify your cursors, messages and runs inside every room on this browser.
				</p>
			</div>
		</Modal>
	);
}

/* ------------------------------- new file --------------------------------- */

function NewFileModal({ open, onClose, context }: { open: boolean; onClose(): void; context: string }) {
	const session = useSession();
	const { toast } = useToast();
	const [path, setPath] = useState("");

	useEffect(() => {
		if (open) setPath(context === "/" ? "" : `${context.replace(/\/$/, "")}/`);
	}, [open, context]);

	function create() {
		const trimmed = path.trim();
		if (!trimmed) return;
		if (trimmed.split("/").includes("..")) {
			toast("Path cannot contain '..'", "error");
			return;
		}
		const normalized = `/${trimmed.replace(/^\/+/, "")}`;
		try {
			session.createFile(normalized, "");
			session.openFile(normalized);
			onClose();
		} catch (err) {
			toast(String((err as Error).message ?? err), "error");
		}
	}

	return (
		<Modal
			footer={
				<>
					<button className="nz-btn nz-btn-ghost" onClick={onClose} type="button">
						Cancel
					</button>
					<button className="nz-btn nz-btn-primary" disabled={!path.trim()} onClick={create} type="button">
						Create file
					</button>
				</>
			}
			onClose={onClose}
			open={open}
			title="New file"
			width={380}
		>
			<div className="flex flex-col gap-2">
				<label className="text-xs font-medium text-ink-soft" htmlFor="nz-new-file">
					Path (folders are created automatically)
				</label>
				<input
					className="nz-input font-mono !text-[13px]"
					id="nz-new-file"
					onChange={(e) => setPath(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && create()}
					placeholder="src/server.ts"
					value={path}
				/>
				<p className="text-[11px] text-ink-faint">
					Tip: <span className="font-mono">.ts</span>, <span className="font-mono">.tsx</span>,{" "}
					<span className="font-mono">.js</span>, <span className="font-mono">.json</span>,{" "}
					<span className="font-mono">.md</span>… anything text.
				</p>
			</div>
		</Modal>
	);
}
