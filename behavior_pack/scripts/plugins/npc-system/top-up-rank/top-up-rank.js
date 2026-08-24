import { ModalFormData, world, ActionFormData, system, MessageFormData } from "../../../core.js"
import { uuidRanks, setRank } from "../../ranks/rank.js"
import { rankDefault } from "../../ranks/rank_default.js"
import { getFullMoney, addMoney, removeMoney, getMoneySystemMode } from "../../../function/moneySystem.js"
import { GlobalConfig } from "../../../function/GlobalConfig.js"
function getFullMoneyCustom(player, objectiveName) {
  const mode = getMoneySystemMode()
  if (mode === "objective") {
    const obj = world.scoreboard.getObjective(objectiveName || "extremesmp_money")
    if (!obj) return 0n
    const score = obj.getScore(player.scoreboardIdentity) || 0
    return BigInt(Math.max(score, 0))
  } else {
    return getFullMoney(player)
  }
}
function addMoneyCustom(player, amount, objectiveName) {
  const mode = getMoneySystemMode()
  if (mode === "objective") {
    const obj = world.scoreboard.getObjective(objectiveName || "extremesmp_money")
    if (!obj) return false
    const score = obj.getScore(player.scoreboardIdentity) || 0
    const newScore = Number(BigInt(score) + BigInt(amount))
    system.run(() => {
      world.getDimension("overworld").runCommand(`scoreboard players set "${player.name}" ${objectiveName} ${newScore}`)
    })
    return true
  } else {
    return addMoney(player, amount)
  }
}
function removeMoneyCustom(player, amount, objectiveName) {
  const mode = getMoneySystemMode()
  if (mode === "objective") {
    const obj = world.scoreboard.getObjective(objectiveName || "extremesmp_money")
    if (!obj) return false
    const score = obj.getScore(player.scoreboardIdentity) || 0
    const newScore = BigInt(score) - BigInt(amount)
    if (newScore < 0n) return false
    system.run(() => {
      world.getDimension("overworld").runCommand(`scoreboard players set "${player.name}" ${objectiveName} ${newScore}`)
    })
    return true
  } else {
    return removeMoney(player, amount)
  }
}
const RANK_LIST_KEY = "topup_rank_list"
const CURRENCY_PREFIX_KEY = "topup_currency_prefix"
const OBJECTIVE_NAME_KEY = "topup_objective_name"
function getRankData() {
  let rankList = []
  let prefix = "$"
  let objectiveName = "money"
  try {
    const savedRanks = GlobalConfig.get(RANK_LIST_KEY)
    if (savedRanks) rankList = typeof savedRanks === "string" ? JSON.parse(savedRanks) : savedRanks;
  } catch { }
  try {
    const savedPrefix = GlobalConfig.get(CURRENCY_PREFIX_KEY)
    if (savedPrefix) prefix = savedPrefix
  } catch { }
  try {
    const savedObj = GlobalConfig.get(OBJECTIVE_NAME_KEY)
    if (savedObj) objectiveName = savedObj
  } catch { }
  return { rankList, prefix, objectiveName }
}
function saveRankData(rankList, prefix, objectiveName) {
  try {
    GlobalConfig.set(RANK_LIST_KEY, rankList)
  } catch { }
  try {
    GlobalConfig.set(CURRENCY_PREFIX_KEY, prefix)
  } catch { }
  try {
    GlobalConfig.set(OBJECTIVE_NAME_KEY, objectiveName)
  } catch { }
}
function getRankList() {
  return globalThis.ALL_RANK_LIST || uuidRanks.map(r => ({ symbol: r, name: r }))
}
export function showTopUpRankMenu(player) {
  const { rankList, prefix, objectiveName } = getRankData()
  if (player.hasTag("admin")) return showTopUpRankAdmin(player, objectiveName)
  const form = new ActionFormData().title("Top Up Rank").body("Choose the rank you want to buy:")
  for (let i = 0; i < rankList.length; i++) {
    const r = rankList[i]
    form.button(`${r.name} (${r.rank})\n${prefix}${r.price}`, "textures/ui/dressing_room_capes")
  }
  form.button("View Rank Skills", "textures/ui/creative_icon")
  form.button("Close", "textures/ui/cancel")
  form.show(player).then(({ canceled, selection }) => {
    if (canceled) return
    if (selection === rankList.length) return showRankSkillList(player)
    if (selection === rankList.length + 1) return
    confirmBuyRank(player, selection, rankList, prefix, objectiveName)
  })
}
function showRankSkillList(player) {
  let msg = "Rank Skill List:\n\n"
  const entries = Object.entries(rankDefault.ranks)
  for (let i = 0; i < entries.length; i++) {
    const rank = entries[i][1]
    msg += `${rank.prefix} ${rank.name}\n`
    if (rank.commands) {
      const cmds = Object.entries(rank.commands)
      for (let j = 0; j < cmds.length; j++) {
        const [cmd, info] = cmds[j]
        msg += `- ${cmd}: ${info.msg}\n`
      }
    }
    msg += "\n"
  }
  new ActionFormData()
    .title("Rank Skills/Features")
    .body(msg)
    .button("Back")
    .show(player)
    .then(() => {
      showTopUpRankMenu(player)
    })
}
function confirmBuyRank(player, idx, rankList, prefix, objectiveName) {
  const r = rankList[idx]
  const tagRank = player.getTags().find(t => t.startsWith("rank:"))
  const currentRankSymbol = tagRank ? tagRank.replace("rank:", "") : null
  let currentRankName = "None"
  let currentRankIcon = ""
  if (currentRankSymbol) {
    const found = rankList.find(x => x.rank === currentRankSymbol)
    if (found) {
      currentRankName = found.name
      currentRankIcon = found.rank + " "
    } else {
      currentRankName = currentRankSymbol
      currentRankIcon = currentRankSymbol + " "
    }
  }
  let msg = `§fYou are about to upgrade your rank!\n\n` + `§7Current Rank: ${currentRankIcon} §a→ §a${r.rank} ${r.name} (New)\n` + `§7Price: §e${prefix}${r.price}\n\n` + `§6Confirm to upgrade to §a${r.rank}§6.\n\n` + `§fEnjoy exclusive features and show off your new status!\n` + `§7Are you sure you want to proceed?`
  new MessageFormData()
    .title("Confirm Rank Purchase")
    .body(msg)
    .button1("Confirm Purchase")
    .button2("Cancel")
    .show(player)
    .then(({ selection }) => {
      if (selection === 0) processBuyRank(player, idx, rankList, prefix, objectiveName)
    })
}
function processBuyRank(player, idx, rankList, prefix, objectiveName) {
  const r = rankList[idx]
  const saldo = getFullMoneyCustom(player, objectiveName)
  if (saldo < BigInt(r.price)) {
    player.sendMessage(`§cInsufficient balance! You need ${prefix}${r.price} to buy this rank.`)
    player.playSound("note.bass")
    return
  }
  const removed = removeMoneyCustom(player, r.price, objectiveName)
  if (!removed) {
    player.sendMessage("§cFailed to deduct money. Transaction cancelled.")
    player.playSound("note.bass")
    return
  }
  try {
    const applied = setRank(player, r.rank)
    if (applied === false) {
      addMoneyCustom(player, r.price, objectiveName)
      player.sendMessage("§eระบบซื้อ Rank ของ Kiw ถูกปิดใน merged pack; คืนเงินให้แล้ว ใช้ Profile ของ EXTREMESMP แทน")
      player.playSound("note.bass")
      return
    }
    player.sendMessage(`§aSuccessfully purchased rank ${r.name}`)
    player.playSound("random.levelup")
  } catch (e) {
    addMoneyCustom(player, r.price, objectiveName)
    player.sendMessage("§cFailed to set rank. Your money has been refunded.")
    player.playSound("note.bass")
  }
}
function showTopUpRankAdmin(player) {
  const { rankList, prefix, objectiveName } = getRankData()
  const mode = getMoneySystemMode()
  const isObjective = mode === "objective"
  let bodyText = "Manage ranks for sale:"
  bodyText += `\n§7Money System Mode: §b${mode.toUpperCase()}`
  if (!isObjective) {
    bodyText += "\n§eNote: Custom objective only works if Money System mode is set to Objective!"
  }
  const form = new ActionFormData().title("Admin Top Up Rank").body(bodyText)
  for (let i = 0; i < rankList.length; i++) {
    const r = rankList[i]
    form.button(`${r.name} (${r.rank})\n${prefix}${r.price}`, "textures/ui/dressing_room_capes")
  }
  form.button("Add New Rank", "textures/ui/download_backup")
  form.button("Settings", "textures/ui/dev_glyph_color")
  form.button("View Rank Skills", "textures/ui/creative_icon")
  form.button("Close", "textures/ui/cancel")
  if (player.hasTag("admin")) {
    form.button("Customize NPC Skin", "textures/ui/dressing_room_skins")
  }
  form.show(player).then(({ canceled, selection }) => {
    if (canceled) return
    if (selection === rankList.length) return addNewRank(player, rankList, prefix, objectiveName)
    if (selection === rankList.length + 1) return showTopUpSettings(player, rankList, prefix, objectiveName)
    if (selection === rankList.length + 2) return showRankSkillListAdmin(player)
    if (selection === rankList.length + 3) return
    if (player.hasTag("admin") && selection === rankList.length + 4) {
      player.runCommand("dialogue open @e[type=npc,c=1,r=5] @s")
      return
    }
    editOrDeleteRank(player, selection, rankList, prefix, objectiveName)
  })
}
function addNewRank(player, rankList, prefix, objectiveName) {
  const allRanks = getRankList()
  new ModalFormData()
    .title("Add Rank For Sale")
    .dropdown(
      "Rank",
      allRanks.map(r => `${r.name} (${r.symbol})`),
      { defaultValue: 0 }
    )
    .textField("Rank Name", "Example: VIP", { defaultValue: "" })
    .textField("Price", "Example: 10000", { defaultValue: "" })
    .show(player)
    .then(({ canceled, formValues }) => {
      if (canceled) return
      const [idx, name, price] = formValues
      const rankObj = allRanks[idx]
      rankList.push({ rank: rankObj.symbol, name: name || rankObj.name, price: parseInt(price) || 0 })
      saveRankData(rankList, prefix, objectiveName)
      player.sendMessage("Rank added successfully!")
      showTopUpRankAdmin(player)
    })
}
function showTopUpSettings(player, rankList, prefix, objectiveName) {
  const mode = getMoneySystemMode()
  const isObjective = mode === "objective"
  let form = new ModalFormData().title("Top Up Settings").textField("Currency Prefix", "Example: $, Rp, €, etc.", { defaultValue: prefix })
  if (isObjective) {
    form = form.textField("Objective Name", "Scoreboard objective for money (default: extremesmp_money)", { defaultValue: objectiveName || "extremesmp_money" })
  } else {
    form = form.textField("Objective Name (only works in Objective mode)", "Switch to Objective mode in Money System settings", { defaultValue: objectiveName || "extremesmp_money" })
  }
  form.show(player).then(({ canceled, formValues }) => {
    if (canceled) return showTopUpRankAdmin(player)
    const [newPrefix, newObjective] = formValues
    let changed = false
    let objName = objectiveName
    if (newPrefix && newPrefix.length > 0 && newPrefix !== prefix) {
      prefix = newPrefix
      changed = true
      player.sendMessage(`Currency prefix changed to: ${prefix}`)
    }
    if (isObjective && newObjective && newObjective.length > 0 && newObjective !== objectiveName) {
      objName = newObjective
      changed = true
      player.sendMessage(`Objective name changed to: ${objName}`)
    }
    if (changed) saveRankData(rankList, prefix, objName)
    showTopUpRankAdmin(player)
  })
}
function editOrDeleteRank(player, idx, rankList, prefix, objectiveName) {
  const r = rankList[idx]
  new ActionFormData()
    .title("Edit/Delete Rank")
    .body(`${r.name} (${r.rank})\n${prefix}${r.price}`)
    .button("Edit")
    .button("Delete")
    .button("Back")
    .show(player)
    .then(({ canceled, selection }) => {
      if (canceled) return
      if (selection === 0) return editRank(player, idx, rankList, prefix, objectiveName)
      if (selection === 1) {
        rankList.splice(idx, 1)
        saveRankData(rankList, prefix, objectiveName)
        player.sendMessage("Rank deleted!")
        showTopUpRankAdmin(player)
      }
      if (selection === 2) showTopUpRankAdmin(player)
    })
}
function editRank(player, idx, rankList, prefix, objectiveName) {
  const r = rankList[idx]
  new ModalFormData()
    .title("Edit Rank")
    .textField("Rank Name", "", { defaultValue: r.name })
    .textField("Price", "", { defaultValue: r.price.toString() })
    .show(player)
    .then(({ canceled, formValues }) => {
      if (canceled) return
      const [name, price] = formValues
      r.name = name || r.name
      r.price = parseInt(price) || r.price
      saveRankData(rankList, prefix, objectiveName)
      player.sendMessage("Rank updated!")
      showTopUpRankAdmin(player)
    })
}
function showRankSkillListAdmin(player) {
  let msg = "Rank Skill List:\n\n"
  const entries = Object.entries(rankDefault.ranks)
  for (let i = 0; i < entries.length; i++) {
    const rank = entries[i][1]
    msg += `${rank.prefix} ${rank.name}\n`
    if (rank.commands) {
      const cmds = Object.entries(rank.commands)
      for (let j = 0; j < cmds.length; j++) {
        const [cmd, info] = cmds[j]
        msg += `- ${cmd}: ${info.msg}\n`
      }
    }
    msg += "\n"
  }
  new ActionFormData()
    .title("Rank Skills/Features")
    .body(msg)
    .button("Back")
    .show(player)
    .then(() => {
      showTopUpRankAdmin(player)
    })
}
