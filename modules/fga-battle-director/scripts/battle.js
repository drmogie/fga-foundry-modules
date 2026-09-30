import { MODULE_ID, SETTINGS, FLAGS, STATE, GROUP_EXTRACT_RADIUS_FEET } from "./constants.js";
import { computePositions, ringPositions } from "./logic.js";
import { Transition } from "./transition.js";

/* ---------- Staged battlefields ---------- */

export function getStagedIds() {
  const ids = game.settings.get(MODULE_ID, SETTINGS.BATTLEFIELDS);
  return Array.isArray(ids) ? [...ids] : [];
}

export async function stageScene(sceneId) {
  const ids = getStagedIds();
  if (!ids.includes(sceneId)) ids.push(sceneId);
  await game.settings.set(MODULE_ID, SETTINGS.BATTLEFIELDS, ids);
}

export async function unstageScene(sceneId) {
  const ids = getStagedIds().filter(id => id !== sceneId);
  await game.settings.set(MODULE_ID, SETTINGS.BATTLEFIELDS, ids);
}

/** Move already-staged scenes to the top of the list, in the order given. Used when maps are loaded, so the map(s) you just loaded show up first. */
export async function bringToFront(sceneIds) {
  const wanted = sceneIds.filter(Boolean);
  if (!wanted.length) return;
  const ids = getStagedIds();
  const set = new Set(wanted);
  const rest = ids.filter(id => !set.has(id));
  await game.settings.set(MODULE_ID, SETTINGS.BATTLEFIELDS, [...wanted, ...rest]);
}

/** Set the exact Battlefields list order (drag-and-drop reordering in the window). Ids not currently staged are dropped; any staged id missing from the given order is kept, appended at the end in its old relative order, so nothing gets silently lost. */
export async function setStagedOrder(orderedIds) {
  const current = getStagedIds();
  const currentSet = new Set(current);
  const wanted = orderedIds.filter(id => currentSet.has(id));
  const wantedSet = new Set(wanted);
  const rest = current.filter(id => !wantedSet.has(id));
  await game.settings.set(MODULE_ID, SETTINGS.BATTLEFIELDS, [...wanted, ...rest]);
}

/* ---------- Scene helpers ---------- */

export function getSceneState(scene) {
  return scene?.getFlag(MODULE_ID, FLAGS.STATE) ?? null;
}

export function getStartPoint(scene) {
  const p = scene?.getFlag(MODULE_ID, FLAGS.START);
  return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : null;
}

export function findCombat(scene) {
  return game.combats.find(c => c.scene?.id === scene.id) ?? null;
}

export function returnableTokens(scene) {
  return scene
    ? scene.tokens.filter(t => t.getFlag(MODULE_ID, FLAGS.ORIGIN) || t.getFlag(MODULE_ID, FLAGS.GROUP_SOURCE))
    : [];
}

/* ---------- Groups ---------- */

/** Tokens on this scene whose actor is a dnd5e Group (a wagon, a party icon, etc.). */
export function getGroupTokens(scene) {
  return scene ? scene.tokens.filter(t => t.actor?.type === "group") : [];
}

/**
 * The actual party-member actors listed in a Group actor's Members tab.
 * dnd5e resolves each entry's "actor" straight to the Actor document, not
 * just its id string, so accept either shape.
 */
export function getGroupMembers(actor) {
  const entries = actor?.system?.members ?? [];
  return entries
    .map(m => {
      const ref = typeof m === "string" ? m : m?.actor;
      if (!ref) return null;
      return typeof ref === "string" ? game.actors.get(ref) : ref;
    })
    .filter(Boolean);
}

/* ---------- Send to battle ---------- */

