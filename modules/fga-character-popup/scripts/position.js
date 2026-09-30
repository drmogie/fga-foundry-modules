// Shared positioning logic, used both by the real on-screen popup (popup.js)
// and by the little live preview inside the settings forms. The element
// passed in already has its "base" class (ccp-position for the real popup,
// ccp-preview-thumb for the in-form preview) which controls whether it's
// `position: fixed` (whole screen) or `position: absolute` (inside the
// little preview box) — this function only handles WHERE within that space.

/**
 * @param {HTMLElement} el
 * @param {{preset: string, x: number, y: number}} options
 */
export function applyPositionStyle(el, { preset, x, y }) {
  // Clear anything from a previous call (the preview updates live as you type).
  el.className = el.className.replace(/\bccp-pos-\S+/g, "").trim();
  el.style.left = "";
  el.style.top = "";
  el.style.right = "";
  el.style.bottom = "";
  el.style.transform = "";

  if (preset === "custom") {
    el.style.left = `${x}%`;
    el.style.top = `${y}%`;
    el.style.transform = "translate(-50%, -50%)";
  } else {
    el.classList.add(`ccp-pos-${preset}`);
  }
}
