import radicals from "./radicals.js";
import { RADICAL_CATEGORIES, getCategoryMeta, getRadicalCategory } from "./radicalCategories.js";

const STORAGE_KEY = "214keys-spatial-canvas-v12";
const LEGACY_STORAGE_KEYS = [
  "214keys-spatial-canvas-v11",
  "214keys-spatial-canvas-v10",
  "214keys-spatial-canvas-v9",
  "214keys-spatial-canvas-v8",
  "214keys-spatial-canvas-v7",
  "214keys-spatial-canvas-v6",
  "214keys-spatial-canvas-v5",
  "214keys-spatial-canvas-v4",
  "214keys-spatial-canvas-v3",
  "214keys-spatial-canvas-v2",
  "214keys-spatial-canvas-v1",
];
const CARD_SIZE = 36;
const FENCE_PAD = 12;
const FENCE_LABEL_H = 22;
const WORLD_MIN_W = 2200;
const WORLD_MIN_H = 1600;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.8;
const PINCH_ZOOM_SENS = 0.14;
const RMB_ZOOM_SENS = 0.0045;
const FOCUS_ANIM_MS = 520;
const SPAWN_STREAK_MS = 150;
const SPIRAL_ORIGIN_X = WORLD_MIN_W / 2;
const SPIRAL_ORIGIN_Y = WORLD_MIN_H / 2;
const SPIRAL_INNER_RADIUS = CARD_SIZE;
const SPIRAL_PITCH = 6;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const SUNFLOWER_SCALE = CARD_SIZE * 0.624;
const MIN_FENCE_RADIUS = CARD_SIZE + FENCE_PAD;
const MAX_FENCE_RADIUS = 1200;

const FENCE_COLOR_CYCLE = RADICAL_CATEGORIES.map((c) => c.color);

/** @type {{ onSelectRadical: (item: object) => void } | null} */
let hooks = null;

let rootEl = null;
let stageEl = null;
let viewportEl = null;
let worldEl = null;
let filtersEl = null;
let toggleEl = null;
let lassoEl = null;
let lassoPathEl = null;
let popupEl = null;
let deleteBtn = null;
let groupBtn = null;
let fullscreenBtn = null;
let focusBtn = null;
let fitBtn = null;
let clearBtn = null;
let toolbarEl = null;
let clearConfirmEl = null;
let clearConfirmOkBtn = null;
let clearConfirmCancelBtn = null;

let spawnStreakTimer = 0;
let spawnStreakActive = false;

let collapsed = false;
let landscape = true;
let fullscreen = false;
let activeCardId = null;
let focusAnimFrame = 0;

/** @type {Set<string>} */
let activeFilters = new Set();
/** @type {Set<string>} */
let selectedIds = new Set();

/** @type {{ cards: Record<string, { x: number, y: number, strokes: number }>, groups: Record<string, { label: string, cardIds: string[], cx: number, cy: number, radius: number, color?: string }>, viewport: { x: number, y: number, zoom: number } }} */
let state = { cards: {}, groups: {}, viewport: { x: 40, y: 40, zoom: 1 } };

/** @type {{ groupId: string, cx: number, cy: number, radius: number, label: string, color: string, cardIds: string[] }[]} */
let fenceLayout = [];
let worldWidth = WORLD_MIN_W;
let worldHeight = WORLD_MIN_H;

/** @type {{ id: number, cardId: number, el: HTMLElement, startX: number, startY: number, moved: boolean, origins: Map<string, { x: number, y: number }> } | null} */
let dragPointer = null;
/** @type {{ id: number, lastX: number, lastY: number } | null} */
let panPointer = null;
/** @type {{ id: number, startY: number, startZoom: number } | null} */
let rmbZoomPointer = null;
/** @type {Map<number, { x: number, y: number }>} */
let touchPointers = new Map();
/** @type {{ startDistance: number, midpoint: { x: number, y: number }, startZoom: number, startPan: { x: number, y: number } } | null} */
let pinchStart = null;
/** @type {number[] | null} */
let pinchPointerIds = null;
/** @type {{ id: number, points: { x: number, y: number }[] } | null} */
let lassoPointer = null;
/** @type {{ kind: "fence-move" | "fence-resize", pointerId: number, strokes: number, startClientX: number, startClientY: number, startOffsetX: number, startOffsetY: number, startScale: number, cardOrigins: Map<string, { x: number, y: number }>, fenceEl: HTMLElement } | null} */
let activeGesture = null;
/** @type {{ pointerId: number, startX: number, startY: number, fence: object, fenceEl: HTMLElement, labelEl: HTMLElement } | null} */
let labelDragPointer = null;

function setGroupMeta(id, patch) {
  state.groups[id] = { ...state.groups[id], ...patch };
}

function computeGroupCircle(cardIds, pad = FENCE_PAD) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const id of cardIds) {
    const card = state.cards[id];
    if (!card) continue;
    minX = Math.min(minX, card.x);
    minY = Math.min(minY, card.y);
    maxX = Math.max(maxX, card.x + CARD_SIZE);
    maxY = Math.max(maxY, card.y + CARD_SIZE);
  }
  if (!Number.isFinite(minX)) return null;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  let maxDist = 0;
  for (const id of cardIds) {
    const card = state.cards[id];
    if (!card) continue;
    const ccx = card.x + CARD_SIZE * 0.5;
    const ccy = card.y + CARD_SIZE * 0.5;
    maxDist = Math.max(maxDist, Math.hypot(ccx - cx, ccy - cy));
  }
  const radius = Math.max(MIN_FENCE_RADIUS, maxDist + CARD_SIZE * 0.5 + pad);
  return { cx, cy, radius };
}

function ensureGroupFitsCards(group) {
  const fit = computeGroupCircle(group.cardIds);
  if (!fit) return group;
  if (group.radius < fit.radius * 0.85) {
    return { ...group, cx: fit.cx, cy: fit.cy, radius: fit.radius };
  }
  return group;
}

function migrateGroup(group) {
  if (!group?.cardIds?.length) return null;
  if (typeof group.radius === "number" && typeof group.cx === "number") {
    return {
      label: group.label,
      cardIds: group.cardIds,
      cx: group.cx,
      cy: group.cy,
      radius: group.radius,
      color: group.color ?? FENCE_COLOR_CYCLE[0],
    };
  }
  if (typeof group.baseW === "number") {
    const scaleX = group.scaleX ?? 1;
    const scaleY = group.scaleY ?? 1;
    const w = group.baseW * scaleX;
    const h = group.baseH * scaleY;
    const cx = group.x + w / 2;
    const cy = group.y + FENCE_LABEL_H + (h - FENCE_LABEL_H) / 2;
    const radius = Math.max(w, h - FENCE_LABEL_H) / 2;
    return {
      label: group.label,
      cardIds: group.cardIds,
      cx,
      cy,
      radius,
      color: group.color ?? FENCE_COLOR_CYCLE[0],
    };
  }
  return null;
}

function normalizeLoadedState(parsed, { repack = false } = {}) {
  const groups = {};
  for (const [id, group] of Object.entries(parsed.groups ?? {})) {
    const migrated = migrateGroup(group);
    if (migrated) groups[id] = migrated;
  }
  const next = {
    cards: parsed.cards ?? {},
    groups,
    viewport: parsed.viewport ?? { x: 40, y: 40, zoom: 1 },
  };
  assignMissingSpawnIndices(next.cards);
  if (repack) repackCardsToSpiralOnState(next);
  return next;
}

