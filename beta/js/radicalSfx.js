import { getRadicalEmoji } from "./radicalEmoji.js";
import { appAssetUrl } from "./appBase.js";

/** CC0 — Kenney (kenney.nl), via gamesounds.xyz mirror */
const KENNEY = "https://gamesounds.xyz/Kenney%27s%20Sound%20Pack";

/** @type {Record<string, [pack: string, file: string][]>} */
export const emojiSfxPools = {
  "1️⃣": [["Interface Sounds", "tick_001.ogg"], ["Interface Sounds", "tick_004.ogg"]],
  "2️⃣": [["Interface Sounds", "tick_001.ogg"], ["Interface Sounds", "select_001.ogg"]],
  "8️⃣": [["Interface Sounds", "select_003.ogg"], ["Interface Sounds", "select_004.ogg"]],
  "🔟": [["Interface Sounds", "confirmation_001.ogg"], ["Interface Sounds", "confirmation_002.ogg"]],
  "📏": [["Interface Sounds", "select_001.ogg"], ["Interface Sounds", "select_003.ogg"]],
  "📐": [["Interface Sounds", "select_004.ogg"], ["Interface Sounds", "select_005.ogg"]],
  "🔸": [["Interface Sounds", "switch_001.ogg"], ["Interface Sounds", "switch_003.ogg"]],
  "✏️": [["Interface Sounds", "click_002.ogg"], ["Interface Sounds", "click_003.ogg"]],
  "〰️": [["Interface Sounds", "toggle_001.ogg"], ["Interface Sounds", "toggle_003.ogg"]],
  "🪝": [["RPG Audio", "drawKnife1.ogg"], ["RPG Audio", "drawKnife2.ogg"]],
  "🫕": [["RPG Audio", "metalPot1.ogg"], ["RPG Audio", "metalPot2.ogg"]],
  "🧑": [["Impact Sounds", "impactSoft_medium_000.ogg"], ["Impact Sounds", "impactSoft_medium_001.ogg"]],
  "👩": [["Impact Sounds", "impactSoft_light_000.ogg"], ["Impact Sounds", "impactSoft_light_001.ogg"]],
  "👶": [["Impact Sounds", "impactSoft_light_002.ogg"], ["Interface Sounds", "bong_001.ogg"]],
  "👨": [["Impact Sounds", "impactSoft_medium_002.ogg"], ["Impact Sounds", "impactSoft_medium_003.ogg"]],
  "👴": [["RPG Audio", "creak1.ogg"], ["RPG Audio", "creak2.ogg"]],
  "👨‍👩‍👧": [["Interface Sounds", "confirmation_003.ogg"], ["Interface Sounds", "confirmation_004.ogg"]],
  "🧑‍💼": [["RPG Audio", "clothBelt.ogg"], ["RPG Audio", "clothBelt2.ogg"]],
  "🦵": [["Impact Sounds", "footstep_concrete_000.ogg"], ["Impact Sounds", "footstep_concrete_001.ogg"]],
  "🦶": [["Impact Sounds", "footstep_grass_000.ogg"], ["Impact Sounds", "footstep_grass_001.ogg"]],
  "➡️": [["Interface Sounds", "scroll_001.ogg"], ["Interface Sounds", "back_001.ogg"]],
  "↔️": [["Interface Sounds", "back_001.ogg"], ["Interface Sounds", "back_002.ogg"]],
  "🔲": [["Interface Sounds", "maximize_001.ogg"], ["Interface Sounds", "minimize_001.ogg"]],
  "⬜": [["Interface Sounds", "glass_001.ogg"], ["Interface Sounds", "glass_002.ogg"]],
  "🎩": [["RPG Audio", "cloth1.ogg"], ["RPG Audio", "cloth2.ogg"]],
  "🧊": [["Foley Sounds/Water", "drip2.ogg"], ["Foley Sounds/Water", "drip3.ogg"]],
  "🪑": [["Impact Sounds", "impactWood_light_000.ogg"], ["Impact Sounds", "impactWood_light_001.ogg"]],
  "📥": [["Interface Sounds", "drop_001.ogg"], ["Interface Sounds", "drop_002.ogg"]],
  "🔪": [["RPG Audio", "knifeSlice.ogg"], ["RPG Audio", "knifeSlice2.ogg"]],
  "💪": [["Impact Sounds", "impactPunch_medium_000.ogg"], ["Impact Sounds", "impactPunch_medium_001.ogg"]],
  "📦": [["RPG Audio", "bookPlace1.ogg"], ["RPG Audio", "bookPlace2.ogg"]],
  "🥄": [["Impact Sounds", "impactTin_medium_000.ogg"], ["Impact Sounds", "impactTin_medium_001.ogg"]],
  "🗃️": [["RPG Audio", "bookClose.ogg"], ["RPG Audio", "bookOpen.ogg"]],
  "🙈": [["Interface Sounds", "error_001.ogg"], ["Interface Sounds", "error_002.ogg"]],
  "🔮": [["Sci-Fi Sounds", "forceField_000.ogg"], ["Sci-Fi Sounds", "forceField_001.ogg"]],
  "🔏": [["RPG Audio", "metalLatch.ogg"], ["RPG Audio", "metalClick.ogg"]],
  "⛰️": [["Foley Sounds/Rocks", "rockHit1.ogg"], ["Foley Sounds/Rocks", "stoneHit1.ogg"]],
  "🔺": [["Interface Sounds", "switch_003.ogg"], ["Interface Sounds", "switch_001.ogg"]],
  "✋": [["Impact Sounds", "impactSoft_heavy_000.ogg"], ["Impact Sounds", "impactSoft_heavy_001.ogg"]],
  "👄": [["Interface Sounds", "click_003.ogg"], ["Interface Sounds", "click_004.ogg"]],
  "👅": [["Interface Sounds", "click_005.ogg"], ["Interface Sounds", "bong_001.ogg"]],
  "🌍": [["Impact Sounds", "impactGeneric_light_000.ogg"], ["Impact Sounds", "impactGeneric_light_001.ogg"]],
  "⚔️": [["Foley Sounds/Swords", "sword1.ogg"], ["Foley Sounds/Swords", "sword2.ogg"]],
  "🍂": [["Impact Sounds", "footstep_grass_002.ogg"], ["Impact Sounds", "footstep_grass_003.ogg"]],
  "🐌": [["Sci-Fi Sounds", "slime_000.ogg"], ["Impact Sounds", "impactSoft_light_002.ogg"]],
  "🌆": [["RPG Audio", "creak3.ogg"], ["Sci-Fi Sounds", "doorClose_000.ogg"]],
  "🙆": [["Interface Sounds", "confirmation_001.ogg"], ["Interface Sounds", "pluck_001.ogg"]],
  "🏠": [["RPG Audio", "doorOpen_1.ogg"], ["RPG Audio", "doorClose_1.ogg"]],
  "🏡": [["RPG Audio", "doorOpen_2.ogg"], ["RPG Audio", "doorClose_2.ogg"]],
  "🏘️": [["RPG Audio", "doorClose_3.ogg"], ["RPG Audio", "doorClose_4.ogg"]],
  "🏚️": [["RPG Audio", "creak1.ogg"], ["RPG Audio", "creak2.ogg"]],
  "🤏": [["Interface Sounds", "click_001.ogg"], ["Interface Sounds", "click_002.ogg"]],
  "🩼": [["Impact Sounds", "impactWood_medium_000.ogg"], ["Impact Sounds", "impactWood_medium_001.ogg"]],
  "💀": [["Impact Sounds", "impactBell_heavy_000.ogg"], ["Impact Sounds", "impactBell_heavy_001.ogg"]],
  "🌱": [["Impact Sounds", "footstep_grass_004.ogg"], ["Foley Sounds/Water", "drip1.ogg"]],
  "🌊": [["Foley Sounds/Water", "sinkWater1.ogg"], ["Foley Sounds/Water", "sinkDrain1.ogg"]],
  "🔧": [["RPG Audio", "metalClick.ogg"], ["Impact Sounds", "impactMetal_light_000.ogg"]],
  "🪞": [["Interface Sounds", "glass_003.ogg"], ["Interface Sounds", "glass_004.ogg"]],
  "🧣": [["RPG Audio", "cloth3.ogg"], ["RPG Audio", "cloth4.ogg"]],
  "☀️": [["Interface Sounds", "confirmation_002.ogg"], ["Digital Audio", "powerUp1.ogg"]],
  "🧵": [["RPG Audio", "clothBelt.ogg"], ["RPG Audio", "dropLeather.ogg"]],
  "👣": [["Impact Sounds", "footstep_wood_000.ogg"], ["Impact Sounds", "footstep_wood_001.ogg"]],
  "🙌": [["Interface Sounds", "confirmation_003.ogg"], ["Interface Sounds", "confirmation_004.ogg"]],
  "🏹": [["Foley Sounds/Woosh", "woosh1.ogg"], ["Foley Sounds/Woosh", "woosh2.ogg"]],
  "🐽": [["Impact Sounds", "impactSoft_medium_004.ogg"], ["Sci-Fi Sounds", "slime_000.ogg"]],
  "💇": [["RPG Audio", "drawKnife3.ogg"], ["RPG Audio", "chop.ogg"]],
  "🚶": [["RPG Audio", "footstep00.ogg"], ["RPG Audio", "footstep01.ogg"]],
  "❤️": [["Interface Sounds", "bong_001.ogg"], ["Interface Sounds", "pluck_002.ogg"]],
  "🚪": [["RPG Audio", "doorOpen_1.ogg"], ["Sci-Fi Sounds", "doorOpen_000.ogg"]],
  "🌿": [["Impact Sounds", "footstep_grass_001.ogg"], ["Impact Sounds", "footstep_grass_002.ogg"]],
  "🔨": [["Impact Sounds", "impactMining_000.ogg"], ["Impact Sounds", "impactMining_001.ogg"]],
  "📜": [["RPG Audio", "bookFlip1.ogg"], ["RPG Audio", "bookFlip2.ogg"]],
  "🥤": [["Impact Sounds", "impactGlass_light_000.ogg"], ["Impact Sounds", "impactGlass_light_001.ogg"]],
  "🪓": [["RPG Audio", "chop.ogg"], ["Foley Sounds/Swords", "swordMetal1.ogg"]],
  "❌": [["Interface Sounds", "error_003.ogg"], ["Interface Sounds", "error_004.ogg"]],
  "💬": [["Interface Sounds", "question_001.ogg"], ["Interface Sounds", "question_002.ogg"]],
  "🌙": [["Impact Sounds", "impactBell_heavy_003.ogg"], ["Interface Sounds", "bong_001.ogg"]],
  "🌳": [["Impact Sounds", "impactWood_heavy_000.ogg"], ["Impact Sounds", "impactWood_heavy_001.ogg"]],
  "🥱": [["Interface Sounds", "minimize_002.ogg"], ["Interface Sounds", "minimize_003.ogg"]],
  "🛑": [["Interface Sounds", "error_005.ogg"], ["Impact Sounds", "impactBell_heavy_002.ogg"]],
  "🔱": [["Foley Sounds/Swords", "swordMetal2.ogg"], ["Foley Sounds/Swords", "swordMetal3.ogg"]],
  "🚫": [["Interface Sounds", "error_006.ogg"], ["Interface Sounds", "error_007.ogg"]],
  "⚖️": [["Impact Sounds", "impactPlate_medium_000.ogg"], ["Impact Sounds", "impactPlate_medium_001.ogg"]],
  "🧶": [["RPG Audio", "cloth2.ogg"], ["RPG Audio", "handleSmallLeather.ogg"]],
  "💨": [["Foley Sounds/Woosh", "woosh3.ogg"], ["Foley Sounds/Woosh", "woosh4.ogg"]],
  "💧": [["Foley Sounds/Water", "sinkWater3.ogg"], ["Foley Sounds/Water", "sinkWater4.ogg"]],
  "🔥": [["Interface Sounds", "glitch_003.ogg"], ["Impact Sounds", "impactWood_light_003.ogg"]],
  "🐾": [["Impact Sounds", "footstep_concrete_002.ogg"], ["Impact Sounds", "footstep_concrete_003.ogg"]],
  "☯️": [["Interface Sounds", "toggle_001.ogg"], ["Sci-Fi Sounds", "forceField_003.ogg"]],
  "🪵": [["Impact Sounds", "impactWood_medium_002.ogg"], ["Impact Sounds", "impactWood_medium_003.ogg"]],
  "📄": [["RPG Audio", "bookFlip3.ogg"], ["RPG Audio", "bookPlace3.ogg"]],
  "🦷": [["Impact Sounds", "impactGlass_medium_000.ogg"], ["Impact Sounds", "impactGlass_medium_001.ogg"]],
  "🐮": [["Impact Sounds", "impactSoft_heavy_002.ogg"], ["Impact Sounds", "impactSoft_heavy_003.ogg"]],
  "🐕": [["Impact Sounds", "footstep_grass_003.ogg"], ["Impact Sounds", "impactSoft_light_003.ogg"]],
  "🌑": [["Sci-Fi Sounds", "lowFrequency_explosion_000.ogg"], ["Sci-Fi Sounds", "forceField_004.ogg"]],
  "💎": [["Impact Sounds", "impactGlass_heavy_000.ogg"], ["Impact Sounds", "impactGlass_heavy_001.ogg"]],
  "🍈": [["Impact Sounds", "impactSoft_light_004.ogg"], ["Interface Sounds", "drop_003.ogg"]],
  "🧱": [["Impact Sounds", "impactPlate_heavy_000.ogg"], ["Foley Sounds/Rocks", "stoneHit2.ogg"]],
  "🍬": [["Interface Sounds", "bong_001.ogg"], ["Interface Sounds", "pluck_001.ogg"]],
  "✅": [["Interface Sounds", "confirmation_001.ogg"], ["Interface Sounds", "confirmation_002.ogg"]],
  "🌾": [["Foley Sounds/Woosh", "woosh5.ogg"], ["Impact Sounds", "footstep_grass_000.ogg"]],
  "🤒": [["Interface Sounds", "error_002.ogg"], ["Sci-Fi Sounds", "slime_000.ogg"]],
  "⚪": [["Interface Sounds", "glass_005.ogg"], ["Interface Sounds", "glass_006.ogg"]],
  "🧥": [["RPG Audio", "cloth1.ogg"], ["RPG Audio", "dropLeather.ogg"]],
  "🍽️": [["Impact Sounds", "impactPlate_light_000.ogg"], ["Impact Sounds", "impactTin_medium_002.ogg"]],
  "👁️": [["Interface Sounds", "select_006.ogg"], ["Interface Sounds", "select_008.ogg"]],
  "👀": [["Interface Sounds", "select_008.ogg"], ["Interface Sounds", "tick_004.ogg"]],
  "🕳️": [["Impact Sounds", "impactMining_002.ogg"], ["Foley Sounds/Rocks", "stoneHit3.ogg"]],
  "🧍": [["RPG Audio", "footstep02.ogg"], ["RPG Audio", "footstep03.ogg"]],
  "🎋": [["Impact Sounds", "impactWood_light_002.ogg"], ["Impact Sounds", "footstep_wood_002.ogg"]],
  "🍚": [["Impact Sounds", "impactSoft_medium_001.ogg"], ["RPG Audio", "metalPot3.ogg"]],
  "🏺": [["Impact Sounds", "impactPlate_heavy_001.ogg"], ["Impact Sounds", "impactTin_medium_003.ogg"]],
  "🕸️": [["Interface Sounds", "glitch_001.ogg"], ["Interface Sounds", "glitch_002.ogg"]],
  "🐑": [["Impact Sounds", "impactSoft_heavy_004.ogg"], ["Impact Sounds", "footstep_grass_004.ogg"]],
  "🪶": [["Foley Sounds/Woosh", "woosh1.ogg"], ["Foley Sounds/Woosh", "woosh2.ogg"]],
  "🔗": [["RPG Audio", "metalLatch.ogg"], ["RPG Audio", "beltHandle1.ogg"]],
  "🚜": [["Sci-Fi Sounds", "engineCircular_000.ogg"], ["Sci-Fi Sounds", "engineCircular_001.ogg"]],
  "👂": [["Interface Sounds", "select_001.ogg"], ["Interface Sounds", "tick_001.ogg"]],
  "👃": [["Interface Sounds", "click_001.ogg"], ["Interface Sounds", "click_002.ogg"]],
  "🖌️": [["Interface Sounds", "click_004.ogg"], ["Interface Sounds", "click_005.ogg"]],
  "🥩": [["RPG Audio", "chop.ogg"], ["Impact Sounds", "impactSoft_heavy_001.ogg"]],
  "🎯": [["Interface Sounds", "select_003.ogg"], ["Foley Sounds/Swords", "hitHelmet1.ogg"]],
  "🛶": [["Foley Sounds/Water", "sinkWater3.ogg"], ["Foley Sounds/Woosh", "woosh3.ogg"]],
  "🎨": [["Interface Sounds", "pluck_001.ogg"], ["Interface Sounds", "pluck_002.ogg"]],
  "🐯": [["Impact Sounds", "impactPunch_heavy_000.ogg"], ["Foley Sounds/Swords", "hitHelmet2.ogg"]],
  "🐛": [["Sci-Fi Sounds", "slime_000.ogg"], ["Digital Audio", "zap1.ogg"]],
  "🩸": [["Impact Sounds", "impactSoft_heavy_002.ogg"], ["Foley Sounds/Water", "drip3.ogg"]],
  "👕": [["RPG Audio", "cloth3.ogg"], ["RPG Audio", "cloth4.ogg"]],
  "🌅": [["Interface Sounds", "confirmation_004.ogg"], ["Digital Audio", "powerUp2.ogg"]],
  "🦌": [["Impact Sounds", "footstep_grass_002.ogg"], ["Impact Sounds", "footstep_snow_000.ogg"]],
  "🏞️": [["Foley Sounds/Water", "sinkWater4.ogg"], ["Impact Sounds", "footstep_grass_001.ogg"]],
  "🫘": [["Impact Sounds", "impactSoft_light_001.ogg"], ["Interface Sounds", "drop_004.ogg"]],
  "🐷": [["Impact Sounds", "impactSoft_medium_003.ogg"], ["Sci-Fi Sounds", "slime_000.ogg"]],
  "🦡": [["Impact Sounds", "impactPunch_medium_002.ogg"], ["Impact Sounds", "footstep_concrete_004.ogg"]],
  "🐚": [["Interface Sounds", "glass_002.ogg"], ["Impact Sounds", "impactGlass_light_002.ogg"]],
  "🔴": [["Interface Sounds", "error_001.ogg"], ["Digital Audio", "phaserDown1.ogg"]],
  "🏃": [["RPG Audio", "footstep04.ogg"], ["RPG Audio", "footstep05.ogg"]],
  "🚗": [["Digital Audio", "twoTone1.ogg"], ["Foley Sounds/Woosh", "woosh4.ogg"]],
  "🌶️": [["Digital Audio", "phaserUp3.ogg"], ["Impact Sounds", "impactPunch_medium_000.ogg"]],
  "🐲": [["Sci-Fi Sounds", "explosionCrunch_000.ogg"], ["Sci-Fi Sounds", "laserLarge_000.ogg"]],
  "🍶": [["Impact Sounds", "impactGlass_medium_002.ogg"], ["RPG Audio", "metalPot2.ogg"]],
  "🔀": [["Interface Sounds", "switch_001.ogg"], ["Interface Sounds", "switch_003.ogg"]],
  "🪙": [["RPG Audio", "handleCoins.ogg"], ["RPG Audio", "handleCoins2.ogg"]],
  "📋": [["RPG Audio", "bookPlace2.ogg"], ["Interface Sounds", "scroll_001.ogg"]],
  "🐦": [["Foley Sounds/Woosh", "woosh2.ogg"], ["Interface Sounds", "pluck_002.ogg"]],
  "🌧️": [["Foley Sounds/Water", "drip2.ogg"], ["Foley Sounds/Water", "sinkDrain1.ogg"]],
  "💚": [["Interface Sounds", "confirmation_002.ogg"], ["Digital Audio", "powerUp3.ogg"]],
  "😊": [["Interface Sounds", "bong_001.ogg"], ["Interface Sounds", "confirmation_001.ogg"]],
  "👜": [["RPG Audio", "handleSmallLeather2.ogg"], ["RPG Audio", "dropLeather.ogg"]],
  "🧅": [["Impact Sounds", "impactSoft_light_000.ogg"], ["RPG Audio", "chop.ogg"]],
  "🔊": [["Digital Audio", "highUp.ogg"], ["Interface Sounds", "confirmation_003.ogg"]],
  "🕊️": [["Foley Sounds/Woosh", "woosh1.ogg"], ["Foley Sounds/Woosh", "woosh4.ogg"]],
  "🍱": [["Impact Sounds", "impactPlate_light_001.ogg"], ["RPG Audio", "metalPot1.ogg"]],
  "🗣️": [["Interface Sounds", "question_003.ogg"], ["Interface Sounds", "question_004.ogg"]],
  "👹": [["Sci-Fi Sounds", "explosionCrunch_001.ogg"], ["Interface Sounds", "error_006.ogg"]],
  "💐": [["Interface Sounds", "pluck_001.ogg"], ["Interface Sounds", "confirmation_004.ogg"]],
  "🐴": [["Impact Sounds", "footstep_concrete_001.ogg"], ["Impact Sounds", "impactSoft_heavy_003.ogg"]],
  "🦴": [["Impact Sounds", "impactGeneric_light_002.ogg"], ["Impact Sounds", "impactGeneric_light_003.ogg"]],
  "🗼": [["Impact Sounds", "impactBell_heavy_003.ogg"], ["Sci-Fi Sounds", "laserRetro_000.ogg"]],
  "🥊": [["Impact Sounds", "impactPunch_heavy_001.ogg"], ["Impact Sounds", "impactPunch_heavy_002.ogg"]],
  "🍷": [["Impact Sounds", "impactGlass_heavy_002.ogg"], ["Impact Sounds", "impactGlass_medium_003.ogg"]],
  "🍲": [["RPG Audio", "metalPot2.ogg"], ["RPG Audio", "metalPot3.ogg"]],
  "🐟": [["Foley Sounds/Water", "drip4.ogg"], ["Foley Sounds/Water", "sinkWater1.ogg"]],
  "🧂": [["Impact Sounds", "impactTin_medium_004.ogg"], ["Interface Sounds", "drop_002.ogg"]],
  "🐸": [["Sci-Fi Sounds", "slime_000.ogg"], ["Digital Audio", "zapTwoTone.ogg"]],
  "🥁": [["Impact Sounds", "impactBell_heavy_004.ogg"], ["Impact Sounds", "impactPlate_heavy_002.ogg"]],
  "🐭": [["Impact Sounds", "impactSoft_light_003.ogg"], ["Interface Sounds", "click_003.ogg"]],
  "🐉": [["Sci-Fi Sounds", "explosionCrunch_002.ogg"], ["Sci-Fi Sounds", "laserLarge_001.ogg"]],
  "🐢": [["Impact Sounds", "impactPlate_medium_002.ogg"], ["Sci-Fi Sounds", "slime_000.ogg"]],
  "🎵": [["Interface Sounds", "bong_001.ogg"], ["Digital Audio", "pepSound1.ogg"]],
  "✨": [["Interface Sounds", "pluck_001.ogg"], ["Interface Sounds", "confirmation_001.ogg"]],
};

