import {
  world,
  system,
  ItemStack,
  Player,
  ActionFormData,
  ModalFormData,
  ItemLockMode,
  ItemComponentTypes,
} from "../../core.js";
import { BackpackDatabase } from "./backpack_database.js";

const db = new BackpackDatabase();

const CHEST_SLOT_COUNT = 54;
const COLS = 9;
const TOP_ROW = 0;
const ITEM_ROWS = 4; // Baris 1-4 untuk item
const ACTION_ROW = 5;
const ACTION_START = ACTION_ROW * COLS;

const MAX_DISPLAY_SLOTS = ITEM_ROWS * (COLS - 2); // 4 * 7 = 28

const ITEM_SLOTS = (() => {
  const arr = [];
  for (let row = 1; row <= ITEM_ROWS; row++)
    for (let col = 1; col <= COLS - 2; col++) arr.push(row * COLS + col);
  return arr;
})();

function getUnavailableSlots(maxSlots) {
  const activeSlots = new Set(ITEM_SLOTS.slice(0, maxSlots));
  const unavailable = [];
  for (let row = ITEM_ROWS; row >= 1; row--) {
    for (let col = 1; col <= COLS - 2; col++) {
      const slot = row * COLS + col;
      if (!activeSlots.has(slot)) unavailable.push(slot);
    }
  }
  return unavailable;
}

const SLOT_TO_IDX = new Map(ITEM_SLOTS.map((slot, idx) => [slot, idx]));

// Border atas (baris 0 semua glass)
const TOP_BORDER_SLOTS = (() => {
  const arr = [];
  for (let col = 0; col < COLS; col++) arr.push(TOP_ROW * COLS + col);
  return arr;
})();

// Border kiri dan kanan untuk baris 1-4
const BORDER_SLOTS = (() => {
  const set = new Set();
  for (let row = 1; row <= ITEM_ROWS; row++) {
    set.add(row * COLS + 0);
    set.add(row * COLS + (COLS - 1));
  }
  return set;
})();

// Border bawah (action row) kecuali slot 0 dan 8 untuk tombol
const ACTION_BARRIER_SLOTS = (() => {
  const arr = [];
  for (let col = 1; col <= COLS - 2; col++) arr.push(ACTION_START + col);
  return arr;
})();

const CLOSE_SLOT = ACTION_START;
const DEPOSIT_SLOT = ACTION_START + 8;

const BORDER_TEX = "minecraft:black_stained_glass_pane";
const UNAVAILABLE_TEX = "minecraft:barrier";
const CLOSE_TEX = "textures/items/door_dark_oak";
const DEPOSIT_TEX = "minecraft:chest";
const BACKPACK_ICONS = {
  deposit: "textures/items/ender_pearl",
  back: "textures/ui/arrow_left",
};
const BLOCKED_CUSTOM_ITEM_IDS = new Set(["kwd:item01", "kwd:member01"]);
const BORDER_LABEL = "";
const BORDER_LORE = [];
const UNAVAILABLE_LABEL = "§cLocked";
const UNAVAILABLE_LORE = ["§7Upgrade to unlock"];

function placeBorder(form, slot) {
  form.button(slot, BORDER_LABEL, BORDER_LORE, BORDER_TEX, 1, 0, false);
}

function placeUnavailable(form, slot) {
  form.button(slot, UNAVAILABLE_LABEL, UNAVAILABLE_LORE, UNAVAILABLE_TEX, 1, 0, false);
}

function getCapacityColor(used, max) {
  if (max <= 0 || used <= 0) return "§f";
  const ratio = used / max;
  if (ratio >= 1) return "§c";
  if (ratio >= 0.5) return "§e";
  return "§a";
}

export const BackpackConfig = {
  get: () => {
    try {
      const data = world.getDynamicProperty("backpack_config");
      return data ? JSON.parse(data) : { maxSlots: 27 };
    } catch {
      return { maxSlots: 27 };
    }
  },
  save: (config) => {
    try {
      world.setDynamicProperty("backpack_config", JSON.stringify(config));
      return true;
    } catch {
      return false;
    }
  },
};