function repackCardsToSpiralOnState(targetState) {
  const keys = Object.keys(targetState.cards).sort((a, b) => {
    const ai = targetState.cards[a].spawnIndex;
    const bi = targetState.cards[b].spawnIndex;
    if (typeof ai === "number" && typeof bi === "number") return ai - bi;
    return 0;
  });
  keys.forEach((key, index) => {
    const pos = spawnSpiralPosition(index);
    const card = targetState.cards[key];
    card.x = pos.x;
    card.y = pos.y;
    card.spawnIndex = index;
  });
}

function nextSpiralIndex(cards) {
  let max = -1;
  for (const card of Object.values(cards)) {
    if (typeof card.spawnIndex === "number") max = Math.max(max, card.spawnIndex);
  }
  return max + 1;
}

function assignMissingSpawnIndices(cards) {
  const keys = Object.keys(cards);
  let next = nextSpiralIndex(cards);
  for (const key of keys) {
    if (typeof cards[key].spawnIndex !== "number") {
      cards[key].spawnIndex = next;
      next += 1;
    }
  }
}

function loadState() {
  try {
    const keys = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS];
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (parsed?.cards) {
        const repack = key !== STORAGE_KEY;
        state = normalizeLoadedState(parsed, { repack });
        if (key !== STORAGE_KEY) saveState();
        return;
      }
    }
  } catch {
    /* ignore */
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function radicalById(id) {
  return radicals.find((item) => item.id === id) ?? null;
}

function cardsOnCanvas() {
  return Object.keys(state.cards)
    .map((key) => radicalById(Number(key)))
    .filter(Boolean);
}

function getSpiralOrigin() {
  return { x: SPIRAL_ORIGIN_X, y: SPIRAL_ORIGIN_Y };
}

function cardCenterInWorld(card) {
  return { x: card.x + CARD_SIZE * 0.5, y: card.y + CARD_SIZE * 0.5 };
}

// Archimedean spiral r = a + b·θ; arc-length steps ≈ CARD_SIZE (empty hub, no overlap)
function spawnSpiralPosition(index) {
  const origin = getSpiralOrigin();
  const half = CARD_SIZE * 0.5;
  const a = SPIRAL_INNER_RADIUS;
  const b = SPIRAL_PITCH;
  let theta = 0;
  let x = a;
  let y = 0;
  for (let i = 1; i <= index; i++) {
    const r = a + b * theta;
    const dTheta = CARD_SIZE / Math.sqrt(r * r + b * b);
    theta += dTheta;
    const r2 = a + b * theta;
    x = r2 * Math.cos(theta);
    y = r2 * Math.sin(theta);
  }
  return { x: origin.x + x - half, y: origin.y + y - half };
}

// Vogel phyllotaxis from v113: r = c√n, θ = n·φ (no hub, tight sunflower)
function spawnSunflowerPosition(index) {
  const origin = getSpiralOrigin();
  const half = CARD_SIZE * 0.5;
  const n = index + 1;
  const r = SUNFLOWER_SCALE * Math.sqrt(n);
  const theta = n * GOLDEN_ANGLE;
  return {
    x: origin.x + r * Math.cos(theta) - half,
    y: origin.y + r * Math.sin(theta) - half,
  };
}

function overlapsExistingCard(x, y, cards, minDist = CARD_SIZE * 0.92) {
  const cx = x + CARD_SIZE * 0.5;
  const cy = y + CARD_SIZE * 0.5;
  for (const card of cards) {
    const ac = cardCenterInWorld(card);
    if (Math.hypot(cx - ac.x, cy - ac.y) < minDist) return true;
  }
  return false;
}

function spawnNearbyPosition() {
  const origin = getSpiralOrigin();
  const half = CARD_SIZE * 0.5;
  const cards = Object.values(state.cards);
  if (!cards.length) {
    const jitter = (Math.random() - 0.5) * CARD_SIZE * 0.35;
    return { x: origin.x - half + jitter, y: origin.y - half + jitter };
  }
  for (let attempt = 0; attempt < 12; attempt++) {
    const anchor = cards[Math.floor(Math.random() * cards.length)];
    const ac = cardCenterInWorld(anchor);
    const angle = Math.random() * Math.PI * 2;
    const dist = CARD_SIZE * (0.98 + Math.random() * 0.08);
    const x = ac.x + dist * Math.cos(angle) - half;
    const y = ac.y + dist * Math.sin(angle) - half;
    if (!overlapsExistingCard(x, y, cards)) return { x, y };
  }
  const anchor = cards[cards.length - 1];
  const ac = cardCenterInWorld(anchor);
  const angle = Math.random() * Math.PI * 2;
  const dist = CARD_SIZE * 1.05;
  return {
    x: ac.x + dist * Math.cos(angle) - half,
    y: ac.y + dist * Math.sin(angle) - half,
  };
}

function positionForSpawnMode(index, mode) {
  if (mode === "spiral") return spawnSpiralPosition(index);
  if (mode === "sunflower") return spawnSunflowerPosition(index);
  return spawnNearbyPosition();
}

function worldContentBounds() {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let has = false;
  for (const card of Object.values(state.cards)) {
    has = true;
    minX = Math.min(minX, card.x);
    minY = Math.min(minY, card.y);
    maxX = Math.max(maxX, card.x + CARD_SIZE);
    maxY = Math.max(maxY, card.y + CARD_SIZE);
  }
  for (const fence of fenceLayout) {
    has = true;
    minX = Math.min(minX, fence.cx - fence.radius);
    minY = Math.min(minY, fence.cy - fence.radius - FENCE_LABEL_H);
    maxX = Math.max(maxX, fence.cx + fence.radius);
    maxY = Math.max(maxY, fence.cy + fence.radius);
  }
  if (!has) return null;
  return { minX, minY, maxX, maxY };
}

function fitAllInView({ animate = true } = {}) {
  const bounds = worldContentBounds();
  if (!bounds || !stageEl) return;
  const pad = 56;
  const rect = stageEl.getBoundingClientRect();
  const contentW = bounds.maxX - bounds.minX + pad * 2;
  const contentH = bounds.maxY - bounds.minY + pad * 2;
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(rect.width / contentW, rect.height / contentH)));
  const cx = (bounds.minX + bounds.maxX) * 0.5;
  const cy = (bounds.minY + bounds.maxY) * 0.5;
  focusOnWorldPoint(cx, cy, { animate, zoom });
}

function focusActiveCard() {
  if (!activeCardId) return;
  const item = radicalById(activeCardId);
  if (item) focusOnCard(item, { animate: true });
}

function deleteAllCards() {
  if (!Object.keys(state.cards).length) return;
  state.cards = {};
  state.groups = {};
  activeCardId = null;
  clearSelection();
  saveState();
  buildFenceLayout();
  renderFences();
  renderCards();
}

function showClearConfirm() {
  if (!clearConfirmEl) return;
  clearConfirmEl.hidden = false;
  clearConfirmEl.removeAttribute("hidden");
}

function hideClearConfirm() {
  if (!clearConfirmEl) return;
  clearConfirmEl.hidden = true;
  clearConfirmEl.setAttribute("hidden", "");
}

function requestDeleteAll() {
  if (!Object.keys(state.cards).length) return;
  showClearConfirm();
}

