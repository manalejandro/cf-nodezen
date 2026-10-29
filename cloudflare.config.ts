import { bindings, defineConfig, defineWorker, exports as cfExports } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "cf-nodezen",
    entrypoint: "./worker/index.ts",
    compatibilityDate: "2026-10-28",
    compatibilityFlags: ["nodejs_compat"],
    domains: ["nodezen.domain.com"],
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    observability: {
      enabled: false,
    },
    exports: {
      NodeZenRoom: cfExports.durableObject({ storage: "sqlite" }),
    },
    env: {
      ASSETS: bindings.assets(),
      IMAGES: bindings.images(),
      NODEZEN_ROOM: bindings.durableObject({
        worker: "cf-nodezen",
        exportName: "NodeZenRoom",
      }),
      // Optional: Cloudflare TURN credentials for WebRTC NAT traversal.
      // Create a TURN key in the dashboard (Realtime > TURN) and set both
      // secrets with `npx wrangler secret put <NAME> --name cf-nodezen`.
      // When unset, NodeZen falls back to STUN-only ICE configuration.
      TURN_KEY_ID: bindings.secret(),
      TURN_API_TOKEN: bindings.secret(),
    },
  }),
});
