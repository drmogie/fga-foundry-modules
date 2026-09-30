// The GM-only "Configure Status Icons" window: classify every condition
// the system knows about as a Buff, a Debuff, or Off, and flip the two
// master switches that decide whether each category is actually shown.
// See status-effects.js for the pre-filled defaults and main.js for how a
// classified condition being newly applied turns into a popup.

import { MODULE_ID } from "../constants.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * The system's condition catalog, deduped by id and sorted by name.
 *
 * A condition's `name` can be a plain string or a localization key —
 * several contributed by other installed modules (confirmed live: Monk's
 * Little Details' "rage"/"hasted"/"slowed"/"concentration"/etc.) are raw
 * keys like "MonksLittleDetails.StatusRage" rather than readable text.
 * `game.i18n.localize()` resolves a real key and safely returns anything
 * else unchanged, so it's always correct to call it here instead of using
 * `s.name` as-is.
 */
function dedupedStatusEffects() {
  const seen = new Set();
  const result = [];
  for (const s of CONFIG.statusEffects ?? []) {
    if (!s?.id || seen.has(s.id)) continue;
    seen.add(s.id);
    result.push({ ...s, name: game.i18n.localize(s.name ?? s.id) });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

export class StatusIconsForm extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "fga-character-popup-status-icons",
    tag: "form",
    window: {
      title: "FGA Character Popup — Status Icons",
      icon: "fa-solid fa-hand-sparkles",
      contentClasses: ["ccp-settings-form"],
      resizable: true
    },
    position: { width: 480, height: 640 },
    form: {
      handler: StatusIconsForm.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: true
    }
  };

  static PARTS = {
    form: { template: `modules/${MODULE_ID}/templates/status-icons.hbs` }
  };

  async _prepareContext(_options) {
    const classifications = game.settings.get(MODULE_ID, "statusIconClassifications") ?? {};
    const conditions = dedupedStatusEffects().map((s) => {
      const value = classifications[s.id] ?? "off";
      return {
        id: s.id,
        name: s.name,
        img: s.img,
        isBuff: value === "buff",
        isDebuff: value === "debuff",
        isOff: value !== "buff" && value !== "debuff"
      };
    });

    return {
      buffsEnabled: game.settings.get(MODULE_ID, "statusIconBuffsEnabled"),
      debuffsEnabled: game.settings.get(MODULE_ID, "statusIconDebuffsEnabled"),
      iconScale: game.settings.get(MODULE_ID, "statusIconScale"),
      conditionCount: conditions.length,
      conditions
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this.element;

    const scaleRange = root.querySelector("#ccp-status-scale-range");
    const scaleOutput = root.querySelector("#ccp-status-scale-output");
    scaleRange?.addEventListener("input", () => {
      if (scaleOutput) scaleOutput.textContent = `${scaleRange.value}x`;
    });
  }

  static async #onSubmit(_event, _form, formData) {
    const data = formData.object;

    await game.settings.set(MODULE_ID, "statusIconBuffsEnabled", !!data.buffsEnabled);
    await game.settings.set(MODULE_ID, "statusIconDebuffsEnabled", !!data.debuffsEnabled);
    await game.settings.set(MODULE_ID, "statusIconScale", Number(data.iconScale));

    const classifications = {};
    for (const condition of dedupedStatusEffects()) {
      const value = data[`classification-${condition.id}`];
      classifications[condition.id] = value === "buff" || value === "debuff" ? value : "off";
    }
    await game.settings.set(MODULE_ID, "statusIconClassifications", classifications);

    ui.notifications.info("FGA Character Popup: status icon settings saved.");
  }
}