function refreshWorldSize() {
  let w = WORLD_MIN_W;
  let h = WORLD_MIN_H;
  for (const fence of fenceLayout) {
    w = Math.max(w, fence.cx + fence.radius + FENCE_PAD * 4);
    h = Math.max(h, fence.cy + fence.radius + FENCE_PAD * 4 + FENCE_LABEL_H);
  }
  for (const card of Object.values(state.cards)) {
    w = Math.max(w, card.x + CARD_SIZE + FENCE_PAD * 4);
    h = Math.max(h, card.y + CARD_SIZE + FENCE_PAD * 4);
  }
  worldWidth = w;
  worldHeight = h;
  if (worldEl) {
    worldEl.style.width = `${worldWidth}px`;
    worldEl.style.height = `${worldHeight}px`;
  }
}

function buildFenceLayout() {
  fenceLayout = Object.entries(state.groups)
    .filter(([, group]) => group?.cardIds?.length)
    .map(([groupId, group]) => {
      const fitted = ensureGroupFitsCards(group);
      if (fitted !== group) {
        state.groups[groupId] = fitted;
      }
      return {
        groupId,
        cx: fitted.cx,
        cy: fitted.cy,
        radius: fitted.radius,
        label: fitted.label?.trim() || "Группа",
        color: fitted.color ?? FENCE_COLOR_CYCLE[0],
        cardIds: [...fitted.cardIds],
      };
    });
  refreshWorldSize();
}

function ensureCard(item, spawnMode = "nearby") {
  const key = String(item.id);
  if (state.cards[key]) return false;
  const index = nextSpiralIndex(state.cards);
  const pos = positionForSpawnMode(index, spawnMode);
  state.cards[key] = { x: pos.x, y: pos.y, strokes: item.strokes, spawnIndex: index };
  saveState();
  return true;
}

function categoryPasses(item) {
  if (!activeFilters.size) return true;
  return activeFilters.has(getRadicalCategory(item));
}

function applyViewportTransform() {
  if (!viewportEl) return;
  const { x, y, zoom } = state.viewport;
  viewportEl.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
  viewportEl.style.setProperty("--viewport-zoom", String(zoom));
}

function pruneSelection() {
  for (const id of [...selectedIds]) {
    if (!state.cards[id]) selectedIds.delete(id);
  }
}

function hideSelectionPopup() {
  if (!popupEl) return;
  popupEl.hidden = true;
  popupEl.setAttribute("hidden", "");
  popupEl.classList.add("is-hidden");
}

function showSelectionPopup() {
  if (!popupEl) return;
  popupEl.hidden = false;
  popupEl.removeAttribute("hidden");
  popupEl.classList.remove("is-hidden");
}

function selectionBounds() {
  pruneSelection();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let count = 0;
  for (const id of selectedIds) {
    const card = state.cards[id];
    if (!card) continue;
    count += 1;
    minX = Math.min(minX, card.x);
    minY = Math.min(minY, card.y);
    maxX = Math.max(maxX, card.x + CARD_SIZE);
    maxY = Math.max(maxY, card.y + CARD_SIZE);
  }
  if (!count) return null;
  return { minX, minY, maxX, maxY, count };
}

function positionSelectionPopup() {
  if (!popupEl) return;
  const bounds = selectionBounds();
  if (!bounds || bounds.count < 2) {
    if (!bounds || bounds.count === 0) selectedIds.clear();
    hideSelectionPopup();
    return;
  }
  showSelectionPopup();
  const anchorX = (bounds.minX + bounds.maxX) * 0.5;
  const anchorY = bounds.minY;
  popupEl.style.left = `${anchorX}px`;
  popupEl.style.top = `${anchorY}px`;
}

function updateLassoPathFromPoints(pts) {
  if (!lassoPathEl || pts.length < 2) {
    lassoPathEl?.setAttribute("d", "");
    return;
  }
  const { x, y, zoom } = state.viewport;
  const screenPts = pts.map((p) => ({ x: p.x * zoom + x, y: p.y * zoom + y }));
  const d = screenPts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  lassoPathEl.setAttribute("d", `${d} Z`);
}

function stagePoint(clientX, clientY) {
  const rect = stageEl.getBoundingClientRect();
  const { x, y, zoom } = state.viewport;
  return {
    x: (clientX - rect.left - x) / zoom,
    y: (clientY - rect.top - y) / zoom,
  };
}

function cardWorldCenter(item) {
  const card = state.cards[String(item.id)];
  if (!card) return null;
  return { x: card.x + CARD_SIZE * 0.5, y: card.y + CARD_SIZE * 0.5 };
}

function focusOnWorldPoint(wx, wy, { animate = true, zoom: zoomTarget } = {}) {
  if (!stageEl) return;
  if (focusAnimFrame) cancelAnimationFrame(focusAnimFrame);

  const rect = stageEl.getBoundingClientRect();
  const targetZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomTarget ?? Math.max(state.viewport.zoom, 1.2)));
  const targetX = rect.width * 0.5 - wx * targetZoom;
  const targetY = rect.height * 0.46 - wy * targetZoom;

  if (!animate) {
    state.viewport = { x: targetX, y: targetY, zoom: targetZoom };
    applyViewportTransform();
    saveState();
    return;
  }

  const from = { ...state.viewport };
  const start = performance.now();

  const tick = (now) => {
    const t = Math.min(1, (now - start) / FOCUS_ANIM_MS);
    const eased = 1 - (1 - t) ** 3;
    state.viewport.x = from.x + (targetX - from.x) * eased;
    state.viewport.y = from.y + (targetY - from.y) * eased;
    state.viewport.zoom = from.zoom + (targetZoom - from.zoom) * eased;
    applyViewportTransform();
    if (t < 1) focusAnimFrame = requestAnimationFrame(tick);
    else {
      focusAnimFrame = 0;
      saveState();
    }
  };
  focusAnimFrame = requestAnimationFrame(tick);
}

function cardScreenBounds(item) {
  const card = state.cards[String(item.id)];
  if (!card || !stageEl) return null;
  const { x, y, zoom } = state.viewport;
  return {
    left: card.x * zoom + x,
    top: card.y * zoom + y,
    right: (card.x + CARD_SIZE) * zoom + x,
    bottom: (card.y + CARD_SIZE) * zoom + y,
  };
}

function isCardInView(item, inset = 6) {
  const bounds = cardScreenBounds(item);
  if (!bounds) return true;
  const rect = stageEl.getBoundingClientRect();
  return (
    bounds.right > inset &&
    bounds.left < rect.width - inset &&
    bounds.bottom > inset &&
    bounds.top < rect.height - inset
  );
}

function focusOnCard(item, { animate = true } = {}) {
  const center = cardWorldCenter(item);
  if (!center) return;
  focusOnWorldPoint(center.x, center.y, { animate });
}

function spawnRandom(categoryId = null, spawnMode = "nearby") {
  const onCanvas = new Set(Object.keys(state.cards).map(Number));
  const pool = radicals.filter((item) => {
    if (onCanvas.has(item.id)) return false;
    if (categoryId && getRadicalCategory(item) !== categoryId) return false;
    if (!categoryId && activeFilters.size && !categoryPasses(item)) return false;
    return true;
  });
  if (!pool.length) return null;
  const item = pool[Math.floor(Math.random() * pool.length)];
  ensureCard(item, spawnMode);
  renderCards();
  clearSelection();
  hooks?.onSelectRadical?.(item);
  return item;
}

function getSpawnCategoryId() {
  return activeFilters.size === 1 ? [...activeFilters][0] : null;
}

function stopSpawnStreak() {
  spawnStreakActive = false;
  if (spawnStreakTimer) {
    clearInterval(spawnStreakTimer);
    spawnStreakTimer = 0;
  }
}

