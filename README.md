# EXTREMESMP source packs

This repository intentionally contains **source files only**.  The previous
release archive (`.zip` / `.mcpack`) has been removed so reviews can inspect
the behavior-pack scripts and resource-pack UI definitions directly.

## Layout

- `behavior_pack/` contains the add-on scripts, entities, items, recipes, and
  behavior-pack manifest.
- `resource_pack/` contains UI definitions, localization, animations, and the
  resource-pack manifest.
- `tools/validate-source.sh` checks the source manifests/UI definitions and
  JavaScript syntax without building a binary archive.

## Binary assets

Texture and icon assets (`.png`) are deliberately not committed.  Keep them
in the asset delivery pipeline and copy them into `resource_pack/textures/`
when preparing a Minecraft distribution.  This keeps the repository
reviewable while preserving the documented source paths used by the UI.

## UI loading fix

`resource_pack/ui/_ui_defs.json` includes only UI definition files that are
present in this source tree.  In particular, the obsolete missing
`ui/ccc_commands.json` entry was removed so the client does not report a UI
definition load error before loading the remaining custom screens.
