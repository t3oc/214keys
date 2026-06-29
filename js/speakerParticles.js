import { getRadicalEmoji } from "./radicalEmoji.js";

const LIFE_MS = 1000;
const COUNT_NORMAL = [6, 10];
const COUNT_REDUCED = [3, 5];
const JP_WHITE_CHANCE = 0.72;
const THEME_EMOJI_CHANCE = 0.72;
const CN_HUE_STEPS = 12;

/** @type {ActiveParticle[]} */
let particles = [];
let rafId = 0;
let lastTs = 0;
let reducedMotion = false;
let cnPressIndex = 0;
let heroPlaybackTimer = 0;
let heroPlaybackAnchor = null;
let heroPlaybackItem = null;

const HERO_PLAYBACK_MS = 520;
const HERO_PLAYBACK_MS_REDUCED = 900;
const HERO_CLICK_LIFE_MS = 2600;
const HERO_PLAYBACK_LIFE_MS = 1200;
const MAX_PARTICLES = 1200;
let heroBurstSpin = 0;

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
  if (particles.length <= MAX_PARTICLES) return;

  const excess = particles.length - MAX_PARTICLES;
  for (let i = 0; i < excess; i++) {
    particles[i].el.remove();
  }
  particles = particles.slice(excess);
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

const HERO_OCTANT = Math.PI / 4;
const HERO_SLOT = Math.PI / 8;
const HERO_SUN_BASE = -Math.PI / 2;

function heroSunSlots() {
  /** @type {{ kind: "emoji" | "glyph", angle: number }[]} */
  const slots = [];

  for (let i = 0; i < 8; i++) {
    const octant = HERO_SUN_BASE + i * HERO_OCTANT;
    slots.push({ kind: "emoji", angle: octant });
    slots.push({ kind: "glyph", angle: octant + HERO_SLOT });
  }

  return slots;
}

function spawnHeroParticle(root, center, item, opts = {}) {
  const {
    emoji = getRadicalEmoji(item.id),
    glyph = null,
    sizeMin = 22,
    sizeMax = 36,
    life = HERO_CLICK_LIFE_MS,
    angle = 0,
    speedMin = 190,
    speedMax = 380,
  } = opts;
  const ringRadius = rand(reducedMotion ? 52 : 72, reducedMotion ? 78 : 108);
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

  const offsetX = Math.cos(angle) * ringRadius;
  const offsetY = Math.sin(angle) * ringRadius;
  const particle = {
    el,
    fixed: true,
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
  };

  applyParticleStyle(particle, 0);
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
    life: LIFE_MS,
    lifeMax: LIFE_MS,
  };

  applyParticleStyle(particle, 0);
  return particle;
}

function applyParticleStyle(p, t) {
  const alpha = 1 - t;
  const scale = p.scale * (1 - t * 0.85);
  p.el.style.position = p.fixed ? "fixed" : "absolute";
  p.el.style.left = `${p.x}px`;
  p.el.style.top = `${p.y}px`;
  p.el.style.fontSize = `${p.size}px`;
  p.el.style.opacity = String(Math.max(0, alpha));
  p.el.style.transform = `translate(-50%, -50%) rotate(${p.rotation}deg) scale(${scale})`;
  if (p.fixed) p.el.style.zIndex = "1";
}

function particleFade(p) {
  const lifeMax = p.lifeMax ?? LIFE_MS;
  return 1 - p.life / lifeMax;
}

function tick(ts) {
  rafId = 0;

  if (!particles.length) {
    stopLoop();
    return;
  }

  const dt = lastTs ? Math.min(32, ts - lastTs) : 16;
  lastTs = ts;
  const drag = Math.exp(-4.6 * (dt / 1000));

  particles = particles.filter((p) => {
    p.life -= dt;
    if (p.life <= 0) {
      p.el.remove();
      return false;
    }

    p.vx *= p.fixed ? Math.exp(-2.4 * (dt / 1000)) : drag;
    p.vy *= p.fixed ? Math.exp(-2.4 * (dt / 1000)) : drag;
    p.x += p.vx * (dt / 1000);
    p.y += p.vy * (dt / 1000);
    p.rotation += p.spin * (dt / 1000);

    applyParticleStyle(p, particleFade(p));
    return true;
  });

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

function pushHeroBurst(anchorEl, item, profile) {
  const root = getHeroParticlesRoot();
  const center = getHeroSpawnCenter(anchorEl);
  if (!root || !center || !item) return;

  const themeEmoji = getRadicalEmoji(item.id);
  const glyphs = collectGlyphs(item);
  const isClick = profile === "click";
  const isPlayback = profile === "playback";
  const slots = heroSunSlots();
  const emojiSize = isPlayback ? [20, 34] : [26, 44];
  const glyphSize = isPlayback ? [18, 28] : [20, 32];
  const life = isClick ? HERO_CLICK_LIFE_MS : HERO_PLAYBACK_LIFE_MS;
  const speedMin = isClick ? 240 : 190;
  const speedMax = isClick ? 520 : 380;
  const spin = isClick ? heroBurstSpin : 0;

  for (const slot of slots) {
    const angle = slot.angle + spin;

    if (slot.kind === "emoji") {
      particles.push(
        spawnHeroParticle(root, center, item, {
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
        life: 1300,
        speedMin: 90,
        speedMax: 170,
      }),
    );
  }

  trimParticles();
  startLoop();
}

export function burstHeroCharSalute(anchorEl, item) {
  heroBurstSpin += rand(0.06, 0.14);
  pushHeroBurst(anchorEl, item, "click");
}

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
  const [minCount, maxCount] = reducedMotion ? COUNT_REDUCED : COUNT_NORMAL;
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
  reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", (e) => {
    reducedMotion = e.matches;
  });
}

export function resetSpeakerParticlePalette() {
  cnPressIndex = 0;
}