function runSpawnStreakTick(spawnMode) {
  const item = spawnRandom(getSpawnCategoryId(), spawnMode);
  if (!item) stopSpawnStreak();
}

function startSpawnStreak(pointerId, btn, spawnMode) {
  stopSpawnStreak();
  spawnStreakActive = true;
  runSpawnStreakTick(spawnMode);
  spawnStreakTimer = window.setInterval(() => runSpawnStreakTick(spawnMode), SPAWN_STREAK_MS);
  btn.classList.add("is-spawning");
  try {
    btn.setPointerCapture(pointerId);
  } catch {
    /* ignore */
  }
}

function bindSpawnButton(spawnBtn, spawnMode) {
  spawnBtn.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    startSpawnStreak(event.pointerId, spawnBtn, spawnMode);
  });

  const endSpawn = (event) => {
    if (!spawnStreakActive) return;
    event?.preventDefault();
    stopSpawnStreak();
    spawnBtn.classList.remove("is-spawning");
    try {
      if (event?.pointerId != null) spawnBtn.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  };

  spawnBtn.addEventListener("pointerup", endSpawn);
  spawnBtn.addEventListener("pointercancel", endSpawn);
  spawnBtn.addEventListener("lostpointercapture", () => {
    stopSpawnStreak();
    spawnBtn.classList.remove("is-spawning");
  });
}

function setActiveCard(id) {
  activeCardId = id;
  if (!worldEl) return;
  worldEl.querySelectorAll(".spatial-card").forEach((el) => {
    el.classList.toggle("spatial-card--active", Number(el.dataset.id) === id);
  });
}

function updateSelectionUi() {
  pruneSelection();
  if (worldEl) {
    worldEl.querySelectorAll(".spatial-card").forEach((el) => {
      el.classList.toggle("spatial-card--selected", selectedIds.has(el.dataset.id));
    });
  }
  positionSelectionPopup();
}

function clearSelection() {
  if (!selectedIds.size) {
    hideSelectionPopup();
    return;
  }
  selectedIds.clear();
  if (worldEl) {
    worldEl.querySelectorAll(".spatial-card--selected").forEach((el) => {
      el.classList.remove("spatial-card--selected");
    });
  }
  hideSelectionPopup();
}

function deleteSelectedCards() {
  const doomed = [...selectedIds];
  for (const id of doomed) delete state.cards[id];
  for (const [gid, group] of Object.entries(state.groups)) {
    group.cardIds = group.cardIds.filter((id) => !doomed.includes(id));
    if (!group.cardIds.length) delete state.groups[gid];
  }
  clearSelection();
  if (activeCardId && !state.cards[String(activeCardId)]) activeCardId = null;
  saveState();
  buildFenceLayout();
  renderFences();
  renderCards();
}

function createGroupFromSelection() {
  if (selectedIds.size < 2) return;
  const ids = [...selectedIds];
  const circle = computeGroupCircle(ids);
  if (!circle) return;
  const groupNum = Object.keys(state.groups).length + 1;
  const id = `g-${Date.now()}`;
  state.groups[id] = {
    label: `Группа ${groupNum}`,
    cardIds: ids,
    cx: circle.cx,
    cy: circle.cy,
    radius: circle.radius,
    color: FENCE_COLOR_CYCLE[(groupNum - 1) % FENCE_COLOR_CYCLE.length],
  };
  clearSelection();
  saveState();
  buildFenceLayout();
  renderFences();
  renderCards();
}

function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function cancelLasso() {
  if (!lassoPointer) return;
  lassoPathEl?.setAttribute("d", "");
  lassoEl?.classList.remove("is-active");
  lassoPointer = null;
}

function updateTouchPointer(event) {
  const rect = stageEl.getBoundingClientRect();
  touchPointers.set(event.pointerId, {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  });
}

function sortedTouchPointerIds() {
  return [...touchPointers.keys()].sort((a, b) => a - b);
}

function beginLasso(event) {
  const pt = stagePoint(event.clientX, event.clientY);
  lassoPointer = { id: event.pointerId, points: [pt] };
  lassoEl?.classList.add("is-active");
  setStageCursor("lasso");
}

function appendLassoPoint(clientX, clientY) {
  if (!lassoPointer) return;
  const pt = stagePoint(clientX, clientY);
  const last = lassoPointer.points[lassoPointer.points.length - 1];
  if (!last || Math.hypot(pt.x - last.x, pt.y - last.y) > 3) {
    lassoPointer.points.push(pt);
    updateLassoPathFromPoints(lassoPointer.points);
  }
}

function finishLasso() {
  if (!lassoPointer || !lassoPathEl) return;
  const pts = lassoPointer.points;
  lassoPathEl.setAttribute("d", "");
  lassoEl?.classList.remove("is-active");
  lassoPointer = null;

  if (pts.length > 4) {
    const bounds = pts.reduce(
      (acc, p) => ({
        minX: Math.min(acc.minX, p.x),
        minY: Math.min(acc.minY, p.y),
        maxX: Math.max(acc.maxX, p.x),
        maxY: Math.max(acc.maxY, p.y),
      }),
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
    );
    const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
    if (span > 8) {
      selectedIds.clear();
      for (const [id, card] of Object.entries(state.cards)) {
        const cx = card.x + CARD_SIZE * 0.5;
        const cy = card.y + CARD_SIZE * 0.5;
        if (pointInPolygon(cx, cy, pts)) selectedIds.add(id);
      }
      updateSelectionUi();
      return;
    }
  }

  clearSelection();
}

function fenceAtPoint(wx, wy) {
  let match = null;
  for (const fence of fenceLayout) {
    const dist = Math.hypot(wx - fence.cx, wy - fence.cy);
    if (dist <= fence.radius) match = fence;
  }
  return match;
}

function findGroupForCard(cardId) {
  for (const [gid, group] of Object.entries(state.groups)) {
    if (group.cardIds?.includes(cardId)) return gid;
  }
  return null;
}

function detachCardFromFences(cardId) {
  for (const [gid, group] of Object.entries(state.groups)) {
    const idx = group.cardIds?.indexOf(cardId) ?? -1;
    if (idx < 0) continue;
    group.cardIds.splice(idx, 1);
    if (!group.cardIds.length) delete state.groups[gid];
    return true;
  }
  return false;
}

function attachCardToFence(cardId, groupId) {
  if (findGroupForCard(cardId) === groupId) return false;
  detachCardFromFences(cardId);
  const group = state.groups[groupId];
  if (!group) return false;
  if (!group.cardIds.includes(cardId)) group.cardIds.push(cardId);
  return true;
}

function syncCardFenceMembership(cardIds) {
  let changed = false;
  for (const sid of cardIds) {
    const card = state.cards[sid];
    if (!card) continue;
    const cx = card.x + CARD_SIZE * 0.5;
    const cy = card.y + CARD_SIZE * 0.5;
    const fence = fenceAtPoint(cx, cy);
    if (fence) changed = attachCardToFence(sid, fence.groupId) || changed;
    else changed = detachCardFromFences(sid) || changed;
  }
  if (changed) {
    buildFenceLayout();
    renderFences();
  }
}

function cardOriginsForFence(fence) {
  const map = new Map();
  for (const id of fence.cardIds ?? []) {
    const card = state.cards[id];
    if (card) map.set(id, { x: card.x, y: card.y });
  }
  return map;
}

