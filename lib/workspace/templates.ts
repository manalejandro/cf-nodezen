export interface SeedFile {
	path: string;
	content: string;
}

export const SEED_FILES: SeedFile[] = [
	{
		path: "/index.ts",
		content: `/**
 * Welcome to NodeZen 🍃
 *
 * A shared Node.js-style workspace that runs entirely in the browser.
 * Press ▶ Run (or Ctrl/Cmd + Enter) to execute this file.
 *
 * Try it: everything this program writes with \`fs\` appears in the file
 * tree — and syncs to every peer in the room in real time.
 */
import { EventEmitter } from "node:events";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fibonacci } from "./lib/fibonacci";

interface Bloom {
  name: string;
  petals: number;
}

class ZenGarden extends EventEmitter {
  readonly blooms: Bloom[] = [];

  plant(name: string): this {
    const petals = fibonacci(this.blooms.length + 4);
    const bloom: Bloom = { name, petals };
    this.blooms.push(bloom);
    this.emit("bloom", bloom);
    return this;
  }
}

const garden = new ZenGarden();

garden.on("bloom", ({ name, petals }: Bloom) => {
  console.log(\`🌸 \${name} bloomed with \${petals} petals\`);
});

console.log("Welcome to NodeZen — planting a small garden…\\n");
for (const name of ["lotus", "bamboo", "maple", "moss"]) {
  garden.plant(name);
}

// The fs shim is backed by the room workspace (ZenFS + IndexedDB).
mkdirSync("/data", { recursive: true });
const logPath = join("/data", "garden.json");
writeFileSync(
  logPath,
  JSON.stringify({ plantedAt: new Date().toISOString(), blooms: garden.blooms }, null, 2),
);

console.log(\`\\n📄 wrote \${logPath}:\`);
console.log(readFileSync(logPath, "utf8"));
console.log("\\nOpen data/garden.json in the file tree — your code just created it.");
`,
	},
	{
		path: "/lib/fibonacci.ts",
		content: `/** Memoized Fibonacci helpers, written in TypeScript. */

const memo = new Map<number, number>([
  [0, 0],
  [1, 1],
]);

export function fibonacci(n: number): number {
  if (n < 0) throw new RangeError(\`fibonacci: n must be >= 0 (got \${n})\`);
  let current = memo.get(n);
  if (current !== undefined) return current;
  current = fibonacci(n - 1) + fibonacci(n - 2);
  memo.set(n, current);
  return current;
}

export function fibonacciSequence(count: number): number[] {
  return Array.from({ length: count }, (_, i) => fibonacci(i));
}
`,
	},
	{
		path: "/README.md",
		content: `# NodeZen workspace

This workspace lives **in your browser** (ZenFS on IndexedDB) and syncs with
everyone in the room over **WebRTC data channels**, signaled by a Cloudflare
Durable Object.

## Running code

- The **Run** button (or \`Ctrl/Cmd + Enter\`) executes the active file.
- Output streams to the terminal below the editor and is shared with the room.
- **Stop** terminates the sandbox — safe even for infinite loops.

## What is available

- Node built-ins: \`fs\`, \`path\`, \`os\`, \`process\`, \`events\`, \`buffer\`,
  \`util\`, \`crypto\`, \`assert\`, \`querystring\`, \`url\`, \`timers\`
- TypeScript and JSX are transpiled in the browser (sucrase)
- Both ESM (\`import\`/\`export\`) and CommonJS (\`require\`)
- \`fetch\`, Web Crypto, and the rest of the browser platform

## Limitations

- npm packages cannot be installed (yet) — only built-ins and relative imports
- No servers: \`http\`, \`net\`, \`child_process\`, \`worker_threads\` are unavailable
- Code runs in a sandboxed worker, not a real Node.js process

Happy hacking 🍃
`,
	},
];
