import { MODULE_ID, SETTINGS, SECTION_TYPES, LINE_VISIBILITY, OBSCURE_STYLES, DEFAULT_FADE_MS, DEFAULT_BLUR_PX, DEFAULT_BG_FADE_OPACITY, DEFAULT_OBSCURE_BLUR_PX, DEFAULT_AUTO_DELAY_MS, LOCK_SLOT_COUNT, TRANSITION_TYPES, DEFAULT_TRANSITION_MS, DEFAULT_STAGE_CHARACTER_THUMB_SCALE } from "./constants.js";

/**
 * Scene Director's own scene/timeline data model.
 * Scenes are stored world-scoped as a plain object keyed by scene id.
 * Each scene = { id, name, sections: [ ...ordered action sections ] }
 */

function uid() {
  return foundry.utils.randomID(12);
}

export function getAllScenes() {
  const raw = game.settings.get(MODULE_ID, SETTINGS.SCENES) ?? {};
  return raw;
}

export async function saveAllScenes(scenesObj) {
  await game.settings.set(MODULE_ID, SETTINGS.SCENES, scenesObj);
}

export function getScene(sceneId) {
  return getAllScenes()[sceneId] ?? null;
}

export async function createScene(name = "New Scene") {
  const scenes = getAllScenes();
  const id = uid();
  // locked: false — see lockScene/unlockScene below. A locked scene's structure/references are
  // frozen (every mutating function in this file bails out while locked) so it can be fired
  // safely from anywhere without the GM accidentally editing it out from under itself.
  scenes[id] = { id, name, sections: [], locked: false };
  await saveAllScenes(scenes);
  return scenes[id];
}

export async function renameScene(sceneId, name) {
  const scenes = getAllScenes();
  if (!scenes[sceneId] || scenes[sceneId].locked) return;
  scenes[sceneId].name = name;
  await saveAllScenes(scenes);
}

export async function deleteScene(sceneId) {
  const scenes = getAllScenes();
  if (scenes[sceneId]?.locked) return;
  delete scenes[sceneId];
  await saveAllScenes(scenes);
}

export async function clearScene(sceneId) {
  const scenes = getAllScenes();
  if (!scenes[sceneId] || scenes[sceneId].locked) return;
  scenes[sceneId].sections = [];
  await saveAllScenes(scenes);
}

