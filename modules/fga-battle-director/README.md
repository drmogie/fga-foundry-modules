# FGA Battle Director

A GM tool for Foundry VTT (v13, D&D 5e). Pick a premade battlefield scene, choose who goes, and send the party there in one click. No movement or initiative until you click **Start Battle**.

Version: 2026.09.29.02

## What it does

1. **Stage** premade battle scenes, or make new ones from map images (see Maps below). They show up in the GM Battle window.
2. Open the **GM Battle** window from the toolbar button, the floating button, or a macro.
3. Pick a battlefield — click anywhere on its card, not just the radio dot. Drag a card by the grip handle on the left to reorder the list. Characters whose player is online are ticked for you already — check or uncheck to change who goes. Pick where they land.
4. Buttons at the bottom of the window:
   - **Go here** — moves the ticked characters to the picked battlefield. No movement there yet. No combat yet.
   - **Go here and start battle** — moves them, sets up combat, and starts the fight right away.
   - **Start Battle** — starts a fight with the ticked characters right where you already are. No travel. Useful for an ambush or a fight that breaks out on the board you're already on.
   - **Stop Battle** — turns movement and initiative back on and clears the combat, but leaves everyone standing right where they are. Shows up whenever the current board has no movement or has free movement (a battle staged or live). Use this instead of Return when you don't want tokens sent back.
   - Clicking Go here with nobody ticked asks "No actor token selected. Are you sure?" — Yes moves the scene with no one along for the ride, No cancels. Go here and start battle or Start Battle with nobody ticked just pops a warning instead.
   - If a checked character's actor already has a token sitting on the battlefield, that existing token is reused and moved into the landing spot along with everyone else — no duplicate gets made, and the whole party ends up grouped together even if some of them were already there.
5. Click **Return to previous board** afterward. Tokens go back to where they came from, and the combat ends. Party members popped out of a group by Extract aren't left behind either — they're swept back into their group's token, rebuilding it on the home board if it isn't already there.

## Where they land

Pick this in the window. It is remembered for next time.

- **Start zone**: use the spot you set on the battle map with **Set start**. The party fills in around it.
- **Same layout as the last board**: keeps spacing, centered on the start spot (or the map center).
- **Line up along the bottom edge**.
- **Row in the middle**: you drag them into place.

To set a start spot: click **View** on the battlefield, click **Set start**, then click the map. Clicking View doesn't move your party or players — it just looks at that scene for you. A **Back to my board** button appears next to the Battlefields heading once you've wandered off, so you can jump straight back to the board you were actually on.

## Screen effects

When you click Go here, Go here and start battle, or Return, the screen changes with an effect on every player's screen at once (Start Battle alone doesn't move anyone, so it has no effect). Pick it in the window under "Screen effect going in and out".

- **Swirl down the drain**: the scene twists down into black. The scene change happens under the black. Then the swirl opens back out on the new scene.
- **Swirling gas (rainbow)**: a rainbow cloud grows from the middle of the screen until it covers everything, mottled and drifting rather than a few smooth shapes.
- **Rainbow oil in water**: rainbow streaks grow from the middle of the screen, wavering and marbled like a few drops of colored oil being stirred into water.
- **Fade to black**: a plain fade out and fade in.
- **None**: no effect.

The new screen stays black until each player has finished loading the scene. Players who are not being pulled (the pull box is unticked) do not see it. Only the GM does. If someone has "reduce motion" turned on in their system, the swirl becomes a fade for them.

Speed is in the module settings: Screen transition speed. It is the time to close and again to open, so the whole trip is about double. Default 1400.

## Groups

For a Group actor (a wagon, a party icon — anything holding a Members list), the right-hand column has its own **Groups** tab next to Characters. Group tokens don't show up in the Characters list, so you can't pick one twice by accident.

1. Pick a battlefield on the left and make sure it has a **Start spot set**.
2. Switch to the Groups tab. Tick the group token(s) on your current board.
3. **Extract members 10 ft around the group** — off by default. Off just moves the group's own token to the start spot. On also pops each party member out in a ring about 10 feet around it, ready to fight.
4. **Delete the group after extraction** — only does anything when Extract is also on (it's greyed out otherwise). Off leaves the group's own token (the wagon, the party icon) there too, alongside the now-extracted party. On removes the group's token once its members are out, so all that's left is the party.
5. Click **Send group here**. If a member already has a token on that battlefield, no duplicate is made — their existing token just gets moved into the ring formation with everyone else.

## Maps

Three buttons under the battlefield list make scenes for you. Each new scene is put in a scene folder called "FGA Battle Maps" and staged. Maps already loaded are skipped.

- **Map from image**: pick one image, confirm the name and grid size.
- **Import folder**: pick a folder. Every map image inside becomes a battlefield.
- **Bundled maps**: loads whatever images are in the module's `maps` folder. Five ship with the module already: Grassland Straight Road, Grassland Curving Road North, Grassland Crossroads, Grassland T Junction, and a round Colosseum (entrance on the south side). Drop more images in there yourself and click it again. See `maps/README.md`.

Whatever you just loaded goes to the top of the Battlefields list. Loading a folder or the bundled maps puts the whole batch at the top, in the same order as the files.

Name a file like `Forest Road_70px.webp` to set that map's grid to 70 pixels. Otherwise the default grid size setting is used (100). Grid size must be 50 or more.

Works with webp, png, jpg, jpeg, avif, webm, and mp4. New scenes have no padding and are hidden from the scene navigation bar.

## Opening the window

- Toolbar button in the token controls (GM only).
- Floating button. Drag it anywhere. Set it to Off, Always on, or Only during a battle in the module settings. It turns blue when there's no movement and red when movement is free.
- Macro:

```js
game.modules.get("fga-battle-director").api.open();
```

## Settings

- Floating battle button: Off, Always on, Only during a battle.
- Screen transition speed in milliseconds (default 1400).
- Default grid size for imported maps (default 100).
- Roll initiative when I click Start Battle (default on).
- After Start, players can only move on their own turn (default off).

## Notes

- Tokens are moved by creating them on the battle scene and deleting them from the old one. Token IDs change. Unlinked tokens keep their own HP.
- After installing an update, do a hard refresh (Ctrl+Shift+R). Browsers can cache module scripts for hours.
- Square grids are the target. Hex grids will work but placement may look off.

## Install

Copy the `fga-battle-director` folder into your Foundry `Data/modules` folder and restart. Enable it in your world.

## Install from GitHub

In Foundry, open Add-on Modules, then Install Module.
Paste this Manifest URL and click Install:

`https://raw.githubusercontent.com/drmogie/fga-foundry-modules/main/modules/fga-battle-director/module.json`
