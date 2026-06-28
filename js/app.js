import radicals from "./radicals.js";
import { createReadingWaveform } from "./audioWaveform.js";
import { applyPitchTint, clearPitchTint } from "./pitchTint.js";
import {
  burstSpeakerParticles,
  clearSpeakerParticles,
  initSpeakerParticles,
} from "./speakerParticles.js";
import {
  getSamplePeaks,
  isSampleLoading,
  isSampleReady,
  loadSamplePeaks,
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
const speakerWaitJp = document.getElementById("speaker-wait-jp");
const speakerWaitCn = document.getElementById("speaker-wait-cn");
const readingWaves = {
  jp: createReadingWaveform(document.getElementById("audio-wave-jp")),
  cn: createReadingWaveform(document.getElementById("audio-wave-cn")),
};
const waveRoots = {
  jp: document.getElementById("audio-wave-jp"),
  cn: document.getElementById("audio-wave-cn"),
};
const modalPrev = document.getElementById("modal-prev");
const modalNext = document.getElementById("modal-next");
const modalGroupPrev = document.getElementById("modal-group-prev");
const modalGroupNext = document.getElementById("modal-group-next");
const modalGroupPrevLabel = document.getElementById("modal-group-prev-label");
const modalGroupNextLabel = document.getElementById("modal-group-next-label");
const modalMap = document.getElementById("modal-map");
const modalMapPanel = document.getElementById("modal-map-panel");
const modalMapToggle = document.getElementById("modal-map-toggle");
const modalMapStage = document.getElementById("modal-map-stage");
const modalMapZoom = document.getElementById("modal-map-zoom");
const modalMapFit = document.getElementById("modal-map-fit");
const modalMapGrid = document.getElementById("modal-map-grid");
const modalMapViewport = document.getElementById("modal-map-viewport");
const modalRuFit = document.querySelector(".modal__ru-fit");
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
let visibleItems = radicals;
let savedScrollY = 0;
let activeCellEl = null;
let activeMinimapCellEl = null;
let gridDocAnchor = { top: 0, height: 0, width: 0 };
let cachedMaxScroll = null;
let minimapBaseScale = 1;
let mapPointer = null;
let mapLayoutLandscape = null;
let mapSuppressClickUntil = 0;
let modalRuScaleReady = false;
const speaking = { jp: false, cn: false };

function ensureModalRuScale() {
  if (modalRuScaleReady || !modalRuFit) return;

  const fitStyles = getComputedStyle(modalRuFit);
  const fitWidth = modalRuFit.clientWidth;
  const fitHeight = modalRuFit.clientHeight;
  if (!fitWidth || !fitHeight) return;

  const probe = document.createElement("div");
  probe.style.cssText = [
    "position:fixed",
    "left:-9999px",
    "top:0",
    "visibility:hidden",
    "pointer-events:none",
    `width:${fitWidth}px`,
    `font-size:${fitStyles.fontSize}`,
    `line-height:1.45`,
    `font-family:${fitStyles.fontFamily}`,
  ].join(";");
  document.body.appendChild(probe);

  let minScale = 1;
  for (const item of radicals) {
    probe.textContent = item.ru;
    const naturalH = probe.scrollHeight;
    if (naturalH > fitHeight) {
      minScale = Math.min(minScale, fitHeight / naturalH);
    }
  }

  probe.remove();
  document.documentElement.style.setProperty(
    "--modal-ru-scale",
    Math.max(0.72, minScale).toFixed(4),
  );
  modalRuScaleReady = true;
}

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

function strokeCountLabel(n) {
  return strokeLabels[n] || `${n} черт`;
}

function strokeSectionLabel(n) {
  return `${strokeCountLabel(n)} · ${n}画`;
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

function pitchTintTargets(lang) {
  const btn = lang === "jp" ? speakerJp : speakerCn;
  return [btn, waveRoots[lang]];
}

function setSpeakerState(lang, active) {
  speaking[lang] = active;
  const btn = lang === "jp" ? speakerJp : speakerCn;
  btn.classList.toggle("speaker--active", active);
  btn.setAttribute("aria-pressed", String(active));
  if (!active) clearPitchTint(pitchTintTargets(lang));
}

function setSpeakerLoading(lang, loading) {
  const btn = lang === "jp" ? speakerJp : speakerCn;
  const wait = lang === "jp" ? speakerWaitJp : speakerWaitCn;
  btn.hidden = loading;
  btn.setAttribute("aria-hidden", String(loading));
  btn.setAttribute("aria-busy", String(loading));
  wait.hidden = !loading;
  wait.setAttribute("aria-hidden", String(!loading));
}

function resetReadingWaves() {
  for (const lang of ["jp", "cn"]) {
    readingWaves[lang].setPeaks(null);
    readingWaves[lang].hide();
    readingWaves[lang].reset();
  }
}

function syncReadingWave(item, lang) {
  const wave = readingWaves[lang];
  const peaks = getSamplePeaks(lang, item.id);
  if (peaks) {
    wave.setPeaks(peaks);
    wave.reset();
    requestAnimationFrame(() => wave.resize());
    return;
  }

  wave.hide();
  void loadSamplePeaks(lang, item.id).then((loaded) => {
    if (!activeItem || activeItem.id !== item.id) return;
    if (!loaded) return;
    wave.setPeaks(loaded);
    wave.reset();
    requestAnimationFrame(() => wave.resize());
  });
}

function syncModalReadingWaves(item) {
  syncReadingWave(item, "jp");
  syncReadingWave(item, "cn");
}

function wireSpeaker(btn, lang) {
  const wave = readingWaves[lang];

  btn.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    if (!activeItem || btn.hidden) return;
    unlockSpeech();
  });

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!activeItem || btn.getAttribute("aria-busy") === "true") return;
    burstSpeakerParticles(btn, lang, activeItem);

    unlockSpeech();
    const item = activeItem;
    const needsWait = !isSampleReady(lang, item.id) || isSampleLoading(lang, item.id);

    if (needsWait) {
      setSpeakerLoading(lang, true);
    }

    const runSpeak = () => {
      if (!activeItem || activeItem.id !== item.id) {
        setSpeakerLoading(lang, false);
        wave.setPlaying(false);
        return;
      }

      speakRadical(item, lang, {
        onLoadStart: () => setSpeakerLoading(lang, true),
        onStart: (rate) => {
          setSpeakerLoading(lang, false);
          applyPitchTint(pitchTintTargets(lang), rate);
          setSpeakerState(lang, true);
          wave.setPlaying(true);
          const peaks = getSamplePeaks(lang, item.id);
          if (peaks) {
            wave.setPeaks(peaks);
            wave.resize();
          }
        },
        onProgress: (t) => wave.setProgress(t),
        onEnd: () => {
          setSpeakerLoading(lang, false);
          setSpeakerState(lang, false);
          wave.setPlaying(false);
          wave.setProgress(0);
        },
      });
    };

    if (needsWait) {
      requestAnimationFrame(runSpeak);
    } else {
      runSpeak();
    }
  });
}