/** Factory for a new section of a given type, with sensible defaults. */
export function makeSection(type, extra = {}) {
  const base = { id: uid(), type };
  switch (type) {
    case SECTION_TYPES.CHARACTER:
      return {
        ...base,
        tokenId: extra.tokenId ?? null, // a specific placed token, not just the actor — lets the
        // same actor (e.g. "Bandit") be staged more than once when it has more than one token on board
        // A "loose" character reference — no token placed on this scene at all, staged straight
        // off the actor's own profile art. Used for Group-actor members added via the Add
        // Character dropdown's per-group listing without placing a token for them first.
        // Exactly one of tokenId/actorId is set on a resolved section; see subjectKey() below.
        actorId: extra.actorId ?? null,
        x: extra.x ?? 50, // percent of viewport
        y: extra.y ?? 50,
        flipH: false,
        flipV: false,
        rotation: 0,
        scale: extra.scale ?? 1,
        // Which Quick Position button (if any) is "remembered" as active — purely a UI
        // highlight, not re-derived from x every render, so it survives a manual drag/nudge
        // afterward instead of silently un-highlighting. null = none remembered.
        activeQuickPosition: extra.activeQuickPosition ?? null,
        fadeInMs: DEFAULT_FADE_MS,
        // Which art this portrait shows: the actor's profile/portrait image (default, matches
        // pre-existing behavior) or the token's own map art, when they differ.
        imageSource: extra.imageSource ?? "profile",
        // The Obscure/Reveal style dropdown IS the on/off switch now (no separate "Start
        // obscured" checkbox as of v2026.09.23.9) — "none" means no effect at all, "blur"/
        // "shadow" both apply and enable their look in one choice. Defaults to "none". A
        // pre-v2026.09.23.9 section may still carry the old `obscured` boolean field in its
        // saved data (never written to by this version, but never stripped either) — see
        // staging-view.js's portraitFilter for how that's honored for backward compatibility.
        obscureStyle: extra.obscureStyle ?? OBSCURE_STYLES.NONE,
        obscureBlurAmount: extra.obscureBlurAmount ?? DEFAULT_OBSCURE_BLUR_PX,
        // How long Auto Play waits after firing THIS section before auto-advancing to the
        // next one, in ms. Only consulted during Auto Play (see scene-editor.js's #autoStep);
        // manual Next/Fire ignore it entirely. Not present on Pause sections, which wait for
        // the GM instead of a timer.
        autoDelayMs: extra.autoDelayMs ?? DEFAULT_AUTO_DELAY_MS,
        // Which of this character's 10 Position Locks (see LOCK_SLOT_COUNT, constants.js)
        // this section is currently sitting at, if any — null once dragged/nudged away from
        // it, same "explicit flag, not re-derived from x/y" precedent as activeQuickPosition.
        // The locks' actual saved (x,y) DATA lives per-character at the scene level (see
        // getCharacterLockSlots/setCharacterLockSlot below), not here — this field is only
        // this one section's OWN "which one am I currently at" pointer.
        activeLockIndex: extra.activeLockIndex ?? null,
        // Per-character Position Transitions (animated slide instead of an instant snap when
        // this already-staged character moves to a new spot — see staging-view.js's
        // showCharacter). Lives on the SECTION itself, not just a single module-wide switch,
        // so different characters can move differently. New Character sections seed these
        // from Config Settings' "default for new characters" versions of the same two
        // settings (see #onAddCharacter) — same "default setting informs the per-item field"
        // precedent as defaultLineVisibility → a Line section's own visibility.
        transitionEnabled: extra.transitionEnabled ?? false,
        transitionType: extra.transitionType ?? TRANSITION_TYPES.SLIDE,
        // How long the Movement subsection's own transition takes: Slide's slide duration, or
        // (Fade Movement/Teleport Movement, added v2026.09.23.13) EACH of the two phases —
        // hide at the old spot, then reveal at the new one — so a two-phase move takes 2x
        // this. A pre-v2026.09.23.13 section has no such field at all; staging-view.js falls
        // back to DEFAULT_TRANSITION_MS for those rather than treating the missing field as 0,
        // so an old Slide section keeps its original speed instead of suddenly snapping instantly.
        transitionMs: extra.transitionMs ?? DEFAULT_TRANSITION_MS,
        // How long an obscure/reveal LOOK CHANGE (obscureStyle/obscureBlurAmount — see
        // CHARACTER_DIFF_FIELDS below) animates over when it fires on an already-staged
        // character, instead of snapping instantly — this used to be the separate "Reveal
        // Character" section type's own durationMs; that type is gone now, folded into
        // ordinary Character Control firing (see mergeCharacterSection/showCharacter).
        // Ignored for a character's first appearance (always instant) and for a fire that
        // doesn't actually change the obscured look.
        obscureDurationMs: extra.obscureDurationMs ?? DEFAULT_FADE_MS,
        // Which fields THIS section explicitly sets, as opposed to just carrying along
        // whatever default/inherited value it was created with. Only fields in this list are
        // applied when this section fires for a character that's ALREADY on stage — every
        // other field is left exactly as it's currently showing (see mergeCharacterSection
        // below). A brand-new section (empty array here) still fully applies every field the
        // FIRST time it stages that character (nothing to inherit from yet), and a section
        // from before this feature existed (touchedFields missing entirely, not just empty)
        // always fully applies too — see mergeCharacterSection's own legacy check. Populated
        // by the editor's field bindings (scene-editor.js's bindCharacterField) plus the
        // Quick Position / Position Lock / live-portrait-menu / drag-and-nudge actions that
        // set x/y outside the ordinary field bindings (see SceneData.withTouchedFields).
        touchedFields: Array.isArray(extra.touchedFields) ? extra.touchedFields : [],
        collapsed: false
      };
    case SECTION_TYPES.CHARACTER_CONTROL:
      // A lighter-weight companion to CHARACTER — re-adjusts an already on-stage character
      // (appearance, movement, obscure/reveal, position). As of v2026.09.24.1 it carries the
      // SAME diffable field set as CHARACTER (x/y/scale/imageSource/obscureStyle/
      // obscureBlurAmount, plus fadeInMs/obscureDurationMs) so the GM can fully restyle an
      // on-stage character from here instead of only flipping/rotating/moving them. As of
      // v2026.09.24.4 it CAN originate a character's real first appearance — but only for a
      // subject Stage Character has already preloaded (StagingView.isPreloaded); for anyone
      // neither staged nor preloaded, firing this is still a no-op (see playback.js's own
      // CHARACTER_CONTROL case). #onSetLock's CHARACTER-only guard on saving into an EMPTY lock
      // slot is unaffected — this type can only recall/clear an already-saved one, and a
      // preloaded-but-not-yet-shown subject has no on-screen position to save one from anyway.
      return {
        ...base,
        tokenId: extra.tokenId ?? null,
        actorId: extra.actorId ?? null, // see CHARACTER's actorId comment above
        x: extra.x ?? 50,
        y: extra.y ?? 50,
        flipH: false,
        flipV: false,
        rotation: 0,
        scale: extra.scale ?? 1,
        activeQuickPosition: extra.activeQuickPosition ?? null,
        fadeInMs: DEFAULT_FADE_MS,
        imageSource: extra.imageSource ?? "profile",
        obscureStyle: extra.obscureStyle ?? OBSCURE_STYLES.NONE,
        obscureBlurAmount: extra.obscureBlurAmount ?? DEFAULT_OBSCURE_BLUR_PX,
        activeLockIndex: extra.activeLockIndex ?? null,
        transitionEnabled: extra.transitionEnabled ?? false,
        transitionType: extra.transitionType ?? TRANSITION_TYPES.SLIDE,
        // See CHARACTER's own transitionMs comment above — same field, same fallback rule.
        transitionMs: extra.transitionMs ?? DEFAULT_TRANSITION_MS,
        obscureDurationMs: extra.obscureDurationMs ?? DEFAULT_FADE_MS,
        autoDelayMs: extra.autoDelayMs ?? DEFAULT_AUTO_DELAY_MS,
        touchedFields: Array.isArray(extra.touchedFields) ? extra.touchedFields : [],
        collapsed: false
      };
    case SECTION_TYPES.STAGE_CHARACTER:
      // Multi-select, image-grid alternative to CHARACTER — see constants.js's own comment.
      // selectedKeys is the whole point: a plain array of subjectKey strings ("t:<tokenId>" or
      // "a:<actorId>", same format everything else in the module uses), one per character the
      // GM has checked off in the grid. No x/y/scale/etc. of its own — and, as of
      // v2026.09.24.4, firing this never shows anyone: each not-yet-staged selected subject
      // just gets its art warmed up in the browser's cache (StagingView.preloadCharacter), per
      // Mogie's own ask ("Stage is there to preload the character but the character shouldn't
      // need fired"). Its real first appearance has to come from a Character Control section
      // firing for it afterward (see playback.js's STAGE_CHARACTER/CHARACTER_CONTROL cases) —
      // a Stage Character card with no Character Control after it for a subject will never
      // actually show that subject.
      return {
        ...base,
        selectedKeys: Array.isArray(extra.selectedKeys) ? extra.selectedKeys : [],
        // Editor-only cosmetic: how big this card's own thumbnails render, never touches the
        // actual staged portrait's Scale field. See constants.js's DEFAULT_STAGE_CHARACTER_THUMB_SCALE.
        thumbScale: extra.thumbScale ?? DEFAULT_STAGE_CHARACTER_THUMB_SCALE,
        // Deliberately no auto-delay (removed per Mogie's direct ask, same treatment as
        // CLEAR_SCENE above): this card doesn't wait on anything, it's "always active" — during
        // Auto Play it fires and advances immediately rather than pausing first like every
        // other section type does. #autoStep's `Number(section.autoDelayMs) || 0` falls back to
        // a 0ms delay automatically for a section with no autoDelayMs field at all. The
        // template's own clock icon/number box is gone too, replaced with a plain "Always
        // active" tag so the GM isn't left wondering why there's no timer here.
        collapsed: false
      };
    case SECTION_TYPES.LINE:
      return {
        ...base,
        tokenId: extra.tokenId ?? null,
        actorId: extra.actorId ?? null, // see CHARACTER's actorId comment above
        text: extra.text ?? "",
        visibility: extra.visibility ?? LINE_VISIBILITY.PUBLIC,
        // Private-only alternative to the caption bar: shows this line in the fixed
        // top-center speech bubble instead, tail pointing toward the speaking character.
        // Has no effect on a Public line (those hand off to chat and show neither).
        bubbleEnabled: extra.bubbleEnabled ?? false,
        autoTarget: true,
        autoDelayMs: extra.autoDelayMs ?? DEFAULT_AUTO_DELAY_MS,
        collapsed: false
      };
    case SECTION_TYPES.CLEAR_CHARACTER:
      return {
        ...base,
        // A checkbox-per-active-member list, not the single tokenId/actorId every other
        // character-referencing section type uses — the GM can clear several staged
        // characters at once with one section instead of needing one Clear Character section
        // per member. Each entry is a subjectKey string ("t:<tokenId>" or "a:<actorId>", see
        // subjectKey() below), matching whichever of this scene's currently on-stage members
        // the GM checked in the editor.
        targetKeys: Array.isArray(extra.targetKeys) ? extra.targetKeys : [],
        fadeOutMs: DEFAULT_FADE_MS,
        autoDelayMs: extra.autoDelayMs ?? DEFAULT_AUTO_DELAY_MS,
        collapsed: false
      };
    case SECTION_TYPES.CLEAR_TEXT:
      return { ...base, autoDelayMs: extra.autoDelayMs ?? DEFAULT_AUTO_DELAY_MS };
    case SECTION_TYPES.CLEAR_SCENE:
      // A timeline step that, when reached (via Next or its own Fire button), wipes every
      // staged portrait/caption/background effect for the GM and every player — same effect
      // as the standalone "Clear Scene" footer button, but scriptable into the scene itself
      // so a scene can end (or reset mid-scene) on its own without the GM reaching for that
      // button by hand. No extra fields of its own — and deliberately no auto-delay either
      // (removed per Mogie's direct ask): wiping the scene is the natural "we're done here"
      // moment, so during Auto Play it advances immediately rather than pausing first like
      // every other section type does. #autoStep's `Number(section.autoDelayMs) || 0` falls
      // back to a 0ms delay automatically for a section with no autoDelayMs field at all.
      return { ...base };
    case SECTION_TYPES.BACKGROUND_EFFECT:
      return {
        ...base,
        blurEnabled: extra.blurEnabled ?? true,
        blurAmount: extra.blurAmount ?? DEFAULT_BLUR_PX,
        fadeEnabled: extra.fadeEnabled ?? true,
        fadeColor: extra.fadeColor ?? { r: 0, g: 0, b: 0 },
        fadeOpacity: extra.fadeOpacity ?? DEFAULT_BG_FADE_OPACITY,
        durationMs: extra.durationMs ?? DEFAULT_FADE_MS,
        autoDelayMs: extra.autoDelayMs ?? DEFAULT_AUTO_DELAY_MS,
        collapsed: false
      };
    case SECTION_TYPES.CLEAR_BACKGROUND_EFFECT:
      return {
        ...base,
        durationMs: extra.durationMs ?? DEFAULT_FADE_MS,
        autoDelayMs: extra.autoDelayMs ?? DEFAULT_AUTO_DELAY_MS,
        collapsed: false
      };
    case SECTION_TYPES.PAUSE:
      // "Scene Controls" — a pure Auto Play control marker, no playback effect. Placed right
      // after whatever section the GM wants Auto Play to stop after; see the
      // SECTION_TYPES.PAUSE comment in constants.js for how it's handled.
      return {
        ...base,
        // When on, Auto Play skips straight past this Pause without halting at all — lets the
        // GM temporarily bypass a checkpoint (e.g. during a quick dry-run through a scene)
        // without deleting the Pause section itself. Off by default (matches all prior
        // behavior — every Pause halts Auto Play unless the GM explicitly turns this on for
        // it). Never affects manual Next/Fire, which already treat every Pause as an inert
        // no-op regardless of this flag — see scene-editor.js's #autoStep.
        skipInAutoPlay: extra.skipInAutoPlay ?? false
      };
    default:
      throw new Error(`FGA Scene Director | Unknown section type: ${type}`);
  }
}

