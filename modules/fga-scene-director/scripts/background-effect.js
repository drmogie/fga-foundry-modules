/**
 * Full-viewport background effect layer: blur and/or a color fade/dim, laid over the canvas.
 * Sits above the game board and below the staged character portraits and caption bar (see
 * z-index stacking in the CSS files), so a dim/blur reads as "the scene" darkening behind the
 * staged characters, not as a fullscreen curtain over everything.
 */
class BackgroundEffectImpl {
  #layer = null;

  #ensureLayer() {
    if (this.#layer) return this.#layer;
    const el = document.createElement("div");
    el.id = "fga-sd-bg-effect-layer";
    document.body.appendChild(el);
    this.#layer = el;
    return el;
  }

  /** Apply (or update) the effect described by a "backgroundEffect" section. */
  apply(section) {
    const el = this.#ensureLayer();
    const ms = Math.max(0, section.durationMs ?? 0);
    el.style.transition = `backdrop-filter ${ms}ms ease, background-color ${ms}ms ease`;

    const blurPx = section.blurEnabled ? Math.max(0, Number(section.blurAmount) || 0) : 0;
    const filterValue = blurPx > 0 ? `blur(${blurPx}px)` : "none";
    el.style.backdropFilter = filterValue;
    el.style.webkitBackdropFilter = filterValue;

    if (section.fadeEnabled) {
      const { r, g, b } = section.fadeColor ?? { r: 0, g: 0, b: 0 };
      const a = section.fadeOpacity ?? 0;
      el.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${a})`;
    } else {
      el.style.backgroundColor = "rgba(0, 0, 0, 0)";
    }
  }

  /** Fade the effect back out, per a "clearBackgroundEffect" section's own duration. */
  clear(durationMs = 400) {
    const el = this.#ensureLayer();
    const ms = Math.max(0, durationMs ?? 0);
    el.style.transition = `backdrop-filter ${ms}ms ease, background-color ${ms}ms ease`;
    el.style.backdropFilter = "none";
    el.style.webkitBackdropFilter = "none";
    el.style.backgroundColor = "rgba(0, 0, 0, 0)";
  }
}

export const BackgroundEffect = new BackgroundEffectImpl();
