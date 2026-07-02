import { getRadicalEmoji } from "./radicalEmoji.js";
import {
  ensureGlyphFontsReady,
  initGlyphThreeStage,
  prepareGlyphExtrusionFonts,
  releaseGlyphMeshInstance,
  renderGlyphThreeStage,
  requestGlyphMeshForParticle,
  requestEmojiPlaneForParticle,
  warmUpEmojiPlane,
  syncGlyphMeshTransform,
  warmUpGlyphExtrusion,
  prewarmGlyphMesh,
} from "./glyphExtrusion3d.js";

const COUNT_REDUCED = [3, 5];
const JP_WHITE_CHANCE = 0.72;
const THEME_EMOJI_CHANCE = 0.72;
const CN_HUE_STEPS = 12;
const HERO_OCTANTS = 8;
const HERO_SLOT = Math.PI / 8;
const HERO_SUN_BASE = -Math.PI / 2;

const isIOSDevice =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const isAndroidDevice = /Android/i.test(navigator.userAgent);

const isCoarsePointer = matchMedia("(pointer: coarse)").matches;

/** @type {"android" | "ios" | "lowfps" | "desktop" | "ultra"} */
let particleProfileName = "desktop";
let debugHeroRenderOverride = false;

/** @type {ActiveParticle[]} */
let particles = [];
let rafId = 0;
let lastTs = 0;
let skipFrame = false;
let reducedMotion = false;
let cnPressIndex = 0;
let heroPlaybackTimer = 0;
let heroPlaybackAnchor = null;
let heroPlaybackItem = null;
let heroBurstSpin = 0;
let heroBurstSeq = 0;

/** @type {null | "full" | "simple"} */
let heroRenderMode = null;
let fpsBenchmarkDone = false;
let fpsBenchmarkActive = false;
let fpsBenchmarkTapCount = 0;
let fpsBenchmarkFinalizePending = false;
let fpsBenchmarkFrames = 0;
let fpsBenchmarkSum = 0;
let fpsBenchmarkLastTs = 0;
let fpsBenchmarkFinalizeTimer = 0;
let fullWatchActive = false;
let fullWatchTapCount = 0;
let fullWatchProbeActive = false;

const HERO_RENDER_MODE_KEY = "214keys-hero-render-v3";
const LEGACY_HERO_RENDER_MODE_KEYS = ["214keys-hero-render", "214keys-hero-render-v2"];
const FPS_BENCHMARK_TAPS = 2;
const FULL_WATCH_TAPS = 3;
const FPS_PROBE_MS = 750;
const FPS_SIMPLE_THRESHOLD = 15;
const FPS_BENCHMARK_MIN_FRAMES = 3;
const FPS_FRAME_GAP_MAX = 250;
const GLOBAL_MAX_PARTICLES = 64;
const ECONOMY_MAX_PARTICLES = 6;
const ECONOMY_SPEAKER_GLYPHS = 2;
const ECONOMY_SPEAKER_EMOJI = 2;
const ECONOMY_SPEAKER_HERO_EMOJI = 2;
const HERO_SIMPLE_EMOJI_COUNT = 6;
const SPEAKER_LIFE_MS = 1000;
const SPEAKER_SCALE_FALLOFF = 0.85;
const SPEAKER_SCALE_MIN = 0.2;
const HERO_PARTICLE_SCALE_FALLOFF = 1.35;
const HERO_PARTICLE_SCALE_MIN = 0.14;
const HERO_FADE_HOLD = 0.4;
const HERO_EASE_POWER_MIN = 1;
const HERO_EASE_POWER_MAX = 8;
const HERO_TRAVEL_DISTANCE_FACTOR = 0.4;
const HERO_SUN_SPEED_CLICK = 355;
const HERO_SUN_SPEED_PLAYBACK = 265;
const HERO_SUN_SIZE_CLICK = 48;
const HERO_SUN_SIZE_PLAYBACK = 42;
const HERO_EMOJI_3D_SIZE = 24;
const GLYPH_LOAD_TIMEOUT_MS = 25000;

/** @typedef {'line' | 'sphere'} HeroSun3dSpawnMode */

/** Ultra 3D sun layouts. `line` = из центра по прямым; `sphere` = с оболочки шара. */
const HERO_SUN_3D_PRESETS = {
  line: { ringRadius: 0 },
  sphere: { ringRadius: 16 },
};

/** @type {HeroSun3dSpawnMode} */
const HERO_SUN_3D_SPAWN_MODE = "line";

const PARTICLE_PROFILES = {
  desktop: {
    maxParticles: GLOBAL_MAX_PARTICLES,
    skipFrame: false,
    fastCullOnBurst: false,
    heroClickLifeMs: 1300,
    heroPlaybackLifeMs: 600,
    speakerCount: [6, 10],
  },
  android: {
    maxParticles: ECONOMY_MAX_PARTICLES,
    skipFrame: false,
    fastCullOnBurst: true,
    maxHeroBursts: 2,
    cullFadeMs: 260,
    heroClickLifeMs: 1050,
    heroPlaybackLifeMs: 450,
    speakerCount: [4, 8],
  },
  ios: {
    maxParticles: ECONOMY_MAX_PARTICLES,
    skipFrame: true,
    fastCullOnBurst: true,
    maxHeroBursts: 2,
    cullFadeMs: 230,
    heroClickLifeMs: 900,
    heroPlaybackLifeMs: 390,
    speakerCount: [3, 6],
  },
  lowfps: {
    maxParticles: ECONOMY_MAX_PARTICLES,
    skipFrame: false,
    fastCullOnBurst: true,
    maxHeroBursts: 1,
    cullFadeMs: 160,
    heroClickLifeMs: 700,
    heroPlaybackLifeMs: 340,
    speakerCount: [4, 4],
  },
  ultra: {
    maxParticles: GLOBAL_MAX_PARTICLES,
    skipFrame: false,
    fastCullOnBurst: false,
    heroClickLifeMs: 1400,
    heroPlaybackLifeMs: 620,
    speakerCount: [6, 10],
    glyph3d: true,
  },
};

