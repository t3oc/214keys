import * as THREE from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import opentype from "opentype.js";

const FONT_SIZE = 512;
const EXTRUDE_DEPTH = 96;
const EXTRUDE_DEPTH_RATIO = 0.44;
const GLYPH_REF_PX = 48;
const DEG = Math.PI / 180;
/** Fallback: полный разворот к концу life. */
const FLIGHT_TILT_END_SUN = 1;
const FLIGHT_TILT_END_DEFAULT = 1;
const GEOMETRY_CACHE_TAG = "extrude-v6-sans-cjk";

const FONT_WEIGHT_STEPS = [200, 300, 400, 500, 600, 700, 900];

/** Noto Sans CJK OTF — полное покрытие Kangxi; serif variable TTF на jsdelivr отдаёт 403. */
const FONT_TTF_SOURCES = {
  serif:
    "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf",
  linear:
    "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf",
};

/** @type {THREE.Scene | null} */
let scene = null;
/** @type {THREE.OrthographicCamera | null} */
let camera = null;
/** @type {THREE.WebGLRenderer | null} */
let renderer = null;
/** @type {HTMLElement | null} */
let stageRoot = null;
/** @type {SVGLoader} */
const svgLoader = new SVGLoader();
/** @type {Map<string, THREE.BufferGeometry>} */
const geometryCache = new Map();
/** @type {Map<string, opentype.Font>} */
const fontCache = new Map();
/** @type {Map<string, boolean>} */
const glyphOutlineCache = new Map();
/** @type {Map<string, Promise<opentype.Font>>} */
const fontLoadPromises = new Map();
/** @type {Map<string, Promise<THREE.BufferGeometry>>} */
const geometryBuildPromises = new Map();
let fontsReady = Promise.resolve();
let fontsReadyKey = "";
let resizeBound = false;

const GLYPH_MATCAP_KEY = "214keys-glyph-matcap";
const GLYPH_MATCAP_MODES = ["light", "depth", "normal", "badge"];
/** @type {"light" | "depth" | "normal" | "badge"} */
let glyphMaterialMode = "normal";

/** @type {Record<string, THREE.Texture | null>} */
const matcapTextures = {
  light: null,
  badge: null,
};

try {
  let savedMatcap = localStorage.getItem(GLYPH_MATCAP_KEY);
  if (savedMatcap === "gold") savedMatcap = "light";
  if (savedMatcap && GLYPH_MATCAP_MODES.includes(savedMatcap)) {
    glyphMaterialMode = savedMatcap;
  }
} catch {
  /* ignore */
}

const Q_OUT = new THREE.Quaternion();
const Q_TILT = new THREE.Quaternion();
const Q_SPIN = new THREE.Quaternion();
const V_FACE = new THREE.Vector3(0, 0, 1);
const V_FLY = new THREE.Vector3();
const V_AXIS = new THREE.Vector3();
const V_VIEW = new THREE.Vector3();
const HALF_PI = Math.PI * 0.5;

function flightTiltProgress(p) {
  if (!p.lifeMax) return 0;
  const traveled = 1 - p.life / p.lifeMax;
  const endAt = p.sunBurst ? FLIGHT_TILT_END_SUN : FLIGHT_TILT_END_DEFAULT;
  return Math.min(1, traveled / endAt);
}

export { flightTiltProgress };

/** Лицом к камере → 90° вокруг оси луча; опционально spin вокруг направления полёта. */
function applyFlightOrientation(mesh, flyAngle, progress, axisSpinTurns = 0, spinProgress = progress) {
  const t = Math.min(1, Math.max(0, progress));
  const dx = Math.cos(flyAngle);
  const dy = -Math.sin(flyAngle);
  V_FLY.set(dx, dy, 0);
  if (V_FLY.lengthSq() < 1e-6) {
    mesh.quaternion.set(0, 0, 0, 1);
    return;
  }

  V_FLY.normalize();
  V_AXIS.crossVectors(V_FACE, V_FLY);
  if (V_AXIS.lengthSq() < 1e-6) {
    mesh.quaternion.set(0, 0, 0, 1);
    return;
  }

  V_AXIS.normalize();
  Q_TILT.setFromAxisAngle(V_AXIS, t * HALF_PI);

  if (axisSpinTurns > 0) {
    const spinT = Math.min(1, Math.max(0, spinProgress));
    Q_SPIN.setFromAxisAngle(V_FLY, spinT * axisSpinTurns * Math.PI * 2);
    Q_OUT.copy(Q_TILT).multiply(Q_SPIN);
  } else {
    Q_OUT.copy(Q_TILT);
  }

  mesh.quaternion.copy(Q_OUT);
}

/** Плоскость emoji всегда к камере — иначе при 90° tilt лист становится ребром. */
function applyEmojiBillboard(mesh, spinProgress = 0, axisSpinTurns = 0) {
  if (!camera) return;
  mesh.lookAt(camera.position);
  if (axisSpinTurns > 0) {
    const spin = Math.min(1, Math.max(0, spinProgress)) * axisSpinTurns * Math.PI * 2;
    V_VIEW.subVectors(camera.position, mesh.position).normalize();
    mesh.rotateOnWorldAxis(V_VIEW, spin);
  }
}