export async function addSection(sceneId, section) {
  const scenes = getAllScenes();
  const scene = scenes[sceneId];
  if (!scene || scene.locked) return;
  scene.sections.push(section);
  await saveAllScenes(scenes);
  return section;
}

export async function updateSection(sceneId, sectionId, patch) {
  const scenes = getAllScenes();
  const scene = scenes[sceneId];
  if (!scene || scene.locked) return;
  const idx = scene.sections.findIndex(s => s.id === sectionId);
  if (idx === -1) return;
  scene.sections[idx] = { ...scene.sections[idx], ...patch };
  await saveAllScenes(scenes);
}

export async function deleteSection(sceneId, sectionId) {
  const scenes = getAllScenes();
  const scene = scenes[sceneId];
  if (!scene || scene.locked) return;
  scene.sections = scene.sections.filter(s => s.id !== sectionId);
  await saveAllScenes(scenes);
}

/** Insert one or more new sections into a scene's timeline immediately after an existing
 *  section (e.g. Expand Group inserting a member's Character section right after the Group's
 *  own Character section, instead of appending them at the very end of the timeline). If
 *  afterSectionId isn't found, falls back to appending at the end. */
export async function insertSectionsAfter(sceneId, afterSectionId, newSections) {
  const scenes = getAllScenes();
  const scene = scenes[sceneId];
  if (!scene || scene.locked || !newSections.length) return;
  const idx = scene.sections.findIndex(s => s.id === afterSectionId);
  const insertAt = idx === -1 ? scene.sections.length : idx + 1;
  scene.sections.splice(insertAt, 0, ...newSections);
  await saveAllScenes(scenes);
}

