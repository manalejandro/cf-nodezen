/**
 * NodeZen sandbox — ambient type declarations.
 *
 * This file is NOT part of the app's TypeScript program (it is excluded in
 * tsconfig.json). It is loaded into the Monaco editor as an extra library so
 * user code in the workspace gets IntelliSense for the Node.js shims.
 */

declare module "fs" {
	export interface Stats {
		isFile(): boolean;
		isDirectory(): boolean;
		size: number;
		mtimeMs: number;
		birthtimeMs: number;
		atimeMs: number;
		ctimeMs: number;
		mtime: Date;
		ctime: Date;
	}
	export interface Dirent {
		name: string;
		isFile(): boolean;
		isDirectory(): boolean;
	}
	export function readFileSync(path: string | URL, encoding: "utf8" | "utf-8"): string;
	export function readFileSync(path: string | URL): Uint8Array;
	export function readFileSync(path: string | URL, options?: { encoding?: string } | string): string | Uint8Array;
	export function writeFileSync(path: string | URL, data: string | Uint8Array | ArrayBuffer, options?: { encoding?: string; flag?: string } | string): void;
	export function appendFileSync(path: string | URL, data: string | Uint8Array): void;
	export function existsSync(path: string | URL): boolean;
	export function mkdirSync(path: string | URL, options?: { recursive?: boolean }): void;
	export function readdirSync(path: string | URL, options: { withFileTypes: true }): Dirent[];
	export function readdirSync(path: string | URL): string[];
	export function statSync(path: string | URL): Stats;
	export function lstatSync(path: string | URL): Stats;
	export function unlinkSync(path: string | URL): void;
	export function rmSync(path: string | URL, options?: { recursive?: boolean; force?: boolean }): void;
	export function rmdirSync(path: string | URL): void;
	export function renameSync(from: string | URL, to: string | URL): void;
	export function copyFileSync(from: string | URL, to: string | URL): void;
	export function accessSync(path: string | URL, mode?: number): void;
	export function realpathSync(path: string | URL): string;
	export function readFile(path: string | URL, callback: (err: Error | null, data: Uint8Array) => void): void;
	export function readFile(path: string | URL, encoding: string, callback: (err: Error | null, data: string) => void): void;
	export function writeFile(path: string | URL, data: string | Uint8Array, callback: (err: Error | null) => void): void;
	export function mkdir(path: string | URL, options: { recursive?: boolean } | undefined, callback: (err: Error | null) => void): void;
	export function readdir(path: string | URL, callback: (err: Error | null, files: string[]) => void): void;
	export function stat(path: string | URL, callback: (err: Error | null, stats: Stats) => void): void;
	export function unlink(path: string | URL, callback: (err: Error | null) => void): void;
	export function rm(path: string | URL, options: { recursive?: boolean; force?: boolean } | undefined, callback: (err: Error | null) => void): void;
	export function rename(from: string | URL, to: string | URL, callback: (err: Error | null) => void): void;
	export function access(path: string | URL, callback: (err: Error | null) => void): void;
	export function exists(path: string | URL, callback: (exists: boolean) => void): void;
	export const promises: {
		readFile(path: string | URL, encoding: "utf8" | "utf-8"): Promise<string>;
		readFile(path: string | URL): Promise<Uint8Array>;
		writeFile(path: string | URL, data: string | Uint8Array): Promise<void>;
		appendFile(path: string | URL, data: string | Uint8Array): Promise<void>;
		mkdir(path: string | URL, options?: { recursive?: boolean }): Promise<void>;
		readdir(path: string | URL, options?: { withFileTypes?: false }): Promise<string[]>;
		stat(path: string | URL): Promise<Stats>;
		unlink(path: string | URL): Promise<void>;
		rm(path: string | URL, options?: { recursive?: boolean; force?: boolean }): Promise<void>;
		rename(from: string | URL, to: string | URL): Promise<void>;
		copyFile(from: string | URL, to: string | URL): Promise<void>;
		access(path: string | URL): Promise<void>;
	};
	export const constants: { F_OK: number; R_OK: number; W_OK: number; X_OK: number };
}

declare module "node:fs" {
	export * from "fs";
}

declare module "fs/promises" {
	import { promises } from "fs";
	export = promises;
}

declare module "path" {
	export function join(...parts: string[]): string;
	export function resolve(...parts: string[]): string;
	export function relative(from: string, to: string): string;
	export function dirname(p: string): string;
	export function basename(p: string, ext?: string): string;
	export function extname(p: string): string;
	export function normalize(p: string): string;
	export function isAbsolute(p: string): boolean;
	export function parse(p: string): { root: string; dir: string; base: string; ext: string; name: string };
	export function format(parsed: { dir?: string; base?: string; name?: string; ext?: string }): string;
	export const sep: string;
	export const delimiter: string;
	export const posix: typeof import("path");
}

declare module "node:path" {
	export * from "path";
}

declare module "os" {
	export function platform(): string;
	export function arch(): string;
	export function type(): string;
	export function hostname(): string;
	export function homedir(): string;
	export function tmpdir(): string;
	export function totalmem(): number;
	export function freemem(): number;
	export function uptime(): number;
	export function cpus(): Array<{ model: string; speed: number }>;
	export function networkInterfaces(): Record<string, unknown>;
	export function userInfo(): { username: string; homedir: string; uid: number; gid: number };
	export const EOL: string;
}

declare module "node:os" {
	export * from "os";
}

declare module "events" {
	export class EventEmitter {
		on(event: string, listener: (...args: any[]) => void): this;
		once(event: string, listener: (...args: any[]) => void): this;
		off(event: string, listener: (...args: any[]) => void): this;
		removeListener(event: string, listener: (...args: any[]) => void): this;
		removeAllListeners(event?: string): this;
		emit(event: string, ...args: any[]): boolean;
		listenerCount(event: string): number;
		addListener(event: string, listener: (...args: any[]) => void): this;
	}
	export default EventEmitter;
}

