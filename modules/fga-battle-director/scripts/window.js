import { MODULE_ID, SETTINGS, FLAGS, STATE, PLACEMENT_LABELS, PLACEMENT_HINTS } from "./constants.js";
import * as Battle from "./battle.js";
import * as Maps from "./maps.js";
import { TRANSITION_LABELS } from "./transition-draw.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** A PC token whose player is online right now (not the GM). */
function isActivePlayerToken(t) {
  const actor = t.actor;
  if (!actor?.hasPlayerOwner) return false;
  return game.users.some(u => !u.isGM && u.active && actor.testUserPermission?.(u, "OWNER"));
}

export class BattleWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  static instance = null;

  #battleId = null;
  #checked = new Set();
  #checkedScene = null;
  #placement = null;
  #transition = null;
  #pull = true;
  #pickHandler = null;
  #viewedFrom = null;
  #tab = "battle";
  #groupChecked = new Set();
  #groupCheckedScene = null;
  #extractGroup = null;
  #deleteGroup = null;

  static DEFAULT_OPTIONS = {
    id: "fga-battle-director-window",
    classes: ["fga-bd"],
    tag: "div",
    window: { title: "GM Battle", icon: "fa-solid fa-shield-halved", resizable: true },
    position: { width: 820, height: 680 },
    actions: {
      setTab: BattleWindow.onSetTab,
      stageScene: BattleWindow.onStageScene,
      unstageScene: BattleWindow.onUnstageScene,
      viewScene: BattleWindow.onViewScene,
      backToView: BattleWindow.onBackToView,
      setStart: BattleWindow.onSetStart,
      selectAll: BattleWindow.onSelectAll,
      selectNone: BattleWindow.onSelectNone,
      selectPCs: BattleWindow.onSelectPCs,
      goHere: BattleWindow.onGoHere,
      goHereStart: BattleWindow.onGoHereStart,
      startBattle: BattleWindow.onStartBattle,
      stopBattle: BattleWindow.onStopBattle,
      returnBoard: BattleWindow.onReturnBoard,
      makeFromImage: BattleWindow.onMakeFromImage,
      importFolder: BattleWindow.onImportFolder,
      loadBundled: BattleWindow.onLoadBundled,
      sendGroup: BattleWindow.onSendGroup
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/battle-window.hbs`,
      scrollable: [".fga-bd-scroll"]
    }
  };

  /* ---------- open / close ---------- */

  static open() {
    if (!game.user.isGM) return null;
    this.instance ??= new BattleWindow();
    this.instance.render({ force: true });
    return this.instance;
  }

  static toggle() {
    if (this.instance?.rendered) return this.instance.close();
    return this.open();
  }

  static refresh() {
    if (this.instance?.rendered) this.instance.render();
  }

  async _onClose(options) {
    this.#clearPick();
    return super._onClose?.(options);
  }

  /* ---------- data ---------- */

  async _prepareContext(options) {
    const current = canvas.scene ?? null;
    const staged = Battle.getStagedIds()
      .map(id => game.scenes.get(id))
      .filter(Boolean);
    const stagedIds = new Set(staged.map(s => s.id));

    if (!this.#placement) this.#placement = game.settings.get(MODULE_ID, SETTINGS.PLACEMENT);
    if (!this.#transition) this.#transition = game.settings.get(MODULE_ID, SETTINGS.TRANSITION);
    if (this.#extractGroup === null) this.#extractGroup = game.settings.get(MODULE_ID, SETTINGS.EXTRACT_GROUP);
    if (this.#deleteGroup === null) this.#deleteGroup = game.settings.get(MODULE_ID, SETTINGS.DELETE_GROUP);
    if (!stagedIds.has(this.#battleId)) {
      this.#battleId = (staged.find(s => s.id !== current?.id) ?? staged[0])?.id ?? null;
    }

    const battlefields = staged.map(s => ({
      id: s.id,
      name: s.name,
      thumb: s.thumb || "icons/svg/mountain.svg",
      hasStart: !!Battle.getStartPoint(s),
      isCurrent: s.id === current?.id,
      selected: s.id === this.#battleId,
      frozen: Battle.getSceneState(s) === STATE.FROZEN,
      live: Battle.getSceneState(s) === STATE.ACTIVE
    }));

    const available = game.scenes.contents
      .filter(s => !stagedIds.has(s.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(s => ({ id: s.id, name: s.name }));

    let tokens = [];
    let groups = [];
    if (current) {
      // Group tokens (the wagon, the party icon) get their own tab, so they
      // don't show up here and can't be double-picked as an "individual".
      if (this.#checkedScene !== current.id) {
        this.#checkedScene = current.id;
        this.#checked = new Set(
          current.tokens.filter(t => t.actor?.type !== "group" && isActivePlayerToken(t)).map(t => t.id)
        );
      } else {
        for (const id of [...this.#checked]) if (!current.tokens.has(id)) this.#checked.delete(id);
      }
      tokens = current.tokens
        .filter(t => t.actor?.type !== "group")
        .map(t => ({
          id: t.id,
          name: t.name || t.actor?.name || "Token",
          img: t.texture?.src || "icons/svg/mystery-man.svg",
          checked: this.#checked.has(t.id),
          isPC: !!t.actor?.hasPlayerOwner
        }))
        .sort((a, b) => Number(b.isPC) - Number(a.isPC) || a.name.localeCompare(b.name));

      if (this.#groupCheckedScene !== current.id) {
        this.#groupCheckedScene = current.id;
        this.#groupChecked = new Set();
      } else {
        for (const id of [...this.#groupChecked]) if (!current.tokens.has(id)) this.#groupChecked.delete(id);
      }
      groups = Battle.getGroupTokens(current)
        .map(t => {
          const count = Battle.getGroupMembers(t.actor).length;
          return {
            id: t.id,
            name: t.name || t.actor?.name || "Group",
            img: t.texture?.src || "icons/svg/mystery-man.svg",
            checked: this.#groupChecked.has(t.id),
            memberLabel: count === 1 ? "1 member" : `${count} members`
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    const battle = battlefields.find(b => b.selected) ?? null;
    const state = Battle.getSceneState(current);
    const canGoHere = !!(current && battle && !battle.isCurrent);
    const canReturn = Battle.returnableTokens(current).length > 0;
    const canStop = !!(current && state);

    // Back home already (or the remembered board is gone) — nothing to go back to.
    if (this.#viewedFrom && (!current || current.id === this.#viewedFrom || !game.scenes.get(this.#viewedFrom))) {
      this.#viewedFrom = null;
    }
    const canBackToView = !!this.#viewedFrom;

    let banner = null;
    if (state === STATE.FROZEN) {
      banner = {
        cls: "frozen",
        icon: "fa-solid fa-lock",
        text: `No movement on ${current.name}. Nobody can move or roll initiative until you click Start Battle.`
      };
    } else if (state === STATE.ACTIVE) {
      banner = { cls: "live", icon: "fa-solid fa-lock-open", text: `Free movement on ${current.name}. The battle is live.` };
    }

    return {
      hasScene: !!current,
      currentName: current?.name ?? "",
      battlefields,
      available,
      tokens,
      checkedCount: this.#checked.size,
      tab: this.#tab,
      tabBattle: this.#tab === "battle",
      tabGroups: this.#tab === "groups",
      groups,
      groupCheckedCount: this.#groupChecked.size,
      extractGroup: this.#extractGroup,
      deleteGroup: this.#deleteGroup,
      noGroups: groups.length === 0,
      placementOptions: Object.entries(PLACEMENT_LABELS).map(([value, label]) => ({
        value,
        label,
        selected: value === this.#placement
      })),
      placementHint: PLACEMENT_HINTS[this.#placement] ?? "",
      transitionOptions: Object.entries(TRANSITION_LABELS).map(([value, label]) => ({
        value,
        label,
        selected: value === this.#transition
      })),
      pull: this.#pull,
      banner,
      canReturn,
      canGoHere,
      canStop,
      canBackToView,
      noBattlefields: staged.length === 0
    };
  }

  /* ---------- live inputs (no re-render, keeps scroll) ---------- */

  _onRender(context, options) {
    super._onRender?.(context, options);
    const el = this.element;

    el.querySelectorAll("input[data-token]").forEach(input => {
      input.addEventListener("change", ev => {
        const id = ev.currentTarget.dataset.token;
        if (ev.currentTarget.checked) this.#checked.add(id);
        else this.#checked.delete(id);
        this.render();
      });
    });

    el.querySelectorAll("input[name='battle']").forEach(input => {
      input.addEventListener("change", ev => {
        this.#battleId = ev.currentTarget.value;
        this.render();
      });
    });

    // Clicking anywhere on a battlefield card picks it, not just the tiny radio dot.
    const battlefieldCards = [...el.querySelectorAll(".fga-bd-card")];
    battlefieldCards.forEach(card => {
      card.addEventListener("click", ev => {
        if (ev.target.closest("button, input, .fga-bd-drag-handle")) return;
        const radio = card.querySelector("input[name='battle']");
        if (radio && !radio.disabled && !radio.checked) {
          radio.checked = true;
          radio.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
    });

    // Drag the grip handle to reorder the Battlefields list.
    let dragSceneId = null;
    battlefieldCards.forEach(card => {
      card.addEventListener("dragstart", ev => {
        if (!ev.target.closest(".fga-bd-drag-handle")) {
          ev.preventDefault();
          return;
        }
        dragSceneId = card.dataset.scene;
        ev.dataTransfer.effectAllowed = "move";
        ev.dataTransfer.setData("text/plain", dragSceneId ?? "");
        card.classList.add("dragging");
      });
      card.addEventListener("dragend", () => {
        dragSceneId = null;
        battlefieldCards.forEach(c => c.classList.remove("dragging", "drag-over-top", "drag-over-bottom"));
      });
      card.addEventListener("dragover", ev => {
        if (!dragSceneId || card.dataset.scene === dragSceneId) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = "move";
        const rect = card.getBoundingClientRect();
        const before = ev.clientY < rect.top + rect.height / 2;
        card.classList.toggle("drag-over-top", before);
        card.classList.toggle("drag-over-bottom", !before);
      });
      card.addEventListener("dragleave", () => {
        card.classList.remove("drag-over-top", "drag-over-bottom");
      });
      card.addEventListener("drop", async ev => {
        ev.preventDefault();
        const draggedId = ev.dataTransfer.getData("text/plain") || dragSceneId;
        const targetId = card.dataset.scene;
        const before = card.classList.contains("drag-over-top");
        card.classList.remove("drag-over-top", "drag-over-bottom");
        dragSceneId = null;
        if (!draggedId || draggedId === targetId) return;
        const order = battlefieldCards.map(c => c.dataset.scene).filter(id => id !== draggedId);
        const idx = order.indexOf(targetId);
        order.splice(before ? idx : idx + 1, 0, draggedId);
        try {
          await Battle.setStagedOrder(order);
        } catch (err) {
          console.error(`${MODULE_ID} | reorder failed`, err);
        }
        this.render();
      });
    });

    el.querySelector("select[name='placement']")?.addEventListener("change", async ev => {
      this.#placement = ev.currentTarget.value;
      await game.settings.set(MODULE_ID, SETTINGS.PLACEMENT, this.#placement);
      this.render();
    });

    el.querySelector("select[name='transition']")?.addEventListener("change", async ev => {
      this.#transition = ev.currentTarget.value;
      await game.settings.set(MODULE_ID, SETTINGS.TRANSITION, this.#transition);
    });

    el.querySelector("input[name='pull']")?.addEventListener("change", ev => (this.#pull = ev.currentTarget.checked));

    el.querySelectorAll("input[data-group]").forEach(input => {
      input.addEventListener("change", ev => {
        const id = ev.currentTarget.dataset.group;
        if (ev.currentTarget.checked) this.#groupChecked.add(id);
        else this.#groupChecked.delete(id);
        this.render();
      });
    });

    el.querySelector("input[name='extractGroup']")?.addEventListener("change", async ev => {
      this.#extractGroup = ev.currentTarget.checked;
      await game.settings.set(MODULE_ID, SETTINGS.EXTRACT_GROUP, this.#extractGroup);
      this.render();
    });

    el.querySelector("input[name='deleteGroup']")?.addEventListener("change", async ev => {
      this.#deleteGroup = ev.currentTarget.checked;
      await game.settings.set(MODULE_ID, SETTINGS.DELETE_GROUP, this.#deleteGroup);
    });
  }

  /* ---------- actions (this = the window) ---------- */

  static onSetTab(event, target) {
    this.#tab = target.dataset.tab === "groups" ? "groups" : "battle";
    this.render();
  }

  static async onStageScene() {
    const select = this.element.querySelector("select[name='stageScene']");
    if (!select?.value) return;
    await Battle.stageScene(select.value);
    this.#battleId = select.value;
    this.render();
  }

  static async onUnstageScene(event, target) {
    await Battle.unstageScene(target.dataset.scene);
    this.render();
  }

  /** Look at a battlefield (e.g. to set its start spot) without pulling anyone. Remembers where you came from. */
  static async onViewScene(event, target) {
    const scene = game.scenes.get(target.dataset.scene);
    if (!scene) return;
    // Only remember "home" the first time you wander off, so hopping
    // between several battlefields to check them still gets you back to
    // where you actually started, not the last one you viewed.
    if (canvas.scene && canvas.scene.id !== scene.id && !this.#viewedFrom) {
      this.#viewedFrom = canvas.scene.id;
    }
    await scene.view();
    this.render();
  }

  /** Jump back to the board you were on before you started clicking View. */
  static async onBackToView() {
    const sceneId = this.#viewedFrom;
    this.#viewedFrom = null;
    if (!sceneId) return;
    const scene = game.scenes.get(sceneId);
    if (scene) await scene.view();
    this.render();
  }

  static async onSetStart(event, target) {
    const scene = game.scenes.get(target.dataset.scene);
    if (!scene) return;
    if (canvas.scene?.id !== scene.id) {
      ui.notifications.warn("Click View on that battlefield first, then set the start spot.");
      return;
    }
    this.#clearPick();
    ui.notifications.info("Click the map where the party should start.");
    await this.minimize();
    this.#pickHandler = async ev => {
      this.#pickHandler = null;
      if (ev.button !== 0) {
        await this.maximize();
        return;
      }
      let point = ev.getLocalPosition(canvas.stage);
      try {
        point = canvas.grid.getSnappedPoint(
          { x: point.x, y: point.y },
          { mode: CONST.GRID_SNAPPING_MODES.TOP_LEFT_VERTEX }
        );
      } catch (err) {
        point = { x: Math.round(point.x), y: Math.round(point.y) };
      }
      await scene.setFlag(MODULE_ID, FLAGS.START, { x: point.x, y: point.y });
      ui.notifications.info(`Start spot saved for ${scene.name}.`);
      await this.maximize();
      this.render();
    };
    canvas.stage.once("pointerdown", this.#pickHandler);
  }

  static onSelectAll() {
    const scene = canvas.scene;
    if (!scene) return;
    this.#checked = new Set(scene.tokens.filter(t => t.actor?.type !== "group").map(t => t.id));
    this.render();
  }

  static onSelectNone() {
    this.#checked = new Set();
    this.render();
  }

  static onSelectPCs() {
    const scene = canvas.scene;
    if (!scene) return;
    this.#checked = new Set(
      scene.tokens.filter(t => t.actor?.type !== "group" && t.actor?.hasPlayerOwner).map(t => t.id)
    );
    this.render();
  }

  #needsTokens() {
    if (this.#checked.size > 0) return false;
    ui.notifications.warn("Pick at least one character first.");
    return true;
  }

  #needsGroups() {
    if (this.#groupChecked.size > 0) return false;
    ui.notifications.warn("Pick at least one group first.");
    return true;
  }

  /** Move the ticked tokens to the picked battlefield with no movement there yet. No combat yet. */
  static async onGoHere() {
    const current = canvas.scene;
    if (!current || !this.#battleId) return;
    if (this.#checked.size === 0) {
      const proceed = await foundry.applications.api.DialogV2.confirm({
        window: { title: "No token selected" },
        content: "<p>No actor token selected. Are you sure?</p>"
      });
      if (!proceed) return;
    }
    try {
      await Battle.sendToBattle({
        originSceneId: current.id,
        destSceneId: this.#battleId,
        tokenIds: [...this.#checked],
        placement: this.#placement,
        pull: this.#pull,
        freeze: true,
        makeCombat: false,
        transition: this.#transition
      });
    } catch (err) {
      console.error(`${MODULE_ID} | go here failed`, err);
      ui.notifications.error(`FGA Battle Director: ${err.message}`);
    }
    this.render();
  }

  /** Move the ticked tokens to the picked battlefield with no movement, set up combat, then start it right away. */
  static async onGoHereStart() {
    const current = canvas.scene;
    const destId = this.#battleId;
    if (!current || !destId) return;
    if (this.#needsTokens()) return;
    try {
      await Battle.sendToBattle({
        originSceneId: current.id,
        destSceneId: destId,
        tokenIds: [...this.#checked],
        placement: this.#placement,
        pull: this.#pull,
        freeze: true,
        makeCombat: true,
        transition: this.#transition
      });
      const dest = game.scenes.get(destId);
      if (dest) await Battle.startBattle(dest);
    } catch (err) {
      console.error(`${MODULE_ID} | go here and start failed`, err);
      ui.notifications.error(`FGA Battle Director: ${err.message}`);
    }
    this.render();
  }

  /** Start a fight right where the party already is, using the ticked tokens. No travel. */
  static async onStartBattle() {
    const scene = canvas.scene;
    if (!scene) return;
    if (this.#needsTokens()) return;
    try {
      await Battle.startBattleHere({ sceneId: scene.id, tokenIds: [...this.#checked] });
    } catch (err) {
      console.error(`${MODULE_ID} | start failed`, err);
      ui.notifications.error(`FGA Battle Director: ${err.message}`);
    }
    this.render();
  }

  /** End the battle right here: turn movement/initiative back on and clear the combat, but leave tokens where they stand. */
  static async onStopBattle() {
    const scene = canvas.scene;
    if (!scene) return;
    try {
      await Battle.stopBattle(scene, { endCombat: true });
    } catch (err) {
      console.error(`${MODULE_ID} | stop battle failed`, err);
      ui.notifications.error(`FGA Battle Director: ${err.message}`);
    }
    this.render();
  }

  static async onReturnBoard() {
    const scene = canvas.scene;
    if (!scene) return;
    try {
      await Battle.returnToBoard(scene, { endCombat: true, pull: this.#pull, transition: this.#transition });
    } catch (err) {
      console.error(`${MODULE_ID} | return failed`, err);
      ui.notifications.error(`FGA Battle Director: ${err.message}`);
    }
    this.render();
  }

  /** Send the checked group(s) to the picked battlefield's start spot. Members always pop out around it; with Delete on, the group token is then removed. */
  static async onSendGroup() {
    const current = canvas.scene;
    if (!current || !this.#battleId) return;
    if (this.#needsGroups()) return;
    try {
      await Battle.sendGroupsToBattle({
        originSceneId: current.id,
        destSceneId: this.#battleId,
        tokenIds: [...this.#groupChecked],
        extract: this.#extractGroup,
        deleteGroup: this.#deleteGroup,
        pull: this.#pull,
        transition: this.#transition
      });
    } catch (err) {
      console.error(`${MODULE_ID} | send group failed`, err);
      ui.notifications.error(`FGA Battle Director: ${err.message}`);
    }
    this.render();
  }

  static async onMakeFromImage() {
    const result = await Maps.makeFromImage();
    if (result?.scene) this.#battleId = result.scene.id;
    this.render();
  }

  static async onImportFolder() {
    await Maps.importFolder();
    this.render();
  }

  static async onLoadBundled() {
    await Maps.loadBundled();
    this.render();
  }

  /* ---------- helpers ---------- */

  #clearPick() {
    if (this.#pickHandler && canvas?.stage) canvas.stage.off("pointerdown", this.#pickHandler);
    this.#pickHandler = null;
  }
}