function readHanFontSpec() {
  const linear = document.documentElement.dataset.font === "linear";
  return {
    key: linear ? "linear" : "serif",
    family: linear ? "Zen Kaku Gothic New" : "Noto Serif SC",
    weight: parseInt(getComputedStyle(document.documentElement).getPropertyValue("--font-han-weight"), 10) || 300,
  };
}

function snapFontWeight(weight) {
  return FONT_WEIGHT_STEPS.reduce(
    (best, step) => (Math.abs(step - weight) < Math.abs(best - weight) ? step : best),
    400,
  );
}

function fontCacheKey(spec) {
  return `${spec.key}-${snapFontWeight(spec.weight)}`;
}

function geometryCacheKey(glyph, spec) {
  return `${GEOMETRY_CACHE_TAG}-${fontCacheKey(spec)}-${glyph}`;
}

function readSpeakerColorHex() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--speaker-active").trim() || "#c48a28";
  const probe = document.createElement("span");
  probe.style.color = raw;
  document.body.appendChild(probe);
  const rgb = getComputedStyle(probe).color;
  probe.remove();
  const parts = rgb.match(/[\d.]+/g);
  if (!parts) return 0xc48a28;
  const r = Math.round(Number(parts[0]));
  const g = Math.round(Number(parts[1]));
  const b = Math.round(Number(parts[2]));
  return (r << 16) | (g << 8) | b;
}

function createLightMatcapTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Matcap canvas unavailable");

  const cx = size * 0.5;
  const cy = size * 0.5;
  const r = size * 0.5;
  const grad = ctx.createRadialGradient(cx - r * 0.34, cy - r * 0.38, r * 0.05, cx, cy, r);
  grad.addColorStop(0, "#fafaf8");
  grad.addColorStop(0.32, "#ececea");
  grad.addColorStop(0.62, "#d4d4ce");
  grad.addColorStop(0.82, "#a8a8a0");
  grad.addColorStop(1, "#5a5a54");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  return canvasToMatcapTexture(canvas);
}

function createBadgeMatcapTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Matcap canvas unavailable");

  const cx = size * 0.5;
  const cy = size * 0.5;
  const r = size * 0.5;
  const grad = ctx.createRadialGradient(cx - r * 0.22, cy - r * 0.28, r * 0.08, cx, cy, r);
  grad.addColorStop(0, "#5c4638");
  grad.addColorStop(0.48, "#a88448");
  grad.addColorStop(0.68, "#fff2cc");
  grad.addColorStop(0.78, "#9a7234");
  grad.addColorStop(0.9, "#4a3828");
  grad.addColorStop(1, "#1a1410");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  return canvasToMatcapTexture(canvas);
}

function canvasToMatcapTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

const MATCAP_BUILDERS = {
  light: createLightMatcapTexture,
  badge: createBadgeMatcapTexture,
};

const WORLD_NORMAL_VERTEX = /* glsl */ `
  varying vec3 vWorldNormal;

  void main() {
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const WORLD_NORMAL_FRAGMENT = /* glsl */ `
  varying vec3 vWorldNormal;
  uniform float opacity;

  void main() {
    vec3 n = normalize(vWorldNormal);
    vec3 encoded = clamp(n * 0.92 + 0.5, 0.0, 1.0);
    vec3 flatNormal = vec3(0.55, 0.55, 1.0);
    vec3 color = mix(flatNormal, encoded, 0.92);
    color.r = color.r * 0.60 + color.b * 0.06 + 0.05;
    color.g = color.g * 0.26 + 0.16;
    color.b = color.b * 0.30 + 0.62;
    const float pivot = 0.44;
    const float contrast = 1.78;
    color = clamp((color - pivot) * contrast + pivot, 0.0, 1.0);
    color = clamp(color * 1.34 + 0.12, 0.0, 1.0);
    gl_FragColor = vec4(color, opacity);
  }
`;

function createWorldNormalMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      opacity: { value: 1 },
    },
    vertexShader: WORLD_NORMAL_VERTEX,
    fragmentShader: WORLD_NORMAL_FRAGMENT,
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
}

const DEPTH_Z_EXTENT = GLYPH_REF_PX * EXTRUDE_DEPTH_RATIO * 0.55;
const DEPTH_VIEW_NEAR = 54;
const DEPTH_VIEW_FAR = 92;
const DEPTH_OUTLINE_PX = 10;

const DEPTH_OUTLINE_VERTEX = /* glsl */ `
  uniform float outlineWidth;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vec4 clipPosition = projectionMatrix * mvPosition;
    vec3 clipNormal = mat3(projectionMatrix) * mat3(modelViewMatrix) * normal;
    vec2 dir = clipNormal.xy;
    float len = length(dir);
    if (len > 1e-5) dir /= len;
    else dir = vec2(0.0, 1.0);
    clipPosition.xy += dir * outlineWidth * clipPosition.w;
    gl_Position = clipPosition;
  }
