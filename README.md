# EXTREMESMP Bedrock pack source

This repository contains the editable text source for the EXTREMESMP behavior
and resource packs. The previous prebuilt ZIP has intentionally been removed:
this repository does not version binary archives or raster assets.

## Layout

- `behavior_pack/` — behavior definitions, item/recipe JSON, and JavaScript.
- `resource_pack/` — manifests, client-entity definitions, and UI JSON.

The manifests target version `1.0.38`. Pack icons and texture PNG files must be
supplied by the release pipeline or local asset store when building a playable
`.mcpack`; they are intentionally excluded from source control.

## Validation

Run JavaScript syntax validation before packaging:

```bash
find behavior_pack/scripts -name '*.js' -print0 | xargs -0 -n1 node --check
```

Also validate that every UI definition listed in `resource_pack/ui/_ui_defs.json`
exists as a text source file.
