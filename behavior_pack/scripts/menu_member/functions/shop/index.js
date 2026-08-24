import { world, system, ItemStack, EnchantmentType, ActionFormData, CustomForm, ObservableBoolean, ObservableString } from '../../../core.js';
import { ForceOpen, metricNumbers } from "../../../lib/game.js";
import { shopConfig, loadShopConfig, getShopCurrency, getShopCurrencySymbol, getShopCurrencyName, getShopCurrencyMode } from "../../config_shop.js";
import {
  getFullMoney,
  addMoney,
  removeMoney,
  formatMoneyValue,
  getFormattedMoney,
} from "../../../function/moneySystem.js";
import {
  getPlayerCoins,
  addPlayerCoins,
  removePlayerCoins,
} from "../../../plugins/tf-money/tf-money.js";
import { getEconomyBenefits } from "../../../plugins/ranks/rank_benefits.js";
const SHOP_MAX_QUANTITY = 64 * 1000;

function parseShopQuantity(raw) {
  const parsed = Math.floor(Number(String(raw ?? "").trim()));
  if (!Number.isFinite(parsed) || parsed < 1) return 0;
  return Math.min(parsed, SHOP_MAX_QUANTITY);
}
function getShopBalance(player) {
  const currency = getShopCurrency();
  if (currency === "money") {
    return getFullMoney(player);
  }
  try {
    const objective = world.scoreboard.getObjective(currency);
    if (!objective) {
      console.warn(`[Shop] Currency objective "${currency}" not found`);
      return BigInt(0);
    }
    const score = objective.getScore(player.scoreboardIdentity) || 0;
    return BigInt(Math.max(score, 0));
  } catch (e) {
    console.warn(`[Shop] Error getting balance for currency ${currency}:`, e);
    return BigInt(0);
  }
}
function addShopBalance(player, amount) {
  const currency = getShopCurrency();
  if (currency === "money") {
    return addMoney(player, amount);
  }
  try {
    const objective = world.scoreboard.getObjective(currency) ??
      world.scoreboard.addObjective(currency, currency);
    const currentScore = objective.getScore(player.scoreboardIdentity) || 0;
    const newScore = currentScore + Number(amount);
    system.run(() => {
      objective.setScore(player, newScore);
    });
    return true;
  } catch (e) {
    console.warn(`[Shop] Error adding balance for currency ${currency}:`, e);
    return false;
  }
}
function removeShopBalance(player, amount) {
  const currency = getShopCurrency();
  if (currency === "money") {
    return removeMoney(player, amount);
  }
  try {
    const objective = world.scoreboard.getObjective(currency);
    if (!objective) {
      console.warn(`[Shop] Currency objective "${currency}" not found`);
      return false;
    }
    const currentScore = objective.getScore(player.scoreboardIdentity) || 0;
    const newScore = currentScore - Number(amount);
    if (newScore < 0) return false;
    system.run(() => {
      objective.setScore(player, newScore);
    });
    return true;
  } catch (e) {
    console.warn(`[Shop] Error removing balance for currency ${currency}:`, e);
    return false;
  }
}
function formatShopBalance(amount) {
  const currency = getShopCurrency();
  if (currency === "money") {
    return formatMoneyValue(amount);
  }
  return metricNumbers(amount.toString());
}
function getEffectiveCurrencyType(item) {
  const mode = getShopCurrencyMode();
  if (mode === "money") return "money";
  if (mode === "coin") return "coin";
  return item?.currencyType || "money";
}
function getItemBalance(player, currencyType) {
  if (currencyType === "coin") {
    return BigInt(getPlayerCoins(player));
  }
  return getFullMoney(player);
}
function removeItemBalance(player, amount, currencyType) {
  if (currencyType === "coin") {
    return removePlayerCoins(player, Number(amount));
  }
  return removeMoney(player, amount);
}
function addItemBalance(player, amount, currencyType) {
  if (currencyType === "coin") {
    return addPlayerCoins(player, Number(amount));
  }
  return addMoney(player, amount);
}
function formatItemBalance(amount, currencyType) {
  if (currencyType === "coin") {
    return metricNumbers(amount.toString());
  }
  return formatMoneyValue(amount);
}
const pendingTransactions = new Map();
function processPendingTransactions() {
  if (pendingTransactions.size === 0) return;
  for (const [playerId, transactions] of pendingTransactions.entries()) {
    if (transactions.length === 0) {
      pendingTransactions.delete(playerId);
      continue;
    }
    const transaction = transactions.shift();
    transaction.execute();
    if (transactions.length === 0) {
      pendingTransactions.delete(playerId);
    }
  }
}
function queueTransaction(player, executeFunc, onComplete = null) {
  const playerId = player.id || player.name;
  if (!pendingTransactions.has(playerId)) {
    pendingTransactions.set(playerId, []);
  }
  pendingTransactions.get(playerId).push({
    execute: async () => {
      await executeFunc();
      if (onComplete) onComplete();
    },
  });
  if (pendingTransactions.get(playerId).length === 1) {
    processPendingTransactions();
  }
}
function runCommand(command) {
  try {
    return world.getDimension("overworld").runCommand(command);
  } catch (error) {
    console.warn("Command execution error:", command, error);
    throw error;
  }
}
function getInventoryContainer(player) {
  try {
    return player.getComponent("inventory")?.container || null;
  } catch {
    return null;
  }
}
function countEmptyInventorySlots(player) {
  const container = getInventoryContainer(player);
  if (!container) return 0;
  let emptySlots = 0;
  for (let i = 0; i < container.size; i++) {
    if (!container.getItem(i)) emptySlots++;
  }
  return emptySlots;
}
function hasSpaceForShopPurchase(player, item, quantity) {
  const emptySlots = countEmptyInventorySlots(player);
  const requiredSlots = item?.enchantments ? Math.max(1, quantity) : 1;
  return { ok: emptySlots >= requiredSlots, emptySlots, requiredSlots };
}
function showInventoryFullStatus(statusLabel, player, space) {
  const slotText = space.requiredSlots === 1 ? "slot" : "slots";
  statusLabel.setData(`§cInventory full! Empty at least §e${space.requiredSlots} ${slotText}§c first.`);
  player.playSound("note.bass");
}
export async function Shop(player) {
  loadShopConfig();
  const currencySymbol = getShopCurrencySymbol();
  const currencyName = getShopCurrencyName();
  const mode = getShopCurrencyMode();
  let bodyText = `§l§aUser Information \n§r§aName : §e${player.name} \n`;
  if (mode === "dual") {
    const moneyBalance = getFullMoney(player);
    const coinBalance = getPlayerCoins(player);
    bodyText += `§r§aMy Money : §e${getFormattedMoney(player)} \n`;
    bodyText += `§r§aMy Coins : §e${metricNumbers(coinBalance.toString())} \n`;
  } else if (mode === "coin") {
    const coinBalance = getPlayerCoins(player);
    bodyText += `§r§aMy Coins : §e${metricNumbers(coinBalance.toString())} \n`;
  } else {
    const balance = getShopBalance(player);
    bodyText += `§r§aMy ${currencyName} : §e${currencySymbol}${formatShopBalance(balance)} \n`;
  }
  const form = new ActionFormData()
    .title(`SHOP UI`)
    .body(bodyText);
  const displayedCategories = shopConfig.categories.filter(c => c.enabled !== false);
  for (const category of displayedCategories) {
    form.button(`${category.name}\n§r§oClick or tap`, category.icon);
  }
  form.button(
    "§l§0(§l§cCLOSE§l§0)\n§r§oClick to return",
    "textures/ui/arrow_left.png",
  );
  const result = await ForceOpen(player, form);
  if (result.canceled || result.selection === displayedCategories.length) {
    return;
  }
  if (result.selection < displayedCategories.length) {
    const selectedCategory = displayedCategories[result.selection];
    if (selectedCategory.id === "tools") {
      Tools(player);
    } else if (selectedCategory.id === "armor") {
      Armor(player);
    } else {
      buySell(
        player,
        shopConfig.items[selectedCategory.id],
        selectedCategory.name,
      );
    }
  }
}
function Tools(player) {
  loadShopConfig();
  const allTools = shopConfig.items.tools || [];
  const swords = allTools.filter(
    (item) => item.item && item.item.includes("sword"),
  );
  const axes = allTools.filter(
    (item) => item.item && item.item.includes("axe"),
  );
  const pickaxes = allTools.filter(
    (item) => item.item && item.item.includes("pickaxe"),
  );
  const shovels = allTools.filter(
    (item) => item.item && item.item.includes("shovel"),
  );
  const toolCategories = [
    {
      id: "sword",
      name: "§l§0(§8§lSWORD§l§0)",
      icon: "textures/items/diamond_sword.png",
      items: swords,
    },
    {
      id: "axe",
      name: "§l§0(§8§lAXE§l§0)",
      icon: "textures/items/diamond_axe.png",
      items: axes,
    },
    {
      id: "pickaxe",
      name: "§l§0(§8§lPICKAXE§l§0)",
      icon: "textures/items/diamond_pickaxe.png",
      items: pickaxes,
    },
    {
      id: "shovel",
      name: "§l§0(§8§lSHOVEL§l§0)",
      icon: "textures/items/diamond_shovel.png",
      items: shovels,
    },
  ];
  const gui = new ActionFormData()
    .title(`§6SHOP UI`)
    .body(`§7Tool Categories - Choose a tool type`);
  toolCategories.forEach((category) => {
    gui.button(`${category.name}\n§r§0Open`, category.icon);
  });
  gui.button("§l§cBack\n§r§oPress", "textures/ui/arrow_left.png");
  gui.show(player).then((result) => {
    if (result.canceled) {
      Shop(player);
      return;
    }
    if (result.selection < toolCategories.length) {
      const category = toolCategories[result.selection];
      buySell(player, category.items, category.name, true);
    } else {
      Shop(player);
    }
  });
}
function Armor(player) {
  loadShopConfig();
  const helmets = shopConfig.items.helmet || [];
  const chestplates = shopConfig.items.chestplate || [];
  const leggings = shopConfig.items.leggings || [];
  const boots = shopConfig.items.boots || [];
  const armorCategories = [
    {
      id: "helmet",
      name: "§l§0(§a§lHELMET§l§0)",
      icon: "textures/items/diamond_helmet.png",
      items: helmets,
    },
    {
      id: "chestplate",
      name: "§l§0(§a§lCHESTPLATE§l§0)",
      icon: "textures/items/diamond_chestplate.png",
      items: chestplates,
    },
    {
      id: "leggings",
      name: "§l§0(§a§lLEGGINGS§l§0)",
      icon: "textures/items/diamond_leggings.png",
      items: leggings,
    },
    {
      id: "boots",
      name: "§l§0(§a§lBOOTS§l§0)",
      icon: "textures/items/diamond_boots.png",
      items: boots,
    },
  ];
  const gui = new ActionFormData()
    .title(`§6SHOP UI`)
    .body(`§7Armor Categories - Choose armor type`);
  armorCategories.forEach((category) => {
    gui.button(`${category.name}\n§r§0Open`, category.icon);
  });
  gui.button("§l§cBack\n§r§oPress", "textures/ui/arrow_left.png");
  gui.show(player).then((result) => {
    if (result.canceled) {
      Shop(player);
      return;
    }
    if (result.selection < armorCategories.length) {
      const category = armorCategories[result.selection];
      buySell(player, category.items, category.name, false, true);
    } else {
      Shop(player);
    }
  });
}
function buySell(
  player,
  itemName,
  categoryName,
  fromTools = false,
  fromArmor = false,
) {
  if (!itemName || !Array.isArray(itemName) || itemName.length === 0) {
    const gui = new ActionFormData()
      .title(`Items`)
      .body("§cNo items found in this category.")
      .button("§l§cBack\n§r§oPress", "textures/ui/arrow_left.png");
    gui.show(player).then((result) => {
      if (fromTools) {
        Tools(player);
      } else if (fromArmor) {
        Armor(player);
      } else {
        Shop(player);
      }
    });
    return;
  }
  showItemsMenu(player, itemName, categoryName, fromTools, fromArmor);
}
function showItemsMenu(
  player,
  itemName,
  categoryName,
  fromTools = false,
  fromArmor = false,
) {
  const gui = new ActionFormData();
  gui.title(`Items`).body(`§7Manage items (${itemName.length} items)`);
  if (!itemName || !Array.isArray(itemName) || itemName.length === 0) {
    gui.body("§cNo items found in this category.");
    gui.button("§l§cBack\n§r§oPress", "textures/ui/arrow_left.png");
    gui.show(player).then((result) => {
      if (fromTools) {
        Tools(player);
      } else if (fromArmor) {
        Armor(player);
      } else {
        Shop(player);
      }
    });
    return;
  }
  const mode = getShopCurrencyMode();
  for (const item of itemName) {
    if (item && item.name && item.cost) {
      const currencyType = getEffectiveCurrencyType(item);
      const currencyTag = mode === "dual"
        ? (currencyType === "coin" ? " §6[C]" : " §a[$]")
        : "";
      gui.button(
        `${item.name}${currencyTag}\n§r§7Buy: §a${item.cost} §r§7Sell: §c${item.sell}`,
        `${item.textures}`,
      );
    }
  }
  gui.button("§l§cBack\n§r§oPress", "textures/ui/arrow_left.png");
  gui.show(player).then((result) => {
    if (result.canceled) {
      if (fromTools) {
        Tools(player);
      } else if (fromArmor) {
        Armor(player);
      } else {
        Shop(player);
      }
      return;
    }
    if (result.selection === itemName.length) {
      if (fromTools) {
        Tools(player);
      } else if (fromArmor) {
        Armor(player);
      } else {
        Shop(player);
      }
      return;
    }
    if (result.selection >= 0 && result.selection < itemName.length) {
      const item = itemName[result.selection];
      showTransactionMenu(
        player,
        item,
        itemName,
        categoryName,
        fromTools,
        fromArmor,
      );
    }
  });
}
function showTransactionMenu(
  player,
  item,
  itemName,
  categoryName,
  fromTools = false,
  fromArmor = false,
) {
  const currencyType = getEffectiveCurrencyType(item);
  const isCoin = currencyType === "coin";
  const currencySymbol = isCoin ? "§6" : getShopCurrencySymbol();
  const currencyName = isCoin ? "Coins" : getShopCurrencyName();
  const moneyAmount = getItemBalance(player, currencyType);
  const economyBenefits = getEconomyBenefits(player);
  const discountPercent = economyBenefits.discount || 0;
  let finalCost = item.cost;
  if (discountPercent > 0) {
    finalCost = Math.floor(item.cost * (1 - discountPercent / 100));
    if (finalCost < 1 && item.cost > 0) finalCost = 1;
  }

  const isBuyObs = new ObservableBoolean(true, { clientWritable: true });
  const qtyInput = new ObservableString("1", { clientWritable: true });

  const buyPriceLabel = discountPercent > 0
    ? `§7Buy: §m${item.cost}§r §a${finalCost} §7(§a${discountPercent}% off§7)`
    : `§7Buy: §a${finalCost}`;

  const modeLabel = new ObservableString("§7Mode: §a§lBUY");
  const qtyLabel = new ObservableString("§7Qty: §f1");
  const unitLabel = new ObservableString(`§7Unit: §e${currencySymbol}${formatItemBalance(finalCost, currencyType)}`);
  const totalLabel = new ObservableString(`§7Total: §6${currencySymbol}${formatItemBalance(finalCost, currencyType)}`);
  const statusLabel = new ObservableString("");
  let queuedCount = 0;

  function getQuantity() {
    return parseShopQuantity(qtyInput.getData());
  }

  function updateDynamic() {
    const isBuy = isBuyObs.getData();
    const raw = String(qtyInput.getData() ?? "").trim();
    const quantity = getQuantity();
    const unitPrice = isBuy ? finalCost : item.sell;
    const total = quantity > 0 ? unitPrice * quantity : 0;
    const modeColor = isBuy ? "§a" : "§c";
    const modeText = isBuy ? "BUY" : "SELL";
    modeLabel.setData(`§7Mode: ${modeColor}§l${modeText}`);
    qtyLabel.setData(
      quantity > 0 || !raw
        ? `§7Qty: §f${quantity > 0 ? quantity : 0}`
        : `§7Qty: §cinvalid`,
    );
    unitLabel.setData(`§7Unit: §e${currencySymbol}${formatItemBalance(unitPrice, currencyType)}`);
    totalLabel.setData(`§7Total: §6${currencySymbol}${formatItemBalance(total, currencyType)}`);
  }

  qtyInput.subscribe(() => updateDynamic());
  isBuyObs.subscribe(() => updateDynamic());

  const balanceLabel = isCoin
    ? `§7Balance: §6${metricNumbers(getPlayerCoins(player).toString())} Coins`
    : `§7Balance: §a${getFormattedMoney(player)}`;

  const transactionForm = new CustomForm(player, "§s§h§o§p§e" + item.name)
  .spacer()
    .label(buyPriceLabel)
    .spacer()
    .label(`§7Sell: §c${item.sell}`)
    .spacer()
    .divider()
    .spacer()
    .label(modeLabel)
    .spacer()
    .label(qtyLabel)
    .spacer()
    .label(unitLabel)
    .spacer()
    .label(totalLabel)
    .spacer()
    .divider()
    .spacer()
    .label(balanceLabel)
    .spacer()
    .label(statusLabel)
    .textField("Quantity", qtyInput, {
      description: `Enter amount (1-${SHOP_MAX_QUANTITY})`,
      placeholder: "1",
    })
    .spacer()
    .toggle("Sell / Buy", isBuyObs)
    .spacer()
    .button("Submit", () => {
      const isBuy = isBuyObs.getData();
      const quantity = getQuantity();

      if (quantity <= 0) {
        statusLabel.setData(`§cEnter a valid amount (1-${SHOP_MAX_QUANTITY})!`);
        player.playSound("note.bass");
        return;
      }
      const health = player.getComponent("minecraft:health");
      if (health && health.currentValue <= 0) {
        statusLabel.setData("§cYou cannot trade while dead!");
        return;
      }
      const dataCost = finalCost * quantity;
      const dataSell = item.sell * quantity;

      if (isBuy) {
      const space = hasSpaceForShopPurchase(player, item, quantity);
      if (!space.ok) {
        showInventoryFullStatus(statusLabel, player, space);
        return;
      }
      const currentBalance = getItemBalance(player, currencyType);
      if (currentBalance < BigInt(dataCost)) {
        statusLabel.setData(`§cNot enough ${currencyName}! Need §e${currencySymbol}${dataCost}`);
        player.playSound(`note.bass`);
      } else {
        queuedCount++;
        statusLabel.setData(`§aPurchasing x${quantity} ${item.name}...${queuedCount > 1 ? ` §7[§ex${queuedCount}§7 queued]` : ""}`);
        queueTransaction(
          player,
          async () => {
            try {
              const freshBalance = getItemBalance(player, currencyType);
              if (freshBalance < BigInt(dataCost)) {
                statusLabel.setData(`§cNot enough ${currencyName}! Balance changed.`);
                player.playSound("note.bass");
                const playerId = player.id || player.name;
                if (pendingTransactions.has(playerId)) pendingTransactions.get(playerId).length = 0;
                queuedCount = 0;
                return;
              }
              const freshSpace = hasSpaceForShopPurchase(player, item, quantity);
              if (!freshSpace.ok) {
                showInventoryFullStatus(statusLabel, player, freshSpace);
                const playerId = player.id || player.name;
                if (pendingTransactions.has(playerId)) pendingTransactions.get(playerId).length = 0;
                queuedCount = 0;
                return;
              }
              player.sendMessage(`§e======= §6PURCHASE SUMMARY §e=======`);
              player.sendMessage(
                `§7Item: §f${item.name} §7[§f${item.item}:${item.data || 0}§7]`,
              );
              player.sendMessage(`§7Price per unit: §e${finalCost}${discountPercent > 0 ? ` §7(Orig: ${item.cost})` : ""}`);
              player.sendMessage(`§7Quantity: §f${quantity}`);
              player.sendMessage(`§7Total cost: §e${dataCost}`);
              player.sendMessage(`§e==============================`);
              try {
                runCommand(`gamerule sendcommandfeedback false`);
                removeItemBalance(player, dataCost, currencyType);
                if (item.enchantments) {
                  try {
                    const inventory = player.getComponent("inventory");
                    if (inventory && inventory.container) {
                      const enchants = item.enchantments.split(",");
                      let successfulPurchases = 0;
                      for (let i = 0; i < quantity; i++) {
                        try {
                          const enchantedBook = new ItemStack("minecraft:enchanted_book", 1);
                          const enchantComp = enchantedBook.getComponent("enchantable");
                          if (enchantComp && enchantComp.addEnchantment) {
                            for (const ench of enchants) {
                              const parts = ench.split(":");
                              const lvl = parseInt(parts.pop());
                              let id = parts.join(":");
                              if (id.startsWith("minecraft:")) {
                                id = id.substring(10);
                              }
                              try {
                                enchantComp.addEnchantment({
                                  type: new EnchantmentType(id),
                                  level: lvl || 1
                                });
                              } catch (enchErr) {
                                console.warn(`[Shop] Failed to add enchantment ${id}:${lvl}`, enchErr);
                              }
                            }
                          }
                          const remainder = inventory.container.addItem(enchantedBook);
                          if (remainder) {
                            player.dimension.spawnItem(remainder, player.location);
                          }
                          successfulPurchases++;
                        } catch (itemErr) {
                          console.error(`[Shop] Error creating enchanted book #${i + 1}:`, itemErr);
                        }
                      }
                      if (successfulPurchases < quantity) {
                        player.sendMessage(`§e[Shop] Only ${successfulPurchases}/${quantity} enchanted books were created.`);
                      }
                    } else {
                      throw new Error("Inventory not found");
                    }
                  } catch (e) {
                    console.error("Error giving enchanted item:", e);
                    player.sendMessage("§cError processing enchanted items.");
                  }
                } else {
                  runCommand(
                    `give "${player.name}" ${item.item} ${quantity} ${item.data || 0}`,
                  );
                }
                runCommand(`gamerule sendcommandfeedback true`);
              } catch (commandError) {
                console.error("Command error:", commandError);
              }
              player.sendMessage(
                `§7You have purchased §ex${quantity} ${item.name} §7for §e${currencySymbol}${dataCost} ${currencyName}`,
              );
              player.playSound(`random.orb`);
            } catch (error) {
              console.error("Transaction error:", error);
              try {
                runCommand(`gamerule sendcommandfeedback true`);
              } catch (e) { }
              player.sendMessage("§cTransaction failed. Please try again.");
            } finally {
              queuedCount--;
              if (queuedCount > 0) {
                statusLabel.setData(`§7Processing... §e${queuedCount}§7 left`);
              }
            }
          },
        );
      }
      } else {
      if (item.notsold) {
        statusLabel.setData("§cThis item cannot be sold.");
        player.playSound("note.bass");
        return;
      } else {
        queuedCount++;
        statusLabel.setData(`§aSelling x${quantity} ${item.name}...${queuedCount > 1 ? ` §7[§ex${queuedCount}§7 queued]` : ""}`);
        queueTransaction(
          player,
          async () => {
            try {
              const inventory = player.getComponent("inventory");
              if (!inventory || !inventory.container) {
                statusLabel.setData("§cInventory error.");
                player.playSound("note.bass");
                const playerId = player.id || player.name;
                if (pendingTransactions.has(playerId)) pendingTransactions.get(playerId).length = 0;
                queuedCount = 0;
                return;
              }
              const container = inventory.container;
              const itemIdBase = item.item.replace("minecraft:", "");
              const targetItemId = `minecraft:${itemIdBase}`;
              let totalFound = 0;
              const slotsWithItem = [];
              for (let i = 0; i < container.size; i++) {
                const slotItem = container.getItem(i);
                if (slotItem) {
                  const slotTypeId = slotItem.typeId;
                  const isMatch = slotTypeId === targetItemId ||
                    slotTypeId === `minecraft:${itemIdBase}` ||
                    slotTypeId.endsWith(`:${itemIdBase}`) ||
                    slotTypeId === itemIdBase;
                  if (isMatch) {
                    totalFound += slotItem.amount;
                    slotsWithItem.push({ slot: i, item: slotItem, amount: slotItem.amount });
                  }
                }
              }
              if (totalFound >= quantity) {
                player.sendMessage(`§e======= §6SALE SUMMARY §e=======`);
                player.sendMessage(
                  `§7Item: §f${item.name} §7[§f${item.item}:${item.data || 0}§7]`,
                );
                player.sendMessage(`§7Price per unit: §e${item.sell}`);
                player.sendMessage(`§7Quantity: §f${quantity}`);
                player.sendMessage(`§7Total sale value: §e${dataSell}`);
                player.sendMessage(`§e==============================`);
                let remainingToRemove = quantity;
                for (const slotInfo of slotsWithItem) {
                  if (remainingToRemove <= 0) break;
                  const slotItem = container.getItem(slotInfo.slot);
                  if (!slotItem) continue;
                  if (slotItem.amount <= remainingToRemove) {
                    container.setItem(slotInfo.slot, undefined);
                    remainingToRemove -= slotItem.amount;
                  } else {
                    const newAmount = slotItem.amount - remainingToRemove;
                    slotItem.amount = newAmount;
                    container.setItem(slotInfo.slot, slotItem);
                    remainingToRemove = 0;
                  }
                }
                if (remainingToRemove <= 0) {
                  addItemBalance(player, dataSell, currencyType);
                  player.sendMessage(
                    `§7You successfully sold §ex${quantity} ${item.name} §7for §e${currencySymbol}${dataSell} ${currencyName}`,
                  );
                  player.playSound(`random.orb`);
                } else {
                  statusLabel.setData(`§cFailed to remove items. Transaction cancelled.`);
                  player.playSound(`note.bass`);
                  const playerId = player.id || player.name;
                  if (pendingTransactions.has(playerId)) pendingTransactions.get(playerId).length = 0;
                  queuedCount = 0;
                }
              } else {
                statusLabel.setData(`§cNot enough items! Have §e${totalFound}§c, need §e${quantity}§c.`);
                player.playSound(`note.bass`);
                const playerId = player.id || player.name;
                if (pendingTransactions.has(playerId)) pendingTransactions.get(playerId).length = 0;
                queuedCount = 0;
              }
            } catch (error) {
              console.error("Sale error:", error);
              statusLabel.setData("§cTransaction failed. Please try again.");
              const playerId = player.id || player.name;
              if (pendingTransactions.has(playerId)) pendingTransactions.get(playerId).length = 0;
              queuedCount = 0;
            } finally {
              queuedCount--;
              if (queuedCount > 0) {
                statusLabel.setData(`§7Processing... §e${queuedCount}§7 left`);
              }
            }
          },
        );
      }
      }
    })
    .button("Back", () => { transactionForm.close(); });

  transactionForm.show()
    .then(() => {
      showItemsMenu(player, itemName, categoryName, fromTools, fromArmor);
    })
    .catch(e => {
      console.error("[Shop] Transaction form error:", e);
    });
}
