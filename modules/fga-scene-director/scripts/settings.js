import { MODULE_ID, SETTINGS, DEFAULT_CAPTION_STYLE, DEFAULT_BUBBLE_STYLE, TRANSITION_TYPES, AUTO_DELAY_ORDER } from "./constants.js";
import { ConfigSettingsApp } from "./apps/config-settings.js";

export function registerSettings() {
  // All of Scene Director's settings live together in one custom "Configure Scene Director"
  // window (caption styling needs custom UI anyway — a color picker + live preview can't be
  // a stock Foundry setting type), reachable from the standard Module Settings menu.
  game.settings.registerMenu(MODULE_ID, "configMenu", {
    name: "FGA_SCENE_DIRECTOR.Config.Title",
    label: "FGA_SCENE_DIRECTOR.Config.Title",
    icon: "fa-solid fa-sliders",
    type: ConfigSettingsApp,
    restricted: true
  });

  // World-scoped data store for every scene the GM has built.
  game.settings.register(MODULE_ID, SETTINGS.SCENES, {
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });

  // Caption (closed-caption bar) styling — edited via the Config settings window.
  game.settings.register(MODULE_ID, SETTINGS.CAPTION_STYLE, {
    scope: "world",
    config: false,
    type: Object,
    default: foundry.utils.deepClone(DEFAULT_CAPTION_STYLE)
  });

  // Speech-bubble sizing (width/min-height) — edited via the Config settings window's own
  // Bubble section, same pattern as caption styling above.
  game.settings.register(MODULE_ID, SETTINGS.BUBBLE_STYLE, {
    scope: "world",
    config: false,
    type: Object,
    default: foundry.utils.deepClone(DEFAULT_BUBBLE_STYLE)
  });

  // Whether the draggable floating fallback button is available at all. Stored as "enabled"
  // (true = shown) even though the Config Settings window presents it to the GM inverted, as
  // a "Hide floating button" checkbox — that reads more naturally than an "enable" toggle you
  // have to uncheck to hide something.
  game.settings.register(MODULE_ID, SETTINGS.FLOATING_BUTTON_ENABLED, {
    name: "FGA_SCENE_DIRECTOR.Settings.HideFloatingButton.Name",
    hint: "FGA_SCENE_DIRECTOR.Settings.HideFloatingButton.Hint",
    scope: "client",
    config: false,
    type: Boolean,
    default: true
  });

  // Remembered screen position of the floating button (it's drag-and-drop movable).
  game.settings.register(MODULE_ID, SETTINGS.FLOATING_BUTTON_POS, {
    scope: "client",
    config: false,
    type: Object,
    default: { x: 20, y: 20 }
  });

  // Whether the flip/rotate editor tools default to shown or hidden on the staging screen.
  game.settings.register(MODULE_ID, SETTINGS.EDITOR_TOOLS_DEFAULT_VISIBLE, {
    name: "FGA_SCENE_DIRECTOR.Settings.EditorToolsDefaultVisible.Name",
    hint: "FGA_SCENE_DIRECTOR.Settings.EditorToolsDefaultVisible.Hint",
    scope: "client",
    config: false,
    type: Boolean,
    default: true
  });

  // Enable/disable the arrow-key nudge feature entirely.
  game.settings.register(MODULE_ID, SETTINGS.KEYBOARD_NUDGE_ENABLED, {
    name: "FGA_SCENE_DIRECTOR.Settings.KeyboardNudgeEnabled.Name",
    hint: "FGA_SCENE_DIRECTOR.Settings.KeyboardNudgeEnabled.Hint",
    scope: "client",
    config: false,
    type: Boolean,
    default: true
  });

  // Default Public/Private for newly-added line sections.
  game.settings.register(MODULE_ID, SETTINGS.DEFAULT_LINE_VISIBILITY, {
    name: "FGA_SCENE_DIRECTOR.Settings.DefaultLineVisibility.Name",
    hint: "FGA_SCENE_DIRECTOR.Settings.DefaultLineVisibility.Hint",
    scope: "world",
    config: false,
    type: String,
    choices: {
      public: "FGA_SCENE_DIRECTOR.Settings.DefaultLineVisibility.Public",
      private: "FGA_SCENE_DIRECTOR.Settings.DefaultLineVisibility.Private"
    },
    default: "public"
  });

  // Remembers whether the Scene Editor Window was open (drives the toolbar/floating-button state color).
  game.settings.register(MODULE_ID, SETTINGS.EDITOR_WINDOW_OPEN, {
    scope: "client",
    config: false,
    type: Boolean,
    default: false
  });

  // Whether an already-staged character moving to a new position (e.g. recalling a Position
  // Lock, then actually firing/advancing to that section) animates smoothly to its new spot
  // instead of snapping there instantly. Off by default — matches every prior version's
  // behavior until the GM turns it on. Manual dragging always stays an instant snap regardless
  // of this setting (see staging-view.js's #bindDrag).
  game.settings.register(MODULE_ID, SETTINGS.TRANSITION_ENABLED, {
    name: "FGA_SCENE_DIRECTOR.Settings.TransitionEnabled.Name",
    hint: "FGA_SCENE_DIRECTOR.Settings.TransitionEnabled.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  // Which animated movement style to use when TRANSITION_ENABLED is on: Slide (left/top
  // CSS-transitions directly), or Fade/Teleport Movement (hide at the old spot, snap, reveal
  // at the new spot — see staging-view.js's #playMovementTransition).
  game.settings.register(MODULE_ID, SETTINGS.TRANSITION_TYPE, {
    name: "FGA_SCENE_DIRECTOR.Settings.TransitionType.Name",
    hint: "FGA_SCENE_DIRECTOR.Settings.TransitionType.Hint",
    scope: "world",
    config: false,
    type: String,
    choices: {
      [TRANSITION_TYPES.SLIDE]: "FGA_SCENE_DIRECTOR.Settings.TransitionType.Slide",
      [TRANSITION_TYPES.FADE]: "FGA_SCENE_DIRECTOR.Settings.TransitionType.FadeMovement",
      [TRANSITION_TYPES.TELEPORT]: "FGA_SCENE_DIRECTOR.Settings.TransitionType.TeleportMovement"
    },
    default: TRANSITION_TYPES.SLIDE
  });

  // Auto Play's per-section timing order: does a section's own "time to trigger" delay count
  // as the wait AFTER it fires (before the next one), or BEFORE it fires (then fire, then move
  // on right away)? A world-scoped GM choice, not per-section — see AUTO_DELAY_ORDER's own
  // comment in constants.js and #autoStep in scene-editor.js.
  game.settings.register(MODULE_ID, SETTINGS.AUTO_DELAY_ORDER, {
    name: "FGA_SCENE_DIRECTOR.Settings.AutoDelayOrder.Name",
    hint: "FGA_SCENE_DIRECTOR.Settings.AutoDelayOrder.Hint",
    scope: "world",
    config: false,
    type: String,
    choices: {
      [AUTO_DELAY_ORDER.ACTION_THEN_TIMER]: "FGA_SCENE_DIRECTOR.Settings.AutoDelayOrder.ActionThenTimer",
      [AUTO_DELAY_ORDER.TIMER_THEN_ACTION]: "FGA_SCENE_DIRECTOR.Settings.AutoDelayOrder.TimerThenAction"
    },
    default: AUTO_DELAY_ORDER.ACTION_THEN_TIMER
  });

  // A fresh character's default Image Source, by what kind of token it is — see constants.js's
  // own comment on these four settings and scene-data.js's getDefaultImageSource. Hostile/
  // Neutral/Friendly default to Token art (mobs' map art shows up staged); Player defaults to
  // Profile art. Each is independent so the GM can flip any one without touching the others.
  const registerImageSourceDefault = (key, nameKey, hintKey, defaultValue) => {
    game.settings.register(MODULE_ID, key, {
      name: nameKey,
      hint: hintKey,
      scope: "world",
      config: false,
      type: String,
      choices: {
        profile: "FGA_SCENE_DIRECTOR.Settings.DefaultImageSource.Profile",
        token: "FGA_SCENE_DIRECTOR.Settings.DefaultImageSource.Token"
      },
      default: defaultValue
    });
  };
  registerImageSourceDefault(SETTINGS.DEFAULT_IMAGE_SOURCE_HOSTILE, "FGA_SCENE_DIRECTOR.Settings.DefaultImageSource.Hostile", "FGA_SCENE_DIRECTOR.Settings.DefaultImageSource.Hint", "token");
  registerImageSourceDefault(SETTINGS.DEFAULT_IMAGE_SOURCE_NEUTRAL, "FGA_SCENE_DIRECTOR.Settings.DefaultImageSource.Neutral", "FGA_SCENE_DIRECTOR.Settings.DefaultImageSource.Hint", "token");
  registerImageSourceDefault(SETTINGS.DEFAULT_IMAGE_SOURCE_FRIENDLY, "FGA_SCENE_DIRECTOR.Settings.DefaultImageSource.Friendly", "FGA_SCENE_DIRECTOR.Settings.DefaultImageSource.Hint", "token");
  registerImageSourceDefault(SETTINGS.DEFAULT_IMAGE_SOURCE_PLAYER, "FGA_SCENE_DIRECTOR.Settings.DefaultImageSource.Player", "FGA_SCENE_DIRECTOR.Settings.DefaultImageSource.Hint", "profile");
}
