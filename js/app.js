import radicals from "./radicals.js";
import {
  ensureStrokeGroupLoaded,
  isGroupLoaded,
  prefetchRadical,
  speakRadical,
  unlockSpeech,
} from "./radicalSpeech.js";

const grid = document.getElementById("grid");
const modal = document.getElementById("modal");
const searchInput = document.getElementById("search-input");
const searchMeta = document.getElementById("search-meta");
const emptyState = document.getElementById("empty");
const speakerJp = document.getElementById("speaker-jp");
const speakerCn = document.getElementById("speaker-cn");
const fields = {
  num: document.getElementById("modal-num"),
  char: document.getElementById("modal-char"),
  variants: document.getElementById("modal-variants"),
  jp: document.getElementById("modal-jp"),
  cn: document.getElementById("modal-cn"),
  ru: document.getElementById("modal-ru"),
  strokes: document.getElementById("modal-strokes"),
};

let activeItem = null;
const speaking = { jp: false, cn: false };

const strokeLabels = {
  1: "1 черта",
  2: "2 черты",
  3: "3 черты",
  4: "4 черты",
  5: "5 черт",
  6: "6 черт",
  7: "7 черт",
  8: "8 черт",
  9: "9 черт",
  10: "10 черт",
  11: "11 черт",
  12: "12 черт",
  13: "13 черт",
  14: "14 черт",
  15: "15 черт",
  16: "16 черт",
  17: "17 черт",
};

function strokeSectionLabel(n) {
  const word = strokeLabels[n] || `${n} черт`;
  return `${word} · ${n}画`;
}

function itemHaystack(item) {
  return [item.id, item.char, item.variants, item.jp, item.cn, item.ru]
    .join(" ")
    .toLowerCase();
}

function filterRadicals(query) {
  const q = query.trim().toLowerCase();
  if (!q) return radicals;
  return radicals.filter((item) => itemHaystack(item).includes(q));
}

function setSpeakerState(lang, active) {
  speaking[lang] = active;
  const btn = lang === "jp" ? speakerJp : speakerCn;
  btn.classList.toggle("speaker--active", active);
  btn.setAttribute("aria-pressed", String(active));
}

function setSpeakerLoading(lang, loading) {
  const btn = lang === "jp" ? speakerJp : speakerCn;
  btn.classList.toggle("speaker--loading", loading);
}

function wireSpeaker(btn, lang) {
  btn.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    if (!activeItem) return;
    unlockSpeech();
    prefetchRadical(activeItem, lang);
  });

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!activeItem) return;

    unlockSpeech();

    if (!isGroupLoaded(activeItem.strokes, lang)) {
      setSpeakerLoading(lang, true);
      void ensureStrokeGroupLoaded(activeItem.strokes, lang).finally(() => {
        setSpeakerLoading(lang, false);
      });
    }

    speakRadical(activeItem, lang, {
      onStart: () => setSpeakerState(lang, true),
      onEnd: () => setSpeakerState(lang, false),
    });
  });
}

function resetSpeakers() {
  setSpeakerState("jp", false);
  setSpeakerState("cn", false);
  setSpeakerLoading("jp", false);
  setSpeakerLoading("cn", false);
}

function openModal(item) {
  activeItem = item;
  resetSpeakers();

  fields.num.textContent = `#${item.id} · 部首 ${item.id}`;
  fields.char.textContent = item.char;
  fields.variants.textContent = item.variants
    ? `варианты: ${item.variants.split(/\s+/).join(" · ")}`
    : "";
  fields.jp.textContent = item.jp;
  fields.cn.textContent = item.cn;
  fields.ru.textContent = item.ru;
  fields.strokes.textContent = strokeSectionLabel(item.strokes);

  if (typeof modal.showModal === "function") {
    modal.showModal();
  } else {
    modal.setAttribute("open", "");
  }
}

function closeModal() {
  if (modal.open) modal.close();
  activeItem = null;
  resetSpeakers();
}

function updateSearchMeta(count, query) {
  if (!query.trim()) {
    searchMeta.textContent = "";
    return;
  }

  const word =
    count === 1 ? "ключ" : count >= 2 && count <= 4 ? "ключа" : "ключей";
  searchMeta.textContent = `Найдено: ${count} ${word}`;
}

function render(items, query = "") {
  const frag = document.createDocumentFragment();
  let currentStrokes = null;

  for (const item of items) {
    if (item.strokes !== currentStrokes) {
      currentStrokes = item.strokes;
      const label = document.createElement("div");
      label.className = "section-label";
      label.textContent = strokeSectionLabel(currentStrokes);
      frag.appendChild(label);
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cell";
    btn.dataset.id = item.id;
    btn.setAttribute("aria-label", `${item.id}. ${item.char} — ${item.jp}, ${item.cn}`);

    const num = document.createElement("span");
    num.className = "cell__num";
    num.textContent = item.id;

    const ch = document.createElement("span");
    ch.className = "cell__char";
    ch.textContent = item.char;

    btn.append(num, ch);
    btn.addEventListener("click", () => openModal(item));
    frag.appendChild(btn);
  }

  grid.replaceChildren(frag);
  emptyState.hidden = items.length > 0;
  grid.hidden = items.length === 0;
  updateSearchMeta(items.length, query);
}

document.querySelector(".modal__close").addEventListener("click", closeModal);

modal.addEventListener("click", (e) => {
  const rect = modal.getBoundingClientRect();
  const inDialog =
    e.clientX >= rect.left &&
    e.clientX <= rect.right &&
    e.clientY >= rect.top &&
    e.clientY <= rect.bottom;
  if (!inDialog) closeModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modal.open) closeModal();
});

searchInput.addEventListener("input", () => {
  render(filterRadicals(searchInput.value), searchInput.value);
});

wireSpeaker(speakerJp, "jp");
wireSpeaker(speakerCn, "cn");

render(radicals);