`;

const DEPTH_OUTLINE_FRAGMENT = /* glsl */ `
  uniform float opacity;

  void main() {
    gl_FragColor = vec4(1.0, 1.0, 1.0, opacity);
  }
`;

const DEPTH_VERTEX = /* glsl */ `
  varying vec3 vViewPosition;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const DEPTH_FRAGMENT = /* glsl */ `
  varying vec3 vViewPosition;
  uniform float opacity;
  uniform float depthNear;
  uniform float depthFar;

  void main() {
    float viewDepth = -vViewPosition.z;
    float depthT = smoothstep(depthNear, depthFar, viewDepth);
    float t = 1.0 - depthT;
    vec3 lightColor = vec3(0.58, 0.84, 0.98);
    vec3 darkColor = vec3(0.18, 0.16, 0.38);
    vec3 color = mix(darkColor, lightColor, t);
    gl_FragColor = vec4(color, opacity);
  }
`;

function createDepthMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      opacity: { value: 1 },
      depthNear: { value: DEPTH_VIEW_NEAR },
      depthFar: { value: DEPTH_VIEW_FAR },
    },
    vertexShader: DEPTH_VERTEX,
    fragmentShader: DEPTH_FRAGMENT,
    transparent: true,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
  });
}

function updateDepthViewUniforms(target, activeCamera) {
  if (!target || !activeCamera) return;
  let root = target;
  let mesh = target;
  if (mesh.userData?.glyphMeshRoot) {
    root = mesh;
    mesh = mesh.children.find((child) => child.userData?.glyphMain) ?? mesh;
  }
  const material = mesh.material;
  if (!material?.uniforms?.depthNear) return;

  root.updateMatrixWorld(true);
  const center = new THREE.Vector3();
  root.getWorldPosition(center);
  const viewPos = center.clone().applyMatrix4(activeCamera.matrixWorldInverse);
  const span = Math.max(8, root.scale.x * DEPTH_Z_EXTENT * 1.15);
  const viewDepth = -viewPos.z;
  material.uniforms.depthNear.value = viewDepth - span;
  material.uniforms.depthFar.value = viewDepth + span;
}

export function syncDepthMaterialsForCamera(activeCamera, root = scene) {
  if (!activeCamera || !root) return;
  root.traverse((obj) => {
    if (obj.userData?.glyphMeshRoot) {
      updateDepthViewUniforms(obj, activeCamera);
      return;
    }
    if (obj.isMesh && obj.material?.uniforms?.depthNear) {
      updateDepthViewUniforms(obj, activeCamera);
    }
  });
}

function createDepthOutlineMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      opacity: { value: 1 },
      outlineWidth: { value: DEPTH_OUTLINE_PX },
    },
    vertexShader: DEPTH_OUTLINE_VERTEX,
    fragmentShader: DEPTH_OUTLINE_FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    transparent: true,
  });
}

function updateGlyphMeshRootMaterials(root) {
  const outline = root.children.find((child) => child.userData?.glyphOutline);
  const main = root.children.find((child) => child.userData?.glyphMain);
  if (!main) return;

  const opacity = main.material?.opacity ?? 1;
  const visible = main.visible;
  main.material?.dispose();
  main.material = createDepthMaterial();
  syncMaterialOpacity(main.material, opacity);
  main.visible = visible;
  main.renderOrder = 0;

  if (outline) {
    outline.scale.setScalar(1);
    outline.material?.dispose();
    outline.material = createDepthOutlineMaterial();
    syncMaterialOpacity(outline.material, opacity);
    outline.visible = glyphMaterialMode === "depth" && visible && opacity > 0.01;
    outline.renderOrder = 1;
  }
}

function createGlyphMeshFromGeometry(geometry, color) {
  if (glyphMaterialMode !== "depth") {
    return new THREE.Mesh(geometry, createGlyphMaterial(color));
  }

  const group = new THREE.Group();
  group.userData.glyphMeshRoot = true;

  const main = new THREE.Mesh(geometry, createDepthMaterial());
  main.userData.glyphMain = true;
  main.renderOrder = 0;
  main.frustumCulled = false;

  const outline = new THREE.Mesh(geometry, createDepthOutlineMaterial());
  outline.userData.glyphOutline = true;
  outline.renderOrder = 1;
  outline.frustumCulled = false;

  group.add(main);
  group.add(outline);
  return group;
}

function syncMaterialOpacity(material, opacity) {
  material.opacity = opacity;
  material.transparent = opacity < 0.999;
  if (material.uniforms?.opacity) {
    material.uniforms.opacity.value = opacity;
  }
}

function ensureMatcapTexture(mode) {
  if (mode === "normal" || mode === "depth") return null;
  const key = mode === "badge" ? "badge" : "light";
  if (!matcapTextures[key]) {
    matcapTextures[key] = MATCAP_BUILDERS[key]();
  }
  return matcapTextures[key];
}

function warmUpMatcapTextures() {
  ensureMatcapTexture("light");
  ensureMatcapTexture("badge");
}

