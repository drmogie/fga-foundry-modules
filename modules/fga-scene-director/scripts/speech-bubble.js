import { MODULE_ID, SETTINGS, DEFAULT_BUBBLE_STYLE } from "./constants.js";

/**
 * Fixed, large "comic" speech bubble — a per-line alternative to the caption bar (see the
 * Line section's own "Bubble" checkbox in the Scene Editor). Always sits top-center and never
 * moves; only its tail swaps between three fixed spots (left/center/right, via the
 * [data-tail] attribute in speech-bubble.css) to loosely point toward whichever third of the
 * screen the speaking character is staged in — see StagingView#getTailBucket.
 */
class SpeechBubbleImpl {
  #el = null;

  #ensure() {
    if (this.#el) return this.#el;
    const el = document.createElement("div");
    el.id = "fga-sd-speech-bubble";
    el.classList.add("hidden");
    el.dataset.tail = "center";

    const speaker = document.createElement("span");
    speaker.className = "fga-sd-bubble-speaker";
    const text = document.createElement("span");
    text.className = "fga-sd-bubble-text";
    el.appendChild(speaker);
    el.appendChild(text);

    document.body.appendChild(el);
    this.#el = el;
    return el;
  }

  /** Re-reads the configured width/min-height and applies them. Call after any config change. */
  applyStyle() {
    const el = this.#ensure();
    const style = game.settings.get(MODULE_ID, SETTINGS.BUBBLE_STYLE) ?? DEFAULT_BUBBLE_STYLE;
    el.style.width = `${Math.max(0, Number(style.widthPx) || DEFAULT_BUBBLE_STYLE.widthPx)}px`;
    el.style.minHeight = `${Math.max(0, Number(style.heightPx) || DEFAULT_BUBBLE_STYLE.heightPx)}px`;
  }

  /** @param tail "left" | "center" | "right" — which side the tail points from. */
  show(characterName, text, tail = "center") {
    const el = this.#ensure();
    this.applyStyle();
    el.dataset.tail = tail === "left" || tail === "right" ? tail : "center";
    el.querySelector(".fga-sd-bubble-speaker").textContent = characterName;
    el.querySelector(".fga-sd-bubble-text").textContent = text;
    el.classList.remove("hidden");
  }

  clear() {
    const el = this.#ensure();
    el.classList.add("hidden");
  }
}

export const SpeechBubble = new SpeechBubbleImpl();
