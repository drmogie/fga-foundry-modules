// The GUI form each player uses to set up their own popup. Placement,
// size, flip, and fade timing all moved to GM-only control (see "Configure
// Character Appearance") — what's left as always the player's own choice
// is which image shows (portrait or token, a per-viewer preference) and
// their own character's chat bubble color (a property of the CHARACTER,
// stored as an Actor flag, so every viewer sees the same color for that
// character — see appearance.js's actorBubbleColor). Text color defaults
// to the bubble color's exact inverse (great for black/white, occasionally
// an odd/muddy choice for other backgrounds) but can be overridden with
// its own color picker — "Auto" stays checked by default and keeps saving
// the inverse; unchecking it reveals a picker for a custom text color,
// saved as its own "bubbleTextColor" flag (see actorBubbleTextColor). The
// portrait preview is read-only: it shows the character's CURRENT
// effective look (whatever the GM has set, via getEffectiveAppearance) so
// the player can still see roughly how their popup will look, just not
// change it from here. The bubble preview, unlike the portrait one, IS
// live — it updates as either color control below it changes. The color
// controls and their preview only show up when the player has a character
// assigned, since there's no actor to store either flag on otherwise.

import {
  MODULE_ID,
  buildImageSourceOptions,
  FALLBACK_IMAGE,
  invertHexColor,
  hexToRgb
} from "../constants.js";
import { applyPositionStyle } from "../position.js";
import { getEffectiveAppearance, actorBubbleColor, actorBubbleTextColor } from "../appearance.js";

