// Does the demo have the files it will ask for?
//
// It did not, and nothing said so. The bundler picks sql.js's browser build,
// that build fetches `sql-wasm-browser.wasm`, and the build script was
// copying `sql-wasm.wasm` — the name the Node build uses. Everything
// compiled, the deploy went green, the button said "the demo did not load"
// and left it there.
//
// A type checker cannot see a filename a WebAssembly loader will construct at
// runtime. So it is read out of the built bundle and checked against what is
// on disk.
//
//   node scripts/check-demo-assets.ts     (run by `npm run build`)

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));

if (!existsSync(dist)) {
  console.error("dist/ is not there — build first");
  process.exit(1);
}

/** Every .wasm the shipped JavaScript names. */
const wanted = new Set<string>();

function scan(dir: string) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}${entry.name}`;
    if (entry.isDirectory()) {
      scan(`${path}/`);
      continue;
    }
    if (!entry.name.endsWith(".js")) continue;

    for (const [, name] of readFileSync(path, "utf8").matchAll(/["'`]([\w.-]+\.wasm)["'`]/g)) {
      wanted.add(name!);
    }
  }
}

scan(dist);

const missing = [...wanted].filter((name) => !existsSync(`${dist}${name}`));

if (missing.length > 0) {
  console.error(`the bundle asks for ${missing.join(", ")}, and dist/ does not have it`);
  process.exit(1);
}

// Nothing named at all is its own kind of wrong: it means the demo chunk did
// not make it into the build.
if (wanted.size === 0) {
  console.error("no .wasm is named anywhere in dist/ — did the demo chunk build?");
  process.exit(1);
}

console.log(`demo assets: ${[...wanted].sort().join(", ")} — all present`);