declare module "node:events" {
	export * from "events";
}

declare module "buffer" {
	export const Buffer: {
		from(data: string | ArrayBuffer | Uint8Array | unknown[], encoding?: string): Uint8Array & { toString(encoding?: string): string };
		alloc(size: number): Uint8Array;
		isBuffer(value: unknown): boolean;
		byteLength(data: string | ArrayBuffer): number;
		concat(list: Uint8Array[]): Uint8Array;
	};
}

declare module "node:buffer" {
	export * from "buffer";
}

declare module "util" {
	export function inspect(value: unknown, options?: { depth?: number | null }): string;
	export function format(fmt?: unknown, ...args: unknown[]): string;
	export function promisify(fn: (...args: any[]) => void): (...args: any[]) => Promise<unknown>;
	export function inherits(ctor: unknown, superCtor: unknown): void;
	export const types: {
		isPromise(v: unknown): boolean;
		isDate(v: unknown): boolean;
		isRegExp(v: unknown): boolean;
		isMap(v: unknown): boolean;
		isSet(v: unknown): boolean;
	};
	export const TextDecoder: globalThis.TextDecoderConstructor;
	export const TextEncoder: globalThis.TextEncoderConstructor;
}

declare module "node:util" {
	export * from "util";
}

declare module "crypto" {
	export function randomBytes(n: number): Uint8Array;
	export function randomUUID(): string;
	export function randomInt(min: number, max?: number): number;
	export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
	export function createHash(algorithm: "sha256"): {
		update(data: string | Uint8Array): ReturnType<typeof createHash>;
		digest(encoding: "hex" | "base64"): string;
		digest(): Uint8Array;
	};
	export const webcrypto: Crypto;
	export function getRandomValues<T extends Uint8Array>(array: T): T;
}

declare module "node:crypto" {
	export * from "crypto";
}

declare module "assert" {
	function assert(value: unknown, message?: string): asserts value;
	namespace assert {
		function ok(value: unknown, message?: string): void;
		function equal(a: unknown, b: unknown, message?: string): void;
		function notEqual(a: unknown, b: unknown, message?: string): void;
		function strictEqual(a: unknown, b: unknown, message?: string): void;
		function notStrictEqual(a: unknown, b: unknown, message?: string): void;
		function deepEqual(a: unknown, b: unknown, message?: string): void;
		function deepStrictEqual(a: unknown, b: unknown, message?: string): void;
		function throws(fn: () => unknown, message?: string): void;
		function doesNotThrow(fn: () => unknown, message?: string): void;
		function fail(message?: string): never;
		function match(value: string, regexp: RegExp, message?: string): void;
		class AssertionError extends Error {
			actual: unknown;
			expected: unknown;
			operator: string;
		}
	}
	export = assert;
}

declare module "node:assert" {
	export * from "assert";
}

declare module "querystring" {
	export function stringify(obj?: Record<string, unknown>): string;
	export function parse(str?: string): Record<string, string | string[]>;
	export function escape(s: string): string;
	export function unescape(s: string): string;
}

declare module "node:querystring" {
	export * from "querystring";
}

declare module "url" {
	export { URL, URLSearchParams } from "url";
	export function parse(s: string): {
		href: string;
		protocol: string;
		host: string;
		hostname: string;
		port: string;
		pathname: string;
		search: string;
		hash: string;
	};
	export function fileURLToPath(url: URL | string): string;
	export function pathToFileURL(path: string): URL;
}

declare module "node:url" {
	export * from "url";
}

declare module "timers" {
	export function setTimeout(handler: () => void, timeout?: number): number;
	export function setInterval(handler: () => void, timeout?: number): number;
	export function clearTimeout(id?: number): void;
	export function clearInterval(id?: number): void;
}

declare module "node:timers" {
	export * from "timers";
}

declare module "timers/promises" {
	export function setTimeout(ms?: number): Promise<void>;
}

declare module "node:timers/promises" {
	export * from "timers/promises";
}

declare module "string_decoder" {
	export class StringDecoder {
		constructor(encoding?: string);
		write(buf: Uint8Array): string;
		end(buf?: Uint8Array): string;
	}
}

declare module "perf_hooks" {
	export const performance: Performance;
}

declare var process: {
	platform: string;
	arch: string;
	version: string;
	versions: Record<string, string>;
	argv: string[];
	env: Record<string, string | undefined>;
	pid: number;
	title: string;
	exitCode: number;
	browser: true;
	cwd(): string;
	chdir(dir: string): void;
	exit(code?: number): never;
	nextTick(cb: (...args: unknown[]) => void, ...args: unknown[]): void;
	hrtime(): [number, number];
	uptime(): number;
	memoryUsage(): { rss: number; heapTotal: number; heapUsed: number; external: number };
	stdout: { write(data: string): boolean; isTTY: boolean };
	stderr: { write(data: string): boolean; isTTY: boolean };
	stdin: { isTTY: boolean };
	on(event: string, listener: (...args: any[]) => void): void;
	once(event: string, listener: (...args: any[]) => void): void;
	emit(event: string, ...args: any[]): boolean;
	emitWarning(warning: string): void;
};

declare var Buffer: typeof import("buffer").Buffer;

declare var global: typeof globalThis;

declare var require: {
	(id: string): any;
	resolve(id: string): string;
	cache: Record<string, unknown>;
};

declare var module: {
	exports: Record<string, unknown>;
	id: string;
	filename: string;
	loaded: boolean;
};

declare var exports: Record<string, unknown>;

declare var __filename: string;
declare var __dirname: string;
