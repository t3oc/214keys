import { getHeroEaseConfig, HERO_MOTION_DEFAULT, setHeroEaseConfig } from "./speakerParticles.js";

const HERO_EASE_DEBUG_KEY = "214keys-hero-ease-debug-v2";
export const HERO_EASE_DEBUG_HIDDEN_KEY = "214keys-hero-ease-debug-hidden";
const HERO_AXIS_SPIN_MAX_TURNS = 3;

const EASE_CHANNELS = [
  { id: "flight", label: "полёт" },
  { id: "emojiFlight", label: "emoji полёт" },
  { id: "rotation", label: "ротация" },
  { id: "scale", label: "shrink ease" },
];

const SCALE_CHANNELS = [
  { id: "initialScale", label: "initial scale", min: 25, max: 200, default: HERO_MOTION_DEFAULT.initialScale },
  { id: "systemScale", label: "system scale", min: 25, max: 200, default: HERO_MOTION_DEFAULT.systemScale },
  { id: "axisSpin", label: "ray spin", min: 0, max: 100, default: HERO_MOTION_DEFAULT.axisSpin },
];

const DEBUG_STYLES = `
.hero-ease-debug {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  width: 100%;
  margin: 0;
  padding: 0.45rem 0.5rem 0.5rem;
  border: 1px dashed color-mix(in srgb, var(--speaker-active, #c48a28) 55%, var(--border-strong));
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--speaker-active, #c48a28) 8%, var(--bg-elevated));
}

.hero-ease-debug--hidden,
.hero-ease-debug[hidden] {
  display: none !important;
}

.hero-ease-debug__title {
  font-size: 0.66rem;
  letter-spacing: 0.03em;
  color: var(--text-secondary);
}

.hero-ease-debug__control {
  --weight-control-h: 2.85rem;
  --weight-control-frame: 0.28rem;
  --hero-ease-thumb-w: 1.1rem;
  position: relative;
  display: block;
  width: 100%;
  height: var(--weight-control-h);
  border: 1px dashed color-mix(in srgb, var(--border-strong) 55%, transparent);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--bg-elevated) 92%, transparent);
  cursor: pointer;
  touch-action: manipulation;
  overflow: hidden;
}

.hero-ease-debug__control::before {
  content: "";
  position: absolute;
  inset: var(--weight-control-frame);
  z-index: 0;
  pointer-events: none;
  background: linear-gradient(
    to right,
    color-mix(in srgb, var(--text-muted) 16%, transparent) 0,
    color-mix(in srgb, var(--text-muted) 8%, transparent) 50%,
    color-mix(in srgb, var(--text-muted) 16%, transparent) 100%
  );
}

.hero-ease-debug__label {
  position: absolute;
  top: 50%;
  left: calc(var(--weight-control-frame) + 0.55rem);
  z-index: 0;
  transform: translateY(-50%);
  pointer-events: none;
  font-size: 0.66rem;
  letter-spacing: 0.03em;
  color: var(--text-muted);
}

.hero-ease-debug__value {
  position: absolute;
  top: 50%;
  right: calc(var(--weight-control-frame) + 0.55rem);
  z-index: 2;
  transform: translateY(-50%);
  pointer-events: none;
  min-width: 4.5rem;
  text-align: right;
  font-size: 0.82rem;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
  text-transform: lowercase;
  color: var(--text-secondary);
}

.hero-ease-debug__slider {
  position: absolute;
  inset: var(--weight-control-frame);
  z-index: 1;
  width: auto;
  height: auto;
  margin: 0;
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
  cursor: pointer;
}

.hero-ease-debug__slider::-webkit-slider-runnable-track {
  height: 100%;
  background: transparent;
  border: none;
}

.hero-ease-debug__slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: var(--hero-ease-thumb-w);
  height: calc(var(--weight-control-h) - (var(--weight-control-frame) * 2));
  border: 1px solid color-mix(in srgb, var(--text-muted) 45%, transparent);
  border-radius: 0;
  background: color-mix(in srgb, var(--text-muted) 14%, transparent);
}

.hero-ease-debug__slider::-moz-range-track {
  height: 100%;
  background: transparent;
  border: none;
}

.hero-ease-debug__slider::-moz-range-thumb {
  width: var(--hero-ease-thumb-w);
  height: calc(var(--weight-control-h) - (var(--weight-control-frame) * 2));
  border: 1px solid color-mix(in srgb, var(--text-muted) 45%, transparent);
  border-radius: 0;
  background: color-mix(in srgb, var(--text-muted) 14%, transparent);
}
`;

function formatEaseBias(value) {
  const n = Math.round(Number(value));
  if (n <= 2) return "ease in";
  if (n >= 98) return "ease out";
  if (n >= 48 && n <= 52) return "linear";
  if (n < 50) return `${n} · in`;
  return `${n} · out`;
}

function formatScaleBias(value) {
  const n = Math.round(Number(value));
  return `×${(n / 100).toFixed(2)}`;
}

function formatAxisSpin(value) {
  const n = Math.round(Number(value));
  const turns = (n / 100) * HERO_AXIS_SPIN_MAX_TURNS;
  return turns <= 0 ? "0 rev" : `${turns.toFixed(2)} rev`;
}

