// cp local/heroEaseDebug.local.example.js local/heroEaseDebug.local.js

import { getHeroEaseConfig, setHeroEaseConfig } from "../js/speakerParticles.js";

const HERO_EASE_DEBUG_KEY = "214keys-hero-ease-debug";

const EASE_CHANNELS = [
  { id: "flight", label: "полёт" },
  { id: "rotation", label: "ротация" },
  { id: "scale", label: "scale" },
];

const DEBUG_STYLES = `
.hero-ease-debug {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  width: 100%;
  margin: 0 0 0.65rem;
  padding: 0.45rem 0.5rem 0.5rem;
  border: 1px dashed color-mix(in srgb, var(--border-strong) 72%, transparent);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--bg-elevated) 88%, transparent);
}

.hero-ease-debug__title {
  font-size: 0.66rem;
  letter-spacing: 0.03em;
  color: var(--text-muted);
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

export function mountHeroEaseDebug() {
  const host = document.querySelector(".modal__inner");
  if (!host || document.getElementById("hero-ease-debug")) return;

  if (!document.getElementById("hero-ease-debug-styles")) {
    const style = document.createElement("style");
    style.id = "hero-ease-debug-styles";
    style.textContent = DEBUG_STYLES;
    document.head.appendChild(style);
  }

  const panel = document.createElement("div");
  panel.id = "hero-ease-debug";
  panel.className = "hero-ease-debug";
  panel.innerHTML = `<div class="hero-ease-debug__title">DEBUG · easing hero (0 in · 50 linear · 100 out)</div>`;

  const sliders = {};

  for (const channel of EASE_CHANNELS) {
    const label = document.createElement("label");
    label.className = "hero-ease-debug__control";
    label.htmlFor = `hero-ease-${channel.id}`;
    label.innerHTML = `
      <span class="hero-ease-debug__label">${channel.label}</span>
      <span class="hero-ease-debug__value" id="hero-ease-value-${channel.id}">linear</span>
      <input
        type="range"
        id="hero-ease-${channel.id}"
        class="hero-ease-debug__slider"
        min="0"
        max="100"
        step="1"
        value="50"
        aria-label="DEBUG easing ${channel.label}"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow="50"
      >
    `;
    panel.appendChild(label);
    sliders[channel.id] = label.querySelector("input");
  }

  host.insertBefore(panel, host.firstChild);

  function applyHeroEaseConfig(next, { persist = true } = {}) {
    setHeroEaseConfig(next);
    const config = getHeroEaseConfig();

    for (const channel of EASE_CHANNELS) {
      const slider = sliders[channel.id];
      const valueEl = document.getElementById(`hero-ease-value-${channel.id}`);
      const value = Math.round(config[channel.id] ?? 50);
      if (slider) {
        slider.value = String(value);
        slider.setAttribute("aria-valuenow", String(value));
      }
      if (valueEl) valueEl.textContent = formatEaseBias(value);
    }

    if (persist) {
      try {
        localStorage.setItem(HERO_EASE_DEBUG_KEY, JSON.stringify(config));
      } catch {
        /* ignore */
      }
    }
  }

  for (const channel of EASE_CHANNELS) {
    sliders[channel.id]?.addEventListener("input", () => {
      applyHeroEaseConfig({ [channel.id]: Number(sliders[channel.id].value) });
    });
  }

  try {
    const saved = localStorage.getItem(HERO_EASE_DEBUG_KEY);
    applyHeroEaseConfig(saved ? JSON.parse(saved) : getHeroEaseConfig());
  } catch {
    applyHeroEaseConfig(getHeroEaseConfig(), { persist: false });
  }
}
