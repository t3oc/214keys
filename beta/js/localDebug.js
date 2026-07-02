import { mountHeroEaseDebug } from "./heroEaseDebug.js";

async function mountHeroEaseDebugToggleFromLocal() {
  try {
    const mod = await import("../local/heroEaseDebugToggle.local.js");
    mod.mountHeroEaseDebugToggle();
    return;
  } catch {
    /* local-only toggle not present */
  }
  try {
    const mod = await import("../local/heroEaseDebugToggle.local.example.js");
    mod.mountHeroEaseDebugToggle();
  } catch {
    /* example toggle not loadable */
  }
}

export async function mountLocalDebug() {
  mountHeroEaseDebug();
  void mountHeroEaseDebugToggleFromLocal();

  try {
    const { mountParticleDebug } = await import("../local/particleDebug.local.js");
    mountParticleDebug();
  } catch {
    try {
      const { mountParticleDebug } = await import("../local/particleDebug.local.example.js");
      mountParticleDebug();
    } catch {
      /* local-only particle debug not present */
    }
  }
}