function resetSpeakers() {
  setSpeakerState("jp", false);
  setSpeakerState("cn", false);
  setSpeakerLoading("jp", false);
  setSpeakerLoading("cn", false);
  readingWaves.jp.setPlaying(false);
  readingWaves.cn.setPlaying(false);
  readingWaves.jp.setProgress(0);
  readingWaves.cn.setProgress(0);
}

function getVisibleItems() {
  return filterRadicals(searchInput.value);
}

function getStrokeGroups() {
  const groups = [];
  let last = null;

  for (const item of visibleItems) {
    if (item.strokes !== last) {
      groups.push({ strokes: item.strokes, firstItem: item });
      last = item.strokes;
    }
  }

  return groups;
}

function updateStrokeGroupNav() {
  if (!activeItem) return;

  const groups = getStrokeGroups();
  const index = groups.findIndex((group) => group.strokes === activeItem.strokes);
  const prevGroup = index > 0 ? groups[index - 1] : null;
  const nextGroup = index >= 0 && index < groups.length - 1 ? groups[index + 1] : null;

  modalGroupPrev.disabled = !prevGroup;
  modalGroupNext.disabled = !nextGroup;
  modalGroupPrevLabel.textContent = prevGroup ? strokeCountLabel(prevGroup.strokes) : "";
  modalGroupNextLabel.textContent = nextGroup ? strokeCountLabel(nextGroup.strokes) : "";
}

