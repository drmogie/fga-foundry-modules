// Builds and shows the floating portrait popup, and cleans it up afterward.
// This is a plain DOM element appended to the page (not a Foundry "Application"
// window) since we don't want title bars or resize handles — just an image
// that appears, sits where it's configured to, and goes away again.

import { MODULE_ID, DEFAULT_CHAT_BUBBLE_STYLE, hexToRgb } from "./constants.js";
import { applyPositionStyle } from "./position.js";
import { getEffectiveAppearance, actorBubbleColor, actorBubbleTextColor } from "./appearance.js";

const POPUP_ID = "ccp-popup";
const BUBBLE_ID = "ccp-chat-bubble";

/**
 * Show the popup for a given actor. Which appearance settings apply —
 * this viewer's own, a GM appearance override, or a per-character
 * override just for this actor — is decided in appearance.js.
 * @param {Actor} actor
 * @param {{statusIcons?: {id: string, name: string, img: string}[], forceAura?: "healed"|"revived", chatText?: string}} [options]
 *   `statusIcons` — condition icons to overlay centered on the popup, only
 *   ever passed by the status-icon auto-popup trigger in main.js.
 *   `forceAura` — passed by main.js's heal/revive detection when HP just
 *   went up, to show the green ("healed") or gold ("revived") aura
 *   instead of re-deriving the aura from the actor's *current* state the
 *   way the bloodied check below does. Healed/revived are one-time
 *   events, not something recomputable from current data alone, so they
 *   have to be told explicitly rather than detected here.
 *   `chatText` — the actual message text, only ever passed by the
 *   chat-message trigger in main.js. When the GM has the chat bubble
 *   enabled, this is what shows in it; every other trigger (bloodied,
 *   healed/revived, status icons) has no line of dialogue, so it's simply
 *   never provided for those and no bubble appears.
 */
export function showCharacterPopup(actor, options = {}) {
  if (!actor) return;

  const appearance = getEffectiveAppearance(actor);

  const img =
    appearance.imageSource === "token"
      ? actor.prototypeToken?.texture?.src || actor.img
      : actor.img;
  if (!img) return;

  const duration = game.settings.get(MODULE_ID, "duration"); // always GM-controlled

  // If a popup is already showing (e.g. someone typing fast), replace it
  // rather than stacking multiple copies on screen. The chat bubble, if any
  // was showing, always rides along with the popup it belongs to.
  document.getElementById(POPUP_ID)?.remove();
  document.getElementById(BUBBLE_ID)?.remove();

  const wrapper = document.createElement("div");
  wrapper.id = POPUP_ID;
  wrapper.classList.add("ccp-position");
  applyPositionStyle(wrapper, {
    preset: appearance.positionPreset,
    x: appearance.positionX,
    y: appearance.positionY
  });

  const image = document.createElement("img");
  image.src = img;
  image.alt = actor.name ?? "";

  let imageTransform = `scale(${appearance.scale})`;
  if (appearance.flipHorizontal) imageTransform += " scaleX(-1)";
  if (appearance.flipVertical) imageTransform += " scaleY(-1)";
  image.style.transform = imageTransform;

  // Healed/revived (forced, event-based) take priority over bloodied
  // (recomputed from current state) when both could apply — e.g. someone
  // healed back up to 40% HP is still technically "bloodied" by the
  // threshold, but the aura that actually matters in that moment is the
  // green heal, not the red one.
  if (options.forceAura === "revived") wrapper.classList.add("ccp-revived");
  else if (options.forceAura === "healed") wrapper.classList.add("ccp-healed");
  else if (isBloodied(actor)) wrapper.classList.add("ccp-bloodied");

  wrapper.appendChild(image);

  const statusIcons = options.statusIcons ?? [];
  if (statusIcons.length) {
    const iconsLayer = document.createElement("div");
    iconsLayer.classList.add("ccp-status-icons");
    const iconScale = game.settings.get(MODULE_ID, "statusIconScale");
    iconsLayer.style.setProperty("--ccp-status-icon-scale", iconScale);
    for (const icon of statusIcons) {
      const iconImg = document.createElement("img");
      iconImg.src = icon.img;
      iconImg.alt = icon.name ?? "";
      iconImg.title = icon.name ?? "";
      iconsLayer.appendChild(iconImg);
    }
    wrapper.appendChild(iconsLayer);
  }

  document.body.appendChild(wrapper);

  // Chat bubble — the actual message text from chat, shown in a fixed
  // top-center box whose tail points toward whichever third of the screen
  // THIS VIEWER's own popup is positioned in (appearance is per-player, so
  // the tail direction is computed from this viewer's own settings, not a
  // shared GM-staged position the way FGA Scene Director's bubble works).
  let bubble = null;
  if (options.chatText && game.settings.get(MODULE_ID, "chatBubbleEnabled")) {
    bubble = buildChatBubble(actor, options.chatText, getTailBucket(appearance));
    document.body.appendChild(bubble);
  }

  // "Keep on screen" — skip the auto-hide timer entirely. The popup still
  // gets replaced the next time showCharacterPopup runs (see the
  // document.getElementById(POPUP_ID)?.remove() above), it just never
  // times out on its own.
  if (game.settings.get(MODULE_ID, "noTimeout")) return;

  const removeAll = () => {
    wrapper.remove();
    bubble?.remove();
  };

  if (appearance.fadeOut) {
    setTimeout(() => {
      wrapper.classList.add("ccp-fade-out");
      bubble?.classList.add("ccp-fade-out");
      wrapper.addEventListener("transitionend", removeAll, { once: true });
    }, duration * 1000);
  } else {
    setTimeout(removeAll, duration * 1000);
  }
}

