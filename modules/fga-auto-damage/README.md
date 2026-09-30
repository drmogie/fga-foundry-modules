# FGA Auto Damage

Version: 2026.09.29.04

Rolls damage for you right after an attack roll.
Every player picks their own rules. Nothing is forced on the table.

## What it does
- You roll an attack.
- The module checks your target's armor class.
- If your rule says yes, damage rolls right away.
- A natural 20 rolls critical damage.
- A natural 1 never rolls damage (except in Always mode).

## Your own settings
Open Game Settings, then Configure Settings, then FGA Auto Damage.
These settings are per person. Each player sets their own.

- Auto roll damage: on or off (off by default).
- When to roll damage:
  - When the attack hits (default)
  - Only on a critical hit
  - Always, hit or miss
- If you have no target picked:
  - Do not roll damage (default)
  - Roll damage anyway
  - A natural 20 always rolls damage.
- Show the damage dialog: off by default, so damage rolls with no pop up.
- Post a short hit or miss note: on by default.
- Show the attacker name in the note: off by default. Chat already shows who is speaking.

## How to use it
- Target a token first. Click it, then press T, or use the target tool.
- Use your weapon or spell as normal.
- Watch chat.

## Notes
- Works with the D&D 5e system, version 5 and up.
- Built for Foundry 13 and 14. Verified on 14.
- It reads the target's armor class from the token's actor.
- With more than one target, damage rolls once if any target is hit.
- It rolls damage. It does not apply damage to the target.
- Ammunition, attack mode and ability are reused from the attack.

## Install
Copy the `fga-auto-damage` folder into your Foundry `Data/modules` folder.
Restart Foundry. Turn the module on in your world.

## Tests
The hit logic has its own tests. Run them with Node:

    node --test tests/logic.test.mjs

## Changelog
### 2026.09.29.2
- New option: show the attacker name in the hit or miss note. Off by default.
### 2026.09.29.1
- Auto roll damage is now off by default. Each player turns it on.
### 2026.09.28.1
- First version.

## Install from GitHub

In Foundry, open Add-on Modules, then Install Module.
Paste this Manifest URL and click Install:

`https://raw.githubusercontent.com/drmogie/fga-foundry-modules/main/modules/fga-auto-damage/module.json`
