export const MODULE_ID = "fga-battle-director";

export const SETTINGS = {
  BATTLEFIELDS: "battlefields",
  PLACEMENT: "placementMode",
  FLOATING: "floatingButton",
  FLOATING_POS: "floatingPos",
  AUTO_ROLL: "autoRollOnStart",
  LOCK_TURN: "lockToTurn",
  DEFAULT_GRID: "defaultGridSize",
  TRANSITION: "transitionEffect",
  TRANSITION_MS: "transitionMs",
  EXTRACT_GROUP: "extractGroupOnSend",
  DELETE_GROUP: "deleteGroupAfterExtract"
};

export const FLAGS = {
  STATE: "state",
  START: "startPoint",
  ORIGIN: "origin",
  SOURCE: "source",
  GROUP_SOURCE: "groupSource"
};

/** How far out (in feet) extracted party members are scattered around a group's token. */
export const GROUP_EXTRACT_RADIUS_FEET = 10;

export const MAP_FOLDER_NAME = "FGA Battle Maps";
export const BUNDLED_MAPS_PATH = `modules/${MODULE_ID}/maps`;

export const STATE = {
  FROZEN: "frozen",
  ACTIVE: "active"
};

export const PLACEMENT = {
  START_ZONE: "startZone",
  SAME_LAYOUT: "sameLayout",
  LINE_UP: "lineUp",
  BY_HAND: "byHand"
};

export const PLACEMENT_LABELS = {
  [PLACEMENT.START_ZONE]: "Start zone (spot set on the battle map)",
  [PLACEMENT.SAME_LAYOUT]: "Same layout as the last board",
  [PLACEMENT.LINE_UP]: "Line up along the bottom edge",
  [PLACEMENT.BY_HAND]: "Row in the middle, I place them by hand"
};

export const PLACEMENT_HINTS = {
  [PLACEMENT.START_ZONE]: "The party fills in around the start spot you set on the battle map. No spot set? They line up along the bottom edge.",
  [PLACEMENT.SAME_LAYOUT]: "Keeps everyone's spacing from the last board. Centered on the start spot, or the map center if none is set.",
  [PLACEMENT.LINE_UP]: "A tidy row along the bottom of the battle map.",
  [PLACEMENT.BY_HAND]: "A row in the middle of the map. You drag them into place."
};

export const FLOATING_STATES = {
  OFF: "off",
  ALWAYS: "always",
  BATTLE: "battle"
};
