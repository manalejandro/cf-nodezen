/**
 * NodeZen sandbox worker.
 *
 * One sandbox is spawned per run. It receives a snapshot of the workspace
 * files, mounts them on an in-memory ZenFS, installs the Node.js shims and
 * executes the requested entry module. Console output, file mutations and the
 * exit code are streamed back to the host page, which persists mutations to
 * the room workspace and replicates them to peers.
 *
 * The host can terminate this worker at any time (the Stop button), which is
 * how infinite loops are handled.
 */
import { Buffer } from "buffer";
import { configureSingle, InMemory, fs as zenfs } from "@zenfs/core";
import { createBuiltins, type RuntimeContext } from "./builtins";
import { ModuleLoader } from "./loader";
import { ExitError, type SandboxEvent, type SandboxRunRequest } from "./types";

const post = (event: SandboxEvent) => (self as unknown as Worker).postMessage(event);

// Keep pristine timer references before instrumenting them.
const realSetTimeout = globalThis.setTimeout.bind(globalThis);
const realSetInterval = globalThis.setInterval.bind(globalThis);
const realClearTimeout = globalThis.clearTimeout.bind(globalThis);
const realClearInterval = globalThis.clearInterval.bind(globalThis);
const realFetch = globalThis.fetch?.bind(globalThis);

let handles = 0;
let onHandleDelta = () => {};
let drainChecker: number | undefined;
let exited = false;
let flushWriter: () => void = () => {};

function trackHandles() {
	const g = globalThis as unknown as Record<string, unknown>;
	const activeTimers = new Map<unknown, "timeout" | "interval">();

	// The wrappers below must call the *pristine* timer functions captured at
	// module scope (realSetTimeout & co). Calling globalThis.setTimeout here
	// would re-enter the wrapper and recurse until the stack overflows.
	const release = (id: unknown) => {
		if (activeTimers.delete(id)) {
			handles = Math.max(0, handles - 1);
			onHandleDelta(-1);
		}
	};

	g.setTimeout = function (handler: TimerHandler, timeout?: number, ...args: unknown[]) {
		handles++;
		onHandleDelta(1);
		const id = realSetTimeout((ev) => {
			release(id);
			if (typeof handler === "function") handler(ev);
		}, timeout, ...args);
		activeTimers.set(id, "timeout");
		return id;
	} as unknown as typeof globalThis.setTimeout;

	g.setInterval = function (handler: TimerHandler, timeout?: number, ...args: unknown[]) {
		handles++;
		onHandleDelta(1);
		const id = realSetInterval((ev) => {
			if (typeof handler === "function") handler(ev);
		}, timeout, ...args);
		activeTimers.set(id, "interval");
		return id;
	} as unknown as typeof globalThis.setInterval;

	g.clearTimeout = function (id?: ReturnType<typeof setTimeout>) {
		release(id);
		return realClearTimeout(id);
	} as unknown as typeof globalThis.clearTimeout;

	g.clearInterval = function (id?: ReturnType<typeof setInterval>) {
		release(id);
		return realClearInterval(id);
	} as unknown as typeof globalThis.clearInterval;

	if (realFetch) {
		g.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
			handles++;
			onHandleDelta(1);
			try {
				return await realFetch(input as RequestInfo, init);
			} finally {
				handles = Math.max(0, handles - 1);
				onHandleDelta(-1);
			}
		} as unknown as typeof globalThis.fetch;
	}
}

function finish(code: number, error?: { message: string; stack?: string }) {
	if (exited) return;
	exited = true;
	if (drainChecker !== undefined) realClearInterval(drainChecker);
	try {
		flushWriter();
	} catch {
		// nothing to flush
	}
	post({ t: "exit", code, error });
}

function maybeScheduleDrain() {
	if (exited || drainChecker !== undefined) return;
	drainChecker = realSetInterval(() => {
		if (handles <= 0) {
			const code = Number((globalThis as unknown as { process?: { exitCode?: unknown } }).process?.exitCode ?? 0);
			finish(Number.isFinite(code) ? code : 0);
		}
	}, 50);
}

async function run(request: SandboxRunRequest) {
	await configureSingle({ backend: InMemory });

	// Standard directories expected by the os shim.
	zenfs.mkdirSync("/tmp", { recursive: true } as never);
	zenfs.mkdirSync("/home/zen", { recursive: true } as never);

	for (const file of request.files) {
		const dir = file.path.slice(0, file.path.lastIndexOf("/"));
		if (dir && dir !== "/" && !zenfs.existsSync(dir)) {
			zenfs.mkdirSync(dir, { recursive: true } as never);
		}
		zenfs.writeFileSync(file.path, file.data);
	}

	const ctx: RuntimeContext = {
		cwd: "/",
		argv: request.argv?.length ? request.argv : [request.entry],
		env: request.env ?? {},
		emitConsole: (method, text) => post({ t: "console", method, text }),
		emitFs: (op) => post({ t: "fs", op }),
		onHandleDelta: (delta) => {
			if (delta < 0) maybeScheduleDrain();
		},
	};
	onHandleDelta = ctx.onHandleDelta;

	const { modules, consoleShim, processShim, writer } = createBuiltins(ctx);
	flushWriter = () => writer.flush();

	// Install Node-ish globals for user code.
	const g = globalThis as unknown as Record<string, unknown>;
	g.process = processShim;
	g.console = consoleShim;
	g.Buffer = Buffer;
	g.global = globalThis;
	g.__nodezen = true;
	trackHandles();

	const loader = new ModuleLoader(modules, {});

	try {
		if (!zenfs.existsSync(request.entry)) {
			throw new Error(`Entry module not found: ${request.entry}`);
		}
		loader.require(request.entry);
		maybeScheduleDrain();
		if (handles <= 0 && drainChecker === undefined) {
			// Fully synchronous program: flush microtasks, then exit.
			realSetTimeout(() => {
				writer.flush();
				finish(Number(processShim.exitCode ?? 0));
			}, 0);
		}
	} catch (err) {
		writer.flush();
		if (err instanceof ExitError) {
			finish(err.code);
			return;
		}
		const e = err as Error;
		post({ t: "console", method: "error", text: e?.stack ? String(e.stack) : String(e?.message ?? err) });
		finish(1, { message: String(e?.message ?? err), stack: e?.stack ? String(e.stack) : undefined });
	}
}

self.addEventListener("unhandledrejection", (event) => {
	const reason = (event as PromiseRejectionEvent).reason;
	const text = reason instanceof Error ? String(reason.stack ?? reason.message) : String(reason);
	post({ t: "console", method: "error", text: `Unhandled promise rejection: ${text}` });
	finish(1, { message: text });
});

self.addEventListener("error", (event) => {
	const err = (event as ErrorEvent).error;
	if (err instanceof ExitError) {
		// process.exit() from a timer or other async context.
		event.preventDefault();
		finish(err.code);
		return;
	}
	const text = err?.stack ? String(err.stack) : String((event as ErrorEvent).message ?? "unknown error");
	post({ t: "console", method: "error", text: `Uncaught exception: ${text}` });
	finish(1, { message: text });
});

self.addEventListener("message", (event: MessageEvent) => {
	const data = event.data as SandboxRunRequest;
	if (data?.t === "run") {
		run(data).catch((err) => {
			finish(1, { message: String((err as Error)?.message ?? err) });
		});
	}
});

post({ t: "ready" });
