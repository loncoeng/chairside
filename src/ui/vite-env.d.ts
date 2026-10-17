/// <reference types="vite/client" />

// Types `import "./style.css"`; TypeScript 7 rejects it otherwise (TS2882).
// Referenced here, not in tsconfig `types`, so Vite's browser types stay out
// of src/db and scripts (Worker and Node).
