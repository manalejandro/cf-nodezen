"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { newRoomId, ROOM_ID_RE } from "@/lib/protocol";
import { loadRecentRooms, type RecentRoom } from "@/lib/identity";
import { IconPlay, IconRefresh } from "@/components/icons";

export function RoomLauncher() {
	const router = useRouter();
	const [code, setCode] = useState("");
	const [recent, setRecent] = useState<RecentRoom[]>([]);

	useEffect(() => {
		setRecent(loadRecentRooms());
	}, []);

	function create() {
		router.push(`/r/${newRoomId()}`);
	}

	function join(event?: React.FormEvent) {
		event?.preventDefault();
		const roomId = extractRoomId(code);
		if (!roomId) return;
		router.push(`/r/${roomId}`);
	}

	return (
		<div className="flex w-full max-w-xl flex-col gap-4">
			<div className="flex flex-col gap-2.5 sm:flex-row">
				<button
					className="nz-btn nz-btn-primary !px-5 !py-3 !text-sm font-semibold"
					onClick={create}
					type="button"
				>
					<IconPlay size={13} />
					Create a room
				</button>
				<form className="flex min-w-0 flex-1 gap-2" onSubmit={join}>
					<input
						aria-label="Room code or invite link"
						className="nz-input min-w-0 flex-1 font-mono !text-[13px]"
						onChange={(e) => setCode(e.target.value)}
						placeholder="nz-abcdefghij or invite link"
						spellCheck={false}
						value={code}
					/>
					<button className="nz-btn nz-btn-ghost !px-4 !py-3 !text-sm" disabled={!extractRoomId(code)} type="submit">
						Join
					</button>
				</form>
			</div>

			{recent.length > 0 ? (
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-xs text-ink-faint">Recent:</span>
					{recent.map((room) => (
						<button className="nz-chip hover:border-accent hover:text-accent-ink" key={room.roomId} onClick={() => router.push(`/r/${room.roomId}`)} type="button">
							<IconRefresh size={11} />
							{room.roomId}
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}

export function extractRoomId(input: string): string | null {
	const trimmed = input.trim();
	if (!trimmed) return null;
	if (trimmed.includes("/")) {
		try {
			const url = new URL(trimmed.startsWith("http") ? trimmed : `https://x/${trimmed.replace(/^\//, "")}`);
			const match = url.pathname.match(/\/r\/([a-z0-9-]+)/i);
			const candidate = match?.[1]?.toLowerCase();
			return candidate && ROOM_ID_RE.test(candidate) ? candidate : null;
		} catch {
			return null;
		}
	}
	const candidate = trimmed.toLowerCase();
	return ROOM_ID_RE.test(candidate) ? candidate : null;
}
