// Shared constants and small helpers used across the module's files.
// Keeping these in their own tiny file avoids circular-import problems
// between settings.js and the settings-form classes.

export const MODULE_ID = "fga-character-popup";

// The 3x3 quick-set grid, plus "custom" for the manual X/Y sliders.
// Keys are used internally; labels are what the player sees in the dropdown.
export const POSITION_PRESETS = {
  custom: "Custom (use sliders below)",
  "top-left": "Top Left",
  "top-center": "Top Center",
  "top-right": "Top Right",
  "center-left": "Center Left",
  center: "Center",
  "center-right": "Center Right",
  "bottom-left": "Bottom Left",
  "bottom-center": "Bottom Center",
  "bottom-right": "Bottom Right"
};

/** Build the {key, label, selected} list the position <select> template needs. */
export function buildPositionPresetOptions(currentKey) {
  return Object.entries(POSITION_PRESETS).map(([key, label]) => ({
    key,
    label,
    selected: key === currentKey
  }));
}

/** Build the {key, label, selected} list the image-source <select> template needs. */
export function buildImageSourceOptions(currentKey) {
  return [
    { key: "portrait", label: "Character Portrait", selected: currentKey === "portrait" },
    { key: "token", label: "Token Image", selected: currentKey === "token" }
  ];
}

/**
 * Same as buildImageSourceOptions, but for a GM override field where
 * leaving it unset ("") means "inherit — each viewer keeps their own choice."
 */
export function buildImageSourceOverrideOptions(currentKey) {
  return [
    { key: "", label: "Inherit — each viewer's own choice", selected: !currentKey },
    { key: "portrait", label: "Character Portrait", selected: currentKey === "portrait" },
    { key: "token", label: "Token Image", selected: currentKey === "token" }
  ];
}

// Used as a preview image / popup fallback if an actor somehow has no image set.
export const FALLBACK_IMAGE = "icons/svg/mystery-man.svg";

// Default size for the optional chat-bubble overlay (see chatBubbleStyle
// setting, popup.js's buildChatBubble, and the GM Rules form).
export const DEFAULT_CHAT_BUBBLE_STYLE = { widthPx: 420, heightPx: 90 };

// Fallback chat-bubble background color for a character with no
// "bubbleColor" flag set of their own (see appearance.js's
// actorBubbleColor) — text color is always computed as this color's RGB
// inverse, never set separately. Shared by popup.js (the real bubble),
// player-settings-form.js, and gm-settings-form.js (their previews), so
// they all compute the same inverse the same way.
export const DEFAULT_CHAT_BUBBLE_COLOR = "#0a0a0e";

/** "#rgb" or "#rrggbb" -> {r, g, b} (0-255 each). */
export function hexToRgb(hex) {
  const clean = (hex ?? "").replace("#", "").trim();
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean.padEnd(6, "0").slice(0, 6);
  const num = parseInt(full, 16) || 0;
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

/** {r, g, b} (0-255 each) -> "#rrggbb". */
export function rgbToHex({ r, g, b }) {
  const toHex = (c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** The literal RGB inverse of a "#rrggbb" color — e.g. black <-> white. */
export function invertHexColor(hex) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex({ r: 255 - r, g: 255 - g, b: 255 - b });
}
