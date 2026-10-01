# FGA Foundry Modules

Foundry VTT modules for the FGA (Fake Gaming Army) table.
Foundry VTT 13 and 14, D&D 5e.

## Manual install list

Foundry cannot install many modules from one link.
Add them one at a time. Copy a link, then:

1. Foundry, Add-on Modules, Install Module.
2. Paste the link in Manifest URL.
3. Click Install.
4. Repeat for the next module.

### D&D Beyond Live Importer

Version 2026.09.29.02

```
https://raw.githubusercontent.com/drmogie/fga-foundry-modules/main/modules/ddb-live-importer/module.json
```

### FGA Ammo Tracker

Version 2026.09.29.03

```
https://raw.githubusercontent.com/drmogie/fga-foundry-modules/main/modules/fga-ammo-tracker/module.json
```

### FGA Auto Damage

Version 2026.09.29.04

```
https://raw.githubusercontent.com/drmogie/fga-foundry-modules/main/modules/fga-auto-damage/module.json
```

### FGA Battle Director

Version 2026.09.30.1

```
https://raw.githubusercontent.com/drmogie/fga-foundry-modules/main/modules/fga-battle-director/module.json
```

### FGA Character Popup

Version 2026.09.29.03

```
https://raw.githubusercontent.com/drmogie/fga-foundry-modules/main/modules/fga-character-popup/module.json
```

### FGA Mount Action

Version 2026.09.29.02

```
https://raw.githubusercontent.com/drmogie/fga-foundry-modules/main/modules/fga-mount-action/module.json
```

### VTT MCP Rest Connector

Version 2026.09.30.02

```
https://raw.githubusercontent.com/drmogie/fga-foundry-modules/main/modules/fga-relay-connect/module.json
```

### FGA Scene Director

Version 2026.09.29.02

```
https://raw.githubusercontent.com/drmogie/fga-foundry-modules/main/modules/fga-scene-director/module.json
```

When you add a new module, add its link to this list.

## How releases work

- Each module lives in `modules/<name>`.
- Each module has its own version, like `2026.09.29.02`.
- When you change a module, bump its version in `module.json` and push to main.
- A GitHub Action makes a release named `<name>-<version>` and attaches `<name>.zip`.
- Nothing is released if the version did not change.

## Not here yet

FGA Loot Appraiser is still in progress and is not in this repository.
