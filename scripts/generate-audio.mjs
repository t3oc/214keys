import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

const VOICES = {
  jp: "ja-JP-NanamiNeural",
  cn: "zh-CN-XiaoxiaoNeural",
};

const DELAY_MS = 150;
const FORMAT = OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const radicals = JSON.parse(readFileSync(join(root, "data", "radicals.json"), "utf8"));
const audioRoot = join(root, "audio");

function padId(id) {
  return String(id).padStart(3, "0");
}

function outPath(lang, id) {
  return join(audioRoot, lang, `${padId(id)}.mp3`);
}

function streamToFile(stream, path) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(path);
    stream.pipe(file);
    file.on("finish", resolve);
    file.on("error", reject);
    stream.on("error", reject);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function speechText(item, lang) {
  if (lang === "jp") return item.jp.trim();
  return item.cn.trim();
}

async function main() {
  mkdirSync(join(audioRoot, "jp"), { recursive: true });
  mkdirSync(join(audioRoot, "cn"), { recursive: true });

  const ttsByLang = {};
  for (const lang of ["jp", "cn"]) {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(VOICES[lang], FORMAT);
    ttsByLang[lang] = tts;
  }

  const tasks = [];
  for (const item of radicals) {
    for (const lang of ["jp", "cn"]) {
      tasks.push({ item, lang });
    }
  }

  let created = 0;
  let skipped = 0;

  for (let i = 0; i < tasks.length; i++) {
    const { item, lang } = tasks[i];
    const path = outPath(lang, item.id);
    const spoken = speechText(item, lang);

    if (!spoken) {
      console.log(`[${i + 1}/${tasks.length}] skip empty ${lang} #${item.id}`);
      continue;
    }

    if (existsSync(path)) {
      skipped++;
      console.log(`[${i + 1}/${tasks.length}] skip ${lang}/${padId(item.id)} (${spoken})`);
      continue;
    }

    const { audioStream } = ttsByLang[lang].toStream(spoken);
    await streamToFile(audioStream, path);
    created++;
    console.log(`[${i + 1}/${tasks.length}] ok ${lang}/${padId(item.id)} (${spoken})`);

    if (i < tasks.length - 1) await sleep(DELAY_MS);
  }

  const groups = {};
  for (const item of radicals) {
    const key = String(item.strokes);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item.id);
  }

  const manifest = {
    voices: VOICES,
    files: {
      jp: "audio/jp/{id}.mp3",
      cn: "audio/cn/{id}.mp3",
    },
    groups,
  };

  writeFileSync(join(audioRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`\nDone: ${created} created, ${skipped} skipped, ${tasks.length} total`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
