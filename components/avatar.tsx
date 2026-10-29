"use client";

import type { Profile } from "@/lib/protocol";

interface AvatarProps {
	profile: Profile;
	size?: number;
	ring?: boolean;
	title?: string;
}

function initials(name: string): string {
	const clean = name.replace(/[^a-zA-Z0-9- ]/g, "").trim();
	if (!clean) return "?";
	const parts = clean.split(/[-\s]+/).filter(Boolean);
	if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
	return clean.slice(0, 2).toUpperCase();
}

export function Avatar({ profile, size = 26, ring = false, title }: AvatarProps) {
	return (
		<span
			className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${ring ? "ring-2 ring-surface" : ""}`}
			style={{
				width: size,
				height: size,
				backgroundColor: `color-mix(in srgb, ${profile.color} 22%, transparent)`,
				color: profile.color,
				border: `1.5px solid color-mix(in srgb, ${profile.color} 55%, transparent)`,
				fontSize: size * 0.38,
				fontFamily: "var(--font-mono)",
			}}
			title={title ?? profile.name}
		>
			{initials(profile.name)}
		</span>
	);
}