function navigateStrokeGroup(delta) {
  if (!activeItem) return;
  const groups = getStrokeGroups();
  const index = groups.findIndex((group) => group.strokes === activeItem.strokes);
  const target = groups[index + delta];
  if (!target) return;
  selectRadical(target.firstItem);
}

function updateModalNav() {
  if (!activeItem) return;
  const index = visibleItems.findIndex((item) => item.id === activeItem.id);
  modalPrev.disabled = index <= 0;
  modalNext.disabled = index < 0 || index >= visibleItems.length - 1;
  updateStrokeGroupNav();
}

function fillModal(item) {
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

  updateModalNav();
  syncModalReadingWaves(item);
}

function updateActiveCellEl(container, item, prevEl) {
  if (prevEl) prevEl.classList.remove("cell--active");
  if (!item) return null;

  const cell = container.querySelector(`.cell[data-id="${item.id}"]`);
  if (!cell) return null;

  cell.classList.add("cell--active");
  return cell;
}

function setActiveCell(item) {
  activeCellEl = updateActiveCellEl(grid, item, activeCellEl);
  if (modal.open && !modalMap.hidden) {
    activeMinimapCellEl = updateActiveCellEl(modalMapGrid, item, activeMinimapCellEl);
  } else {
    if (activeMinimapCellEl) {
      activeMinimapCellEl.classList.remove("cell--active");
      activeMinimapCellEl = null;
    }
  }
}

function getGridDocumentMetrics() {
  return {
    top: gridDocAnchor.top,
    height: gridDocAnchor.height,
    width: gridDocAnchor.width,
  };
}

function refreshGridDocAnchor() {
  if (grid.hidden) {
    gridDocAnchor.top = 0;
    gridDocAnchor.height = 0;
    gridDocAnchor.width = 0;
    return;
  }

  gridDocAnchor.top = savedScrollY + grid.getBoundingClientRect().top;
  gridDocAnchor.height = grid.offsetHeight;
  gridDocAnchor.width = grid.offsetWidth;
}

function getMaxScroll() {
  if (document.body.classList.contains("is-modal-open")) {
    return Math.max(0, document.body.scrollHeight - window.innerHeight);
  }

  if (cachedMaxScroll !== null) return cachedMaxScroll;
  return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
}

function refreshMaxScroll() {
  if (document.body.classList.contains("is-modal-open")) return;
  cachedMaxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
}

function setPageScrollY(next) {
  savedScrollY = Math.max(0, Math.min(next, getMaxScroll()));
  document.body.style.top = `-${savedScrollY}px`;
  updateMinimapViewport();
}

function getMinimapScrollRange() {
  return Math.max(1, getMaxScroll());
}

function scrollByMapDelta(deltaY) {
  const mapH = modalMapFit.getBoundingClientRect().height;
  const { height: gridHeight } = getGridDocumentMetrics();
  if (!mapH || !gridHeight) return;
  setPageScrollY(savedScrollY + (deltaY / mapH) * gridHeight);
}

function shouldSuppressMapClick() {
  return performance.now() < mapSuppressClickUntil;
}

function suppressMapClickBriefly() {
  mapSuppressClickUntil = performance.now() + 400;
}

