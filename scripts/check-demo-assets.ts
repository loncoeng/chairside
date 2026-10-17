// Checks that every .wasm file named in the built bundle exists in dist/.
// The loader builds the filename at runtime, so the type checker cannot catch a mismatch.
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

// No .wasm named at all means the demo chunk is missing from the build.
if (wanted.size === 0) {
  console.error("no .wasm is named anywhere in dist/ — did the demo chunk build?");
  process.exit(1);
}

console.log(`demo assets: ${[...wanted].sort().join(", ")} — all present`);