/** Move a section to a new index within its scene (drag-and-drop reorder). */
export async function reorderSection(sceneId, sectionId, newIndex) {
  const scenes = getAllScenes();
  const scene = scenes[sceneId];
  if (!scene || scene.locked) return;
  const curIdx = scene.sections.findIndex(s => s.id === sectionId);
  if (curIdx === -1) return;
  const [moved] = scene.sections.splice(curIdx, 1);
  const clamped = Math.max(0, Math.min(newIndex, scene.sections.length));
  scene.sections.splice(clamped, 0, moved);
  await saveAllScenes(scenes);
}

/** A Character/CharacterControl/Line/ClearCharacter section's subject: either a specific
 *  placed token (tokenId) — the normal case — or, for a "loose" character with no token
 *  placed on this scene at all (a Group member added straight from the Add Character
 *  dropdown's per-group listing), a direct actor reference (actorId). Exactly one of the
 *  two should be set on a resolved section. This key is what everything that used to key
 *  purely off tokenId (the on-stage map, the staged-portrait layer, name lookups) keys off
 *  now, so a loose actor-based section and a token-based section are both addressable the
 *  same way without the rest of the module needing to know which kind it's looking at. */
export function subjectKey(section) {
  if (section?.tokenId) return `t:${section.tokenId}`;
  if (section?.actorId) return `a:${section.actorId}`;
  return null;
}

