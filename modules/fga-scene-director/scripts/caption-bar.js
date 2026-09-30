import { MODULE_ID, SETTINGS } from "./constants.js";

class CaptionBarImpl {
  #el = null;

  #ensure() {
    if (this.#el) return this.#el;
    const el = document.createElement("div");
    el.id = "fga-sd-caption-bar";
    el.classList.add("hidden");
    document.body.appendChild(el);
    this.#el = el;
    return el;
  }

  /** Re-reads the config settings and applies them to the bar's CSS. Call after any config change. */
  applyStyle() {
    const el = this.#ensure();
    const style = game.settings.get(MODULE_ID, SETTINGS.CAPTION_STYLE);
    const { r, g, b, a } = style.bgColor;
    el.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${a})`;
    el.dataset.location = style.location;
    el.style.setProperty("--fga-sd-caption-offset-x", `${style.offsetX}px`);
    el.style.setProperty("--fga-sd-caption-offset-y", `${style.offsetY}px`);
  }

  show(characterName, text) {
    const el = this.#ensure();
    this.applyStyle();
    el.textContent = `${characterName}: ${text}`;
    el.classList.remove("hidden");
  }

  clear() {
    const el = this.#ensure();
    el.classList.add("hidden");
    el.textContent = "";
  }
}

export const CaptionBar = new CaptionBarImpl();
