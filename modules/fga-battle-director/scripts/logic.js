// Pure logic. No Foundry globals in here, so it can be tested in plain Node.
import { PLACEMENT, STATE } from "./constants.js";

export const MAP_EXTENSIONS = ["webp", "png", "jpg", "jpeg", "avif", "webm", "mp4", "m4v"];
export const VIDEO_EXTENSIONS = ["webm", "mp4", "m4v"];

function extOf(path) {
  return String(path).split("?")[0].split(".").pop().toLowerCase();
}

export function isMapFile(path) {
  return MAP_EXTENSIONS.includes(extOf(path));
}

export function isVideoFile(path) {
  return VIDEO_EXTENSIONS.includes(extOf(path));
}

/**
 * Turn a map file path into a scene name and grid size.
 * A file named "Forest Road_70px.webp" gives name "Forest Road" and grid 70.
 * Grid size is kept between 50 and 1000 (Foundry's minimum is 50).
 */
export function parseMapName(path, defaultGrid = 100) {
  const raw = String(path).split("?")[0].split("/").pop() ?? "";
  let file = raw;
  try {
    file = decodeURIComponent(raw);
  } catch (err) {
    /* keep the raw name */
  }
  let base = file.replace(/\.[^.]+$/, "");
  let grid = defaultGrid;
  const m = base.match(/[\s_-]*(\d{2,4})px$/i);
  if (m) {
    grid = Number(m[1]);
    base = base.slice(0, m.index);
  }
  grid = Math.min(1000, Math.max(50, Math.round(Number(grid) || 100)));
  const name = base.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim() || file;
  return { name, grid };
}

export function snapTo(value, origin, size) {
  return Math.round((value - origin) / size) * size + origin;
}

/**
 * Work out where each token lands on the battle map.
 *
 * tokens:    [{ id, x, y, width, height }]  (x/y in pixels, width/height in grid squares)
 * originGrid: grid size in pixels of the board the tokens come from
 * dest:      { gridSize, rect: {x, y, width, height}, start: {x, y} | null }
 *
 * Returns { positions: Map(id -> {x, y}), usedFallback: boolean }
 */
export function computePositions(mode, tokens, originGrid, dest) {
  const g = dest.gridSize;
  const rect = dest.rect;
  const n = tokens.length;
  const positions = new Map();
  let usedFallback = false;
  if (!n) return { positions, usedFallback };

  const cell = Math.max(1, ...tokens.map(t => Math.ceil(Math.max(t.width || 1, t.height || 1))));
  const step = cell * g;
  const perRow = Math.max(1, Math.floor((rect.width - 4 * g) / step));

  const put = (t, x, y) => {
    const w = (t.width || 1) * g;
    const h = (t.height || 1) * g;
    let sx = snapTo(x, rect.x, g);
    let sy = snapTo(y, rect.y, g);
    sx = Math.min(Math.max(sx, rect.x), rect.x + rect.width - w);
    sy = Math.min(Math.max(sy, rect.y), rect.y + rect.height - h);
    positions.set(t.id, { x: sx, y: sy });
  };

  const lineUp = () => {
    tokens.forEach((t, i) => {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      put(t, rect.x + 2 * g + col * step, rect.y + rect.height - 2 * step - row * step);
    });
  };

  switch (mode) {
    case PLACEMENT.START_ZONE: {
      if (!dest.start) {
        usedFallback = true;
        lineUp();
        break;
      }
      const cols = Math.min(n, Math.max(2, Math.ceil(Math.sqrt(n))));
      tokens.forEach((t, i) => {
        put(t, dest.start.x + (i % cols) * step, dest.start.y + Math.floor(i / cols) * step);
      });
      break;
    }
    case PLACEMENT.SAME_LAYOUT: {
      const scale = g / (originGrid || g);
      const centers = tokens.map(t => ({
        t,
        cx: t.x + ((t.width || 1) * originGrid) / 2,
        cy: t.y + ((t.height || 1) * originGrid) / 2
      }));
      const minX = Math.min(...centers.map(c => c.cx));
      const maxX = Math.max(...centers.map(c => c.cx));
      const minY = Math.min(...centers.map(c => c.cy));
      const maxY = Math.max(...centers.map(c => c.cy));
      const midX = (minX + maxX) / 2;
      const midY = (minY + maxY) / 2;
      const target = dest.start
        ? { x: dest.start.x + g / 2, y: dest.start.y + g / 2 }
        : { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      centers.forEach(({ t, cx, cy }) => {
        const w = (t.width || 1) * g;
        const h = (t.height || 1) * g;
        put(t, target.x + (cx - midX) * scale - w / 2, target.y + (cy - midY) * scale - h / 2);
      });
      break;
    }
    case PLACEMENT.LINE_UP:
      lineUp();
      break;
    case PLACEMENT.BY_HAND:
    default: {
      const rowsNeeded = Math.ceil(n / perRow);
      tokens.forEach((t, i) => {
        const col = i % perRow;
        const row = Math.floor(i / perRow);
        const inThisRow = Math.min(perRow, n - row * perRow);
        const startX = rect.x + rect.width / 2 - (inThisRow * step) / 2;
        const startY = rect.y + rect.height / 2 - (rowsNeeded * step) / 2;
        put(t, startX + col * step, startY + row * step);
      });
    }
  }
  return { positions, usedFallback };
}

/**
 * Positions to scatter a group's members in a ring around the group's own
 * landing point, spaced evenly about `radiusFeet` out from center.
 *
 * tokens: [{ id, width, height }]  (width/height in grid squares)
 * center: { x, y }  pixel position of the group token's center
 * grid:   { size, distance }  destination scene's grid (distance = feet per square)
 *
 * Returns Map(id -> {x, y})  top-left pixel position for each member token
 */
export function ringPositions(tokens, center, grid, radiusFeet = 10) {
  const positions = new Map();
  const n = tokens.length;
  if (!n) return positions;
  const size = grid.size;
  const distance = grid.distance || 5;
  const radiusPx = (radiusFeet / distance) * size;
  tokens.forEach((t, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2; // first member due north, then clockwise
    const w = (t.width || 1) * size;
    const h = (t.height || 1) * size;
    const cx = center.x + radiusPx * Math.cos(angle);
    const cy = center.y + radiusPx * Math.sin(angle);
    positions.set(t.id, {
      x: Math.round((cx - w / 2) / size) * size,
      y: Math.round((cy - h / 2) / size) * size
    });
  });
  return positions;
}

/**
 * Should this token update be blocked? Returns a message, or null to allow it.
 * combat: { started: boolean, currentTokenId: string | null } | null
 */
export function moveBlockReason({ isGM, sceneState, changes, tokenId, lockToTurn, combat }) {
  if (isGM) return null;
  const moves = ["x", "y", "elevation"].some(k => Object.prototype.hasOwnProperty.call(changes ?? {}, k));
  if (!moves) return null;
  if (sceneState === STATE.FROZEN) return "The battle has not started yet. Wait for the GM.";
  if (
    sceneState === STATE.ACTIVE &&
    lockToTurn &&
    combat?.started &&
    combat.currentTokenId &&
    combat.currentTokenId !== tokenId
  ) {
    return "It is not this token's turn.";
  }
  return null;
}

export function initiativeBlockReason({ isGM, sceneState, changes }) {
  if (isGM) return null;
  if (sceneState !== STATE.FROZEN) return null;
  if (!Object.prototype.hasOwnProperty.call(changes ?? {}, "initiative")) return null;
  return "Initiative is on hold until the GM starts the battle.";
}
