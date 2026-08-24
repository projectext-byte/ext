import { ActionFormData, ModalFormData, MessageFormData, ItemStack } from '../../../core.js';
import {
  getFullMoney,
  removeMoney,
  getFormattedMoney,
  formatMoneyValue,
} from "../../../function/moneySystem.js";
import { ForceOpen, metricNumbers } from "../../../lib/game.js";
import { NPCShopConfig, DEFAULT_CONFIG } from "./npc_shop_config.js";
class NPCShop {
  static isAdmin(player) {
    return player.hasTag("admin");
  }
  static async showMainMenu(player, shopId) {
    const config = NPCShopConfig.get(shopId);
    const form = new ActionFormData();
    form.title("§bNPC Shop");
    form.body("§7Welcome to the Shop!\n§7Select a category to browse items.");
    if (this.isAdmin(player)) {
      form.button("§cAdmin Settings\n§7Manage Shop", "textures/ui/gear");
    }
    config.categories.forEach((cat) => {
      form.button(cat.name, cat.icon);
    });
    const response = await ForceOpen(player, form);
    if (response.canceled) return;
    let index = response.selection;
    if (this.isAdmin(player)) {
      if (index === 0) {
        NPCShopAdmin.showMenu(player, shopId);
        return;
      }
      index--;
    }
    if (index >= 0 && index < config.categories.length) {
      this.showCategoryMenu(player, config.categories[index], shopId);
    }
  }
  static async showCategoryMenu(player, category, shopId) {
    const config = NPCShopConfig.get(shopId);
    const items = config.items[category.id] || [];
    const form = new ActionFormData();
    form.title(category.name);
    form.body(`§7Browse ${category.name} items.`);
    items.forEach((item) => {
      const priceText = `$${metricNumbers(item.price)}`;
      form.button(`${item.name}\n§7${priceText}`, item.icon);
    });
    form.button("§cBack", "textures/ui/arrow_left");
    const response = await ForceOpen(player, form);
    if (response.canceled || response.selection === items.length) {
      this.showMainMenu(player, shopId);
      return;
    }
    const selectedItem = items[response.selection];
    this.showPurchaseConfirmation(player, selectedItem, category, shopId);
  }
  static async showPurchaseConfirmation(player, item, category, shopId) {
    const playerMoney = getFullMoney(player);
    const form = new ActionFormData();
    form.title(`§bBuy ${item.name}`);
    let body = `§7You are about to purchase:\n\n`;
    body += `§7Item: §f${item.name}\n`;
    body += `§7Price: §a$${metricNumbers(item.price)}\n`;
    body += `§7Amount: §e${item.amount || 1}\n`;
    body += `§7Category: §f${category.name}\n`;
    body += `\n§7Your Balance: §a$${formatMoneyValue(playerMoney)}`;
    if (playerMoney < item.price) {
      body += `\n\n§cINSUFFICIENT FUNDS`;
    }
    form.body(body);
    form.button("§aConfirm Purchase", "textures/ui/check");
    form.button("§cCancel", "textures/ui/cancel");
    const response = await ForceOpen(player, form);
    if (response.canceled || response.selection === 1) {
      this.showCategoryMenu(player, category, shopId);
      return;
    }
    if (response.selection === 0) {
      this.processPurchase(player, item, category, shopId);
    }
  }
  static processPurchase(player, item, category, shopId) {
    const money = getFullMoney(player);
    if (money < item.price) {
      player.sendMessage(`§cYou don't have enough money. Required: $${metricNumbers(item.price)}`);
      this.showCategoryMenu(player, category, shopId);
      return;
    }
    const inventory = player.getComponent("inventory")?.container;
    if (!inventory || inventory.emptySlotsCount < 1) {
      player.sendMessage("§cYour inventory is full!");
      this.showCategoryMenu(player, category, shopId);
      return;
    }
    if (removeMoney(player, item.price)) {
      try {
        inventory.addItem(new ItemStack(item.id, item.amount || 1));
        player.sendMessage(`§aSuccessfully purchased §r${item.name} §afor §r$${metricNumbers(item.price)}`);
        player.runCommand("playsound random.levelup @s");
      } catch (e) {
        console.warn(`Transaction error: ${e}`);
        player.sendMessage("§cSystem error during purchase.");
      }
    } else {
      player.sendMessage("§cTransaction failed (Money deduction error).");
    }
  }
}
class NPCShopAdmin {
  static async showMenu(player, shopId) {
    const form = new ActionFormData();
    form.title("§cNPC Shop Admin");
    form.body(`Manage the NPC Shop.${shopId ? `\n§7Shop ID: ${shopId}` : ""}`);
    form.button("§aAdd Category", "textures/ui/color_plus");
    form.button("§eEdit Categories", "textures/ui/gear");
    form.button("§bAdd Item", "textures/ui/plus");
    form.button("§dEdit Items", "textures/ui/anvil_icon");
    form.button("§cReset Shop", "textures/ui/redX1");
    form.button("Back to Shop", "textures/ui/arrow_left");
    const response = await ForceOpen(player, form);
    if (response.canceled) return;
    switch (response.selection) {
      case 0:
        this.showAddCategory(player, shopId);
        break;
      case 1:
        this.showEditCategories(player, shopId);
        break;
      case 2:
        this.showAddItem(player, shopId);
        break;
      case 3:
        this.showEditItems(player, shopId);
        break;
      case 4:
        this.showResetConfirm(player, shopId);
        break;
      case 5:
        NPCShop.showMainMenu(player, shopId);
        break;
    }
  }
  static async showAddCategory(player, shopId) {
    const form = new ModalFormData();
    form.title("Add New Category");
    form.textField("Category ID", "weapons");
    form.textField("Display Name", "§6Weapons");
    form.textField("Icon Texture", "textures/items/diamond_sword");
    const response = await ForceOpen(player, form);
    if (response.canceled) {
      this.showMenu(player, shopId);
      return;
    }
    const [id, name, icon] = response.formValues;
    if (!id || !name) {
      player.sendMessage("§cCategory ID and Name are required.");
      this.showAddCategory(player, shopId);
      return;
    }
    const config = NPCShopConfig.get(shopId);
    if (config.categories.find((c) => c.id === id)) {
      player.sendMessage("§cCategory ID already exists.");
      this.showAddCategory(player, shopId);
      return;
    }
    config.categories.push({
      id: id.trim(),
      name: name.trim(),
      icon: icon?.trim() || "textures/ui/unknown",
    });
    config.items[id.trim()] = [];
    if (NPCShopConfig.save(config, shopId)) {
      player.sendMessage("§aCategory added successfully!");
      this.showMenu(player, shopId);
    } else {
      player.sendMessage("§cFailed to save config.");
    }
  }
  static async showEditCategories(player, shopId) {
    const config = NPCShopConfig.get(shopId);
    const form = new ActionFormData();
    form.title("Edit Categories");
    config.categories.forEach((cat) => {
      form.button(cat.name, cat.icon);
    });
    form.button("Back", "textures/ui/arrow_left");
    const response = await ForceOpen(player, form);
    if (response.canceled || response.selection === config.categories.length) {
      this.showMenu(player, shopId);
      return;
    }
    this.showEditCategory(player, config.categories[response.selection], shopId);
  }
  static async showEditCategory(player, category, shopId) {
    const config = NPCShopConfig.get(shopId);
    const form = new ModalFormData();
    form.title(`Edit: ${category.name}`);
    form.textField("Display Name", "", { defaultValue: category.name });
    form.textField("Icon Texture", "", { defaultValue: category.icon || "" });
    form.toggle("§cDelete Category", { defaultValue: false });
    const response = await ForceOpen(player, form);
    if (response.canceled) {
      this.showEditCategories(player, shopId);
      return;
    }
    const [name, icon, deleteCat] = response.formValues;
    if (deleteCat) {
      const idx = config.categories.findIndex((c) => c.id === category.id);
      if (idx !== -1) config.categories.splice(idx, 1);
      delete config.items[category.id];
      if (NPCShopConfig.save(config, shopId)) {
        player.sendMessage("§cCategory deleted.");
        this.showEditCategories(player, shopId);
      }
      return;
    }
    category.name = name.trim();
    category.icon = icon?.trim() || "textures/ui/unknown";
    if (NPCShopConfig.save(config, shopId)) {
      player.sendMessage("§aCategory updated.");
      this.showEditCategories(player, shopId);
    } else {
      player.sendMessage("§cFailed to save config.");
    }
  }
  static async showAddItem(player, shopId) {
    const config = NPCShopConfig.get(shopId);
    const form = new ModalFormData();
    form.title("Add Item");
    form.dropdown(
      "Category",
      config.categories.map((c) => c.name)
    );
    form.textField("Item ID", "e.g., minecraft:diamond");
    form.textField("Display Name", "e.g., Diamond");
    form.textField("Price", "e.g., 500");
    form.textField("Amount", "e.g., 1", { defaultValue: "1" });
    form.textField("Icon Path", "e.g., textures/items/diamond");
    const response = await ForceOpen(player, form);
    if (response.canceled) {
      this.showMenu(player, shopId);
      return;
    }
    const [catIndex, id, name, priceStr, amountStr, icon] = response.formValues;
    const categoryId = config.categories[catIndex].id;
    const price = parseInt(priceStr);
    const amount = parseInt(amountStr);
    if (!id || !name || isNaN(price)) {
      player.sendMessage("§cInvalid input. Please fill all fields.");
      this.showMenu(player, shopId);
      return;
    }
    if (!config.items[categoryId]) config.items[categoryId] = [];
    config.items[categoryId].push({
      id: id.trim(),
      name: name.trim(),
      price: price,
      amount: amount,
      icon: icon?.trim() || undefined,
    });
    if (NPCShopConfig.save(config, shopId)) {
      player.sendMessage("§aItem added successfully!");
      this.showMenu(player, shopId);
    } else {
      player.sendMessage("§cFailed to save config.");
    }
  }
  static async showEditItems(player, shopId) {
    const config = NPCShopConfig.get(shopId);
    const form = new ActionFormData();
    form.title("Select Category");
    config.categories.forEach((cat) => {
      const itemCount = config.items[cat.id]?.length || 0;
      form.button(`${cat.name}\n§7${itemCount} items`, cat.icon);
    });
    form.button("Back", "textures/ui/arrow_left");
    const response = await ForceOpen(player, form);
    if (response.canceled || response.selection === config.categories.length) {
      this.showMenu(player, shopId);
      return;
    }
    this.showCategoryItems(player, config.categories[response.selection], shopId);
  }
  static async showCategoryItems(player, category, shopId) {
    const config = NPCShopConfig.get(shopId);
    const items = config.items[category.id] || [];
    if (items.length === 0) {
      player.sendMessage("§cNo items in this category.");
      this.showEditItems(player, shopId);
      return;
    }
    const form = new ActionFormData();
    form.title(`${category.name} Items`);
    items.forEach((item) => {
      form.button(`${item.name}\n§7$${item.price}`);
    });
    form.button("Back", "textures/ui/arrow_left");
    const response = await ForceOpen(player, form);
    if (response.canceled || response.selection === items.length) {
      this.showEditItems(player, shopId);
      return;
    }
    this.showEditItem(player, category, response.selection, shopId);
  }
  static async showEditItem(player, category, index, shopId) {
    const config = NPCShopConfig.get(shopId);
    const item = config.items[category.id][index];
    const form = new ModalFormData();
    form.title(`Edit: ${item.name}`);
    form.textField("Item ID", "", { defaultValue: item.id });
    form.textField("Display Name", "", { defaultValue: item.name });
    form.textField("Price", "", { defaultValue: item.price.toString() });
    form.textField("Amount", "", { defaultValue: (item.amount || 1).toString() });
    form.textField("Icon Path", "", { defaultValue: item.icon || "" });
    form.toggle("§cDelete Item", { defaultValue: false });
    const response = await ForceOpen(player, form);
    if (response.canceled) {
      this.showCategoryItems(player, category, shopId);
      return;
    }
    const [id, name, priceStr, amountStr, icon, deleteItem] = response.formValues;
    if (deleteItem) {
      config.items[category.id].splice(index, 1);
      if (NPCShopConfig.save(config, shopId)) {
        player.sendMessage("§cItem deleted.");
        this.showCategoryItems(player, category, shopId);
      }
      return;
    }
    item.id = id.trim();
    item.name = name.trim();
    item.price = parseInt(priceStr);
    item.amount = parseInt(amountStr);
    item.icon = icon?.trim() || undefined;
    if (NPCShopConfig.save(config, shopId)) {
      player.sendMessage("§aItem updated.");
      this.showCategoryItems(player, category, shopId);
    } else {
      player.sendMessage("§cFailed to save config.");
    }
  }
  static async showResetConfirm(player, shopId) {
    const form = new MessageFormData();
    form.title("§cReset Shop");
    form.body("§eAre you sure you want to reset the shop to default settings?\n\n§cThis action cannot be undone!");
    const response = await form.show(player);
    if (response.canceled || response.selection === 1) {
      this.showMenu(player, shopId);
      return;
    }
    const newConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    NPCShopConfig.save(newConfig, shopId);
    player.sendMessage("§aShop has been reset to default.");
    this.showMenu(player, shopId);
  }
}
export function showNPCShop(player, npcEntity) {
  const shopId = getShopId(npcEntity);
  NPCShop.showMainMenu(player, shopId);
}
export function showNPCShopAdmin(player, npcEntity) {
  const shopId = getShopId(npcEntity);
  NPCShopAdmin.showMenu(player, shopId);
}
function getShopId(npcEntity) {
  if (!npcEntity) return null;
  const tags = npcEntity.getTags();
  const idTag = tags.find(t => t.startsWith("npc_id:"));
  if (idTag) {
    return idTag.replace("npc_id:", "");
  }
  const newId = Math.floor(Math.random() * 1e9).toString();
  try {
    npcEntity.addTag("npc_id:" + newId);
    if (!npcEntity.hasTag("fixed_position")) {
        npcEntity.addTag("fixed_position");
    }
  } catch (e) {
    console.warn("Failed to assign ID to NPC:", e);
    return null;
  }
  return newId;
}