export async function sendToBattle({
  originSceneId,
  destSceneId,
  tokenIds,
  placement,
  pull = true,
  freeze = true,
  makeCombat = true,
  transition = Transition.currentEffect()
}) {
  const origin = game.scenes.get(originSceneId);
  const dest = game.scenes.get(destSceneId);
  if (!origin || !dest) throw new Error("Could not find the scenes.");
  if (origin.id === dest.id) throw new Error("You are already on that battlefield.");

  const docs = tokenIds.map(id => origin.tokens.get(id)).filter(Boolean);
  // An empty selection is allowed (the GM confirmed it) — it just moves the
  // scene itself with nobody along for the ride. Only a stale/bad id list
  // (something checked, nothing found) is a real error.
  if (tokenIds.length && !docs.length) throw new Error("Could not find the selected tokens.");

  // Anyone whose actor already has a token sitting on the destination gets
  // that existing token reused (repositioned into the same formation as
  // everyone else) instead of a duplicate being created. Whatever's left
  // gets a fresh token made for it. Either way, everyone checked ends up
  // grouped together at the landing spot.
  const already = docs.filter(t => dest.tokens.some(dt => dt.actorId === t.actorId));
  const toCreate = docs.filter(t => !already.includes(t));

  const rect = dest.dimensions.sceneRect;
  const { positions, usedFallback } = computePositions(
    placement,
    docs.map(t => ({ id: t.id, x: t.x, y: t.y, width: t.width, height: t.height })),
    origin.grid.size,
    {
      gridSize: dest.grid.size,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      start: getStartPoint(dest)
    }
  );
  if (usedFallback) {
    ui.notifications.warn(`No start spot set on ${dest.name}. Lined the party up along the bottom edge instead.`);
  }

  const payload = toCreate.map(t => {
    const data = t.toObject();
    delete data._id;
    const pos = positions.get(t.id);
    data.x = pos.x;
    data.y = pos.y;
    data.flags ??= {};
    const mine = data.flags[MODULE_ID] ?? {};
    // Keep the first origin if a token gets sent more than once.
    mine[FLAGS.ORIGIN] ??= { sceneId: origin.id, x: t.x, y: t.y, elevation: t.elevation };
    data.flags[MODULE_ID] = mine;
    return data;
  });

  // Existing destination tokens for the "already there" group just get
  // moved into the same formation spot the new arrivals are using.
  const regroupUpdates = already.map(t => {
    const destToken = dest.tokens.find(dt => dt.actorId === t.actorId);
    const pos = positions.get(t.id);
    return { _id: destToken.id, x: pos.x, y: pos.y };
  });

  const audience = pull ? "all" : "gm";
  const fx = transition && transition !== "none";
  if (fx) await Transition.cover({ effect: transition, audience });

  let created;
  let regrouped;
  try {
    // Set the state first so the freeze is already on when players arrive.
    await dest.setFlag(MODULE_ID, FLAGS.STATE, freeze ? STATE.FROZEN : STATE.ACTIVE);
    created = toCreate.length ? await dest.createEmbeddedDocuments("Token", payload) : [];
    if (regroupUpdates.length) await dest.updateEmbeddedDocuments("Token", regroupUpdates);
    regrouped = already.map(t => dest.tokens.find(dt => dt.actorId === t.actorId)).filter(Boolean);
    // Everyone checked is now accounted for at the destination, so clear
    // all of them off the origin board, not just the newly-created ones.
    if (docs.length) await origin.deleteEmbeddedDocuments("Token", docs.map(t => t.id));

    if (makeCombat) {
      let combat = findCombat(dest);
      if (!combat) combat = await Combat.create({ scene: dest.id, active: true });
      const alreadyCombatants = new Set(combat.combatants.map(c => c.tokenId));
      const fresh = [...created, ...regrouped]
        .filter(t => !alreadyCombatants.has(t.id))
        .map(t => ({ tokenId: t.id, sceneId: dest.id, actorId: t.actorId, hidden: t.hidden }));
      if (fresh.length) await combat.createEmbeddedDocuments("Combatant", fresh);
    }

    if (pull) await dest.activate();
    else await dest.view();
  } catch (err) {
    if (fx) await Transition.abort({ effect: transition, audience });
    throw err;
  }

  const total = created.length + regrouped.length;
  const regroupedNote = regrouped.length ? ` (${regrouped.length} already there, regrouped)` : "";
  ui.notifications.info(
    total === 0
      ? `Moved to ${dest.name}. No characters brought along.`
      : freeze
        ? `${total} at ${dest.name}${regroupedNote}. No movement until you click Start Battle.`
        : `${total} at ${dest.name}${regroupedNote}.`
  );
  if (fx) await Transition.reveal({ effect: transition, audience, sceneId: dest.id });
  return [...created, ...regrouped];
}

