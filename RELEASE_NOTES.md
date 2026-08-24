# EXTREMESMP v1.0.38 repair notes

The editable behavior-pack and resource-pack source is now tracked directly.
Prebuilt ZIP/MCpack artifacts and raster assets are deliberately excluded so
all reviewed changes are text-based.

* The resource-pack UI definition list no longer references the missing
  `ui/ccc_commands.json` file. It loads the bundled chest/inventory, pause,
  popup, and shared UI overrides, restoring the custom InvSee chest screen and
  other packaged UI customizations.
* The purple HUD-background subpack uses the standard `textures/board` source
  path, so selecting Purple loads its own background rather than silently
  falling back to the default asset.
* The floating-text behavior entity uses the Bedrock snake_case nameable
  component properties, keeping script-assigned name tags visible and
  preventing players from renaming them away.
* Both manifests and their reciprocal dependency constraints are versioned as
  `1.0.38`, allowing clients to detect this repaired release reliably.
