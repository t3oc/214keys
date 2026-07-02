import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const betaRoot = join(root, "beta");
const COPY = ["index.html", "css", "js", "data"];

if (existsSync(betaRoot)) rmSync(betaRoot, { recursive: true, force: true });
mkdirSync(betaRoot, { recursive: true });

for (const name of COPY) {
  const src = join(root, name);
  if (!existsSync(src)) continue;
  cpSync(src, join(betaRoot, name), { recursive: true });
}

console.log("Synced beta/ from main (audio stays at /214keys/audio/)");
