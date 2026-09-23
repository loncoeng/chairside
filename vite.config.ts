import { defineConfig } from "vite";

// 画面は SPA として作る。データ層だけを差し替えれば、同じ UI が
// Workers 経由でも、ブラウザ内の SQLite でも動く。デモのために
// 画面を書き直さないための構成。
export default defineConfig({
  esbuild: { jsx: "automatic", jsxImportSource: "preact" },
  resolve: { alias: { react: "preact/compat", "react-dom": "preact/compat" } },
  build: { outDir: "dist", emptyOutDir: true },
});
