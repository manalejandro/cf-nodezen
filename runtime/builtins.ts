/**
 * Node.js built-in module shims for the NodeZen sandbox.
 *
 * Everything here runs inside the sandbox Web Worker on top of an in-memory
 * ZenFS instance. File mutations are reported back to the host so they can be
 * persisted to the room workspace (IndexedDB) and replicated to peers.
 */
import { Buffer } from "buffer";
import { EventEmitter } from "events";
import { fs as zenfs } from "@zenfs/core";
import * as pathShim from "./path";
import { format, inspect } from "./inspect";
import { sha256 } from "./sha256";
import { ExitError, type SandboxFsMutation } from "./types";

export interface RuntimeContext {
	cwd: string;
	argv: string[];
	env: Record<string, string>;
	/** Emit a fully-formed console line. */
	emitConsole(method: string, text: string): void;
	/** Report a file mutation to the host. */
	emitFs(op: SandboxFsMutation): void;
	/** Called when a timer/fetch handle opens or closes (auto-exit tracking). */
	onHandleDelta(delta: number): void;
}

/* ------------------------------------------------------------------ */
/* console with line buffering + group indentation                      */
/* ------------------------------------------------------------------ */

class LineWriter {
	private partialOut = "";
	private partialErr = "";
	private groupDepth = 0;

	constructor(private readonly ctx: RuntimeContext) {}

	private indent(): string {
		return "  ".repeat(this.groupDepth);
	}

	log(method: string, text: string) {
		this.ctx.emitConsole(method, this.indent() + text);
	}

	write(stream: "stdout" | "stderr", text: string) {
		const isErr = stream === "stderr";
		let buf = (isErr ? this.partialErr : this.partialOut) + text;
		const lines = buf.split("\n");
		buf = lines.pop() ?? "";
		if (isErr) this.partialErr = buf;
		else this.partialOut = buf;
		for (const line of lines) this.log(isErr ? "stderr" : "stdout", line);
	}

	flush() {
		if (this.partialOut) {
			this.log("stdout", this.partialOut);
			this.partialOut = "";
		}
		if (this.partialErr) {
			this.log("stderr", this.partialErr);
			this.partialErr = "";
		}
	}

	enterGroup() {
		this.groupDepth++;
	}

	exitGroup() {
		this.groupDepth = Math.max(0, this.groupDepth - 1);
	}
}