/** A semi-transparent border shade derived from the bubble's foreground (text) color — matches popup.js's own. */
function hexToBorderRgba(hex) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, 0.35)`;
}

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class PlayerSettingsForm extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "fga-character-popup-player-settings",
    tag: "form",
    window: {
      title: "FGA Character Popup — Your Settings",
      icon: "fa-solid fa-image",
      contentClasses: ["ccp-settings-form"],
      resizable: true
    },
    position: { width: 400, height: 520 },
    form: {
      handler: PlayerSettingsForm.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: true
    }
  };

  static PARTS = {
    form: { template: `modules/${MODULE_ID}/templates/player-settings.hbs` }
  };

  async _prepareContext(_options) {
    const currentImageSource = game.settings.get(MODULE_ID, "imageSource");
    const character = game.user.character;
    const appearance = character ? getEffectiveAppearance(character) : null;

    // Is the GM currently pinning a specific image source for this
    // character, rather than leaving it as "inherit"? Checked directly off
    // the raw override entries (whichever one actually applies to this
    // character — a per-character override, else the shared default).
    const perActorSettings = game.settings.get(MODULE_ID, "perActorSettings") ?? {};
    const actorEntry = character ? perActorSettings[character.id] : null;
    const generic = game.settings.get(MODULE_ID, "genericPlayerOverride") ?? {};
    const pinnedImageSource = actorEntry?.mode === "override" ? actorEntry.imageSource || null : generic.imageSource || null;

    const imageSourceNote = pinnedImageSource
      ? `The GM has pinned your character's image to ${
          pinnedImageSource === "token" ? "Token Image" : "Character Portrait"
        } right now, so this choice won't take effect until they unpin it.`
      : "Always your own choice, even though the GM controls the size/position/flip.";

    // Only meaningful with a character assigned — both are stored as
    // flags on that Actor document, not settings, so there's nowhere to
    // save either one without a character (see file header).
    const bubbleColor = actorBubbleColor(character);
    const customTextColor = character?.getFlag(MODULE_ID, "bubbleTextColor") || null;
    const bubbleFg = actorBubbleTextColor(character);

    return {
      imageSources: buildImageSourceOptions(currentImageSource),
      previewImg: character?.img || FALLBACK_IMAGE,
      previewName: character?.name || "Character",
      appearance,
      imageSourceNote,
      hasCharacter: !!character,
      chatBubbleColor: { color: bubbleColor, fg: bubbleFg, border: hexToBorderRgba(bubbleFg) },
      // Whether text color is currently following the auto-inverse (true)
      // or a custom color the player picked (false) — decides the initial
      // state of the "Auto" checkbox and whether the text-color picker
      // starts out enabled.
      autoTextColor: !customTextColor
    };
  }

  /** The portrait preview is read-only (no editable fields feed it), so just render it once from the GM-set appearance. The bubble-color preview below it IS live, and wires up regardless of whether a portrait preview is even showing (a player with no character assigned still has their own bubble color to set). */
  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this.element;

    const previewThumb = root.querySelector("#ccp-preview-thumb");
    const previewImg = root.querySelector("#ccp-preview-img");
    if (previewThumb && previewImg && context.appearance) {
      applyPositionStyle(previewThumb, {
        preset: context.appearance.positionPreset,
        x: context.appearance.positionX,
        y: context.appearance.positionY
      });

      let transform = `scale(${context.appearance.scale})`;
      if (context.appearance.flipHorizontal) transform += " scaleX(-1)";
      if (context.appearance.flipVertical) transform += " scaleY(-1)";
      previewImg.style.transform = transform;
    }

    const bubbleColorInput = root.querySelector("input[name='chatBubbleColor']");
    const autoTextCheckbox = root.querySelector("input[name='autoBubbleTextColor']");
    const textColorInput = root.querySelector("input[name='chatBubbleTextColor']");
    const bubblePreview = root.querySelector("#ccp-player-bubble-preview");

    const currentFg = () => (autoTextCheckbox?.checked ? invertHexColor(bubbleColorInput?.value) : textColorInput?.value);

    const syncBubbleColorPreview = () => {
      if (!bubblePreview || !bubbleColorInput) return;
      const bg = bubbleColorInput.value;
      const fg = currentFg();
      bubblePreview.style.setProperty("--ccp-bubble-bg", bg);
      bubblePreview.style.setProperty("--ccp-bubble-fg", fg);
      bubblePreview.style.setProperty("--ccp-bubble-border", hexToBorderRgba(fg));
    };

    const setTextColorDisabled = () => {
      if (!textColorInput || !autoTextCheckbox) return;
      textColorInput.disabled = autoTextCheckbox.checked;
    };

    // Only reset the text-color picker's VALUE in response to the user
    // actually toggling "Auto" — never on initial render, or a saved
    // custom color would get clobbered by the auto-inverse the instant
    // the form opens.
    const onAutoToggle = () => {
      setTextColorDisabled();
      if (!autoTextCheckbox.checked && bubbleColorInput && textColorInput) {
        textColorInput.value = invertHexColor(bubbleColorInput.value);
      }
      syncBubbleColorPreview();
    };

    bubbleColorInput?.addEventListener("input", syncBubbleColorPreview);
    autoTextCheckbox?.addEventListener("change", onAutoToggle);
    textColorInput?.addEventListener("input", syncBubbleColorPreview);
    setTextColorDisabled();
    syncBubbleColorPreview();
  }

  static async #onSubmit(_event, _form, formData) {
    const data = formData.object;
    await game.settings.set(MODULE_ID, "imageSource", data.imageSource);

    // Bubble color (and, optionally, a custom text color) are flags on
    // the player's own character (see file header) — only present in the
    // submitted data at all when a character was assigned and the fields
    // were actually rendered.
    const character = game.user.character;
    if (character && data.chatBubbleColor) {
      try {
        await character.setFlag(MODULE_ID, "bubbleColor", data.chatBubbleColor);
        if (data.autoBubbleTextColor) {
          // Back to auto-inverse — clear any previously-saved custom
          // text color rather than leaving a stale override behind.
          await character.unsetFlag(MODULE_ID, "bubbleTextColor");
        } else if (data.chatBubbleTextColor) {
          await character.setFlag(MODULE_ID, "bubbleTextColor", data.chatBubbleTextColor);
        }
      } catch (err) {
        console.error("FGA Character Popup | couldn't save bubble color to your character", err);
        ui.notifications.warn(
          "FGA Character Popup: your image choice saved, but your bubble color didn't — you may not have permission to edit your character. Ask your GM."
        );
        ui.notifications.info("FGA Character Popup: your settings were saved.");
        return;
      }
    }

    ui.notifications.info("FGA Character Popup: your settings were saved.");
  }
}