export function configureBackpackSystem(player) {
  const config = BackpackConfig.get();
  const current = Math.min(config.maxSlots, MAX_DISPLAY_SLOTS);
  const form = new ModalFormData()
    .title("Backpack Configuration")
    .slider(`Max Slots (1 – ${MAX_DISPLAY_SLOTS})`, 1, MAX_DISPLAY_SLOTS, {
      valueStep: 1,
      defaultValue: current,
    });
  form.show(player).then((res) => {
    if (res.canceled) return;
    const [maxSlots] = res.formValues;
    config.maxSlots = maxSlots;
    if (BackpackConfig.save(config)) {
      player.sendMessage(`§aBackpack max slots set to §f${maxSlots}§a!`);
    } else {
      player.sendMessage("§cFailed to save configuration.");
    }
  });
}

function formatItemName(typeId) {
  return typeId
    .replace(/.*(?<=:)/, "")
    .replace(/_/g, " ")
    .replace(/(^\w|\s\w)/g, (m) => m.toUpperCase());
}

const CUSTOM_ITEM_TEXTURES = {
  "kwd:item01": "textures/items/kiwadmin",
  "kwd:member01": "textures/items/kiwmember",
  "r4isen1920_invsee:inventory": "textures/items/stick",
};

const BLOCK_TEXTURES = new Set([
  "stone", "cobblestone", "dirt", "coarse_dirt", "sand", "gravel", "glass", "obsidian", "bedrock", "netherrack", "end_stone",
  "crafting_table", "furnace", "chest", "barrel", "anvil", "bookshelf", "torch", "lantern", "tnt",
  "diamond_block", "gold_block", "iron_block", "emerald_block", "lapis_block", "redstone_block", "coal_block",
]);

const BLOCK_TEXTURE_ALIASES = {
  grass_block: "grass_side_carried",
  oak_planks: "planks_oak",
  spruce_planks: "planks_spruce",
  birch_planks: "planks_birch",
  jungle_planks: "planks_jungle",
  acacia_planks: "planks_acacia",
  dark_oak_planks: "planks_big_oak",
  oak_log: "log_oak",
  spruce_log: "log_spruce",
  birch_log: "log_birch",
  jungle_log: "log_jungle",
  acacia_log: "log_acacia",
  dark_oak_log: "log_big_oak",
};

function getItemTexturePath(typeId) {
  const raw = String(typeId || "");
  if (CUSTOM_ITEM_TEXTURES[raw]) return CUSTOM_ITEM_TEXTURES[raw];
  const id = raw.replace(/^.*:/, "");
  const block = BLOCK_TEXTURE_ALIASES[id] || (BLOCK_TEXTURES.has(id) || id.endsWith("_ore") || id.endsWith("_block") ? id : "");
  return block ? `textures/blocks/${block}` : `textures/items/${id}`;
}

function getItemDurability(item) {
  if (!item) return null;
  try {
    const dur = item.getComponent(ItemComponentTypes.Durability);
    if (
      !dur ||
      typeof dur.maxDurability !== "number" ||
      typeof dur.damage !== "number"
    )
      return null;
    if (
      dur.damage < 0 ||
      dur.damage > dur.maxDurability ||
      dur.maxDurability <= 0
    )
      return null;
    const remaining = dur.maxDurability - dur.damage;
    return {
      maxDurability: dur.maxDurability,
      currentDamage: dur.damage,
      remainingDurability: remaining,
      durabilityPercentage: Math.floor((remaining / dur.maxDurability) * 100),
    };
  } catch {
    return null;
  }
}

function getItemEnchantments(item) {
  if (!item) return [];
  try {
    const enc = item.getComponent(ItemComponentTypes.Enchantable);
    if (!enc) return [];
    const enchants = enc.getEnchantments();
    if (!enchants || !Array.isArray(enchants)) return [];
    return enchants
      .filter((e) => e?.type?.id)
      .map((e) => ({ id: e.type.id, level: e.level || 1 }));
  } catch {
    return [];
  }
}

function getItemCustomName(item) {
  if (!item) return "";
  try {
    return item.nameTag || "";
  } catch {
    return "";
  }
}

function getItemLore(item) {
  if (!item) return [];
  try {
    return item.getLore() || [];
  } catch {
    return [];
  }
}

function isItemLocked(item) {
  if (!item) return false;
  try {
    return (
      item.lockMode === ItemLockMode.slot ||
      item.lockMode === ItemLockMode.inventory
    );
  } catch {
    return false;
  }
}

function isItemAllowedInBackpack(item) {
  if (!item) return false;
  if (BLOCKED_CUSTOM_ITEM_IDS.has(item.typeId)) return false;
  if (item.typeId === "minecraft:enchanted_book") return false;
  if (item.typeId === "minecraft:bundle") return false;
  if (item.typeId.includes("shulker")) return false;
  if (item.getComponent("inventory")) return false;
  return true;
}

