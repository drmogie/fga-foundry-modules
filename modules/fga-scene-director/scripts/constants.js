export const MODULE_ID = "fga-scene-director";

export const SETTINGS = {
  SCENES: "scenes",
  CAPTION_STYLE: "captionStyle",
  BUBBLE_STYLE: "bubbleStyle",
  FLOATING_BUTTON_ENABLED: "floatingButtonEnabled",
  FLOATING_BUTTON_POS: "floatingButtonPosition",
  EDITOR_TOOLS_DEFAULT_VISIBLE: "editorToolsDefaultVisible",
  KEYBOARD_NUDGE_ENABLED: "keyboardNudgeEnabled",
  DEFAULT_LINE_VISIBILITY: "defaultLineVisibility",
  EDITOR_WINDOW_OPEN: "editorWindowOpenState",
  TRANSITION_ENABLED: "transitionEnabled",
  TRANSITION_TYPE: "transitionType",
  AUTO_DELAY_ORDER: "autoDelayOrder",
  // A fresh character's default Image Source (Profile art vs Token art), picked by what kind
  // of token it is rather than one fixed default for everyone — Mogie's own game leans on
  // token art for mobs (so the map's own art shows up staged) and profile art for PCs. Four
  // independent settings rather than one, so the GM can flip any one of them without the
  // others: HOSTILE/NEUTRAL/FRIENDLY key off the placed token's own disposition (see
  // getDefaultImageSource in scene-data.js), PLAYER overrides all three of those the moment
  // the actor is player-owned or a "character"-type actor, since a party member's token is
  // usually disposition Friendly too and would otherwise be indistinguishable from a friendly
  // NPC ally by disposition alone.
  DEFAULT_IMAGE_SOURCE_HOSTILE: "defaultImageSourceHostile",
  DEFAULT_IMAGE_SOURCE_NEUTRAL: "defaultImageSourceNeutral",
  DEFAULT_IMAGE_SOURCE_FRIENDLY: "defaultImageSourceFriendly",
  DEFAULT_IMAGE_SOURCE_PLAYER: "defaultImageSourcePlayer"
};

// Section (timeline action) types
export const SECTION_TYPES = {
  CHARACTER: "character",
  LINE: "line",
  CLEAR_CHARACTER: "clearCharacter",
  CLEAR_TEXT: "clearText",
  BACKGROUND_EFFECT: "backgroundEffect",
  CLEAR_BACKGROUND_EFFECT: "clearBackgroundEffect",
  // A lighter-weight companion to CHARACTER: re-adjusts an already on-stage character —
  // appearance, movement-transition settings, recalling a saved Position Lock. As of
  // v2026.09.24.4 it can also originate a subject's real first appearance, but only one Stage
  // Character has already preloaded — see makeSection's CHARACTER_CONTROL case and
  // playback.js's own case for the "never fires for someone neither already staged nor
  // preloaded" rule that still applies to everyone else.
  CHARACTER_CONTROL: "characterControl",
  // A multi-select, image-grid alternative to CHARACTER for preparing several characters at
  // once: the GM checks off any number of currently-placed board tokens (Group tokens expand
  // into a header + their member roster, no token needed per member — same convention Add
  // Character's own Group optgroups already use) from a visual grid instead of picking one at
  // a time. As of v2026.09.24.4, firing this card never itself shows anyone — per Mogie
  // ("Stage is there to preload the character but the character shouldn't need fired"), each
  // not-yet-staged checked subject just has its art warmed up in the browser's cache
  // (StagingView.preloadCharacter); an already-staged one is left untouched. The actual first
  // appearance has to come from a Character Control section firing for that subject afterward
  // (see playback.js's own STAGE_CHARACTER/CHARACTER_CONTROL cases) — a Stage Character card
  // with no Character Control after it for a given subject never shows that subject at all.
  // Selection itself is just editing this section's data — nothing is preloaded until the card
  // is actually fired. See scene-data.js's charactersOnStageAt, which treats every one of this
  // section's selectedKeys as newly on-stage from here on for editor purposes (the Character
  // Control/Line/Clear Character target pickers), independent of StagingView's own live
  // staged/preloaded distinction above.
  STAGE_CHARACTER: "stageCharacter",
  CLEAR_SCENE: "clearScene",
  // A pure timeline marker with no visual/playback effect of its own. Manually stepping past
  // it (Next, or its own inert Fire button) does nothing — it only matters to Auto Play (see
  // scene-editor.js's #autoStep), which halts here until the GM clicks Continue, instead of
  // auto-advancing on a timer like every other section type does.
  PAUSE: "pause"
};

