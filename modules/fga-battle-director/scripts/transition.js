import { MODULE_ID, SETTINGS } from "./constants.js";
import { TRANSITION, drawFrame, easeInOut } from "./transition-draw.js";

const SOCKET = `module.${MODULE_ID}`;
const FAILSAFE_EXTRA_MS = 15000;
const SETTLE_MS = 300;

let canvasEl = null;
let ctx = null;
let failSafe = null;
let runId = 0;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function resolveEffect(effect) {
  if (effect === TRANSITION.NONE || !effect) return TRANSITION.NONE;
  // Respect "reduce motion": swap the spinning/moving effects for a plain fade.
  const motionEffects = [TRANSITION.SWIRL, TRANSITION.GAS, TRANSITION.OIL];
  if (motionEffects.includes(effect) && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return TRANSITION.FADE;
  }
  return effect;
}

function ensureOverlay() {
  if (canvasEl) return;
  canvasEl = document.createElement("canvas");
  canvasEl.id = "fga-bd-transition";
  Object.assign(canvasEl.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: "100vw",
    height: "100vh",
    zIndex: "100000",
    pointerEvents: "none"
  });
  ctx = canvasEl.getContext("2d");
  document.body.append(canvasEl);
  window.addEventListener("resize", sizeOverlay);
  sizeOverlay();
}

function sizeOverlay() {
  if (!canvasEl) return;
  canvasEl.width = window.innerWidth;
  canvasEl.height = window.innerHeight;
}

function removeOverlay() {
  clearTimeout(failSafe);
  failSafe = null;
  window.removeEventListener("resize", sizeOverlay);
  canvasEl?.remove();
  canvasEl = null;
  ctx = null;
}

function animate(effect, from, to, ms, dir, id) {
  return new Promise(resolve => {
    const start = performance.now();
    const step = now => {
      if (id !== runId || !canvasEl) return resolve();
      const t = Math.min(1, (now - start) / Math.max(1, ms));
      const p = from + (to - from) * easeInOut(t);
      drawFrame(ctx, canvasEl.width, canvasEl.height, effect, p, dir);
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

function audienceMatches(audience) {
  return audience !== "gm" || game.user.isGM;
}

/* ---------- what runs on every screen ---------- */

async function runCover({ effect, ms, audience }) {
  if (!audienceMatches(audience)) return;
  const fx = resolveEffect(effect);
  if (fx === TRANSITION.NONE) return;
  ensureOverlay();
  const id = ++runId;
  clearTimeout(failSafe);
  failSafe = setTimeout(removeOverlay, ms + FAILSAFE_EXTRA_MS);
  await animate(fx, 0, 1, ms, "in", id);
  if (id === runId && ctx) drawFrame(ctx, canvasEl.width, canvasEl.height, fx, 1, "in");
}

async function runReveal({ effect, ms, audience, sceneId }) {
  if (!audienceMatches(audience)) return;
  const fx = resolveEffect(effect);
  if (fx === TRANSITION.NONE || !canvasEl) return;
  const id = ++runId;

  // Stay black until this screen has finished loading the new scene.
  const deadline = performance.now() + 10000;
  while (performance.now() < deadline) {
    if (canvas?.ready && (!sceneId || canvas.scene?.id === sceneId)) break;
    await sleep(100);
  }
  await sleep(SETTLE_MS);
  if (id !== runId || !canvasEl) return;

  await animate(fx, 1, 0, ms, "out", id);
  if (id === runId) removeOverlay();
}

/* ---------- public ---------- */

export const Transition = {
  init() {
    game.socket.on(SOCKET, data => {
      if (data?.type === "cover") runCover(data);
      else if (data?.type === "reveal") runReveal(data);
    });
  },

  currentEffect() {
    return game.settings.get(MODULE_ID, SETTINGS.TRANSITION);
  },

  currentMs() {
    const ms = Number(game.settings.get(MODULE_ID, SETTINGS.TRANSITION_MS));
    return Math.min(6000, Math.max(300, Number.isFinite(ms) ? ms : 1400));
  },

  /** Black out every screen that is about to change. Resolves once it is fully black. */
  async cover({ effect, audience = "all" }) {
    const ms = this.currentMs();
    const data = { type: "cover", effect, ms, audience };
    game.socket.emit(SOCKET, data);
    await runCover(data);
    return ms;
  },

  /** Open the black again once each screen has the new scene up. */
  reveal({ effect, audience = "all", sceneId = null }) {
    const ms = this.currentMs();
    const data = { type: "reveal", effect, ms, audience, sceneId };
    game.socket.emit(SOCKET, data);
    return runReveal(data);
  },

  /** Emergency exit: something failed while the screen was black. */
  abort({ effect, audience = "all" }) {
    return this.reveal({ effect, audience, sceneId: canvas?.scene?.id ?? null });
  }
};