/**
 * Which third of the screen this viewer's own popup is positioned in —
 * "left" | "center" | "right" — used to aim the chat bubble's tail. Mirrors
 * the same left/center/right bucketing FGA Scene Director uses for its own
 * speech bubble, just derived from this module's position settings
 * (a 3x3 preset grid, or custom x/y sliders) instead of a staged token's
 * on-canvas x.
 * @param {{positionPreset: string, positionX: number}} appearance
 */
function getTailBucket(appearance) {
  const preset = appearance.positionPreset;
  if (preset === "custom") {
    const x = appearance.positionX;
    if (typeof x !== "number") return "center";
    if (x < 33) return "left";
    if (x > 67) return "right";
    return "center";
  }
  if (preset?.endsWith("-left")) return "left";
  if (preset?.endsWith("-right")) return "right";
  return "center"; // top-center, center, bottom-center
}

/**
 * Build the chat-bubble element (not yet attached to the page).
 * @param {Actor} actor
 * @param {string} text
 * @param {"left"|"center"|"right"} tailBucket
 */
function buildChatBubble(actor, text, tailBucket) {
  const style = game.settings.get(MODULE_ID, "chatBubbleStyle") ?? DEFAULT_CHAT_BUBBLE_STYLE;
  // Tied to the SPEAKING character (an Actor flag, not a per-viewer
  // setting) — every viewer sees the same bubble color for this actor,
  // so color becomes a visual cue for who's talking. See appearance.js.
  // Text color defaults to that background's inverse but can be a custom
  // flag of its own, for the odd background where auto-invert looks off.
  const bgColor = actorBubbleColor(actor);
  const fgColor = actorBubbleTextColor(actor);

  const bubble = document.createElement("div");
  bubble.id = BUBBLE_ID;
  bubble.classList.add("ccp-chat-bubble");
  bubble.dataset.tail = tailBucket;
  bubble.style.setProperty("--ccp-bubble-width", `${style.widthPx}px`);
  bubble.style.setProperty("--ccp-bubble-height", `${style.heightPx}px`);
  bubble.style.setProperty("--ccp-bubble-bg", bgColor);
  bubble.style.setProperty("--ccp-bubble-fg", fgColor);
  bubble.style.setProperty("--ccp-bubble-border", hexToBorderRgba(fgColor));

  const nameSpan = document.createElement("span");
  nameSpan.classList.add("ccp-bubble-name");
  nameSpan.textContent = `${actor.name ?? ""}:`;

  const textSpan = document.createElement("span");
  textSpan.classList.add("ccp-bubble-text");
  textSpan.textContent = text;

  bubble.appendChild(nameSpan);
  bubble.appendChild(textSpan);
  return bubble;
}

/** A semi-transparent border shade derived from the bubble's foreground (text) color. */
function hexToBorderRgba(hex) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, 0.35)`;
}

/**
 * Whether this actor is at or below the GM's "bloodied" HP threshold —
 * only checked at all if the GM has turned the feature on. Prefers the
 * dnd5e system's own computed `hp.pct` (0-100) when available, falling
 * back to a manual value/max calculation for safety.
 *
 * Exported so main.js can use the same check to detect the *moment* an
 * actor crosses into bloodied (see the updateActor hook there), not just
 * to decorate a popup that's already showing for some other reason.
 * @param {Actor} actor
 */
export function isBloodied(actor) {
  if (!game.settings.get(MODULE_ID, "bloodiedEnabled")) return false;

  const hp = actor.system?.attributes?.hp;
  if (!hp) return false;

  let pct = hp.pct;
  if (typeof pct !== "number") {
    if (typeof hp.value !== "number" || typeof hp.max !== "number" || hp.max <= 0) return false;
    pct = (hp.value / hp.max) * 100;
  }

  const threshold = game.settings.get(MODULE_ID, "bloodiedThreshold");
  return pct <= threshold;
}
