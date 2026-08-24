import { world, system, ItemStack, ActionFormData, ModalFormData } from '../../../core.js';
import { addMoney } from "../../../function/moneySystem.js";
import { GlobalConfig } from "../../../function/GlobalConfig.js";
const DEFAULT_CONFIG = {
  items: {
    enabled: true,
    list: [
      { item: "minecraft:diamond", amount: 3 },
      { item: "minecraft:emerald", amount: 5 },
      { item: "minecraft:golden_apple", amount: 2 },
    ],
    prefix: "minecraft:",
  },
  money: { enabled: true, amount: 1000 },
  cooldown: 86400000,
};
const DailyRewardConfig = {
  get: () => {
    try {
      const data = GlobalConfig.get("dailyRewardConfig");
      return data ? (typeof data === "string" ? JSON.parse(data) : data) : DEFAULT_CONFIG;
    } catch {
      return DEFAULT_CONFIG;
    }
  },
  save: (config) => {
    try {
      GlobalConfig.set("dailyRewardConfig", config);
      return true;
    } catch {
      return false;
    }
  },
};
class Helper {
  static formatTime(ms) {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  static stripPrefix(str, prefix) {
    if (!prefix || prefix === "") return str.replace("minecraft:", "");
    return str.startsWith(prefix)
      ? str.slice(prefix.length)
      : str.replace("minecraft:", "");
  }
  static parseItems(str, prefix) {
    if (!str) return [];
    return str.split(";").map((s) => {
      const [id, amt] = s.split(",");
      const fullId =
        id.includes(":") || prefix === "" ? id.trim() : prefix + id.trim();
      return {
        item: fullId,
        amount: parseInt(amt) || 1,
      };
    });
  }
  static playSound(player, type) {
    const sounds = {
      success: "random.levelup",
      error: "note.bass",
      warning: "random.pop",
    };
    player.runCommand(`playsound ${sounds[type]} @s`);
  }
  static showMsg(player, type, msg) {
    const colors = { success: "§a", error: "§c", warning: "§e" };
    player.sendMessage(`${colors[type] || "§f"}${msg}`);
    this.playSound(player, type);
  }
}
export class DailyReward {
  static async claim(player) {
    const cfg = DailyRewardConfig.get();
    const lastClaim = GlobalConfig.get(`${player.name}_lastDailyReward`) || 0;
    const timeLeft = cfg.cooldown - (Date.now() - lastClaim);
    if (timeLeft > 0) {
      Helper.showMsg(
        player,
        "warning",
        `You can claim again in: ${Helper.formatTime(timeLeft)}`,
      );
      return;
    }
    const itemsText =
      cfg.items?.enabled && cfg.items.list?.length > 0
        ? `§6Items:§r\n${cfg.items.list.map((i) => `§7• ${Helper.stripPrefix(i.item, cfg.items.prefix)} x${i.amount}`).join("\n")}`
        : "§7No items available";
    const moneyText = cfg.money?.enabled
      ? `\n\n§6Money:§r\n§7• $${cfg.money.amount}`
      : "";
    const form = new ActionFormData()
      .title("§dDaily Rewards")
      .body(
        `§eToday's Rewards:\n\n${itemsText}${moneyText}\n\n§eClick to claim your rewards!`,
      )
      .button("§2Claim Rewards", "textures/ui/gift_square")
      .button("§cClose", "textures/ui/cancel");
    const res = await form.show(player);
    const recheckTime =
      cfg.cooldown -
      (Date.now() - (GlobalConfig.get(`${player.name}_lastDailyReward`) || 0));
    if (recheckTime <= 0 && !res.canceled && res.selection === 0) {
      GlobalConfig.set(`${player.name}_lastDailyReward`, Date.now());
      if (cfg.items?.enabled) {
        const inventory = player.getComponent("inventory")?.container;
        cfg.items.list.forEach((i) => {
          try {
            const itemStack = new ItemStack(i.item, i.amount);
            if (inventory) {
              const leftOver = inventory.addItem(itemStack);
              if (leftOver) {
                player.dimension.spawnItem(leftOver, {
                  x: player.location.x,
                  y: player.location.y + 0.5,
                  z: player.location.z,
                });
                player.sendMessage(
                  `§eInventory full! Dropped ${Helper.stripPrefix(i.item, cfg.items.prefix)} x${i.amount}`,
                );
              } else {
                player.sendMessage(
                  `§a+ ${Helper.stripPrefix(i.item, cfg.items.prefix)} x${i.amount}`,
                );
              }
            } else {
              player.dimension.spawnItem(itemStack, {
                x: player.location.x,
                y: player.location.y + 0.5,
                z: player.location.z,
              });
            }
          } catch (e) {
            try {
              player.runCommand("gamerule sendcommandfeedback false");
              player.runCommand(`give @s ${i.item} ${i.amount}`);
              player.runCommand("gamerule sendcommandfeedback true");
              player.sendMessage(
                `§a+ ${Helper.stripPrefix(i.item, cfg.items.prefix)} x${i.amount}`,
              );
            } catch (err) {
              player.runCommand("gamerule sendcommandfeedback true");
            }
          }
        });
      }
      if (cfg.money?.enabled && addMoney(player, cfg.money.amount)) {
        player.sendMessage(`§a+ $${cfg.money.amount}`);
      }
      Helper.showMsg(player, "success", "Daily reward claimed successfully!");
      player.runCommand("particle minecraft:totem_particle ~~~");
    }
  }
}
export class DailyRewardAdmin {
  static async showMenu(player) {
    const form = new ActionFormData()
      .title("Daily Reward Settings")
      .button("Configure Items", "textures/ui/gift_square")
      .button("Configure Money", "textures/ui/MCoin")
      .button("Configure Cooldown", "textures/ui/timer")
      .button("Reset All Players", "textures/ui/refresh")
      .button("§cClose", "textures/ui/cancel");
    const res = await form.show(player);
    if (!res.canceled) {
      switch (res.selection) {
        case 0:
          this.editItems(player);
          break;
        case 1:
          this.editMoney(player);
          break;
        case 2:
          this.editCooldown(player);
          break;
        case 3:
          this.resetAll(player);
          break;
      }
    }
  }
  static async editItems(player) {
    const cfg = DailyRewardConfig.get();
    const items = cfg.items || DEFAULT_CONFIG.items;
    const res = await new ModalFormData()
      .title("§dConfigure Items")
      .toggle("§eEnable Item Rewards", { defaultValue: items.enabled })
      .textField("§6Custom Item Prefix (e.g., custom:)", "minecraft:", {
        defaultValue: items.prefix,
      })
      .textField("§6Items List (item,amount;...)", "diamond,3;emerald,5", {
        defaultValue: items.list
          .map((i) => `${Helper.stripPrefix(i.item, items.prefix)},${i.amount}`)
          .join(";"),
      })
      .show(player);
    if (!res.canceled) {
      const [enabled, prefix, itemsStr] = res.formValues;
      cfg.items = {
        enabled,
        prefix: prefix.trim() || "minecraft:",
        list: Helper.parseItems(itemsStr, prefix),
      };
      DailyRewardConfig.save(cfg)
        ? Helper.showMsg(player, "success", "Daily reward items updated.")
        : Helper.showMsg(player, "error", "Failed to save.");
    }
  }
  static async editMoney(player) {
    const cfg = DailyRewardConfig.get();
    const money = cfg.money || DEFAULT_CONFIG.money;
    const res = await new ModalFormData()
      .title("§6Configure Money Reward")
      .toggle("§eEnable Money Reward", { defaultValue: money.enabled })
      .slider("§eMoney Amount", 0, 10000, {
        valueStep: 100,
        defaultValue: money.amount,
      })
      .show(player);
    if (!res.canceled) {
      cfg.money = {
        enabled: res.formValues[0],
        amount: res.formValues[1],
      };
      DailyRewardConfig.save(cfg)
        ? Helper.showMsg(player, "success", "Money reward updated.")
        : Helper.showMsg(player, "error", "Failed to save.");
    }
  }
  static async editCooldown(player) {
    const cfg = DailyRewardConfig.get();
    const hours = Math.floor(cfg.cooldown / 3600000);
    const res = await new ModalFormData()
      .title("§6Configure Cooldown")
      .slider("§eCooldown (Hours)", 1, 72, {
        valueStep: 1,
        defaultValue: hours,
      })
      .show(player);
    if (!res.canceled) {
      cfg.cooldown = res.formValues[0] * 3600000;
      DailyRewardConfig.save(cfg)
        ? Helper.showMsg(
          player,
          "success",
          `Cooldown set to ${res.formValues[0]} hours.`,
        )
        : Helper.showMsg(player, "error", "Failed to save.");
    }
  }
  static async resetAll(player) {
    const res = await new ActionFormData()
      .title("Reset Cooldowns")
      .body(
        "Are you sure you want to reset daily reward cooldowns for ALL players?",
      )
      .button("§4Yes, Reset All", "textures/ui/check")
      .button("No, Cancel", "textures/ui/cancel")
      .show(player);
    if (!res.canceled && res.selection === 0) {
      world
        .getPlayers()
        .forEach((p) => GlobalConfig.set(`${p.name}_lastDailyReward`, 0));
      Helper.showMsg(
        player,
        "success",
        "All player cooldowns have been reset.",
      );
      world.sendMessage(
        "§e[System] Daily rewards have been reset by an administrator.",
      );
    }
  }
}
export function showDailyRewardMenu(player) {
  DailyReward.claim(player);
}
export function showDailyRewardAdminMenu(player) {
  DailyRewardAdmin.showMenu(player);
}