// Ways a staged character portrait can be obscured (secret-informant / reveal-sequence use case).
// Blur/Shadow/None are persistent LOOKS — the character stays visible in that look the whole
// time it's on stage. Fade In/Out and Teleport In/Out (added v2026.09.23.13, split into
// explicit directions in v2026.09.23.14 — see that version's own comment below) are ONE-SHOT
// ENTRANCE/EXIT EFFECTS instead: "Out" hides the whole portrait and rests hidden, "In" reveals
// it and rests fully visible (same resting look as None) — see staging-view.js's
// portraitConcealment for exactly what each one renders as. Because these are meant to be
// used as actual entrance/exit moments (not a look a character just "has"), an "In" style is
// also the one exception to every other style's "always instant on first appearance" rule —
// see showCharacter's own comment. #playMovementTransition reuses this same
// opacity-crossfade/clip-path-wipe visual language for the Movement subsection's own Fade
// Movement/Teleport Movement transition types (a different setting — see TRANSITION_TYPES
// below — for MOVING an already-staged character, not obscuring/revealing one in place).
export const OBSCURE_STYLES = {
  BLUR: "blur",
  SHADOW: "shadow",
  NONE: "none",
  FADE_IN: "fadeIn",
  FADE_OUT: "fadeOut",
  TELEPORT_IN: "teleportIn",
  TELEPORT_OUT: "teleportOut"
};

// Per-line visibility choice
export const LINE_VISIBILITY = {
  PUBLIC: "public",
  PRIVATE: "private"
};

export const DEFAULT_CAPTION_STYLE = {
  mode: "cc", // "cc" (closed-caption bar) | "bubble" (future)
  bgColor: { r: 0, g: 0, b: 0, a: 0.65 },
  location: "bottom",
  offsetX: 0,
  offsetY: 0
};

// Fixed top-center speech bubble — a per-line alternative to the caption bar (see the Line
// section's own "Bubble" checkbox). heightPx is used as a minimum, not a hard clamp, so a
// longer line can still grow the box rather than getting clipped.
export const DEFAULT_BUBBLE_STYLE = {
  widthPx: 600,
  heightPx: 120
};

export const DEFAULT_FADE_MS = 400;

// How long Auto Play waits after firing a section before auto-advancing to the next one, in
// ms — the default for a freshly-created section's own tunable "auto-delay" number box.
export const DEFAULT_AUTO_DELAY_MS = 2000;

// "Position Locks" — 10 GM-defined save slots per character (see scene-data.js's
// getCharacterLockSlots/setCharacterLockSlot), remembering exact staged spots that character
// can be instantly returned to later, independent of the fixed Left/Center/Right quick
// positions and shared across every one of that character's Character sections in a scene
// (not per-section — the whole point is "it'll know where to return... when played again").
export const LOCK_SLOT_COUNT = 10;

// Animated movement (instead of an instant snap) for an already-staged character moving to a
// new position — e.g. recalling a Position Lock. Off by default (matches all prior behavior)
// until the GM turns it on in Config Settings. Slide just CSS-transitions left/top directly.
// Fade/Teleport (added v2026.09.23.13) instead hide the character at the old spot, snap
// position while hidden, then reveal it at the new spot — see staging-view.js's
// #playMovementTransition — reusing the exact same opacity-crossfade/clip-path-wipe look as
// the Fade/Teleport OBSCURE styles above (a different setting; these two constant objects
// just happen to share their string values, "fade"/"teleport", with no relation between them).
export const TRANSITION_TYPES = {
  SLIDE: "slide",
  FADE: "fade",
  TELEPORT: "teleport"
};
// Default for a freshly-created Character/Character Control section's own "Transition (ms)"
// field (Movement subsection) — how long Slide's slide takes, or how long EACH of Fade/
// Teleport Movement's two phases (hide, then reveal) takes, so a two-phase move takes 2x this.
export const DEFAULT_TRANSITION_MS = 600;

// Auto Play's per-section timing order — a world-scoped GM choice (Config Settings), NOT
// per-section: whether a section's own "time to trigger" number box counts as a delay AFTER
// it fires (waiting before the NEXT section) or BEFORE it fires (waiting, then firing this
// one). See scene-editor.js's #autoStep. Action-then-timer is the original/default behavior.
export const AUTO_DELAY_ORDER = {
  ACTION_THEN_TIMER: "actionThenTimer",
  TIMER_THEN_ACTION: "timerThenAction"
};

export const DEFAULT_BLUR_PX = 8;
export const DEFAULT_BG_FADE_OPACITY = 0.6;
export const DEFAULT_OBSCURE_BLUR_PX = 14;

// Stage Character's own image-grid thumbnail size, as a multiplier the GM can adjust with the
// slider at the top of the card (editor-only cosmetic — never affects the actual staged
// portrait's own Scale field). Mogie's own starting value; may change later.
export const DEFAULT_STAGE_CHARACTER_THUMB_SCALE = 0.3;
