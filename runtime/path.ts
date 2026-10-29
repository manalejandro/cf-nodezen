/**
 * A dependency-free POSIX `path` implementation for the sandbox runtime.
 * Mirrors the Node.js `node:path` (posix) API surface used in practice.
 */

export const sep = "/";
export const delimiter = ":";
export const posix = {} as Path;

export interface Path {
	sep: string;
	delimiter: string;
	join(...parts: string[]): string;
	resolve(...parts: string[]): string;
	relative(from: string, to: string): string;
	dirname(p: string): string;
	basename(p: string, ext?: string): string;
	extname(p: string): string;
	normalize(p: string): string;
	isAbsolute(p: string): boolean;
	parse(p: string): ParsedPath;
	format(parsed: Partial<ParsedPath>): string;
	toNamespacedPath(p: string): string;
	posix: Path;
}

export interface ParsedPath {
	root: string;
	dir: string;
	base: string;
	ext: string;
	name: string;
}

function assertString(value: unknown, name: string): asserts value is string {
	if (typeof value !== "string") {
		throw new TypeError(`The "${name}" argument must be of type string. Received ${typeof value}`);
	}
}

export function isAbsolute(p: string): boolean {
	return p.startsWith("/");
}

export function normalize(p: string): string {
	assertString(p, "path");
	const absolute = p.startsWith("/");
	const trailing = p.length > 1 && p.endsWith("/");
	const parts: string[] = [];
	for (const segment of p.split("/")) {
		if (!segment || segment === ".") continue;
		if (segment === "..") {
			if (parts.length && parts[parts.length - 1] !== "..") parts.pop();
			else if (!absolute) parts.push("..");
			continue;
		}
		parts.push(segment);
	}
	let out = parts.join("/");
	if (!out && !absolute) return ".";
	if (out && absolute) out = `/${out}`;
	else if (absolute) out = "/";
	if (trailing && !out.endsWith("/")) out += "/";
	return out;
}

export function join(...parts: string[]): string {
	for (const p of parts) assertString(p, "path");
	const joined = parts.filter((p) => p.length > 0).join("/");
	if (!joined) return ".";
	return normalize(joined);
}

export function resolve(...parts: string[]): string {
	let resolved = "";
	for (let i = parts.length - 1; i >= 0; i--) {
		const part = parts[i];
		assertString(part, "path");
		if (!part) continue;
		resolved = `${part}/${resolved}`;
		if (part.startsWith("/")) break;
	}
	if (!resolved.startsWith("/")) resolved = `/${resolved}`;
	// resolve() never keeps a trailing slash (unlike normalize()).
	return normalize(resolved).replace(/\/+$/, "") || "/";
}

export function relative(from: string, to: string): string {
	assertString(from, "from");
	assertString(to, "to");
	const a = resolve(from).split("/").filter(Boolean);
	const b = resolve(to).split("/").filter(Boolean);
	let i = 0;
	while (i < a.length && i < b.length && a[i] === b[i]) i++;
	const ups = a.length - i;
	return [...Array(ups).fill(".."), ...b.slice(i)].join("/");
}

export function dirname(p: string): string {
	assertString(p, "path");
	if (!p.length) return ".";
	const absolute = p.charCodeAt(0) === 47;
	let end = -1;
	let matchedSlash = true;
	for (let i = p.length - 1; i >= 1; i--) {
		if (p.charCodeAt(i) === 47) {
			if (!matchedSlash) {
				end = i;
				break;
			}
		} else {
			matchedSlash = false;
		}
	}
	if (end === -1) return absolute ? "/" : ".";
	if (absolute && end === 1) return "//";
	return p.slice(0, end);
}

export function basename(p: string, ext?: string): string {
	assertString(p, "path");
	if (ext !== undefined) assertString(ext, "ext");
	const trimmed = p.replace(/\/+$/, "");
	let base = trimmed.slice(trimmed.lastIndexOf("/") + 1);
	if (base === "" && !trimmed.startsWith("/")) base = trimmed;
	if (ext && base.endsWith(ext) && base !== ext) {
		base = base.slice(0, base.length - ext.length);
	}
	return base;
}

export function extname(p: string): string {
	assertString(p, "path");
	const base = basename(p);
	const dot = base.lastIndexOf(".");
	return dot > 0 ? base.slice(dot) : "";
}

export function parse(p: string): ParsedPath {
	assertString(p, "path");
	const root = p.startsWith("/") ? "/" : "";
	const dir = dirname(p);
	const base = basename(p);
	const ext = extname(p);
	return {
		root,
		dir: dir === "." ? "" : dir,
		base,
		ext,
		name: ext ? base.slice(0, base.length - ext.length) : base,
	};
}

export function format(parsed: Partial<ParsedPath>): string {
	const dir = parsed.dir ?? "";
	const base = parsed.base ?? `${parsed.name ?? ""}${parsed.ext ?? ""}`;
	return dir ? `${dir}/${base}` : base;
}

export function toNamespacedPath(p: string): string {
	return p;
}

const impl: Path = {
	sep,
	delimiter,
	join,
	resolve,
	relative,
	dirname,
	basename,
	extname,
	normalize,
	isAbsolute,
	parse,
	format,
	toNamespacedPath,
	posix: null as unknown as Path,
};
impl.posix = impl;
Object.assign(posix, impl);

export default impl;
