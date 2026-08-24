import { world, system, ActionFormData, ModalFormData } from "../core.js";
import { showMainMenu } from "../kiwora.js";
import { killForm } from "../forms.js";
import { Lang } from "../lib/Lang.js";
export async function showKillMenu(source) {
  try {
    const form = killForm(source);
    const killResponse = await form.show(source);
    if (killResponse.canceled) return;
    switch (killResponse.selection) {
      case 0:
        const monsterWarningResponse =
          await createWarningFormMonsters(source).show(source);
        if (monsterWarningResponse.selection === 0) {
          removeEntities(
            source,
            { families: ["monster"], excludeTypes: ["wither", "player"] },
            Lang.t(source, "kill.label.monsters"),
          );
        }
        break;
      case 1:
        const nonHostileWarningResponse =
          await createWarningFormNonHostile(source).show(source);
        if (nonHostileWarningResponse.selection === 0) {
          removeEntities(
            source,
            {
              excludeFamilies: ["monster"],
              excludeTypes: [
                "player",
                "wither",
                "npc",
                "villager",
                "villager_v2",
                "wandering_trader",
              ],
            },
            Lang.t(source, "kill.label.non_hostile"),
          );
        }
        break;
      case 2:
        await showKillPlayerMenu(source);
        break;
      case 3:
        const itemResponse = await createKillItemForm(source).show(source);
        if (itemResponse.canceled) return;
        if (itemResponse.formValues[0]) {
          removeEntities(source, { type: "item" }, Lang.t(source, "kill.label.items"));
        }
        break;
      case 4:
        showMainMenu(source);
        break;
    }
  } catch (error) {
    console.warn("Error in kill menu:", error);
  }
}
function removeEntities(source, filter, label) {
  const entities = source.dimension.getEntities(filter);
  let count = 0;
  system.runJob(
    (function* () {
      for (const entity of entities) {
        if (entity.nameTag && entity.nameTag.length > 0) continue;
        try {
          entity.remove();
          count++;
        } catch {}
        yield;
      }
      source.sendMessage(Lang.t(source, "kill.msg.removed", count, label));
    })(),
  );
}
async function showKillPlayerMenu(source) {
  try {
    const players = Array.from(world.getPlayers()).filter((p) => p !== source);
    if (players.length === 0) {
      source.sendMessage(Lang.t(source, "kill.player.err.none"));
      return;
    }
    const playerNames = players.map((p) => p.name);
    const killPlayerForm = new ModalFormData()
      .title(Lang.t(source, "kill.player.title"))
      .dropdown(Lang.t(source, "kill.player.dropdown"), playerNames, { defaultValue: 0 })
      .submitButton(Lang.t(source, "kill.player.btn"));
    const response = await killPlayerForm.show(source);
    if (response.canceled) return;
    const selectedPlayer = players[response.formValues[0]];
    if (selectedPlayer?.isValid()) {
      selectedPlayer.runCommand("kill @s");
      source.runCommand("playsound item.trident.riptide_1 @s");
    } else {
      source.sendMessage(Lang.t(source, "kill.player.err.not_found"));
    }
  } catch (error) {
    console.warn("Error in kill player menu:", error);
    source.sendMessage(Lang.t(source, "kill.err.exec"));
  }
}
function createWarningFormMonsters(source) {
  return new ActionFormData()
    .title(Lang.t(source, "kill.warn.monsters.title"))
    .body(Lang.t(source, "kill.warn.monsters.body"))
    .button(Lang.t(source, "kill.warn.btn.confirm"), "textures/ui/check")
    .button(Lang.t(source, "kill.warn.btn.cancel"), "textures/ui/cancel");
}
function createWarningFormNonHostile(source) {
  return new ActionFormData()
    .title(Lang.t(source, "kill.warn.non_hostile.title"))
    .body(Lang.t(source, "kill.warn.non_hostile.body"))
    .button(Lang.t(source, "kill.warn.btn.confirm"), "textures/ui/check")
    .button(Lang.t(source, "kill.warn.btn.cancel"), "textures/ui/cancel");
}
function createKillItemForm(source) {
  return new ModalFormData()
    .title(Lang.t(source, "kill.items.title"))
    .toggle(Lang.t(source, "kill.items.toggle"), false);
}