function createGlyphMaterialForMode(mode, color) {
  if (mode === "normal") return createWorldNormalMaterial();
  if (mode === "depth") return createDepthMaterial();
  const texKey = mode === "badge" ? "badge" : "light";
  ensureMatcapTexture(texKey);
  return new THREE.MeshMatcapMaterial({
    matcap: matcapTextures[texKey],
    color,
    transparent: true,
    opacity: 1,
    side: THREE.DoubleSide,
  });
}

function createGlyphMaterial(color) {
  return createGlyphMaterialForMode(glyphMaterialMode, color);
}

export function getGlyphMaterialMode() {
  return glyphMaterialMode;
}

export function setGlyphMaterialMode(mode) {
  if (mode === "gold") mode = "light";
  if (!GLYPH_MATCAP_MODES.includes(mode) || mode === glyphMaterialMode) return;
  glyphMaterialMode = mode;
  try {
    localStorage.setItem(GLYPH_MATCAP_KEY, mode);
  } catch {
    /* ignore */
  }
  refreshActiveGlyphMaterials();
}

function replaceMeshWithDepthRoot(parent, mesh) {
  if (!parent || !mesh?.isMesh || mesh.userData?.emojiPlane) return mesh;
  const geometry = mesh.geometry;
  const opacity = mesh.material?.opacity ?? 1;
  const visible = mesh.visible;
  const particle = mesh.userData?.glyphParticle ?? null;
  const transform = {
    position: mesh.position.clone(),
    rotation: mesh.rotation.clone(),
    scale: mesh.scale.clone(),
    renderOrder: mesh.renderOrder,
  };

  mesh.material?.dispose();
  parent.remove(mesh);

  const root = createGlyphMeshFromGeometry(geometry, readSpeakerColorHex());
  root.position.copy(transform.position);
  root.rotation.copy(transform.rotation);
  root.scale.copy(transform.scale);
  root.renderOrder = transform.renderOrder;
  if (particle) {
    root.userData.glyphParticle = particle;
    particle.glyphMesh = root;
  }
  parent.add(root);
  syncGlyphMeshRootOpacity(root, opacity, visible);
  return root;
}

function syncGlyphMeshRootOpacity(root, opacity, visible = true) {
  const alpha = Math.max(0, Math.min(1, opacity));
  const show = visible && alpha > 0.01;
  root.children.forEach((child) => {
    syncMaterialOpacity(child.material, alpha);
    const isOutline = child.userData?.glyphOutline;
    child.visible = show && (!isOutline || glyphMaterialMode === "depth");
  });
  root.visible = show;
}

function collapseGlyphMeshRoot(parent, root) {
  if (!parent || !root?.userData?.glyphMeshRoot) return root;
  const main = root.children.find((child) => child.userData?.glyphMain) ?? root.children[0];
  if (!main) return root;

  const geometry = main.geometry;
  const opacity = main.material?.opacity ?? 1;
  const visible = root.visible;
  const particle = root.userData?.glyphParticle ?? null;
  const transform = {
    position: root.position.clone(),
    rotation: root.rotation.clone(),
    scale: root.scale.clone(),
    renderOrder: root.renderOrder,
  };

  root.children.forEach((child) => child.material?.dispose());
  parent.remove(root);

  const mesh = new THREE.Mesh(geometry, createGlyphMaterial(readSpeakerColorHex()));
  mesh.position.copy(transform.position);
  mesh.rotation.copy(transform.rotation);
  mesh.scale.copy(transform.scale);
  mesh.renderOrder = transform.renderOrder;
  if (particle) {
    mesh.userData.glyphParticle = particle;
    particle.glyphMesh = mesh;
  }
  syncMaterialOpacity(mesh.material, opacity);
  mesh.visible = visible;
  parent.add(mesh);
  return mesh;
}

function refreshActiveGlyphMaterials() {
  if (!scene) return;
  const color = readSpeakerColorHex();
  if (glyphMaterialMode === "light" || glyphMaterialMode === "badge") {
    ensureMatcapTexture(glyphMaterialMode);
  }

  const toCollapse = [];
  const toUpgrade = [];
  scene.traverse((obj) => {
    if (obj.userData?.glyphMeshRoot) {
      if (glyphMaterialMode !== "depth") {
        toCollapse.push({ parent: obj.parent, root: obj });
      } else {
        updateGlyphMeshRootMaterials(obj);
      }
      return;
    }
    if (!obj.isMesh || !obj.material || obj.userData?.emojiPlane) return;
    if (obj.parent?.userData?.glyphMeshRoot) return;
    if (glyphMaterialMode === "depth") {
      toUpgrade.push({ parent: obj.parent, mesh: obj });
      return;
    }
    const opacity = obj.material.opacity;
    const visible = obj.visible;
    const old = obj.material;
    const next = createGlyphMaterial(color);
    syncMaterialOpacity(next, opacity);
    obj.material = next;
    obj.visible = visible;
    old.dispose();
  });

  toUpgrade.forEach(({ parent, mesh }) => replaceMeshWithDepthRoot(parent, mesh));
  toCollapse.forEach(({ parent, root }) => collapseGlyphMeshRoot(parent, root));
  renderGlyphThreeStage();
}