const SIMPLE_HERO_PROFILE = {
  maxParticles: ECONOMY_MAX_PARTICLES,
  skipFrame: false,
  fastCullOnBurst: true,
  maxHeroBursts: 1,
  cullFadeMs: 190,
  heroClickLifeMs: 750,
  heroPlaybackLifeMs: 350,
  speakerCount: [4, 4],
};

const PROFILE_ORDER = ["android", "ios", "lowfps", "desktop", "ultra"];

export const GRAPHICS_MODE_PROFILE = {
  low: "lowfps",
  "2d": "desktop",
  "3d": "ultra",
};

export const GRAPHICS_MODE_ORDER = ["low", "2d", "3d"];

export function getGraphicsMode() {
  for (const mode of GRAPHICS_MODE_ORDER) {
    if (GRAPHICS_MODE_PROFILE[mode] === particleProfileName) return mode;
  }
  if (particleProfileName === "android" || particleProfileName === "ios") return "low";
  return "2d";
}

export function setGraphicsMode(mode) {
  const profile = GRAPHICS_MODE_PROFILE[mode];
  if (!profile) return;
  try {
    localStorage.setItem("214keys-graphics-mode", mode);
  } catch {
    /* ignore */
  }
  setParticleProfile(profile);
}

function uses3dHeroGlyphs() {
  return Boolean(PARTICLE_PROFILES[particleProfileName]?.glyph3d);
}

function detectParticleProfile() {
  if (isIOSDevice) return "ios";
  if (isAndroidDevice || isCoarsePointer) return "android";
  return "desktop";
}

function activeProfile() {
  return PARTICLE_PROFILES[particleProfileName] ?? PARTICLE_PROFILES.desktop;
}

export function setParticleProfile(name) {
  if (!PARTICLE_PROFILES[name]) return;
  particleProfileName = name;
  if (name === "lowfps") {
    heroRenderMode = "simple";
    debugHeroRenderOverride = true;
  } else if (name === "ultra") {
    heroRenderMode = "full";
    fpsBenchmarkDone = true;
    fullWatchActive = false;
    fullWatchProbeActive = false;
    debugHeroRenderOverride = false;
    warmUpGlyphExtrusion();
  } else if (debugHeroRenderOverride) {
    debugHeroRenderOverride = false;
    loadHeroRenderMode();
  }
  document.dispatchEvent(
    new CustomEvent("particle-profile:change", { detail: { profile: name } }),
  );
}

export function getParticleProfile() {
  return particleProfileName;
}

export function getParticleProfileLabel(name = particleProfileName) {
  if (name === "lowfps") return "<15 fps";
  return name;
}

export function profileNameFromLevel(level) {
  return PROFILE_ORDER[Math.min(PROFILE_ORDER.length - 1, Math.max(0, Math.round(level) - 1))] ?? "desktop";
}

export function profileLevelFromName(name) {
  const index = PROFILE_ORDER.indexOf(name);
  return index >= 0 ? index + 1 : PROFILE_ORDER.length;
}

export function getParticleProfileCount() {
  return PROFILE_ORDER.length;
}

function isWeakDeviceProfile() {
  return particleProfileName === "android" || particleProfileName === "ios";
}

function isEconomyMode() {
  if (particleProfileName === "ultra") return false;
  if (particleProfileName === "lowfps") return true;
  if (heroRenderMode === "simple") return true;
  if (heroRenderMode === "full") return false;
  if (!fpsBenchmarkDone && isWeakDeviceProfile()) return true;
  return false;
}

function maxVisibleParticles() {
  return isEconomyMode() ? ECONOMY_MAX_PARTICLES : GLOBAL_MAX_PARTICLES;
}

export function initParticleProfileAutoDetect() {
  particleProfileName = detectParticleProfile();
  try {
    const graphics = localStorage.getItem("214keys-graphics-mode");
    if (graphics && GRAPHICS_MODE_PROFILE[graphics]) {
      setParticleProfile(GRAPHICS_MODE_PROFILE[graphics]);
      return;
    }
    const savedLevel = localStorage.getItem("214keys-particle-debug");
    if (savedLevel) {
      const name = profileNameFromLevel(Number(savedLevel));
      if (PARTICLE_PROFILES[name]) {
        setParticleProfile(name);
        return;
      }
    }
  } catch {
    /* ignore */
  }
  loadHeroRenderMode();
}

function loadHeroRenderMode() {
  try {
    for (const key of LEGACY_HERO_RENDER_MODE_KEYS) {
      sessionStorage.removeItem(key);
    }
    const saved = sessionStorage.getItem(HERO_RENDER_MODE_KEY);
    if (saved === "simple" || saved === "full") {
      heroRenderMode = saved;
      fpsBenchmarkDone = true;
      if (saved === "full") startFullModeWatch();
    }
  } catch {
    /* ignore */
  }
}

