import { getRadicalEmoji } from "./radicalEmoji.js";

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

/** @type {"android" | "ios" | "lowfps" | "desktop"} */
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
let fpsMonitorActive = false;
let fpsMonitorFrames = 0;
let fpsMonitorSum = 0;
let fpsMonitorLastTs = 0;
let fpsMonitorWindowStart = 0;

const HERO_RENDER_MODE_KEY = "214keys-hero-render";
const FPS_PROBE_MS = 600;
const FPS_SIMPLE_THRESHOLD = 15;
const FPS_FULL_THRESHOLD = 20;
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

const PROFILE_ORDER = ["android", "ios", "lowfps", "desktop"];

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
    return;
  }
  if (debugHeroRenderOverride) {
    debugHeroRenderOverride = false;
    loadHeroRenderMode();
  }
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

function isEconomyMode() {
  if (particleProfileName === "lowfps") return true;
  if (heroRenderMode === "simple") return true;
  if (heroRenderMode === "full") return false;
  return particleProfileName === "android" || particleProfileName === "ios";
}

function maxVisibleParticles() {
  return isEconomyMode() ? ECONOMY_MAX_PARTICLES : GLOBAL_MAX_PARTICLES;
}

export function initParticleProfileAutoDetect() {
  particleProfileName = detectParticleProfile();
  loadHeroRenderMode();
}

function loadHeroRenderMode() {
  try {
    const saved = sessionStorage.getItem(HERO_RENDER_MODE_KEY);
    if (saved === "simple" || saved === "full") {
      heroRenderMode = saved;
    }
  } catch {
    /* ignore */
  }
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
  return PARTICLE_PROFILES.desktop;
}

function beginFpsMonitor() {
  if (debugHeroRenderOverride) return;
  fpsMonitorActive = true;
  if (!fpsMonitorWindowStart) fpsMonitorWindowStart = performance.now();
}

function updateFpsMonitor(ts) {
  if (!fpsMonitorActive || debugHeroRenderOverride) return;

  if (fpsMonitorLastTs) {
    const dt = ts - fpsMonitorLastTs;
    if (dt > 0 && dt < FPS_FRAME_GAP_MAX) {
      fpsMonitorSum += dt;
      fpsMonitorFrames += 1;
    }
  }
  fpsMonitorLastTs = ts;

  const elapsed = performance.now() - fpsMonitorWindowStart;
  if (elapsed < FPS_PROBE_MS || fpsMonitorFrames < 4) return;

  const avgFps = 1000 / (fpsMonitorSum / fpsMonitorFrames);
  const prevMode = heroRenderMode;
  let nextMode = heroRenderMode;

  if (heroRenderMode !== "simple" && avgFps < FPS_SIMPLE_THRESHOLD) {
    nextMode = "simple";
  } else if (heroRenderMode === "simple" && avgFps >= FPS_FULL_THRESHOLD) {
    nextMode = "full";
  } else if (heroRenderMode === null) {
    nextMode = avgFps < FPS_SIMPLE_THRESHOLD ? "simple" : "full";
  }

  if (nextMode !== prevMode) {
    heroRenderMode = nextMode;
    saveHeroRenderMode(nextMode);
    if (nextMode === "simple") trimParticles();
  }

  fpsMonitorFrames = 0;
  fpsMonitorSum = 0;
  fpsMonitorWindowStart = performance.now();
  fpsMonitorLastTs = 0;
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
  }
  return root;
}

