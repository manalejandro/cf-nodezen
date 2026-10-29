/** Shared types between the sandbox worker and its host. */

export interface SandboxFile {
	path: string;
	data: Uint8Array;
}

export interface SandboxRunRequest {
	t: "run";
	files: SandboxFile[];
	entry: string;
	argv?: string[];
	env?: Record<string, string>;
}

export type SandboxMutationKind = "write" | "delete" | "mkdir" | "rename";

export interface SandboxFsMutation {
	kind: SandboxMutationKind;
	path: string;
	to?: string;
	data?: Uint8Array;
}

export type SandboxEvent =
	| { t: "ready" }
	| { t: "console"; method: string; text: string }
	| { t: "fs"; op: SandboxFsMutation }
	| { t: "exit"; code: number | null; error?: { message: string; stack?: string } };

/** Thrown by process.exit(); caught by the runner to end execution. */
export class ExitError extends Error {
	readonly isExit = true;
	constructor(readonly code: number) {
		super(`process exited with code ${code}`);
		this.name = "ExitError";
	}
}

export const UNSUPPORTED_MODULES = [
	"http",
	"https",
	"net",
	"dgram",
	"child_process",
	"worker_threads",
	"cluster",
	"readline",
	"zlib",
	"tls",
	"dns",
	"tty",
] as const;