function resetFpsProbeCounters() {
  fpsBenchmarkFinalizePending = false;
  fpsBenchmarkFrames = 0;
  fpsBenchmarkSum = 0;
  fpsBenchmarkLastTs = 0;
  if (fpsBenchmarkFinalizeTimer) {
    window.clearTimeout(fpsBenchmarkFinalizeTimer);
    fpsBenchmarkFinalizeTimer = 0;
  }
}

function startFullModeWatch() {
  if (debugHeroRenderOverride || heroRenderMode !== "full") return;
  fullWatchActive = true;
  fullWatchTapCount = 0;
  fullWatchProbeActive = false;
}

function recordFpsProbeSample(ts) {
  if (fpsBenchmarkLastTs) {
    const dt = ts - fpsBenchmarkLastTs;
    if (dt > 0 && dt < FPS_FRAME_GAP_MAX) {
      fpsBenchmarkSum += dt;
      fpsBenchmarkFrames += 1;
    }
  }
  fpsBenchmarkLastTs = ts;
}

function saveHeroRenderMode(mode) {
  try {
    sessionStorage.setItem(HERO_RENDER_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

function heroEffectProfile() {
  if (isEconomyMode()) {
    if (particleProfileName === "lowfps") return PARTICLE_PROFILES.lowfps;
    if (particleProfileName === "ios") return PARTICLE_PROFILES.ios;
    if (particleProfileName === "android") return PARTICLE_PROFILES.android;
    return SIMPLE_HERO_PROFILE;
  }
  if (particleProfileName === "ultra") return PARTICLE_PROFILES.ultra;
  return PARTICLE_PROFILES.desktop;
}

function finalizeFpsBenchmark() {
  if (fpsBenchmarkDone || debugHeroRenderOverride) return;

  if (fpsBenchmarkFrames < FPS_BENCHMARK_MIN_FRAMES) {
    fpsBenchmarkDone = false;
    fpsBenchmarkActive = false;
    fpsBenchmarkTapCount = FPS_BENCHMARK_TAPS - 1;
    resetFpsProbeCounters();
    return;
  }

  fpsBenchmarkDone = true;
  fpsBenchmarkActive = false;
  fpsBenchmarkFinalizePending = false;
  if (fpsBenchmarkFinalizeTimer) {
    window.clearTimeout(fpsBenchmarkFinalizeTimer);
    fpsBenchmarkFinalizeTimer = 0;
  }

  const avgFps = 1000 / (fpsBenchmarkSum / fpsBenchmarkFrames);
  heroRenderMode = avgFps >= FPS_SIMPLE_THRESHOLD ? "full" : "simple";
  saveHeroRenderMode(heroRenderMode);
  if (heroRenderMode === "simple") {
    trimParticles();
  } else {
    startFullModeWatch();
  }
}

function finalizeFullWatchProbe() {
  if (!fullWatchProbeActive) return;
  fullWatchProbeActive = false;
  fpsBenchmarkFinalizePending = false;
  if (fpsBenchmarkFinalizeTimer) {
    window.clearTimeout(fpsBenchmarkFinalizeTimer);
    fpsBenchmarkFinalizeTimer = 0;
  }

  if (fpsBenchmarkFrames < FPS_BENCHMARK_MIN_FRAMES) {
    fullWatchTapCount = FULL_WATCH_TAPS - 1;
    resetFpsProbeCounters();
    return;
  }

  fullWatchActive = false;
  const avgFps = 1000 / (fpsBenchmarkSum / fpsBenchmarkFrames);
  resetFpsProbeCounters();

  if (avgFps < FPS_SIMPLE_THRESHOLD) {
    heroRenderMode = "simple";
    saveHeroRenderMode("simple");
    trimParticles();
  }
}

function onHeroBenchmarkTap() {
  if (debugHeroRenderOverride || fpsBenchmarkDone || heroRenderMode !== null) return;

  fpsBenchmarkActive = true;
  fpsBenchmarkTapCount += 1;

  if (fpsBenchmarkTapCount < FPS_BENCHMARK_TAPS) return;

  fpsBenchmarkFinalizePending = true;
  if (fpsBenchmarkFinalizeTimer) window.clearTimeout(fpsBenchmarkFinalizeTimer);
  fpsBenchmarkFinalizeTimer = window.setTimeout(finalizeFpsBenchmark, FPS_PROBE_MS);
}

function onHeroFullWatchTap() {
  if (!fullWatchActive || fullWatchProbeActive || debugHeroRenderOverride || heroRenderMode !== "full") return;

  fullWatchTapCount += 1;
  if (fullWatchTapCount < FULL_WATCH_TAPS) return;

  fullWatchProbeActive = true;
  resetFpsProbeCounters();
  fpsBenchmarkFinalizePending = true;
  fpsBenchmarkFinalizeTimer = window.setTimeout(finalizeFullWatchProbe, FPS_PROBE_MS);
}

function recordFpsBenchmark(ts) {
  if (fpsBenchmarkActive && !fpsBenchmarkDone) {
    recordFpsProbeSample(ts);
    if (fpsBenchmarkFinalizePending && fpsBenchmarkFrames >= 4) {
      finalizeFpsBenchmark();
    }
    return;
  }

  if (fullWatchProbeActive) {
    recordFpsProbeSample(ts);
    if (fpsBenchmarkFinalizePending && fpsBenchmarkFrames >= 4) {
      finalizeFullWatchProbe();
    }
  }
}

export function getHeroRenderMode() {
  return heroRenderMode;
}

function collectGlyphs(item) {
  const glyphs = [item.char];
  if (item.variants) {
    for (const part of item.variants.split(/\s+/)) {
      for (const ch of part) {
        if (ch.trim()) glyphs.push(ch);
      }
    }
  }
  return glyphs;
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function pick(list) {
  return list[(Math.random() * list.length) | 0];
}

function pickHeroGlyph(glyphs, primary) {
  if (!primary) return pick(glyphs);
  if (!glyphs.length) return primary;
  if (Math.random() < 0.75) return primary;
  return pick(glyphs);
}

function nextCnOrangeColor() {
  cnPressIndex += 1;
  const t = (cnPressIndex % CN_HUE_STEPS) / (CN_HUE_STEPS - 1);
  const h = 12 + t * 32;
  const s = 86 - t * 6;
  const l = 49 + t * 10;
  return `hsl(${h}, ${s}%, ${l}%)`;
}

function getHeroParticlesRoot() {
  const modal = document.getElementById("modal");
  if (!modal) return null;

  let root = modal.querySelector("#hero-particles-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "hero-particles-root";
    root.className = "hero-particles-root";
    root.setAttribute("aria-hidden", "true");
    modal.appendChild(root);
  } else {
    modal.appendChild(root);
  }
  syncHeroParticlesRootLayout();
  return root;
}

function syncHeroParticlesRootLayout() {
  const modal = document.getElementById("modal");
  const root = modal?.querySelector("#hero-particles-root");
  if (!modal || !root) return;
  root.classList.toggle("hero-particles-root--active", modal.open);
}

function getHeroSpawnCenter(anchorEl) {
  const wrap = anchorEl?.closest?.(".modal__char-wrap");
  const root = getHeroParticlesRoot();
  if (!wrap || !root) return null;

  const wrapRect = wrap.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  return {
    x: wrapRect.left + wrapRect.width / 2 - rootRect.left,
    y: wrapRect.top + wrapRect.height / 2 - rootRect.top,
  };
}

function trimParticles() {
  const max = maxVisibleParticles();
  if (particles.length <= max) return;

  const excess = particles.length - max;
  for (let i = 0; i < excess; i++) {
    removeParticleEl(particles[i]);
  }
  particles = particles.slice(excess);
}

function getActiveHeroBurstIds() {
  const ids = new Set();
  for (const p of particles) {
    if (p.fixed && p.burstId != null) {
      ids.add(p.burstId);
    }
  }
  return [...ids].sort((a, b) => a - b);
}

function beginHeroParticleFadeOut(p, fadeMs) {
  if (p.culling) return;
  const fade = particleFadeAmount(p);
  p.culling = true;
  p.cullFadeMs = fadeMs;
  p.cullAge = 0;
  p.cullStartAlpha = 1 - fade;
  p.cullStartScaleMul = Math.max(HERO_PARTICLE_SCALE_MIN, 1 - fade * HERO_PARTICLE_SCALE_FALLOFF);
}

function cullHeroParticlesForNextBurst() {
  const profile = heroEffectProfile();
  if (!profile.fastCullOnBurst) return;

  const maxBursts = profile.maxHeroBursts ?? 2;
  const fadeMs = profile.cullFadeMs ?? 480;
  const activeIds = getActiveHeroBurstIds();

  if (activeIds.length < maxBursts) return;

  const idsToFade = activeIds.slice(0, activeIds.length - maxBursts + 1);
  for (const p of particles) {
    if (!p.fixed || p.culling || !idsToFade.includes(p.burstId)) continue;
    beginHeroParticleFadeOut(p, fadeMs);
  }
}

function getAnchorCenterInHeroRoot(anchorEl) {
  const root = getHeroParticlesRoot();
  if (!root || !anchorEl) return null;
  const rect = anchorEl.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2 - rootRect.left,
    y: rect.top + rect.height / 2 - rootRect.top,
  };
}

function getBurstHost(anchorEl) {
  const slot = anchorEl.closest(".speaker-slot");
  if (!slot) return null;

  let host = slot.querySelector(".speaker-particles-burst");
  if (!host) {
    host = document.createElement("span");
    host.className = "speaker-particles-burst";
    host.setAttribute("aria-hidden", "true");
    slot.appendChild(host);
  }
  return host;
}

function stopLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  lastTs = 0;
}

function applyGlyphStyle(el, lang, cnColor) {
  el.style.color = "";
  el.className = "speaker-particle";

  if (lang === "jp") {
    const white = Math.random() < JP_WHITE_CHANCE;
    el.classList.add(white ? "speaker-particle--jp-white" : "speaker-particle--jp-red");
    return white ? "jp-white" : "jp-red";
  }

  if (lang === "cn") {
    el.classList.add("speaker-particle--cn");
    el.style.color = cnColor;
  }

  return null;
}

function glyphParticleSize(lang, variant) {
  if (variant === "jp-white") return rand(28, 42);
  if (variant === "jp-red") return rand(16, 26);
  return rand(24, 38);
}

function heroSunSlots() {
  /** @type {{ kind: "emoji" | "glyph", angle: number }[]} */
  const slots = [];

  if (uses3dHeroGlyphs()) {
    for (let i = 0; i < HERO_OCTANTS; i++) {
      const octant = HERO_SUN_BASE + i * (Math.PI * 2 / HERO_OCTANTS);
      slots.push({ kind: "emoji", angle: octant });
      slots.push({ kind: "glyph", angle: octant + HERO_SLOT });
    }
    return slots;
  }

  if (isEconomyMode()) {
    for (let i = 0; i < HERO_SIMPLE_EMOJI_COUNT; i++) {
      const angle = HERO_SUN_BASE + i * (Math.PI * 2 / HERO_SIMPLE_EMOJI_COUNT);
      slots.push({ kind: "emoji", angle });
    }
    return slots;
  }

  for (let i = 0; i < HERO_OCTANTS; i++) {
    const octant = HERO_SUN_BASE + i * (Math.PI * 2 / HERO_OCTANTS);
    slots.push({ kind: "emoji", angle: octant });
    slots.push({ kind: "glyph", angle: octant + HERO_SLOT });
  }

  return slots;
}

function heroSun3dSpawnOpts(isPlayback) {
  const layout = HERO_SUN_3D_PRESETS[HERO_SUN_3D_SPAWN_MODE] ?? HERO_SUN_3D_PRESETS.line;
  return {
    sunBurst: true,
    sunSpawnMode: HERO_SUN_3D_SPAWN_MODE,
    ringRadius: layout.ringRadius,
    speed: isPlayback ? HERO_SUN_SPEED_PLAYBACK : HERO_SUN_SPEED_CLICK,
    fontSize: isPlayback ? HERO_SUN_SIZE_PLAYBACK : HERO_SUN_SIZE_CLICK,
    scale: 1,
  };
}

function spawnHeroParticle(root, center, item, opts = {}) {
  const profile = heroEffectProfile();
  const {
    burstId = null,
    emoji = getRadicalEmoji(item.id),
    glyph = null,
    sizeMin = 22,
    sizeMax = 36,
    life = profile.heroClickLifeMs,
    angle = 0,
    speedMin = 190,
    speedMax = 380,
    fallbackGlyph = null,
    sunBurst = false,
    ringRadius: ringRadiusOpt,
    speed: speedOpt,
    fontSize: fontSizeOpt,
    scale: scaleOpt,
    flightDelayFrac = 0,
    is3dEmoji = false,
  } = opts;
  const ringRadius =
    ringRadiusOpt ??
    (sunBurst ? (HERO_SUN_3D_PRESETS[HERO_SUN_3D_SPAWN_MODE]?.ringRadius ?? 0) : rand(reducedMotion ? 44 : 58, reducedMotion ? 66 : 88));
  const speed =
    speedOpt ??
    (sunBurst
      ? HERO_SUN_SPEED_CLICK
      : reducedMotion
        ? rand(speedMin * 0.65, speedMax * 0.65)
        : rand(speedMin, speedMax));
  const fontSize = fontSizeOpt ?? (sunBurst ? HERO_SUN_SIZE_CLICK : rand(sizeMin, sizeMax));
  const particleScale = scaleOpt ?? (sunBurst ? 1 : rand(0.88, 1.28));
  let el;
  let is3d = false;

  if (uses3dHeroGlyphs() && (glyph || emoji)) {
    initGlyphThreeStage(root);
    el = document.createElement("span");
    el.className = glyph
      ? "hero-particle hero-particle--glyph3d-pending"
      : "hero-particle hero-particle--emoji3d-pending";
    el.setAttribute("aria-hidden", "true");
    if (emoji && !glyph) el.textContent = emoji;
    is3d = true;
  } else {
    el = document.createElement("span");
    if (glyph) {
      el.className = "hero-particle hero-particle--glyph";
      el.textContent = glyph;
    } else {
      el.className = "hero-particle hero-particle--emoji";
      el.textContent = emoji;
    }
  }

  root.appendChild(el);
  el.style.fontSize = `${fontSize}px`;

  const flyAngle = angle;
  const offsetX = Math.cos(flyAngle) * ringRadius;
  const offsetY = Math.sin(flyAngle) * ringRadius;
  const spawnX = center.x + offsetX;
  const spawnY = center.y + offsetY;
  const particle = {
    el,
    glyphMesh: null,
    glyphLoading: is3d,
    dead: false,
    is3d,
    is3dEmoji,
    fixed: true,
    burstId,
    flyAngle,
    sunBurst,
    flightDelayFrac,
    spawnX,
    spawnY,
    travelDistance: speed * (life / 1000) * HERO_TRAVEL_DISTANCE_FACTOR,
    x: spawnX,
    y: spawnY,
    vx: 0,
    vy: 0,
    rotation: 0,
    rotationX: 0,
    rotationY: 0,
    spin: 0,
    spinX: 0,
    spinY: 0,
    scale: particleScale,
    size: fontSize,
    life,
    lifeMax: life,
    culling: false,
  };

  if (is3d && glyph) requestGlyphMeshForParticle(particle, glyph, fallbackGlyph);
  else if (is3d && emoji) requestEmojiPlaneForParticle(particle, emoji);

  applyParticleStyle(particle);
  return particle;
}

function spawnParticle(root, lang, glyphs, opts = {}) {
  const { emoji, cnColor, origin = { x: 0, y: 0 } } = opts;
  const angle = rand(0, Math.PI * 2);
  const speed = reducedMotion ? rand(70, 150) : rand(110, 280);
  const el = document.createElement("span");

  let variant = null;

  if (emoji) {
    el.className = "speaker-particle speaker-particle--emoji";
    el.textContent = emoji;
  } else {
    variant = applyGlyphStyle(el, lang, cnColor);
    el.textContent = pick(glyphs);
  }

  root.appendChild(el);

  const particle = {
    el,
    x: origin.x,
    y: origin.y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    rotation: rand(-6, 6),
    spin: reducedMotion ? rand(-120, 120) : rand(-420, 420),
    scale: emoji ? rand(0.95, 1.4) : variant === "jp-white" ? rand(0.95, 1.65) : variant === "jp-red" ? rand(0.75, 1.2) : rand(0.85, 1.55),
    size: emoji ? rand(18, 28) : glyphParticleSize(lang, variant),
    life: SPEAKER_LIFE_MS,
    lifeMax: SPEAKER_LIFE_MS,
    culling: false,
  };

  applyParticleStyle(particle);
  return particle;
}

function disposeParticleResources(p) {
  if (p.glyphMesh) {
    releaseGlyphMeshInstance(p.glyphMesh);
    p.glyphMesh = null;
  }
}

function removeParticleEl(p) {
  if (p.dead) return;
  p.dead = true;
  p.glyphLoading = false;
  disposeParticleResources(p);
  p.el?.remove();
  p.el = null;
}

function particleScaleFalloff(p) {
  return p.fixed ? HERO_PARTICLE_SCALE_FALLOFF : SPEAKER_SCALE_FALLOFF;
}

function particleScaleMin(p) {
  if (p.fixed) return 0;
  return SPEAKER_SCALE_MIN;
}

export const HERO_MOTION_DEFAULT = {
  flight: 91,
  emojiFlight: 91,
  rotation: 70,
  scale: 23,
  initialScale: 179,
  systemScale: 72,
  axisSpin: 15,
};

const HERO_AXIS_SPIN_MAX_TURNS = 3;

/** @type {typeof HERO_MOTION_DEFAULT} */
let heroEaseConfig = { ...HERO_MOTION_DEFAULT };

try {
  const savedEmojiFlight = localStorage.getItem("214keys-emoji-flight-ease");
  if (savedEmojiFlight != null) {
    const n = Number(savedEmojiFlight);
    if (Number.isFinite(n)) {
      heroEaseConfig.emojiFlight = Math.min(100, Math.max(0, Math.round(n)));
    }
  }
} catch {
  /* ignore */
}

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

function heroEasePowerFromBias(bias) {
  const b = clamp01(Number(bias) / 100);
  const dist = Math.abs(b - 0.5) * 2;
  const weight = dist ** 0.55;
  return HERO_EASE_POWER_MIN + weight * (HERO_EASE_POWER_MAX - HERO_EASE_POWER_MIN);
}

/** 0 = ease-in, 50 = linear, 100 = ease-out. */
export function heroEaseMorph(t, bias = 50) {
  const x = clamp01(t);
  const b = clamp01(Number(bias) / 100);
  const power = heroEasePowerFromBias(bias);
  const easeIn = x ** power;
  const easeOut = 1 - (1 - x) ** power;
  const linear = x;

  if (b <= 0.5) {
    const u = b / 0.5;
    return easeIn * (1 - u) + linear * u;
  }

  const u = (b - 0.5) / 0.5;
  return linear * (1 - u) + easeOut * u;
}

export function getHeroEaseConfig() {
  return { ...heroEaseConfig };
}

export function setHeroEaseConfig(next) {
  heroEaseConfig = {
    ...heroEaseConfig,
    ...next,
  };
}

function heroInitialScaleMul() {
  return (heroEaseConfig.initialScale ?? 100) / 100;
}

function heroSystemScaleMul() {
  return (heroEaseConfig.systemScale ?? 100) / 100;
}

function heroVisualScaleMul(p, animScaleMul) {
  return heroInitialScaleMul() * heroSystemScaleMul() * animScaleMul;
}

function heroAxisSpinTurns() {
  return ((heroEaseConfig.axisSpin ?? HERO_MOTION_DEFAULT.axisSpin) / 100) * HERO_AXIS_SPIN_MAX_TURNS;
}

function heroEaseChannel(t, channel) {
  return heroEaseMorph(t, heroEaseConfig[channel] ?? 50);
}

function delayedLifeProgress(p, delayFrac) {
  const raw = particleLifeProgress(p);
  const start = Math.min(0.9, Math.max(0, delayFrac));
  if (start <= 0) return raw;
  if (raw <= start) return 0;
  return (raw - start) / (1 - start);
}

function applyHeroFlight(p) {
  if (p.travelDistance == null || p.flyAngle == null) return;
  const raw = particleLifeProgress(p);
  const flightRaw = p.flightDelayFrac ? delayedLifeProgress(p, p.flightDelayFrac) : raw;
  const flightChannel = p.is3dEmoji ? "emojiFlight" : "flight";
  p.heroFlightProgress = heroEaseChannel(flightRaw, flightChannel);
  p.heroRotationProgress = heroEaseChannel(raw, "rotation");
  p.heroScaleProgress = heroEaseChannel(raw, "scale");
  p.heroAxisSpinTurns = p.is3dEmoji ? 0 : heroAxisSpinTurns();
  p.heroAxisSpinProgress = raw;
  p.x = p.spawnX + Math.cos(p.flyAngle) * p.travelDistance * heroSystemScaleMul() * p.heroFlightProgress;
  p.y = p.spawnY + Math.sin(p.flyAngle) * p.travelDistance * heroSystemScaleMul() * p.heroFlightProgress;
}

function heroScaleMul(p) {
  const raw = particleLifeProgress(p);
  const eased = p.heroScaleProgress ?? heroEaseChannel(raw, "scale");
  return Math.max(0, 1 - eased);
}

function applyParticleStyle(p) {
  let alpha;
  let scaleMul;

  const fade = particleFadeAmount(p);

  if (p.culling) {
    const t = smoothstep(Math.min(1, p.cullAge / p.cullFadeMs));
    alpha = p.cullStartAlpha * (1 - t);
    const scaleMin = particleScaleMin(p);
    scaleMul = p.cullStartScaleMul + (scaleMin - p.cullStartScaleMul) * t;
  } else if (p.fixed) {
    alpha = 1 - fade;
    scaleMul = heroScaleMul(p);
  } else {
    alpha = 1 - fade;
    const scaleMin = particleScaleMin(p);
    scaleMul = Math.max(scaleMin, 1 - fade * particleScaleFalloff(p));
  }

  const scale = p.scale * heroVisualScaleMul(p, scaleMul);
  if (p.is3d) {
    if (p.glyphMesh) {
      syncGlyphMeshTransform(p, alpha, heroVisualScaleMul(p, scaleMul), heroSystemScaleMul());
    }
    return;
  }

  p.el.style.position = "absolute";
  p.el.style.opacity = String(Math.max(0, alpha));
  p.el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -50%) rotate(${p.rotation}deg) scale(${scale})`;
  p.el.style.zIndex = p.fixed ? "100001" : "100000";
}

function particleLifeProgress(p) {
  const lifeMax = p.lifeMax ?? SPEAKER_LIFE_MS;
  return 1 - p.life / lifeMax;
}

function heroExitFade(progress, p) {
  const hold = p?.sunBurst ? 0.55 : HERO_FADE_HOLD;
  if (progress <= hold) return 0;
  const tail = (progress - hold) / (1 - hold);
  return smoothstep(tail);
}

function particleFadeAmount(p) {
  const progress = particleLifeProgress(p);
  if (!p.fixed) return progress;
  return heroExitFade(progress, p);
}

function smoothstep(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function tick(ts) {
  rafId = 0;

  if (!particles.length) {
    stopLoop();
    return;
  }

  recordFpsBenchmark(ts);

  const profile = heroEffectProfile();
  if (profile.skipFrame && skipFrame) {
    skipFrame = false;
    rafId = requestAnimationFrame(tick);
    return;
  }
  skipFrame = profile.skipFrame;

  const dt = lastTs ? Math.min(32, ts - lastTs) : 16;
  lastTs = ts;
  const drag = Math.exp(-4.6 * (dt / 1000));

  particles = particles.filter((p) => {
    if (p.dead) return false;

    if (p.culling) {
      p.cullAge += dt;
      if (p.cullAge >= p.cullFadeMs) {
        removeParticleEl(p);
        return false;
      }
    } else {
      if (p.is3d && p.glyphLoading && !p.glyphMesh) {
        p.glyphWaitMs = (p.glyphWaitMs ?? 0) + dt;
        if (p.glyphWaitMs > GLYPH_LOAD_TIMEOUT_MS) {
          removeParticleEl(p);
          return false;
        }
      } else {
        p.life -= dt;
        if (p.life <= 0) {
          removeParticleEl(p);
          return false;
        }
      }
    }

    const waitingForMesh = p.is3d && p.glyphLoading && !p.glyphMesh;
    if (p.fixed && !waitingForMesh) {
      applyHeroFlight(p);
    } else if (!waitingForMesh) {
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * (dt / 1000);
      p.y += p.vy * (dt / 1000);
    }
    if (!p.is3d) {
      p.rotation += p.spin * (dt / 1000);
    }

    applyParticleStyle(p);
    return true;
  });

  if (particles.some((p) => p.is3d && (p.glyphMesh || p.glyphLoading))) {
    renderGlyphThreeStage();
  }

  if (particles.length) {
    rafId = requestAnimationFrame(tick);
  } else {
    stopLoop();
  }
}

function startLoop() {
  if (!rafId) {
    lastTs = 0;
    rafId = requestAnimationFrame(tick);
  }
}

function pushHeroBurst(anchorEl, item, profileKind) {
  const root = getHeroParticlesRoot();
  const center = getHeroSpawnCenter(anchorEl);
  if (!root || !center || !item) return;

  cullHeroParticlesForNextBurst();

  const profile = heroEffectProfile();
  const burstId = ++heroBurstSeq;
  const themeEmoji = getRadicalEmoji(item.id);
  if (uses3dHeroGlyphs()) warmUpEmojiPlane(themeEmoji);
  const glyphs = collectGlyphs(item);
  const isClick = profileKind === "click";
  const isPlayback = profileKind === "playback";
  const slots = heroSunSlots();
  const emojiSize = isPlayback ? [20, 34] : [26, 44];
  const glyphSize = uses3dHeroGlyphs()
    ? isPlayback
      ? [32, 44]
      : [38, 54]
    : isPlayback
      ? [18, 28]
      : [20, 32];
  const life = isClick ? profile.heroClickLifeMs : profile.heroPlaybackLifeMs;
  const speedMin = isClick ? 240 : 190;
  const speedMax = isClick ? 520 : 380;
  const isSun3d = uses3dHeroGlyphs();
  const sunOpts = isSun3d ? heroSun3dSpawnOpts(isPlayback) : null;
  const spin = isClick && !isSun3d ? heroBurstSpin : 0;

  for (const slot of slots) {
    const angle = slot.angle + spin;

    if (slot.kind === "emoji") {
      particles.push(
        spawnHeroParticle(root, center, item, {
          burstId,
          emoji: themeEmoji,
          angle,
          sizeMin: emojiSize[0],
          sizeMax: emojiSize[1],
          life,
          speedMin,
          speedMax,
          ...(isSun3d
            ? {
                ...sunOpts,
                fontSize: HERO_EMOJI_3D_SIZE,
                is3dEmoji: true,
              }
            : {}),
        }),
      );
      continue;
    }

    particles.push(
      spawnHeroParticle(root, center, item, {
        burstId,
        glyph: isSun3d ? item.char : pickHeroGlyph(glyphs, item.char),
        fallbackGlyph: item.char,
        angle,
        sizeMin: glyphSize[0],
        sizeMax: glyphSize[1],
        life,
        speedMin,
        speedMax,
        ...(sunOpts ?? {}),
      }),
    );
  }

  trimParticles();
  startLoop();
}

export function burstHeroGlyphWhisper(anchorEl, item) {
  const root = getHeroParticlesRoot();
  const center = getHeroSpawnCenter(anchorEl);
  if (!root || !center || !item) return;

  const glyphs = collectGlyphs(item);
  const count = reducedMotion ? 1 + (Math.random() < 0.5) : 2 + ((Math.random() * 2) | 0);

  for (let i = 0; i < count; i++) {
    particles.push(
      spawnHeroParticle(root, center, item, {
        glyph: pickHeroGlyph(glyphs, item.char),
        fallbackGlyph: item.char,
        angle: rand(0, Math.PI * 2),
        sizeMin: 14,
        sizeMax: 22,
        life: 650,
        speedMin: 90,
        speedMax: 170,
      }),
    );
  }

  trimParticles();
  startLoop();
}

export async function burstHeroCharSalute(anchorEl, item) {
  onHeroBenchmarkTap();
  onHeroFullWatchTap();
  heroBurstSpin += rand(0.06, 0.14);
  if (uses3dHeroGlyphs()) {
    await ensureGlyphFontsReady();
    if (item?.char) await prewarmGlyphMesh(item.char);
  }
  pushHeroBurst(anchorEl, item, "click");
}

const HERO_PLAYBACK_MS = 520;
const HERO_PLAYBACK_MS_REDUCED = 900;

export function startHeroPlaybackEmojis(anchorEl, item) {
  stopHeroPlaybackEmojis();
  heroPlaybackAnchor = anchorEl;
  heroPlaybackItem = item;
  pushHeroBurst(anchorEl, item, "playback");

  const interval = reducedMotion ? HERO_PLAYBACK_MS_REDUCED : HERO_PLAYBACK_MS;
  heroPlaybackTimer = window.setInterval(() => {
    if (!heroPlaybackAnchor || !heroPlaybackItem) return;
    pushHeroBurst(heroPlaybackAnchor, heroPlaybackItem, "playback");
  }, interval);
}

export function stopHeroPlaybackEmojis() {
  if (heroPlaybackTimer) window.clearInterval(heroPlaybackTimer);
  heroPlaybackTimer = 0;
  heroPlaybackAnchor = null;
  heroPlaybackItem = null;
}

export function burstSpeakerParticles(anchorEl, lang, item) {
  if (!anchorEl || !item) return;

  const root = getHeroParticlesRoot();
  const origin = getAnchorCenterInHeroRoot(anchorEl);
  if (!root || !origin) return;

  const glyphs = collectGlyphs(item);
  const cnColor = lang === "cn" ? nextCnOrangeColor() : null;
  const spawnOpts = { cnColor, origin };

  if (isEconomyMode()) {
    const themeEmoji = getRadicalEmoji(item.id);
    for (let i = 0; i < ECONOMY_SPEAKER_GLYPHS; i++) {
      particles.push(spawnParticle(root, lang, glyphs, spawnOpts));
    }
    for (let i = 0; i < ECONOMY_SPEAKER_EMOJI; i++) {
      particles.push(spawnParticle(root, lang, glyphs, { ...spawnOpts, emoji: themeEmoji }));
    }
    for (let i = 0; i < ECONOMY_SPEAKER_HERO_EMOJI; i++) {
      particles.push(spawnParticle(root, lang, glyphs, { ...spawnOpts, emoji: themeEmoji }));
    }
    trimParticles();
    startLoop();
    return;
  }

  const [minCount, maxCount] = reducedMotion ? COUNT_REDUCED : activeProfile().speakerCount;
  const count = (minCount + Math.random() * (maxCount - minCount + 1)) | 0;

  for (let i = 0; i < count; i++) {
    particles.push(spawnParticle(root, lang, glyphs, spawnOpts));
  }

  if (Math.random() < THEME_EMOJI_CHANCE) {
    particles.push(spawnParticle(root, lang, glyphs, { ...spawnOpts, emoji: getRadicalEmoji(item.id) }));
  }

  trimParticles();
  startLoop();
}

export function clearSpeakerParticles() {
  stopHeroPlaybackEmojis();
  stopLoop();
  for (const p of particles) removeParticleEl(p);
  particles = [];
  heroBurstSpin = 0;
  for (const host of document.querySelectorAll(".speaker-particles-burst")) {
    host.textContent = "";
  }
  const root = document.getElementById("hero-particles-root");
  if (root) {
    for (const child of [...root.children]) {
      if (!child.classList.contains("hero-glyph3d-stage")) child.remove();
    }
  }
}

export function preloadHeroGlyph3d(glyph = null) {
  if (!uses3dHeroGlyphs()) return;
  prewarmGlyphMesh(glyph);
}

export function initSpeakerParticles() {
  initParticleProfileAutoDetect();
  prepareGlyphExtrusionFonts();
  if (particleProfileName === "ultra") warmUpGlyphExtrusion();
  reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", (e) => {
    reducedMotion = e.matches;
  });
  const modal = document.getElementById("modal");
  modal?.addEventListener("toggle", syncHeroParticlesRootLayout);
  syncHeroParticlesRootLayout();
}

export function resetSpeakerParticlePalette() {
  cnPressIndex = 0;
}
