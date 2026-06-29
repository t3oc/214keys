import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegStatic from "ffmpeg-static";
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

function isValidOgg(body) {
  return body.length >= 4 && body.toString("ascii", 0, 4) === "OggS";
}

function isValidMp3(body) {
  if (body.length < 4) return false;
  if (body[0] === 0x49 && body[1] === 0x44 && body[2] === 0x33) return true;
  return body[0] === 0xff && (body[1] & 0xe0) === 0xe0;
}

function oggToMp3(oggBuffer) {
  if (!ffmpegStatic) {
    console.error("ffmpeg-static binary not found");
    return null;
  }

  const dir = mkdtempSync(join(tmpdir(), "214keys-sfx-"));
  const oggPath = join(dir, "in.ogg");
  const mp3Path = join(dir, "out.mp3");

  try {
    writeFileSync(oggPath, oggBuffer);
    const result = spawnSync(
      ffmpegStatic,
      ["-y", "-i", oggPath, "-codec:a", "libmp3lame", "-qscale:a", "4", mp3Path],
      { stdio: "pipe" },
    );
    if (result.status !== 0) return null;
    const mp3 = readFileSync(mp3Path);
    return isValidMp3(mp3) ? mp3 : null;
  } catch {
    return null;
  } finally {
    for (const file of [oggPath, mp3Path]) {
      try {
        unlinkSync(file);
      } catch {
        /* ignore */
      }
    }
  }
}

async function downloadOgg(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  const bytes = await res.arrayBuffer();
  if (!bytes.byteLength) return null;
  const body = Buffer.from(bytes);
  if (!isValidOgg(body)) return null;
  return body;
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
      const body = await downloadOgg(candidate.url);
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

function loadOggForId(id) {
  const oggPath = join(outDir, `${padId(id)}.ogg`);
  if (!existsSync(oggPath)) return null;
  const body = readFileSync(oggPath);
  return isValidOgg(body) ? body : null;
}

function removeLegacyOggFiles() {
  for (const name of readdirSync(outDir)) {
    if (name.endsWith(".ogg")) {
      unlinkSync(join(outDir, name));
    }
  }
}

async function main() {
  mkdirSync(outDir, { recursive: true });

  const manifest = [];
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (let id = 1; id <= 214; id++) {
    const outPath = join(outDir, `${padId(id)}.mp3`);
    const emoji = getRadicalEmoji(id);
    const expectedUrl = radicalSfxSourceUrl(id);

    if (existsSync(outPath)) {
      const existing = readFileSync(outPath);
      if (isValidMp3(existing)) {
        skipped++;
        manifest.push({
          id,
          emoji,
          file: `${padId(id)}.mp3`,
          source: expectedUrl,
          skipped: true,
        });
        console.log(`[${id}/214] skip ${padId(id)}.mp3 (${emoji})`);
        continue;
      }
      console.log(`[${id}/214] replace invalid ${padId(id)}.mp3 (${emoji})`);
    } else {
      console.log(`[${id}/214] build ${padId(id)}.mp3 (${emoji})`);
    }

    let ogg = loadOggForId(id);
    let source = expectedUrl;
    let pack;
    let kenneyFile;

    if (!ogg) {
      const result = await downloadWithFallback(id);
      if (!result) {
        failed++;
        manifest.push({ id, emoji, error: "download failed", source: expectedUrl });
        continue;
      }
      ogg = result.body;
      source = result.url;
      pack = result.pack;
      kenneyFile = result.file;
    }

    const mp3 = oggToMp3(ogg);
    if (!mp3) {
      failed++;
      manifest.push({ id, emoji, error: "mp3 conversion failed", source });
      continue;
    }

    writeFileSync(outPath, mp3);
    created++;
    manifest.push({
      id,
      emoji,
      file: `${padId(id)}.mp3`,
      pack,
      kenneyFile,
      source,
    });
  }

  removeLegacyOggFiles();
  writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`\nDone: ${created} created, ${skipped} skipped, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