function createConsole(ctx: RuntimeContext, writer: LineWriter) {
	const timers = new Map<string, number>();
	const counters = new Map<string, number>();

	const toText = (args: unknown[]): string => {
		if (typeof args[0] === "string" && args[0].includes("%")) {
			try {
				return format(...args);
			} catch {
				// fall through to generic formatting
			}
		}
		return args.map((a) => (typeof a === "string" ? a : inspect(a))).join(" ");
	};

	const base = (method: string) => (...args: unknown[]) => writer.log(method, toText(args));

	const consoleShim = {
		log: base("log"),
		info: base("info"),
		debug: base("debug"),
		warn: base("warn"),
		error: base("error"),
		trace: (...args: unknown[]) => {
			const stack = new Error().stack?.split("\n").slice(2).join("\n") ?? "";
			writer.log("trace", `${toText(args)}\n${stack}`);
		},
		dir: (...args: unknown[]) => writer.log("log", args.map((a) => inspect(a, { depth: 4 })).join(" ")),
		table: (data: unknown) => {
			try {
				if (Array.isArray(data) && data.every((r) => r && typeof r === "object")) {
					const keys = [...new Set(data.flatMap((r) => Object.keys(r as object)))];
					const rows = [keys, ...data.map((r) => keys.map((k) => String((r as Record<string, unknown>)[k] ?? "")))];
					const widths = keys.map((_, i) => Math.max(...rows.map((r) => (r[i] ?? "").length)));
					const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i]!)).join("  ");
					writer.log("log", [line(rows[0]!), rows.map(() => "-").length ? line(widths.map((w) => "-".repeat(w))) : "", ...rows.slice(1).map(line)].join("\n"));
					return;
				}
				writer.log("log", JSON.stringify(data, null, 2));
			} catch {
				writer.log("log", inspect(data));
			}
		},
		group: (...args: unknown[]) => {
			if (args.length) writer.log("group", toText(args));
			writer.enterGroup();
		},
		groupCollapsed: (...args: unknown[]) => consoleShim.group(...args),
		groupEnd: () => writer.exitGroup(),
		time: (label = "default") => timers.set(String(label), performance.now()),
		timeEnd: (label = "default") => {
			const start = timers.get(String(label));
			if (start === undefined) {
				writer.log("warn", `Timer '${String(label)}' does not exist`);
				return;
			}
			timers.delete(String(label));
			writer.log("time", `${String(label)}: ${performance.now() - start}ms`);
		},
		timeLog: (label = "default") => {
			const start = timers.get(String(label));
			if (start !== undefined) writer.log("time", `${String(label)}: ${performance.now() - start}ms`);
		},
		count: (label = "default") => {
			const key = String(label);
			const next = (counters.get(key) ?? 0) + 1;
			counters.set(key, next);
			writer.log("count", `${key}: ${next}`);
		},
		countReset: (label = "default") => counters.delete(String(label)),
		assert: (ok?: unknown, ...args: unknown[]) => {
			if (!ok) writer.log("error", `Assertion failed: ${args.length ? toText(args) : "no message"}`);
		},
		clear: () => writer.log("system", "\u001bc"),
	};
	return consoleShim;
}

/* ------------------------------------------------------------------ */
/* fs                                                                   */
/* ------------------------------------------------------------------ */

function toPathString(p: unknown): string {
	if (typeof p === "string") return p;
	if (p instanceof URL) return decodeURIComponent(p.pathname);
	if (Buffer.isBuffer(p)) return p.toString("utf8");
	if (p instanceof Uint8Array) return new TextDecoder().decode(p);
	throw new TypeError(`The "path" argument must be a string, Buffer, or URL. Received ${typeof p}`);
}

function toBytes(data: unknown, encoding?: string): Uint8Array {
	if (typeof data === "string") return new TextEncoder().encode(data);
	if (data instanceof Uint8Array) return data;
	if (data instanceof ArrayBuffer) return new Uint8Array(data);
	if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	throw new TypeError(`The "data" argument must be of type string or an instance of Buffer, TypedArray, or ArrayBuffer. Received ${typeof data}`);
	void encoding;
}

function encodingOf(opts: unknown): string | undefined {
	if (typeof opts === "string") return opts === "binary" ? "latin1" : opts;
	if (opts && typeof opts === "object") {
		const enc = (opts as { encoding?: string }).encoding;
		return enc === "binary" ? "latin1" : enc;
	}
	return undefined;
}

function decode(bytes: Uint8Array, encoding?: string): string | Buffer {
	if (!encoding || encoding === "buffer") return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length);
	if (encoding === "utf8" || encoding === "utf-8") return new TextDecoder("utf-8").decode(bytes);
	if (encoding === "latin1" || encoding === "binary") {
		let out = "";
		for (const b of bytes) out += String.fromCharCode(b);
		return out;
	}
	if (encoding === "base64") return bytesToBase64(bytes);
	if (encoding === "hex") return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
	return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function bytesToBase64(bytes: Uint8Array): string {
	let bin = "";
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin);
}

