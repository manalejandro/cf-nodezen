/**
 * A compact, dependency-free stand-in for Node's `util.inspect` and
 * `util.format`, tuned for terminal output in the sandbox.
 */

export interface InspectOptions {
	depth?: number | null;
	maxArrayLength?: number;
	maxStringLength?: number;
	breakLength?: number;
	indent?: string;
}

const seen = new WeakSet<object>();

export function inspect(value: unknown, options: InspectOptions = {}, level = 0): string {
	const depth = options.depth === undefined ? 4 : options.depth;
	const maxArrayLength = options.maxArrayLength ?? 64;
	const maxStringLength = options.maxStringLength ?? 2000;
	const indent = options.indent ?? "";

	if (value === null) return "null";
	if (value === undefined) return "undefined";

	const t = typeof value;
	if (t === "boolean") return String(value);
	if (t === "number") return Object.is(value, -0) ? "-0" : String(value);
	if (t === "bigint") return `${value}n`;
	if (t === "symbol") return String(value);
	if (t === "function") {
		const name = (value as { name?: string }).name;
		return name ? `[Function: ${name}]` : "[Function (anonymous)]";
	}
	if (t === "string") {
		if (level === 0) return value as string;
		const s = value as string;
		const truncated = s.length > maxStringLength ? `${s.slice(0, maxStringLength)}... ${s.length - maxStringLength} more characters` : s;
		return `'${truncated.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")}'`;
	}

	// Objects from here on.
	const obj = value as object;

	if (value instanceof Date) return Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
	if (value instanceof RegExp) return String(value);
	if (value instanceof Error) return `${value.name}: ${value.message}`;
	if (value instanceof URL) return `URL { ${value.href} }`;

	if (typeof (value as { then?: unknown }).then === "function" && level > 0) return "Promise { <pending> }";

	const ctorName =
		obj.constructor && obj.constructor !== Object ? (obj.constructor as { name?: string }).name || undefined : undefined;

	// Typed arrays / Buffers
	if (ArrayBuffer.isView(value)) {
		const view = value as unknown as { buffer: ArrayBuffer; byteLength: number; constructor?: { name?: string } };
		const name = view.constructor?.name ?? "TypedArray";
		if (name === "Uint8Array" || name === "Buffer") {
			const bytes = new Uint8Array(view.buffer, view.byteOffset, Math.min(view.byteLength, 64));
			const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join(" ");
			const more = view.byteLength > 64 ? `, ... ${view.byteLength - 64} more bytes` : "";
			return name === "Buffer"
				? `<Buffer ${hex}${more}>`
				: `${name}(${view.byteLength}) [ ${hex}${more} ]`;
		}
		const items = [...(value as unknown as ArrayLike<unknown>)].slice(0, maxArrayLength);
		return `${name}(${(value as unknown as ArrayLike<unknown>).length}) [ ${items.map((i) => inspect(i, options, level + 1)).join(", ")} ]`;
	}

	if (value instanceof ArrayBuffer) return `ArrayBuffer { byteLength: ${value.byteLength} }`;

	if (seen.has(obj)) return "[Circular]";

	if (depth !== null && level >= depth) return ctorName ? `[${ctorName}]` : "[Object]";

	seen.add(obj);
	try {
		if (Array.isArray(value)) {
			if (!value.length) return ctorName && ctorName !== "Array" ? `${ctorName} []` : "[]";
			const shown = value.slice(0, maxArrayLength).map((v) => inspect(v, options, level + 1));
			if (value.length > maxArrayLength) shown.push(`... ${value.length - maxArrayLength} more items`);
			return wrap(ctorName && ctorName !== "Array" ? `${ctorName} [` : "[", shown, "]");
		}
		if (value instanceof Map) {
			const entries = [...value.entries()].slice(0, maxArrayLength).map(([k, v]) => `${inspect(k, options, level + 1)} => ${inspect(v, options, level + 1)}`);
			if (value.size > maxArrayLength) entries.push(`... ${value.size - maxArrayLength} more items`);
			return entries.length ? wrap(`Map(${value.size}) {`, entries, "}") : `Map(${value.size}) {}`;
		}
		if (value instanceof Set) {
			const entries = [...value.values()].slice(0, maxArrayLength).map((v) => inspect(v, options, level + 1));
			if (value.size > maxArrayLength) entries.push(`... ${value.size - maxArrayLength} more items`);
			return entries.length ? wrap(`Set(${value.size}) {`, entries, "}") : `Set(${value.size}) {}`;
		}

		const entries: string[] = [];
		for (const key of Object.keys(obj)) {
			entries.push(`${key}: ${inspect((obj as Record<string, unknown>)[key], options, level + 1)}`);
		}
		const prefix = ctorName ? `${ctorName} {` : "{";
		if (!entries.length) return ctorName ? `${ctorName} {}` : "{}";
		return wrap(prefix, entries, "}");
	} finally {
		seen.delete(obj);
	}

	function wrap(open: string, items: string[], close: string): string {
		const oneLine = `${open} ${items.join(", ")} ${close}`;
		const fits = oneLine.length <= (options.breakLength ?? 90) && !oneLine.includes("\n");
		if (fits) return oneLine;
		const pad = `${indent}  `.repeat(level + 1);
		const closingPad = `${indent}  `.repeat(level);
		return `${open}\n${items.map((i) => pad + i.replace(/\n/g, `\n${pad}`) + ",").join("\n")}\n${closingPad}${close}`;
	}
}

/** Node-compatible `util.format` with %s %d %i %f %j %o %O %% support (%c ignored). */
export function format(fmt?: unknown, ...args: unknown[]): string {
	if (typeof fmt !== "string") {
		return [fmt, ...args].map((a) => inspect(a)).join(" ");
	}
	let i = 0;
	let out = "";
	let lastIndex = 0;
	for (let idx = 0; idx < fmt.length; idx++) {
		if (fmt[idx] !== "%" || idx + 1 >= fmt.length) continue;
		const spec = fmt[idx + 1];
		const arg = args[i];
		switch (spec) {
			case "s":
				out += fmt.slice(lastIndex, idx) + String(arg);
				lastIndex = idx + 2;
				i++;
				break;
			case "d":
			case "i":
				out += fmt.slice(lastIndex, idx) + (typeof arg === "bigint" ? String(arg) : String(Number.parseInt(String(Number(arg)), 10)));
				lastIndex = idx + 2;
				i++;
				break;
			case "f":
				out += fmt.slice(lastIndex, idx) + String(Number.parseFloat(String(arg)));
				lastIndex = idx + 2;
				i++;
				break;
			case "j":
				try {
					out += fmt.slice(lastIndex, idx) + JSON.stringify(arg);
				} catch {
					out += fmt.slice(lastIndex, idx) + "[Circular]";
				}
				lastIndex = idx + 2;
				i++;
				break;
			case "o":
			case "O":
				out += fmt.slice(lastIndex, idx) + inspect(arg);
				lastIndex = idx + 2;
				i++;
				break;
			case "c":
				out += fmt.slice(lastIndex, idx);
				lastIndex = idx + 2;
				i++;
				break;
			case "%":
				out += `${fmt.slice(lastIndex, idx)}%`;
				lastIndex = idx + 2;
				break;
			default:
				break;
		}
	}
	out += fmt.slice(lastIndex);
	const rest = args.slice(i).map((a) => inspect(a));
	return rest.length ? `${out} ${rest.join(" ")}` : out;
}