/**
 * Send one or more Group tokens (a wagon, a party icon) to a battlefield,
 * landed on its start spot. With extract on, each group's members are then
 * spawned in a ring around where its group token landed. deleteGroup only
 * matters when extract is also on: it removes the group's own token once
 * its members are out, so what's left is just the party. Off, the group
 * token stays put — either alone (extract off) or alongside its members
 * (extract on, deleteGroup off).
 */
export async function sendGroupsToBattle({
  originSceneId,
  destSceneId,
  tokenIds,
  extract = false,
  deleteGroup = false,
  pull = true,
  transition = Transition.currentEffect()
}) {
  const origin = game.scenes.get(originSceneId);
  const dest = game.scenes.get(destSceneId);
  if (!origin || !dest) throw new Error("Could not find the scenes.");
  if (origin.id === dest.id) throw new Error("You are already on that battlefield.");

  const groupTokens = tokenIds.map(id => origin.tokens.get(id)).filter(Boolean);
  if (!groupTokens.length) throw new Error("No group selected.");

  const start = getStartPoint(dest);
  if (!start) throw new Error(`No start spot set on ${dest.name}. Click Set start on that battlefield first.`);

  const audience = pull ? "all" : "gm";
  const fx = transition && transition !== "none";
  if (fx) await Transition.cover({ effect: transition, audience });

  let landedGroups = [];
  let extractedMembers = [];
  let regroupedCount = 0;
  try {
    await dest.setFlag(MODULE_ID, FLAGS.STATE, STATE.FROZEN);

    // Land each group's own token at the start spot (spread out a little if more than one).
    const cols = Math.max(1, Math.ceil(Math.sqrt(groupTokens.length)));
    const step = dest.grid.size * 3;
    const payload = groupTokens.map((t, i) => {
      const data = t.toObject();
      delete data._id;
      data.x = start.x + (i % cols) * step;
      data.y = start.y + Math.floor(i / cols) * step;
      data.flags ??= {};
      const mine = data.flags[MODULE_ID] ?? {};
      mine[FLAGS.ORIGIN] ??= { sceneId: origin.id, x: t.x, y: t.y, elevation: t.elevation };
      data.flags[MODULE_ID] = mine;
      return data;
    });
    landedGroups = await dest.createEmbeddedDocuments("Token", payload);
    await origin.deleteEmbeddedDocuments("Token", groupTokens.map(t => t.id));

    if (extract) {
      const grid = { size: dest.grid.size, distance: dest.grid.distance };
      const toDelete = [];
      for (const groupToken of landedGroups) {
        const members = getGroupMembers(groupToken.actor);
        if (!members.length) continue;
        const center = {
          x: groupToken.x + (groupToken.width * grid.size) / 2,
          y: groupToken.y + (groupToken.height * grid.size) / 2
        };
        const sizes = members.map(a => ({
          id: a.id,
          width: a.prototypeToken.width,
          height: a.prototypeToken.height
        }));
        const positions = ringPositions(sizes, center, grid, GROUP_EXTRACT_RADIUS_FEET);

        // A member who already has a token on this battlefield doesn't get a
        // duplicate — their existing token is just moved into the ring spot.
        const already = members.filter(a => dest.tokens.some(dt => dt.actorId === a.id));
        const toCreateMembers = members.filter(a => !already.includes(a));

        // Tag each freshly-extracted member so Return knows it came out of
        // this group and should be swept back into it, not left behind as
        // clutter or returned as its own separate token.
        const groupOrigin = groupToken.getFlag(MODULE_ID, FLAGS.ORIGIN);
        const memberPayload = toCreateMembers.map(a => {
          const data = a.prototypeToken.toObject();
          delete data._id;
          data.actorId = a.id;
          const pos = positions.get(a.id);
          data.x = pos.x;
          data.y = pos.y;
          if (groupOrigin) {
            data.flags ??= {};
            data.flags[MODULE_ID] ??= {};
            data.flags[MODULE_ID][FLAGS.GROUP_SOURCE] = { actorId: groupToken.actor.id, origin: groupOrigin };
          }
          return data;
        });
        const created = memberPayload.length ? await dest.createEmbeddedDocuments("Token", memberPayload) : [];

        const regroupUpdates = already.map(a => {
          const destToken = dest.tokens.find(dt => dt.actorId === a.id);
          const pos = positions.get(a.id);
          return { _id: destToken.id, x: pos.x, y: pos.y };
        });
        if (regroupUpdates.length) await dest.updateEmbeddedDocuments("Token", regroupUpdates);
        const regrouped = already.map(a => dest.tokens.find(dt => dt.actorId === a.id)).filter(Boolean);

        extractedMembers.push(...created, ...regrouped);
        regroupedCount += regrouped.length;
        if (deleteGroup) toDelete.push(groupToken.id);
      }
      if (toDelete.length) {
        await dest.deleteEmbeddedDocuments("Token", toDelete);
        landedGroups = landedGroups.filter(t => !toDelete.includes(t.id));
      }
    }

    if (pull) await dest.activate();
    else await dest.view();
  } catch (err) {
    if (fx) await Transition.abort({ effect: transition, audience });
    throw err;
  }

  const groupsRemain = landedGroups.length > 0;
  const notes = [];
  if (regroupedCount) notes.push(`${regroupedCount} already there, regrouped`);
  if (extractedMembers.length && groupsRemain) notes.push("group token still there too");
  const stayedNote = notes.length ? ` (${notes.join("; ")})` : "";
  ui.notifications.info(
    extractedMembers.length
      ? `${extractedMembers.length} party member(s) extracted at ${dest.name}${stayedNote}. No movement until you click Start Battle.`
      : `${landedGroups.length} group(s) at ${dest.name}. No movement until you click Start Battle.`
  );
  if (fx) await Transition.reveal({ effect: transition, audience, sceneId: dest.id });
  return [...landedGroups, ...extractedMembers];
}