function createFs(ctx: RuntimeContext) {
	const abs = (p: unknown) => pathShim.resolve(ctx.cwd, toPathString(p));

	const report = (op: SandboxFsMutation) => {
		try {
			ctx.emitFs(op);
		} catch {
			// The host channel may be closing; never break user code over it.
		}
	};

	const readBack = (path: string): Uint8Array | undefined => {
		try {
			const raw = zenfs.readFileSync(path) as unknown;
			return raw instanceof Uint8Array ? raw : toBytes(raw);
		} catch {
			return undefined;
		}
	};

	const constants = {
		F_OK: 0,
		R_OK: 4,
		W_OK: 2,
		X_OK: 1,
		S_IFMT: 0o170000,
		S_IFREG: 0o100000,
		S_IFDIR: 0o40000,
		S_IFLNK: 0o120000,
		COPYFILE_EXCL: 1,
	};

	const out: Record<string, unknown> = { constants };

	/* ---- sync ---- */

	out.readFileSync = (p: unknown, opts?: unknown) => {
		const bytes = readBack(abs(p)) ?? zenfs.readFileSync(abs(p));
		const data = bytes instanceof Uint8Array ? bytes : toBytes(bytes);
		return decode(data, encodingOf(opts));
	};

	out.writeFileSync = (p: unknown, data: unknown, opts?: unknown) => {
		const target = abs(p);
		const enc = encodingOf(opts);
		const flag = typeof opts === "object" && opts !== null ? (opts as { flag?: string }).flag : undefined;
		if (flag === "a") {
			const existing = readBack(target) ?? new Uint8Array(0);
			const added = typeof data === "string" && enc ? new TextEncoder().encode(data) : toBytes(data);
			const merged = new Uint8Array(existing.length + added.length);
			merged.set(existing);
			merged.set(added, existing.length);
			zenfs.writeFileSync(target, merged);
		} else {
			zenfs.writeFileSync(target, toBytes(data));
		}
		report({ kind: "write", path: target, data: readBack(target) });
	};

	out.appendFileSync = (p: unknown, data: unknown) => {
		const target = abs(p);
		const existing = readBack(target) ?? new Uint8Array(0);
		const added = toBytes(data);
		const merged = new Uint8Array(existing.length + added.length);
		merged.set(existing);
		merged.set(added, existing.length);
		zenfs.writeFileSync(target, merged);
		report({ kind: "write", path: target, data: readBack(target) });
	};

	out.existsSync = (p: unknown) => {
		try {
			return zenfs.existsSync(abs(p));
		} catch {
			return false;
		}
	};

	out.mkdirSync = (p: unknown, opts?: unknown) => {
		const target = abs(p);
		const recursive = typeof opts === "object" && opts !== null && (opts as { recursive?: boolean }).recursive;
		zenfs.mkdirSync(target, recursive ? { recursive: true } : undefined);
		report({ kind: "mkdir", path: target });
		return undefined;
	};

	out.readdirSync = (p: unknown, opts?: unknown) => zenfs.readdirSync(abs(p), opts as never);

	out.statSync = (p: unknown, opts?: unknown) => zenfs.statSync(abs(p), opts as never);
	out.lstatSync = (p: unknown, opts?: unknown) => zenfs.statSync(abs(p), opts as never);

	out.unlinkSync = (p: unknown) => {
		const target = abs(p);
		zenfs.unlinkSync(target);
		report({ kind: "delete", path: target });
	};

	out.rmSync = (p: unknown, opts?: unknown) => {
		const target = abs(p);
		zenfs.rmSync(target, opts as never);
		report({ kind: "delete", path: target });
	};

	out.rmdirSync = (p: unknown) => {
		const target = abs(p);
		zenfs.rmSync(target, { recursive: false } as never);
		report({ kind: "delete", path: target });
	};

	out.renameSync = (from: unknown, to: unknown) => {
		const src = abs(from);
		const dst = abs(to);
		zenfs.renameSync(src, dst);
		report({ kind: "rename", path: src, to: dst });
	};

	out.copyFileSync = (from: unknown, to: unknown) => {
		const src = abs(from);
		const dst = abs(to);
		const data = readBack(src) ?? new Uint8Array(0);
		zenfs.writeFileSync(dst, data);
		report({ kind: "write", path: dst, data: readBack(dst) });
	};

	out.accessSync = (p: unknown) => {
		const target = abs(p);
		if (!zenfs.existsSync(target)) {
			const err = new Error(`ENOENT: no such file or directory, access '${target}'`) as Error & { code: string };
			err.code = "ENOENT";
			throw err;
		}
	};

	out.realpathSync = (p: unknown) => abs(p);

	/* ---- callback style (delegating to sync, async via timer) ---- */

	const cb =
		(fn: (...args: unknown[]) => unknown) =>
		(...args: unknown[]) => {
			const callback = args.pop() as (err: Error | null, result?: unknown) => void;
			setTimeout(() => {
				try {
					callback(null, fn(...args));
				} catch (err) {
					callback(err as Error);
				}
			}, 0);
		};

	const callbackNames = [
		"readFile",
		"writeFile",
		"appendFile",
		"mkdir",
		"readdir",
		"stat",
		"lstat",
		"unlink",
		"rm",
		"rename",
		"copyFile",
		"access",
	] as const;
	for (const name of callbackNames) {
		const syncName = `${name}Sync` as keyof typeof out;
		const syncImpl = out[syncName] as ((...args: unknown[]) => unknown) | undefined;
		if (syncImpl) out[name] = cb(syncImpl);
	}
	out.exists = (p: unknown, callback: (exists: boolean) => void) => {
		setTimeout(() => callback(out.existsSync(p) as boolean), 0);
	};

	/* ---- promises ---- */

	const wrapPromise =
		(fn: (...args: unknown[]) => unknown) =>
		async (...args: unknown[]) =>
			fn(...args);

	const promises: Record<string, unknown> = {};
	for (const name of [...callbackNames, "readFileSync", "writeFileSync"] as string[]) {
		const syncName = name.endsWith("Sync") ? name : `${name}Sync`;
		const syncImpl = out[syncName] as ((...args: unknown[]) => unknown) | undefined;
		const publicName = name.endsWith("Sync") ? name.replace(/Sync$/, "") : name;
		if (syncImpl) promises[publicName] = wrapPromise(syncImpl);
	}
	promises.exists = undefined; // matches node: no promises.exists
	out.promises = promises;

	out.Dirent = class Dirent {};
	out.default = out;
	return out;
}