/** @type {THREE.WebGLRenderer | null} */
let matcapPreviewRenderer = null;

export function renderMatcapPreviewDataUrl(mode, size = 64) {
  const normalized = mode === "gold" ? "light" : mode;
  if (!matcapPreviewRenderer) {
    matcapPreviewRenderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    matcapPreviewRenderer.setPixelRatio(1);
  }

  matcapPreviewRenderer.setSize(size, size, false);
  matcapPreviewRenderer.setClearColor(0x000000, 0);

  const previewScene = new THREE.Scene();
  const previewCam = new THREE.PerspectiveCamera(34, 1, 0.1, 10);
  previewCam.position.set(0.22, 0.16, 2.55);
  previewCam.lookAt(0, 0, 0);

  const geometry = new THREE.SphereGeometry(0.9, 40, 40);
  let previewRoot;
  if (normalized === "depth") {
    previewRoot = createGlyphMeshFromGeometry(geometry, 0xffffff);
    const main = previewRoot.children.find((child) => child.userData?.glyphMain);
    if (main?.material?.uniforms?.depthNear) {
      main.material.uniforms.depthNear.value = 1.85;
      main.material.uniforms.depthFar.value = 2.75;
    }
    const outline = previewRoot.children.find((child) => child.userData?.glyphOutline);
    if (outline?.material?.uniforms?.outlineWidth) {
      outline.material.uniforms.outlineWidth.value = 4.5;
    }
    previewScene.add(previewRoot);
  } else {
    const material = createGlyphMaterialForMode(normalized, 0xffffff);
    previewRoot = new THREE.Mesh(geometry, material);
    previewScene.add(previewRoot);
  }
  matcapPreviewRenderer.render(previewScene, previewCam);

  const url = matcapPreviewRenderer.domElement.toDataURL("image/png");

  if (previewRoot.userData?.glyphMeshRoot) {
    previewRoot.children.forEach((child) => child.material?.dispose());
  } else {
    previewRoot.material?.dispose();
  }
  geometry.dispose();
  previewScene.clear();

  return url;
}

function opentypeFontCacheKey(spec) {
  return spec.key;
}

function glyphOutlineCacheKey(glyph, spec) {
  return `${opentypeFontCacheKey(spec)}-${glyph}`;
}

function glyphHasOutline(font, glyph) {
  const glyphObj = font.charToGlyph(glyph);
  if (!glyphObj || glyphObj.index === 0) return false;
  const path = font.getPath(glyph, 0, 0, FONT_SIZE);
  const bbox = path.getBoundingBox();
  return (bbox.x2 - bbox.x1) * (bbox.y2 - bbox.y1) >= 1;
}

async function loadOpentypeFontForGlyph(spec) {
  const key = opentypeFontCacheKey(spec);
  if (fontCache.has(key)) return fontCache.get(key);
  if (fontLoadPromises.has(key)) return fontLoadPromises.get(key);

  const url = FONT_TTF_SOURCES[spec.key];
  const promise = opentype
    .load(url)
    .then((font) => {
      fontCache.set(key, font);
      fontLoadPromises.delete(key);
      return font;
    })
    .catch((err) => {
      fontLoadPromises.delete(key);
      throw err;
    });
  fontLoadPromises.set(key, promise);
  return promise;
}

export async function canExtrudeGlyph(glyph) {
  const spec = readHanFontSpec();
  const cacheKey = glyphOutlineCacheKey(glyph, spec);
  if (glyphOutlineCache.has(cacheKey)) return glyphOutlineCache.get(cacheKey);

  const font = await loadOpentypeFontForGlyph(spec);
  const ok = glyphHasOutline(font, glyph);
  glyphOutlineCache.set(cacheKey, ok);
  return ok;
}

export async function filterGlyphsForExtrusion(glyphs) {
  await prepareGlyphExtrusionFonts();
  const unique = [...new Set(glyphs.filter(Boolean))];
  const out = [];
  for (const glyph of unique) {
    if (await canExtrudeGlyph(glyph)) out.push(glyph);
  }
  return out;
}

export const GLYPH_CANVAS_PX = GLYPH_REF_PX;

function opentypePathToShapes(path) {
  const d = path.toPathData(2);
  const bbox = path.getBoundingBox();
  const w = Math.max(bbox.x2 - bbox.x1, 1);
  const h = Math.max(bbox.y2 - bbox.y1, 1);
  const pad = Math.max(w, h) * 0.06;
  const vb = `${bbox.x1 - pad} ${bbox.y1 - pad} ${w + pad * 2} ${h + pad * 2}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"><path fill="#000" d="${d}"/></svg>`;
  const data = svgLoader.parse(svg);
  const shapes = [];
  for (const svgPath of data.paths) {
    shapes.push(...SVGLoader.createShapes(svgPath));
  }
  return shapes;
}

