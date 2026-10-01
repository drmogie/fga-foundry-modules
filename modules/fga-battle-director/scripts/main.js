import { MODULE_ID, SETTINGS, FLAGS, FLOATING_STATES, PLACEMENT } from "./constants.js";
import { moveBlockReason, initiativeBlockReason } from "./logic.js";
import { getSceneState } from "./battle.js";
import * as Battle from "./battle.js";
import { BattleWindow } from "./window.js";
import { FloatingButton } from "./floating.js";
import { Transition } from "./transition.js";
import { TRANSITION } from "./transition-draw.js";

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, SETTINGS.BATTLEFIELDS, {
    scope: "world",
    config: false,
    type: Array,
    default: []
  });

  game.settings.register(MODULE_ID, SETTINGS.PLACEMENT, {
    scope: "client",
    config: false,
    type: String,
    default: PLACEMENT.START_ZONE
  });

  game.settings.register(MODULE_ID, SETTINGS.TRANSITION, {
    scope: "client",
    config: false,
    type: String,
    default: TRANSITION.SWIRL
  });

  game.settings.register(MODULE_ID, SETTINGS.EXTRACT_GROUP, {
    scope: "client",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, SETTINGS.DELETE_GROUP, {
    scope: "client",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, SETTINGS.TRANSITION_MS, {
    name: "Screen transition speed (milliseconds)",
    hint: "How long the screen takes to close to black, and again to open. The whole trip is about double this. 300 to 6000.",
    scope: "world",
    config: true,
    restricted: true,
    type: Number,
    default: 1400
  });

  game.settings.register(MODULE_ID, SETTINGS.FLOATING, {
    name: "Floating battle button",
    hint: "Off hides it. Always keeps it on screen. Only during battle shows it once a battle is staged or live.",
    scope: "client",
    config: true,
    restricted: true,
    type: String,
    choices: {
      [FLOATING_STATES.OFF]: "Off",
      [FLOATING_STATES.ALWAYS]: "Always on",
      [FLOATING_STATES.BATTLE]: "Only during a battle"
    },
    default: FLOATING_STATES.ALWAYS,
    onChange: () => FloatingButton.refresh()
  });

  game.settings.register(MODULE_ID, SETTINGS.FLOATING_POS, {
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE_ID, SETTINGS.AUTO_ROLL, {
    name: "Roll initiative when I click Start Battle",
    hint: "Rolls initiative for everyone who has none, then starts combat. Turn off to let players roll their own after Start.",
    scope: "world",
    config: true,
    restricted: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.DEFAULT_GRID, {
    name: "Default grid size for imported maps (pixels)",
    hint: "Used when a map file name has no size in it. Name a file like Forest Road_70px.webp to set its own grid. Minimum 50.",
    scope: "world",
    config: true,
    restricted: true,
    type: Number,
    default: 100
  });

  game.settings.register(MODULE_ID, SETTINGS.LOCK_TURN, {
    name: "After Start, players can only move on their own turn",
    hint: "The GM can always move anything.",
    scope: "world",
    config: true,
    restricted: true,
    type: Boolean,
    default: false
  });
});

Hooks.once("ready", () => {
  const mod = game.modules.get(MODULE_ID);
  if (mod) {
    mod.api = {
      open: () => BattleWindow.open(),
      toggle: () => BattleWindow.toggle(),
      stageScene: id => Battle.stageScene(id),
      unstageScene: id => Battle.unstageScene(id),
      start: () => (canvas.scene ? Battle.startBattle(canvas.scene) : null),
      returnToBoard: () => (canvas.scene ? Battle.returnToBoard(canvas.scene) : null)
    };
  }
  Transition.init();
  FloatingButton.init();
});

/* ---------- Toolbar button (GM only) ---------- */

Hooks.on("getSceneControlButtons", controls => {
  if (!game.user.isGM) return;
  const tool = {
    name: MODULE_ID,
    title: "GM Battle",
    icon: "fa-solid fa-shield-halved",
    button: true,
    visible: true,
    onChange: () => BattleWindow.toggle()
  };
  if (Array.isArray(controls)) {
    controls.find(c => c.name === "tokens")?.tools.push(tool);
  } else if (controls?.tokens?.tools) {
    tool.order = Object.keys(controls.tokens.tools).length;
    controls.tokens.tools[MODULE_ID] = tool;
  }
});

/* ---------- Freeze / turn lock (runs on the client that makes the change) ---------- */

Hooks.on("preUpdateToken", (tokenDoc, changes) => {
  const scene = tokenDoc.parent;
  const combat = game.combats.find(c => c.scene?.id === scene?.id && c.started);
  const reason = moveBlockReason({
    isGM: game.user.isGM,
    sceneState: getSceneState(scene),
    changes,
    tokenId: tokenDoc.id,
    lockToTurn: game.settings.get(MODULE_ID, SETTINGS.LOCK_TURN),
    combat: combat ? { started: true, currentTokenId: combat.combatant?.tokenId ?? null } : null
  });
  if (reason) {
    ui.notifications.warn(reason);
    return false;
  }
});

Hooks.on("preUpdateCombatant", (combatant, changes) => {
  const reason = initiativeBlockReason({
    isGM: game.user.isGM,
    sceneState: getSceneState(combatant.combat?.scene),
    changes
  });
  if (reason) {
    ui.notifications.warn(reason);
    return false;
  }
});

/* ---------- Keep the window and floating button current ---------- */

const refreshUI = foundry.utils.debounce(() => {
  if (!game.user.isGM) return;
  BattleWindow.refresh();
  FloatingButton.refresh();
}, 120);

for (const hook of ["canvasReady", "updateScene", "createScene", "deleteScene", "createToken", "deleteToken", "updateSetting"]) {
  Hooks.on(hook, refreshUI);
}