/* ------------------------------------------------------------------ */
/* process                                                              */
/* ------------------------------------------------------------------ */

function createProcess(ctx: RuntimeContext, writer: LineWriter) {
	const emitter = new EventEmitter() as EventEmitter & Record<string, unknown>;
	const proc = emitter as unknown as Record<string, unknown> & {
		stdout: { write: (s: string) => boolean };
		stderr: { write: (s: string) => boolean };
	};

	proc.platform = "browser";
	proc.arch = "wasm32";
	proc.version = "v22.0.0";
	proc.versions = { node: "22.0.0", nodezen: "1.0.0" };
	proc.argv = ["nodezen", ...ctx.argv];
	proc.argv0 = "nodezen";
	proc.execPath = "/nodezen";
	proc.execArgv = [];
	proc.env = { ...ctx.env, NODEZEN: "1" };
	proc.pid = 1;
	proc.ppid = 0;
	proc.title = "nodezen";
	proc.browser = true;
	proc.exitCode = 0;
	proc.stdin = {
		isTTY: false,
		read: () => null,
		resume: () => proc.stdin,
		pause: () => proc.stdin,
		setEncoding: () => proc.stdin,
		on: () => proc.stdin,
		once: () => proc.stdin,
	};
	proc.stdout = {
		isTTY: false,
		write: (s: unknown) => {
			writer.write("stdout", String(s));
			return true;
		},
		end: () => writer.flush(),
		on: () => proc.stdout,
	};
	proc.stderr = {
		isTTY: false,
		write: (s: unknown) => {
			writer.write("stderr", String(s));
			return true;
		},
		end: () => writer.flush(),
		on: () => proc.stderr,
	};
	proc.cwd = () => ctx.cwd;
	proc.chdir = (dir: string) => {
		const target = pathShim.resolve(ctx.cwd, dir);
		if (!zenfs.existsSync(target)) {
			const err = new Error(`ENOENT: no such file or directory, chdir '${target}'`) as Error & { code: string };
			err.code = "ENOENT";
			throw err;
		}
		ctx.cwd = target;
	};
	proc.exit = (code = 0) => {
		writer.flush();
		throw new ExitError(code);
	};
	proc.exitCode = 0;
	proc.nextTick = (callback: (...args: unknown[]) => void, ...args: unknown[]) => {
		queueMicrotask(() => callback(...args));
	};
	proc.hrtime = () => {
		const now = performance.now();
		return [Math.floor(now / 1000), Math.floor((now % 1000) * 1e6)] as unknown as [number, number];
	};
	(proc.hrtime as unknown as Record<string, unknown>).bigint = () => BigInt(Math.floor(performance.now() * 1e6));
	proc.kill = () => {
		throw new Error("process.kill is not available in the NodeZen sandbox");
	};
	proc.memoryUsage = () => ({ rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 });
	proc.cpuUsage = () => ({ user: 0, system: 0 });
	proc.uptime = () => performance.now() / 1000;
	proc.umask = () => 0o022;
	proc.getuid = () => 0;
	proc.getgid = () => 0;
	proc.emitWarning = (warning: unknown) => writer.write("stderr", `Warning: ${String(warning)}\n`);
	return proc;
}

