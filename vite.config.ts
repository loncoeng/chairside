import { defineConfig } from "vite";

// Single-page app. The same UI runs against Workers or in-browser SQLite (the demo).
export default defineConfig({
  esbuild: { jsx: "automatic", jsxImportSource: "preact" },
  resolve: { alias: { react: "preact/compat", "react-dom": "preact/compat" } },
  build: { outDir: "dist", emptyOutDir: true },
});