async function buildGlyphGeometry(glyph) {
  const spec = readHanFontSpec();
  const key = geometryCacheKey(glyph, spec);
  if (geometryCache.has(key)) return geometryCache.get(key);
  if (geometryBuildPromises.has(key)) return geometryBuildPromises.get(key);

  const promise = (async () => {
    const font = await loadOpentypeFontForGlyph(spec);

    if (!glyphHasOutline(font, glyph)) {
      throw new Error(`Missing glyph outline: ${glyph}`);
    }

    const path = font.getPath(glyph, 0, 0, FONT_SIZE);
    const shapes = opentypePathToShapes(path);
    if (!shapes.length) throw new Error("Empty glyph shapes");

    const geometry = new THREE.ExtrudeGeometry(shapes, {
      depth: EXTRUDE_DEPTH,
      bevelEnabled: true,
      bevelThickness: 1.8,
      bevelSize: 0.9,
      bevelSegments: 2,
      curveSegments: 10,
    });

    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxXY = Math.max(size.x, size.y, 1);
    const cx = (box.min.x + box.max.x) * 0.5;
    const cy = (box.min.y + box.max.y) * 0.5;
    const cz = (box.min.z + box.max.z) * 0.5;
    geometry.translate(-cx, -cy, -cz);

    const normXY = GLYPH_REF_PX / maxXY;
    const targetDepth = GLYPH_REF_PX * EXTRUDE_DEPTH_RATIO;
    const normZ = size.z > 0 ? targetDepth / size.z : 1;
    geometry.scale(normXY, -normXY, normZ);
    geometry.computeVertexNormals();

    geometryCache.set(key, geometry);
    return geometry;
  })();

  geometryBuildPromises.set(key, promise);
  try {
    return await promise;
  } finally {
    geometryBuildPromises.delete(key);
  }
}

function readStageSize() {
  const el = stageRoot ?? renderer?.domElement?.parentElement;
  if (!el) {
    return { width: window.innerWidth, height: window.innerHeight };
  }
  const rect = el.getBoundingClientRect();
  return {
    width: Math.max(1, rect.width),
    height: Math.max(1, rect.height),
  };
}

function perspectiveCameraDistance(h) {
  const fovRad = (camera?.fov ?? 38) * 0.5 * DEG;
  return (h * 0.5) / Math.tan(fovRad);
}

function resizeStage() {
  if (!renderer || !camera) return;
  const { width, height } = readStageSize();
  if (camera instanceof THREE.PerspectiveCamera) {
    camera.aspect = width / height;
    camera.position.z = perspectiveCameraDistance(height);
    camera.updateProjectionMatrix();
  }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(width, height, false);
}

export function prepareGlyphExtrusionFonts() {
  const spec = readHanFontSpec();
  const key = opentypeFontCacheKey(spec);
  if (fontsReadyKey === key && fontCache.has(key)) return fontsReady;
  if (fontsReadyKey === key && fontLoadPromises.has(key)) return fontsReady;

  fontsReadyKey = key;
  fontsReady = loadOpentypeFontForGlyph(spec).catch((err) => {
    fontsReadyKey = "";
    throw err;
  });
  return fontsReady;
}

export function ensureGlyphFontsReady() {
  return prepareGlyphExtrusionFonts();
}

export function warmUpGlyphExtrusion() {
  warmUpMatcapTextures();
  return prepareGlyphExtrusionFonts();
}

export function prewarmGlyphMesh(glyph) {
  if (!glyph) return warmUpGlyphExtrusion();
  return warmUpGlyphExtrusion()
    .then(() => acquireGlyphMesh(glyph))
    .then((mesh) => {
      releaseGlyphMeshInstance(mesh);
    })
    .catch(() => {});
}

export function initGlyphThreeStage(rootEl) {
  if (renderer) {
    if (rootEl && renderer.domElement.parentElement !== rootEl) {
      rootEl.appendChild(renderer.domElement);
    }
    stageRoot = rootEl || stageRoot;
    resizeStage();
    return;
  }

  stageRoot = rootEl;
  scene = new THREE.Scene();

  const { width, height } = readStageSize();
  camera = new THREE.PerspectiveCamera(38, width / height, 8, 8000);
  camera.position.z = perspectiveCameraDistance(height);

  renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
    preserveDrawingBuffer: true,
  });
  renderer.setClearColor(0x000000, 0);
  renderer.sortObjects = true;
  renderer.domElement.className = "hero-glyph3d-stage";
  renderer.domElement.style.visibility = "hidden";
  (rootEl || document.body).appendChild(renderer.domElement);
  resizeStage();

  if (!resizeBound) {
    window.addEventListener("resize", resizeStage);
    resizeBound = true;
  }
}

export function acquireGlyphMesh(glyph) {
  return ensureGlyphFontsReady().then(() =>
    buildGlyphGeometry(glyph).then((geometry) => {
      if (glyphMaterialMode === "light" || glyphMaterialMode === "badge") {
        ensureMatcapTexture(glyphMaterialMode);
      }
      return createGlyphMeshFromGeometry(geometry, readSpeakerColorHex());
    }),
  );
}