/* ------------------------------------------------------------------ */
/* misc builtins                                                        */
/* ------------------------------------------------------------------ */

function createOs() {
	return {
		platform: () => "browser",
		arch: () => "wasm32",
		type: () => "Browser",
		release: () => "",
		version: () => "",
		EOL: "\n",
		hostname: () => "nodezen",
		homedir: () => "/home/zen",
		tmpdir: () => "/tmp",
		totalmem: () => 2 * 1024 ** 3,
		freemem: () => 1024 ** 3,
		uptime: () => performance.now() / 1000,
		cpus: () =>
			Array.from({ length: navigator.hardwareConcurrency || 4 }, (_, i) => ({
				model: `browser core ${i}`,
				speed: 0,
				times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
			})),
		networkInterfaces: () => ({}),
		networkInterfaceInfo: () => ({}),
		endianness: () => "LE",
		userInfo: () => ({ uid: 0, gid: 0, username: "zen", homedir: "/home/zen", shell: null }),
		loadavg: () => [0, 0, 0],
		constants: { signals: {}, errno: {} },
	};
}

function createCrypto() {
	const webcrypto = globalThis.crypto;
	const randomBytes = (n: number): Buffer => {
		const bytes = new Uint8Array(n);
		let offset = 0;
		while (offset < n) {
			const chunk = Math.min(n - offset, 65536);
			webcrypto.getRandomValues(bytes.subarray(offset, offset + chunk));
			offset += chunk;
		}
		return Buffer.from(bytes);
	};
	class Hash {
		private chunks: Uint8Array[] = [];
		constructor(private readonly algo: string) {}
		update(data: unknown): this {
			this.chunks.push(toBytes(data));
			return this;
		}
		digest(encoding?: string): unknown {
			const total = this.chunks.reduce((n, c) => n + c.length, 0);
			const all = new Uint8Array(total);
			let off = 0;
			for (const c of this.chunks) {
				all.set(c, off);
				off += c.length;
			}
			let result: Uint8Array;
			if (this.algo === "sha256") result = sha256(all);
			else
				throw new Error(
					`crypto.createHash: algorithm '${this.algo}' is not available in the NodeZen sandbox (supported: sha256)`,
				);
			if (!encoding || encoding === "buffer") return Buffer.from(result);
			return decode(result, encoding);
		}
	}
	return {
		randomBytes,
		randomUUID: () => webcrypto.randomUUID(),
		randomInt: (a: number, b?: number) => {
			const min = b === undefined ? 0 : a;
			const max = b === undefined ? a : b;
			return min + (webcrypto.getRandomValues(new Uint32Array(1))[0]! % (max - min));
		},
		timingSafeEqual: (a: Uint8Array, b: Uint8Array) => {
			if (a.length !== b.length) throw new RangeError("Input buffers must have the same length");
			let diff = 0;
			for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
			return diff === 0;
		},
		createHash: (algo: string) => new Hash(String(algo).toLowerCase()),
		webcrypto,
		getRandomValues: (arr: Uint8Array) => webcrypto.getRandomValues(arr),
	};
}

