// Entry point: registers settings on init, then watches for four separate
// things that can trigger a popup — someone speaking in chat, an actor's
// HP crossing into "bloodied" (if the GM has turned that on), an actor's
// HP going up — either a heal (green) or a revival from 0 HP (gold), if
// the GM has turned that on — and a classified Buff/Debuff condition
// being newly applied to an actor (if the GM has turned that on too).

import { MODULE_ID } from "./constants.js";
import { registerSettings } from "./settings.js";
import { showCharacterPopup, isBloodied } from "./popup.js";

Hooks.once("init", () => {
  registerSettings();
  console.log(`${MODULE_ID} | Initialized`);
});

Hooks.on("createChatMessage", (message) => {
  try {
    handleChatMessage(message);
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to show popup`, err);
  }
});

// Bloodied auto-popup, and healed/revived auto-popup: both need to compare
// HP *before* the change to HP *after* it, and preUpdateActor is the only
// hook that runs before the change is applied — so that's our only chance
// to read the "before" state. We stash what we'll need on `options`, which
// Foundry passes through unchanged to the matching updateActor hook, where
// we compare against the "after" state.
Hooks.on("preUpdateActor", (actor, change, options) => {
  try {
    if (bloodiedAutoPopupActive()) options.ccpWasBloodied = isBloodied(actor);
    if (healAuraActive()) options.ccpPrevHp = getHpValue(actor);
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to check pre-update HP state`, err);
  }
});

Hooks.on("updateActor", (actor, change, options) => {
  try {
    if (bloodiedAutoPopupActive()) {
      const wasBloodied = options.ccpWasBloodied ?? false;
      if (!wasBloodied && isBloodied(actor)) {
        showCharacterPopup(actor);
      }
    }
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to check post-update bloodied state`, err);
  }

  try {
    if (healAuraActive()) {
      const prevHp = options.ccpPrevHp;
      const nowHp = getHpValue(actor);
      // Only an actual increase counts — damage (a decrease) never shows
      // either aura, and a no-op update (e.g. an unrelated field changing)
      // has nowHp === prevHp, which also doesn't qualify.
      if (typeof prevHp === "number" && typeof nowHp === "number" && nowHp > prevHp) {
        if (prevHp < 1 && nowHp > 0) {
          // Was unconscious (0 HP), just came back — gold, regardless of
          // where their HP lands relative to the bloodied threshold.
          showCharacterPopup(actor, { forceAura: "revived" });
        } else if (prevHp > 0 && nowHp > 0) {
          // Was already conscious, got topped up further — green.
          showCharacterPopup(actor, { forceAura: "healed" });
        }
      }
    }
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to check post-update heal/revive state`, err);
  }
});

function bloodiedAutoPopupActive() {
  return (
    game.settings.get(MODULE_ID, "bloodiedEnabled") &&
    game.settings.get(MODULE_ID, "bloodiedAutoPopup")
  );
}

function healAuraActive() {
  return game.settings.get(MODULE_ID, "healAuraEnabled");
}

/** The dnd5e system's current HP value for an actor, or undefined if it can't be read. */
function getHpValue(actor) {
  const hp = actor?.system?.attributes?.hp?.value;
  return typeof hp === "number" ? hp : undefined;
}

// Status-icon auto-popup: fires the instant a condition classified Buff or
// Debuff (with that category's switch on) is newly applied to an actor —
// never on removal. Conditions are applied by creating an ActiveEffect
// document on the actor, so we listen for that directly rather than
// diffing before/after state the way the bloodied check does.
const pendingStatusIcons = new Map(); // actor key -> { actor, icons: [], timer }

