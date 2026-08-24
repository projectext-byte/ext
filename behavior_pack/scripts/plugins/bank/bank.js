import { system, world, ActionFormData, ModalFormData } from "../../core.js";
import { ScoreboardDB } from "../../board/data.js";
import {
  getFullMoney,
  addMoney,
  removeMoney,
  formatMoneyValue,
} from "../../function/moneySystem.js";
import { metricNumbers } from "../../lib/game.js";
import { GlobalConfig } from "../../function/GlobalConfig.js";
const CURRENCY_DEFAULT = "$";
let currencySymbol = CURRENCY_DEFAULT;
let userTimezone = "+7";
system.runInterval(() => {
  try {
    currencySymbol =
      ScoreboardDB.get("ScoreboardDBConfig-currency") ?? CURRENCY_DEFAULT;
    const timezone = GlobalConfig.get("time:timezone");
    if (timezone) {
      userTimezone = timezone.replace("UTC", "");
    } else {
      userTimezone =
        ScoreboardDB.get("ScoreboardDBConfig-offset-timezone") ?? "+7";
    }
  } catch {
    currencySymbol = CURRENCY_DEFAULT;
    userTimezone = "+7";
  }
}, 100);
function getBankPropertyKey(player) {
  return `bank_balance_${player.name}`;
}
function getBankTimestampKey(player) {
  return `bank_timestamp_${player.name}`;
}
function migrateBankIfNeeded(player) {
  const key = getBankPropertyKey(player);
  if (player.getDynamicProperty(key) !== undefined) return;
  let base = 0,
    billion = 0,
    trillion = 0;
  try {
    base =
      world.scoreboard
        .getObjective("bank")
        ?.getScore(player.scoreboardIdentity) || 0;
    billion =
      world.scoreboard
        .getObjective("bank_billion")
        ?.getScore(player.scoreboardIdentity) || 0;
    trillion =
      world.scoreboard
        .getObjective("bank_trillion")
        ?.getScore(player.scoreboardIdentity) || 0;
  } catch { }
  const total =
    BigInt(base) +
    BigInt(billion) * 1000000000n +
    BigInt(trillion) * 1000000000000n;
  if (total > 0n) {
    player.setDynamicProperty(key, total.toString());
    try {
      world
        .getDimension("overworld")
        .runCommand(`scoreboard players set "${player.name}" bank 0`);
      world
        .getDimension("overworld")
        .runCommand(`scoreboard players set "${player.name}" bank_billion 0`);
      world
        .getDimension("overworld")
        .runCommand(`scoreboard players set "${player.name}" bank_trillion 0`);
    } catch { }
  }
}
export function getBank(player) {
  migrateBankIfNeeded(player);
  const val = player.getDynamicProperty(getBankPropertyKey(player));
  return val !== undefined ? BigInt(val) : 0n;
}
export function setBank(player, amount) {
  migrateBankIfNeeded(player);
  player.setDynamicProperty(
    getBankPropertyKey(player),
    BigInt(amount).toString(),
  );
  player.setDynamicProperty(
    getBankTimestampKey(player),
    Date.now().toString(),
  );
}
export function addBank(player, amount) {
  migrateBankIfNeeded(player);
  setBank(player, getBank(player) + BigInt(amount));
}
export function getBankTimestamp(player) {
  const val = player.getDynamicProperty(getBankTimestampKey(player));
  return val !== undefined ? BigInt(val) : 0n;
}
function removeBank(player, amount) {
  migrateBankIfNeeded(player);
  const current = getBank(player);
  const amt = BigInt(amount);
  if (amt > current) return false;
  setBank(player, current - amt);
  return true;
}
world.afterEvents.playerSpawn.subscribe(({ player }) => {
  migrateBankIfNeeded(player);
});
function getCurrentTimeWithOffset() {
  const now = new Date();
  const offsetMatch = userTimezone.match(/([+-])(\d+)/);
  if (offsetMatch) {
    const sign = offsetMatch[1] === "+" ? 1 : -1;
    const hours = parseInt(offsetMatch[2]);
    const offset = sign * hours * 60;
    const userTime = new Date(
      now.getTime() + (offset - now.getTimezoneOffset()) * 60000,
    );
    return userTime.toLocaleTimeString();
  } else {
    return now.toLocaleTimeString();
  }
}
const getMoney = (player) => getFullMoney(player);
const TRANSACTION_HISTORY_KEY = (player) => `bank_transactions_${player.name}`;
const TRANSACTION_HISTORY_LIMIT = 10;
export function addTransaction(player, text) {
  const key = TRANSACTION_HISTORY_KEY(player);
  let arr = [];
  try {
    const raw = player.getDynamicProperty(key);
    if (raw) arr = JSON.parse(raw);
  } catch { }
  arr.push(text);
  if (arr.length > TRANSACTION_HISTORY_LIMIT)
    arr = arr.slice(-TRANSACTION_HISTORY_LIMIT);
  player.setDynamicProperty(key, JSON.stringify(arr));
}
export function getTransactions(player) {
  const key = TRANSACTION_HISTORY_KEY(player);
  try {
    const raw = player.getDynamicProperty(key);
    if (raw) return JSON.parse(raw);
  } catch { }
  return [];
}
export function Bank(player) {
  const money = getMoney(player);
  const bank = getBank(player);
  const menu = new ActionFormData()
    .title("§6BANK MENU")
    .body(
      `§fMoney: §e${currencySymbol}${formatMoneyValue(money)}\n§fBank: §e${currencySymbol}${formatMoneyValue(bank)}`,
    )
    .button("§2Deposit", "textures/ui/icon_map.png")
    .button("§2Withdraw", "textures/ui/icon_book_writable.png")
    .button("§6Transactions", "textures/ui/lock_color.png")
    .button("§bTransfer", "textures/ui/FriendsIcon.png")
    .button("§cExit", "textures/ui/cancel.png");
  menu
    .show(player)
    .then((res) => {
      if (res.canceled) return;
      switch (res.selection) {
        case 0:
          handleDeposit(player);
          break;
        case 1:
          handleWithdraw(player);
          break;
        case 2:
          showTransactions(player);
          break;
        case 3:
          handleBankTransfer(player);
          break;
        case 4:
          player.playSound("note.bass");
          break;
      }
    })
    .catch(() => {
      player.sendMessage(
        "[BANK] Error displaying bank menu. Please try again.",
      );
    });
}
function handleBankTransfer(player) {
  const onlinePlayers = world
    .getPlayers()
    .filter((p) => p.name !== player.name);
  if (onlinePlayers.length === 0) {
    player.sendMessage("[BANK] No other players online to transfer to.");
    player.playSound("note.bass");
    return;
  }
  const form = new ActionFormData()
    .title("§bBANK TRANSFER")
    .body("Select a player to transfer bank balance to:");
  onlinePlayers.forEach((p) => {
    form.button(p.name, "textures/ui/FriendsIcon.png");
  });
  form.button("Back", "textures/ui/arrow_left.png");
  form.show(player).then((res) => {
    if (res.canceled) return;
    if (res.selection === onlinePlayers.length) {
      Bank(player);
      return;
    }
    const target = onlinePlayers[res.selection];
    handleBankTransferAmount(player, target);
  }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:bank:bank] promise error:", String(error?.stack ?? error)); } catch {} });
}
function handleBankTransferAmount(player, target, errorMsg = "") {
  const bank = getBank(player);
  if (bank <= 0) {
    player.sendMessage(
      "[BANK] You don't have any money in your bank to transfer.",
    );
    player.playSound("note.bass");
    return;
  }
  const infoText = `Transfer to: ${target.name}\nYour Bank: ${currencySymbol}${metricNumbers(bank.toString())}`;
  const form = new ModalFormData()
    .title("§bBANK TRANSFER §t§p§a")
    .textField("Info", infoText + (errorMsg ? `\n§c${errorMsg}` : ""), {
      defaultValue: infoText + (errorMsg ? `\n§c${errorMsg}` : ""),
      placeholder: "Info",
      disabled: true,
    })
    .textField("Amount to transfer", "Enter amount", {
      defaultValue: "",
      placeholder: "Enter amount",
    })
    .toggle("Confirm Transfer", { defaultValue: true });
  form.show(player).then((result) => {
    if (!result || result.canceled) {
      Bank(player);
      return;
    }
    const input = result.formValues[1];
    if (!input || !/^[0-9]+$/.test(input.replace(/,/g, ""))) {
      handleBankTransferAmount(
        player,
        target,
        "Please enter a valid amount (numbers only)",
      );
      return;
    }
    const amount = BigInt(input.replace(/,/g, ""));
    if (amount <= 0) {
      handleBankTransferAmount(
        player,
        target,
        "Please enter a valid amount greater than 0",
      );
      return;
    }
    if (amount > bank) {
      handleBankTransferAmount(
        player,
        target,
        `Insufficient funds. Your bank: ${currencySymbol}${metricNumbers(bank.toString())}`,
      );
      return;
    }
    const stillOnline = world.getPlayers().find((p) => p.name === target.name);
    if (!stillOnline) {
      player.sendMessage("[BANK] Target player is no longer online.");
      Bank(player);
      return;
    }
    removeBank(player, amount);
    addBank(stillOnline, amount);
    addTransaction(
      player,
      `- ${currencySymbol}${metricNumbers(amount.toString())} to ${target.name} | ${getCurrentTimeWithOffset()}`,
    );
    addTransaction(
      stillOnline,
      `+ ${currencySymbol}${metricNumbers(amount.toString())} from ${player.name} | ${getCurrentTimeWithOffset()}`,
    );
    player.sendMessage(
      `[BANK] Successfully transferred ${currencySymbol}${metricNumbers(amount.toString())} to ${target.name}`,
    );
    stillOnline.sendMessage(
      `[BANK] You received ${currencySymbol}${metricNumbers(amount.toString())} from ${player.name}`,
    );
    player.playSound("random.levelup");
    stillOnline.playSound("random.levelup");
    Bank(player);
  }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:bank:bank] promise error:", String(error?.stack ?? error)); } catch {} });
}
function handleDeposit(player) {
  const money = getMoney(player);
  const bank = getBank(player);
  const form = new ActionFormData()
    .title("§2DEPOSIT")
    .body(
      `§fMoney: §e${currencySymbol}${formatMoneyValue(money)}\n§fBank: §e${currencySymbol}${formatMoneyValue(bank)}\n\n§fSelect amount to deposit:`,
    )
    .button("§dCUSTOM", "textures/ui/settings_glyph_color_2x.png")
    .button(`§a${currencySymbol}100`, "textures/ui/icon_map.png")
    .button(`§a${currencySymbol}1,000`, "textures/ui/icon_map.png")
    .button(`§a${currencySymbol}10,000`, "textures/ui/icon_map.png")
    .button(`§a${currencySymbol}100,000`, "textures/ui/icon_map.png")
    .button(`§a${currencySymbol}1,000,000`, "textures/ui/icon_map.png")
    .button("§a25 Percent of Money", "textures/ui/book_back.png")
    .button("§a50 Percent of Money", "textures/ui/book_back.png")
    .button("§aALL Money", "textures/ui/icon_map.png")
    .button("§cCANCEL", "textures/ui/cancel.png");
  form
    .show(player)
    .then((res) => {
      if (res.canceled || res.selection === 9) return;
      try {
        let amount = BigInt(0);
        switch (res.selection) {
          case 0:
            handleCustomDeposit(player);
            return;
          case 1:
            amount = BigInt(100);
            break;
          case 2:
            amount = BigInt(1000);
            break;
          case 3:
            amount = BigInt(10000);
            break;
          case 4:
            amount = BigInt(100000);
            break;
          case 5:
            amount = BigInt(1000000);
            break;
          case 6:
            amount = money / BigInt(4);
            break;
          case 7:
            amount = money / BigInt(2);
            break;
          case 8:
            amount = money;
            break;
        }
        if (amount > money) {
          player.sendMessage("[BANK] Insufficient funds in your wallet");
          return;
        }
        if (removeMoney(player, amount)) {
          addBank(player, amount);
          player.sendMessage(
            `[BANK] Successfully deposited ${currencySymbol}${metricNumbers(amount.toString())} to your bank`,
          );
          addTransaction(
            player,
            `+ ${currencySymbol}${metricNumbers(amount.toString())} | ${getCurrentTimeWithOffset()}`,
          );
          player.playSound("random.levelup");
        } else {
          player.sendMessage("[BANK] Failed to process transaction");
        }
      } catch {
        player.sendMessage("[BANK] An error occurred while processing deposit");
      }
    })
    .catch(() => {
      player.sendMessage("[BANK] Failed to display deposit menu");
    });
}
function handleCustomDeposit(player) {
  const money = getMoney(player);
  const bank = getBank(player);
  if (money <= 0) {
    player.sendMessage("[BANK] You don't have any money to deposit");
    return;
  }
  const form = new ModalFormData()
    .title("§2§lCUSTOM DEPOSIT §t§p§a")
    .textField(
      `§eBalance Info\n§fMoney: §a${currencySymbol}${formatMoneyValue(money)}\n§fBank: §a${currencySymbol}${formatMoneyValue(bank)}\n\n§eDeposit Amount`,
      "Enter amount to deposit",
      { defaultValue: "", placeholder: "Enter amount" },
    )
    .toggle("§eConfirm Deposit\n§8Double check amount", { defaultValue: true });
  form.show(player).then((res) => {
    if (!res || res.canceled) {
      handleDeposit(player);
      return;
    }
    try {
      const input = res.formValues[0];
      if (!input || !/^[0-9]+$/.test(input.replace(/,/g, ""))) {
        player.sendMessage("[BANK] Please enter a valid amount (numbers only)");
        handleDeposit(player);
        return;
      }
      const amount = BigInt(input.replace(/,/g, ""));
      if (amount <= 0) {
        player.sendMessage("[BANK] Please enter a valid amount greater than 0");
        handleDeposit(player);
        return;
      }
      if (amount > money) {
        player.sendMessage("[BANK] Insufficient funds in your wallet");
        handleDeposit(player);
        return;
      }
      if (removeMoney(player, amount)) {
        addBank(player, amount);
        player.sendMessage(
          `[BANK] Successfully deposited ${currencySymbol}${metricNumbers(amount.toString())} to your bank`,
        );
        addTransaction(
          player,
          `+ ${currencySymbol}${metricNumbers(amount.toString())} | ${getCurrentTimeWithOffset()}`,
        );
        player.runCommand("playsound random.levelup @s");
        handleDeposit(player);
      } else {
        player.sendMessage("[BANK] Failed to process transaction");
        handleDeposit(player);
      }
    } catch {
      player.sendMessage("[BANK] Please enter a valid number");
      handleDeposit(player);
    }
  }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:bank:bank] promise error:", String(error?.stack ?? error)); } catch {} });
}
function handleWithdraw(player) {
  const money = getMoney(player);
  const bank = getBank(player);
  if (bank <= 0) {
    player.sendMessage("[BANK] You don't have any money in your bank");
    return;
  }
  const form = new ActionFormData()
    .title("§2WITHDRAW")
    .body(
      `§fMoney: §e${currencySymbol}${formatMoneyValue(money)}\n§fBank: §e${currencySymbol}${formatMoneyValue(bank)}\n\n§fSelect amount to withdraw:`,
    )
    .button("§dCUSTOM", "textures/ui/settings_glyph_color_2x.png")
    .button(`§a${currencySymbol}100`, "textures/ui/icon_book_writable.png")
    .button(`§a${currencySymbol}1,000`, "textures/ui/icon_book_writable.png")
    .button(`§a${currencySymbol}10,000`, "textures/ui/icon_book_writable.png")
    .button(`§a${currencySymbol}100,000`, "textures/ui/icon_book_writable.png")
    .button(
      `§a${currencySymbol}1,000,000`,
      "textures/ui/icon_book_writable.png",
    )
    .button("§a25 Percent of Bank", "textures/ui/book_back.png")
    .button("§a50 Percent of Bank", "textures/ui/book_back.png")
    .button("§aALL Bank", "textures/ui/icon_book_writable.png")
    .button("§cCANCEL", "textures/ui/cancel.png");
  form
    .show(player)
    .then((res) => {
      if (res.canceled || res.selection === 9) return;
      try {
        let amount = BigInt(0);
        switch (res.selection) {
          case 0:
            handleCustomWithdraw(player);
            return;
          case 1:
            amount = BigInt(100);
            break;
          case 2:
            amount = BigInt(1000);
            break;
          case 3:
            amount = BigInt(10000);
            break;
          case 4:
            amount = BigInt(100000);
            break;
          case 5:
            amount = BigInt(1000000);
            break;
          case 6:
            amount = bank / BigInt(4);
            break;
          case 7:
            amount = bank / BigInt(2);
            break;
          case 8:
            amount = bank;
            break;
        }
        if (amount > bank) {
          player.sendMessage("[BANK] Insufficient funds in your bank");
          return;
        }
        removeBank(player, amount);
        addMoney(player, amount);
        player.sendMessage(
          `[BANK] Successfully withdrew ${currencySymbol}${metricNumbers(amount.toString())} from your bank`,
        );
        addTransaction(
          player,
          `- ${currencySymbol}${metricNumbers(amount.toString())} | ${getCurrentTimeWithOffset()}`,
        );
        player.playSound("random.levelup");
      } catch {
        player.sendMessage(
          "[BANK] An error occurred while processing withdrawal",
        );
      }
    })
    .catch(() => {
      player.sendMessage("[BANK] Failed to display withdraw menu");
    });
}
function handleCustomWithdraw(player) {
  const money = getMoney(player);
  const bank = getBank(player);
  if (bank <= 0) {
    player.sendMessage("[BANK] You don't have any money in your bank");
    return;
  }
  const form = new ModalFormData()
    .title("§2§lCUSTOM WITHDRAW §t§p§a")
    .textField(
      `§eBalance Info\n§fMoney: §a${currencySymbol}${formatMoneyValue(money)}\n§fBank: §a${currencySymbol}${formatMoneyValue(bank)}\n\n§eWithdraw Amount`,
      "Enter amount to withdraw",
      { defaultValue: "", placeholder: "Enter amount" },
    )
    .toggle("§eConfirm Withdrawal\n§8Double check amount", {
      defaultValue: true,
    });
  form.show(player).then((res) => {
    if (!res || res.canceled) {
      handleWithdraw(player);
      return;
    }
    try {
      const input = res.formValues[0];
      if (!input || !/^[0-9]+$/.test(input.replace(/,/g, ""))) {
        player.sendMessage("[BANK] Please enter a valid amount (numbers only)");
        handleWithdraw(player);
        return;
      }
      const amount = BigInt(input.replace(/,/g, ""));
      if (amount <= 0) {
        player.sendMessage("[BANK] Please enter a valid amount greater than 0");
        handleWithdraw(player);
        return;
      }
      if (amount > bank) {
        player.sendMessage("[BANK] Insufficient funds in your bank");
        handleWithdraw(player);
        return;
      }
      removeBank(player, amount);
      addMoney(player, amount);
      player.sendMessage(
        `[BANK] Successfully withdrew ${currencySymbol}${metricNumbers(amount.toString())} from your bank`,
      );
      addTransaction(
        player,
        `- ${currencySymbol}${metricNumbers(amount.toString())} | ${getCurrentTimeWithOffset()}`,
      );
      player.runCommand("playsound random.levelup @s");
      handleWithdraw(player);
    } catch {
      player.sendMessage("[BANK] Please enter a valid number");
      handleWithdraw(player);
    }
  }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:bank:bank] promise error:", String(error?.stack ?? error)); } catch {} });
}
function showTransactions(player) {
  const money = getMoney(player);
  const bank = getBank(player);
  const transactions = getTransactions(player);
  const info = `§7(Max 10 latest transactions)`;
  const form = new ActionFormData()
    .title("§6TRANSACTIONS")
    .body(
      `§fMoney: §e${currencySymbol}${formatMoneyValue(money)}\n§fBank: §e${currencySymbol}${formatMoneyValue(bank)}\n\n${info}\n§fTransactions:\n${transactions.length > 0 ? transactions.join("\n") : "§7No transactions yet."}`,
    )
    .button("§cBack", "textures/ui/arrow_dark_left_stretch.png");
  form
    .show(player)
    .then(() => Bank(player))
    .catch(() => {
      player.sendMessage(
        "[BANK] Error displaying transactions. Please try again.",
      );
    });
}
