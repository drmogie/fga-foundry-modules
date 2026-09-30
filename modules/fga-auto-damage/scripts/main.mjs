import { decide, describe } from "./logic.mjs";

const ID = "fga-auto-damage";

function esc(text) {
  const div = document.createElement("div");
  div.textContent = String(text ?? "");
  return div.innerHTML;
}

function setting(key) {
  return game.settings.get(ID, key);
}

Hooks.once("init", () => {
  // Every setting is per person (scope: "client"). Each player picks their own.
  game.settings.register(ID, "enabled", {
    name: "FGA_AUTO_DAMAGE.Enabled.Name",
    hint: "FGA_AUTO_DAMAGE.Enabled.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(ID, "trigger", {
    name: "FGA_AUTO_DAMAGE.Trigger.Name",
    hint: "FGA_AUTO_DAMAGE.Trigger.Hint",
    scope: "client",
    config: true,
    type: String,
    default: "hit",
    choices: {
      hit: "FGA_AUTO_DAMAGE.Trigger.Hit",
      crit: "FGA_AUTO_DAMAGE.Trigger.Crit",
      always: "FGA_AUTO_DAMAGE.Trigger.Always"
    }
  });

  game.settings.register(ID, "noTarget", {
    name: "FGA_AUTO_DAMAGE.NoTarget.Name",
    hint: "FGA_AUTO_DAMAGE.NoTarget.Hint",
    scope: "client",
    config: true,
    type: String,
    default: "skip",
    choices: {
      skip: "FGA_AUTO_DAMAGE.NoTarget.Skip",
      roll: "FGA_AUTO_DAMAGE.NoTarget.Roll"
    }
  });

  game.settings.register(ID, "showDialog", {
    name: "FGA_AUTO_DAMAGE.ShowDialog.Name",
    hint: "FGA_AUTO_DAMAGE.ShowDialog.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(ID, "chatNote", {
    name: "FGA_AUTO_DAMAGE.ChatNote.Name",
    hint: "FGA_AUTO_DAMAGE.ChatNote.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(ID, "showName", {
    name: "FGA_AUTO_DAMAGE.ShowName.Name",
    hint: "FGA_AUTO_DAMAGE.ShowName.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });
});

/** Read armor class for each targeted token. */
function readTargets() {
  return Array.from(game.user.targets ?? []).map((token) => ({
    name: token.name ?? token.actor?.name ?? "target",
    ac: token.actor?.system?.attributes?.ac?.value ?? null
  }));
}

/**
 * Fires on the machine that made the attack roll, so only that person's settings apply.
 */
Hooks.on("dnd5e.postRollAttack", async (rolls, data) => {
  try {
    if (!setting("enabled")) return;

    const activity = data?.subject;
    const roll = rolls?.[0];
    if (!activity || !roll || typeof activity.rollDamage !== "function") return;

    const decision = decide({
      roll: { total: roll.total, isCritical: !!roll.isCritical, isFumble: !!roll.isFumble },
      targets: readTargets(),
      trigger: setting("trigger"),
      noTarget: setting("noTarget")
    });

    // Let the attack card land in chat first, so damage shows up under it.
    await new Promise((resolve) => setTimeout(resolve, 250));

    if (setting("chatNote")) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: activity.actor }),
        content: `<p><em>${esc(describe(decision, roll, setting("showName") ? activity.actor?.name : ""))}</em></p>`,
        flags: { [ID]: { note: true } }
      });
    }

    if (!decision.roll) return;

    // Reuse what the attack used: attack mode, ammunition, ability.
    const last = activity.item?.flags?.dnd5e?.last?.[activity.id] ?? {};
    const config = { isCritical: decision.critical };
    for (const key of ["attackMode", "ammunition", "ability"]) {
      if (last[key]) config[key] = last[key];
    }

    await activity.rollDamage(config, { configure: !!setting("showDialog") }, { create: true });
  } catch (err) {
    console.error(`${ID} | Could not auto roll damage`, err);
  }
});
