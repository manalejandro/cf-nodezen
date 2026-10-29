import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import { imagesOptimizer } from "@vinext/cloudflare/images/images-optimizer";

const clientOnlyStub = fileURLToPath(new URL("./lib/ssr-client-stub.ts", import.meta.url));
const zenfsStub = fileURLToPath(new URL("./lib/zenfs-ssr-stub.ts", import.meta.url));

/**
 * Monaco, the code sandbox and ZenFS only ever run in the browser. Stubbing
 * them in the SSR build keeps ~20 MB of editor/runtime chunks out of the
 * deployed Worker bundle, and avoids ZenFS's module-scope initialization
 * which workerd forbids in global scope. The server graph reaches these
 * modules exclusively through lazy imports that never execute during SSR.
 */
function clientOnlyInSsr(): Plugin {
	return {
		name: "nodezen:client-only-in-ssr",
		enforce: "pre",
		resolveId(source) {
			if (this.environment.name !== "ssr") return null;
			const bare = source.split("?")[0]!;
			if (bare === "monaco-editor" || bare.startsWith("monaco-editor/")) return clientOnlyStub;
			if (bare.endsWith("runtime/sandbox.worker.ts")) return clientOnlyStub;
			if (bare === "@zenfs/core" || bare.startsWith("@zenfs/core/")) return zenfsStub;
			if (bare === "@zenfs/dom" || bare.startsWith("@zenfs/dom/")) return zenfsStub;
			return null;
		},
	};
}

export default defineConfig({
  plugins: [
    clientOnlyInSsr(),
    vinext({
      images: { optimizer: imagesOptimizer() },
    }),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
  optimizeDeps: {
    // Pre-bundle the heavy runtime dependencies so lazy discovery does not
    // force full-page reloads in development.
    include: [
      "monaco-editor",
      "monaco-editor/editor/editor.worker?worker",
      "monaco-editor/language/typescript/ts.worker?worker",
      "monaco-editor/language/json/json.worker?worker",
      "monaco-editor/language/css/css.worker?worker",
      "monaco-editor/language/html/html.worker?worker",
      "sucrase",
      "@zenfs/core",
      "@zenfs/dom",
      "events",
      "buffer",
    ],
  },
});
