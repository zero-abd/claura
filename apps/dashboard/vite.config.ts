import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

// /logo.svg (repo root) is the single source of the mark. The UI inlines it at
// build time (src/logo.ts); this plugin also serves and emits it as the favicon,
// so swapping the file swaps the mark, the favicon and the header in one go.
const logoAsFavicon = (): Plugin => {
  const file = resolve(process.cwd(), "logo.svg");
  return {
    name: "logo-as-favicon",
    configureServer(server) {
      server.middlewares.use("/favicon.svg", (_req, res) => {
        res.setHeader("Content-Type", "image/svg+xml");
        res.setHeader("Cache-Control", "no-store");
        res.end(readFileSync(file));
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "favicon.svg", source: readFileSync(file) });
    },
  };
};

export default defineConfig({
  plugins: [logoAsFavicon()],
  server: { port: 4317, strictPort: true },
  preview: { port: 4317, strictPort: true },
});
