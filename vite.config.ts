import { defineConfig } from "vite";

// The screen is a single-page app. Swap the data layer and the same interface
// runs against Workers or against SQLite inside the browser — which is what
// keeps the demo from needing a second version of the screen.
export default defineConfig({
  esbuild: { jsx: "automatic", jsxImportSource: "preact" },
  resolve: { alias: { react: "preact/compat", "react-dom": "preact/compat" } },
  build: { outDir: "dist", emptyOutDir: true },
});
