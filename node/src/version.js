import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// package.json is the sole authored version authority. Resolve it two levels
// above this module (node/src or, after esbuild, node/dist).
const packageJsonPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "package.json",
);

/** Release version derived from package.json. */
export const version = JSON.parse(readFileSync(packageJsonPath, "utf8")).version;