const EMOJI_PLANE_TEX_PX = 160;
const EMOJI_PLANE_SCALE_MUL = 1;
const TWEMOJI_BASE = "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72";
/** @type {THREE.PlaneGeometry | null} */
let emojiPlaneGeometry = null;
/** @type {THREE.TextureLoader | null} */
let emojiTextureLoader = null;
/** @type {Map<string, Promise<THREE.Texture>>} */
const emojiTexturePromises = new Map();
/** @type {Set<THREE.Texture>} */
const sharedEmojiTextures = new Set();

function getEmojiPlaneGeometry() {
  if (!emojiPlaneGeometry) {
    emojiPlaneGeometry = new THREE.PlaneGeometry(GLYPH_REF_PX, GLYPH_REF_PX);
  }
  return emojiPlaneGeometry;
}

function getEmojiTextureLoader() {
  if (!emojiTextureLoader) {
    emojiTextureLoader = new THREE.TextureLoader();
    emojiTextureLoader.setCrossOrigin("anonymous");
  }
  return emojiTextureLoader;
}

function twemojiAssetIds(emoji) {
  const cps = [...emoji].map((ch) => ch.codePointAt(0).toString(16));
  const full = cps.join("-");
  const stripped = cps.filter((cp) => cp !== "fe0f").join("-");
  return [...new Set([full, stripped].filter(Boolean))];
}

function loadEmojiImageTexture(url) {
  return new Promise((resolve, reject) => {
    getEmojiTextureLoader().load(
      url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        resolve(texture);
      },
      undefined,
      reject,
    );
  });
}

function loadTwemojiTexture(emoji) {
  const ids = twemojiAssetIds(emoji);
  const tryNext = (index) => {
    const id = ids[index];
    if (!id) return Promise.reject(new Error("Twemoji asset missing"));
    return loadEmojiImageTexture(`${TWEMOJI_BASE}/${id}.png`).catch(() => tryNext(index + 1));
  };
  return tryNext(0);
}

