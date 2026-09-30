import { MODULE_ID, SETTINGS, SECTION_TYPES, LINE_VISIBILITY, AUTO_DELAY_ORDER, DEFAULT_STAGE_CHARACTER_THUMB_SCALE } from "../constants.js";
import * as SceneData from "../scene-data.js";
import { playSection, fireLineSection, resetLiveScene, showAllCharacters } from "../playback.js";
import { rgbToHex, hexToRgb } from "../color-utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Parses a character-picker <select>'s value into a section patch: either a placed-token
 *  reference ("t:<tokenId>") or a loose actor-only reference ("a:<actorId>" — a Group member
 *  staged straight off its actor's profile art, with no token placed on this scene at all;
 *  see scene-data.js's subjectKey()/resolveSubject()). An empty value clears both fields. */
function parseSubjectValue(value) {
  if (!value) return { tokenId: null, actorId: null };
  if (value.startsWith("t:")) return { tokenId: value.slice(2), actorId: null };
  if (value.startsWith("a:")) return { tokenId: null, actorId: value.slice(2) };
  return { tokenId: null, actorId: null };
}

export class SceneEditorApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "fga-scene-director-editor",
    classes: ["fga-sd-editor"],
    tag: "div",
    window: {
      title: "FGA_SCENE_DIRECTOR.SceneEditor.Title",
      icon: "fa-solid fa-clapperboard",
      resizable: true
    },
    position: {
      width: 720,
      height: 560
    },
    actions: {
      newScene: SceneEditorApp.#onNewScene,
      selectScene: SceneEditorApp.#onSelectScene,
      toggleEditorTools: SceneEditorApp.#onToggleEditorTools,
      nextSection: SceneEditorApp.#onNextSection,
      addCharacter: SceneEditorApp.#onAddCharacter,
      addCharacterControl: SceneEditorApp.#onAddCharacterControl,
      addStageCharacter: SceneEditorApp.#onAddStageCharacter,
      addText: SceneEditorApp.#onAddText,
      addClearCharacter: SceneEditorApp.#onAddClearCharacter,
      addClearText: SceneEditorApp.#onAddClearText,
      addBackgroundEffect: SceneEditorApp.#onAddBackgroundEffect,
      addClearBackgroundEffect: SceneEditorApp.#onAddClearBackgroundEffect,
      addClearScene: SceneEditorApp.#onAddClearScene,
      clearScene: SceneEditorApp.#onClearScene,
      deleteAllSections: SceneEditorApp.#onDeleteAllSections,
      deleteScene: SceneEditorApp.#onDeleteScene,
      showAllCharacters: SceneEditorApp.#onShowAllCharacters,
      deleteSection: SceneEditorApp.#onDeleteSection,
      toggleCollapse: SceneEditorApp.#onToggleCollapse,
      fireSection: SceneEditorApp.#onFireSection,
      setQuickPosition: SceneEditorApp.#onSetQuickPosition,
      setLock: SceneEditorApp.#onSetLock,
      clearActiveLock: SceneEditorApp.#onClearActiveLock,
      toggleSkipInAutoPlay: SceneEditorApp.#onToggleSkipInAutoPlay,
      expandGroup: SceneEditorApp.#onExpandGroup,
      addSceneControls: SceneEditorApp.#onAddSceneControls,
      toggleAutoPlay: SceneEditorApp.#onToggleAutoPlay,
      autoContinue: SceneEditorApp.#onAutoContinue,
      toggleLockScene: SceneEditorApp.#onToggleLockScene
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/scene-editor.hbs` }
  };

  /**
   * Selectable options for the character dropdowns — one entry PER TOKEN currently placed
   * on the active board (canvas.scene), not deduped by actor and not every actor in the
   * world. This is what makes staging two of the same generic actor (e.g. two "Bandit"
   * tokens) possible: each placed token is its own option and its own independent staged
   * portrait, while an actor with only one token on board can only ever be selected once.
   * Duplicate names get a "(2)", "(3)", ... suffix so the GM can tell them apart. `value` is
   * what the <select> actually uses (see parseSubjectValue) — `id` (the bare tokenId) is kept
   * too since other code still keys off it directly.
   *
   * Always uses the ACTOR's name, never the placed token's own (possibly blank/default) name
   * field. This used to prefer `tokenDoc.name`, on the theory that a GM-customized token name
   * is more useful than the shared actor name for telling same-actor duplicates apart — but
   * live-diagnosed against Mogie's real world data, that backfired badly: a "-- Portal Set --"
   * Group actor's own token still had its un-customized default token name "Group", and an NPC
   * actor renamed to "Dark Mage" (from a duplicated template) still had its template's leftover
   * token name "Non-Player Character" — so both showed up under a generic, useless label
   * instead of their real name, with "Dark Mage" effectively invisible in the list (reported as
   * "missing" — it wasn't, it just didn't look like itself). The same-actor-duplicate case this
   * was meant to help is already fully handled by the "(2)"/"(3)" suffixing below, which needs
   * no help from the token's own name field.
   */
  static getBoardActors() {
    const scene = canvas?.scene;
    if (!scene) return [];
    const raw = [];
    for (const tokenDoc of scene.tokens) {
      if (!tokenDoc.actor) continue;
      raw.push({ id: tokenDoc.id, name: tokenDoc.actor.name });
    }
    raw.sort((a, b) => a.name.localeCompare(b.name));
    const nameCounts = new Map();
    for (const entry of raw) nameCounts.set(entry.name, (nameCounts.get(entry.name) ?? 0) + 1);
    const seenSoFar = new Map();
    return raw.map(entry => {
      if ((nameCounts.get(entry.name) ?? 1) <= 1) return { ...entry, value: `t:${entry.id}` };
      const n = (seenSoFar.get(entry.name) ?? 0) + 1;
      seenSoFar.set(entry.name, n);
      return { id: entry.id, name: `${entry.name} (${n})`, value: `t:${entry.id}` };
    });
  }

  /**
   * Group actors whose OWN token is currently placed on the active board (canvas.scene) —
   * i.e. "active" for this scene — each with its member roster for the Add Character
   * dropdown's per-group listing. A member's `value` is a loose actor-only reference
   * ("a:<actorId>", see parseSubjectValue/scene-data.js's subjectKey), not a token — picking
   * one stages that actor straight off its own profile art, with no token needed for the
   * MEMBER itself, even though the group's own token is what unlocked the listing.
   * `label` is what's shown in the dropdown (locally disambiguated if two members of the
   * same group share a name); `actorName` is the plain, undisambiguated name used for
   * summaries/on-stage lists elsewhere so it doesn't depend on which group rendered it.
   * Groups with no members are left out (nothing useful to list).
   *
   * Originally this listed every Group actor in the world regardless of token placement, on
   * the theory that requiring a token at all defeated the point of "no tokens needed." Mogie's
   * own game has several Group actors that exist for other reasons (an organizational
   * grouping like "-- Portal Set --", other campaigns/one-offs) that have nothing to do with
   * the current scene, and listing every one of them by default cluttered the dropdown with
   * groups that aren't relevant right now. Gating on the group's own token being on THIS board
   * keeps the "no member tokens needed" win (a member is still staged with zero tokens of its
   * own) while using the group's own token placement as the GM's explicit signal for "this
   * party is active in this scene, list its members" — matching the same board-presence rule
   * getBoardActors() above already uses for everything else in this dropdown.
   */
  static getGroupOptionGroups() {
    const scene = canvas?.scene;
    const activeGroupActorIds = new Set();
    if (scene) {
      for (const tokenDoc of scene.tokens) {
        if (tokenDoc.actor?.type === "group") activeGroupActorIds.add(tokenDoc.actor.id);
      }
    }
    const groups = (game.actors ?? []).filter(a => a.type === "group" && activeGroupActorIds.has(a.id));
    return groups.map(group => {
      const members = SceneEditorApp.#getGroupMemberActors(group);
      const nameCounts = new Map();
      for (const m of members) nameCounts.set(m.name, (nameCounts.get(m.name) ?? 0) + 1);
      const seenSoFar = new Map();
      const memberOptions = members.map(m => {
        let label = m.name;
        if ((nameCounts.get(m.name) ?? 1) > 1) {
          const n = (seenSoFar.get(m.name) ?? 0) + 1;
          seenSoFar.set(m.name, n);
          label = `${m.name} (${n})`;
        }
        return { value: `a:${m.id}`, label, actorName: m.name };
      });
      return { id: group.id, name: group.name, members: memberOptions };
    }).filter(g => g.members.length > 0);
  }

  /**
   * Stage Character's own image-grid data: every non-Group token currently placed on the
   * active board (canvas.scene), flat, PLUS every Group-type token on the board expanded into
   * a header (the group's name) followed by its member roster — same "list a Group's members
   * even with zero tokens of their own" convention getGroupOptionGroups() already established
   * for Add Character's dropdown, just rendered as a header+list instead of an <optgroup>. A
   * Group with no members is left out entirely, same as getGroupOptionGroups(). Each item
   * carries its own `img` (actor portrait art, falling back to the token's own map art, then
   * Foundry's default mystery-man icon) since this grid is a visual picker, unlike the
   * plain-text dropdowns above. Selection state isn't computed here — see _prepareContext's
   * per-section mapping over this list against that STAGE_CHARACTER section's own
   * selectedKeys.
   */
  static getBoardThumbItems() {
    const scene = canvas?.scene;
    if (!scene) return [];
    const items = [];

    const flatTokens = [];
    for (const tokenDoc of scene.tokens) {
      if (!tokenDoc.actor || tokenDoc.actor.type === "group") continue; // groups handled below, as a header
      flatTokens.push(tokenDoc);
    }
    flatTokens.sort((a, b) => a.actor.name.localeCompare(b.actor.name));
    const nameCounts = new Map();
    for (const t of flatTokens) nameCounts.set(t.actor.name, (nameCounts.get(t.actor.name) ?? 0) + 1);
    const seenSoFar = new Map();
    for (const tokenDoc of flatTokens) {
      const actor = tokenDoc.actor;
      let name = actor.name;
      if ((nameCounts.get(actor.name) ?? 1) > 1) {
        const n = (seenSoFar.get(actor.name) ?? 0) + 1;
        seenSoFar.set(actor.name, n);
        name = `${actor.name} (${n})`;
      }
      items.push({ kind: "token", id: `t:${tokenDoc.id}`, name, img: actor.img || tokenDoc.texture?.src || "icons/svg/mystery-man.svg" });
    }

    for (const tokenDoc of scene.tokens) {
      if (tokenDoc.actor?.type !== "group") continue;
      const members = SceneEditorApp.#getGroupMemberActors(tokenDoc.actor);
      if (!members.length) continue;
      items.push({ kind: "header", name: tokenDoc.actor.name });
      const memberNameCounts = new Map();
      for (const m of members) memberNameCounts.set(m.name, (memberNameCounts.get(m.name) ?? 0) + 1);
      const memberSeen = new Map();
      for (const m of members) {
        let name = m.name;
        if ((memberNameCounts.get(m.name) ?? 1) > 1) {
          const n = (memberSeen.get(m.name) ?? 0) + 1;
          memberSeen.set(m.name, n);
          name = `${m.name} (${n})`;
        }
        items.push({ kind: "member", id: `a:${m.id}`, name, img: m.img || "icons/svg/mystery-man.svg" });
      }
    }
    return items;
  }

  /** Currently active (open) scene id, per-client UI state — not persisted with the scene data itself. */
  activeSceneId = null;
  editorToolsVisible = game.settings.get(MODULE_ID, SETTINGS.EDITOR_TOOLS_DEFAULT_VISIBLE);
  #nextIndex = 0; // pointer for sequential "Next" playback — Auto Play drives this same pointer
  #dragSectionId = null;
  #pendingScrollTop = null;
  // Auto Play state. #autoActive covers the whole session (from clicking Auto Play until
  // Stop or the scene runs out of sections), including while halted at a Pause section;
  // #autoPaused is specifically that halted-at-a-Pause sub-state (drives the big Continue
  // banner). #autoTimer is the pending per-step delay's setTimeout handle, cancelled on Stop
  // so a queued step can't fire after the GM has already stopped Auto Play.
  #autoActive = false;
  #autoPaused = false;
  #autoTimer = null;

  /** Re-renders while keeping the timeline scrolled to where it was — a plain this.render()
   *  after editing one field otherwise snaps the whole panel back to the top of the list,
   *  which is disorienting on a long scene. Used for in-place edits (field changes, collapse
   *  toggles, add/delete section, reorder, Next); actions that intentionally change context
   *  (switching scenes, creating/deleting a scene) still use plain render() so they DO reset
   *  to the top of the new view. */
  #rerender() {
    const timeline = this.element?.querySelector(".fga-sd-timeline");
    this.#pendingScrollTop = timeline ? timeline.scrollTop : null;
    return this.render();
  }

  async _prepareContext(_options) {
    const scenesObj = SceneData.getAllScenes();
    const scenes = Object.values(scenesObj).sort((a, b) => a.name.localeCompare(b.name));
    if (!this.activeSceneId && scenes.length) this.activeSceneId = scenes[0].id;

    const actors = SceneEditorApp.getBoardActors();
    const characterGroups = SceneEditorApp.getGroupOptionGroups();
    // Stage Character's own image-grid source list — computed once here (like actors/
    // characterGroups above) since it doesn't depend on which section is asking; each
    // STAGE_CHARACTER section below just maps its own selectedKeys onto this shared list.
    const boardThumbItems = SceneEditorApp.getBoardThumbItems();
    // One combined name lookup, keyed by subjectKey, covering both placed board tokens and
    // loose (token-less) Group members — so summaries/on-stage lists can resolve either kind
    // of Character section's name the same way, without caring which one it is. Loose
    // members use their plain actor name here (not the dropdown's locally-disambiguated
    // label), so the name shown elsewhere doesn't depend on which group happened to render
    // it first.
    const subjectNameByKey = new Map(actors.map(a => [a.value, a.name]));
    for (const group of characterGroups) {
      for (const m of group.members) {
        if (!subjectNameByKey.has(m.value)) subjectNameByKey.set(m.value, m.actorName);
      }
    }

    const L = key => game.i18n.localize(`FGA_SCENE_DIRECTOR.SceneEditor.${key}`);
    const summaryFor = s => {
      const key = SceneData.subjectKey(s);
      const charName = key ? (subjectNameByKey.get(key) ?? L("NoCharacterSelected")) : L("NoCharacterSelected");
      switch (s.type) {
        case SECTION_TYPES.CHARACTER:
          return charName;
        case SECTION_TYPES.CHARACTER_CONTROL:
          return `${L("CharacterControl")}: ${charName}`;
        case SECTION_TYPES.STAGE_CHARACTER: {
          // Multi-select, same pattern as Clear Character's own summary below.
          const keys = Array.isArray(s.selectedKeys) ? s.selectedKeys : [];
          const names = keys.map(k => subjectNameByKey.get(k)).filter(Boolean);
          return `${L("StageCharacter")}: ${names.length ? names.join(", ") : L("NoCharacterSelected")}`;
        }
        case SECTION_TYPES.LINE: {
          const text = (s.text ?? "").trim();
          const short = text.length > 60 ? `${text.slice(0, 57)}…` : text;
          return `${charName} – ${short || L("EmptyLine")}`;
        }
        case SECTION_TYPES.CLEAR_CHARACTER: {
          // Multi-select (checkboxes), not the single subjectKey every other section type
          // uses — see targetKeys on the makeSection CLEAR_CHARACTER case.
          const keys = Array.isArray(s.targetKeys) ? s.targetKeys : [];
          const names = keys.map(k => subjectNameByKey.get(k)).filter(Boolean);
          return `${L("ClearCharacter")}: ${names.length ? names.join(", ") : L("NoCharacterSelected")}`;
        }
        case SECTION_TYPES.CLEAR_TEXT:
          return L("ClearText");
        case SECTION_TYPES.BACKGROUND_EFFECT:
          return L("BackgroundEffect");
        case SECTION_TYPES.CLEAR_BACKGROUND_EFFECT:
          return L("ClearBackgroundEffect");
        case SECTION_TYPES.CLEAR_SCENE:
          return L("EndScene");
        default:
          return s.type;
      }
    };

    let activeScene = null;
    const rawActive = this.activeSceneId ? scenesObj[this.activeSceneId] : null;
    if (rawActive) {
      // #onNextSection resets the pointer back to 0 and fires section 0 the moment it's
      // clicked past the end of the timeline — but that reset only happens INSIDE that click
      // handler. Between clicks, once #nextIndex reaches the section count, it sits at that
      // out-of-range value, which used to match no row at all and show the "next up" green
      // border on nothing. That read as section 0 getting silently skipped on every loop
      // back around: the highlight would go straight from "nothing" to section 1 the moment
      // section 0 actually fired, so section 0 never got its own highlighted moment. Fixing
      // the display to match what the next click will really do: preview a wraparound to 0
      // the same way #onNextSection itself will.
      const effectiveNextIndex = (rawActive.sections.length && this.#nextIndex >= rawActive.sections.length)
        ? 0
        : this.#nextIndex;
      const sections = rawActive.sections.map((s, index) => {
        const onStage = SceneData.charactersOnStageAt(rawActive, index - 1); // who's on stage BEFORE this section runs
        const onStageActors = [...onStage.keys()]
          .filter(key => subjectNameByKey.has(key))
          .map(key => ({ id: key, name: subjectNameByKey.get(key) }));
        const extra = {};
        if (s.type === SECTION_TYPES.BACKGROUND_EFFECT) {
          const c = s.fadeColor ?? { r: 0, g: 0, b: 0 };
          extra.fadeColorHex = rgbToHex(c.r, c.g, c.b);
          extra.fadeOpacityPct = Math.round((s.fadeOpacity ?? 0) * 100);
        }
        if (s.type === SECTION_TYPES.CHARACTER) {
          // A Group-type actor (Foundry's core "group"/party actor type) can be staged like
          // any other token, but staging it as one single portrait misses the point of a
          // party actor — the GM almost always wants its individual members on stage instead.
          // Surface an "Expand Group" action whenever this section's token belongs to a
          // Group actor, so the GM can add its members as their own Character sections
          // without hand-building one section per party member.
          const tokenDoc = s.tokenId ? canvas.scene?.tokens.get(s.tokenId) : null;
          extra.isGroupActor = tokenDoc?.actor?.type === "group";
        }
        if (s.type === SECTION_TYPES.CHARACTER || s.type === SECTION_TYPES.CHARACTER_CONTROL) {
          // A loose (token-less) Group-member section — picked straight from a group's
          // optgroup (Character) or a loose on-stage actor (Character Control) rather than a
          // placed token. There's no token art to offer for it, so the template restricts its
          // Image Source field to profile art only. Character Control gained its own
          // Appearance subsection in v2026.09.24.1, so it needs this flag too now.
          extra.isLooseActor = !!s.actorId && !s.tokenId;
        }
        if (s.type === SECTION_TYPES.STAGE_CHARACTER) {
          // The image grid itself: boardThumbItems (computed once, above) mapped with THIS
          // section's own checked/unchecked state. Header entries pass through unchanged
          // (nothing to select on a header row); token/member entries gain a `selected` flag
          // driven by this section's selectedKeys, read by toggleStageCharacterTarget's
          // binding and the template's amber-aura styling.
          const selected = new Set(Array.isArray(s.selectedKeys) ? s.selectedKeys : []);
          extra.thumbGrid = boardThumbItems.map(item =>
            item.kind === "header" ? item : { ...item, selected: selected.has(item.id) }
          );
        }
        if (s.type === SECTION_TYPES.CHARACTER || s.type === SECTION_TYPES.CHARACTER_CONTROL) {
          // 10 Position Lock buttons for this character — saved spots this same character (by
          // subjectKey, shared across every Character/Character Control section for them in
          // this scene, not just this one) can be instantly returned to. Three states again
          // (back by Mogie's direct ask, reversing v2026.09.23.4's "everything non-active
          // reads orange" simplification): gray/plain = empty, nothing saved here yet; orange
          // (.saved) = has a saved position but isn't THIS section's active slot; red
          // (.active) = this section is CURRENTLY sitting at that slot. #onSetLock below
          // decides save-vs-recall from its own fresh read of the saved slots, not from this
          // view-model — hasData here only drives the button's color/disabled state.
          const lockSlots = SceneData.getCharacterLockSlots(rawActive, SceneData.subjectKey(s));
          extra.locks = lockSlots.map((slot, index) => ({
            index,
            number: index + 1,
            hasData: !!slot,
            active: s.activeLockIndex === index,
            // Character Control sections have no position of their own to seed a NEW slot
            // with (see makeSection's CHARACTER_CONTROL case) — an empty slot there is shown
            // but inert; Character sections can always save into an empty slot.
            disabled: s.type === SECTION_TYPES.CHARACTER_CONTROL && !slot && s.activeLockIndex !== index
          }));
          // Drives the Clear button next to the numbered locks (#onClearActiveLock) — only
          // meaningful, and only enabled, while this section actually has an active slot.
          extra.hasActiveLock = Number.isInteger(s.activeLockIndex);
        }
        if (s.type === SECTION_TYPES.CHARACTER_CONTROL) {
          // Checkbox list replacing the old single-select dropdown (v2026.09.24.1) — still
          // restricted to only currently on-stage characters (onStageActors, above), but as
          // checkboxes instead of <option>s so it visually matches Clear Character's picker.
          // Single-select is enforced by DISABLING every other checkbox the moment one is
          // picked, rather than plain radio semantics: re-clicking the checked one (the only
          // one left enabled) unchecks it and clears the selection instead of forcing a
          // different pick. See toggleCharacterControlActor's binding in #bindFieldEvents.
          const currentKey = SceneData.subjectKey(s);
          extra.controlTargets = onStageActors.map(a => ({
            id: a.id,
            name: a.name,
            checked: a.id === currentKey,
            disabled: !!currentKey && a.id !== currentKey
          }));
        }
        if (s.type === SECTION_TYPES.CLEAR_CHARACTER) {
          // One checkbox per currently on-stage member (same onStageActors list the Line and
          // Reveal Character pickers use), pre-checked for whichever the GM already selected
          // (s.targetKeys) — replaces the old single-select dropdown so several characters can
          // be cleared by one Clear Character section instead of needing one section each.
          const keys = Array.isArray(s.targetKeys) ? s.targetKeys : [];
          extra.clearTargets = onStageActors.map(a => ({ id: a.id, name: a.name, checked: keys.includes(a.id) }));
        }
        return {
          ...s,
          index,
          isPublic: s.visibility === LINE_VISIBILITY.PUBLIC,
          isNextUp: index === effectiveNextIndex,
          summary: summaryFor(s),
          onStageActors,
          subjectKey: SceneData.subjectKey(s),
          ...extra
        };
      });
      activeScene = { id: rawActive.id, name: rawActive.name, sections, locked: !!rawActive.locked };
    }

    return {
      scenes: scenes.map(s => ({ id: s.id, name: s.name, active: s.id === this.activeSceneId, locked: !!s.locked })),
      actors,
      characterGroups,
      activeScene,
      editorToolsVisible: this.editorToolsVisible,
      // Auto Play state for the header button, the big pause banner, and disabling manual
      // Next/Fire while Auto Play is driving the timeline (see the #autoActive/#autoPaused
      // field comments above).
      autoActive: this.#autoActive,
      autoPaused: this.#autoPaused
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this.#bindFieldEvents();
    this.#bindDragAndDrop();
    if (this.#pendingScrollTop != null) {
      const timeline = this.element.querySelector(".fga-sd-timeline");
      if (timeline) timeline.scrollTop = this.#pendingScrollTop;
      this.#pendingScrollTop = null;
    }
  }

  /** Manual binding for non-click inputs (data-action on <select>/<input>/<textarea>). */
  #bindFieldEvents() {
    const root = this.element;
    const sceneId = this.activeSceneId;

    const sectionIdOf = el => el.closest("[data-section-id]")?.dataset.sectionId;

    root.querySelectorAll('[data-action="renameScene"]').forEach(el => {
      el.addEventListener("change", async ev => {
        await SceneData.renameScene(sceneId, ev.target.value.trim() || "Untitled Scene");
        this.#rerender();
      });
    });

    const bindSectionField = (selector, handler) => {
      root.querySelectorAll(selector).forEach(el => {
        const evtName = (el.tagName === "TEXTAREA" || el.type === "text") ? "change" : "change";
        el.addEventListener(evtName, async ev => {
          const secId = sectionIdOf(ev.target);
          if (!secId) return;
          await handler(sceneId, secId, ev.target);
          this.#rerender();
        });
      });
    };

    bindSectionField('[data-action="setSectionActor"]', async (sc, se, el) => {
      const patch = parseSubjectValue(el.value);
      const scene = SceneData.getScene(sc);
      const section = scene?.sections.find(s => s.id === se);
      const newKey = SceneData.subjectKey(patch);
      // Only when this section is picking a character for the FIRST time (going from no
      // character to one) — not when swapping an already-configured section to a different
      // character — inherit that subject's most recent prior position AND image source in
      // this same timeline, if it's already been staged earlier (works the same whether it's
      // a placed token or a loose Group-member reference). Lets the same character be added
      // again and again (e.g. to step its Scale up bit by bit) without snapping back to
      // defaults each time; the GM would otherwise have to re-drag/re-pick it on every
      // duplicate. If no prior instance of this subject exists yet in this scene, fall back to
      // the disposition-based default (getDefaultImageSource — mobs default to token art,
      // player characters to profile art, see its own comment) instead of always "profile" —
      // a genuinely first-ever appearance of this subject anywhere in the scene.
      if (section && !SceneData.subjectKey(section) && newKey) {
        const myIndex = scene.sections.findIndex(s => s.id === se);
        let foundPrior = false;
        for (let i = myIndex - 1; i >= 0; i--) {
          const prior = scene.sections[i];
          if (prior.type === SECTION_TYPES.CHARACTER && SceneData.subjectKey(prior) === newKey) {
            patch.x = prior.x;
            patch.y = prior.y;
            patch.imageSource = prior.imageSource;
            foundPrior = true;
            break;
          }
        }
        if (!foundPrior) {
          const { tokenDoc, actor } = SceneData.resolveSubject(patch);
          patch.imageSource = SceneData.getDefaultImageSource(tokenDoc, actor);
        }
      }
      await SceneData.updateSection(sc, se, patch);
      // Auto-preview: picking a character here immediately stages them on screen too — same
      // as clicking this row's own Fire button — instead of leaving the stage empty until the
      // GM Fires/Next's/Auto Plays their way to this section. Only when a real character was
      // actually picked; clearing the dropdown back to "-- Select --" has nothing to show.
      if (newKey) {
        const fresh = SceneData.getScene(sc)?.sections.find(s => s.id === se);
        if (fresh) await fireLineSection(fresh, sc);
      }
    });
    // "Character Control" per-field diffing: a field bound this way both saves its new value
    // AND marks itself in the section's touchedFields — so THIS section is known to
    // explicitly set that field, rather than just carrying along whatever value it happened
    // to be created/last-saved with. Only touched fields actually apply when this section
    // fires for a character that's already on stage; everything else is left showing
    // whatever it already was (see scene-data.js's mergeCharacterSection). Every OTHER field
    // below (fadeIn, transitions, obscure duration, etc.) is deliberately plain
    // bindSectionField — those always come straight from whichever section is firing, never
    // diffed, so they don't need touch-tracking at all.
    const bindCharacterField = (selector, field, valueFn) => {
      bindSectionField(selector, (sc, se, el) => {
        const scene = SceneData.getScene(sc);
        const section = scene?.sections.find(s => s.id === se);
        return SceneData.updateSection(sc, se, {
          [field]: valueFn(el),
          touchedFields: SceneData.withTouchedFields(section, field)
        });
      });
    };

    bindSectionField('[data-action="setFadeIn"]', (sc, se, el) =>
      SceneData.updateSection(sc, se, { fadeInMs: Number(el.value) || 0 }));
    bindCharacterField('[data-action="toggleFlipH"]', "flipH", el => el.checked);
    bindCharacterField('[data-action="toggleFlipV"]', "flipV", el => el.checked);
    bindCharacterField('[data-action="setRotation"]', "rotation", el => Number(el.value) || 0);
    bindSectionField('[data-action="toggleTransitionEnabled"]', (sc, se, el) =>
      SceneData.updateSection(sc, se, { transitionEnabled: el.checked }));
    bindSectionField('[data-action="setTransitionType"]', (sc, se, el) =>
      SceneData.updateSection(sc, se, { transitionType: el.value }));
    bindSectionField('[data-action="setTransitionMs"]', (sc, se, el) =>
      SceneData.updateSection(sc, se, { transitionMs: Math.max(0, Number(el.value) || 0) }));
    bindCharacterField('[data-action="setImageSource"]', "imageSource", el => el.value);
    // "change" fires once the slider is released — persists + rerenders, same as every
    // other field here. The live readout while dragging is handled separately below (an
    // "input" listener, cosmetic only, no persistence) so the number updates smoothly
    // without re-rendering the whole panel on every tick.
    bindCharacterField('[data-action="setScale"]', "scale", el => Number(el.value) || 1);
    // Live-sync the slider and its paired number box while either is being dragged/typed —
    // cosmetic only, no persistence tied to this (that's the "change" binding above, which
    // fires once on release/blur and re-renders both from the saved value).
    root.querySelectorAll('[data-action="setScale"]').forEach(el => {
      el.addEventListener("input", ev => {
        const field = ev.target.closest(".fga-sd-scale-field");
        const other = field?.querySelector(
          ev.target.dataset.fgaScalePair === "range" ? '[data-fga-scale-pair="number"]' : '[data-fga-scale-pair="range"]'
        );
        if (other) other.value = ev.target.value;
      });
    });
    // Character Control's checkbox character picker (v2026.09.24.1, replacing a <select>) —
    // see extra.controlTargets in _prepareContext for the checked/disabled computation that
    // makes this single-select. Checking a box selects that subject; unchecking the (only)
    // currently-checked one clears the selection back to none — every other box is rendered
    // disabled while one is picked, so this is the only other state a click can produce.
    bindSectionField('[data-action="toggleCharacterControlActor"]', (sc, se, el) => {
      const key = el.dataset.key;
      if (!key) return;
      return SceneData.updateSection(sc, se, el.checked ? parseSubjectValue(key) : { tokenId: null, actorId: null });
    });
    bindSectionField('[data-action="setLineActor"]', (sc, se, el) =>
      SceneData.updateSection(sc, se, parseSubjectValue(el.value)));
    bindSectionField('[data-action="setLineText"]', (sc, se, el) =>
      SceneData.updateSection(sc, se, { text: el.value }));
    bindSectionField('[data-action="toggleVisibility"]', (sc, se, el) =>
      SceneData.updateSection(sc, se, { visibility: el.checked ? LINE_VISIBILITY.PUBLIC : LINE_VISIBILITY.PRIVATE }));
    bindSectionField('[data-action="toggleBubble"]', (sc, se, el) =>
      SceneData.updateSection(sc, se, { bubbleEnabled: el.checked }));
    // Clear Character: a checkbox per on-stage member (see extra.clearTargets in
    // _prepareContext) rather than a single-select dropdown, so this section can clear
    // several staged characters at once. Adds/removes just the toggled key from the array —
    // never rebuilds the whole list — so two checkboxes clicked in quick succession (before a
    // re-render lands) can't race and stomp each other's change.
    bindSectionField('[data-action="toggleClearCharacterTarget"]', (sc, se, el) => {
      const key = el.dataset.key;
      if (!key) return;
      const scene = SceneData.getScene(sc);
      const section = scene?.sections.find(s => s.id === se);
      const current = Array.isArray(section?.targetKeys) ? section.targetKeys : [];
      const next = el.checked
        ? (current.includes(key) ? current : [...current, key])
        : current.filter(k => k !== key);
      return SceneData.updateSection(sc, se, { targetKeys: next });
    });
    // Stage Character's own image-grid checkboxes — same add/remove-from-array pattern as
    // Clear Character's targets just above, genuinely multi-select (no single-select/disable
    // behavior like Character Control's picker — any number of characters can be checked).
    bindSectionField('[data-action="toggleStageCharacterTarget"]', (sc, se, el) => {
      const key = el.dataset.key;
      if (!key) return;
      const scene = SceneData.getScene(sc);
      const section = scene?.sections.find(s => s.id === se);
      const current = Array.isArray(section?.selectedKeys) ? section.selectedKeys : [];
      const next = el.checked
        ? (current.includes(key) ? current : [...current, key])
        : current.filter(k => k !== key);
      return SceneData.updateSection(sc, se, { selectedKeys: next });
    });
    bindSectionField('[data-action="setStageCharacterThumbScale"]', (sc, se, el) =>
      SceneData.updateSection(sc, se, { thumbScale: Math.max(0.1, Number(el.value) || DEFAULT_STAGE_CHARACTER_THUMB_SCALE) }));
    // Live-resize the grid's thumbnails while dragging the slider — cosmetic only, no
    // persistence tied to this (that's the "change" binding above, same live-preview-then-
    // commit-on-release pattern the per-character Scale slider already uses).
    root.querySelectorAll('[data-action="setStageCharacterThumbScale"]').forEach(el => {
      el.addEventListener("input", ev => {
        const grid = ev.target.closest(".fga-sd-section-details")?.querySelector(".fga-sd-stage-thumb-grid");
        if (grid) grid.style.setProperty("--fga-sd-thumb-scale", ev.target.value);
      });
    });
    bindSectionField('[data-action="setFadeOut"]', (sc, se, el) =>
      SceneData.updateSection(sc, se, { fadeOutMs: Number(el.value) || 0 }));
    bindSectionField('[data-action="toggleBlurEnabled"]', (sc, se, el) =>
      SceneData.updateSection(sc, se, { blurEnabled: el.checked }));
    bindSectionField('[data-action="setBlurAmount"]', (sc, se, el) =>
      SceneData.updateSection(sc, se, { blurAmount: Number(el.value) || 0 }));
    bindSectionField('[data-action="toggleFadeEnabled"]', (sc, se, el) =>
      SceneData.updateSection(sc, se, { fadeEnabled: el.checked }));
    bindSectionField('[data-action="setFadeColor"]', (sc, se, el) =>
      SceneData.updateSection(sc, se, { fadeColor: hexToRgb(el.value) }));
    bindSectionField('[data-action="setFadeOpacity"]', (sc, se, el) =>
      SceneData.updateSection(sc, se, { fadeOpacity: Math.max(0, Math.min(100, Number(el.value) || 0)) / 100 }));
    bindSectionField('[data-action="setEffectDuration"]', (sc, se, el) =>
      SceneData.updateSection(sc, se, { durationMs: Number(el.value) || 0 }));
    bindSectionField('[data-action="setClearEffectDuration"]', (sc, se, el) =>
      SceneData.updateSection(sc, se, { durationMs: Number(el.value) || 0 }));
    bindCharacterField('[data-action="setObscureStyle"]', "obscureStyle", el => el.value);
    bindCharacterField('[data-action="setObscureBlurAmount"]', "obscureBlurAmount", el => Number(el.value) || 0);
    bindSectionField('[data-action="setObscureDuration"]', (sc, se, el) =>
      SceneData.updateSection(sc, se, { obscureDurationMs: Number(el.value) || 0 }));
    bindSectionField('[data-action="setAutoDelayMs"]', (sc, se, el) =>
      SceneData.updateSection(sc, se, { autoDelayMs: Math.max(0, Number(el.value) || 0) }));
  }

  #bindDragAndDrop() {
    const root = this.element;
    const sceneId = this.activeSceneId;
    const items = root.querySelectorAll(".fga-sd-section");
    items.forEach(li => {
      li.addEventListener("dragstart", ev => {
        this.#dragSectionId = li.dataset.sectionId;
        ev.dataTransfer.effectAllowed = "move";
      });
      li.addEventListener("dragover", ev => {
        ev.preventDefault();
        li.classList.add("drag-over");
      });
      li.addEventListener("dragleave", () => li.classList.remove("drag-over"));
      li.addEventListener("drop", async ev => {
        ev.preventDefault();
        li.classList.remove("drag-over");
        if (!this.#dragSectionId || this.#dragSectionId === li.dataset.sectionId) return;
        const targetIndex = Number(li.dataset.index);
        await SceneData.reorderSection(sceneId, this.#dragSectionId, targetIndex);
        this.#dragSectionId = null;
        this.#rerender();
      });
    });
  }

  // ---- static action handlers (bound via DEFAULT_OPTIONS.actions, "this" = app instance) ----

  static async #onNewScene(_event, _target) {
    this.#stopAutoPlay();
    const scene = await SceneData.createScene("New Scene");
    this.activeSceneId = scene.id;
    this.render();
  }

  static #onSelectScene(_event, target) {
    this.#stopAutoPlay();
    this.activeSceneId = target.closest("[data-scene-id]")?.dataset.sceneId ?? this.activeSceneId;
    this.#nextIndex = 0;
    this.render();
  }

  static #onToggleEditorTools() {
    this.editorToolsVisible = !this.editorToolsVisible;
    Hooks.callAll("fgaSceneDirectorEditorToolsVisibility", this.editorToolsVisible);
    this.render();
  }

  static async #onAddCharacter() {
    if (!this.activeSceneId) return;
    const transitionEnabled = game.settings.get(MODULE_ID, SETTINGS.TRANSITION_ENABLED);
    const transitionType = game.settings.get(MODULE_ID, SETTINGS.TRANSITION_TYPE);
    await SceneData.addSection(this.activeSceneId, SceneData.makeSection(SECTION_TYPES.CHARACTER, { transitionEnabled, transitionType }));
    this.#rerender();
  }

  /** "Character Control" — a lighter-weight companion to Add Character; see its own
   *  constants.js/scene-data.js comments. Seeds the same Config Settings transition defaults
   *  a new Character section gets, for the same reason (#onAddCharacter). */
  static async #onAddCharacterControl() {
    if (!this.activeSceneId) return;
    const transitionEnabled = game.settings.get(MODULE_ID, SETTINGS.TRANSITION_ENABLED);
    const transitionType = game.settings.get(MODULE_ID, SETTINGS.TRANSITION_TYPE);
    await SceneData.addSection(this.activeSceneId, SceneData.makeSection(SECTION_TYPES.CHARACTER_CONTROL, { transitionEnabled, transitionType }));
    this.#rerender();
  }

  /** "Stage Character" — the multi-select image-grid alternative to Add Character. No
   *  Config-Settings-seeded defaults to carry over (unlike Add Character/Character Control's
   *  transition settings) since this card has nothing analogous yet. */
  static async #onAddStageCharacter() {
    if (!this.activeSceneId) return;
    await SceneData.addSection(this.activeSceneId, SceneData.makeSection(SECTION_TYPES.STAGE_CHARACTER));
    this.#rerender();
  }

  static async #onAddText() {
    if (!this.activeSceneId) return;
    const defaultVisibility = game.settings.get(MODULE_ID, SETTINGS.DEFAULT_LINE_VISIBILITY);
    await SceneData.addSection(this.activeSceneId, SceneData.makeSection(SECTION_TYPES.LINE, { visibility: defaultVisibility }));
    this.#rerender();
  }

  static async #onAddClearCharacter() {
    if (!this.activeSceneId) return;
    await SceneData.addSection(this.activeSceneId, SceneData.makeSection(SECTION_TYPES.CLEAR_CHARACTER));
    this.#rerender();
  }

  static async #onAddClearText() {
    if (!this.activeSceneId) return;
    await SceneData.addSection(this.activeSceneId, SceneData.makeSection(SECTION_TYPES.CLEAR_TEXT));
    this.#rerender();
  }

  static async #onAddBackgroundEffect() {
    if (!this.activeSceneId) return;
    await SceneData.addSection(this.activeSceneId, SceneData.makeSection(SECTION_TYPES.BACKGROUND_EFFECT));
    this.#rerender();
  }

  static async #onAddClearBackgroundEffect() {
    if (!this.activeSceneId) return;
    await SceneData.addSection(this.activeSceneId, SceneData.makeSection(SECTION_TYPES.CLEAR_BACKGROUND_EFFECT));
    this.#rerender();
  }

  /** Inserts a "Clear Scene" step into the timeline itself — when Next (or its own Fire
   *  button) reaches this section, it wipes every staged portrait/caption/background effect
   *  for the GM and every player, same as the standalone Clear Scene button below, but
   *  scripted into the scene so it can fire automatically at a scripted point (e.g. the end
   *  of the scene) instead of needing the GM to click that button by hand. */
  static async #onAddClearScene() {
    if (!this.activeSceneId) return;
    await SceneData.addSection(this.activeSceneId, SceneData.makeSection(SECTION_TYPES.CLEAR_SCENE));
    this.#rerender();
  }

  /** "Clear Scene": a live-playback reset, NOT a data delete. Wipes whatever's currently
   *  staged/captioned (for the GM and every player) and rewinds the Next pointer back to the
   *  start of this scene's timeline — the timeline's own sections are untouched. For actually
   *  deleting the scene's sections, see "Delete All Sections" (#onDeleteAllSections) below. */
  static #onClearScene() {
    if (!this.activeSceneId) return;
    resetLiveScene();
    this.#nextIndex = 0;
    this.#rerender();
  }

  /** The destructive action the old "Clear Scene" used to perform: wipes every section out
   *  of this scene's timeline (the scene entry itself stays, just empty). */
  static async #onDeleteAllSections() {
    if (!this.activeSceneId) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "FGA_SCENE_DIRECTOR.SceneEditor.DeleteAllSections" },
      content: `<p>Delete every section in this scene's timeline? This can't be undone.</p>`
    });
    if (!confirmed) return;
    this.#stopAutoPlay();
    await SceneData.clearScene(this.activeSceneId);
    this.#nextIndex = 0;
    this.#rerender();
  }

  /** The "X" on a scene in the left-panel list: deletes that whole scene. */
  static async #onDeleteScene(_event, target) {
    const sceneId = target.closest("[data-scene-id]")?.dataset.sceneId;
    if (!sceneId) return;
    const scene = SceneData.getScene(sceneId);
    if (scene?.locked) {
      ui.notifications.warn(game.i18n.localize("FGA_SCENE_DIRECTOR.SceneEditor.SceneLockedNotice"));
      return;
    }
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "FGA_SCENE_DIRECTOR.SceneEditor.DeleteScene" },
      content: `<p>Delete the scene "${scene?.name ?? ""}"? This can't be undone.</p>`
    });
    if (!confirmed) return;
    if (this.activeSceneId === sceneId) this.#stopAutoPlay();
    await SceneData.deleteScene(sceneId);
    if (this.activeSceneId === sceneId) {
      this.activeSceneId = null;
      this.#nextIndex = 0;
    }
    this.render();
  }

  /** The header lock/unlock toggle for the active scene. Locking converts every token-locked
   *  character reference in this scene to an actor-based one (see SceneData.lockScene's own
   *  comment for the full "why") and freezes editing — every SceneData mutating function bails
   *  out while scene.locked is true, so this is the real enforcement, not just a UI nicety; the
   *  editor also greys out and pointer-events:none's the edit controls (see the .fga-sd-locked
   *  CSS in the template) so it's visually obvious, not just silently inert. Requires every
   *  character this scene references to have a real token on the CURRENTLY ACTIVE Foundry
   *  scene right now — refuses (with a notification, nothing changed) rather than locking in a
   *  dangling reference. Unlocking never needs that: it's just clearing a flag. */
  static async #onToggleLockScene() {
    if (!this.activeSceneId) return;
    const scene = SceneData.getScene(this.activeSceneId);
    if (!scene) return;
    if (scene.locked) {
      await SceneData.unlockScene(this.activeSceneId);
      this.#rerender();
      return;
    }
    const result = await SceneData.lockScene(this.activeSceneId);
    if (!result.ok) {
      const count = result.unresolvedTokenIds?.length ?? 0;
      ui.notifications.warn(game.i18n.format("FGA_SCENE_DIRECTOR.SceneEditor.SceneLockFailedNotice", { count }));
      return;
    }
    this.#rerender();
  }

  /** Stages every character that appears anywhere in this scene's timeline, all at once, at
   *  their most recently-configured position/flip/rotate/obscure state — a quick way to
   *  preview the whole cast's look without stepping through the timeline one section at a
   *  time. Broadcasts to every connected client, same as Next/Fire. */
  static #onShowAllCharacters() {
    if (!this.activeSceneId) return;
    const scene = SceneData.getScene(this.activeSceneId);
    if (!scene) return;
    showAllCharacters(scene, this.activeSceneId);
  }

  /** Quick left/center/right placement for a character section, as an alternative to
   *  dragging. Only sets x — y is left as whatever it already was. Acts like a checkbox,
   *  not a plain button: clicking a pos that isn't already remembered sets x AND remembers
   *  it as active (border highlights); clicking the already-remembered one just forgets it
   *  (border reverts) without moving the character — the position it's already at is left
   *  alone. Only one of the three can be remembered at a time. */
  static async #onSetQuickPosition(_event, target) {
    const sectionId = target.closest("[data-section-id]")?.dataset.sectionId;
    if (!sectionId || !this.activeSceneId) return;
    const pos = target.dataset.pos;
    const xByPos = { left: 18, center: 50, right: 82 };
    const x = xByPos[pos];
    if (x === undefined) return;
    const scene = SceneData.getScene(this.activeSceneId);
    const section = scene?.sections.find(s => s.id === sectionId);
    const patch = (section?.activeQuickPosition === pos)
      ? { activeQuickPosition: null } // already remembered — forget it, don't move anything
      : { x, activeQuickPosition: pos, touchedFields: SceneData.withTouchedFields(section, "x") };
    await SceneData.updateSection(this.activeSceneId, sectionId, patch);
    this.#rerender();
  }

  /** 10 Position Lock buttons per character — save/recall a staged spot, keyed by subjectKey
   *  so every Character section for the same character (not just this one instance) shares
   *  the same 10 remembered slots across the whole scene. Mirrors #onSetQuickPosition's
   *  "checkbox, not a plain button" pattern with one extra state on top (empty vs. saved):
   *  - Empty slot clicked: saves this section's CURRENT (x,y) into it and marks it active
   *    (turns red) — nothing moves, since it's already there.
   *  - Saved-but-not-active slot clicked (orange): recalls it — moves this section to the
   *    saved (x,y) and marks it active (turns red).
   *  - Already-active slot clicked again (red): un-marks it (back to orange) only — the
   *    saved data stays put and the section doesn't move. Mirrors quick-position's own
   *    "forget without moving" behavior for re-clicking the active one.
   *  activeLockIndex lives on the SECTION (which slot am I at); the slot's actual (x,y) data
   *  lives on the SCENE per-character (see SceneData.getCharacterLockSlots/setCharacterLockSlot) —
   *  same split as quick-position's per-section flag vs. the fixed left/center/right x values. */
  static async #onSetLock(_event, target) {
    const sectionId = target.closest("[data-section-id]")?.dataset.sectionId;
    if (!sectionId || !this.activeSceneId) return;
    const index = Number(target.dataset.lockIndex);
    if (!Number.isInteger(index)) return;
    const scene = SceneData.getScene(this.activeSceneId);
    const section = scene?.sections.find(s => s.id === sectionId);
    if (!section) return;
    const key = SceneData.subjectKey(section);
    if (!key) return;

    if (section.activeLockIndex === index) {
      // Already active — un-mark only, leave saved data and position alone.
      await SceneData.updateSection(this.activeSceneId, sectionId, { activeLockIndex: null });
      this.#rerender();
      return;
    }

    const slots = SceneData.getCharacterLockSlots(scene, key);
    const saved = slots[index];
    if (saved) {
      // Saved slot — recall it.
      await SceneData.updateSection(this.activeSceneId, sectionId, {
        x: saved.x,
        y: saved.y,
        activeLockIndex: index,
        touchedFields: SceneData.withTouchedFields(section, "x", "y")
      });
    } else if (section.type === SECTION_TYPES.CHARACTER) {
      // Empty slot — save current position into it. Character Control sections have no
      // position of their own (see makeSection's CHARACTER_CONTROL case) — their empty lock
      // buttons are already rendered disabled (_prepareContext's extra.locks), but guard here
      // too rather than trusting the DOM attribute alone.
      await SceneData.setCharacterLockSlot(this.activeSceneId, key, index, { x: section.x, y: section.y });
      await SceneData.updateSection(this.activeSceneId, sectionId, { activeLockIndex: index });
    }
    this.#rerender();
  }

  /** The red "clear" button next to the 10 numbered lock slots — deletes the saved position
   *  from whichever slot is CURRENTLY active (red) for this section, and un-marks it. The
   *  numbered buttons alone can only save into an empty slot, recall a saved one, or un-mark
   *  the active one WITHOUT touching its data (#onSetLock above) — this is the only way to
   *  actually remove a saved spot. A no-op (and the button stays disabled — see
   *  extra.hasActiveLock in _prepareContext) when this section has no active lock right now. */
  static async #onClearActiveLock(_event, target) {
    const sectionId = target.closest("[data-section-id]")?.dataset.sectionId;
    if (!sectionId || !this.activeSceneId) return;
    const scene = SceneData.getScene(this.activeSceneId);
    const section = scene?.sections.find(s => s.id === sectionId);
    if (!section || !Number.isInteger(section.activeLockIndex)) return;
    const key = SceneData.subjectKey(section);
    if (!key) return;
    await SceneData.clearCharacterLockSlot(this.activeSceneId, key, section.activeLockIndex);
    await SceneData.updateSection(this.activeSceneId, sectionId, { activeLockIndex: null });
    this.#rerender();
  }

  /** Foundry's Group actor type stores its party roster as `system.members`, an array of
   *  { actor, quantity } entries where `.actor` is the resolved Actor document (not just a
   *  UUID string) — confirmed live against a real "Party of the Whisteling Wind" group actor.
   *  `quantity` isn't populated by every system/version, so it's read defensively and unused
   *  here. Duplicate member actors (same actor listed twice) are deduped, keeping the first. */
  static #getGroupMemberActors(groupActor) {
    const raw = groupActor?.system?.members ?? [];
    const seen = new Set();
    const actors = [];
    for (const entry of raw) {
      const memberActor = entry?.actor;
      if (!memberActor || seen.has(memberActor.id)) continue;
      seen.add(memberActor.id);
      actors.push(memberActor);
    }
    return actors;
  }

  /** Expand a Group-actor Character section into one Character section per member — the
   *  whole point of "add more types" for Group actors, since staging a party actor as a
   *  single portrait isn't useful; the GM wants the individual members on stage. Only
   *  members that already have a token placed on THIS scene can be added (every Character
   *  section is keyed by tokenId, not actorId, throughout the module), so a member with no
   *  token here is skipped and named in the confirmation notification rather than silently
   *  dropped or auto-placed (auto-placing a token is a bigger, separate decision about where
   *  on the board it should land). New sections inherit position the same way a manually
   *  re-added duplicate Character section does (see setSectionActor's inherit-position
   *  logic) and are inserted right after the Group's own section, not appended at the end,
   *  so the timeline reads in the order the GM triggered the expansion. */
  static async #onExpandGroup(_event, target) {
    const sectionId = target.closest("[data-section-id]")?.dataset.sectionId;
    if (!sectionId || !this.activeSceneId) return;
    const scene = SceneData.getScene(this.activeSceneId);
    const section = scene?.sections.find(s => s.id === sectionId);
    if (!section?.tokenId) return;
    const groupToken = canvas.scene?.tokens.get(section.tokenId);
    const groupActor = groupToken?.actor;
    if (groupActor?.type !== "group") return;

    const members = SceneEditorApp.#getGroupMemberActors(groupActor);
    if (!members.length) {
      ui.notifications?.warn(game.i18n.format("FGA_SCENE_DIRECTOR.SceneEditor.ExpandGroupEmpty", { name: groupActor.name }));
      return;
    }

    const tokenByActorId = new Map();
    for (const tokenDoc of canvas.scene.tokens) {
      if (!tokenDoc.actor || tokenByActorId.has(tokenDoc.actor.id)) continue;
      tokenByActorId.set(tokenDoc.actor.id, tokenDoc);
    }

    const groupIndex = scene.sections.findIndex(s => s.id === sectionId);
    const newSections = [];
    const skipped = [];
    const usedTokenIds = new Set();
    for (const memberActor of members) {
      const memberToken = tokenByActorId.get(memberActor.id);
      if (!memberToken || usedTokenIds.has(memberToken.id)) {
        skipped.push(memberActor.name);
        continue;
      }
      usedTokenIds.add(memberToken.id);
      const extra = { tokenId: memberToken.id };
      // Same "inherit last known position (and image source) for this token" behavior as
      // manually picking a character for a fresh section — search backward from the Group
      // section itself. No prior instance found means a genuinely first-ever appearance for
      // this member, so fall back to the disposition-based default (getDefaultImageSource)
      // instead of always "profile".
      let foundPrior = false;
      for (let i = groupIndex - 1; i >= 0; i--) {
        const prior = scene.sections[i];
        if (prior.type === SECTION_TYPES.CHARACTER && prior.tokenId === memberToken.id) {
          extra.x = prior.x;
          extra.y = prior.y;
          extra.activeQuickPosition = prior.activeQuickPosition ?? null;
          extra.imageSource = prior.imageSource;
          foundPrior = true;
          break;
        }
      }
      if (!foundPrior) extra.imageSource = SceneData.getDefaultImageSource(memberToken, memberActor);
      newSections.push(SceneData.makeSection(SECTION_TYPES.CHARACTER, extra));
    }

    if (newSections.length) {
      await SceneData.insertSectionsAfter(this.activeSceneId, sectionId, newSections);
    }

    const summary = game.i18n.format("FGA_SCENE_DIRECTOR.SceneEditor.ExpandGroupResult", {
      added: newSections.length,
      total: members.length
    });
    if (skipped.length) {
      ui.notifications?.warn(`${summary} ${game.i18n.format("FGA_SCENE_DIRECTOR.SceneEditor.ExpandGroupSkipped", { names: skipped.join(", ") })}`);
    } else {
      ui.notifications?.info(summary);
    }
    this.#rerender();
  }

  static async #onDeleteSection(_event, target) {
    const sectionId = target.closest("[data-section-id]")?.dataset.sectionId;
    if (!sectionId || !this.activeSceneId) return;
    await SceneData.deleteSection(this.activeSceneId, sectionId);
    this.#rerender();
  }

  /** Pause section's own "skip in Auto Play" toggle — turns yellow when on. See #autoStep's
   *  own PAUSE branch for what this actually does during a run: bypasses the halt entirely
   *  instead of stopping there for the GM to click Continue. Never affects manual Next/Fire,
   *  which already treat every Pause as an inert no-op regardless. */
  static #onToggleSkipInAutoPlay(_event, target) {
    const sectionId = target.closest("[data-section-id]")?.dataset.sectionId;
    if (!sectionId || !this.activeSceneId) return;
    const scene = SceneData.getScene(this.activeSceneId);
    const section = scene?.sections.find(s => s.id === sectionId);
    if (!section) return;
    SceneData.updateSection(this.activeSceneId, sectionId, { skipInAutoPlay: !section.skipInAutoPlay }).then(() => this.#rerender());
  }

  static #onToggleCollapse(_event, target) {
    const li = target.closest("[data-section-id]");
    const sectionId = li?.dataset.sectionId;
    if (!sectionId || !this.activeSceneId) return;
    const scene = SceneData.getScene(this.activeSceneId);
    const section = scene?.sections.find(s => s.id === sectionId);
    if (!section) return;
    SceneData.updateSection(this.activeSceneId, sectionId, { collapsed: !section.collapsed }).then(() => this.#rerender());
  }

  static async #onFireSection(_event, target) {
    const sectionId = target.closest("[data-section-id]")?.dataset.sectionId;
    if (!sectionId || !this.activeSceneId) return;
    const scene = SceneData.getScene(this.activeSceneId);
    const section = scene?.sections.find(s => s.id === sectionId);
    if (section) await fireLineSection(section, this.activeSceneId);
  }

  static async #onNextSection() {
    if (!this.activeSceneId) return;
    const scene = SceneData.getScene(this.activeSceneId);
    if (!scene || !scene.sections.length) return;
    if (this.#nextIndex >= scene.sections.length) this.#nextIndex = 0; // loop back around
    const section = scene.sections[this.#nextIndex];
    await playSection(section, this.activeSceneId);
    this.#nextIndex += 1;
    this.#rerender();
  }

  /** Auto Play: repeats "Next" automatically, pacing itself by each section's own tunable
   *  "auto-delay" number box, until the scene runs out of sections or the GM clicks Stop. A
   *  Pause ("Scene Controls") section halts the whole thing — instead of auto-advancing past
   *  it on a timer like everything else, it just sits there (as the highlighted "next up" row)
   *  until the GM clicks the big Continue banner. Toggled by the header button added to the
   *  left of the existing Next button. */
  static #onToggleAutoPlay() {
    if (this.#autoActive) this.#stopAutoPlay();
    else this.#startAutoPlay();
  }

  #startAutoPlay() {
    if (!this.activeSceneId) return;
    const scene = SceneData.getScene(this.activeSceneId);
    if (!scene || !scene.sections.length) return;
    if (this.#nextIndex >= scene.sections.length) this.#nextIndex = 0; // loop back around, same as manual Next
    this.#autoActive = true;
    this.#autoPaused = false;
    this.#rerender();
    this.#autoStep();
  }

  /** Stops Auto Play wherever it currently is — mid-wait or halted at a Pause — and cancels
   *  any pending step so a queued timer can't fire after the fact. Safe to call even when
   *  Auto Play isn't running. Doesn't touch #nextIndex: Next/Auto Play share one pointer, so
   *  stopping leaves it wherever Auto Play got to, ready to resume (manually or via Auto Play
   *  again) from that same spot. */
  #stopAutoPlay() {
    if (this.#autoTimer) {
      clearTimeout(this.#autoTimer);
      this.#autoTimer = null;
    }
    if (!this.#autoActive && !this.#autoPaused) return; // nothing changed, skip the re-render
    this.#autoActive = false;
    this.#autoPaused = false;
    if (this.rendered) this.#rerender();
  }

  /** One Auto Play tick: fire the current section (or halt, if it's a Pause), then either
   *  queue the next tick after that section's own auto-delay, or stop if the scene's done.
   *  Where the delay actually happens — waiting AFTER this section fires (before the next
   *  one), or BEFORE this section fires — is a world-scoped GM choice (Config Settings'
   *  "Auto Play timing," SETTINGS.AUTO_DELAY_ORDER); action-then-timer is the original/
   *  default behavior. Guards on #autoActive at both the top and after the (async) fire, so a
   *  Stop click that lands mid-fire or mid-wait cleanly aborts instead of racing the next step
   *  in anyway. Kept as an instance method (not exposed as a bound action) — only
   *  #onToggleAutoPlay/#onAutoContinue below start it; nothing in the template calls it
   *  directly. */
  async #autoStep() {
    if (!this.#autoActive) return;
    const scene = this.activeSceneId ? SceneData.getScene(this.activeSceneId) : null;
    if (!scene || this.#nextIndex >= scene.sections.length) {
      this.#autoActive = false;
      this.#autoPaused = false;
      if (this.rendered) this.#rerender();
      return;
    }
    const section = scene.sections[this.#nextIndex];
    if (section.type === SECTION_TYPES.PAUSE) {
      if (section.skipInAutoPlay) {
        // GM has this Pause's own "skip in Auto Play" toggle on (yellow) — bypass the halt
        // entirely, as if this section weren't here at all: advance past it (nothing to fire
        // — a Pause has no visual effect either way) and continue immediately.
        this.#nextIndex += 1;
        if (this.rendered) this.#rerender();
        if (this.#nextIndex >= scene.sections.length) {
          this.#autoActive = false;
          if (this.rendered) this.#rerender();
          return;
        }
        this.#autoStep();
        return;
      }
      // Halt WITHOUT advancing the pointer — the Pause section itself stays "next up" so the
      // timeline visibly shows where/why playback stopped. #onAutoContinue steps past it.
      // Unaffected by the timing-order setting either way — a Pause always halts immediately.
      this.#autoPaused = true;
      if (this.rendered) this.#rerender();
      return;
    }
    const delay = Math.max(0, Number(section.autoDelayMs) || 0);
    const timerFirst = game.settings.get(MODULE_ID, SETTINGS.AUTO_DELAY_ORDER) === AUTO_DELAY_ORDER.TIMER_THEN_ACTION;
    if (timerFirst && delay > 0) {
      // Wait THIS section's own delay first, then fire it, then move on right away — the
      // wait already happened up front, so there's no second wait after firing.
      this.#autoTimer = setTimeout(() => {
        this.#autoTimer = null;
        this.#fireAndAdvance(section, 0);
      }, delay);
      return;
    }
    // Action-then-timer (default): fire now, wait this section's own delay before the NEXT
    // step. Also covers timer-first with a 0ms delay — nothing to wait for either way.
    await this.#fireAndAdvance(section, timerFirst ? 0 : delay);
  }

  /** Fires one section, then either queues the next Auto Play tick after `trailingDelayMs` or
   *  advances immediately if it's 0 — the part shared by both timing orders in #autoStep
   *  above. Guards on #autoActive both before and after the (async) fire, same reasoning as
   *  #autoStep. */
  async #fireAndAdvance(section, trailingDelayMs) {
    await playSection(section, this.activeSceneId);
    if (!this.#autoActive) return; // stopped while that section's own async work was running
    this.#nextIndex += 1;
    if (this.rendered) this.#rerender();
    const scene = this.activeSceneId ? SceneData.getScene(this.activeSceneId) : null;
    if (!scene || this.#nextIndex >= scene.sections.length) {
      this.#autoActive = false;
      if (this.rendered) this.#rerender();
      return;
    }
    if (trailingDelayMs > 0) {
      this.#autoTimer = setTimeout(() => {
        this.#autoTimer = null;
        this.#autoStep();
      }, trailingDelayMs);
    } else {
      this.#autoStep();
    }
  }

  /** The big banner button shown only while Auto Play is halted at a Pause section. GM-only
   *  by construction, same as everything else in this window (see main.js: the Scene Editor
   *  is never opened for a non-GM at all). */
  static #onAutoContinue() {
    if (!this.#autoPaused || !this.#autoActive) return;
    this.#autoPaused = false;
    this.#nextIndex += 1; // now actually step past the Pause section
    if (this.rendered) this.#rerender();
    this.#autoStep();
  }

  /** Footer "Add Scene Controls" button: inserts a Pause section — see SECTION_TYPES.PAUSE. */
  static async #onAddSceneControls() {
    if (!this.activeSceneId) return;
    await SceneData.addSection(this.activeSceneId, SceneData.makeSection(SECTION_TYPES.PAUSE));
    this.#rerender();
  }

  /** Called by main.js when the Scene Editor Window opens/closes, to drive toolbar/floating-button coloring. */
  static async setOpenState(open) {
    await game.settings.set(MODULE_ID, SETTINGS.EDITOR_WINDOW_OPEN, open);
    Hooks.callAll("fgaSceneDirectorWindowState", open);
  }

  async close(options) {
    await SceneEditorApp.setOpenState(false);
    return super.close(options);
  }

  async _onFirstRender(context, options) {
    await super._onFirstRender?.(context, options);
    // Open centered in the viewport, per spec.
    const w = this.position.width ?? 720;
    const h = this.position.height ?? 560;
    this.setPosition({
      left: Math.max(0, (window.innerWidth - w) / 2),
      top: Math.max(0, (window.innerHeight - h) / 2)
    });
    await SceneEditorApp.setOpenState(true);
  }
}