function applyFenceElementGeometry(el, fence) {
  const diameter = fence.radius * 2;
  el.style.left = `${fence.cx - fence.radius}px`;
  el.style.top = `${fence.cy - fence.radius - FENCE_LABEL_H}px`;
  el.style.width = `${diameter}px`;
  el.style.height = `${diameter + FENCE_LABEL_H}px`;
  el.style.setProperty("--spatial-fence-color", fence.color);
  const ring = el.querySelector(".spatial-fence__ring");
  if (ring) {
    ring.style.width = `${diameter}px`;
    ring.style.height = `${diameter}px`;
  }
  const resize = el.querySelector(".spatial-fence__resize");
  if (resize) {
    resize.style.left = `${diameter}px`;
    resize.style.top = `${FENCE_LABEL_H + fence.radius}px`;
  }
}

function startFenceMove(event, fence, fenceEl, captureEl, originClient) {
  activeGesture = {
    kind: "fence-move",
    fenceKey: fence.groupId,
    pointerId: event.pointerId,
    startClientX: originClient?.x ?? event.clientX,
    startClientY: originClient?.y ?? event.clientY,
    startCx: fence.cx,
    startCy: fence.cy,
    startRadius: fence.radius,
    cardOrigins: cardOriginsForFence(fence),
    fenceEl,
    captureEl,
    lastDx: 0,
    lastDy: 0,
  };
  captureEl.setPointerCapture(event.pointerId);
  armFenceGestureListeners();
  setStageCursor("fence-move");
}

function cancelActiveGesture() {
  if (!activeGesture) return;
  try {
    activeGesture.captureEl?.releasePointerCapture(activeGesture.pointerId);
  } catch {
    /* ignore */
  }
  activeGesture = null;
  disarmFenceGestureListeners();
  buildFenceLayout();
  renderFences();
  renderCards();
  setStageCursor(null);
}

function cycleFenceColor(groupId) {
  const group = state.groups[groupId];
  if (!group) return;
  const current = group.color ?? FENCE_COLOR_CYCLE[0];
  const idx = FENCE_COLOR_CYCLE.indexOf(current);
  const next = FENCE_COLOR_CYCLE[(idx + 1) % FENCE_COLOR_CYCLE.length];
  setGroupMeta(groupId, { color: next });
  saveState();
  buildFenceLayout();
  renderFences();
}

function bindFenceLabel(label, fence, fenceEl) {
  label.title = "Перетащить · двойной клик — цвет";

  label.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    labelDragPointer = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      fence,
      fenceEl,
      labelEl: label,
    };
    label.setPointerCapture(event.pointerId);
  });

  label.addEventListener("pointermove", (event) => {
    if (!labelDragPointer || event.pointerId !== labelDragPointer.pointerId) return;
    const dx = event.clientX - labelDragPointer.startX;
    const dy = event.clientY - labelDragPointer.startY;
    if (Math.hypot(dx, dy) > 4) {
      const pending = labelDragPointer;
      labelDragPointer = null;
      startFenceMove(event, pending.fence, pending.fenceEl, label, {
        x: pending.startX,
        y: pending.startY,
      });
    }
  });

  label.addEventListener("pointerup", (event) => {
    if (labelDragPointer?.pointerId === event.pointerId) labelDragPointer = null;
  });

  label.addEventListener("pointercancel", (event) => {
    if (labelDragPointer?.pointerId === event.pointerId) labelDragPointer = null;
  });

  label.addEventListener("dblclick", (event) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    cycleFenceColor(fence.groupId);
  });
}

function startFenceResize(event, fence, fenceEl) {
  const captureEl = event.currentTarget;
  activeGesture = {
    kind: "fence-resize",
    fenceKey: fence.groupId,
    pointerId: event.pointerId,
    anchorCx: fence.cx,
    anchorCy: fence.cy,
    startRadius: fence.radius,
    cardOrigins: new Map(),
    fenceEl,
    captureEl,
    previewRadius: null,
  };
  captureEl.setPointerCapture(event.pointerId);
  armFenceGestureListeners();
  setStageCursor("fence-resize");
}

function armFenceGestureListeners() {
  document.addEventListener("pointermove", onFenceGesturePointerMove, true);
  document.addEventListener("pointerup", onFenceGesturePointerEnd, true);
  document.addEventListener("pointercancel", onFenceGesturePointerEnd, true);
}

function disarmFenceGestureListeners() {
  document.removeEventListener("pointermove", onFenceGesturePointerMove, true);
  document.removeEventListener("pointerup", onFenceGesturePointerEnd, true);
  document.removeEventListener("pointercancel", onFenceGesturePointerEnd, true);
}

function finishActiveGesture() {
  if (!activeGesture) return;
  if (activeGesture.kind === "fence-move") {
    const nextCx = activeGesture.startCx + (activeGesture.lastDx ?? 0);
    const nextCy = activeGesture.startCy + (activeGesture.lastDy ?? 0);
    setGroupMeta(activeGesture.fenceKey, { cx: nextCx, cy: nextCy });
  }
  if (activeGesture.kind === "fence-resize" && activeGesture.previewRadius) {
    setGroupMeta(activeGesture.fenceKey, { radius: activeGesture.previewRadius });
  }
  try {
    activeGesture.captureEl?.releasePointerCapture(activeGesture.pointerId);
  } catch {
    /* ignore */
  }
  activeGesture = null;
  disarmFenceGestureListeners();
  buildFenceLayout();
  renderFences();
  renderCards();
  saveState();
  setStageCursor(null);
}

function onFenceGesturePointerMove(event) {
  if (!activeGesture || event.pointerId !== activeGesture.pointerId) return;
  event.preventDefault();
  const zoom = state.viewport.zoom;
  activeGesture.lastDx = (event.clientX - activeGesture.startClientX) / zoom;
  activeGesture.lastDy = (event.clientY - activeGesture.startClientY) / zoom;
  handleFenceGestureMove(event);
}

function onFenceGesturePointerEnd(event) {
  if (!activeGesture || event.pointerId !== activeGesture.pointerId) return;
  event.preventDefault();
  finishActiveGesture();
}

function renderFences() {
  if (!worldEl) return;
  worldEl.querySelectorAll(".spatial-fence").forEach((el) => el.remove());

  for (const fence of fenceLayout) {
    const el = document.createElement("div");
    el.className = "spatial-fence spatial-fence--circle";
    el.dataset.groupId = fence.groupId;

    const label = document.createElement("button");
    label.type = "button";
    label.className = "spatial-fence__label";
    label.textContent = fence.label;
    bindFenceLabel(label, fence, el);

    const ring = document.createElement("div");
    ring.className = "spatial-fence__ring";
    ring.setAttribute("aria-hidden", "true");

    const resize = document.createElement("button");
    resize.type = "button";
    resize.className = "spatial-fence__resize";
    resize.setAttribute("aria-label", "Размер группы");
    resize.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      event.preventDefault();
      startFenceResize(event, fence, el);
    });

    el.append(label, ring, resize);
    applyFenceElementGeometry(el, fence);
    worldEl.appendChild(el);
  }

  refreshWorldSize();
}

