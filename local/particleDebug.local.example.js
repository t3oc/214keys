// Скопируй в particleDebug.local.js — этот файл в .gitignore и не попадает в push.
// cp local/particleDebug.local.example.js local/particleDebug.local.js

import {
  getParticleProfile,
  getParticleProfileCount,
  getParticleProfileLabel,
  getHeroEaseConfig,
  profileLevelFromName,
  profileNameFromLevel,
  setHeroEaseConfig,
  setParticleProfile,
} from "../js/speakerParticles.js";

const PARTICLE_DEBUG_KEY = "214keys-particle-debug";
const EMOJI_FLIGHT_EASE_KEY = "214keys-emoji-flight-ease";

const DEBUG_STYLES = `
.particle-debug-control {
  --weight-control-h: 2.85rem;
  --weight-control-frame: 0.28rem;
  --particle-debug-steps: 3;
  --particle-debug-thumb-w: 1.45rem;
  position: relative;
  display: block;
  width: 100%;
  height: var(--weight-control-h);
  margin-top: 0.45rem;
  border: 1px dashed color-mix(in srgb, var(--border-strong) 72%, transparent);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--bg-elevated) 88%, transparent);
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  overflow: hidden;
}

.particle-debug-control::before {
  content: "";
  position: absolute;
  inset: var(--weight-control-frame);
  z-index: 0;
  pointer-events: none;
  background: repeating-linear-gradient(
    to right,
    color-mix(in srgb, var(--border-strong) 24%, transparent) 0,
    color-mix(in srgb, var(--border-strong) 24%, transparent) 1px,
    transparent 1px,
    transparent calc(100% / var(--particle-debug-steps))
  );
}

.particle-debug-control__title {
  position: absolute;
  top: 50%;
  left: calc(var(--weight-control-frame) + 0.55rem);
  z-index: 0;
  transform: translateY(-50%);
  pointer-events: none;
  max-width: 58%;
  font-size: 0.66rem;
  letter-spacing: 0.03em;
  color: var(--text-muted);
}

.particle-debug-control__value {
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

.particle-debug-control__slider {
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
  touch-action: manipulation;
}

.particle-debug-control__slider::-webkit-slider-runnable-track {
  height: 100%;
  background: transparent;
  border: none;
}

.particle-debug-control__slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: var(--particle-debug-thumb-w);
  height: calc(var(--weight-control-h) - (var(--weight-control-frame) * 2));
  margin-top: 0;
  border: 1px solid color-mix(in srgb, var(--text-muted) 45%, transparent);
  border-radius: 0;
  background: color-mix(in srgb, var(--text-muted) 14%, transparent);
  box-shadow: none;
}

.particle-debug-control__slider::-moz-range-track {
  height: 100%;
  background: transparent;
  border: none;
}

.particle-debug-control__slider::-moz-range-thumb {
  width: var(--particle-debug-thumb-w);
  height: calc(var(--weight-control-h) - (var(--weight-control-frame) * 2));
  border: 1px solid color-mix(in srgb, var(--text-muted) 45%, transparent);
  border-radius: 0;
  background: color-mix(in srgb, var(--text-muted) 14%, transparent);
  box-shadow: none;
}
`;