function createAssert() {
	class AssertionError extends Error {
		actual: unknown;
		expected: unknown;
		operator: string;
		constructor(message: string, actual?: unknown, expected?: unknown, operator = "") {
			super(message);
			this.name = "AssertionError";
			this.actual = actual;
			this.expected = expected;
			this.operator = operator;
		}
	}
	const deepEqual = (a: unknown, b: unknown): boolean => {
		if (Object.is(a, b)) return true;
		if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
		if (Array.isArray(a) !== Array.isArray(b)) return false;
		if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
		if (a instanceof RegExp && b instanceof RegExp) return String(a) === String(b);
		if (a instanceof Map && b instanceof Map) {
			return a.size === b.size && [...a.entries()].every(([k, v]) => b.has(k) && deepEqual(v, b.get(k)));
		}
		if (a instanceof Set && b instanceof Set) {
			return a.size === b.size && [...a.values()].some(() => true) && [...a.values()].every((v) => b.has(v) || [...b.values()].some((w) => deepEqual(v, w)));
		}
		if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
			const av = a as unknown as Uint8Array;
			const bv = b as unknown as Uint8Array;
			return av.length === bv.length && av.every((v, i) => v === bv[i]);
		}
		const ka = Object.keys(a as object);
		const kb = Object.keys(b as object);
		if (ka.length !== kb.length) return false;
		return ka.every(
			(k) =>
				Object.prototype.hasOwnProperty.call(b, k) &&
				deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
		);
	};
	const assertFn = (value: unknown, message?: string) => {
		if (!value) throw new AssertionError(message ?? `Expected ${inspect(value)} to be truthy`, value, true, "==");
	};
	const mod = assertFn as Record<string, unknown> & ((v: unknown, m?: string) => void);
	mod.ok = assertFn;
	mod.equal = (a: unknown, b: unknown, message?: string) => {
		// eslint-disable-next-line eqeqeq
		if (!(a == b)) throw new AssertionError(message ?? `${inspect(a)} == ${inspect(b)}`, a, b, "==");
	};
	mod.notEqual = (a: unknown, b: unknown, message?: string) => {
		// eslint-disable-next-line eqeqeq
		if (a == b) throw new AssertionError(message ?? `${inspect(a)} != ${inspect(b)}`, a, b, "!=");
	};
	mod.strictEqual = (a: unknown, b: unknown, message?: string) => {
		if (!Object.is(a, b)) throw new AssertionError(message ?? `${inspect(a)} === ${inspect(b)}`, a, b, "===");
	};
	mod.notStrictEqual = (a: unknown, b: unknown, message?: string) => {
		if (Object.is(a, b)) throw new AssertionError(message ?? `${inspect(a)} !== ${inspect(b)}`, a, b, "!==");
	};
	mod.deepEqual = (a: unknown, b: unknown, message?: string) => {
		if (!deepEqual(a, b)) throw new AssertionError(message ?? `${inspect(a)} deepEqual ${inspect(b)}`, a, b, "deepEqual");
	};
	mod.deepStrictEqual = mod.deepEqual;
	mod.notDeepEqual = (a: unknown, b: unknown, message?: string) => {
		if (deepEqual(a, b)) throw new AssertionError(message ?? "values are deeply equal", a, b, "notDeepEqual");
	};
	mod.notDeepStrictEqual = mod.notDeepEqual;
	mod.throws = (fn: () => unknown, message?: string) => {
		try {
			fn();
		} catch {
			return;
		}
		throw new AssertionError(message ?? "Missing expected exception");
	};
	mod.doesNotThrow = (fn: () => unknown, message?: string) => {
		try {
			fn();
		} catch (err) {
			throw new AssertionError(message ?? `Got unwanted exception: ${String(err)}`);
		}
	};
	mod.fail = (message?: string) => {
		throw new AssertionError(message ?? "Failed");
	};
	mod.match = (value: string, regexp: RegExp, message?: string) => {
		if (!regexp.test(value)) throw new AssertionError(message ?? `${value} does not match ${regexp}`);
	};
	mod.AssertionError = AssertionError;
	return mod;
}