function createCardElement(item) {
  const category = getRadicalCategory(item);
  const meta = getCategoryMeta(category);
  const key = String(item.id);
  const card = state.cards[key];
  if (!card) return null;

  const el = document.createElement("button");
  el.type = "button";
  el.className = "spatial-card";
  el.dataset.id = key;
  el.style.width = `${CARD_SIZE}px`;
  el.style.height = `${CARD_SIZE}px`;
  el.style.left = `${card.x}px`;
  el.style.top = `${card.y}px`;
  el.style.setProperty("--spatial-card-color", meta.color);
  el.setAttribute("aria-label", `${item.id}. ${item.char}`);

  const glyph = document.createElement("span");
  glyph.className = "spatial-card__char";
  glyph.textContent = item.char;
  el.appendChild(glyph);

  if (item.id === activeCardId) el.classList.add("spatial-card--active");
  if (selectedIds.has(key)) el.classList.add("spatial-card--selected");
  if (!categoryPasses(item)) el.classList.add("spatial-card--filtered");

  el.addEventListener("click", (event) => {
    if (Date.now() < Number(el.dataset.suppressClickUntil || 0)) {
      event.preventDefault();
      return;
    }
    hooks?.onSelectRadical?.(item);
    setActiveCard(item.id);
  });

  el.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (!selectedIds.has(key)) {
      clearSelection();
      selectedIds.add(key);
      updateSelectionUi();
    }
    startCardDrag(event, item.id, el);
  });

  return el;
}

function renderCards() {
  if (!worldEl) return;
  worldEl.querySelectorAll(".spatial-card").forEach((el) => el.remove());
  for (const item of cardsOnCanvas()) {
    const el = createCardElement(item);
    if (el) worldEl.appendChild(el);
  }
  updateSelectionUi();
}

function spawnButtonTitle(baseTitle) {
  const selectedCount = activeFilters.size;
  if (selectedCount === 1) {
    const cat = RADICAL_CATEGORIES.find((c) => activeFilters.has(c.id));
    return `${baseTitle}: ${cat?.label ?? "категория"} · удерживать — серия`;
  }
  if (selectedCount > 1) {
    return `${baseTitle} из выбранных категорий · удерживать — серия`;
  }
  return `${baseTitle} · удерживать — серия`;
}

const SPAWN_SPIRAL_ICON =
  '<svg class="spatial-canvas__spawn-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4a8 8 0 1 1-5.66 13.66" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M12 8a4 4 0 1 1-2.83 6.83" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

const SPAWN_SUNFLOWER_ICON =
  '<svg class="spatial-canvas__spawn-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="2.2" fill="currentColor"/><g stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3"/><path d="M6.1 6.1l2.1 2.1M15.8 15.8l2.1 2.1M6.1 17.9l2.1-2.1M15.8 8.2l2.1-2.1"/></g></svg>';

function createSpawnButton({ glyph, iconHtml, title, mode }) {
  const spawnBtn = document.createElement("button");
  spawnBtn.type = "button";
  spawnBtn.className = "spatial-canvas__spawn";
  spawnBtn.title = spawnButtonTitle(title);
  spawnBtn.setAttribute("aria-label", spawnBtn.title);
  if (iconHtml) spawnBtn.innerHTML = iconHtml;
  else spawnBtn.innerHTML = `<span class="spatial-canvas__spawn-glyph" aria-hidden="true">${glyph}</span>`;
  bindSpawnButton(spawnBtn, mode);
  return spawnBtn;
}

function renderFilters() {
  if (!filtersEl) return;
  stopSpawnStreak();
  filtersEl.innerHTML = "";

  const spawnGroup = document.createElement("div");
  spawnGroup.className = "spatial-canvas__spawn-group";
  spawnGroup.append(
    createSpawnButton({
      glyph: "+",
      title: "Добавить рядом",
      mode: "nearby",
    }),
    createSpawnButton({
      iconHtml: SPAWN_SPIRAL_ICON,
      title: "Добавить по спирали",
      mode: "spiral",
    }),
    createSpawnButton({
      iconHtml: SPAWN_SUNFLOWER_ICON,
      title: "Добавить подсолнухом",
      mode: "sunflower",
    }),
  );
  filtersEl.appendChild(spawnGroup);

  for (const category of RADICAL_CATEGORIES) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "spatial-filter__chip";
    if (activeFilters.has(category.id)) chip.classList.add("is-active");
    chip.style.setProperty("--filter-color", category.color);
    chip.title = category.hint;
    chip.setAttribute("aria-pressed", String(activeFilters.has(category.id)));
    chip.innerHTML = `<span class="spatial-filter__dot" aria-hidden="true"></span><span class="spatial-filter__label">${category.label}</span>`;
    chip.addEventListener("click", () => {
      if (activeFilters.has(category.id)) activeFilters.delete(category.id);
      else activeFilters.add(category.id);
      renderCards();
      renderFilters();
    });
    filtersEl.appendChild(chip);
  }
}

function startCardDrag(event, id, el) {
  const key = String(id);
  const card = state.cards[key];
  if (!card) return;
  const selected = selectedIds.has(key) ? [...selectedIds] : [key];
  const origins = new Map(
    selected.map((sid) => [sid, { ...state.cards[sid] }]).filter(([, c]) => c),
  );

  dragPointer = {
    id: event.pointerId,
    cardId: id,
    el,
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
    origins,
  };
  el.setPointerCapture(event.pointerId);
  el.classList.add("spatial-card--dragging");
}

function onCardPointerMove(event) {
  if (!dragPointer || event.pointerId !== dragPointer.id) return;
  const zoom = state.viewport.zoom;
  const dx = (event.clientX - dragPointer.startX) / zoom;
  const dy = (event.clientY - dragPointer.startY) / zoom;
  if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragPointer.moved = true;

  const base = dragPointer.origins.get(String(dragPointer.cardId));
  if (!base) return;
  const nextX = base.x + dx;
  const nextY = base.y + dy;

  for (const [sid, origin] of dragPointer.origins) {
    const card = state.cards[sid];
    if (!card) continue;
    const offsetX = origin.x - base.x;
    const offsetY = origin.y - base.y;
    card.x = nextX + offsetX;
    card.y = nextY + offsetY;
    const node = worldEl?.querySelector(`.spatial-card[data-id="${sid}"]`);
    if (node) {
      node.style.left = `${card.x}px`;
      node.style.top = `${card.y}px`;
    }
  }
  refreshWorldSize();
  if (selectedIds.size >= 2) positionSelectionPopup();
  else hideSelectionPopup();
}

function endCardDrag(event) {
  if (!dragPointer || event.pointerId !== dragPointer.id) return;
  if (dragPointer.moved) {
    dragPointer.el.dataset.suppressClickUntil = String(Date.now() + 240);
    syncCardFenceMembership([...dragPointer.origins.keys()]);
    saveState();
  }
  dragPointer.el.classList.remove("spatial-card--dragging");
  dragPointer = null;
  updateSelectionUi();
}

function setStageCursor(mode) {
  stageEl?.classList.toggle("is-panning", mode === "pan");
  stageEl?.classList.toggle("is-zooming", mode === "zoom");
  stageEl?.classList.toggle("is-lassoing", mode === "lasso");
  stageEl?.classList.toggle("is-fence-move", mode === "fence-move");
  stageEl?.classList.toggle("is-fence-resize", mode === "fence-resize");
}

function beginPinch() {
  if (pinchPointerIds?.every((id) => touchPointers.has(id))) return;

  const ids = sortedTouchPointerIds();
  if (ids.length < 2) return;
  const pair = ids.slice(0, 2);
  const points = pair.map((id) => touchPointers.get(id)).filter(Boolean);
  if (points.length < 2) return;
  const [a, b] = points;
  pinchPointerIds = pair;
  pinchStart = {
    startDistance: Math.hypot(b.x - a.x, b.y - a.y),
    midpoint: { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 },
    startZoom: state.viewport.zoom,
    startPan: { x: state.viewport.x, y: state.viewport.y },
  };
  panPointer = null;
  rmbZoomPointer = null;
}