export function mountParticleDebug() {
  const fontWeightControl = document.querySelector(".font-weight-control");
  if (!fontWeightControl || document.getElementById("particle-debug-slider")) return;

  const profileCount = getParticleProfileCount();
  const profileSteps = Math.max(1, profileCount - 1);
  const defaultLevel = profileLevelFromName(getParticleProfile());

  if (!document.getElementById("particle-debug-styles")) {
    const style = document.createElement("style");
    style.id = "particle-debug-styles";
    style.textContent = DEBUG_STYLES;
    document.head.appendChild(style);
  }

  const label = document.createElement("label");
  label.className = "particle-debug-control";
  label.htmlFor = "particle-debug-slider";
  label.innerHTML = `
    <span class="particle-debug-control__title">DEBUG · профиль частиц (для проверки)</span>
    <span class="particle-debug-control__value" id="particle-debug-value">desktop</span>
    <input
      type="range"
      id="particle-debug-slider"
      class="particle-debug-control__slider"
      min="1"
      max="${profileCount}"
      step="1"
      value="${defaultLevel}"
      aria-label="DEBUG профиль частиц для проверки"
      aria-valuemin="1"
      aria-valuemax="${profileCount}"
      aria-valuenow="${defaultLevel}"
    >
  `;

  fontWeightControl.insertAdjacentElement("afterend", label);

  const particleDebugSlider = document.getElementById("particle-debug-slider");
  const particleDebugValue = document.getElementById("particle-debug-value");
  const particleDebugControl = label;

  function syncParticleDebugSliderLayout() {
    if (!particleDebugSlider) return;
    const trackWidth = particleDebugSlider.clientWidth;
    const thumbW = trackWidth / profileSteps;
    particleDebugControl.style.setProperty("--particle-debug-steps", String(profileSteps));
    particleDebugControl.style.setProperty("--particle-debug-thumb-w", `${thumbW}px`);
  }

  function applyParticleDebugLevel(level, { persist = true } = {}) {
    const name = profileNameFromLevel(level);
    setParticleProfile(name);
    const nextLevel = profileLevelFromName(name);

    if (particleDebugSlider) {
      particleDebugSlider.value = String(nextLevel);
      particleDebugSlider.setAttribute("aria-valuenow", String(nextLevel));
    }

    if (particleDebugValue) {
      particleDebugValue.textContent = getParticleProfileLabel(name);
    }

    syncParticleDebugSliderLayout();

    if (persist) {
      try {
        localStorage.setItem(PARTICLE_DEBUG_KEY, String(nextLevel));
      } catch {
        /* ignore */
      }
    }
  }

  try {
    const savedLevel = localStorage.getItem(PARTICLE_DEBUG_KEY);
    applyParticleDebugLevel(savedLevel ? Number(savedLevel) : profileLevelFromName(getParticleProfile()));
  } catch {
    applyParticleDebugLevel(profileLevelFromName(getParticleProfile()), { persist: false });
  }

  particleDebugSlider?.addEventListener("input", () => {
    applyParticleDebugLevel(particleDebugSlider.value);
  });

  window.addEventListener("resize", syncParticleDebugSliderLayout);
  requestAnimationFrame(syncParticleDebugSliderLayout);

  if (document.getElementById("emoji-flight-ease-slider")) return;

  const emojiEaseLabel = document.createElement("label");
  emojiEaseLabel.className = "particle-debug-control";
  emojiEaseLabel.htmlFor = "emoji-flight-ease-slider";
  emojiEaseLabel.style.setProperty("--particle-debug-steps", "1");
  const defaultEmojiFlight = getHeroEaseConfig().emojiFlight ?? 91;
  emojiEaseLabel.innerHTML = `
    <span class="particle-debug-control__title">DEBUG · easing полёта emoji</span>
    <span class="particle-debug-control__value" id="emoji-flight-ease-value">${defaultEmojiFlight}</span>
    <input
      type="range"
      id="emoji-flight-ease-slider"
      class="particle-debug-control__slider"
      min="0"
      max="100"
      step="1"
      value="${defaultEmojiFlight}"
      aria-label="DEBUG easing полёта emoji"
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow="${defaultEmojiFlight}"
    >
  `;
  label.insertAdjacentElement("afterend", emojiEaseLabel);

  const emojiFlightSlider = document.getElementById("emoji-flight-ease-slider");
  const emojiFlightValue = document.getElementById("emoji-flight-ease-value");

  function applyEmojiFlightEase(value, { persist = true } = {}) {
    const eased = Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
    setHeroEaseConfig({ emojiFlight: eased });
    if (emojiFlightSlider) {
      emojiFlightSlider.value = String(eased);
      emojiFlightSlider.setAttribute("aria-valuenow", String(eased));
    }
    if (emojiFlightValue) emojiFlightValue.textContent = String(eased);
    if (persist) {
      try {
        localStorage.setItem(EMOJI_FLIGHT_EASE_KEY, String(eased));
      } catch {
        /* ignore */
      }
    }
  }

  try {
    const saved = localStorage.getItem(EMOJI_FLIGHT_EASE_KEY);
    applyEmojiFlightEase(saved != null ? saved : defaultEmojiFlight);
  } catch {
    applyEmojiFlightEase(defaultEmojiFlight, { persist: false });
  }

  emojiFlightSlider?.addEventListener("input", () => {
    applyEmojiFlightEase(emojiFlightSlider.value);
  });
}
