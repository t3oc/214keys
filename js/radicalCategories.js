/**
 * Семантические категории ключей для spatial-canvas (цветовые фильтры).
 *
 * 1. stroke    — базовые черты (一 丨 丶 丿 乙 亅)
 * 2. number    — числовые (二 八 十)
 * 3. enclosure — обрамления (冂 匚 匸 勹 囗 冖 宀 广 厂 尸 疒 門 …)
 * 4. human     — человек и тело (人 儿 目 口 心 手 足 …)
 * 5. nature    — природа (日 月 水 火 山 木 土 雨 …)
 * 6. animal    — животные (犬 牛 馬 鳥 魚 虫 龍 …)
 * 7. object    — предметы и орудия (刀 車 舟 弓 斤 鼎 …)
 * 8. other     — прочее
 */

/** @typedef {{ id: string, label: string, color: string, hint: string }} RadicalCategory */

/** @type {RadicalCategory[]} */
export const RADICAL_CATEGORIES = [
  { id: "stroke", label: "Черты", color: "#8b9cb8", hint: "一 丨 丶 丿 乙 亅" },
  { id: "number", label: "Числа", color: "#e8b45c", hint: "二 八 十" },
  { id: "enclosure", label: "Обрамления", color: "#c07bd4", hint: "冂 匚 勹 囗 宀 門" },
  { id: "human", label: "Человек", color: "#e87878", hint: "人 目 口 心 手 足" },
  { id: "nature", label: "Природа", color: "#5ec98a", hint: "日 月 水 火 山 木" },
  { id: "animal", label: "Животные", color: "#6aaef0", hint: "犬 牛 馬 鳥 魚 龍" },
  { id: "object", label: "Предметы", color: "#a894f0", hint: "刀 車 舟 弓 鼎" },
  { id: "other", label: "Прочее", color: "#9aa3b2", hint: "остальные ключи" },
];

const CHAR_CATEGORY = new Map();

const CHAR_SETS = [
  ["stroke", "一丨丶丿乙亅"],
  ["number", "二八十"],
  [
    "enclosure",
    "冂匚匸勹囗冖宀广厂尸疒襾門阜鬲冫凵匸",
  ],
  [
    "human",
    "人儿入女子弟寸尸心手父面目身首齿鼻髟肉自頁止牙舌足骨",
  ],
  [
    "nature",
    "日月水火山石土木禾竹雨風風气氣气黍麻黃黄黑靑青夕山巛川",
  ],
  [
    "animal",
    "犬牛馬马鳥鸟魚鱼虫羊虎龍龙龜龟鹿鼠鬼隹豕豸",
  ],
  [
    "object",
    "刀車车舟弓斤戈鼎鼓玉瓦皿缶网网巾戈矛矢車车鬥斗酉食首香",
  ],
];

for (const [id, chars] of CHAR_SETS) {
  for (const ch of chars) CHAR_CATEGORY.set(ch, id);
}

const CATEGORY_ORDER = RADICAL_CATEGORIES.map((c) => c.id);
const CATEGORY_BY_ID = Object.fromEntries(RADICAL_CATEGORIES.map((c) => [c.id, c]));

/** @param {{ char: string, variants?: string }} item */
export function getRadicalCategory(item) {
  const chars = [item.char, ...(item.variants || "").split(/\s+/).filter(Boolean)];
  for (const ch of chars) {
    const hit = CHAR_CATEGORY.get(ch);
    if (hit) return hit;
  }
  return "other";
}

export function getCategoryMeta(id) {
  return CATEGORY_BY_ID[id] ?? CATEGORY_BY_ID.other;
}

export function listCategoryIds() {
  return CATEGORY_ORDER.slice();
}
