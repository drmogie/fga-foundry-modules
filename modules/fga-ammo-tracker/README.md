# FGA Ammo Tracker

A Foundry VTT module for the D&D 5e system.

It tracks ammo fired during combat. When combat ends, a chat card lets
the archer click a button to roll for retrieving their ammo.

## What it does

- While combat is running, it counts every piece of ammo an actor uses.
- When combat ends, a chat card posts for each actor who fired ammo.
- The card lists the ammo and how many were fired.
- The owner of that character (or the GM) clicks "Retrieve Ammo."
- Ammo is given back, using whichever method the GM has chosen:
  - **Die rolls** (default): one d20 per piece of ammo. A roll at or
    above the target number gets that piece back.
  - **5e rules**: half of what was fired, rounded down, no rolls.
- The card updates to show what was recovered.

## Settings

Open **Game Settings > Configure Settings > FGA Ammo Tracker**.

- **Retrieval Method (GM only)** — Die rolls or 5e rules.
- **Retrieval Target Number** — only used for die rolls. Default is 11.

## Requirements

- Foundry VTT v14 (verified)
- D&D 5e system v6.0.0 or newer

## Install

**Manifest URL (recommended):**

```
https://raw.githubusercontent.com/drmogie/fga-foundry-modules/main/modules/fga-ammo-tracker/module.json
```

In Foundry: **Add-on Modules > Install Module**, paste the URL above,
click Install.

**Manual install:** download this repo and place the
`fga-ammo-tracker` folder in your Foundry `Data/modules/` folder.

## Version

Current version: see `module.json`. Version format is
`YYYY.MM.DD.#`.

## Author

DrMogie

## Install from GitHub

In Foundry, open Add-on Modules, then Install Module.
Paste this Manifest URL and click Install:

`https://raw.githubusercontent.com/drmogie/fga-foundry-modules/main/modules/fga-ammo-tracker/module.json`
