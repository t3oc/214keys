import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getRadicalSfxDownload, getRadicalSfxRef, radicalSfxSourceUrl } from "../js/radicalSfx.js";
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
  const body = Buffer.from(bytes);
  if (!isValidOgg(body)) return null;
  return body;
}

function isValidOgg(body) {
  return body.length >= 4 && body.toString("ascii", 0, 4) === "OggS";
}

async function downloadWithFallback(id) {
  const tried = new Set();
  /** @type {{ url: string, pack?: string, file?: string }[]} */
  const candidates = [];

  const primary = getRadicalSfxDownload(id);
  if (primary.kind === "external") {
    candidates.push({ url: primary.url });
  } else {
    candidates.push({
      url: sourceUrl(primary.pack, primary.file),
      pack: primary.pack,
      file: primary.file,
    });
  }

  const { pack, file } = getRadicalSfxRef(id);
  candidates.push({ url: sourceUrl(pack, file), pack, file });

  for (const fb of FALLBACK) {
    candidates.push({ url: sourceUrl(fb[0], fb[1]), pack: fb[0], file: fb[1] });
  }

  for (const candidate of candidates) {
    const key = candidate.pack ? `${candidate.pack}/${candidate.file}` : candidate.url;
    if (tried.has(key)) continue;
    tried.add(key);

    try {
      const body = await download(candidate.url);
      if (!body) {
        console.warn(`  miss ${padId(id)}: ${candidate.url}`);
        continue;
      }
      return { ...candidate, body };
    } catch (err) {
      console.warn(`  fail ${padId(id)}: ${candidate.url} (${err.message})`);
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
      const existing = readFileSync(outPath);
      if (isValidOgg(existing)) {
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
      console.log(`[${id}/214] replace invalid ${padId(id)}.ogg (${emoji})`);
    } else {
      console.log(`[${id}/214] fetch ${padId(id)}.ogg (${emoji})`);
    }
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
