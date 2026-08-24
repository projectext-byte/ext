import { system, CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus } from "../../core.js"
import { getAllWarps, teleportToWarp } from "../../warp.js"
import { teleportToDeathLocation } from "../back-to-die/index.js"
import { showMemberMenu, featureStatus } from "../../member.js"
import { random_tp_instant } from "../random-teleport/index.js"
import { Shop } from "../../menu_member/functions/shop/index.js"
import { TeleportRequest } from "../teleport-request/index.js"
import { isCommandEnabled } from "./custom_cmd_menu.js"
const getPlayer = origin => origin?.initiator ?? origin?.sourceEntity ?? null
const isPlayer = player => player?.typeId === "minecraft:player"
const success = () => ({ status: CustomCommandStatus.Success })
const failure = (message = "Players only.") => ({ status: CustomCommandStatus.Failure, message })
const checkFeature = (player, feature, featureName) => {
  if (!featureStatus[feature]) {
    player.sendMessage(`§c✘ ${featureName} feature is currently disabled by admin.`)
    system.run(() => player.playSound("note.bass"))
    return false
  }
  return true
}
const handlers = {
  clearchat: origin => {
    if (!isCommandEnabled('clearchat')) return failure('This command is currently disabled.')
    const player = getPlayer(origin)
    if (!isPlayer(player)) return failure("This command is for players only.")
    system.run(() => {
      const msg = { rawtext: [{ text: "clearchat-nperma" }] }
      for (let i = 0; i < 50; i++) player.sendMessage(msg)
      player.sendMessage("§a[ClearChat] §r§aChat cleared successfully.")
      player.playSound("random.orb")
    })
    return success()
  },
  helps: origin => {
    if (!isCommandEnabled('helps')) return failure('This command is currently disabled.')
    const player = getPlayer(origin)
    if (!isPlayer(player)) return failure()
    const message = [
      "§9━━━[ EXTREMESMP HELP ]━━━§r",
      "§bCommands:§r",
      "§3• §f/extremesmp:helps §7- Show this help",
      "§3• §f/extremesmp:info §7- Server info",
      "§3• §f/extremesmp:rules §7- Server rules",
      "§3• §f/extremesmp:warp §7- List/teleport to warps",
      "§3• §f/extremesmp:back §7- Return to last death location",
      "§3• §f/extremesmp:menu §7- Open member menu",
      "§3• §f/extremesmp:rtp §7- Random teleport",
      "§3• §f/extremesmp:shop §7- Open shop menu",
      "§3• §f/extremesmp:tpa §7- View teleport menu",
      "§3• §f/extremesmp:clearchat §7- Clear your chat",
      "",
      "§eTips:§r",
      "§7- Use §f/extremesmp:helps§7 anytime for this menu",
      "§7- Commands are not case-sensitive",
      "§8━━━━━━━━━━━━━━━━━━━━━━§r",
    ].join("\n")
    player.sendMessage(message)
    return success()
  },
  info: origin => {
    if (!isCommandEnabled('info')) return failure('This command is currently disabled.')
    const player = getPlayer(origin)
    if (!isPlayer(player)) return failure()
    const message = ["§2━━━[ SERVER INFO ]━━━§r", "§a• §fCreator: §bEXTREMESMP", "§a• §fVersion: §e5.0.0", "§a• §fWebsite: §bEXTREMESMP", "§8© 2025 EXTREMESMP. All rights reserved.", "§8━━━━━━━━━━━━━━━━━━━━━━§r"].join("\n")
    player.sendMessage(message)
    return success()
  },
  rules: origin => {
    if (!isCommandEnabled('rules')) return failure('This command is currently disabled.')
    const player = getPlayer(origin)
    if (!isPlayer(player)) return failure()
    const message = ["§6━━━[ SERVER RULES ]━━━§r", "§c1. §fNo griefing", "§c2. §fBe respectful", "§c3. §fNo cheating or hacking", "§c4. §fNo spamming", "§c5. §fNo advertising", "§c6. §fNo scamming", "§c7. §fNo toxic or hate speech", "§c8. §fFollow staff instructions", "", "§eBreaking rules may result in mute, kick, or ban.", "§8━━━━━━━━━━━━━━━━━━━━━━§r"].join("\n")
    player.sendMessage(message)
    return success()
  },
  warp: (origin, name) => {
    if (!isCommandEnabled('warp')) return failure('This command is currently disabled.')
    const player = getPlayer(origin)
    if (!isPlayer(player)) return failure()
    if (!checkFeature(player, "warp", "Warp")) return failure("Warp feature is disabled")
    if (!name) {
      const warps = getAllWarps()
      if (!warps.length) {
        player.sendMessage("§cNo warps have been created yet.")
        return success()
      }
      const list = warps.map(w => `§b${w.Name}`).join("§7, ")
      player.sendMessage(`§aAvailable Warps: ${list}`)
      player.sendMessage(`§aUse /extremesmp:warp / warp <warp name> to teleport to a warp. Warp names must be one word, no spaces allowed.`)
      return success()
    }
    const warps = getAllWarps()
    const idx = warps.findIndex(w => w.Name.toLowerCase() === name.toLowerCase())
    if (idx === -1) {
      player.sendMessage(`§cWarp "${name}" tidak ditemukan.`)
      return failure()
    }
    teleportToWarp(player, warps, idx)
    return success()
  },
  back: origin => {
    if (!isCommandEnabled('back')) return failure('This command is currently disabled.')
    const player = getPlayer(origin)
    if (!isPlayer(player)) return failure()
    if (!checkFeature(player, "setHome", "Set Home")) return failure("Set Home feature is disabled")
    teleportToDeathLocation(player)
    return success()
  },
  menu: origin => {
    if (!isCommandEnabled('menu')) return failure('This command is currently disabled.')
    const player = getPlayer(origin)
    if (!isPlayer(player)) return failure()
    if (!Object.values(featureStatus).some(status => status)) {
      player.sendMessage("§c✘ All member features are currently disabled by admin.")
      system.run(() => player.playSound("note.bass"))
      return failure("All member features are disabled")
    }
    system.run(() => showMemberMenu(player))
    return success()
  },
  rtp: origin => {
    if (!isCommandEnabled('rtp')) return failure('This command is currently disabled.')
    const player = getPlayer(origin)
    if (!isPlayer(player)) return failure()
    if (!checkFeature(player, "randomTeleport", "Random Teleport")) return failure("Random teleport feature is disabled")
    random_tp_instant(player)
    return success()
  },
  shop: origin => {
    if (!isCommandEnabled('shop')) return failure('This command is currently disabled.')
    const player = getPlayer(origin)
    if (!isPlayer(player)) return failure()
    if (!checkFeature(player, "shop", "Shop")) return failure("Shop feature is disabled")
    system.run(() => Shop(player))
    return success()
  },
  tpa: origin => {
    if (!isCommandEnabled('tpa')) return failure('This command is currently disabled.')
    const player = getPlayer(origin)
    if (!isPlayer(player)) return failure()
    system.run(() => TeleportRequest(player))
    return success()
  },
}
const commands = [
  { name: "extremesmp:clearchat", description: "Clear your chat", handler: handlers.clearchat },
  { name: "extremesmp:helps", description: "Show help message", handler: handlers.helps },
  { name: "extremesmp:info", description: "Dev information", handler: handlers.info },
  { name: "extremesmp:rules", description: "View server rules", handler: handlers.rules },
  { name: "extremesmp:warp", description: "List or teleport to a warp", handler: handlers.warp, params: [{ name: "name", type: CustomCommandParamType.String }] },
  { name: "extremesmp:back", description: "Return to last death location", handler: handlers.back },
  { name: "extremesmp:menu", description: "Open member menu", handler: handlers.menu },
  { name: "extremesmp:rtp", description: "Random teleport", handler: handlers.rtp },
  { name: "extremesmp:shop", description: "Open shop menu", handler: handlers.shop },
  { name: "extremesmp:tpa", description: "View teleport menu", handler: handlers.tpa },
]
export function registerCustomCommands(system) {
  system.beforeEvents.startup.subscribe(init => {
    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i]
      const commandConfig = {
        name: cmd.name,
        description: cmd.description,
        permissionLevel: CommandPermissionLevel.Any,
        cheatsRequired: false,
        ...(cmd.params && { optionalParameters: cmd.params }),
      }
      init.customCommandRegistry.registerCommand(commandConfig, cmd.handler)
    }
  })
}
