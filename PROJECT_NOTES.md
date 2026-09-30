# FGA Foundry Modules - project notes

## 2026-09-29: combined repository

- Ask: put all the FGA Foundry modules in one repository.
- Foundry installs one module per manifest link, so each module still has its own link.
- Manifest = raw file on main (`modules/<name>/module.json`). Download = release asset `<name>.zip` on tag `<name>-<version>`.
- The workflow (`.github/workflows/release.yml`) loops over every module folder. If tag `<name>-<version>` does not exist yet, it zips the folder (no tests) and makes the release.
- File uploads to releases are blocked from the PC shell, which is why the workflow does the uploads.
- Old repos (ddb-live-importer and the 7 fga-* ones) were left in place. Not archived, not deleted. Work should now happen here only.
- fga-character-popup: the Foundry server had newer code than the first GitHub release. That was fixed before the move.
- FGA Loot Appraiser is local only, still in progress.
