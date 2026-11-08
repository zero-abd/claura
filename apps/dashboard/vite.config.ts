import { defineConfig } from "vite";

// Static assets (logo, favicons, the optional 3D facility module) live in public/ and are served from "/".
// The Cradle mark's single source is public/logo.svg: src/logo.ts inlines it at build time.
export default defineConfig({
  server: { port: 4317, strictPort: true, host: "127.0.0.1" },
  preview: { port: 4317, strictPort: true, host: "127.0.0.1" },
});
