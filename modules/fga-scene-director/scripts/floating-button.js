import { MODULE_ID, SETTINGS } from "./constants.js";

class FloatingButtonImpl {
  #el = null;
  #getEditorApp = null; // injected by main.js: () => SceneEditorApp instance (creates if needed)

  init(getEditorApp) {
    this.#getEditorApp = getEditorApp;
    this.#build();
    this.refreshVisibility();
    this.setOpenState(game.settings.get(MODULE_ID, SETTINGS.EDITOR_WINDOW_OPEN));
  }

  #build() {
    if (this.#el) return;
    const pos = game.settings.get(MODULE_ID, SETTINGS.FLOATING_BUTTON_POS) ?? { x: 20, y: 20 };
    const el = document.createElement("div");
    el.id = "fga-sd-floating-button";
    el.style.left = `${pos.x}px`;
    el.style.top = `${pos.y}px`;
    el.innerHTML = `<img src="modules/${MODULE_ID}/assets/floating-button-icon.png" alt="FGA Scene Director" />`;
    document.body.appendChild(el);
    this.#el = el;

    let dragging = false;
    let moved = false;
    let startX, startY, origX, origY;

    el.addEventListener("pointerdown", ev => {
      dragging = true;
      moved = false;
      startX = ev.clientX; startY = ev.clientY;
      const rect = el.getBoundingClientRect();
      origX = rect.left; origY = rect.top;
      el.setPointerCapture(ev.pointerId);
    });
    el.addEventListener("pointermove", ev => {
      if (!dragging) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      el.style.left = `${Math.max(0, origX + dx)}px`;
      el.style.top = `${Math.max(0, origY + dy)}px`;
    });
    const endDrag = async ev => {
      if (!dragging) return;
      dragging = false;
      try { el.releasePointerCapture(ev.pointerId); } catch (_e) { /* noop */ }
      const rect = el.getBoundingClientRect();
      await game.settings.set(MODULE_ID, SETTINGS.FLOATING_BUTTON_POS, { x: rect.left, y: rect.top });
      if (!moved) this.#toggleEditor();
    };
    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", endDrag);
  }

  #toggleEditor() {
    const app = this.#getEditorApp?.();
    if (!app) return;
    if (app.rendered) app.close();
    else app.render(true);
  }

  refreshVisibility() {
    if (!this.#el) return;
    const enabled = game.settings.get(MODULE_ID, SETTINGS.FLOATING_BUTTON_ENABLED);
    this.#el.classList.toggle("hidden", !enabled);
  }

  setOpenState(open) {
    this.#el?.classList.toggle("state-open", !!open);
    this.#el?.classList.toggle("state-closed", !open);
  }
}

export const FloatingButton = new FloatingButtonImpl();
