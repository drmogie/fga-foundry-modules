import { MODULE_ID, SETTINGS, FLOATING_STATES, STATE } from "./constants.js";
import { getSceneState } from "./battle.js";
import { BattleWindow } from "./window.js";

let el = null;

function loadPos() {
  const saved = game.settings.get(MODULE_ID, SETTINGS.FLOATING_POS);
  return saved && Number.isFinite(saved.left) && Number.isFinite(saved.top) ? saved : { left: 90, top: 140 };
}

function applyPos(pos) {
  const maxLeft = Math.max(0, window.innerWidth - 56);
  const maxTop = Math.max(0, window.innerHeight - 56);
  el.style.left = `${Math.min(Math.max(pos.left, 0), maxLeft)}px`;
  el.style.top = `${Math.min(Math.max(pos.top, 0), maxTop)}px`;
}

export const FloatingButton = {
  init() {
    if (!game.user.isGM || el) return;
    el = document.createElement("div");
    el.id = "fga-bd-floating";
    el.innerHTML = `<i class="fa-solid fa-shield-halved"></i>`;
    document.body.append(el);
    applyPos(loadPos());

    let drag = null;
    el.addEventListener("pointerdown", ev => {
      if (ev.button !== 0) return;
      el.setPointerCapture(ev.pointerId);
      drag = { x: ev.clientX, y: ev.clientY, left: el.offsetLeft, top: el.offsetTop, moved: false };
    });
    el.addEventListener("pointermove", ev => {
      if (!drag) return;
      const dx = ev.clientX - drag.x;
      const dy = ev.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (drag.moved) applyPos({ left: drag.left + dx, top: drag.top + dy });
    });
    el.addEventListener("pointerup", async ev => {
      if (!drag) return;
      const wasDrag = drag.moved;
      drag = null;
      el.releasePointerCapture(ev.pointerId);
      if (wasDrag) {
        await game.settings.set(MODULE_ID, SETTINGS.FLOATING_POS, { left: el.offsetLeft, top: el.offsetTop });
      } else {
        BattleWindow.toggle();
      }
    });

    this.refresh();
  },

  refresh() {
    if (!el) return;
    const mode = game.settings.get(MODULE_ID, SETTINGS.FLOATING);
    const state = getSceneState(canvas?.scene);
    const show = mode === FLOATING_STATES.ALWAYS || (mode === FLOATING_STATES.BATTLE && !!state);
    el.style.display = show ? "flex" : "none";
    el.classList.toggle("state-frozen", state === STATE.FROZEN);
    el.classList.toggle("state-live", state === STATE.ACTIVE);
    el.title =
      state === STATE.FROZEN
        ? "GM Battle: no movement, waiting for Start"
        : state === STATE.ACTIVE
          ? "GM Battle: free movement, battle is live"
          : "GM Battle";
  }
};