function getTopLeftItemInViewport() {
  let best = null;
  let bestTop = Infinity;
  let bestLeft = Infinity;

  for (const item of visibleItems) {
    const cell = grid.querySelector(`.cell[data-id="${item.id}"]`);
    if (!cell) continue;

    const rect = cell.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= window.innerHeight) continue;
    if (rect.right <= 0 || rect.left >= window.innerWidth) continue;

    if (rect.top < bestTop - 0.5 || (Math.abs(rect.top - bestTop) <= 0.5 && rect.left < bestLeft)) {
      best = item;
      bestTop = rect.top;
      bestLeft = rect.left;
    }
  }

  return best;
}

function syncViewportSelection() {
  const item = getTopLeftItemInViewport();
  if (!item || item.id === activeItem?.id) return;

  fillModal(item);
  setActiveCell(item);
}

function docYToMinimapRatio(docY) {
  const { top, height } = getGridDocumentMetrics();
  if (!height) return 0;
  return Math.max(0, Math.min(1, (docY - top) / height));
}

function computeMinimapViewportBox() {
  const { top: gridTop, height: gridHeight } = getGridDocumentMetrics();
  if (!gridHeight) return null;

  const viewDocTop = savedScrollY;
  const viewDocBottom = savedScrollY + window.innerHeight;
  const gridDocBottom = gridTop + gridHeight;

  if (viewDocBottom <= gridTop || viewDocTop >= gridDocBottom) return null;

  const visDocTop = Math.max(viewDocTop, gridTop);
  const visDocBottom = Math.min(viewDocBottom, gridDocBottom);
  const topPct = docYToMinimapRatio(visDocTop) * 100;
  const heightPct = ((visDocBottom - visDocTop) / gridHeight) * 100;

  if (heightPct <= 0) return null;

  return { topPct, heightPct, widthPct: 100, leftPct: 0 };
}

function applyMinimapViewportBox(box) {
  if (!box) {
    modalMapViewport.hidden = true;
    return;
  }

  modalMapViewport.hidden = false;
  modalMapViewport.style.top = `${box.topPct}%`;
  modalMapViewport.style.height = `${box.heightPct}%`;
  modalMapViewport.style.width = `${box.widthPct}%`;
  modalMapViewport.style.left = `${box.leftPct}%`;
  modalMapViewport.style.right = "auto";
}

function jumpScrollToMinimapRatio(ratio) {
  const { top, height } = getGridDocumentMetrics();
  if (!height) return;

  const clamped = Math.max(0, Math.min(1, ratio));
  const docY = top + clamped * height;
  setPageScrollY(docY - window.innerHeight * 0.5);
}

function updateMinimapViewport() {
  if (modalMap.hidden || grid.hidden) {
    modalMapViewport.hidden = true;
    return;
  }

  applyMinimapViewportBox(computeMinimapViewportBox());
}

function syncMinimapGridLayout() {
  modalMapGrid.style.width = "100%";
}

function isPointInViewport(clientX, clientY) {
  if (modalMapViewport.hidden) return false;
  const rect = modalMapViewport.getBoundingClientRect();
  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  );
}

function applyMinimapTransform() {
  const gridW = modalMapGrid.offsetWidth;
  const gridH = modalMapGrid.offsetHeight;
  if (!gridW || !gridH) return;

  modalMapFit.style.width = `${gridW}px`;
  modalMapFit.style.height = `${gridH}px`;
  modalMapFit.style.transform = `scale(${minimapBaseScale})`;
  modalMapFit.style.transformOrigin = "top left";
}

function updateMinimapCompactLabels() {
  const sampleCell = modalMapGrid.querySelector(".cell");
  if (!sampleCell) return;
  modalMapGrid.classList.toggle("is-compact", sampleCell.getBoundingClientRect().width < 22);
}