/* ---------- Start ---------- */

/** Turn movement back on, roll (if the setting is on), and start whatever combat is already on this scene. */
async function activateCombat(scene) {
  await scene.setFlag(MODULE_ID, FLAGS.STATE, STATE.ACTIVE);
  const combat = findCombat(scene);
  if (!combat) return;
  if (game.settings.get(MODULE_ID, SETTINGS.AUTO_ROLL)) await combat.rollAll();
  if (!combat.started) await combat.startCombat();
  try {
    ui.sidebar?.changeTab?.("combat", "primary");
  } catch (err) {
    /* tab switch is only a nicety */
  }
}

export async function startBattle(scene) {
  return activateCombat(scene);
}

/**
 * Start a fight right where the party already is — no travel needed.
 * Stops movement on the scene, builds a combat from the ticked tokens
 * (adding any that aren't already a combatant), then starts it.
 */
export async function startBattleHere({ sceneId, tokenIds }) {
  const scene = game.scenes.get(sceneId);
  if (!scene) throw new Error("Could not find the scene.");

  const docs = tokenIds.map(id => scene.tokens.get(id)).filter(Boolean);
  if (!docs.length) throw new Error("No tokens selected.");

  await scene.setFlag(MODULE_ID, FLAGS.STATE, STATE.FROZEN);

  let combat = findCombat(scene);
  if (!combat) combat = await Combat.create({ scene: scene.id, active: true });
  const already = new Set(combat.combatants.map(c => c.tokenId));
  const fresh = docs
    .filter(t => !already.has(t.id))
    .map(t => ({ tokenId: t.id, sceneId: scene.id, actorId: t.actorId, hidden: t.hidden }));
  if (fresh.length) await combat.createEmbeddedDocuments("Combatant", fresh);

  await activateCombat(scene);
  ui.notifications.info(`Battle started on ${scene.name}.`);
  return combat;
}

/* ---------- Stop ---------- */

/**
 * End the battle right where it is: turn movement and initiative back on,
 * and (by default) delete the combat, but leave every token standing
 * exactly where it is. For sending everyone back to where they came from
 * too, use Return to previous board instead.
 */
export async function stopBattle(scene, { endCombat = true } = {}) {
  if (!scene) throw new Error("Could not find the scene.");
  if (endCombat) {
    for (const combat of game.combats.filter(c => c.scene?.id === scene.id)) await combat.delete();
  }
  await scene.unsetFlag(MODULE_ID, FLAGS.STATE);
  ui.notifications.info(`Battle stopped on ${scene.name}. Movement is free again.`);
}

/* ---------- Return ---------- */