Hooks.on("createActiveEffect", (effect) => {
  try {
    handleActiveEffectCreated(effect);
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to check newly-applied status`, err);
  }
});

function handleActiveEffectCreated(effect) {
  const actor = effect.parent;
  if (!actor || actor.documentName !== "Actor") return;

  const statuses = Array.from(effect.statuses ?? []);
  if (!statuses.length) return;

  const buffsOn = game.settings.get(MODULE_ID, "statusIconBuffsEnabled");
  const debuffsOn = game.settings.get(MODULE_ID, "statusIconDebuffsEnabled");
  if (!buffsOn && !debuffsOn) return;

  const classifications = game.settings.get(MODULE_ID, "statusIconClassifications") ?? {};
  const qualifying = [];
  for (const statusId of statuses) {
    const classification = classifications[statusId] ?? "off";
    if (classification === "buff" && !buffsOn) continue;
    if (classification === "debuff" && !debuffsOn) continue;
    if (classification !== "buff" && classification !== "debuff") continue;

    const config = CONFIG.statusEffects.find((s) => s.id === statusId);
    if (!config) continue; // not one of the system's own known conditions
    // config.name can be a raw localization key (e.g. some Monk's Little
    // Details-contributed conditions) rather than readable text — see the
    // matching comment in status-icons-form.js for how this was found.
    qualifying.push({ id: statusId, name: game.i18n.localize(config.name ?? statusId), img: config.img });
  }
  if (!qualifying.length) return;

  queueStatusIcons(actor, qualifying);
}

/**
 * Multiple conditions can land on the same actor at the same instant (one
 * spell imposing two statuses together, say), and Foundry fires a separate
 * createActiveEffect call for each one — so we hold a short window open
 * per actor and fire a single popup with everything that arrived in it,
 * rather than one popup per condition.
 */
function queueStatusIcons(actor, icons) {
  const key = actor.uuid ?? actor.id;
  let entry = pendingStatusIcons.get(key);
  if (!entry) {
    entry = { actor, icons: [] };
    pendingStatusIcons.set(key, entry);
  }
  for (const icon of icons) {
    if (!entry.icons.some((existing) => existing.id === icon.id)) entry.icons.push(icon);
  }

  clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    pendingStatusIcons.delete(key);
    showCharacterPopup(entry.actor, { statusIcons: entry.icons });
  }, 150);
}

function handleChatMessage(message) {
  const actor = getSpeakingActor(message);
  if (!actor) return;
  if (!shouldTrigger(message, actor)) return;
  showCharacterPopup(actor, { chatText: extractChatText(message) });
}

/**
 * Pull the actual spoken line out of a chat message, for the optional chat
 * bubble (see popup.js). Returns undefined — no bubble — for a pure dice
 * roll (its "content" is roll markup, not a line of dialogue) or for a
 * message whose text is empty once HTML is stripped out.
 * @param {ChatMessage} message
 */
function extractChatText(message) {
  if (message.rolls?.length) return undefined;

  const raw = message.content ?? "";
  if (!raw) return undefined;

  // Message content is HTML (even a plain typed line gets wrapped by
  // Foundry), so strip tags down to the actual text the player typed.
  const scratch = document.createElement("div");
  scratch.innerHTML = raw;
  const text = (scratch.textContent ?? "").trim();
  return text || undefined;
}

/**
 * Resolve the actor that's actually speaking — preferring the real, live
 * token over the base actor-sheet record when we can find one.
 *
 * For an UNLINKED token these are two different objects that can drift
 * apart: the actor sheet keeps its own HP/conditions, and the token on the
 * map keeps its own. A token's own data is what's actually true in the
 * scene right now (e.g. whether it's currently Bloodied), so that's what
 * decides whether to pop up and what the aura should show — not whatever
 * the base sheet happens to say. `TokenDocument#actor` already knows how
 * to give us the right one (the base actor for a linked token, the
 * synthetic per-token actor for an unlinked one), so we just need to find
 * the token itself first.
 */
function getSpeakingActor(message) {
  const speaker = message.speaker;

  if (speaker?.token) {
    const scene = speaker.scene ? game.scenes.get(speaker.scene) : canvas.scene;
    const tokenActor = scene?.tokens?.get(speaker.token)?.actor;
    if (tokenActor) return tokenActor;
  }

  if (speaker?.actor) {
    const actor = game.actors.get(speaker.actor);
    if (actor) return actor;
  }

  // Foundry V14 added an explicit "speaking as" selector to the chat box,
  // and a message sent in its default "Public" mode carries no
  // speaker.actor/token at all (confirmed live: every plain typed message
  // came through as {scene: null, actor: null, token: null}). Every earlier
  // Foundry version auto-attached the sender's assigned character instead,
  // which is the behavior this module has always relied on — so fall back
  // to that same character here. "author" is V14's ChatMessage property for
  // the sending User; "user" is what V12/V13 called it.
  const sender = message.author ?? message.user;
  return sender?.character ?? null;
}

/**
 * Decide whether this message should pop up a portrait, based on the
 * GM's world-level rules.
 *
 * Whispers are never a trigger: most whispers in actual play turn out to
 * be automated bookkeeping messages (consumable trackers, roll recaps,
 * etc.) with no real character speaker attached, and even a player's own
 * hand-typed whisper doesn't carry a speaker.actor the way a normal chat
 * message does — so there was never a reliable "who's speaking" signal to
 * key a popup off of for whispers specifically.
 */
function shouldTrigger(message, actor) {
  const isNPCOrGM = !actor.hasPlayerOwner;
  if (isNPCOrGM && !game.settings.get(MODULE_ID, "triggerNPCs")) return false;

  if (message.rolls?.length && !game.settings.get(MODULE_ID, "triggerRolls")) return false;

  const styles = CONST.CHAT_MESSAGE_STYLES;
  const style = message.style;
  if (style === styles.EMOTE && !game.settings.get(MODULE_ID, "triggerEmote")) return false;
  if ((style === styles.IC || style === styles.OTHER) && !game.settings.get(MODULE_ID, "triggerIC")) {
    return false;
  }

  return true;
}
