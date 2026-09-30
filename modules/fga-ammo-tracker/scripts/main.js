/**
 * FGA Ammo Tracker
 * Version 2026.09.29.02
 *
 * 1. While combat is running, count every piece of ammo an actor uses.
 * 2. When combat ends, post a chat card for each actor who fired ammo.
 * 3. The card has a button. The owner clicks it to roll for retrieval.
 *    One d20 per piece of ammo. A roll at or above the target gets it back.
 */

const MODULE_ID = "fga-ammo-tracker";
const SOCKET = `module.${MODULE_ID}`;
const FIRED_OPTION = `${MODULE_ID}Fired`;

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

function isAmmo(item) {
  return (
    item.parent instanceof Actor &&
    item.type === "consumable" &&
    item.system?.type?.value === "ammo"
  );
}

function isInActiveCombat(actor) {
  return game.combats.some(
    (combat) =>
      combat.started &&
      combat.combatants.some((c) => c.actor?.uuid === actor.uuid)
  );
}

function isActiveGM() {
  return game.users.activeGM?.id === game.user.id;
}

/** Build the chat card HTML. */
function buildContent(ammo, resolved, results = []) {
  const esc = foundry.utils.escapeHTML;
  const i18n = game.i18n;

  const rows = ammo
    .map((entry) => {
      const result = results.find((r) => r.itemId === entry.itemId);
      if (!resolved || !result) {
        return `<li>${esc(entry.name)}: <strong>${entry.count}</strong></li>`;
      }
      const text = i18n.format("FGA_AMMO.Card.Result", {
        name: esc(entry.name),
        recovered: result.recovered,
        fired: entry.count
      });
      const warn = result.missing
        ? ` <em>${i18n.localize("FGA_AMMO.Card.ItemMissing")}</em>`
        : "";
      return `<li>${text}${warn}</li>`;
    })
    .join("");

  const heading = resolved
    ? i18n.localize("FGA_AMMO.Card.DoneTitle")
    : i18n.localize("FGA_AMMO.Card.Title");

  const button = resolved
    ? ""
    : `<button type="button" data-fga-retrieve>
         <i class="fa-solid fa-bullseye"></i>
         ${i18n.localize("FGA_AMMO.Card.Button")}
       </button>`;

  return `<div class="fga-ammo-card">
    <h3>${heading}</h3>
    <ul>${rows}</ul>
    ${button}
  </div>`;
}

/* -------------------------------------------- */
/*  Settings                                    */
/* -------------------------------------------- */

Hooks.once("init", () => {
  // World scope + restricted means only the GM can see and change this.
  game.settings.register(MODULE_ID, "retrievalMode", {
    name: "FGA_AMMO.Settings.Mode.Name",
    hint: "FGA_AMMO.Settings.Mode.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    choices: {
      dice: "FGA_AMMO.Settings.Mode.Dice",
      half: "FGA_AMMO.Settings.Mode.Half"
    },
    default: "dice"
  });

  game.settings.register(MODULE_ID, "targetNumber", {
    name: "FGA_AMMO.Settings.Target.Name",
    hint: "FGA_AMMO.Settings.Target.Hint",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 2, max: 20, step: 1 },
    default: 11
  });
});

/* -------------------------------------------- */
/*  Step 1: track ammo used in combat           */
/* -------------------------------------------- */

Hooks.on("preUpdateItem", (item, changes, options) => {
  if (!isAmmo(item)) return;
  const newQuantity = foundry.utils.getProperty(changes, "system.quantity");
  if (newQuantity === undefined) return;
  const delta = item.system.quantity - newQuantity;
  if (delta > 0) options[FIRED_OPTION] = delta;
});

Hooks.on("updateItem", async (item, changes, options, userId) => {
  if (userId !== game.user.id) return;
  const delta = options[FIRED_OPTION];
  if (!delta || !isAmmo(item)) return;

  const actor = item.parent;
  if (!isInActiveCombat(actor)) return;

  const fired = foundry.utils.deepClone(actor.getFlag(MODULE_ID, "fired") ?? {});
  const entry = fired[item.id] ?? { name: item.name, count: 0 };
  entry.name = item.name;
  entry.count += delta;
  fired[item.id] = entry;
  await actor.setFlag(MODULE_ID, "fired", fired);
});

