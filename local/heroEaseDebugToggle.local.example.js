// Скопируй в heroEaseDebugToggle.local.js — файл в .gitignore и не попадает в push.
// cp local/heroEaseDebugToggle.local.example.js local/heroEaseDebugToggle.local.js

import {
  isHeroEaseDebugVisible,
  setHeroEaseDebugVisible,
} from "../js/heroEaseDebug.js";

const TOGGLE_STYLES = `
.hero-ease-debug-toggle-bar {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  width: 100%;
  margin: 0 0 0.35rem;
}

.hero-ease-debug-toggle {
  padding: 0.22rem 0.55rem;
  border: 1px dashed color-mix(in srgb, var(--border-strong) 72%, transparent);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--bg-elevated) 88%, transparent);
  color: var(--text-muted);
  font: inherit;
  font-size: 0.66rem;
  letter-spacing: 0.03em;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.hero-ease-debug-toggle:hover {
  color: var(--text);
  border-color: var(--border-strong);
}

.hero-ease-debug-toggle:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--focus-ring-strong);
}
`;

function ensureToggleStyles() {
  if (document.getElementById("hero-ease-debug-toggle-styles")) return;
  const style = document.createElement("style");
  style.id = "hero-ease-debug-toggle-styles";
  style.textContent = TOGGLE_STYLES;
  document.head.appendChild(style);
}

function updateToggleButton(btn) {
  const visible = isHeroEaseDebugVisible();
  btn.textContent = visible ? "скрыть debug" : "показать debug";
  btn.setAttribute("aria-pressed", String(visible));
  btn.setAttribute("aria-expanded", String(visible));
  btn.setAttribute("aria-controls", "hero-ease-debug");
}

function mountToggleBar() {
  const panel = document.getElementById("hero-ease-debug");
  if (!panel || document.getElementById("hero-ease-debug-toggle")) return false;

  ensureToggleStyles();

  const bar = document.createElement("div");
  bar.id = "hero-ease-debug-toggle-bar";
  bar.className = "hero-ease-debug-toggle-bar";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "hero-ease-debug-toggle";
  btn.className = "hero-ease-debug-toggle";
  bar.appendChild(btn);

  panel.insertAdjacentElement("beforebegin", bar);
  updateToggleButton(btn);

  btn.addEventListener("click", () => {
    setHeroEaseDebugVisible(!isHeroEaseDebugVisible());
    updateToggleButton(btn);
  });

  return true;
}

export function mountHeroEaseDebugToggle() {
  if (mountToggleBar()) return;

  document.addEventListener("hero-ease-debug:mounted", mountToggleBar, { once: true });

  const modal = document.getElementById("modal");
  modal?.addEventListener("toggle", () => {
    if (modal.open) requestAnimationFrame(mountToggleBar);
  });
}