/** Resolves a section's subject to the real Foundry documents behind it: { tokenDoc, actor }.
 *  A token-locked section (tokenId set) only ever resolves against the CURRENT canvas scene —
 *  switch to a different Foundry scene, or delete that exact token, and it comes back null,
 *  same as always.
 *
 *  An actor-based section (actorId set, no tokenId — a "loose" Group member, or any section a
 *  locked scene converted, see lockScene below) resolves the actor globally (works on any
 *  Foundry scene, always), then OPPORTUNISTICALLY looks for a token belonging to that actor on
 *  the CURRENT canvas scene too: if one's placed here, it's used for token art + auto-targeting
 *  exactly like a token-locked section would; if not, this comes back with tokenDoc: null
 *  (profile art only, nothing to auto-target) — the "you still have to put the token back on
 *  the board before it fully works" case, by design. If more than one token for the same actor
 *  is on the current scene, the first one found wins (no disambiguation prompt).
 *
 *  Both come back null if the section has neither field set, or if what it pointed to (a
 *  token, an actor) no longer exists at all. */
export function resolveSubject(section) {
  if (section?.tokenId) {
    const tokenDoc = canvas?.scene?.tokens.get(section.tokenId) ?? null;
    return { tokenDoc, actor: tokenDoc?.actor ?? null };
  }
  if (section?.actorId) {
    const actor = game.actors?.get(section.actorId) ?? null;
    let tokenDoc = null;
    if (actor && canvas?.scene?.tokens) {
      for (const t of canvas.scene.tokens) {
        if (t.actor?.id === actor.id) { tokenDoc = t; break; }
      }
    }
    return { tokenDoc, actor };
  }
  return { tokenDoc: null, actor: null };
}

/** Converts every token-locked character reference in a scene (Character/Character Control/
 *  Line's own tokenId, Stage Character's selectedKeys, Clear Character's targetKeys) into an
 *  actor-based reference, then marks the scene locked — every mutating function above (and
 *  #onSetLock/#onSetQuickPosition etc. in scene-editor.js, which all route through them) starts
 *  refusing to touch it until unlockScene() is called. An actor-based reference keeps resolving
 *  no matter which Foundry scene is active or what happens to the original token (see
 *  resolveSubject's own actorId branch above) — that's the whole point: build the scene once,
 *  fire it from anywhere, as long as this actor has SOME token on whatever board is active when
 *  it fires.
 *
 *  Requires every token this scene currently references to resolve RIGHT NOW against the active
 *  canvas scene — i.e. the GM needs to be viewing the board where all of this scene's
 *  characters are actually placed before locking. Converting a dangling tokenId would just
 *  carry the same dangling reference forward as a dangling actorId instead of fixing anything,
 *  so this refuses entirely (no partial lock) and reports back which token ids couldn't be
 *  resolved, leaving the scene completely untouched.
 *
 *  Also migrates any saved Position Lock slots (scene.characterLocks, keyed by subjectKey) from
 *  each old "t:<tokenId>" key to its new "a:<actorId>" key, so saved spots survive the
 *  conversion instead of silently going orphaned under a key nothing points to anymore.
 *
 *  Returns { ok: true } on success, or { ok: false, unresolvedTokenIds: [...] } listing the raw
 *  token ids that didn't resolve — scene-editor.js turns that into a GM-facing notification;
 *  this layer has no token/actor NAME to report for a token that's already gone. */
