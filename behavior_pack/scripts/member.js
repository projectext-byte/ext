import { system, world, ActionFormData } from "./core.js"
import { transferMoney } from "./plugins/tf-money/tf-money.js"
import { openBackpackMenu } from "./plugins/backpack/menu.js"
import { Bank } from "./plugins/bank/bank.js"
import { BarterMenu } from "./plugins/barter/index.js"
import { showClanMenu } from "./plugins/clan/clan.js"
import { Shop } from "./menu_member/functions/shop/index.js"
import { LandMember } from "./plugins/land-system/index.js"
import { showPlayerShopMenu } from "./plugins/player-shop/index.js"
import { ShowPlayerWarps } from "./plugins/player-warp/index.js"
import { random_tp } from "./plugins/random-teleport/index.js"
import { showReportPlayerMenu } from "./plugins/report-player/index.js"
import { TeleportRequest } from "./plugins/teleport-request/index.js"
import { HomeSystem } from "./plugins/sethome/Set Home.js"
import { ShowAvailableWarps } from "./warp.js"
import { openBattlepass } from "./plugins/battlepass/index.js"
import { getAllButtons } from "./admin_menu/custom_button/custom_database.js"
import { executeButtonCommand } from "./admin_menu/custom_button/custom_main.js"
import { buttonTextures } from "./menu_member/control_member/control.js"
import { openEXTREMESMPMenu } from "./extremesmp/bridge.js"

