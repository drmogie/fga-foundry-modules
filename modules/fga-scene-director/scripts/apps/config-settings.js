import { MODULE_ID, SETTINGS, DEFAULT_CAPTION_STYLE, DEFAULT_BUBBLE_STYLE } from "../constants.js";
import { CaptionBar } from "../caption-bar.js";
import { SpeechBubble } from "../speech-bubble.js";
import { rgbToHex, hexToRgb } from "../color-utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ConfigSettingsApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "fga-scene-director-config",
    classes: ["fga-sd-config"],
    tag: "form",
    window: {
      title: "FGA_SCENE_DIRECTOR.Config.Title",
      icon: "fa-solid fa-sliders",
      // Was "auto" height — fine when this window only had a handful of settings, but it's
      // grown a lot (Caption, Bubble, and a steadily-lengthening general settings section) and
      // an "auto"-height window has no way to scroll: past a certain point it just runs off
      // the bottom of the screen with the rest of its content unreachable. Fixed height +
      // resizable + the CSS scroll region below (config.css's .window-content) fixes that.
      resizable: true
    },
    position: { width: 480, height: 460 },
    actions: {
      resetOffset: ConfigSettingsApp.#onResetOffset,
      toggleOnScreenPreview: ConfigSettingsApp.#onToggleOnScreenPreview,
      toggleBubblePreview: ConfigSettingsApp.#onToggleBubblePreview,
      switchConfigTab: ConfigSettingsApp.#onSwitchConfigTab
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/config.hbs` }
  };

  /** Whether the "show on screen" caption preview is currently live on the actual game
   *  canvas (as opposed to just the little swatch preview inside this settings window). */
  #onScreenPreviewActive = false;

  /** Same idea, for the speech bubble's own "show on screen" test button. */
  #bubblePreviewActive = false;

  /** Which of the three settings groups (Caption/Bubble/General) is showing — this window
   *  used to be one long scrolling form; broken up into tabs (per Mogie's own suggestion,
   *  once it had grown past a comfortable single screenful) so only one group's fields show
   *  at a time. Persisted as an instance field (not just DOM state) so a genuine re-render —
   *  not just a tab click — keeps whichever tab the GM was on, same precedent as the Scene
   *  Editor's own per-section `collapsed` flag. */
  #activeTab = "caption";

  async _prepareContext(_options) {
    const style = game.settings.get(MODULE_ID, SETTINGS.CAPTION_STYLE) ?? foundry.utils.deepClone(DEFAULT_CAPTION_STYLE);
    const bubbleStyle = game.settings.get(MODULE_ID, SETTINGS.BUBBLE_STYLE) ?? foundry.utils.deepClone(DEFAULT_BUBBLE_STYLE);
    const moduleData = game.modules.get(MODULE_ID);
    return {
      activeTab: this.#activeTab,
      previewText: game.i18n.format("FGA_SCENE_DIRECTOR.Config.PreviewText", { version: moduleData?.version ?? "" }),
      bgColorHex: rgbToHex(style.bgColor.r, style.bgColor.g, style.bgColor.b),
      bgOpacityPct: Math.round((style.bgColor.a ?? 1) * 100),
      location: style.location,
      offsetX: style.offsetX,
      offsetY: style.offsetY,
      bubbleWidthPx: bubbleStyle.widthPx,
      bubbleHeightPx: bubbleStyle.heightPx,
      floatingButtonHidden: !game.settings.get(MODULE_ID, SETTINGS.FLOATING_BUTTON_ENABLED),
      editorToolsDefaultVisible: game.settings.get(MODULE_ID, SETTINGS.EDITOR_TOOLS_DEFAULT_VISIBLE),
      keyboardNudgeEnabled: game.settings.get(MODULE_ID, SETTINGS.KEYBOARD_NUDGE_ENABLED),
      defaultLineVisibility: game.settings.get(MODULE_ID, SETTINGS.DEFAULT_LINE_VISIBILITY),
      transitionEnabled: game.settings.get(MODULE_ID, SETTINGS.TRANSITION_ENABLED),
      transitionType: game.settings.get(MODULE_ID, SETTINGS.TRANSITION_TYPE),
      autoDelayOrder: game.settings.get(MODULE_ID, SETTINGS.AUTO_DELAY_ORDER),
      defaultImageSourceHostile: game.settings.get(MODULE_ID, SETTINGS.DEFAULT_IMAGE_SOURCE_HOSTILE),
      defaultImageSourceNeutral: game.settings.get(MODULE_ID, SETTINGS.DEFAULT_IMAGE_SOURCE_NEUTRAL),
      defaultImageSourceFriendly: game.settings.get(MODULE_ID, SETTINGS.DEFAULT_IMAGE_SOURCE_FRIENDLY),
      defaultImageSourcePlayer: game.settings.get(MODULE_ID, SETTINGS.DEFAULT_IMAGE_SOURCE_PLAYER)
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this.element.querySelectorAll('[data-action="update"]').forEach(el => {
      const evtName = el.type === "range" || el.type === "color" ? "input" : "change";
      el.addEventListener(evtName, () => this.#applyFromForm());
    });
    this.#updatePreview();
  }

  #currentFormValues() {
    const el = this.element;
    return {
      bgColorHex: el.querySelector('[name="bgColorHex"]').value,
      bgOpacityPct: Number(el.querySelector('[name="bgOpacity"]').value),
      location: el.querySelector('[name="location"]').value,
      offsetX: Number(el.querySelector('[name="offsetX"]').value) || 0,
      offsetY: Number(el.querySelector('[name="offsetY"]').value) || 0,
      bubbleWidthPx: Number(el.querySelector('[name="bubbleWidthPx"]').value) || DEFAULT_BUBBLE_STYLE.widthPx,
      bubbleHeightPx: Number(el.querySelector('[name="bubbleHeightPx"]').value) || DEFAULT_BUBBLE_STYLE.heightPx,
      floatingButtonHidden: el.querySelector('[name="floatingButtonHidden"]').checked,
      editorToolsDefaultVisible: el.querySelector('[name="editorToolsDefaultVisible"]').checked,
      keyboardNudgeEnabled: el.querySelector('[name="keyboardNudgeEnabled"]').checked,
      defaultLineVisibility: el.querySelector('[name="defaultLineVisibility"]').value,
      transitionEnabled: el.querySelector('[name="transitionEnabled"]').checked,
      transitionType: el.querySelector('[name="transitionType"]').value,
      autoDelayOrder: el.querySelector('[name="autoDelayOrder"]').value,
      defaultImageSourceHostile: el.querySelector('[name="defaultImageSourceHostile"]').value,
      defaultImageSourceNeutral: el.querySelector('[name="defaultImageSourceNeutral"]').value,
      defaultImageSourceFriendly: el.querySelector('[name="defaultImageSourceFriendly"]').value,
      defaultImageSourcePlayer: el.querySelector('[name="defaultImageSourcePlayer"]').value
    };
  }

  async #applyFromForm() {
    const v = this.#currentFormValues();
    this.element.querySelector(".fga-sd-opacity-readout").textContent = `${v.bgOpacityPct}%`;

    const rgb = hexToRgb(v.bgColorHex);
    const captionStyle = {
      mode: "cc",
      bgColor: { ...rgb, a: v.bgOpacityPct / 100 },
      location: v.location,
      offsetX: v.offsetX,
      offsetY: v.offsetY
    };
    const bubbleStyle = { widthPx: v.bubbleWidthPx, heightPx: v.bubbleHeightPx };
    await game.settings.set(MODULE_ID, SETTINGS.CAPTION_STYLE, captionStyle);
    await game.settings.set(MODULE_ID, SETTINGS.BUBBLE_STYLE, bubbleStyle);
    await game.settings.set(MODULE_ID, SETTINGS.FLOATING_BUTTON_ENABLED, !v.floatingButtonHidden);
    await game.settings.set(MODULE_ID, SETTINGS.EDITOR_TOOLS_DEFAULT_VISIBLE, v.editorToolsDefaultVisible);
    await game.settings.set(MODULE_ID, SETTINGS.KEYBOARD_NUDGE_ENABLED, v.keyboardNudgeEnabled);
    await game.settings.set(MODULE_ID, SETTINGS.DEFAULT_LINE_VISIBILITY, v.defaultLineVisibility);
    await game.settings.set(MODULE_ID, SETTINGS.TRANSITION_ENABLED, v.transitionEnabled);
    await game.settings.set(MODULE_ID, SETTINGS.TRANSITION_TYPE, v.transitionType);
    await game.settings.set(MODULE_ID, SETTINGS.AUTO_DELAY_ORDER, v.autoDelayOrder);
    await game.settings.set(MODULE_ID, SETTINGS.DEFAULT_IMAGE_SOURCE_HOSTILE, v.defaultImageSourceHostile);
    await game.settings.set(MODULE_ID, SETTINGS.DEFAULT_IMAGE_SOURCE_NEUTRAL, v.defaultImageSourceNeutral);
    await game.settings.set(MODULE_ID, SETTINGS.DEFAULT_IMAGE_SOURCE_FRIENDLY, v.defaultImageSourceFriendly);
    await game.settings.set(MODULE_ID, SETTINGS.DEFAULT_IMAGE_SOURCE_PLAYER, v.defaultImageSourcePlayer);

    Hooks.callAll("fgaSceneDirectorConfigChanged", captionStyle);
    CaptionBar.applyStyle();
    SpeechBubble.applyStyle();
    this.#updatePreview();
  }

  #updatePreview() {
    const preview = this.element.querySelector("#fga-sd-caption-preview");
    if (!preview) return;
    const v = this.#currentFormValues();
    const rgb = hexToRgb(v.bgColorHex);
    preview.style.backgroundColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${v.bgOpacityPct / 100})`;
  }

  /** Switches which settings group is showing — pure client-side DOM toggle (no re-render),
   *  since nothing about the tab itself is saved data; every field's current value stays
   *  intact underneath the hidden panels either way (a hidden input's .value is untouched by
   *  display:none), so switching tabs never loses or resets anything the GM already set on
   *  another tab. #activeTab is kept in sync too, purely so a genuine re-render (not just a
   *  tab click) reopens on the same tab instead of resetting to Caption. */
  static #onSwitchConfigTab(_event, target) {
    const tab = target.dataset.tab;
    if (!tab || tab === this.#activeTab) return;
    this.#activeTab = tab;
    this.element.querySelectorAll(".fga-sd-config-tab-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });
    this.element.querySelectorAll(".fga-sd-config-tab-panel").forEach(panel => {
      panel.classList.toggle("active", panel.dataset.tabPanel === tab);
    });
  }

  static #onResetOffset() {
    this.element.querySelector('[name="offsetX"]').value = 0;
    this.element.querySelector('[name="offsetY"]').value = 0;
    this.#applyFromForm();
  }

  /** "Show on screen": puts a real caption bar up on the actual game canvas (GM's own client
   *  only — this never touches the socket, so players never see it), using the exact same
   *  styling as whatever's currently in the form. Lets the GM compare the settings-window
   *  swatch preview against how it actually looks over the game view, side by side, while
   *  still adjusting the color/position/offset controls above — every change to those already
   *  writes straight to the live caption element via applyStyle(), so this preview updates in
   *  step with the form rather than needing its own refresh. */
  static #onToggleOnScreenPreview() {
    this.#onScreenPreviewActive = !this.#onScreenPreviewActive;
    if (this.#onScreenPreviewActive) this.#showOnScreenPreview();
    else CaptionBar.clear();
    this.#updateOnScreenPreviewButton();
  }

  #showOnScreenPreview() {
    const speaker = game.i18n.localize("FGA_SCENE_DIRECTOR.Config.OnScreenPreviewSpeaker");
    const line = game.i18n.localize("FGA_SCENE_DIRECTOR.Config.OnScreenPreviewLine");
    CaptionBar.show(speaker, line);
  }

  #updateOnScreenPreviewButton() {
    const btn = this.element.querySelector('[data-action="toggleOnScreenPreview"]');
    if (!btn) return;
    btn.classList.toggle("on", this.#onScreenPreviewActive);
    const label = this.#onScreenPreviewActive
      ? game.i18n.localize("FGA_SCENE_DIRECTOR.Config.HideFromScreen")
      : game.i18n.localize("FGA_SCENE_DIRECTOR.Config.ShowOnScreen");
    const icon = this.#onScreenPreviewActive ? "fa-eye-slash" : "fa-eye";
    btn.innerHTML = `<i class="fa-solid ${icon}"></i> ${label}`;
  }

  /** "Show on screen" for the speech bubble — same idea as the caption's own preview button
   *  above, just for testing the bubble's configured width/height for real before using it
   *  live on a Private line. Tail defaults to center; there's no "speaking character" in this
   *  settings window to point it at. */
  static #onToggleBubblePreview() {
    this.#bubblePreviewActive = !this.#bubblePreviewActive;
    if (this.#bubblePreviewActive) this.#showBubblePreview();
    else SpeechBubble.clear();
    this.#updateBubblePreviewButton();
  }

  #showBubblePreview() {
    SpeechBubble.applyStyle();
    const speaker = game.i18n.localize("FGA_SCENE_DIRECTOR.Config.OnScreenPreviewSpeaker");
    const line = game.i18n.localize("FGA_SCENE_DIRECTOR.Config.OnScreenPreviewLine");
    SpeechBubble.show(speaker, line, "center");
  }

  #updateBubblePreviewButton() {
    const btn = this.element.querySelector('[data-action="toggleBubblePreview"]');
    if (!btn) return;
    btn.classList.toggle("on", this.#bubblePreviewActive);
    const label = this.#bubblePreviewActive
      ? game.i18n.localize("FGA_SCENE_DIRECTOR.Config.HideFromScreen")
      : game.i18n.localize("FGA_SCENE_DIRECTOR.Config.ShowOnScreen");
    const icon = this.#bubblePreviewActive ? "fa-eye-slash" : "fa-eye";
    btn.innerHTML = `<i class="fa-solid ${icon}"></i> ${label}`;
  }

  /** Never leave a fake preview caption/bubble stuck on the GM's screen after they close this
   *  window. */
  async close(options) {
    if (this.#onScreenPreviewActive) {
      CaptionBar.clear();
      this.#onScreenPreviewActive = false;
    }
    if (this.#bubblePreviewActive) {
      SpeechBubble.clear();
      this.#bubblePreviewActive = false;
    }
    return super.close(options);
  }
}