function applyPinch() {
  if (!pinchStart || touchPointers.size < 2 || !pinchPointerIds) return;
  const points = pinchPointerIds
    .map((id) => touchPointers.get(id))
    .filter(Boolean);
  if (points.length < 2) return;
  const [a, b] = points;
  const midpoint = { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  state.viewport.x = pinchStart.startPan.x + (midpoint.x - pinchStart.midpoint.x);
  state.viewport.y = pinchStart.startPan.y + (midpoint.y - pinchStart.midpoint.y);
  const ratio = distance / Math.max(1, pinchStart.startDistance);
  if (Math.abs(ratio - 1) > 0.03) {
    const nextZoom = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, pinchStart.startZoom * (1 + (ratio - 1) * PINCH_ZOOM_SENS * 6)),
    );
    const rect = stageEl.getBoundingClientRect();
    const sx = rect.left + pinchStart.midpoint.x;
    const sy = rect.top + pinchStart.midpoint.y;
    const wx = (sx - rect.left - state.viewport.x) / pinchStart.startZoom;
    const wy = (sy - rect.top - state.viewport.y) / pinchStart.startZoom;
    state.viewport.zoom = nextZoom;
    state.viewport.x = sx - rect.left - wx * nextZoom;
    state.viewport.y = sy - rect.top - wy * nextZoom;
    setStageCursor("zoom");
  } else {
    setStageCursor("pan");
  }
  applyViewportTransform();
}

function endPinchIfNeeded() {
  if (touchPointers.size >= 2) return;
  pinchStart = null;
  pinchPointerIds = null;
}

function zoomAt(clientX, clientY, factor) {
  const rect = stageEl.getBoundingClientRect();
  const { x, y, zoom } = state.viewport;
  const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
  const wx = (clientX - rect.left - x) / zoom;
  const wy = (clientY - rect.top - y) / zoom;
  state.viewport.zoom = nextZoom;
  state.viewport.x = clientX - rect.left - wx * nextZoom;
  state.viewport.y = clientY - rect.top - wy * nextZoom;
  applyViewportTransform();
  saveState();
}

function handleFenceGestureMove(event) {
  if (!activeGesture || event.pointerId !== activeGesture.pointerId) return false;
  const zoom = state.viewport.zoom;
  const dx = (event.clientX - activeGesture.startClientX) / zoom;
  const dy = (event.clientY - activeGesture.startClientY) / zoom;

  if (activeGesture.kind === "fence-move") {
    const nextCx = activeGesture.startCx + dx;
    const nextCy = activeGesture.startCy + dy;
    if (activeGesture.fenceEl) {
      const fence = {
        cx: nextCx,
        cy: nextCy,
        radius: activeGesture.startRadius,
        color: state.groups[activeGesture.fenceKey]?.color ?? FENCE_COLOR_CYCLE[0],
      };
      applyFenceElementGeometry(activeGesture.fenceEl, fence);
    }
    for (const [id, origin] of activeGesture.cardOrigins) {
      const card = state.cards[id];
      if (!card) continue;
      card.x = origin.x + dx;
      card.y = origin.y + dy;
      const node = worldEl?.querySelector(`.spatial-card[data-id="${id}"]`);
      if (node) {
        node.style.left = `${card.x}px`;
        node.style.top = `${card.y}px`;
      }
    }
    if (selectedIds.size >= 2) positionSelectionPopup();
    return true;
  }

  if (activeGesture.kind === "fence-resize") {
    const pt = stagePoint(event.clientX, event.clientY);
    const dist = Math.hypot(pt.x - activeGesture.anchorCx, pt.y - activeGesture.anchorCy);
    const nextRadius = Math.min(MAX_FENCE_RADIUS, Math.max(MIN_FENCE_RADIUS, dist));
    if (activeGesture.fenceEl) {
      const fence = {
        cx: activeGesture.anchorCx,
        cy: activeGesture.anchorCy,
        radius: nextRadius,
        color: state.groups[activeGesture.fenceKey]?.color ?? FENCE_COLOR_CYCLE[0],
      };
      applyFenceElementGeometry(activeGesture.fenceEl, fence);
    }
    activeGesture.previewRadius = nextRadius;
    return true;
  }

  return false;
}

function isInteractiveTarget(target) {
  return Boolean(
    target.closest(
      ".spatial-card, .spatial-fence__label, .spatial-fence__resize, .spatial-popup, .spatial-popup *, .modal-canvas__toolbar, .modal-canvas__toolbar *, .spatial-confirm, .spatial-confirm *, .spatial-canvas__spawn, .spatial-canvas__spawn-group",
    ),
  );
}

function onStagePointerDownCapture(event) {
  if (event.button !== 1 && event.button !== 2 && event.button !== 4) return;
  event.preventDefault();
  if (event.button === 1 || event.button === 4) {
    panPointer = { id: event.pointerId, lastX: event.clientX, lastY: event.clientY };
    stageEl.setPointerCapture(event.pointerId);
    setStageCursor("pan");
    return;
  }
  if (event.button === 2) {
    rmbZoomPointer = { id: event.pointerId, startY: event.clientY, startZoom: state.viewport.zoom };
    stageEl.setPointerCapture(event.pointerId);
    setStageCursor("zoom");
  }
}

function onStagePointerDown(event) {
  if (event.button === 1 || event.button === 2 || event.button === 4) return;
  if (isInteractiveTarget(event.target)) return;

  if (event.pointerType === "touch") {
    updateTouchPointer(event);
    event.preventDefault();
    try {
      stageEl.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }

    if (touchPointers.size >= 2) {
      cancelLasso();
      beginPinch();
      applyPinch();
      return;
    }

    if (touchPointers.size === 1) {
      beginLasso(event);
    }
    return;
  }

  if (event.button === 0) {
    beginLasso(event);
    try {
      stageEl.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  }
}

function onStagePointerMove(event) {
  if (activeGesture?.pointerId === event.pointerId) return;

  if (dragPointer && event.pointerId === dragPointer.id) {
    onCardPointerMove(event);
    return;
  }

  if (touchPointers.has(event.pointerId)) {
    event.preventDefault();
    updateTouchPointer(event);

    if (touchPointers.size >= 2) {
      if (lassoPointer) cancelLasso();
      beginPinch();
      applyPinch();
      return;
    }

    if (lassoPointer?.id === event.pointerId) {
      appendLassoPoint(event.clientX, event.clientY);
    }
    return;
  }

  if (panPointer?.id === event.pointerId) {
    event.preventDefault();
    const dx = event.clientX - panPointer.lastX;
    const dy = event.clientY - panPointer.lastY;
    state.viewport.x += dx;
    state.viewport.y += dy;
    panPointer.lastX = event.clientX;
    panPointer.lastY = event.clientY;
    applyViewportTransform();
    return;
  }

  if (rmbZoomPointer?.id === event.pointerId) {
    event.preventDefault();
    const deltaY = event.clientY - rmbZoomPointer.startY;
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, rmbZoomPointer.startZoom * Math.exp(-deltaY * RMB_ZOOM_SENS)));
    zoomAt(event.clientX, event.clientY, next / state.viewport.zoom);
    return;
  }

  if (lassoPointer?.id === event.pointerId) {
    appendLassoPoint(event.clientX, event.clientY);
    return;
  }
}

