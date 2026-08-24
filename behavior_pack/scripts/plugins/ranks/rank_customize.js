import { world } from "../../core.js"
import { ActionFormData, ModalFormData } from "../../core.js"
import { rankDefault } from "./rank_default.js"
import { uuidRanks, openAdminPanel, deleteRankByName } from "./rank.js"
import { GlobalConfig } from "../../function/GlobalConfig.js"
function saveRanks(ranks) {
  try {
    GlobalConfig.set("customRanks", ranks)
  } catch (error) {
    console.warn("Error saving ranks:", error)
  }
}
function getRanks() {
  try {
    const savedRanks = GlobalConfig.get("customRanks")
    const customRanks = savedRanks ? (typeof savedRanks === "string" ? JSON.parse(savedRanks) : savedRanks) : {}
    return { ...rankDefault.ranks, ...customRanks }
  } catch (error) {
    console.warn("Error loading ranks:", error)
    return { ...rankDefault.ranks }
  }
}
function getSimpleRanks() {
  try {
    const data = GlobalConfig.get("customRankList")
    return data ? (typeof data === "string" ? JSON.parse(data) : data) : []
  } catch (error) {
    return []
  }
}
export function showRankCustomizeMenu(player) {
  const form = new ActionFormData().title("§6Rank Customization").body("§7Select a rank to customize")
  const ranks = getRanks()
  const customRanks = Object.keys(ranks).filter(id => !rankDefault.ranks[id])
  const defaultRanks = Object.keys(rankDefault.ranks)
  const rankIds = customRanks.concat(defaultRanks)
  form.button("§aAdd New Rank")
  for (const rankId of rankIds) {
    const rank = ranks[rankId] || rankDefault.ranks[rankId]
    if (rank) {
      const displayName = rank.prefix || `${rank.color}${rank.name}`
      form.button(displayName)
    } else {
      const name = rankId.replace("rank:", "")
      form.button(name)
    }
  }
  form.show(player).then(response => {
    if (response.canceled) {
      openAdminPanel(player)
      return
    }
    if (response.selection === 0) {
      showAddRankMenu(player)
    } else {
      const rankId = rankIds[response.selection - 1]
      showRankEditMenu(player, rankId)
    }
  })
}
function showAddRankMenu(player) {
  const ranks = getRanks()
  const textRanks = Object.keys(ranks)
    .filter(id => id.startsWith("rank:") && !uuidRanks.includes(ranks[id].prefix))
    .map(id => ranks[id].name)
    .concat(getSimpleRanks())
  const availableTextRanks = [...new Set(textRanks)].filter(r => r)
  const form = new ModalFormData()
    .title("§6Add New Rank")
    .textField("§eRank Name\n§8Enter rank name here (e.g. EXTREMESMP)", "Enter rank name...", { defaultValue: "", placeholder: "Enter rank name" })
    .dropdown(
      "§eSelect Icon\n§8Select icon/prefix display",
      uuidRanks.filter(r => r).concat(availableTextRanks),
      { defaultValue: 0 }
    )
    .dropdown("§eSelect Color\n§8Choose color for the rank", ["§4Dark Red", "§cRed", "§6Gold", "§eYellow", "§2Dark Green", "§aGreen", "§bAqua", "§3Dark Aqua", "§1Dark Blue", "§9Blue", "§dLight Purple", "§5Dark Purple", "§fWhite", "§7Gray", "§8Dark Gray", "§0Black"], { defaultValue: 0 })
  form.show(player).then(response => {
    if (response.canceled) {
      showRankCustomizeMenu(player)
      return
    }
    const [name, iconIndex, colorIndex] = response.formValues
    if (!name) {
      player.sendMessage("§cRank name cannot be empty")
      return showAddRankMenu(player)
    }
    const colors = ["§4", "§c", "§6", "§e", "§2", "§a", "§b", "§3", "§1", "§9", "§d", "§5", "§f", "§7", "§8", "§0"]
    const icons = uuidRanks.filter(r => r).concat(availableTextRanks)
    let selectedIcon = icons[iconIndex]
    if (availableTextRanks.includes(selectedIcon)) {
      selectedIcon = `[${selectedIcon}]`
    } else if (!selectedIcon) {
      selectedIcon = "textures/ui/accessibility_glyph_color"
    }
    const selectedColor = colors[colorIndex]
    const newRankId = `rank:${name.toLowerCase()}`
    ranks[newRankId] = {
      name: name,
      color: selectedColor,
      prefix: `${selectedColor}${selectedIcon}`,
      commands: {},
    }
    saveRanks(ranks)
    player.sendMessage(`§aNew rank created: ${selectedColor}${selectedIcon} ${name}`)
    showRankCustomizeMenu(player)
  })
}
function showRankEditMenu(player, rankId) {
  const ranks = getRanks()
  let rank = ranks[rankId]
  if (!rank) {
    const name = rankId.replace("rank:", "")
    rank = {
      name: name,
      color: "§f",
      prefix: `§7[${name}§7]`,
      commands: {}
    }
    ranks[rankId] = rank
    saveRanks(ranks)
  }
  const form = new ActionFormData().title(`§6Edit ${rank.name}`).body("§7Select what to edit").button("§eEdit Name").button("§eEdit Color").button("§eEdit Prefix").button("§eEdit Skills")
  if (!rankDefault.ranks[rankId]) {
    form.button("§cDelete Rank")
  }
  form.show(player).then(response => {
    if (response.canceled) {
      showRankCustomizeMenu(player)
      return
    }
    switch (response.selection) {
      case 0:
        showNameEditMenu(player, rankId)
        break
      case 1:
        showColorEditMenu(player, rankId)
        break
      case 2:
        showPrefixEditMenu(player, rankId)
        break
      case 3:
        showSkillsEditMenu(player, rankId)
        break
      case 4:
        showDeleteConfirmMenu(player, rankId)
        break
    }
  })
}
function showDeleteConfirmMenu(player, rankId) {
  const rankName = rankId.replace("rank:", "")
  new ActionFormData()
    .title(`§cDelete ${rankName}?`)
    .body("§cAre you sure you want to delete this rank?\n§7This action cannot be undone.")
    .button("§cYes, Delete", "textures/ui/check")
    .button("§7Cancel", "textures/ui/cancel")
    .show(player)
    .then(response => {
      if (response.canceled || response.selection === 1) {
        showRankEditMenu(player, rankId)
        return
      }
      const simpleRanks = getSimpleRanks()
      let realName = simpleRanks.find(n => `rank:${n.toLowerCase()}` === rankId)
      if (!realName) {
        realName = rankId.replace("rank:", "")
      }
      if (realName) {
        deleteRankByName(player, realName)
        showRankCustomizeMenu(player)
      } else {
        player.sendMessage("§cError: Rank not found in list.")
        showRankCustomizeMenu(player)
      }
    })
}
function showNameEditMenu(player, rankId) {
  const ranks = getRanks()
  const rank = ranks[rankId]
  const form = new ModalFormData().title(`§6Edit ${rank.name} Name`).textField("§eNew Name\n§8Enter new name for the rank", "Enter name...", { defaultValue: rank.name, placeholder: "Enter new name" })
  form.show(player).then(response => {
    if (response.canceled) {
      showRankEditMenu(player, rankId)
      return
    }
    ranks[rankId].name = response.formValues[0]
    saveRanks(ranks)
    player.sendMessage(`§aName updated to: ${response.formValues[0]}`)
    showRankEditMenu(player, rankId)
  })
}
function showColorEditMenu(player, rankId) {
  const ranks = getRanks()
  const rank = ranks[rankId]
  const colors = {
    "§4": "Dark Red",
    "§c": "Red",
    "§6": "Gold",
    "§e": "Yellow",
    "§2": "Dark Green",
    "§a": "Green",
    "§b": "Aqua",
    "§3": "Dark Aqua",
    "§1": "Dark Blue",
    "§9": "Blue",
    "§d": "Light Purple",
    "§5": "Dark Purple",
    "§f": "White",
    "§7": "Gray",
    "§8": "Dark Gray",
    "§0": "Black",
  }
  const form = new ActionFormData().title(`§6Edit ${rank.name} Color`).body("§7Select a color")
  for (const [code, name] of Object.entries(colors)) {
    form.button(`${code}${name}`)
  }
  form.show(player).then(response => {
    if (response.canceled) {
      showRankEditMenu(player, rankId)
      return
    }
    const [code, name] = Object.entries(colors)[response.selection]
    ranks[rankId].color = code
    ranks[rankId].prefix = `§8[${code}${rank.name}§8]`
    saveRanks(ranks)
    player.sendMessage(`§aColor updated to: ${name}`)
    showRankEditMenu(player, rankId)
  })
}
function showPrefixEditMenu(player, rankId) {
  const allRanks = getRanks()
  const currentRank = allRanks[rankId]
  const rankColor = currentRank.color || "§f"
  const textRanks = Object.keys(allRanks)
    .filter(id => id.startsWith("rank:") && !uuidRanks.includes(allRanks[id].prefix))
    .map(id => allRanks[id].name)
    .concat(getSimpleRanks())
  const availableTextRanks = [...new Set(textRanks)].filter(r => r)
  const validIcons = uuidRanks.filter(icon => icon).concat(availableTextRanks)
  const form = new ModalFormData().title(`§6Edit ${currentRank.name} Prefix`).dropdown("§eSelect Icon\n§8Choose new icon for the rank", validIcons, { defaultValue: 0 })
  form.show(player).then(response => {
    if (response.canceled) {
      showRankEditMenu(player, rankId)
      return
    }
    let selectedIcon = validIcons[response.formValues[0]]
    if (availableTextRanks.includes(selectedIcon)) {
      selectedIcon = `[${selectedIcon}]`
    }
    const newPrefix = `${rankColor}${selectedIcon}`
    allRanks[rankId].prefix = newPrefix
    saveRanks(allRanks)
    player.sendMessage(`§aPrefix updated to: ${newPrefix}`)
    showRankEditMenu(player, rankId)
  })
}
function showSkillsEditMenu(player, rankId) {
  const ranks = getRanks()
  const rank = ranks[rankId]
  const form = new ActionFormData().title(`§6Edit ${rank.name} Skills`).body("§7Select a skill to edit")
  const cmds = Object.keys(rank.commands || {})
  for (const cmd of cmds) {
    form.button(`§e${cmd}\n§7Click to edit`)
  }
  form.button("§aAdd New Skill")
  form.button("§cBack")
  form.show(player).then(response => {
    if (response.canceled) {
      showRankEditMenu(player, rankId)
      return
    }
    if (response.selection < cmds.length) {
      const cmd = cmds[response.selection]
      showEditSkillMenu(player, rankId, cmd)
    } else if (response.selection === cmds.length) {
      showAddSkillMenu(player, rankId)
    } else {
      showRankEditMenu(player, rankId)
    }
  })
}
function showEditSkillMenu(player, rankId, cmd) {
  const ranks = getRanks()
  const rank = ranks[rankId]
  const skill = rank.commands[cmd]
  const form = new ModalFormData()
    .title(`§6Edit Skill: ${cmd}`)
    .textField("§eCommand Name\n§8Enter command (e.g. +fly)", "Enter command...", { defaultValue: cmd, placeholder: "Enter command name" })
    .textField("§eExecute Command\n§8Enter FULL command", "Enter command...", { defaultValue: skill.cmd, placeholder: "e.g. give @s apple 3" })
    .textField("§eSuccess Message\n§8Message shown when command used", "Enter message...", { defaultValue: skill.msg, placeholder: "Enter success message" })
    .toggle("§cDelete Skill\n§8Remove this skill", { defaultValue: false })
  form.show(player).then(response => {
    if (response.canceled) {
      showSkillsEditMenu(player, rankId)
      return
    }
    const [newCmd, execCmd, msg, shouldDelete] = response.formValues
    if (shouldDelete) {
      delete ranks[rankId].commands[cmd]
      saveRanks(ranks)
      player.sendMessage(`§aDeleted skill: ${cmd}`)
    } else {
      if (!newCmd.startsWith("+")) {
        player.sendMessage("§cCommand must start with '+'")
        return showEditSkillMenu(player, rankId, cmd)
      }
      if (newCmd.toLowerCase() !== cmd.toLowerCase()) {
        delete ranks[rankId].commands[cmd]
      }
      ranks[rankId].commands[newCmd.toLowerCase()] = {
        cmd: execCmd.trim(),
        msg: msg,
      }
      saveRanks(ranks)
      player.sendMessage(`§aUpdated skill: ${newCmd.toLowerCase()}`)
    }
    showSkillsEditMenu(player, rankId)
  })
}
function showAddSkillMenu(player, rankId) {
  const form = new ModalFormData().title("§6Add New Skill").textField("§eCommand\n§8Enter command starting with +", "Enter command...", { defaultValue: "", placeholder: "e.g. +fly" }).textField("§eExecute Command\n§8Enter full command to execute", "Enter command...", { defaultValue: "", placeholder: "e.g. give @s apple 3" }).textField("§eSuccess Message\n§8Message shown when command used", "Enter message...", { defaultValue: "", placeholder: "e.g. §aYou got apples!" })
  form.show(player).then(response => {
    if (response.canceled) {
      showSkillsEditMenu(player, rankId)
      return
    }
    const [cmd, execCmd, msg] = response.formValues
    if (!cmd || !cmd.startsWith("+")) {
      player.sendMessage("§cCommand must start with '+'")
      return showAddSkillMenu(player, rankId)
    }
    const ranks = getRanks()
    ranks[rankId].commands[cmd.toLowerCase()] = {
      cmd: execCmd.trim(),
      msg: msg,
    }
    saveRanks(ranks)
    player.sendMessage(`§aAdded new skill: ${cmd.toLowerCase()}`)
    showSkillsEditMenu(player, rankId)
  })
}