export async function lockScene(sceneId) {
  const scenes = getAllScenes();
  const scene = scenes[sceneId];
  if (!scene) return { ok: false, unresolvedTokenIds: [] };
  if (scene.locked) return { ok: true };

  const tokenIdsSeen = new Set();
  const collect = (s) => {
    if (s.tokenId) tokenIdsSeen.add(s.tokenId);
    for (const k of (Array.isArray(s.selectedKeys) ? s.selectedKeys : [])) {
      if (k?.startsWith("t:")) tokenIdsSeen.add(k.slice(2));
    }
    for (const k of (Array.isArray(s.targetKeys) ? s.targetKeys : [])) {
      if (k?.startsWith("t:")) tokenIdsSeen.add(k.slice(2));
    }
  };
  for (const s of scene.sections) collect(s);

  const tokenIdToActorId = new Map();
  const unresolvedTokenIds = [];
  for (const tokenId of tokenIdsSeen) {
    const actorId = canvas?.scene?.tokens.get(tokenId)?.actor?.id ?? null;
    if (!actorId) unresolvedTokenIds.push(tokenId);
    else tokenIdToActorId.set(tokenId, actorId);
  }
  if (unresolvedTokenIds.length) return { ok: false, unresolvedTokenIds };

  scene.characterLocks ??= {};
  for (const [tokenId, actorId] of tokenIdToActorId) {
    const oldKey = `t:${tokenId}`;
    const newKey = `a:${actorId}`;
    if (scene.characterLocks[oldKey] && !scene.characterLocks[newKey]) {
      scene.characterLocks[newKey] = scene.characterLocks[oldKey];
    }
    delete scene.characterLocks[oldKey];
  }

  for (const s of scene.sections) {
    if (s.tokenId && tokenIdToActorId.has(s.tokenId)) {
      s.actorId = tokenIdToActorId.get(s.tokenId);
      s.tokenId = null;
    }
    if (Array.isArray(s.selectedKeys)) {
      s.selectedKeys = s.selectedKeys.map(k =>
        (k?.startsWith("t:") && tokenIdToActorId.has(k.slice(2))) ? `a:${tokenIdToActorId.get(k.slice(2))}` : k
      );
    }
    if (Array.isArray(s.targetKeys)) {
      s.targetKeys = s.targetKeys.map(k =>
        (k?.startsWith("t:") && tokenIdToActorId.has(k.slice(2))) ? `a:${tokenIdToActorId.get(k.slice(2))}` : k
      );
    }
  }

  scene.locked = true;
  await saveAllScenes(scenes);
  return { ok: true };
}

/** Re-enables editing on a locked scene. Doesn't undo lockScene's token->actor conversion —
 *  that's not lossy going forward, an actor-based reference is still fully editable, it just
 *  won't be re-pinned to one specific token instance again — it only clears the flag every
 *  mutating function above gates on. */
export async function unlockScene(sceneId) {
  const scenes = getAllScenes();
  const scene = scenes[sceneId];
  if (!scene) return;
  scene.locked = false;
  await saveAllScenes(scenes);
}

/** The Image Source (Profile art vs Token art) a BRAND-NEW appearance of this subject should
 *  start on, per Mogie's own ask: mobs default to their map/token art, player characters
 *  default to their profile art, each independently configurable (see constants.js's four
 *  DEFAULT_IMAGE_SOURCE_* settings). Only ever consulted for a subject's first-ever
 *  appearance — callers that find an existing prior look for this subject (already staged, or
 *  reused elsewhere in this same scene's timeline) inherit that prior imageSource directly
 *  instead of calling this, same as every other CHARACTER_DIFF_FIELDS field.
 *
 *  A loose actor reference (no tokenDoc — a Group member picked with no token on this scene)
 *  always comes back "profile" regardless of every setting: there's no token art to offer for
 *  it at all (see _prepareContext's isLooseActor gating on the Image Source field itself).
 *
 *  "Player" takes priority over disposition entirely, checked first: a player-owned or
 *  "character"-type actor's token is usually disposition Friendly too, so disposition alone
 *  can't tell a party member apart from a friendly NPC ally. Anything that isn't Hostile or
 *  Friendly (Neutral, Secret, or any other/future disposition value) falls back to the
 *  Neutral setting, so this never has no answer. */
