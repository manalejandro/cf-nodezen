# 🍃 NodeZen

**Your browser is the runtime.**

NodeZen is a collaborative JavaScript, TypeScript & Node.js workspace that runs
**entirely in the browser** — no installs, no sign-up, no server-side databases.
Create a room, share the invite link, and code together in real time.

Live at **[nodezen.manalejandro.com](https://nodezen.manalejandro.com)** ·
built with [vinext](https://vinext.dev) on Cloudflare Workers.

## What you get

- 🗂️ **A real file system in the browser** — [ZenFS](https://zenfs.dev) mounted
  on IndexedDB, one workspace per room, persisted across reloads.
- 🍃 **Node.js shims** — `fs`, `path`, `os`, `process`, `events`, `Buffer`,
  `util`, `crypto` (incl. `createHash('sha256')`), `assert`, `querystring`,
  `url`, `timers` and more, implemented over the sandbox so everyday Node
  scripts just run.
- ⌨️ **Monaco editor** — syntax highlighting, IntelliSense with ambient types
  for every shim, custom light/dark zen themes, multi-tab editing.
- ▶️ **Sandboxed runs** — code executes in a dedicated Web Worker; TypeScript
  and JSX are transpiled in-browser with [sucrase](https://github.com/alangpierce/sucrase).
  Infinite loop? Hit **Stop** — the worker is terminated instantly.
- 🔗 **Rooms with invite links** — `/r/nz-xxxxxxxxxx`. Anyone with the link
  joins the same live workspace.
- 📡 **Peer-to-peer sync** — file operations, chat, presence, remote cursors
  and run output stream over **WebRTC data channels** (full mesh), signaled by
  a **Cloudflare Durable Object**. If P2P fails, messages relay through the DO
  automatically, so the room always works.
- 🧘 **Conflict-free merging** — every mutation carries a hybrid logical clock
  stamp; peers merge with last-writer-wins semantics and newcomers receive a
  chunked workspace snapshot.
- 🌗 **Light & dark themes** — calm, zen-inspired design, follows system
  preference by default.

## How it works

```
┌────────────┐   WebSocket (presence, signaling, relay fallback)   ┌──────────────────┐
│  Browser A │◄───────────────────────────────────────────────────►│ Durable Object   │
│            │                                                     │  NodeZenRoom     │
│  Monaco    │        WebRTC DataChannels (full mesh)              └──────────────────┘
│  ZenFS/IDB │◄─────────────── fs-ops · chat · presence · runs ──────────────┐
│  Sandbox ⇄ │                                                               │
└────────────┘                                                     ┌────────────┐
                                                                   │ Browser B  │
                                                                   │ (same room)│
                                                                   └────────────┘
```

- **Storage** lives in each participant's browser (IndexedDB via ZenFS).
  Cloudflare never stores workspace content.
- **Signaling**: peers connect to a Durable Object per room
  (`/rt/<roomId>`), which tracks presence and relays WebRTC
  offer/answer/ICE payloads.
- **Sync**: file mutations are replicated as CRDT-ish ops with
  hybrid-logical-clock stamps; chat history merges as a union; new peers
  pull a full snapshot from the lowest-id existing peer.
- **Runs**: the sandbox streams console output back to the page, which
  rebroadcasts it to the room — everyone watches the run live. Files your
  code writes appear in the tree for every peer.
- **NAT traversal**: STUN by default (Cloudflare + Google). Optionally set
  `TURN_KEY_ID` / `TURN_API_TOKEN` secrets (Cloudflare Realtime TURN key) and
  `/api/turn` will vend short-lived TURN credentials for symmetric NATs.

## The sandbox

| Area | Details |
| --- | --- |
| Modules | CommonJS + ESM syntax (transpiled), relative imports, `.ts/.tsx/.js/.jsx/.json` |
| Built-ins | `fs` `fs/promises` `path` `os` `process` `events` `buffer` `util` `crypto` `assert` `querystring` `url` `timers` `timers/promises` `string_decoder` `perf_hooks` `async_hooks` |
| Globals | `Buffer`, `process`, `console` (captured), `fetch`, Web Crypto, timers |
| Lifecycle | exits when the event loop drains (tracked timers + fetch), or via `process.exit()`; **Stop** terminates the worker |
| Not available | npm packages, `http`/`net`/`child_process`/`worker_threads`, synchronous hash algos other than sha256 |

## Development

```sh
npm install
npm run dev        # http://localhost:3000 (workerd via @cloudflare/vite-plugin)
npm run build      # production build (Cloudflare Build Output)
npm run deploy     # build + stage + deploy with wrangler
```

Requirements: Node.js ≥ 22.18 and `npx wrangler login` (or
`CLOUDFLARE_API_TOKEN`).

Optional: copy `.dev.vars.example` to `.dev.vars` and add your Cloudflare
Realtime TURN key so `/api/turn` vends short-lived TURN credentials (peers
behind symmetric NATs connect through Cloudflare's relay; everyone else uses
STUN and direct P2P).

### How deployment works

The app is built by Vite (vinext + `@cloudflare/vite-plugin`), which reads
`cloudflare.config.ts` and writes the Cloudflare **Build Output** to
`.cloudflare/output/`. Deployment runs through **wrangler**:

1. `vite build` — builds the app and the Worker bundle.
2. `node scripts/prepare-deploy.mjs` — stages the Build Output under
   `.deploy/` (wrangler refuses to deploy while `.cloudflare/output` exists).
3. `wrangler deploy` — uploads every module from the staged bundle
   (`no_bundle` + `find_additional_modules` + `preserve_file_names`, since the
   vinext Worker resolves chunks with runtime dynamic imports), the static
   assets, the `NodeZenRoom` Durable Object (SQLite storage), and the
   `nodezen.manalejandro.com` custom domain.

Secrets (`TURN_KEY_ID`, `TURN_API_TOKEN`) are uploaded with
`wrangler deploy --secrets-file <file>` or `npx wrangler secret put <NAME>`,
and are inherited by later deploys. Keep `cloudflare.config.ts` and
`wrangler.jsonc` in sync when changing bindings or routes.

> **Bundle size note:** Monaco, ZenFS and the sandbox runtime are
> browser-only. `vite.config.ts` stubs them in the SSR build, which keeps the
> deployed Worker at ~330 KB gzipped instead of ~6 MB.

### Project layout

```
app/                    # vinext App Router pages (landing, /r/[roomId], /api/turn)
components/             # React UI (workspace IDE shell, landing, primitives)
lib/
  protocol.ts           # wire protocol: messages, HLC clock, chunking
  store.ts              # observable UI store (useSyncExternalStore)
  monaco.ts             # Monaco bootstrap, themes, TS language config
  identity.ts           # profile / theme / recent rooms persistence
  net/transport.ts      # DO WebSocket + WebRTC mesh + relay fallback
  net/session.ts        # orchestration: sync, chat, presence, runs
  workspace/fs.ts       # ZenFS on IndexedDB, LWW metadata, snapshots
runtime/                # the browser Node.js runtime (runs in a Web Worker)
  sandbox.worker.ts     # per-run sandbox bootstrap + auto-exit tracking
  loader.ts             # CJS/ESM module loader with sucrase transpile
  builtins.ts           # fs/path/os/process/crypto/... shims
worker/                 # Cloudflare Worker
  index.ts              # entrypoint: /rt/* → Durable Object, else vinext
  room.ts               # NodeZenRoom DO: presence, signaling, relay
assets/nodezen.d.ts     # ambient types shown in the editor (not app code)
scripts/prepare-deploy.mjs  # stages Build Output for `wrangler deploy`
cloudflare.config.ts    # typed worker config consumed by the Vite build
wrangler.jsonc          # deployment config consumed by `wrangler deploy`
```

## Deployment

The Worker publishes the custom domain `nodezen.manalejandro.com`, the
`NodeZenRoom` SQLite-backed Durable Object, and runs with observability
disabled. Deploy with:

```sh
npm run deploy
```

## Roadmap ideas

- npm-style package installation from esm.sh / jsDelivr into the sandbox
- Shared follow-mode and code reviews
- OPFS export / import of workspaces (.zip)

## License

MIT © Manuel Alejandro — see [LICENSE](./LICENSE).
