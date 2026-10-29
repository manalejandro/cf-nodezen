/**
 * Prepare the vinext Cloudflare Build Output for `wrangler deploy`.
 *
 * `vite build` writes Build Output to `.cloudflare/output/` (the cf CLI
 * convention). Wrangler refuses to deploy while that directory exists, so we
 * move it to `.deploy/output/`, which is where `wrangler.jsonc` points.
 *
 * Usage: npm run deploy  →  vite build && node scripts/prepare-deploy.mjs && wrangler deploy
 */
import { existsSync } from "node:fs";
import { mkdir, rename, rm, cp } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const buildOutput = path.join(root, ".cloudflare", "output");
const deployDir = path.join(root, ".deploy");

if (!existsSync(path.join(buildOutput, "v0", "config.json"))) {
	console.error(
		"[prepare-deploy] No Cloudflare Build Output found at .cloudflare/output/v0.\n" +
			"Run `npm run build` (vite build) first.",
	);
	process.exit(1);
}

await rm(deployDir, { recursive: true, force: true });
await mkdir(path.dirname(deployDir), { recursive: true });
// Copy then remove: keep `rename` semantics across filesystems safe.
await cp(buildOutput, deployDir, { recursive: true });
await rm(buildOutput, { recursive: true, force: true });

console.log(`[prepare-deploy] Build Output staged at .deploy/ for wrangler deploy`);
