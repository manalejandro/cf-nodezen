import type { ChatMessage, FsOp, HLC, WorkspaceSnapshot } from "../protocol";

export interface TreeNode {
	name: string;
	path: string;
	type: "file" | "dir";
	children?: TreeNode[];
}

export type FileEncoding = "utf8" | "b64";

export interface FileContent {
	content: string;
	enc: FileEncoding;
}

export const INTERNAL_DIR = ".nodezen";
export const META_FILE = `/${INTERNAL_DIR}/meta.json`;
export const CHAT_FILE = `/${INTERNAL_DIR}/chat.json`;
export const CHAT_LIMIT = 300;

export function isInternalPath(path: string): boolean {
	return path === `/${INTERNAL_DIR}` || path.startsWith(`/${INTERNAL_DIR}/`);
}

export function languageFromPath(path: string): string {
	const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
	switch (ext) {
		case "ts":
		case "mts":
		case "cts":
			return "typescript";
		case "tsx":
			return "typescript";
		case "js":
		case "mjs":
		case "cjs":
		case "jsx":
			return "javascript";
		case "json":
			return "json";
		case "md":
		case "markdown":
			return "markdown";
		case "css":
			return "css";
		case "html":
		case "htm":
			return "html";
		case "yml":
		case "yaml":
			return "yaml";
		case "txt":
		case "log":
			return "plaintext";
		default:
			return "plaintext";
	}
}

export function isBinaryContent(content: FileContent): boolean {
	return content.enc === "b64";
}

/** Order tree nodes for display: directories first, then files, alphabetical. */
export function sortTree(nodes: TreeNode[]): TreeNode[] {
	return nodes
		.slice()
		.sort((a, b) => {
			if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
			return a.name.localeCompare(b.name);
		})
		.map((n) => (n.children ? { ...n, children: sortTree(n.children) } : n));
}

export function chatSort(messages: ChatMessage[]): ChatMessage[] {
	return messages.slice().sort((a, b) => a.ts - b.ts);
}

export function chatUnion(a: ChatMessage[], b: ChatMessage[]): ChatMessage[] {
	const seen = new Map<string, ChatMessage>();
	for (const m of [...a, ...b]) {
		const existing = seen.get(m.id);
		if (!existing || m.ts < existing.ts) seen.set(m.id, m);
	}
	const merged = chatSort([...seen.values()]);
	return merged.length > CHAT_LIMIT ? merged.slice(merged.length - CHAT_LIMIT) : merged;
}

export function metaUnion(
	a: Record<string, HLC & { del?: 1 }>,
	b: Record<string, HLC & { del?: 1 }>,
	compare: (x: HLC, y: HLC) => number,
): Record<string, HLC & { del?: 1 }> {
	const out: Record<string, HLC & { del?: 1 }> = { ...a };
	for (const [path, stamp] of Object.entries(b)) {
		const existing = out[path];
		if (!existing || compare(existing, stamp) < 0) out[path] = stamp;
	}
	return out;
}

export function opLabel(op: FsOp): string {
	switch (op.kind) {
		case "write":
			return `saved ${op.path}`;
		case "delete":
			return `deleted ${op.path}`;
		case "mkdir":
			return `created ${op.path}/`;
		case "rename":
			return `moved ${op.path} → ${op.to}`;
	}
}