function rasterizeEmojiViaSvg(emoji) {
  const size = EMOJI_PLANE_TEX_PX;
  const fontPx = Math.round(size * 0.72);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
<foreignObject width="100%" height="100%">
<div xmlns="http://www.w3.org/1999/xhtml" style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;font-size:${fontPx}px;line-height:1;font-family:'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif">${emoji}</div>
</foreignObject>
</svg>`;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Emoji canvas unavailable"));
        return;
      }
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      URL.revokeObjectURL(url);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      resolve(texture);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("SVG emoji rasterize failed"));
    };
    img.src = url;
  });
}

function isCanvasMostlyBlank(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return true;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let alphaSum = 0;
  for (let i = 3; i < data.length; i += 16) alphaSum += data[i];
  return alphaSum < 48;
}

function createEmojiCanvasTexture(emoji) {
  const size = EMOJI_PLANE_TEX_PX;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Emoji canvas unavailable");
  ctx.clearRect(0, 0, size, size);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${Math.round(size * 0.82)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.fillText(emoji, size * 0.5, size * 0.52);
  if (isCanvasMostlyBlank(canvas)) throw new Error("Canvas emoji blank");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function loadEmojiPlaneTexture(emoji) {
  const cached = emojiTexturePromises.get(emoji);
  if (cached) return cached;

  const promise = loadTwemojiTexture(emoji)
    .catch(() => rasterizeEmojiViaSvg(emoji))
    .catch(() => Promise.resolve(createEmojiCanvasTexture(emoji)))
    .then((texture) => {
      sharedEmojiTextures.add(texture);
      return texture;
    });

  emojiTexturePromises.set(emoji, promise);
  return promise;
}

function createEmojiPlaneMaterial(texture) {
  return new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 1,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: true,
    alphaTest: 0.04,
  });
}

export function acquireEmojiPlaneMesh(emoji) {
  return loadEmojiPlaneTexture(emoji).then((texture) => {
    const mesh = new THREE.Mesh(getEmojiPlaneGeometry(), createEmojiPlaneMaterial(texture));
    mesh.userData.emojiPlane = true;
    mesh.renderOrder = 12;
    return mesh;
  });
}

export function warmUpEmojiPlane(emoji) {
  if (!emoji) return Promise.resolve();
  return loadEmojiPlaneTexture(emoji).catch(() => {});
}

function attachParticleMesh(particle, mesh) {
  if (particle.dead) {
    releaseGlyphMeshInstance(mesh);
    return null;
  }
  particle.glyphMesh = mesh;
  mesh.userData.glyphParticle = particle;
  particle.glyphLoading = false;
  particle.life = particle.lifeMax;
  scene?.add(mesh);
  syncGlyphMeshTransform(particle, 1, 1);
  renderGlyphThreeStage();
  if (particle.el) {
    particle.el.remove();
    particle.el = null;
  }
  return mesh;
}

export function requestEmojiPlaneForParticle(particle, emoji) {
  if (!emoji) {
    if (!particle.dead) {
      particle.glyphLoading = false;
      removeFailedGlyphParticle(particle);
    }
    return Promise.resolve(null);
  }

  return Promise.resolve()
    .then(() => acquireEmojiPlaneMesh(emoji))
    .then((mesh) => attachParticleMesh(particle, mesh))
    .catch(() => {
      if (!particle.dead) {
        particle.glyphLoading = false;
        particle.is3d = false;
        if (particle.el) {
          particle.el.className = "hero-particle hero-particle--emoji";
        }
      }
      return null;
    });
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function requestGlyphMeshForParticle(particle, glyph, fallbackGlyph = null) {
  const tryChars = [glyph, fallbackGlyph].filter((char, index, arr) => char && arr.indexOf(char) === index);

  const tryAcquire = (index) => {
    const char = tryChars[index];
    if (!char) return Promise.resolve(null);
    return acquireGlyphMesh(char).then((mesh) => attachParticleMesh(particle, mesh));
  };

  return tryAcquire(0)
    .catch(() => (tryChars.length > 1 ? tryAcquire(1) : Promise.reject()))
    .catch(() => waitMs(400).then(() => tryAcquire(0)))
    .catch(() => waitMs(900).then(() => tryAcquire(0)))
    .catch(() => {
      if (!particle.dead) {
        particle.glyphLoading = false;
        removeFailedGlyphParticle(particle);
      }
      return null;
    });
}

function removeFailedGlyphParticle(particle) {
  particle.is3d = false;
  particle.el?.remove();
  particle.el = null;
}

export function syncGlyphMeshTransform(p, alpha, scaleMul, depthScaleMul = 1) {
  const mesh = p.glyphMesh;
  if (!mesh) return;

  const { width, height } = readStageSize();
  const planeMul = mesh.userData?.emojiPlane ? EMOJI_PLANE_SCALE_MUL : 1;
  const scale = p.scale * scaleMul * (p.size / GLYPH_REF_PX) * planeMul;
  const depthBias = mesh.userData?.emojiPlane ? 1.12 : 1;
  const depth = (p.size / GLYPH_REF_PX) * 2.8 * depthScaleMul * depthBias;
  mesh.position.set(p.x - width * 0.5, height * 0.5 - p.y, depth);
  if (mesh.userData?.emojiPlane) {
    applyEmojiBillboard(mesh);
  } else if (p.flyAngle != null) {
    const progress = p.heroRotationProgress ?? p.heroLifeProgress ?? flightTiltProgress(p);
    applyFlightOrientation(
      mesh,
      p.flyAngle,
      progress,
      p.heroAxisSpinTurns ?? 0,
      p.heroAxisSpinProgress ?? progress,
    );
  } else {
    mesh.rotation.set(p.rotationX * DEG, p.rotationY * DEG, p.rotation * DEG, "XYZ");
  }
  mesh.scale.setScalar(scale);
  const alphaClamped = Math.max(0, Math.min(1, alpha));
  if (mesh.userData?.glyphMeshRoot) {
    syncGlyphMeshRootOpacity(mesh, alphaClamped, alphaClamped > 0.01);
    return;
  }
  syncMaterialOpacity(mesh.material, alphaClamped);
  mesh.visible = alphaClamped > 0.01;
}

export function renderGlyphThreeStage() {
  if (!renderer || !scene || !camera) return;
  let visible = false;
  scene.traverse((obj) => {
    if (obj.isMesh && obj.visible) visible = true;
  });
  if (!visible) {
    renderer.domElement.style.visibility = "hidden";
    return;
  }
  renderer.domElement.style.visibility = "visible";
  resizeStage();
  syncDepthMaterialsForCamera(camera);
  renderer.render(scene, camera);
}

export function getSceneDebug() {
  const meshes = [];
  scene?.traverse((obj) => {
    if (obj.isMesh) {
      meshes.push({
        x: obj.position.x,
        y: obj.position.y,
        z: obj.position.z,
        scale: obj.scale.x,
        visible: obj.visible,
        opacity: obj.material?.opacity,
      });
    }
  });
  return {
    meshCount: meshes.length,
    meshes: meshes.slice(0, 4),
    camera: camera
      ? { left: camera.left, right: camera.right, top: camera.top, bottom: camera.bottom, z: camera.position.z }
      : null,
    hasRenderer: !!renderer,
  };
}

export function releaseGlyphMeshInstance(mesh) {
  if (!mesh) return;
  scene?.remove(mesh);
  if (mesh.userData?.glyphMeshRoot) {
    mesh.children.forEach((child) => child.material?.dispose());
    return;
  }
  const map = mesh.material?.map;
  if (map && !sharedEmojiTextures.has(map)) map.dispose();
  mesh.material?.dispose();
}

export function disposeGlyphThreeStage() {
  geometryCache.forEach((geo) => geo.dispose());
  geometryCache.clear();
  for (const mode of ["light", "badge"]) {
    matcapTextures[mode]?.dispose();
    matcapTextures[mode] = null;
  }

  if (renderer) {
    renderer.dispose();
    renderer.domElement.remove();
    renderer = null;
  }
  emojiPlaneGeometry?.dispose();
  emojiPlaneGeometry = null;
  scene = null;
  camera = null;
  stageRoot = null;
}