function createQuerystring() {
	const encode = (s: string) => encodeURIComponent(s).replace(/%20/g, "+");
	const decode = (s: string) => decodeURIComponent(s.replace(/\+/g, " "));
	return {
		stringify: (obj: Record<string, unknown> = {}) =>
			Object.entries(obj)
				.flatMap(([k, v]) => (Array.isArray(v) ? v.map((item) => `${encode(k)}=${encode(String(item))}`) : [`${encode(k)}=${encode(String(v))}`]))
				.join("&"),
		parse: (str = ""): Record<string, string | string[]> => {
			const out: Record<string, string | string[]> = {};
			for (const part of str.split("&")) {
				if (!part) continue;
				const eq = part.indexOf("=");
				const key = decode(eq === -1 ? part : part.slice(0, eq));
				const value = decode(eq === -1 ? "" : part.slice(eq + 1));
				const existing = out[key];
				if (existing === undefined) out[key] = value;
				else if (Array.isArray(existing)) existing.push(value);
				else out[key] = [existing, value];
			}
			return out;
		},
		escape: encode,
		unescape: decode,
	};
}

function createUtil() {
	return {
		inspect,
		format,
		promisify:
			(fn: (...args: unknown[]) => void) =>
			(...args: unknown[]): Promise<unknown> =>
				new Promise((resolve, reject) => {
					fn(...args, (err: Error | null, result?: unknown) => (err ? reject(err) : resolve(result)));
				}),
		callbackify:
			(fn: (...args: unknown[]) => Promise<unknown>) =>
			(...args: unknown[]) => {
				const callback = args.pop() as (err: Error | null, result?: unknown) => void;
				fn(...args).then(
					(result) => callback(null, result),
					(err) => callback(err),
				);
			},
		deprecate: <T>(fn: T) => fn,
		inherits: (ctor: unknown, superCtor: unknown) => {
			Object.setPrototypeOf(ctor as object, superCtor as object);
		},
		isArray: Array.isArray,
		isDeepStrictEqual: (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b),
		types: {
			isPromise: (v: unknown) => v instanceof Promise,
			isDate: (v: unknown) => v instanceof Date,
			isRegExp: (v: unknown) => v instanceof RegExp,
			isMap: (v: unknown) => v instanceof Map,
			isSet: (v: unknown) => v instanceof Set,
			isNativeError: (v: unknown) => v instanceof Error,
			isArrayBufferView: (v: unknown) => ArrayBuffer.isView(v),
		},
		TextDecoder,
		TextEncoder,
		getSystemErrorName: (code?: number) => `E${code ?? "UNKNOWN"}`,
		_debuglog: () => () => {},
		styleText: (_style: unknown, text: string) => text,
	};
}

/* ------------------------------------------------------------------ */
/* registry                                                             */
/* ------------------------------------------------------------------ */

export interface BuiltinModules {
	[name: string]: unknown;
}

