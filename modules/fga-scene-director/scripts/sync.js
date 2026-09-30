import { MODULE_ID } from "./constants.js";

const SOCKET_EVENT = `module.${MODULE_ID}`;

let onSectionHandler = null;
let onClearAllHandler = null;

/**
 * Wires up the module's socket channel. Called once from main.js with the functions that
 * mirror a section / a full scene reset onto THIS client's own visual layer (staged
 * portraits, caption bar, background effect). The GM's own client already applied
 * everything locally before broadcasting, so the listener ignores messages that
 * originated from this same client — nothing ever double-fires on the GM's screen.
 */
export function initSocket({ onSection, onClearAll }) {
  onSectionHandler = onSection;
  onClearAllHandler = onClearAll;
  game.socket.on(SOCKET_EVENT, data => {
    if (!data || data.senderId === game.user.id) return;
    if (data.type === "section") onSectionHandler?.(data.section, data.sceneId);
    else if (data.type === "clearAll") onClearAllHandler?.();
  });
}

/** Broadcasts one timeline section's visual effect to every other connected client. GM-only. */
export function broadcastSection(section, sceneId) {
  if (!game.user.isGM) return;
  game.socket.emit(SOCKET_EVENT, { type: "section", section, sceneId, senderId: game.user.id });
}

/** Broadcasts "clear everything currently staged" to every other connected client. GM-only. */
export function broadcastClearAll() {
  if (!game.user.isGM) return;
  game.socket.emit(SOCKET_EVENT, { type: "clearAll", senderId: game.user.id });
}
