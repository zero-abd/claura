import { defineConfig } from "vite";

// base "./" keeps every asset URL relative, so the built site works from any path.
export default defineConfig({
  base: "./",
  server: { port: 4318, strictPort: true },
  preview: { port: 4318, strictPort: true },
});