function readHeroEaseDebugHidden() {
  try {
    return localStorage.getItem(HERO_EASE_DEBUG_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function isHeroEaseDebugVisible() {
  const panel = document.getElementById("hero-ease-debug");
  if (!panel) return true;
  return !panel.hidden && !panel.classList.contains("hero-ease-debug--hidden");
}

export function setHeroEaseDebugVisible(visible, { persist = true } = {}) {
  const panel = document.getElementById("hero-ease-debug");
  if (!panel) return false;
  const hidden = !visible;
  panel.hidden = hidden;
  panel.classList.toggle("hero-ease-debug--hidden", hidden);
  if (persist) {
    try {
      localStorage.setItem(HERO_EASE_DEBUG_HIDDEN_KEY, hidden ? "1" : "0");
    } catch {
      /* ignore */
    }
  }
  return true;
}

function applyHeroEaseDebugVisibility() {
  setHeroEaseDebugVisible(!readHeroEaseDebugHidden(), { persist: false });
}

function ensureHeroEaseDebugStyles() {
  if (document.getElementById("hero-ease-debug-styles")) return;
  const style = document.createElement("style");
  style.id = "hero-ease-debug-styles";
  style.textContent = DEBUG_STYLES;
  document.head.appendChild(style);
}

function createSliderRow(channel, kind) {
  const isEase = kind === "ease";
  const min = isEase ? 0 : channel.min;
  const max = isEase ? 100 : channel.max;
  const step = 1;
  const defaultValue = isEase ? (HERO_MOTION_DEFAULT[channel.id] ?? 50) : channel.default;
  const defaultLabel = isEase
    ? formatEaseBias(defaultValue)
    : channel.id === "axisSpin"
      ? formatAxisSpin(defaultValue)
      : formatScaleBias(defaultValue);

  const label = document.createElement("label");
  label.className = "hero-ease-debug__control";
  label.htmlFor = `hero-ease-${channel.id}`;
  label.innerHTML = `
    <span class="hero-ease-debug__label">${channel.label}</span>
    <span class="hero-ease-debug__value" id="hero-ease-value-${channel.id}">${defaultLabel}</span>
    <input
      type="range"
      id="hero-ease-${channel.id}"
      class="hero-ease-debug__slider"
      min="${min}"
      max="${max}"
      step="${step}"
      value="${defaultValue}"
      aria-label="DEBUG ${channel.label}"
      aria-valuemin="${min}"
      aria-valuemax="${max}"
      aria-valuenow="${defaultValue}"
    >
  `;
  return { label, input: label.querySelector("input"), kind };
}

function mountHeroEaseDebugPanel() {
  const card = document.querySelector(".modal__card");
  if (!card || document.getElementById("hero-ease-debug")) return false;

  ensureHeroEaseDebugStyles();

  const panel = document.createElement("div");
  panel.id = "hero-ease-debug";
  panel.className = "hero-ease-debug";
  panel.innerHTML = `<div class="hero-ease-debug__title">DEBUG · hero motion (ease 0 in · 50 linear · 100 out)</div>`;

  /** @type {Record<string, { input: HTMLInputElement, kind: string }>} */
  const sliders = {};

  for (const channel of EASE_CHANNELS) {
    const row = createSliderRow(channel, "ease");
    panel.appendChild(row.label);
    sliders[channel.id] = { input: row.input, kind: "ease" };
  }

  for (const channel of SCALE_CHANNELS) {
    const row = createSliderRow(channel, "scale");
    panel.appendChild(row.label);
    sliders[channel.id] = { input: row.input, kind: "scale" };
  }

  card.insertAdjacentElement("beforebegin", panel);

  function applyHeroEaseConfig(next, { persist = true } = {}) {
    setHeroEaseConfig(next);
    const config = getHeroEaseConfig();

    for (const channel of EASE_CHANNELS) {
      const slider = sliders[channel.id]?.input;
      const valueEl = document.getElementById(`hero-ease-value-${channel.id}`);
      const value = Math.round(config[channel.id] ?? 50);
      if (slider) {
        slider.value = String(value);
        slider.setAttribute("aria-valuenow", String(value));
      }
      if (valueEl) valueEl.textContent = formatEaseBias(value);
    }

    for (const channel of SCALE_CHANNELS) {
      const slider = sliders[channel.id]?.input;
      const valueEl = document.getElementById(`hero-ease-value-${channel.id}`);
      const value = Math.round(config[channel.id] ?? channel.default);
      if (slider) {
        slider.value = String(value);
        slider.setAttribute("aria-valuenow", String(value));
      }
      if (valueEl) {
        valueEl.textContent =
          channel.id === "axisSpin" ? formatAxisSpin(value) : formatScaleBias(value);
      }
    }

    if (persist) {
      try {
        localStorage.setItem(HERO_EASE_DEBUG_KEY, JSON.stringify(config));
      } catch {
        /* ignore */
      }
    }
  }

  for (const [id, { input }] of Object.entries(sliders)) {
    input.addEventListener("input", () => {
      applyHeroEaseConfig({ [id]: Number(input.value) });
    });
  }

  try {
    const saved = localStorage.getItem(HERO_EASE_DEBUG_KEY);
    applyHeroEaseConfig(saved ? { ...HERO_MOTION_DEFAULT, ...JSON.parse(saved) } : HERO_MOTION_DEFAULT);
  } catch {
    applyHeroEaseConfig({ ...HERO_MOTION_DEFAULT }, { persist: false });
  }

  applyHeroEaseDebugVisibility();
  document.dispatchEvent(new CustomEvent("hero-ease-debug:mounted"));

  return true;
}

export function mountHeroEaseDebug() {
  if (mountHeroEaseDebugPanel()) return;

  const modal = document.getElementById("modal");
  if (!modal || modal.dataset.heroEaseDebugBound === "1") return;
  modal.dataset.heroEaseDebugBound = "1";
  modal.addEventListener("toggle", () => {
    if (modal.open) mountHeroEaseDebugPanel();
  });
}
