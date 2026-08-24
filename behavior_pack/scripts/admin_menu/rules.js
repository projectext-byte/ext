import {
  ActionFormData,
  ModalFormData,
  Player,
  world,
  system,
} from "../core.js";
import { GlobalConfig } from "../function/GlobalConfig.js";
function getRulesConfig() {
  try {
    const config = GlobalConfig.get("serverRules");
    return config
      ? (typeof config === "string" ? JSON.parse(config) : config)
      : {
        rules: [
          "§e1. §7No cheating or hacking",
          "§e2. §7No toxic behavior or swearing",
          "§e3. §7Respect all players",
          "§e4. §7No spamming chat/commands",
          "§e5. §7No scamming other players",
        ],
      };
  } catch (error) {
    console.warn("Error getting rules config:", error);
    return {
      rules: [
        "§e1. §7No cheating or hacking",
        "§e2. §7No toxic behavior or swearing",
        "§e3. §7Respect all players",
        "§e4. §7No spamming chat/commands",
        "§e5. §7No scamming other players",
      ],
    };
  }
}
function saveRulesConfig(config) {
  try {
    GlobalConfig.set("serverRules", config);
    return true;
  } catch (error) {
    console.warn("Error saving rules config:", error);
    return false;
  }
}
export function showRules(player) {
  try {
    const config = getRulesConfig();
    const form = new ActionFormData()
      .title("§8⚖ §l§6SERVER RULES §8⚖")
      .body(
        "§e✦ §6§lSERVER RULES §e✦\n\n" +
        config.rules.join("\n\n") +
        "\n\n§c※ Breaking rules will result in penalties",
      )
      .button("§aOK", "textures/ui/check");
    form.show(player);
    player.runCommand("playsound random.pop @s ~~~ 1 1");
  } catch (error) {
    console.warn("Error showing rules:", error);
    player.sendMessage("§c⚠ Error occurred while displaying rules!");
  }
}
export async function editRules(player) {
  if (!player.hasTag("admin")) {
    player.sendMessage("§c⚠ You don't have permission to edit rules!");
    return;
  }
  try {
    const config = getRulesConfig();
    const currentRules = config.rules;
    const editMenu = new ActionFormData()
      .title("§6Edit Server Rules")
      .body("§eChoose how you want to edit the rules:")
      .button(
        "Edit All Rules\n§8Edit all rules at once",
        "textures/ui/automation_glyph",
      )
      .button(
        "Edit Individual Rules\n§8Edit rules one by one",
        "textures/ui/pencil_edit_icon",
      )
      .button("Add New Rule\n§8Add a new rule", "textures/ui/color_plus")
      .button(
        "Remove Rules\n§8Delete existing rules",
        "textures/ui/trash_default",
      )
      .button("§cBack", "textures/ui/arrow_left");
    const menuResponse = await editMenu.show(player);
    if (!menuResponse.canceled) {
      switch (menuResponse.selection) {
        case 0:
          await editAllRules(player);
          break;
        case 1:
          await editIndividualRules(player, currentRules);
          break;
        case 2:
          await addNewRule(player, currentRules);
          break;
        case 3:
          await removeRules(player, currentRules);
          break;
      }
    }
  } catch (error) {
    console.warn("Error in edit rules menu:", error);
    player.sendMessage("§c⚠ Error occurred while editing rules!");
  }
}
async function editAllRules(player) {
  const form = new ModalFormData()
    .title("§6EDIT ALL RULES")
    .textField(
      "§eServer Rules\n§8One rule per line\n§7Use §e for yellow and §7 for gray\n§7Example: §e1. §7No cheating",
      "Enter rules here...",
      {
        defaultValue: getRulesConfig().rules.join("\n"),
        placeholder: "Enter server rules",
      },
    );
  const response = await form.show(player);
  if (!response.canceled) {
    const [rulesText] = response.formValues;
    const newRules = rulesText
      .split("\n")
      .map((rule) => rule.trim())
      .filter((rule) => rule.length > 0);
    if (newRules.length === 0) {
      player.sendMessage("§c⚠ Rules cannot be empty!");
      return;
    }
    const config = getRulesConfig();
    config.rules = newRules;
    if (saveRulesConfig(config)) {
      player.sendMessage("§a✓ Rules updated successfully!");
      player.runCommand("playsound random.levelup @s ~~~ 1 1");
    }
  }
}
async function editIndividualRules(player, currentRules) {
  const selectForm = new ActionFormData()
    .title("§6SELECT RULE TO EDIT")
    .body("§eClick on a rule to edit it:");
  currentRules.forEach((rule, index) => {
    selectForm.button(
      `Rule ${index + 1}\n§8${rule}`,
      "textures/ui/pencil_edit_icon",
    );
  });
  const selectResponse = await selectForm.show(player);
  if (!selectResponse.canceled) {
    const selectedIndex = selectResponse.selection;
    const editForm = new ModalFormData()
      .title("§6Edit Rule")
      .textField(
        "§eEdit Rule Text\n§8Use §e for yellow and §7 for gray",
        "Enter rule text...",
        {
          defaultValue: currentRules[selectedIndex],
          placeholder: "Enter rule text",
        },
      );
    const editResponse = await editForm.show(player);
    if (!editResponse.canceled) {
      const [newRule] = editResponse.formValues;
      if (newRule.trim()) {
        const config = getRulesConfig();
        config.rules[selectedIndex] = newRule.trim();
        if (saveRulesConfig(config)) {
          player.sendMessage("§a✓ Rule updated successfully!");
          player.runCommand("playsound random.levelup @s ~~~ 1 1");
        }
      }
    }
  }
}
async function addNewRule(player, currentRules) {
  const form = new ModalFormData()
    .title("§6ADD NEW RULE")
    .textField(
      "§eNew Rule Text\n§8Use §e for yellow and §7 for gray\n§7Example: §e6. §7No griefing",
      "Enter new rule...",
      {
        defaultValue: `§e${currentRules.length + 1}. §7`,
        placeholder: "Enter rule text",
      },
    );
  const response = await form.show(player);
  if (!response.canceled) {
    const [newRule] = response.formValues;
    if (newRule.trim()) {
      const config = getRulesConfig();
      config.rules.push(newRule.trim());
      if (saveRulesConfig(config)) {
        player.sendMessage("§a✓ New rule added successfully!");
        player.runCommand("playsound random.levelup @s ~~~ 1 1");
      }
    }
  }
}
async function removeRules(player, currentRules) {
  const form = new ActionFormData()
    .title("§6REMOVE RULES")
    .body("§eSelect rules to remove:");
  currentRules.forEach((rule, index) => {
    form.button(`Rule ${index + 1}\n§8${rule}`, "textures/ui/trash_default");
  });
  const response = await form.show(player);
  if (!response.canceled) {
    const config = getRulesConfig();
    config.rules.splice(response.selection, 1);
    if (saveRulesConfig(config)) {
      player.sendMessage("§a✓ Rule removed successfully!");
      player.runCommand("playsound random.levelup @s ~~~ 1 1");
    }
  }
}
world.beforeEvents.playerInteractWithEntity.subscribe((event) => {
  const player = event.player;
  const target = event.target;
  if (target.typeId === "minecraft:npc" && target.hasTag("rules_npc")) {
    event.cancel = true;
    if (player.hasTag("admin")) {
      showRulesAdminMenu(player);
    } else {
      showRules(player);
    }
  }
});
