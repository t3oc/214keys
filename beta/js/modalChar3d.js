import * as THREE from "three";
import { acquireGlyphMesh, GLYPH_CANVAS_PX, releaseGlyphMeshInstance, syncDepthMaterialsForCamera } from "./glyphExtrusion3d.js";

const STORAGE_KEY = "214keys-modal-char-3d";
const MODAL_CHAR3D_FILL = 0.8;
const DEG = Math.PI / 180;

let enabled = false;
let wrapEl = null;
let charEl = null;
let renderer = null;
let scene = null;
let camera = null;
let mesh = null;
let currentChar = "";
let rotX = 0.22;
let rotY = 0;
let dragging = false;
let dragPointerId = null;
let lastX = 0;
let lastY = 0;
let rafId = 0;
let resizeObserver = null;

function readEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function saveEnabled(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function disposeMesh() {
  if (!mesh) return;
  scene?.remove(mesh);
  releaseGlyphMeshInstance(mesh);
  mesh = null;
  currentChar = "";
}

function disposeStage() {
  stopRenderLoop();
  disposeMesh();
  resizeObserver?.disconnect();
  resizeObserver = null;
  renderer?.dispose();
  renderer?.domElement.remove();
  renderer = null;
  scene = null;
  camera = null;
  wrapEl = null;
}

function perspectiveCameraDistance(size, fov = 38) {
  const fovRad = fov * 0.5 * DEG;
  return (size * 0.5) / Math.tan(fovRad);
}

function readLayoutSize() {
  const w = Math.max(1, wrapEl?.clientWidth || 1);
  const h = Math.max(1, wrapEl?.clientHeight || 1);
  return { w, h };
}

function readStageSize() {
  const canvas = renderer?.domElement;
  const w = Math.max(1, canvas?.clientWidth || wrapEl?.clientWidth || 1);
  const h = Math.max(1, canvas?.clientHeight || wrapEl?.clientHeight || 1);
  return { w, h };
}

function fitModalCharMesh(targetMesh) {
  if (!targetMesh || !wrapEl || !camera) return;
  const layout = readLayoutSize();
  const stage = readStageSize();
  const layoutRef = Math.min(layout.w, layout.h);
  const stageRef = Math.min(stage.w, stage.h);
  camera.aspect = stage.w / stage.h;
  camera.position.z = perspectiveCameraDistance(stageRef);
  camera.updateProjectionMatrix();
  const scale = (layoutRef * MODAL_CHAR3D_FILL) / GLYPH_CANVAS_PX;
  targetMesh.scale.setScalar(scale);
}

function resizeStage() {
  if (!renderer || !camera || !wrapEl) return;
  const stage = readStageSize();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(stage.w, stage.h, false);
  if (mesh) fitModalCharMesh(mesh);
  else {
    camera.aspect = stage.w / stage.h;
    camera.position.z = perspectiveCameraDistance(Math.min(stage.w, stage.h));
    camera.updateProjectionMatrix();
  }
}

function renderFrame() {
  if (!renderer || !scene || !camera) return;
  if (mesh) {
    mesh.rotation.x = rotX;
    mesh.rotation.y = rotY;
  }
  syncDepthMaterialsForCamera(camera, scene);
  renderer.render(scene, camera);
}

function startRenderLoop() {
  if (rafId) return;
  const loop = () => {
    rafId = requestAnimationFrame(loop);
    if (enabled && mesh) renderFrame();
  };
  loop();
}

function stopRenderLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
}

