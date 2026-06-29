import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getRadicalSfxRef, radicalSfxSourceUrl } from "../js/radicalSfx.js";
import { getRadicalEmoji } from "../js/radicalEmoji.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "audio", "sfx");

const FALLBACK = [
  ["Interface Sounds", "pluck_001.ogg"],
  ["Interface Sounds", "confirmation_001.ogg"],
  ["Interface Sounds", "click_001.ogg"],
];

const KENNEY = "https://gamesounds.xyz/Kenney%27s%20Sound%20Pack";

function padId(id) {
  return String(id).padStart(3, "0");
}

function sourceUrl(pack, file) {
  return `${KENNEY}/${encodeURI(pack)}/${encodeURIComponent(file)}`;
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  const bytes = await res.arrayBuffer();
  if (!bytes.byteLength) return null;
  return Buffer.from(bytes);
}

async function downloadWithFallback(id) {
  const primary = getRadicalSfxRef(id);
  const tried = new Set();
  const candidates = [
    primary,
    ...FALLBACK.map(([pack, file]) => ({ pack, file })),
  ];

  for (const { pack, file } of candidates) {
    const key = `${pack}/${file}`;
    if (tried.has(key)) continue;
    tried.add(key);

    const url = sourceUrl(pack, file);
    try {
      const body = await download(url);
      if (!body) {
        console.warn(`  miss ${padId(id)}: ${url}`);
        continue;
      }
      return { pack, file, url, body };
    } catch (err) {
      console.warn(`  fail ${padId(id)}: ${url} (${err.message})`);
    }
  }

  return null;
}

async function main() {
  mkdirSync(outDir, { recursive: true });

  const manifest = [];
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (let id = 1; id <= 214; id++) {
    const outPath = join(outDir, `${padId(id)}.ogg`);
    const emoji = getRadicalEmoji(id);
    const expectedUrl = radicalSfxSourceUrl(id);

    if (existsSync(outPath)) {
      skipped++;
      manifest.push({
        id,
        emoji,
        file: `${padId(id)}.ogg`,
        source: expectedUrl,
        skipped: true,
      });
      console.log(`[${id}/214] skip ${padId(id)}.ogg (${emoji})`);
      continue;
    }

    console.log(`[${id}/214] fetch ${padId(id)}.ogg (${emoji})`);
    const result = await downloadWithFallback(id);
    if (!result) {
      failed++;
      manifest.push({ id, emoji, error: "download failed", source: expectedUrl });
      continue;
    }

    await writeFileSync(outPath, result.body);
    created++;
    manifest.push({
      id,
      emoji,
      file: `${padId(id)}.ogg`,
      pack: result.pack,
      kenneyFile: result.file,
      source: result.url,
    });
  }

  writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`\nDone: ${created} created, ${skipped} skipped, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