export async function returnToBoard(scene, { endCombat = true, pull = true, transition = Transition.currentEffect() } = {}) {
  const tokens = returnableTokens(scene);
  if (!tokens.length) throw new Error("Nothing to send back from this battlefield.");

  const audience = pull ? "all" : "gm";
  const fx = transition && transition !== "none";
  if (fx) await Transition.cover({ effect: transition, audience });
  let landing = null;
  try {
    landing = await doReturn(scene, tokens, { endCombat, pull });
  } catch (err) {
    if (fx) await Transition.abort({ effect: transition, audience });
    throw err;
  }
  if (fx) await Transition.reveal({ effect: transition, audience, sceneId: landing?.id ?? canvas.scene?.id ?? null });
}

async function doReturn(scene, tokens, { endCombat, pull }) {
  // Tokens sent individually (including a group's own token) return as
  // themselves, same as always. Tokens popped out of a group by Extract
  // don't have their own home spot — they get swept back into their group
  // instead of coming back as loose individuals.
  const normal = tokens.filter(t => t.getFlag(MODULE_ID, FLAGS.ORIGIN));
  const groupMembers = tokens.filter(t => t.getFlag(MODULE_ID, FLAGS.GROUP_SOURCE));

  const groups = new Map();
  for (const t of normal) {
    const o = t.getFlag(MODULE_ID, FLAGS.ORIGIN);
    if (!groups.has(o.sceneId)) groups.set(o.sceneId, []);
    groups.get(o.sceneId).push(t);
  }

  let landing = null;
  for (const [sceneId, list] of groups) {
    const originScene = game.scenes.get(sceneId);
    if (!originScene) {
      ui.notifications.warn(`The board these tokens came from no longer exists. ${list.length} token(s) left on ${scene.name}.`);
      continue;
    }
    const payload = list.map(t => {
      const o = t.getFlag(MODULE_ID, FLAGS.ORIGIN);
      const data = t.toObject();
      delete data._id;
      data.x = o.x;
      data.y = o.y;
      if (Number.isFinite(o.elevation)) data.elevation = o.elevation;
      if (data.flags?.[MODULE_ID]) {
        delete data.flags[MODULE_ID][FLAGS.ORIGIN];
        if (!Object.keys(data.flags[MODULE_ID]).length) delete data.flags[MODULE_ID];
      }
      return data;
    });
    await originScene.createEmbeddedDocuments("Token", payload);
    await scene.deleteEmbeddedDocuments("Token", list.map(t => t.id));
    landing ??= originScene;
  }

  if (groupMembers.length) {
    // Only rebuild a group's own token if it isn't already coming back on
    // its own (that happens when "Delete the group after extraction" had
    // removed it). Either way, the extracted members themselves get
    // cleaned off this board, not recreated as separate tokens.
    const returningActorIds = new Set(normal.map(t => t.actorId));
    const byGroup = new Map();
    for (const t of groupMembers) {
      const src = t.getFlag(MODULE_ID, FLAGS.GROUP_SOURCE);
      if (!src?.actorId || !src?.origin) continue;
      if (!byGroup.has(src.actorId)) byGroup.set(src.actorId, src.origin);
    }
    for (const [actorId, origin] of byGroup) {
      if (returningActorIds.has(actorId)) continue;
      const originScene = game.scenes.get(origin.sceneId);
      const actor = game.actors.get(actorId);
      if (!originScene || !actor) {
        ui.notifications.warn(`Could not rebuild ${actor?.name ?? "a group"}'s token on its home board.`);
        continue;
      }
      const data = actor.prototypeToken.toObject();
      delete data._id;
      data.actorId = actor.id;
      data.x = origin.x;
      data.y = origin.y;
      if (Number.isFinite(origin.elevation)) data.elevation = origin.elevation;
      await originScene.createEmbeddedDocuments("Token", [data]);
      landing ??= originScene;
    }
    await scene.deleteEmbeddedDocuments("Token", groupMembers.map(t => t.id));
  }

  if (endCombat) {
    for (const combat of game.combats.filter(c => c.scene?.id === scene.id)) await combat.delete();
  }
  await scene.unsetFlag(MODULE_ID, FLAGS.STATE);

  if (landing) {
    if (pull) await landing.activate();
    else await landing.view();
  }
  return landing;
}
