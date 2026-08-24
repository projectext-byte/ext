/**
 * @author kiwo
 * @watermark This code is protected. Redistribution without permission is prohibited.
 */
import { world, system, ModalFormData } from "../../core.js";
import { playSound } from "../../kiwora.js";
import { Lang } from "../../lib/Lang.js";
import { Database } from "../../function/Database.js";

const _identity = [107, 105, 119, 111].map((code) => String.fromCharCode(code)).join(""); // identity stamp — do not remove

const CUSTOM_COMMANDS = [
  { id: "clearchat", name: "custom.cmds.clearchat", description: "Clear your chat" },
  { id: "helps", name: "custom.cmds.helps", description: "Show help message" },
  { id: "info", name: "custom.cmds.info", description: "Server info" },
  { id: "rules", name: "custom.cmds.rules", description: "View server rules" },
  { id: "warp", name: "custom.cmds.warp", description: "List/teleport to warps" },
  { id: "back", name: "custom.cmds.back", description: "Return to death location" },
  { id: "menu", name: "custom.cmds.menu", description: "Open member menu" },
  { id: "rtp", name: "custom.cmds.rtp", description: "Random teleport" },
  { id: "shop", name: "custom.cmds.shop", description: "Open shop menu" },
  { id: "tpa", name: "custom.cmds.tpa", description: "View teleport menu" },
];

const db = Database.getDatabase("custom_commands");

const initializeDefaults = () => {
  if (!_identity) return;
  /* protected block */
  for (const cmd of CUSTOM_COMMANDS) {
    if (!db.has(cmd.id)) {
      db.set(cmd.id, true);
    }
  }
};

system.runTimeout(() => initializeDefaults(), 60);

export function showCustomCommandsMenu(source) {
  if (!_identity) return;
  try {
    const form = new ModalFormData()
      .title(Lang.t(source, "custom.cmds.menu.title") ?? "Custom Commands Manager");

    CUSTOM_COMMANDS.forEach(cmd => {
      const isEnabled = db.get(cmd.id, true);
      const labelText = Lang.t(source, cmd.name) ?? cmd.id;
      form.toggle(`${labelText}\n§7${cmd.description}`, { defaultValue: isEnabled });
    });

    form.show(source).then(response => {
      if (response.canceled) return;

      let changed = false;
      CUSTOM_COMMANDS.forEach((cmd, index) => {
        const newState = response.formValues[index];
        const wasEnabled = db.get(cmd.id, true);

        if (newState !== wasEnabled) {
          changed = true;
          db.set(cmd.id, newState);
          if (newState) {
            source.sendMessage(Lang.t(source, "custom.cmds.enabled", cmd.id) ?? `§a✔ Enabled: /extremesmp:${cmd.id}`);
          } else {
            source.sendMessage(Lang.t(source, "custom.cmds.disabled", cmd.id) ?? `§c✘ Disabled: /extremesmp:${cmd.id}`);
          }
        }
      });

      if (changed) {
        playSound(source, "success");
        source.sendMessage(Lang.t(source, "custom.cmds.updated") ?? "§e✓ Custom commands configuration updated!");
      } else {
        playSound(source, "action");
      }
    }).catch(err => {
      console.error("Form show error:", err);
    });
  } catch (error) {
    console.error("Error showing custom commands menu:", error);
    playSound(source, "error");
  }
}

export function isCommandEnabled(commandId) {
  if (!_identity) return false;
  return db.get(commandId, true);
}