export function getDefaultImageSource(tokenDoc, actor) {
  if (!tokenDoc) return "profile";
  const isPlayerCharacter = !!actor?.hasPlayerOwner || actor?.type === "character";
  if (isPlayerCharacter) return game.settings.get(MODULE_ID, SETTINGS.DEFAULT_IMAGE_SOURCE_PLAYER) ?? "profile";
  const D = CONST.TOKEN_DISPOSITIONS ?? {};
  if (tokenDoc.disposition === D.HOSTILE) return game.settings.get(MODULE_ID, SETTINGS.DEFAULT_IMAGE_SOURCE_HOSTILE) ?? "token";
  if (tokenDoc.disposition === D.FRIENDLY) return game.settings.get(MODULE_ID, SETTINGS.DEFAULT_IMAGE_SOURCE_FRIENDLY) ?? "token";
  return game.settings.get(MODULE_ID, SETTINGS.DEFAULT_IMAGE_SOURCE_NEUTRAL) ?? "token";
}

/** A character's 10 Position Locks — saved (x,y) spots the GM can instantly return this
 *  character to later. Stored at the SCENE level, keyed by subjectKey (not on the individual
 *  section), so every Character section for the same character shares and remembers the same
 *  10 slots across the whole scene, not just for one appearance of them. Always returns an
 *  array of exactly LOCK_SLOT_COUNT entries, each either null (empty/unused) or {x, y}. */
export function getCharacterLockSlots(scene, subjectKey) {
  const slots = new Array(LOCK_SLOT_COUNT).fill(null);
  if (!subjectKey) return slots;
  const saved = scene?.characterLocks?.[subjectKey];
  if (Array.isArray(saved)) {
    for (let i = 0; i < LOCK_SLOT_COUNT; i++) slots[i] = saved[i] ?? null;
  }
  return slots;
}

/** Saves a character's current position into one of their 10 Position Lock slots (creating
 *  the scene's characterLocks map/this character's slot array as needed). Overwrites whatever
 *  (if anything) was already saved in that slot. */
export async function setCharacterLockSlot(sceneId, subjectKey, slotIndex, position) {
  if (!subjectKey || slotIndex < 0 || slotIndex >= LOCK_SLOT_COUNT) return;
  const scenes = getAllScenes();
  const scene = scenes[sceneId];
  if (!scene || scene.locked) return;
  scene.characterLocks ??= {};
  const slots = scene.characterLocks[subjectKey] ?? new Array(LOCK_SLOT_COUNT).fill(null);
  slots[slotIndex] = { x: position.x, y: position.y };
  scene.characterLocks[subjectKey] = slots;
  await saveAllScenes(scenes);
}

/** Clears one character's lock slot back to empty, deleting its saved position entirely —
 *  the reset companion to setCharacterLockSlot above. The numbered lock buttons themselves
 *  can only save into an empty slot or recall/un-mark a saved one; this is what actually lets
 *  the GM remove a saved spot instead of it sitting there forever. A no-op if this character
 *  has no saved slots at all yet. */
export async function clearCharacterLockSlot(sceneId, subjectKey, slotIndex) {
  if (!subjectKey || slotIndex < 0 || slotIndex >= LOCK_SLOT_COUNT) return;
  const scenes = getAllScenes();
  const scene = scenes[sceneId];
  if (!scene || scene.locked || !scene?.characterLocks?.[subjectKey]) return;
  scene.characterLocks[subjectKey][slotIndex] = null;
  await saveAllScenes(scenes);
}

/** The Character section fields that participate in "Character Control" per-field diffing —
 *  see mergeCharacterSection below. Deliberately excludes bookkeeping/config fields
 *  (tokenId/actorId, autoDelayMs, collapsed, activeQuickPosition, activeLockIndex,
 *  transitionEnabled/transitionType, fadeInMs, obscureDurationMs, touchedFields itself) —
 *  those always come straight from whichever section is actually firing, never inherited.
 *  Does NOT include the old `obscured` boolean (removed as of v2026.09.23.9 — obscureStyle's
 *  "none" option is the on/off switch now); a legacy section that still carries that field in
 *  its saved data always carries its own copy along unmerged, which is exactly right since
 *  it's only ever read as a one-time backward-compat override (see staging-view.js). */
