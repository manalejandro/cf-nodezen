"use client";

import { PEER_COLORS, randomId, ROOM_ID_RE, type Profile } from "./protocol";

const PROFILE_KEY = "nodezen.profile";
const PEER_ID_KEY = "nodezen.peerId";
const RECENT_KEY = "nodezen.recent";
const THEME_KEY = "nodezen.theme";

const ADJECTIVES = [
	"quiet",
	"brave",
	"calm",
	"swift",
	"gentle",
	"bright",
	"patient",
	"clever",
	"bold",
	"serene",
	"wandering",
	"mindful",
];

const NOUNS = [
	"lotus",
	"bamboo",
	"maple",
	"heron",
	"koi",
	"pine",
	"crane",
	"fox",
	"stone",
	"river",
	"cloud",
	"lantern",
];

function pick<T>(items: T[]): T {
	return items[Math.floor(Math.random() * items.length)]!;
}

export function defaultName(): string {
	return `${pick(ADJECTIVES)}-${pick(NOUNS)}`;
}

export function loadProfile(): Profile {
	if (typeof localStorage === "undefined") {
		return { id: randomId(12), name: defaultName(), color: pick(PEER_COLORS) };
	}

	// The peer id must be unique per tab (sessionStorage), otherwise two tabs
	// in the same room would replace each other's signaling socket.
	let id = "";
	try {
		id = sessionStorage.getItem(PEER_ID_KEY) ?? "";
	} catch {
		id = "";
	}
	if (!/^[a-zA-Z0-9_-]{4,64}$/.test(id)) {
		id = randomId(12);
		try {
			sessionStorage.setItem(PEER_ID_KEY, id);
		} catch {
			// ignore
		}
	}

	let name = "";
	let color = "";
	try {
		const raw = localStorage.getItem(PROFILE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw) as Partial<Profile>;
			name = String(parsed.name ?? "").slice(0, 48);
			color = String(parsed.color ?? "");
		}
	} catch {
		// regenerate below
	}
	if (!name) name = defaultName();
	if (!/^#[0-9a-f]{6}$/i.test(color)) color = pick(PEER_COLORS);

	const profile: Profile = { id, name, color };
	saveProfile(profile);
	return profile;
}

export function saveProfile(profile: Profile): void {
	try {
		// Persist name/color only; the id stays per-tab in sessionStorage.
		localStorage.setItem(PROFILE_KEY, JSON.stringify({ name: profile.name, color: profile.color }));
	} catch {
		// storage may be unavailable (private mode); the session still works
	}
}

/* ------------------------------ recent rooms ------------------------------ */

export interface RecentRoom {
	roomId: string;
	visitedAt: number;
}

export function loadRecentRooms(): RecentRoom[] {
	try {
		const raw = localStorage.getItem(RECENT_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as RecentRoom[];
		return parsed.filter((r) => r && ROOM_ID_RE.test(r.roomId)).slice(0, 8);
	} catch {
		return [];
	}
}

export function rememberRoom(roomId: string): void {
	if (!ROOM_ID_RE.test(roomId)) return;
	const rooms = loadRecentRooms().filter((r) => r.roomId !== roomId);
	rooms.unshift({ roomId, visitedAt: Date.now() });
	try {
		localStorage.setItem(RECENT_KEY, JSON.stringify(rooms.slice(0, 8)));
	} catch {
		// ignore
	}
}

export function forgetRoom(roomId: string): void {
	const rooms = loadRecentRooms().filter((r) => r.roomId !== roomId);
	try {
		localStorage.setItem(RECENT_KEY, JSON.stringify(rooms));
	} catch {
		// ignore
	}
}

/* --------------------------------- theme --------------------------------- */

export type Theme = "light" | "dark" | "system";

export function loadTheme(): Theme {
	try {
		const value = localStorage.getItem(THEME_KEY);
		if (value === "light" || value === "dark" || value === "system") return value;
	} catch {
		// ignore
	}
	return "system";
}

export function saveTheme(theme: Theme): void {
	try {
		localStorage.setItem(THEME_KEY, theme);
	} catch {
		// ignore
	}
}

export function resolveTheme(theme: Theme): "light" | "dark" {
	if (theme !== "system") return theme;
	if (typeof matchMedia === "undefined") return "dark";
	return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