function bindPointer(wrap) {
  if (wrap.dataset.char3dPointer === "1") return;
  wrap.dataset.char3dPointer = "1";

  wrap.addEventListener("pointerdown", (event) => {
    if (!enabled || event.button !== 0) return;
    dragging = true;
    dragPointerId = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    wrap.classList.add("modal__char-wrap--dragging");
    try {
      wrap.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  });

  const endDrag = (event) => {
    if (dragPointerId != null && event?.pointerId != null && event.pointerId !== dragPointerId) return;
    dragging = false;
    dragPointerId = null;
    wrap.classList.remove("modal__char-wrap--dragging");
    try {
      if (event?.pointerId != null) wrap.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  };

  wrap.addEventListener("pointermove", (event) => {
    if (!dragging || dragPointerId !== event.pointerId) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    if (Math.abs(dx) + Math.abs(dy) > 3) wrap.dataset.char3dDragged = "1";
    lastX = event.clientX;
    lastY = event.clientY;
    rotY += dx * 0.012;
    rotX = Math.min(1.1, Math.max(-1.1, rotX + dy * 0.012));
    renderFrame();
  });

  wrap.addEventListener("pointerup", endDrag);
  wrap.addEventListener("pointercancel", endDrag);
  wrap.addEventListener("lostpointercapture", endDrag);
}

function ensureStage(wrap) {
  if (renderer && wrapEl === wrap) return;
  disposeStage();
  wrapEl = wrap;

  const canvas = document.createElement("canvas");
  canvas.className = "modal-char3d-stage";
  canvas.setAttribute("aria-hidden", "true");
  wrap.appendChild(canvas);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 1, 4000);

  renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x000000, 0);
  renderer.sortObjects = true;

  bindPointer(wrap);
  resizeStage();
  requestAnimationFrame(() => {
    resizeStage();
    if (mesh) renderFrame();
  });
  resizeObserver = new ResizeObserver(() => resizeStage());
  resizeObserver.observe(wrap);
}

function loadMesh(char) {
  if (!char || !scene) return;
  if (mesh && currentChar === char) return;

  disposeMesh();
  currentChar = char;

  acquireGlyphMesh(char)
    .then((nextMesh) => {
      if (!enabled || currentChar !== char || !scene) {
        releaseGlyphMeshInstance(nextMesh);
        return;
      }
      mesh = nextMesh;
      scene.add(mesh);
      fitModalCharMesh(mesh);
      rotX = 0.22;
      rotY = 0;
      renderFrame();
      startRenderLoop();
    })
    .catch(() => {
      currentChar = "";
    });
}

export function isModalChar3dEnabled() {
  return enabled;
}

export function setModalChar3dEnabled(next, { persist = true } = {}) {
  enabled = Boolean(next);
  if (persist) saveEnabled(enabled);
  syncModalChar3dView();
}

export function refreshModalChar3dMaterial() {
  if (!enabled || !currentChar) return;
  const char = currentChar;
  disposeMesh();
  loadMesh(char);
}

function syncModalChar3dView() {
  const wrap = wrapEl || document.getElementById("modal-char-wrap");
  const char = charEl || document.getElementById("modal-char");
  if (!wrap || !char) return;

  wrapEl = wrap;
  charEl = char;

  if (enabled) {
    wrap.classList.add("modal__char-wrap--3d");
    char.setAttribute("aria-hidden", "true");
    ensureStage(wrap);
    loadMesh(char.textContent.trim());
    startRenderLoop();
    return;
  }

  wrap.classList.remove("modal__char-wrap--3d", "modal__char-wrap--dragging");
  char.removeAttribute("aria-hidden");
  stopRenderLoop();
  disposeStage();
}

export function syncModalChar3dForItem(char) {
  if (!enabled) return;
  const wrap = wrapEl || document.getElementById("modal-char-wrap");
  const charNode = charEl || document.getElementById("modal-char");
  if (wrap) wrap.classList.add("modal__char-wrap--3d");
  charNode?.setAttribute("aria-hidden", "true");
  loadMesh(char);
}

export function initModalChar3d() {
  enabled = readEnabled();

  for (const btn of document.querySelectorAll("[data-char-mode]")) {
    btn.addEventListener("click", () => {
      setModalChar3dEnabled(btn.dataset.charMode === "3d");
      syncCharModeButtons();
    });
  }

  syncCharModeButtons();
  if (enabled) syncModalChar3dView();
}

export function syncCharModeButtons() {
  for (const btn of document.querySelectorAll("[data-char-mode]")) {
    const active = (btn.dataset.charMode === "3d") === enabled;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", String(active));
  }
}

export function teardownModalChar3d() {
  stopRenderLoop();
}