import { registerCustomCommands } from "./plugins/custom-commands/custom.command.js"
import { showEmoteUI } from "./plugins/emote/emote.js"
import { Lang } from "./lib/Lang.js"
registerCustomCommands(system)
const MEMBER_MENU_UI_MARKER = "§m§e§m§b"
const MEMBER_COMPACT_UI_MARKER = "§m§c§m§p"
const featureStatus = {
  teleport: true,
  randomTeleport: true,
  warp: true,
  pwarp: true,
  setHome: true,
  transferMoney: true,
  bank: true,
  clan: true,
  shop: true,
  reportPlayer: true,
  claimLand: true,
  barter: true,
  backpack: true,
  playerShop: true,
  battlepass: true,

  emote: true,
  personalScoreboard: true,
  language: true,
}
function togglePersonalScoreboard(player) {
  const currentDisabled = player.getDynamicProperty("personal_scoreboard_disabled")
  const newDisabled = !currentDisabled
  player.setDynamicProperty("personal_scoreboard_disabled", newDisabled)
  const statusText = newDisabled ? Lang.t(player, "common.disabled") : Lang.t(player, "common.enabled")
  player.runCommand(`titleraw @s actionbar {"rawtext":[{"text":"§aScoreboard ${statusText}"}]}`)
}
function showLanguageMenu(player) {
  const currentLang = player.getTags().find(t => t.startsWith("lang:"))?.split(":")[1] || "en"
  const form = new ActionFormData()
    .title(MEMBER_COMPACT_UI_MARKER + "§l§e" + Lang.t(player, "lang.menu.title"))
    .body("§7" + Lang.t(player, "lang.menu.body"))
    .button("§f§lEnglish" + (currentLang === "en" ? "\n§a✓ Current" : ""), "textures/ui/language_glyph")
    .button("§f§lBahasa Indonesia" + (currentLang === "id" ? "\n§a✓ Saat ini" : ""), "textures/ui/language_glyph")
    .button("§c" + Lang.t(player, "common.back"), "textures/ui/arrow_left")
  form.show(player).then(response => {
    if (response.canceled) return
    if (response.selection === 0) {
      Lang.set(player, "en")
      player.sendMessage("§aLanguage set to English!")
      player.runCommand("playsound random.levelup @s")
      showMemberMenu(player)
    } else if (response.selection === 1) {
      Lang.set(player, "id")
      player.sendMessage("§aBahasa diatur ke Indonesia!")
      player.runCommand("playsound random.levelup @s")
      showMemberMenu(player)
    } else if (response.selection === 2) {
      showMemberMenu(player)
    }
  })
}
system.runTimeout(() => {
  try {
    const savedStatus = world.getDynamicProperty("memberFeatureStatus")
    if (savedStatus) {
      const savedFeatures = JSON.parse(savedStatus)
      Object.assign(featureStatus, savedFeatures)
    }
    const customButtons = getAllButtons()
    for (const btn of customButtons) {
      const featureKey = `custom_${btn.name}`
      if (!(featureKey in featureStatus)) {
        featureStatus[featureKey] = true
        toggleFeature(featureKey, true)
      }
    }
  } catch (error) {
    console.warn("Unable to load feature settings - Using default configuration", error)
  }
}, 1)
const MENU_ITEMS = [
  { key: "member.menu.btn.request_teleport", icon: "textures/ui/conduit_power_effect", feature: "teleport", handler: TeleportRequest },
  { key: "member.menu.btn.random_teleport", icon: "textures/ui/broadcast_glyph_color", feature: "randomTeleport", handler: random_tp },
  { key: "member.menu.btn.warp", icon: "textures/ui/icon_recipe_construction", feature: "warp", handler: ShowAvailableWarps },
  { key: "member.menu.btn.player_warp", icon: "textures/ui/glyph_realms", feature: "pwarp", handler: ShowPlayerWarps },
  { key: "member.menu.btn.set_home", icon: "textures/ui/icon_bell", feature: "setHome", handler: HomeSystem },
  { key: "member.menu.btn.land_management", icon: "textures/ui/icon_map", feature: "claimLand", handler: LandMember },
  { key: "member.menu.btn.transfer_money", icon: "textures/ui/invite_base", feature: "transferMoney", handler: transferMoney },
  { key: "member.menu.btn.bank", icon: "textures/ui/icon_book_writable", feature: "bank", handler: Bank },
  { key: "member.menu.btn.clan", icon: "textures/ui/button_custom/clan", feature: "clan", handler: showClanMenu },
  { key: "member.menu.btn.shop", icon: "textures/ui/button_custom/shop", feature: "shop", handler: Shop },
  { key: "member.menu.btn.player_shop", icon: "textures/ui/market_items/armor_stand", feature: "playerShop", handler: showPlayerShopMenu },
  { key: "member.menu.btn.report_player", icon: "textures/items/trial_key", feature: "reportPlayer", handler: showReportPlayerMenu },
  { key: "member.menu.btn.barter", icon: "textures/ui/icon_book_writable", feature: "barter", handler: BarterMenu },
  { key: "member.menu.btn.backpack", icon: "textures/items/bundle", feature: "backpack", handler: openBackpackMenu },
  { key: "member.menu.btn.battlepass", icon: "textures/ui/icon_book_writable", feature: "battlepass", handler: openBattlepass },

  { key: "member.menu.btn.toggle_scoreboard", icon: "textures/items/sign", feature: "personalScoreboard", handler: togglePersonalScoreboard },
  { key: "member.menu.btn.emotes", icon: "textures/ui/button_custom/snow_angel", feature: "emote", handler: showEmoteUI },
  { key: "member.menu.btn.language", icon: "textures/ui/language_glyph", feature: "language", handler: showLanguageMenu },
]
const messages = (() => {
  const cache = new Map()
  const createMessage = (prefix, text) => {
    const key = `${prefix}:${text}`
    if (!cache.has(key)) {
      cache.set(key, JSON.stringify({ rawtext: [{ text: `${prefix} ${text}` }] }))
    }
    return cache.get(key)
  }
  return {
    error: text => createMessage("§cError:", text),
    success: text => createMessage("§aSuccess:", text),
    info: text => createMessage("Info:", text),
  }
})()
export function showMemberMenu(source) {
  // The merged pack exposes one menu only. EXTREMESMP provides the backend
  // routes and the Kiw-style form presentation used by that unified menu.
  return openEXTREMESMPMenu(source)
}
export const toggleFeature = (feature, status) => {
  if (feature in featureStatus) {
    featureStatus[feature] = !!status
    try {
      world.setDynamicProperty("memberFeatureStatus", JSON.stringify(featureStatus))
    } catch (e) {
      console.warn("Could not save feature settings - Changes may not persist", e)
    }
  }
}
export { featureStatus }