function syncMinimapLayout() {
  if (modalMap.hidden) return;

  refreshGridDocAnchor();
  syncMinimapGridLayout();

  modalMapFit.style.transform = "none";
  modalMapFit.style.height = "";

  const gridW = modalMapGrid.offsetWidth;
  const gridH = modalMapGrid.offsetHeight;
  const stageW = modalMapStage.clientWidth;
  const stageH = modalMapStage.clientHeight;
  if (!gridW || !gridH || !stageW || !stageH) return;

  minimapBaseScale = Math.min(stageW / gridW, stageH / gridH);
  applyMinimapTransform();
  updateMinimapCompactLabels();

  if (!mapPointer) updateMinimapViewport();
}

const minimapLayoutObserver = new ResizeObserver(() => {
  if (modalMap.hidden || mapPointer) return;
  refreshGridDocAnchor();
  syncMinimapLayout();
});
minimapLayoutObserver.observe(modalMapStage);
minimapLayoutObserver.observe(grid);

function scrollActiveCellIntoView() {
  if (!activeItem || !modal.open || !activeCellEl) return;

  const margin = 72;
  const rect = activeCellEl.getBoundingClientRect();
  let delta = 0;

  if (rect.top < margin) {
    delta = rect.top - margin;
  } else if (rect.bottom > window.innerHeight - margin) {
    delta = rect.bottom - (window.innerHeight - margin);
  }

  if (Math.abs(delta) < 1) return;

  setPageScrollY(savedScrollY + delta);
}

function isLandscapeViewport() {
  return window.matchMedia("(orientation: landscape)").matches;
}

function applyMapCollapsed(collapsed) {
  modalMap.classList.toggle("is-collapsed", collapsed);
  modalMapToggle.setAttribute("aria-expanded", String(!collapsed));
  modalMapToggle.setAttribute(
    "aria-label",
    collapsed ? "Развернуть мини-карту" : "Свернуть мини-карту",
  );
}

function syncMapCollapsedToOrientation() {
  if (modalMap.hidden) return;
  const landscape = isLandscapeViewport();
  if (landscape === mapLayoutLandscape) return;
  mapLayoutLandscape = landscape;
  applyMapCollapsed(!landscape);
}