const DEFAULT_POOL = [
  ["Interface Sounds", "pluck_001.ogg"],
  ["Interface Sounds", "confirmation_001.ogg"],
];

/** CC0 — external samples (OpenGameArt) */
export const externalSfxById = {
  86: "https://opengameart.org/sites/default/files/flame.ogg",
};

/** Max hero-tap length in seconds (some samples need more ring) */
export const heroSfxMaxSecById = {
  74: 1.05,
  86: 0.55,
};

export function getHeroSfxMaxSec(id) {
  return heroSfxMaxSecById[id] ?? 0.42;
}

function padId(id) {
  return String(id).padStart(3, "0");
}

export function getRadicalSfxRef(id) {
  const emoji = getRadicalEmoji(id);
  const pool = emojiSfxPools[emoji] ?? DEFAULT_POOL;
  const pick = pool[(id - 1) % pool.length];
  return { pack: pick[0], file: pick[1] };
}

export function getRadicalSfxDownload(id) {
  const external = externalSfxById[id];
  if (external) return { kind: "external", url: external };
  const { pack, file } = getRadicalSfxRef(id);
  return { kind: "kenney", pack, file };
}

export function radicalSfxUrl(id) {
  return appAssetUrl(`audio/sfx/${padId(id)}.mp3`);
}

export function radicalSfxSourceUrl(id) {
  const external = externalSfxById[id];
  if (external) return external;
  const { pack, file } = getRadicalSfxRef(id);
  return `${KENNEY}/${encodeURI(pack)}/${encodeURIComponent(file)}`;
}
