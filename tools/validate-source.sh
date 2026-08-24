#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

python3 - <<'PY'
import json
from pathlib import Path

resource_pack = Path("resource_pack")
behavior_pack = Path("behavior_pack")

for pack in (resource_pack, behavior_pack):
    for json_file in pack.rglob("*.json"):
        json.loads(json_file.read_text(encoding="utf-8"))

resource_manifest = json.loads((resource_pack / "manifest.json").read_text())
behavior_manifest = json.loads((behavior_pack / "manifest.json").read_text())
version = [1, 0, 42]

assert resource_manifest["header"]["version"] == version
assert behavior_manifest["header"]["version"] == version
assert resource_manifest["dependencies"][0]["version"] == behavior_manifest["header"]["version"]
assert behavior_manifest["dependencies"][0]["version"] == resource_manifest["header"]["version"]

ui_defs = json.loads((resource_pack / "ui" / "_ui_defs.json").read_text())["ui_defs"]
missing = [ui_file for ui_file in ui_defs if not (resource_pack / ui_file).is_file()]
assert not missing, f"Missing UI definitions: {', '.join(missing)}"
PY

find behavior_pack/scripts -type f -name '*.js' -print0 | xargs -0 -n1 node --check
printf 'Source validation passed.\n'