function lockScroll() {
  savedScrollY = window.scrollY;
  refreshMaxScroll();
  document.body.classList.add("is-modal-open");
  document.body.style.position = "fixed";
  document.body.style.top = `-${savedScrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
  refreshGridDocAnchor();
}

function unlockScroll() {
  document.body.classList.remove("is-modal-open");
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";
  cachedMaxScroll = null;
  window.scrollTo(0, savedScrollY);
}

function selectRadical(item) {
  fillModal(item);
  setActiveCell(item);
  requestAnimationFrame(() => {
    scrollActiveCellIntoView();
    syncMinimapLayout();
  });
}

function openModal(item) {
  visibleItems = getVisibleItems();
  fillModal(item);

  if (!modal.open) {
    lockScroll();
    modal.showModal();
  }

  modalMap.hidden = false;
  mapLayoutLandscape = isLandscapeViewport();
  applyMapCollapsed(!mapLayoutLandscape);
  renderMinimap(visibleItems);
  setActiveCell(item);
  requestAnimationFrame(() => {
    ensureModalRuScale();
    scrollActiveCellIntoView();
    syncMinimapLayout();
  });
}

function navigateModal(delta) {
  if (!activeItem) return;
  const index = visibleItems.findIndex((item) => item.id === activeItem.id);
  const next = visibleItems[index + delta];
  if (!next) return;
  selectRadical(next);
}

function closeModal() {
  if (modal.open) modal.close();
  modalMap.hidden = true;
  mapPointer = null;
  mapLayoutLandscape = null;
  setActiveCell(null);
  activeItem = null;
  activeMinimapCellEl = null;
  resetSpeakers();
  resetReadingWaves();
  clearSpeakerParticles();
  modalPrev.disabled = true;
  modalNext.disabled = true;
  modalGroupPrev.disabled = true;
  modalGroupNext.disabled = true;
  modalGroupPrevLabel.textContent = "";
  modalGroupNextLabel.textContent = "";
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

function createGridFragment(items, onCellClick) {
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
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (shouldSuppressMapClick()) return;
      onCellClick(item);
    });
    frag.appendChild(btn);
  }

  return frag;
}

function renderMinimap(items) {
  modalMapGrid.replaceChildren(
    createGridFragment(items, (item) => {
      if (activeItem?.id === item.id) return;
      selectRadical(item);
    }),
  );

  syncMinimapGridLayout();
  if (activeItem) setActiveCell(activeItem);
  requestAnimationFrame(syncMinimapLayout);
}

function render(items, query = "") {
  grid.replaceChildren(createGridFragment(items, openModal));
  emptyState.hidden = items.length > 0;
  grid.hidden = items.length === 0;
  updateSearchMeta(items.length, query);

  if (modal.open && !modalMap.hidden) {
    visibleItems = items;
    renderMinimap(items);
    if (activeItem) {
      setActiveCell(activeItem);
      updateModalNav();
      requestAnimationFrame(() => {
        scrollActiveCellIntoView();
        syncMinimapLayout();
      });
    }
  }
}

document.querySelector(".modal__close").addEventListener("click", closeModal);

modalPrev.addEventListener("click", (e) => {
  e.stopPropagation();
  navigateModal(-1);
});

modalNext.addEventListener("click", (e) => {
  e.stopPropagation();
  navigateModal(1);
});

modalGroupPrev.addEventListener("click", (e) => {
  e.stopPropagation();
  navigateStrokeGroup(-1);
});

modalGroupNext.addEventListener("click", (e) => {
  e.stopPropagation();
  navigateStrokeGroup(1);
});

modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});

modalMap.addEventListener("click", (e) => {
  e.stopPropagation();
});

modalMapToggle.addEventListener("click", (e) => {
  e.stopPropagation();
  applyMapCollapsed(!modalMap.classList.contains("is-collapsed"));
  requestAnimationFrame(syncMinimapLayout);
});

function onMapPointerDown(e) {
  if (modalMap.hidden || e.button !== 0) return;

  const inViewport = isPointInViewport(e.clientX, e.clientY);
  const cell = e.target.closest(".cell");

  if (cell && !inViewport) return;

  e.preventDefault();
  e.stopPropagation();

  mapPointer = {
    pointerId: e.pointerId,
    startY: e.clientY,
    lastY: e.clientY,
    moved: false,
    pendingCell: cell && inViewport ? cell : null,
  };
  modalMapStage.setPointerCapture(e.pointerId);
  modalMapViewport.classList.add("is-dragging");
}

function onMapPointerMove(e) {
  if (!mapPointer || e.pointerId !== mapPointer.pointerId) return;

  const dy = e.clientY - mapPointer.lastY;
  mapPointer.lastY = e.clientY;

  if (!mapPointer.moved) {
    if (Math.abs(e.clientY - mapPointer.startY) < 5) return;
    mapPointer.moved = true;
  }

  e.preventDefault();
  scrollByMapDelta(dy);
}

function onMapPointerUp(e) {
  if (!mapPointer || e.pointerId !== mapPointer.pointerId) return;

  const { moved, pendingCell } = mapPointer;
  mapPointer = null;
  modalMapViewport.classList.remove("is-dragging");

  if (modalMapStage.hasPointerCapture(e.pointerId)) {
    modalMapStage.releasePointerCapture(e.pointerId);
  }

  if (moved) {
    e.preventDefault();
    suppressMapClickBriefly();
    syncViewportSelection();
    return;
  }

  if (pendingCell) {
    const itemId = Number(pendingCell.dataset.id);
    const item = visibleItems.find((entry) => entry.id === itemId);
    if (item && item.id !== activeItem?.id) selectRadical(item);
    return;
  }

  if (!modalMapViewport.hidden) {
    const fitRect = modalMapFit.getBoundingClientRect();
    if (fitRect.height) {
      jumpScrollToMinimapRatio((e.clientY - fitRect.top) / fitRect.height);
      syncViewportSelection();
    }
  }
}

modalMapStage.addEventListener("pointerdown", onMapPointerDown, { capture: true });
modalMapStage.addEventListener("pointermove", onMapPointerMove);
modalMapStage.addEventListener("pointerup", onMapPointerUp, { passive: false });
modalMapStage.addEventListener("pointercancel", onMapPointerUp, { passive: false });

modalMapStage.addEventListener(
  "click",
  (e) => {
    if (!shouldSuppressMapClick()) return;
    e.preventDefault();
    e.stopPropagation();
  },
  true,
);

modalMapStage.addEventListener(
  "wheel",
  (e) => {
    if (modalMap.hidden) return;
    e.preventDefault();
    e.stopPropagation();
    setPageScrollY(savedScrollY + e.deltaY);
    syncViewportSelection();
  },
  { passive: false },
);

window.addEventListener("resize", () => {
  if (!modal.open) return;
  syncMapCollapsedToOrientation();
  if (!modalMap.hidden && !mapPointer) {
    refreshGridDocAnchor();
    syncMinimapLayout();
  }
});

window.addEventListener("orientationchange", () => {
  requestAnimationFrame(() => {
    if (!modal.open) return;
    syncMapCollapsedToOrientation();
    if (!modalMap.hidden) syncMinimapLayout();
  });
});

modal.addEventListener("close", unlockScroll);

document.addEventListener("keydown", (e) => {
  if (!modal.open) return;
  if (e.key === "Escape") closeModal();
  if (e.key === "ArrowLeft") {
    e.preventDefault();
    navigateModal(-1);
  }
  if (e.key === "ArrowRight") {
    e.preventDefault();
    navigateModal(1);
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    navigateStrokeGroup(-1);
  }
  if (e.key === "ArrowDown") {
    e.preventDefault();
    navigateStrokeGroup(1);
  }
});

searchInput.addEventListener("input", () => {
  render(filterRadicals(searchInput.value), searchInput.value);
});

wireSpeaker(speakerJp, "jp");
wireSpeaker(speakerCn, "cn");
initSpeakerParticles();

const THEME_KEY = "214keys-theme";
const FONT_KEY = "214keys-font";
const themeButtons = document.querySelectorAll(".theme-toggle__btn");
const fontButtons = document.querySelectorAll(".font-toggle__btn");

function applyTheme(mode) {
  const next = mode === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = next === "dark" ? "dark" : "";
  for (const btn of themeButtons) {
    const active = btn.dataset.theme === next;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", String(active));
  }
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    /* ignore */
  }
}

function applyFont(mode) {
  const next = mode === "linear" ? "linear" : "serif";
  document.documentElement.dataset.font = next === "linear" ? "linear" : "";
  for (const btn of fontButtons) {
    const active = btn.dataset.font === next;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", String(active));
  }
  try {
    localStorage.setItem(FONT_KEY, next);
  } catch {
    /* ignore */
  }
}

for (const btn of themeButtons) {
  btn.addEventListener("click", () => applyTheme(btn.dataset.theme));
}

for (const btn of fontButtons) {
  btn.addEventListener("click", () => applyFont(btn.dataset.font));
}

try {
  const savedTheme = localStorage.getItem(THEME_KEY);
  const defaultTheme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  applyTheme(savedTheme || defaultTheme);
} catch {
  applyTheme("light");
}

try {
  applyFont(localStorage.getItem(FONT_KEY) || "serif");
} catch {
  applyFont("serif");
}

modalPrev.disabled = true;
modalNext.disabled = true;
modalGroupPrev.disabled = true;
modalGroupNext.disabled = true;

render(radicals);