/* -------------------------------------------- */
/*  Step 2: chat card when combat ends          */
/* -------------------------------------------- */

Hooks.on("deleteCombat", async (combat) => {
  if (!isActiveGM()) return;

  const seen = new Set();
  for (const combatant of combat.combatants) {
    const actor = combatant.actor;
    if (!actor || seen.has(actor.uuid)) continue;
    seen.add(actor.uuid);

    const fired = actor.getFlag(MODULE_ID, "fired") ?? {};
    const ammo = Object.entries(fired)
      .map(([itemId, entry]) => ({
        itemId,
        name: entry.name,
        count: entry.count
      }))
      .filter((entry) => entry.count > 0);
    if (!ammo.length) continue;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: buildContent(ammo, false),
      flags: {
        [MODULE_ID]: { actorUuid: actor.uuid, ammo, resolved: false }
      }
    });
    await actor.unsetFlag(MODULE_ID, "fired");
  }
});

/* -------------------------------------------- */
/*  Step 3: the button                          */
/* -------------------------------------------- */

Hooks.on("renderChatMessageHTML", (message, html) => {
  const data = message.flags?.[MODULE_ID];
  if (!data) return;

  const button = html.querySelector("[data-fga-retrieve]");
  if (!button) return;

  const actor = fromUuidSync(data.actorUuid);
  const canUse = game.user.isGM || actor?.isOwner;
  if (data.resolved || !canUse) {
    button.remove();
    return;
  }

  button.addEventListener("click", (event) => {
    event.preventDefault();
    button.disabled = true;
    requestRetrieve(message.id);
  });
});

function requestRetrieve(messageId) {
  if (!game.users.activeGM) {
    ui.notifications.warn(game.i18n.localize("FGA_AMMO.Notify.NoGM"));
    return;
  }
  if (isActiveGM()) {
    resolveCard(messageId, game.user.id);
  } else {
    game.socket.emit(SOCKET, {
      action: "retrieve",
      messageId,
      userId: game.user.id
    });
  }
}

Hooks.once("ready", () => {
  game.socket.on(SOCKET, (data) => {
    if (!isActiveGM()) return;
    if (data?.action === "retrieve") resolveCard(data.messageId, data.userId);
  });
});

/** Runs on the active GM's client. Rolls the dice and gives ammo back. */
async function resolveCard(messageId, userId) {
  const message = game.messages.get(messageId);
  const data = message?.flags?.[MODULE_ID];
  if (!data || data.resolved) return;

  const actor = await fromUuid(data.actorUuid);
  if (!actor) {
    ui.notifications.warn(game.i18n.localize("FGA_AMMO.Notify.NoActor"));
    return;
  }

  const user = game.users.get(userId);
  if (!user?.isGM && !actor.testUserPermission(user, "OWNER")) return;

  // Lock the card first so a double click cannot roll twice.
  await message.update({ [`flags.${MODULE_ID}.resolved`]: true });

  const mode = game.settings.get(MODULE_ID, "retrievalMode");
  const target = game.settings.get(MODULE_ID, "targetNumber");
  const results = [];

  for (const entry of data.ammo) {
    let recovered;

    if (mode === "half") {
      // 5e rule: get back half of what was fired, rounded down.
      recovered = Math.floor(entry.count / 2);
    } else {
      const roll = new Roll(`${entry.count}d20cs>=${target}`);
      await roll.evaluate();
      recovered = roll.total;

      await roll.toMessage(
        {
          speaker: ChatMessage.getSpeaker({ actor }),
          flavor: game.i18n.format("FGA_AMMO.RollFlavor", {
            name: entry.name,
            target
          })
        },
        { rollMode: CONST.DICE_ROLL_MODES.PUBLIC }
      );
    }

    const item =
      actor.items.get(entry.itemId) ??
      actor.items.find((i) => isAmmo(i) && i.name === entry.name);
    if (item && recovered > 0) {
      await item.update({ "system.quantity": item.system.quantity + recovered });
    }
    results.push({ ...entry, recovered, missing: !item });
  }

  await message.update({
    content: buildContent(data.ammo, true, results),
    [`flags.${MODULE_ID}.results`]: results
  });
}
