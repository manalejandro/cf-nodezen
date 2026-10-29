/**
 * A small CommonJS module loader for the sandbox:
 * - resolves relative/absolute specifiers against the in-memory ZenFS
 * - transpiles TypeScript / JSX with sucrase
 * - supports ESM syntax through sucrase's `imports` transform
 */
import { transform, type Transform } from "sucrase";
import { fs as zenfs } from "@zenfs/core";
import * as pathShim from "./path";
import type { BuiltinModules } from "./builtins";

interface NodeZenModule {
	exports: Record<string, unknown>;
	id: string;
	filename: string;
	loaded: boolean;
	children: NodeZenModule[];
	paths: string[];
}

const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"] as const;

export class ModuleLoader {
	private readonly cache = new Map<string, NodeZenModule>();

	constructor(
		private readonly builtins: BuiltinModules,
		private readonly globals: Record<string, unknown>,
	) {}

	private stripNodePrefix(request: string): string {
		return request.startsWith("node:") ? request.slice(5) : request;
	}

	private isBuiltin(request: string): boolean {
		const bare = this.stripNodePrefix(request);
		return bare in this.builtins;
	}

	resolveFilename(request: string, parentFilename?: string): string {
		const bare = this.stripNodePrefix(request);
		if (bare in this.builtins) return `builtin:${bare}`;

		let base: string;
		if (request.startsWith("/")) base = pathShim.normalize(request);
		else if (request.startsWith("./") || request.startsWith("../"))
			base = pathShim.resolve(pathShim.dirname(parentFilename ?? "/"), request);
		else
			throw new Error(
				`Cannot find module '${request}'. npm packages are not available in the NodeZen sandbox; ` +
					`use relative imports or Node built-ins (fs, path, events, crypto, ...).`,
			);

		const tried: string[] = [];
		const candidates = [base];
		for (const ext of EXTENSIONS) candidates.push(`${base}${ext}`);
		candidates.push(base); // directory index
		for (const ext of EXTENSIONS) candidates.push(pathShim.join(base, `index${ext}`));

		for (const candidate of candidates) {
			try {
				if (zenfs.existsSync(candidate) && zenfs.statSync(candidate).isFile()) return candidate;
			} catch {
				// keep looking
			}
			tried.push(candidate);
		}
		throw new Error(
			`Cannot find module '${request}' imported from '${parentFilename ?? "<entry>"}'. Tried:\n  ${[...new Set(tried)].join("\n  ")}`,
		);
	}

	require(request: string, parentFilename?: string): unknown {
		const bare = this.stripNodePrefix(request);
		if (bare in this.builtins) return this.builtins[bare];

		const filename = this.resolveFilename(request, parentFilename);
		const cached = this.cache.get(filename);
		if (cached) {
			if (!cached.loaded) return cached.exports; // circular import: partial exports
			return cached.exports;
		}

		const source = String(zenfs.readFileSync(filename, "utf8"));
		const mod: NodeZenModule = {
			exports: {},
			id: filename,
			filename,
			loaded: false,
			children: [],
			paths: [],
		};
		this.cache.set(filename, mod);

		try {
			if (filename.endsWith(".json")) {
				mod.exports = JSON.parse(source);
			} else {
				const ext = pathShim.extname(filename);
				const transforms: Transform[] = ["imports"];
				if (ext === ".ts" || ext === ".mts" || ext === ".cts") transforms.unshift("typescript");
				if (ext === ".tsx") transforms.unshift("typescript", "jsx");
				if (ext === ".jsx") transforms.unshift("jsx");

				let code: string;
				try {
					code = transform(source, { transforms, production: true, filePath: filename }).code;
				} catch (err) {
					const e = err as Error & { loc?: { line: number } };
					const line = e.loc?.line ? ` (line ${e.loc.line})` : "";
					throw new SyntaxError(`Failed to compile ${filename}${line}: ${e.message}`);
				}

				const dirname = pathShim.dirname(filename);
				const childRequire = (req: string) => this.require(req, filename);
				childRequire.resolve = (req: string) => this.resolveFilename(req, filename);
				childRequire.cache = this.cache;
				childRequire.main = this.cache.values().next().value;

				const fn = new Function(
					"exports",
					"require",
					"module",
					"__filename",
					"__dirname",
					...Object.keys(this.globals),
					`"use strict";\n${code}\n//# sourceURL=${filename}`,
				);
				fn(mod.exports, childRequire, mod, filename, dirname, ...Object.values(this.globals));
			}
			mod.loaded = true;
			return mod.exports;
		} catch (err) {
			this.cache.delete(filename);
			throw err;
		}
	}

	clear() {
		this.cache.clear();
	}
}