function getHeroSpawnCenter(anchorEl) {
  const wrap = anchorEl?.closest?.(".modal__char-wrap");
  if (!wrap) return null;

  const rect = wrap.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function trimParticles() {
  const max = maxVisibleParticles();
  if (particles.length <= max) return;

  const excess = particles.length - max;
  for (let i = 0; i < excess; i++) {
    particles[i].el.remove();
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
  } = opts;
  const ringRadius = rand(reducedMotion ? 44 : 58, reducedMotion ? 66 : 88);
  const speed = reducedMotion ? rand(speedMin * 0.65, speedMax * 0.65) : rand(speedMin, speedMax);
  const el = document.createElement("span");

  if (glyph) {
    el.className = "hero-particle hero-particle--glyph";
    el.textContent = glyph;
  } else {
    el.className = "hero-particle hero-particle--emoji";
    el.textContent = emoji;
  }

  root.appendChild(el);
  el.style.fontSize = `${rand(sizeMin, sizeMax)}px`;

  const offsetX = Math.cos(angle) * ringRadius;
  const offsetY = Math.sin(angle) * ringRadius;
  const particle = {
    el,
    fixed: true,
    burstId,
    x: center.x + offsetX,
    y: center.y + offsetY,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    rotation: rand(-8, 8),
    spin: reducedMotion ? rand(-50, 50) : rand(-120, 120),
    scale: rand(0.88, 1.28),
    size: rand(sizeMin, sizeMax),
    life,
    lifeMax: life,
    culling: false,
  };

  applyParticleStyle(particle);
  return particle;
}

function spawnParticle(host, lang, glyphs, opts = {}) {
  const { emoji, cnColor } = opts;
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

  host.appendChild(el);

  const particle = {
    el,
    x: 0,
    y: 0,
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

function particleScaleFalloff(p) {
  return p.fixed ? HERO_PARTICLE_SCALE_FALLOFF : SPEAKER_SCALE_FALLOFF;
}

function particleScaleMin(p) {
  return p.fixed ? HERO_PARTICLE_SCALE_MIN : SPEAKER_SCALE_MIN;
}

function applyParticleStyle(p) {
  let alpha;
  let scaleMul;

  if (p.culling) {
    const t = smoothstep(Math.min(1, p.cullAge / p.cullFadeMs));
    alpha = p.cullStartAlpha * (1 - t);
    const scaleMin = particleScaleMin(p);
    scaleMul = p.cullStartScaleMul + (scaleMin - p.cullStartScaleMul) * t;
  } else {
    const fade = particleFadeAmount(p);
    alpha = 1 - fade;
    const scaleMin = particleScaleMin(p);
    scaleMul = Math.max(scaleMin, 1 - fade * particleScaleFalloff(p));
  }

  const scale = p.scale * scaleMul;
  p.el.style.position = p.fixed ? "fixed" : "absolute";
  p.el.style.opacity = String(Math.max(0, alpha));
  p.el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -50%) rotate(${p.rotation}deg) scale(${scale})`;
  if (p.fixed) p.el.style.zIndex = "1";
}

function particleLifeProgress(p) {
  const lifeMax = p.lifeMax ?? SPEAKER_LIFE_MS;
  return 1 - p.life / lifeMax;
}

function heroExitFade(progress) {
  if (progress <= HERO_FADE_HOLD) return 0;
  const tail = (progress - HERO_FADE_HOLD) / (1 - HERO_FADE_HOLD);
  return smoothstep(tail);
}

function particleFadeAmount(p) {
  const progress = particleLifeProgress(p);
  if (!p.fixed) return progress;
  return heroExitFade(progress);
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

  updateFpsMonitor(ts);

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
    if (p.culling) {
      p.cullAge += dt;
      if (p.cullAge >= p.cullFadeMs) {
        p.el.remove();
        return false;
      }
    } else {
      p.life -= dt;
      if (p.life <= 0) {
        p.el.remove();
        return false;
      }
    }

    p.vx *= p.fixed ? Math.exp(-2.4 * (dt / 1000)) : drag;
    p.vy *= p.fixed ? Math.exp(-2.4 * (dt / 1000)) : drag;
    p.x += p.vx * (dt / 1000);
    p.y += p.vy * (dt / 1000);
    p.rotation += p.spin * (dt / 1000);

    applyParticleStyle(p);
    return true;
  });

  if (particles.length) {
    rafId = requestAnimationFrame(tick);
  } else {
    stopLoop();
  }
}

function startLoop() {
  beginFpsMonitor();
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
  const glyphs = collectGlyphs(item);
  const isClick = profileKind === "click";
  const isPlayback = profileKind === "playback";
  const slots = heroSunSlots();
  const emojiSize = isPlayback ? [20, 34] : [26, 44];
  const glyphSize = isPlayback ? [18, 28] : [20, 32];
  const life = isClick ? profile.heroClickLifeMs : profile.heroPlaybackLifeMs;
  const speedMin = isClick ? 240 : 190;
  const speedMax = isClick ? 520 : 380;
  const spin = isClick ? heroBurstSpin : 0;

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
        }),
      );
      continue;
    }

    particles.push(
      spawnHeroParticle(root, center, item, {
        burstId,
        glyph: pick(glyphs),
        angle,
        sizeMin: glyphSize[0],
        sizeMax: glyphSize[1],
        life,
        speedMin,
        speedMax,
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
        glyph: pick(glyphs),
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

export function burstHeroCharSalute(anchorEl, item) {
  beginFpsMonitor();
  heroBurstSpin += rand(0.06, 0.14);
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

  const host = getBurstHost(anchorEl);
  if (!host) return;

  const glyphs = collectGlyphs(item);
  const cnColor = lang === "cn" ? nextCnOrangeColor() : null;

  if (isEconomyMode()) {
    const themeEmoji = getRadicalEmoji(item.id);
    for (let i = 0; i < ECONOMY_SPEAKER_GLYPHS; i++) {
      particles.push(spawnParticle(host, lang, glyphs, { cnColor }));
    }
    for (let i = 0; i < ECONOMY_SPEAKER_EMOJI; i++) {
      particles.push(spawnParticle(host, lang, glyphs, { emoji: themeEmoji, cnColor }));
    }
    for (let i = 0; i < ECONOMY_SPEAKER_HERO_EMOJI; i++) {
      particles.push(spawnParticle(host, lang, glyphs, { emoji: themeEmoji, cnColor }));
    }
    trimParticles();
    startLoop();
    return;
  }

  const [minCount, maxCount] = reducedMotion ? COUNT_REDUCED : activeProfile().speakerCount;
  const count = (minCount + Math.random() * (maxCount - minCount + 1)) | 0;

  for (let i = 0; i < count; i++) {
    particles.push(spawnParticle(host, lang, glyphs, { cnColor }));
  }

  if (Math.random() < THEME_EMOJI_CHANCE) {
    particles.push(spawnParticle(host, lang, glyphs, { emoji: getRadicalEmoji(item.id), cnColor }));
  }

  trimParticles();
  startLoop();
}

export function clearSpeakerParticles() {
  stopHeroPlaybackEmojis();
  stopLoop();
  for (const p of particles) p.el.remove();
  particles = [];
  heroBurstSpin = 0;
  for (const host of document.querySelectorAll(".speaker-particles-burst")) {
    host.textContent = "";
  }
  document.getElementById("hero-particles-root")?.replaceChildren();
}

export function initSpeakerParticles() {
  initParticleProfileAutoDetect();
  reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", (e) => {
    reducedMotion = e.matches;
  });
}

export function resetSpeakerParticlePalette() {
  cnPressIndex = 0;
}
