# FGA Foundry Modules

Foundry VTT modules for the FGA (Fake Gaming Army) table.
Foundry VTT 13 and 14, D&D 5e.

## How to install one module

1. In Foundry, open Add-on Modules.
2. Click Install Module.
3. Paste the Manifest URL of the module you want.
4. Click Install.

Foundry installs one module per link. Use one link for each module below.

## Modules

### D&D Beyond Live Importer

Standalone GM tool. Opens a live, already-logged-in D&D Beyond browser tab, lets you pick a campaign and character, and imports or updates that character as a Foundry actor. No other modules required, no saved token.

- Version: 2026.09.29.02
- Manifest URL: `https://raw.githubusercontent.com/drmogie/fga-foundry-modules/main/modules/ddb-live-importer/module.json`
- Folder: `modules/ddb-live-importer`

### FGA Ammo Tracker

Tracks ammo fired during combat. When combat ends, a chat card lets the archer click a button to roll for retrieving their ammo.

- Version: 2026.09.29.02
- Manifest URL: `https://raw.githubusercontent.com/drmogie/fga-foundry-modules/main/modules/fga-ammo-tracker/module.json`
- Folder: `modules/fga-ammo-tracker`

### FGA Auto Damage

Rolls damage for you right after an attack roll. Each player picks their own rules: on a hit, on a critical hit only, or always.

- Version: 2026.09.29.04
- Manifest URL: `https://raw.githubusercontent.com/drmogie/fga-foundry-modules/main/modules/fga-auto-damage/module.json`
- Folder: `modules/fga-auto-damage`

### FGA Battle Director

GM tool for the FGA. Stage premade battlefield scenes (or make them from map images), then send the party there in one click. Freezes movement and initiative until the GM clicks Start Battle, then rolls initiative and starts combat.

- Version: 2026.09.29.02
- Manifest URL: `https://raw.githubusercontent.com/drmogie/fga-foundry-modules/main/modules/fga-battle-director/module.json`
- Folder: `modules/fga-battle-director`

### FGA Character Popup

Shows a big floating character portrait on screen when that character speaks in chat, gets bloodied/healed/revived, or has a classified buff/debuff applied — with an optional chat bubble showing the message text (each character's own bubble color and, optionally, its own custom text color, visible the same way to everyone), GM-controlled size/position/flip/fade, and player-chosen portrait vs. token image.

- Version: 2026.09.29.03
- Manifest URL: `https://raw.githubusercontent.com/drmogie/fga-foundry-modules/main/modules/fga-character-popup/module.json`
- Folder: `modules/fga-character-popup`

### FGA Mount Action

Adds buttons to the right-click token HUD of D&D 5e Group and Vehicle tokens. Players who own a member (or crew) can store or place their own token near it. The GM can extract or store every member within a set range.

- Version: 2026.09.29.02
- Manifest URL: `https://raw.githubusercontent.com/drmogie/fga-foundry-modules/main/modules/fga-mount-action/module.json`
- Folder: `modules/fga-mount-action`

### FGA Relay Connect

Connects this Foundry client to your Foundry VTT MCP & Rest Relay so tools and Claude can work with your world.

- Version: 2026.09.29.15
- Manifest URL: `https://raw.githubusercontent.com/drmogie/fga-foundry-modules/main/modules/fga-relay-connect/module.json`
- Folder: `modules/fga-relay-connect`

### FGA Scene Director

Script and stage cinematic multi-character scenes: build an ordered timeline of character entrances, dialogue lines, and exits, then play it back live with auto-targeting, closed-caption-style dialogue text, and freeform on-screen portrait staging. Companion module to FGA Character Popup (not required).

- Version: 2026.09.29.02
- Manifest URL: `https://raw.githubusercontent.com/drmogie/fga-foundry-modules/main/modules/fga-scene-director/module.json`
- Folder: `modules/fga-scene-director`

## How releases work

- Each module lives in `modules/<name>`.
- Each module has its own version, like `2026.09.29.02`.
- When you change a module, bump its version in `module.json` and push to main.
- A GitHub Action makes a release named `<name>-<version>` and attaches `<name>.zip`.
- Nothing is released if the version did not change.

## Not here yet

FGA Loot Appraiser is still in progress and is not in this repository.
