import { MODULE_ID } from "./constants.js";

/**
 * Adds the master show/hide tool button to Foundry's own native left-side toolbar.
 * Written for Foundry V13's object-keyed `controls` shape (Mogie's confirmed target: V13
 * Stable). Falls back to the older array-based shape defensively in case this module ends
 * up running on an earlier core version too — this is the piece most likely to need a
 * touch-up once tested live against the real toolbar.
 */
export function registerToolbarButton(getEditorApp) {
  Hooks.on("getSceneControlButtons", controls => {
    // GM-only authoring entry point — players never get this button.
    if (!game.user?.isGM) return;

    const toggle = () => {
      const app = getEditorApp();
      if (!app) return;
      if (app.rendered) app.close();
      else app.render(true);
    };

    // V13+: controls is a plain object keyed by control-group name.
    if (!Array.isArray(controls)) {
      const tokenGroup = controls.tokens ?? controls.token ?? Object.values(controls)[0];
      if (!tokenGroup) return;
      tokenGroup.tools ??= {};
      tokenGroup.tools.fgaSceneDirector = {
        name: "fgaSceneDirector",
        title: "FGA_SCENE_DIRECTOR.ToolbarButton",
        icon: "fa-solid fa-clapperboard",
        button: true,
        onChange: toggle
      };
      return;
    }

    // Pre-V12: controls is an array of { name, tools: [...] } groups.
    const tokenGroup = controls.find(c => c.name === "token") ?? controls[0];
    if (!tokenGroup) return;
    tokenGroup.tools ??= [];
    tokenGroup.tools.push({
      name: "fgaSceneDirector",
      title: "FGA_SCENE_DIRECTOR.ToolbarButton",
      icon: "fa-solid fa-clapperboard",
      button: true,
      onClick: toggle
    });
  });
}