export const CHARACTER_DIFF_FIELDS = [
  "x", "y", "flipH", "flipV", "rotation", "scale", "imageSource",
  "obscureStyle", "obscureBlurAmount"
];

/** Adds one or more field names to a Character section's touchedFields list (deduped, order-
 *  preserving-ish via Set) — marks that THIS section explicitly sets that field, rather than
 *  leaving it to inherit whatever's already showing when it fires (see mergeCharacterSection).
 *  Returns a new array; never mutates section.touchedFields in place. */
export function withTouchedFields(section, ...fields) {
  const current = Array.isArray(section?.touchedFields) ? section.touchedFields : [];
  const next = new Set(current);
  for (const f of fields) next.add(f);
  return [...next];
}

/** The heart of "Character Control": when a Character section fires for a subject that's
 *  already on stage (prior = the currently-applied EFFECTIVE section for that subject, from
 *  StagingView.getAppliedSection — not the raw saved data), only this section's TOUCHED
 *  fields (see CHARACTER_DIFF_FIELDS/touchedFields) actually change anything; every other
 *  diffable field keeps showing whatever it already was. So firing a section that only
 *  touches, say, flipH doesn't reset position, blur, image source, etc. back to that
 *  section's own (possibly stale/default) values — it just flips the character and leaves
 *  the rest exactly as it already looked. This is what replaces the old separate "Reveal
 *  Character" section type too: revealing is just firing a Character Control section that
 *  touches `obscureStyle` — e.g. switching it to "none" (see showCharacter's own filter-
 *  transition logic for the animated part).
 *
 *  Two cases skip the diff entirely and apply the section AS-IS, full snapshot, same as
 *  pre-"Character Control" behavior:
 *  - prior is null: this subject isn't on stage yet, so there's nothing to inherit from —
 *    every field needs a real value regardless of what's touched.
 *  - incoming.touchedFields isn't an array: a section saved before this feature existed. Its
 *    author never had a "touched" concept at all, so treating it as "touched nothing" would
 *    silently turn every one of Mogie's existing re-fired Character sections into a no-op —
 *    instead it keeps behaving exactly like it always did, a full re-apply every time. */
export function mergeCharacterSection(prior, incoming) {
  if (!prior || !Array.isArray(incoming.touchedFields)) return incoming;
  const touched = new Set(incoming.touchedFields);
  const merged = { ...incoming };
  for (const field of CHARACTER_DIFF_FIELDS) {
    if (!touched.has(field)) merged[field] = prior[field];
  }
  return merged;
}

/** Characters currently "on stage" as of a given point in the timeline (used when building/resuming playback).
 *  Keyed by subjectKey (not raw tokenId/actorId) so two tokens of the same actor — e.g. two
 *  generic "Bandit" tokens — or a token-based and a loose actor-based reference to the same
 *  actor, can all be staged and tracked independently. */
export function charactersOnStageAt(scene, sectionIndex) {
  const stage = new Map(); // subjectKey -> character section (latest state)
  for (let i = 0; i <= sectionIndex && i < scene.sections.length; i++) {
    const s = scene.sections[i];
    if (s.type === SECTION_TYPES.CLEAR_SCENE) {
      stage.clear();
      continue;
    }
    if (s.type === SECTION_TYPES.CLEAR_CHARACTER) {
      // Clears every member the GM checked off (targetKeys), not a single subjectKey — see
      // makeSection's CLEAR_CHARACTER case. Clear Character sections carry no tokenId/actorId
      // of their own, so subjectKey(s) below would always be null for this type.
      for (const key of (Array.isArray(s.targetKeys) ? s.targetKeys : [])) stage.delete(key);
      continue;
    }
    if (s.type === SECTION_TYPES.STAGE_CHARACTER) {
      // Adds every member the GM checked off (selectedKeys) — the entrance-side mirror of
      // Clear Character's multi-target removal above. Same reasoning: Stage Character carries
      // no single tokenId/actorId of its own, so subjectKey(s) below would always be null for
      // it. The section stored here is only ever used downstream as a "this subject is on
      // stage" presence marker (Character Control/Line/Clear Character only care about the
      // key existing, not this section's own fields) — it's never merged against like a real
      // CHARACTER section would be.
      for (const key of (Array.isArray(s.selectedKeys) ? s.selectedKeys : [])) stage.set(key, s);
      continue;
    }
    const key = subjectKey(s);
    if (!key) continue;
    if (s.type === SECTION_TYPES.CHARACTER) stage.set(key, s);
  }
  return stage;
}
