import { system, world, ActionFormData, ModalFormData, MessageFormData } from "../../core.js"
import { showMainMenu } from "../../kiwora.js"
import { showRankCustomizeMenu } from "./rank_customize.js"
import { showRankBenefitsMenu } from "./rank_benefits.js"
import { rankDefault } from "./rank_default.js"
import { showRankSubscriptionAdminMenu } from "./rank_subscription.js"
import { RankDatabase } from "./rank_database.js"
import { rankForm } from "../../forms.js"
// The merged pack uses EXTREMESMP as the only rank authority. Keep this
// compatibility module loadable for legacy imports, but do not mutate rank:
// tags or open Kiw rank administration forms.
const LEGACY_KIW_RANKS_DISABLED = true;
export const uuidRanks = [
  "", 
  "", 
  "", 
  "", 
  "", 
  "", 
  "", 
  "", 
  "", 
  "", 
  "", 
  "", 
  "", 
  "", 
  "", 
  "", 
  "", 
  "", 
  "", 
  "", 
  "", 
  "", 
  "", 
  "", 
  "", 
  "", 
  "", 
  "", 
  "", 
  "", 
  "", 
]
export const RANK_PREFIX = "rank:"
let defaultRank = ""
let customRankList = []
let allRanksCache = []
let isRanksLoaded = false
function getStoredCustomRanks() {
  return RankDatabase.getCustomRanks()
}
function saveStoredCustomRanks(ranks) {
  RankDatabase.saveCustomRanks(ranks)
}
function getCustomRankId(rankName) {
  return `${RANK_PREFIX}${String(rankName || "").trim().toLowerCase()}`
}
function createDefaultRankDefinition(rankName) {
  return {
    name: rankName,
    color: "§f",
    prefix: `§7[${rankName}§7]`,
    commands: {}
  }
}
function ensureCustomRankDefinitions() {
  let ranks = getStoredCustomRanks()
  let changed = false
  for (const rankName of customRankList) {
    const rankId = getCustomRankId(rankName)
    if (!rankName || ranks[rankId]) continue
    ranks[rankId] = createDefaultRankDefinition(rankName)
    changed = true
  }
  if (changed) saveStoredCustomRanks(ranks)
  return ranks
}
const loadRanks = () => {
  if (isRanksLoaded) return
  try {
    customRankList = RankDatabase.getCustomRankList()
    defaultRank = RankDatabase.loadDefaultRank()
    ensureCustomRankDefinitions()
    updateAllRanksCache()
    isRanksLoaded = true
  } catch (e) {
    console.warn("Error loading customRankList:", e)
  }
}
system.run(loadRanks)
const updateAllRanksCache = () => {
  allRanksCache = customRankList.length ? customRankList.concat(uuidRanks) : uuidRanks
}
const getPlayers = () => [...world.getPlayers()]
export const setRank = (player, rank) => {
  if (LEGACY_KIW_RANKS_DISABLED) {
    try { player?.sendMessage("§eKiw legacy rank system ถูกปิดแล้ว ใช้ Rank ของ EXTREMESMP แทน"); } catch {}
    return false;
  }
  const rankTags = player.getTags().filter(t => t.startsWith(RANK_PREFIX))
  for (const tag of rankTags) {
    player.removeTag(tag)
  }
  player.addTag(`${RANK_PREFIX}${rank}`)
  player.sendMessage(`§aRank set: ${rank}`)
  player.playSound("random.levelup")
  return true
}
const removeRank = player => {
  const tags = player.getTags().filter(t => t.startsWith(RANK_PREFIX))
  if (tags.length) {
    for (const tag of tags) {
      player.removeTag(tag)
    }
    setRank(player, defaultRank)
    player.sendMessage(`§aRank removed. Default rank '${defaultRank}' assigned.`)
    player.playSound("random.pop")
  } else {
    player.sendMessage("§cNo rank to remove")
  }
}
export const checkPlayerRank = player => {
  if (!isRanksLoaded) loadRanks()
  // Read-only compatibility path. EXTREMESMP owns selectedRank/ownedRanks;
  // never create, remove, or rewrite Kiw rank: tags in the merged pack.
  const tags = player.getTags().filter(t => t.startsWith(RANK_PREFIX) && t !== RANK_PREFIX)
  return tags.length ? tags[0].slice(RANK_PREFIX.length) : ""
}
export const getPlayerRank = player => {
  const rankTag = player.getTags().find(t => t.startsWith(RANK_PREFIX))
  return rankTag ? rankTag.slice(RANK_PREFIX.length) : checkPlayerRank(player)
}
export const getRankInfo = rank => {
  const rankKey = `${RANK_PREFIX}${rank}`
  if (rankDefault.ranks[rankKey]) return rankDefault.ranks[rankKey]
  try {
    const customRanks = getStoredCustomRanks()
    return customRanks[rankKey] || customRanks[rankKey.toLowerCase()] || null
  } catch (e) {
    return null
  }
}
export const executeRankCommand = (player, cmd) => {
  const rank = getPlayerRank(player)
  const rankInfo = getRankInfo(rank)
  if (!rankInfo) return false
  const command = rankInfo.commands[cmd]
  if (!command) return false
  try {
    player.runCommand(command.cmd)
    player.sendMessage(command.msg)
  } catch (error) {
    if (String(error).includes('Unexpected "ability"')) {
      player.sendMessage("§c[System] Failed: You must enable 'Education Edition' in World Settings to use this ability!")
      player.playSound("random.break")
    } else {
      console.warn(`Error executing rank command '${command.cmd}': ${error}`)
    }
  }
  return true
}
if (!LEGACY_KIW_RANKS_DISABLED) {
  world.afterEvents.playerSpawn.subscribe(({ player }) => {
    system.run(() => {
      checkPlayerRank(player)
    })
  })
  system.runTimeout(() => {
    const players = getPlayers()
    for (const player of players) {
      checkPlayerRank(player)
    }
  }, 20)
}
export const openAdminPanel = player => {
  if (LEGACY_KIW_RANKS_DISABLED) return showMainMenu(player);
  return rankForm()
    .show(player)
    .then(({ canceled, cancelationReason, selection }) => {
      if (canceled) {
        if (cancelationReason === "UserBusy") return
        showMainMenu(player)
        return
      }
        ;[openPlayerSelectionForRank, openPlayerSelectionForRemoval, addCustomRank, listAllRank, setDefaultRankMenu, showRankCustomizeMenu, showRankBenefitsMenu, showRankSubscriptionAdminMenu, showMainMenu][selection](player)
    })
        .catch(e => {
      player.sendMessage(`§cForm error: ${e.message}`)
      console.warn(`Form error in openAdminPanel: ${e}`)
    })
}
const listAllRank = player => {
  let msg = "§6=== RANKS & PERMISSIONS ===§f\n\n"
  const customRanks = ensureCustomRankDefinitions()
  const allRanks = { ...rankDefault.ranks, ...customRanks }
  for (const [key, rank] of Object.entries(allRanks)) {
    msg += `§l${rank.prefix} ${rank.name} §r(§f${rank.color}§r):\n`
    for (const [cmd, info] of Object.entries(rank.commands || {})) {
      msg += `§7- ${cmd}: §f${info.msg}\n`
    }
    msg += "\n"
  }
  new MessageFormData()
    .title("Rank Skills")
    .body(msg)
    .button1("Back")
    .button2("Customize")
    .show(player)
    .then(({ canceled, cancelationReason, selection }) => {
      if (canceled) {
        if (cancelationReason === "UserBusy") return
        openAdminPanel(player)
        return
      }
      if (selection === 0) openAdminPanel(player)
      if (selection === 1) showRankCustomizeMenu(player)
    })
    .catch(e => {
      player.sendMessage(`§cForm error: ${e.message}`)
      console.warn(`Form error in listAllRank: ${e}`)
    })
}
const openPlayerSelectionForRank = player => {
  const players = getPlayers(),
    names = players.map(p => p.name)
  if (!names.length) {
    player.sendMessage("§cNo players available")
    openAdminPanel(player)
    return
  }
  new ModalFormData()
    .title("Set Rank")
    .dropdown("Player", names)
    .dropdown("Rank", customRankList.length ? customRankList.concat(uuidRanks) : uuidRanks)
    .show(player)
    .then(({ canceled, cancelationReason, formValues }) => {
      if (canceled) {
        if (cancelationReason === "UserBusy") return
        openAdminPanel(player)
        return
      }
      if (!formValues?.length) return
      const [idx, rankIdx] = formValues,
        selPlayer = players[idx],
        ranks = customRankList.length ? customRankList.concat(uuidRanks) : uuidRanks
      if (!selPlayer || rankIdx < 0 || rankIdx >= ranks.length) return player.sendMessage("§cInvalid selection")
      setRank(selPlayer, ranks[rankIdx])
      openAdminPanel(player)
    })
    .catch(e => player.sendMessage(`§cForm error: ${e.message}`))
}
const openPlayerSelectionForRemoval = player => {
  const players = getPlayers(),
    names = players.map(p => p.name)
  if (!names.length) {
    player.sendMessage("§cNo players available")
    openAdminPanel(player)
    return
  }
  new ModalFormData()
    .title("Remove Rank")
    .dropdown("Player", names)
    .show(player)
    .then(({ canceled, cancelationReason, formValues }) => {
      if (canceled) {
        if (cancelationReason === "UserBusy") return
        openAdminPanel(player)
        return
      }
      if (!formValues?.length) return
      const selPlayer = players.find(p => p.name === names[formValues[0]])
      if (!selPlayer) return player.sendMessage("§cPlayer not found")
      removeRank(selPlayer)
      openAdminPanel(player)
    })
    .catch(e => player.sendMessage(`§cForm error: ${e.message}`))
}
const addCustomRank = player => {
  new ActionFormData()
    .title("Manage Custom Ranks")
    .body("§7Add or remove custom text-based ranks.")
    .button("Add New Rank", "textures/ui/plus")
    .button("Delete Rank", "textures/ui/minus")
    .button("Back", "textures/ui/arrow_left")
    .show(player)
    .then(({ canceled, cancelationReason, selection }) => {
      if (canceled) {
        if (cancelationReason === "UserBusy") return
        openAdminPanel(player)
        return
      }
      if (selection === 0) showAddCustomRankForm(player)
      if (selection === 1) showDeleteCustomRankForm(player)
      if (selection === 2) openAdminPanel(player)
    })
    .catch(e => player.sendMessage(`§cForm error: ${e.message}`))
}
const showAddCustomRankForm = player => {
  new ModalFormData()
    .title("Add Custom Rank")
    .textField("Rank Name", "Enter rank name", { defaultValue: "Custom Rank" })
    .show(player)
    .then(({ canceled, cancelationReason, formValues }) => {
      if (canceled) {
        if (cancelationReason === "UserBusy") return
        addCustomRank(player)
        return
      }
      if (!formValues?.length) return
      const rank = formValues[0]?.trim()
      if (!rank) {
    player.sendMessage("§cRank name cannot be empty")
    showAddCustomRankForm(player)
    return
  }
  if (customRankList.includes(rank)) {
    player.sendMessage("§cRank already exists in custom list!")
  } else {
    customRankList.push(rank)
    updateAllRanksCache()
    RankDatabase.saveCustomRankList(customRankList)
        try {
            const ranks = getStoredCustomRanks()
            const rankId = getCustomRankId(rank)
            if (!ranks[rankId]) {
                ranks[rankId] = {
                    name: rank,
                    color: "§f", 
                    prefix: `§7[${rank}§7]`, 
                    commands: {
                        "+help": {
                            cmd: "say Help command executed", 
                            msg: "§aHelp menu shown"
                        }
                    }
                }
            }
            saveStoredCustomRanks(ranks)
        } catch (e) {
            console.warn("Error auto-creating rank definition:", e)
        }
        player.sendMessage(`§aCustom rank '${rank}' has been added to the list!`)
        player.playSound("random.levelup")
      }
      addCustomRank(player)
    })
    .catch(e => player.sendMessage(`§cForm error: ${e.message}`))
}
export const deleteRankByName = (player, rankName) => {
  const index = customRankList.indexOf(rankName)
  if (index !== -1) {
    customRankList.splice(index, 1)
    updateAllRanksCache()
    RankDatabase.saveCustomRankList(customRankList)
  }
  let definitionDeleted = false
  try {
    const ranks = getStoredCustomRanks()
    if (Object.keys(ranks).length) {
      const rankId = getCustomRankId(rankName)
      if (ranks[rankId]) {
        delete ranks[rankId]
        saveStoredCustomRanks(ranks)
        definitionDeleted = true
      }
    }
  } catch (e) {
    console.warn("Error cleaning up rank definition:", e)
  }
  if (index === -1 && !definitionDeleted) {
    return false
  }
  const players = [...world.getPlayers()]
  const rankTag = `rank:${rankName}`
  for (const p of players) {
    if (p.hasTag(rankTag)) {
      p.removeTag(rankTag)
      setRank(p, defaultRank)
      p.sendMessage(`§eYour rank '${rankName}' has been deleted. You are now '${defaultRank}'.`)
    }
  }
  player.sendMessage(`§aCustom rank '${rankName}' has been fully deleted!`)
  player.playSound("random.pop")
  return true
}
const showDeleteCustomRankForm = player => {
  if (customRankList.length === 0) {
    player.sendMessage("§cNo custom ranks to delete.")
    addCustomRank(player)
    return
  }
  new ModalFormData()
    .title("Delete Custom Rank")
    .dropdown("Select Rank to Delete", customRankList)
    .show(player)
    .then(({ canceled, cancelationReason, formValues }) => {
      if (canceled) {
        if (cancelationReason === "UserBusy") return
        addCustomRank(player)
        return
      }
      if (!formValues?.length) return
      const index = formValues[0]
      const rankName = customRankList[index]
      if (rankName) {
        deleteRankByName(player, rankName)
      }
      addCustomRank(player)
    })
    .catch(e => player.sendMessage(`§cForm error: ${e.message}`))
}
export const setDefaultRank = player => {
  const tags = player.getTags().filter(t => t.startsWith(RANK_PREFIX))
  for (const tag of tags) {
    player.removeTag(tag)
  }
  player.addTag(`${RANK_PREFIX}${defaultRank}`)
  console.warn(`Set default rank '${defaultRank}' for ${player.name}`)
}
const setDefaultRankMenu = player => {
  const ranks = customRankList.length ? customRankList.concat(uuidRanks) : uuidRanks
  new ModalFormData()
    .title("Set Default Rank")
    .dropdown("Current: " + defaultRank + "\nChoose new default", ranks, {
      defaultValueIndex: ranks.indexOf(defaultRank),
    })
    .show(player)
    .then(({ canceled, formValues }) => {
      if (canceled || !formValues?.length) return
      defaultRank = ranks[formValues[0]]
      RankDatabase.saveDefaultRank(defaultRank)
      player.sendMessage("§aDefault rank updated to: " + defaultRank)
      player.playSound("random.levelup")
    })
    .catch(e => player.sendMessage("§cForm error: " + e.message))
}
export function getAllRanks() {
  if (!isRanksLoaded) loadRanks()
  return allRanksCache
}
export function isCustomRank(rank) {
  return customRankList.includes(rank)
}
