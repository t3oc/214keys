import { PITCH_MAX, PITCH_MIN } from "./radicalSpeech.js";

const LOW = { h: 168, s: 52, lOffset: -3 };
const HIGH = { h: 76, s: 84, lOffset: 14 };

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function parseHexColor(hex) {
  const raw = hex.replace("#", "").trim();
  if (raw.length !== 6) return null;
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16),
  };
}

function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;

  return { h, s: s * 100, l: l * 100 };
}

function readMidHsl() {
  const hex = getComputedStyle(document.documentElement).getPropertyValue("--speaker-active").trim();
  const rgb = parseHexColor(hex);
  if (!rgb) return { h: 35, s: 30, l: 42 };
  return rgbToHsl(rgb.r, rgb.g, rgb.b);
}

function hslCss({ h, s, l }, alpha) {
  if (alpha != null) return `hsla(${h}, ${s}%, ${l}%, ${alpha})`;
  return `hsl(${h}, ${s}%, ${l}%)`;
}

function pitchBlend(rate) {
  const t = Math.max(0, Math.min(1, (rate - PITCH_MIN) / (PITCH_MAX - PITCH_MIN)));
  const mid = readMidHsl();

  if (t <= 0.5) {
    const u = t * 2;
    return {
      h: lerp(LOW.h, mid.h, u),
      s: lerp(LOW.s, mid.s, u),
      l: lerp(mid.l + LOW.lOffset, mid.l, u),
    };
  }

  const u = (t - 0.5) * 2;
  return {
    h: lerp(mid.h, HIGH.h, u),
    s: lerp(mid.s, HIGH.s, u),
    l: lerp(mid.l, Math.min(72, mid.l + HIGH.lOffset), u),
  };
}

export function pitchColorsForRate(rate) {
  const hsl = pitchBlend(rate);
  const dark = document.documentElement.dataset.theme === "dark";
  return {
    active: hslCss(hsl),
    bg: hslCss(hsl, dark ? 0.15 : 0.18),
    border: hslCss(hsl, dark ? 0.35 : 0.45),
  };
}

const TINT_PROPS = ["--speaker-active", "--speaker-active-bg", "--speaker-active-border", "--wave-active"];

export function applyPitchTint(elements, rate) {
  const tint = pitchColorsForRate(rate);
  for (const el of elements) {
    if (!el) continue;
    el.style.setProperty("--speaker-active", tint.active);
    el.style.setProperty("--speaker-active-bg", tint.bg);
    el.style.setProperty("--speaker-active-border", tint.border);
    el.style.setProperty("--wave-active", tint.active);
  }
}

export function clearPitchTint(elements) {
  for (const el of elements) {
    if (!el) continue;
    for (const prop of TINT_PROPS) el.style.removeProperty(prop);
  }
}