function formatItemDetailInfo(item) {
  const lines = [];
  const name = getItemCustomName(item);
  if (name) lines.push(`Name: ${name}`);
  lines.push(`Type: ${item.typeId}`);
  lines.push(`Amount: x${item.amount}`);
  const enchants = getItemEnchantments(item);
  if (enchants.length > 0)
    lines.push(
      `Enchants: ${enchants.map((e) => `${(e.id || "?").replace("minecraft:", "")} ${e.level}`).join(", ")}`,
    );
  const dur = getItemDurability(item);
  if (dur)
    lines.push(
      `Durability: ${dur.remainingDurability}/${dur.maxDurability} (${dur.durabilityPercentage}%)`,
    );
  const lore = getItemLore(item);
  if (lore.length > 0) lines.push(`Lore: ${lore.join(", ")}`);
  return lines.join("\n");
}

// ─── Main backpack view ───────────────────────────────────────────────────────
function openBackpackMenu(player) {
  showBackpackMenuFree(player);
}

function showBackpackMenuFree(player) {
  const items = db.get(player.name) || [];
  const config = BackpackConfig.get();
  const maxSlots = Math.min(config.maxSlots, MAX_DISPLAY_SLOTS);
  const usedSlots = Math.min(items.length, maxSlots);
  const usedColor = getCapacityColor(usedSlots, maxSlots);
  const form = new ActionFormData()
    .title(`Backpack (${usedSlots}/${maxSlots})`)
    .body(`Slots used: ${usedColor}${usedSlots}/${maxSlots}`);

  for (let i = 0; i < maxSlots && i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const name = getItemCustomName(item);
    const displayName = name || formatItemName(item.typeId);
    const lines = [`x${item.amount}`];
    const enchants = getItemEnchantments(item);
    if (enchants.length > 0) lines.push(`${enchants.length} enchantment(s)`);
    const dur = getItemDurability(item);
    if (dur) lines.push(`Durability ${dur.durabilityPercentage}%`);
    lines.push("Withdraw all");
    form.button(`${displayName}\n${lines.join(" | ")}`, getItemTexturePath(item.typeId));
  }

  const depositSelection = Math.min(items.length, maxSlots);
  const backSelection = depositSelection + 1;
  form.button("Deposit\nStore an item", BACKPACK_ICONS.deposit);
  form.button("Back", BACKPACK_ICONS.back);

  form.show(player).then((res) => {
    if (res.canceled) return;
    const sel = res.selection;
    if (typeof sel !== "number") return showBackpackMenuFree(player);
    if (sel === depositSelection) {
      if (items.length < maxSlots) {
        showDepositInventoryMenu(player);
      } else {
        player.sendMessage("§cYour backpack is full!");
        showBackpackMenuFree(player);
      }
      return;
    }
    if (sel === backSelection) return;
    if (sel < maxSlots && sel < items.length && items[sel]) {
      withdrawItem(player, sel, items[sel].amount, () => showBackpackMenuFree(player));
      return;
    }
    showBackpackMenuFree(player);
  }).catch(() => {
    player.sendMessage("§cAn error occurred while opening the backpack.");
  });
}

function showDepositInventoryMenuFree(player) {
  const inv = player.getComponent("inventory").container;
  const form = new ActionFormData().title("Deposit Item");
  const slotMap = [];

  for (let i = 0; i < inv.size; i++) {
    const item = inv.getItem(i);
    if (
      item &&
      item.typeId !== "minecraft:air" &&
      item.amount > 0 &&
      !isItemLocked(item) &&
      isItemAllowedInBackpack(item)
    ) {
      const name = getItemCustomName(item);
      const displayName = name || formatItemName(item.typeId);
      const lines = [`Slot ${i + 1}`, `x${item.amount}`, "Deposit"];
      const enchants = getItemEnchantments(item);
      if (enchants.length > 0) lines.splice(2, 0, `${enchants.length} enchantment(s)`);
      const dur = getItemDurability(item);
      if (dur) lines.splice(2, 0, `Durability ${dur.durabilityPercentage}%`);
      form.button(`${displayName}\n${lines.join(" | ")}`, getItemTexturePath(item.typeId));
      slotMap.push(i);
    }
  }

  form.button("Back", BACKPACK_ICONS.back);
  form.show(player).then((res) => {
    if (res.canceled) return showBackpackMenuFree(player);
    if (typeof res.selection !== "number") return showDepositInventoryMenuFree(player);
    if (res.selection === slotMap.length) return showBackpackMenuFree(player);
    if (res.selection < slotMap.length) {
      const invSlot = slotMap[res.selection];
      const item = inv.getItem(invSlot);
      if (!item || item.typeId === "minecraft:air" || item.amount <= 0) {
        player.sendMessage("§cItem not found in that slot!");
        return showDepositInventoryMenuFree(player);
      }
      if (isItemLocked(item)) {
        player.sendMessage("§cThis item is locked!");
        return showDepositInventoryMenuFree(player);
      }
      if (!isItemAllowedInBackpack(item)) {
        player.sendMessage("§cThis item type cannot be stored!");
        return showDepositInventoryMenuFree(player);
      }
      showDepositAmountForm(player, invSlot, item);
    }
  });
}

