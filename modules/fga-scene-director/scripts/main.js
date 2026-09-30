import { MODULE_ID, SETTINGS } from "./constants.js";
import { registerSettings } from "./settings.js";
import { registerHandlebarsHelpers } from "./helpers.js";
import { registerToolbarButton } from "./toolbar.js";
import { SceneEditorApp } from "./apps/scene-editor.js";
import { FloatingButton } from "./floating-button.js";
import { CaptionBar } from "./caption-bar.js";
import { SpeechBubble } from "./speech-bubble.js";
import { StagingView } from "./staging-view.js";
import { initSocket } from "./sync.js";
import { mirrorSection, mirrorClearAll } from "./playback.js";

let editorAppInstance = null;

function getEditorApp() {
  if (!editorAppInstance) editorAppInstance = new SceneEditorApp();
  return editorAppInstance;
}

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | initializing`);
  registerHandlebarsHelpers();
  registerSettings();
  registerToolbarButton(getEditorApp);
});

Hooks.once("ready", () => {
  // The Scene Editor Window, its floating fallback button, and the staging/editor tools are
  // GM-only authoring UI (per spec: "a GM-only popup menu"). Players never get the button
  // that opens it — they only ever see the read-only playback layer that's mirrored to
  // them over the socket below.
  if (game.user.isGM) {
    FloatingButton.init(getEditorApp);
  }
  CaptionBar.applyStyle();
  SpeechBubble.applyStyle();
  StagingView.setEditorToolsVisible(game.settings.get(MODULE_ID, SETTINGS.EDITOR_TOOLS_DEFAULT_VISIBLE));

  // Mirror the GM's staged portraits/caption/background-effect calls onto every other
  // connected client, so the cinematic scene is actually visible to players, not just the GM.
  initSocket({ onSection: mirrorSection, onClearAll: mirrorClearAll });

  // Public API for other modules (e.g. a future FGA Character Popup trigger-suppression hook
  // could listen for these too) — kept intentionally tiny since Scene Director is self-contained.
  game.modules.get(MODULE_ID).api = {
    openEditor: () => {
      if (!game.user.isGM) {
        ui.notifications?.warn("FGA Scene Director | Only the GM can open the Scene Editor.");
        return;
      }
      getEditorApp().render(true);
    },
    closeEditor: () => editorAppInstance?.close()
  };
});

// Keep the "add character" / "on stage" dropdowns in the Scene Editor fresh if tokens are
// added/removed on the board while it's open.
Hooks.on("createToken", () => editorAppInstance?.rendered && editorAppInstance.render());
Hooks.on("deleteToken", () => editorAppInstance?.rendered && editorAppInstance.render());
Hooks.on("canvasReady", () => editorAppInstance?.rendered && editorAppInstance.render());

// Window open/closed state drives both the floating button's and the toolbar button's color/state.
Hooks.on("fgaSceneDirectorWindowState", open => {
  FloatingButton.setOpenState(open);
});

Hooks.on("fgaSceneDirectorEditorToolsVisibility", visible => {
  StagingView.setEditorToolsVisible(visible);
});

// StagingView auto-disables the editor tools overlay itself the moment a brand-new character
// gets staged (see showCharacter) — this just keeps the Scene Editor's own header toggle
// button in sync with that, so it doesn't keep showing "on" once the actual overlay is off.
Hooks.on("fgaSceneDirectorEditorToolsAutoDisabled", () => {
  if (editorAppInstance && editorAppInstance.editorToolsVisible) {
    editorAppInstance.editorToolsVisible = false;
    if (editorAppInstance.rendered) editorAppInstance.render();
  }
});

Hooks.on("fgaSceneDirectorConfigChanged", () => {
  FloatingButton.refreshVisibility();
});
