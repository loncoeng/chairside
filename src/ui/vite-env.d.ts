/// <reference types="vite/client" />

// Vite's own ambient declarations, which is where `import "./style.css"` gets
// a type from. Without them TypeScript 7 refuses the import outright
// (TS2882); TypeScript 5 let a side-effect import pass undeclared.
//
// It is referenced here rather than added to `types` in tsconfig.json,
// because that array applies to src/db and scripts as well — and those run in
// a Worker and in Node, where none of Vite's browser declarations are true.
// A triple-slash reference is scoped to the files that include it, so this
// one reaches the UI and stops there.