function showDepositInventoryMenu(player) {
  return showDepositInventoryMenuFree(player);
}

function showDepositAmountForm(player, slot, item, errorMsg = "") {
  const itemInfo = formatItemDetailInfo(item);
  const form = new ModalFormData()
    .title("§fDeposit Item")
    .textField(
      `${itemInfo}\n\nHow many do you want to deposit? (1 – ${item.amount})${errorMsg ? `\n§c${errorMsg}` : ""}`,
      "Enter amount",
      { defaultValue: "1" },
    )
    .submitButton("§aDeposit");

  form.show(player).then((res) => {
    if (res.canceled || res.formValues === undefined)
      return showDepositInventoryMenu(player);
    const amount = parseInt(res.formValues[0]);
    if (isNaN(amount) || amount < 1 || amount > item.amount)
      return showDepositAmountForm(
        player,
        slot,
        item,
        "Invalid amount! Please enter a valid number.",
      );
    depositItem(player, slot, amount, () => showDepositInventoryMenu(player));
  });
}

function depositItem(player, slot, amount, cb) {
  if (typeof amount !== "number" || isNaN(amount) || amount <= 0) {
    player.sendMessage("§cInvalid deposit amount!");
    if (cb) cb();
    return;
  }
  const inv = player.getComponent("inventory").container;
  const item = inv.getItem(slot);
  if (!item || item.typeId === "minecraft:air" || item.amount < amount) {
    player.sendMessage("§cItem not found or not enough amount!");
    if (cb) cb();
    return;
  }
  if (isItemLocked(item)) {
    player.sendMessage("§cThis item is locked!");
    if (cb) cb();
    return;
  }
  if (!isItemAllowedInBackpack(item)) {
    player.sendMessage("§cThis item type cannot be stored!");
    if (cb) cb();
    return;
  }

  const backpack = db.get(player.name) || [];
  const config = BackpackConfig.get();
  const maxSlots = Math.min(config.maxSlots, MAX_DISPLAY_SLOTS);

  if (backpack.length >= maxSlots) {
    player.sendMessage("§cBackpack is full!");
    if (cb) cb();
    return;
  }

  const clone = item.clone();
  clone.amount = amount;
  backpack.push(clone);
  db.set(player.name, backpack);

  const remaining = item.amount - amount;
  if (remaining > 0) {
    const leftover = item.clone();
    leftover.amount = remaining;
    inv.setItem(slot, leftover);
  } else {
    inv.setItem(slot, undefined);
  }

  player.sendMessage(
    `§aDeposited §f${amount}x ${formatItemName(item.typeId)} §ato your backpack!`,
  );
  if (cb) cb();
}

function withdrawItem(player, idx, amount, cb) {
  const backpack = db.get(player.name) || [];
  if (idx < 0 || idx >= backpack.length || !backpack[idx]) {
    player.sendMessage("§cInvalid slot!");
    if (cb) cb();
    return;
  }

  const item = backpack[idx];
  const giveAmount = Math.min(item.amount, amount);

  try {
    const give = item.clone();
    give.amount = giveAmount;
    const inv = player.getComponent("inventory").container;
    inv.addItem(give);
  } catch {
    player.sendMessage("§cFailed to withdraw item!");
    if (cb) cb();
    return;
  }

  if (item.amount > giveAmount) {
    backpack[idx].amount = item.amount - giveAmount;
  } else {
    backpack.splice(idx, 1);
  }

  db.set(player.name, backpack);
  player.sendMessage(
    `§aWithdrew §f${giveAmount}x ${formatItemName(item.typeId)} §afrom your backpack!`,
  );
  if (cb) cb();
}

export { openBackpackMenu };