function onStagePointerUp(event) {
  if (lassoPointer?.id === event.pointerId) {
    const pt = stagePoint(event.clientX, event.clientY);
    const last = lassoPointer.points[lassoPointer.points.length - 1];
    if (!last || Math.hypot(pt.x - last.x, pt.y - last.y) > 1) {
      lassoPointer.points.push(pt);
    }
    finishLasso();
    if (touchPointers.has(event.pointerId)) touchPointers.delete(event.pointerId);
    endPinchIfNeeded();
    try {
      stageEl.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    if (!activeGesture && !touchPointers.size && !panPointer && !rmbZoomPointer && !dragPointer) {
      setStageCursor(null);
      saveState();
    }
    return;
  }

  if (activeGesture?.pointerId === event.pointerId) return;

  if (dragPointer && event.pointerId === dragPointer.id) endCardDrag(event);

  if (touchPointers.has(event.pointerId)) {
    touchPointers.delete(event.pointerId);
    if (touchPointers.size >= 2) {
      pinchPointerIds = null;
      beginPinch();
    } else {
      endPinchIfNeeded();
    }
    try {
      stageEl.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  }

  if (panPointer?.id === event.pointerId) panPointer = null;
  if (rmbZoomPointer?.id === event.pointerId) rmbZoomPointer = null;

  if (!activeGesture && !touchPointers.size && !panPointer && !rmbZoomPointer && !lassoPointer && !dragPointer) {
    setStageCursor(null);
    saveState();
  }
}

function onStageWheel(event) {
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.08 : 1 / 1.08;
    zoomAt(event.clientX, event.clientY, factor);
    return;
  }
  if (event.deltaX === 0 && event.deltaY === 0) return;
  event.preventDefault();
  state.viewport.x -= event.deltaX;
  state.viewport.y -= event.deltaY;
  applyViewportTransform();
  saveState();
}

function bindStage() {
  if (!stageEl) return;
  stageEl.addEventListener("pointerdown", onStagePointerDownCapture, true);
  stageEl.addEventListener("pointerdown", onStagePointerDown);
  stageEl.addEventListener("pointermove", onStagePointerMove);
  stageEl.addEventListener("pointerup", onStagePointerUp);
  stageEl.addEventListener("pointercancel", onStagePointerUp);
  stageEl.addEventListener("contextmenu", (e) => e.preventDefault());
  stageEl.addEventListener("wheel", onStageWheel, { passive: false });
}

function applyFullscreen(next) {
  fullscreen = next;
  rootEl?.classList.toggle("is-fullscreen", fullscreen);
  fullscreenBtn?.setAttribute("aria-pressed", String(fullscreen));
  fullscreenBtn?.setAttribute(
    "aria-label",
    fullscreen ? "Свернуть с полного экрана" : "Развернуть на весь экран",
  );
  fullscreenBtn?.setAttribute("title", fullscreen ? "Свернуть с полного экрана" : "Развернуть на весь экран");
}

function applyCollapsed(next) {
  collapsed = next;
  rootEl?.classList.toggle("is-collapsed", collapsed);
  toggleEl?.setAttribute("aria-expanded", String(!collapsed));
  toggleEl?.setAttribute("aria-label", collapsed ? "Развернуть канвас" : "Свернуть канвас");
}

function syncOrientation() {
  const nextLandscape = window.matchMedia("(orientation: landscape)").matches && window.innerWidth > 720;
  if (nextLandscape === landscape && rootEl && !rootEl.hidden) return;
  landscape = nextLandscape;
  if (rootEl && !rootEl.hidden) applyCollapsed(!landscape);
}

export function initSpatialCanvas(options) {
  hooks = options;
  rootEl = document.getElementById("modal-canvas");
  stageEl = document.getElementById("modal-canvas-stage");
  viewportEl = document.getElementById("modal-canvas-viewport");
  worldEl = document.getElementById("modal-canvas-world");
  filtersEl = document.getElementById("modal-canvas-filters");
  toggleEl = document.getElementById("modal-canvas-toggle");
  lassoEl = document.getElementById("modal-canvas-lasso");
  lassoPathEl = lassoEl?.querySelector("path") ?? null;
  popupEl = document.getElementById("modal-canvas-popup");
  deleteBtn = document.getElementById("modal-canvas-delete");
  groupBtn = document.getElementById("modal-canvas-group");
  fullscreenBtn = document.getElementById("modal-canvas-fullscreen");
  focusBtn = document.getElementById("modal-canvas-focus");
  fitBtn = document.getElementById("modal-canvas-fit");
  clearBtn = document.getElementById("modal-canvas-clear");
  toolbarEl = document.getElementById("modal-canvas-toolbar");
  clearConfirmEl = document.getElementById("modal-canvas-clear-confirm");
  clearConfirmOkBtn = document.getElementById("modal-canvas-clear-ok");
  clearConfirmCancelBtn = document.getElementById("modal-canvas-clear-cancel");

  if (!rootEl || !stageEl || !viewportEl || !worldEl || !filtersEl || !toggleEl) return;

  loadState();
  applyViewportTransform();
  buildFenceLayout();
  renderFences();
  renderFilters();
  renderCards();
  bindStage();

  toggleEl.addEventListener("click", () => applyCollapsed(!collapsed));
  fullscreenBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    applyFullscreen(!fullscreen);
  });
  fullscreenBtn?.addEventListener("pointerdown", (event) => event.stopPropagation());
  focusBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    focusActiveCard();
  });
  focusBtn?.addEventListener("pointerdown", (event) => event.stopPropagation());
  fitBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    fitAllInView({ animate: true });
  });
  fitBtn?.addEventListener("pointerdown", (event) => event.stopPropagation());
  clearBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    requestDeleteAll();
  });
  clearBtn?.addEventListener("pointerdown", (event) => event.stopPropagation());
  clearConfirmOkBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    hideClearConfirm();
    deleteAllCards();
  });
  clearConfirmCancelBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    hideClearConfirm();
  });
  clearConfirmEl?.addEventListener("pointerdown", (event) => event.stopPropagation());
  clearConfirmEl?.addEventListener("click", (event) => event.stopPropagation());
  toolbarEl?.addEventListener("pointerdown", (event) => event.stopPropagation());
  groupBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    createGroupFromSelection();
  });
  deleteBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    deleteSelectedCards();
  });
  popupEl?.addEventListener("pointerdown", (event) => event.stopPropagation());
  popupEl?.addEventListener("click", (event) => event.stopPropagation());
  window.addEventListener("resize", syncOrientation);
}

export function showSpatialCanvas() {
  if (!rootEl) return;
  rootEl.hidden = false;
  landscape = window.matchMedia("(orientation: landscape)").matches && window.innerWidth > 720;
  applyCollapsed(!landscape);
  buildFenceLayout();
  renderFences();
  renderCards();
  applyViewportTransform();
}

export function hideSpatialCanvas() {
  if (!rootEl) return;
  stopSpawnStreak();
  hideClearConfirm();
  applyFullscreen(false);
  rootEl.hidden = true;
  dragPointer = null;
  panPointer = null;
  rmbZoomPointer = null;
  lassoPointer = null;
  activeGesture = null;
  labelDragPointer = null;
  disarmFenceGestureListeners();
  touchPointers.clear();
  pinchStart = null;
  pinchPointerIds = null;
  if (focusAnimFrame) cancelAnimationFrame(focusAnimFrame);
  clearSelection();
}

export function revealSpatialCard(item) {
  if (!item) return;
  ensureCard(item);
  setActiveCard(item.id);
  renderCards();
  if (!isCardInView(item)) focusOnCard(item, { animate: true });
}

export function setSpatialCanvasActive(item) {
  if (item?.id) setActiveCard(item.id);
}