export function createBuiltins(ctx: RuntimeContext) {
	const writer = new LineWriter(ctx);
	const consoleShim = createConsole(ctx, writer);
	const fsShim = createFs(ctx);
	const processShim = createProcess(ctx, writer);

	const modules: BuiltinModules = {
		fs: fsShim,
		"fs/promises": (fsShim.promises as object) ?? {},
		path: pathShim.default,
		"node:path/posix": pathShim.default,
		os: createOs(),
		process: processShim,
		events: {
			EventEmitter,
			once: (emitter: EventEmitter, name: string) =>
				new Promise((resolve) => {
					emitter.once(name, (...args: unknown[]) => resolve(args.length > 1 ? args : args[0]));
				}),
			on: () => {
				throw new Error("events.on (async iterator) is not available in the NodeZen sandbox");
			},
			default: { EventEmitter },
		},
		buffer: { Buffer, INSPECT_MAX_BYTES: 50, kMaxLength: 0x7fffffff, constants: { MAX_LENGTH: 0x7fffffff, MAX_STRING_LENGTH: 512 * 1024 * 1024 } },
		util: createUtil(),
		crypto: createCrypto(),
		assert: createAssert(),
		querystring: createQuerystring(),
		url: {
			URL,
			URLSearchParams,
			parse: (s: string) => {
				const u = new URL(s, "http://x");
				return { href: u.href, protocol: u.protocol, host: u.host, hostname: u.hostname, port: u.port, pathname: u.pathname, search: u.search, hash: u.hash };
			},
			format: (o: { href?: string }) => o?.href ?? "",
			fileURLToPath: (u: URL | string) => {
				const url = typeof u === "string" ? new URL(u) : u;
				return decodeURIComponent(url.pathname);
			},
			pathToFileURL: (p: string) => new URL(`file://${p}`),
		},
		stream: createUnsupported("stream"),
		timers: { setTimeout: globalThis.setTimeout.bind(globalThis), setInterval: globalThis.setInterval.bind(globalThis), clearTimeout: globalThis.clearTimeout.bind(globalThis), clearInterval: globalThis.clearInterval.bind(globalThis), setImmediate: (fn: () => void) => setTimeout(fn, 0), clearImmediate: (h: number) => clearTimeout(h), promises: { setTimeout: (ms: number) => new Promise((r) => setTimeout(r, ms)) } },
		"timers/promises": { setTimeout: (ms: number) => new Promise((r) => setTimeout(r, ms)), setInterval: async function* () {}, setImmediate: () => Promise.resolve() },
		perf_hooks: { performance: globalThis.performance, PerformanceObserver: class { observe() {} disconnect() {} } },
		async_hooks: { AsyncLocalStorage: class { run(_s: unknown, fn: () => unknown) { return fn(); } getStore() { return undefined; } }, createHook: () => ({ enable() {}, disable() {} }) },
		console: consoleShim,
		string_decoder: { StringDecoder: class { constructor(private enc = "utf8") {} write(buf: Uint8Array) { return decode(buf, this.enc === "utf8" ? "utf8" : this.enc); } end(buf?: Uint8Array) { return buf ? decode(buf, "utf8") : ""; } } },
		module: { createRequire: () => { throw new Error("module.createRequire is not available in the NodeZen sandbox"); } },
		v8: { getHeapStatistics: () => ({ total_heap_size: 0, used_heap_size: 0 }) },
		inspector: { url: () => undefined },
	};

	return { modules, consoleShim, processShim, writer, fsShim };
}

function createUnsupported(name: string): Record<string, unknown> {
	return new Proxy({} as Record<string, unknown>, {
		get(_target, prop) {
			throw new Error(
				`The "${name}" module is not available in the NodeZen browser sandbox (accessed "${String(prop)}"). ` +
					`Available built-ins: fs, path, os, process, events, buffer, util, crypto, assert, querystring, url, timers, string_decoder.`,
			);
		},
	});
}
