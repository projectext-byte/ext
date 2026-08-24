import { ActionFormData } from "./core.js"
import { Lang } from "./lib/Lang.js"

// Keep this order in sync with MENU_ACTIONS in kiwora.js.
const MAIN_MENU_BUTTONS = [
  { key: "menu.items", icon: "textures/ui/market_items/experience_bottle" },
  { key: "menu.set_time", icon: "textures/ui/market_items/ender_eye" },
  { key: "menu.vanish", icon: "textures/items/potion_bottle_invisibility" },
  { key: "menu.scoreboard", icon: "textures/ui/market_items/gold_ingot" },
  { key: "menu.eliminate", icon: "textures/ui/market_items/iron_ingot" },
  { key: "menu.fake_action", icon: "textures/ui/enable_editor" },
  { key: "menu.set_spawn", icon: "textures/ui/saleribbon" },
  { key: "menu.player", icon: "textures/ui/Friend2" },
  { key: "menu.rank", icon: "textures/ui/icon_best3" },
  { key: "menu.gamemode", icon: "textures/ui/mashup_world" },
  { key: "menu.member", icon: "textures/ui/controller_glyph_color" },
  { key: "menu.broadcast", icon: "textures/ui/market_items/ender_eye" },
  { key: "menu.gamerule", icon: "textures/ui/market_items/bookshelf" },
  { key: "menu.fake_chat", icon: "textures/ui/comment" },
  { key: "menu.warps_set", icon: "textures/ui/subscription_glyph_color" },
  { key: "menu.board_set", icon: "textures/ui/gear" },
  { key: "menu.view_report", icon: "textures/items/flow_armor_trim_smithing_template" },
  { key: "menu.floating_txt", icon: "textures/ui/new_offer_symbol" },
  { key: "menu.chat_set", icon: "textures/ui/mute_off" },
  { key: "menu.member_set", icon: "textures/ui/controller_glyph_color" },
  { key: "menu.chat_games", icon: "textures/ui/hanging_sign_bamboo" },
  { key: "menu.npc_system", icon: "textures/ui/market_items/bundle" },
  { key: "menu.clear_lag", icon: "textures/ui/icon_iron_pickaxe" },
  { key: "menu.custom_item", icon: "textures/ui/Add-Ons_Nav_Icon36x36" },
  { key: "menu.server_opt", icon: "textures/items/coast_armor_trim_smithing_template" },
  { key: "menu.afk_config", icon: "textures/ui/market_items/experience_bottle" },
  { key: "menu.lobby_prtct", icon: "textures/ui/market_items/beacon" },
  { key: "menu.cstm_button", icon: "textures/ui/csb_faq_fox" },
  { key: "menu.ore_gnrtr", icon: "textures/blocks/diamond_ore" },
  { key: "menu.xray_log", icon: "textures/ui/button_custom/air-block_128-63725" },
  { key: "menu.ban_item", icon: "textures/ui/icon_lock" },
  { key: "menu.player_log", icon: "textures/ui/icon_steve" },
  { key: "menu.whitelist", icon: "textures/ui/icon_setting" },
  { key: "menu.login", icon: "textures/ui/icon_lock" },
  { key: "menu.afk_zone", icon: "textures/ui/accessibility_glyph_color" },
  { key: "menu.language", icon: "textures/ui/language_glyph_color" },
  { key: "menu.custom_cmds", icon: "textures/ui/icon_bookshelf" }
];

function createKiworaFormFactory() {
  return function (player) {
    const dim = player.dimension.id.replace("minecraft:", "");
    const statsText = `§7${player.name} §r| §7Dimension: ${dim}`;

    const form = new ActionFormData()
      .title("\u00A7k\u00A7i\u00A7w\u00A7a\u00A7d\u00A7m\u00A7r\u00A7bEXTREMESMP")
      .body(statsText);

    for (const button of MAIN_MENU_BUTTONS) {
      form.button(Lang.t(player, button.key), button.icon);
    }

    return form;
  }
}

function createKillFormFactory() {
  return function (player) {
    return new ActionFormData()
      .title(Lang.t(player, "kill.title"))
      .body(Lang.t(player, "kill.body"))
      .button(Lang.t(player, "kill.btn.monsters"), "textures/ui/promo_spider")
      .button(Lang.t(player, "kill.btn.animals"), "textures/ui/horse_heart")
      .button(Lang.t(player, "kill.btn.players"), "textures/ui/FriendsIcon")
      .button(Lang.t(player, "kill.btn.items"), "textures/items/iron_sword")
      .button(Lang.t(player, "kill.btn.back"), "textures/ui/arrow_left")
  }
}

function createPlayerFormFactory() {
  return function (player) {
    return new ActionFormData()
      .title(player ? Lang.t(player, "player.menu.title") : "Player Options")
      .body(player ? Lang.t(player, "player.menu.body") : "§7Main Menu §r> §fPlayer Options")
      .button(player ? Lang.t(player, "player.btn.info") : "info", "textures/ui/infobulb")
      .button(player ? Lang.t(player, "player.btn.teleport") : "teleport", "textures/ui/glyph_realms")
      .button(player ? Lang.t(player, "player.btn.ban") : "ban/unban", "textures/ui/hammer_l")
      .button(player ? Lang.t(player, "player.btn.mute") : "mute/unmute", "textures/ui/mute_off")
      .button(player ? Lang.t(player, "player.btn.kick") : "kick", "textures/ui/minus")
      .button(player ? Lang.t(player, "player.btn.give") : "give items", "textures/items/diamond_chestplate")
      .button(player ? Lang.t(player, "player.btn.invsee") : "invsee", "textures/ui/inventory_icon")
      .button(player ? Lang.t(player, "player.btn.money") : "money", "textures/items/gold_nugget")
      .button(player ? Lang.t(player, "player.btn.custom_cmds") : "custom commands", "textures/ui/icon_bookshelf")
      .button(player ? Lang.t(player, "common.back") : "back", "textures/ui/arrow_left")
  }
}

function createScoreboardFormFactory() {
  return function (player) {
    return new ActionFormData()
      .title(Lang.t(player, "sb.title"))
      .body(Lang.t(player, "sb.body"))
      .button(Lang.t(player, "sb.btn.create"), "textures/ui/plus")
      .button(Lang.t(player, "sb.btn.view"), "textures/ui/magnifying_glass")
      .button(Lang.t(player, "sb.btn.display"), "textures/ui/addServer")
      .button(Lang.t(player, "sb.btn.reset"), "textures/ui/trash")
      .button(Lang.t(player, "sb.btn.back"), "textures/ui/arrow_left")
  }
}

function createVanishFormFactory() {
  return function () {
    return new ActionFormData()
      .title("Staff Vanish System")
      .body("§7Main Menu §r> §fStaff Vanish System")
      .button("invisible mode", "textures/ui/invisibility_effect")
      .button("clear effects", "textures/items/bucket_milk")
      .button("spectator mode", "textures/items/armor_stand")
      .button("back", "textures/ui/arrow_left")
  }
}

function createGamemodeFormFactory() {
  return function () {
    return new ActionFormData()
      .title("Change Gamemode")
      .body("§7Main Menu §r> §fChange Gamemode")
      .button("Survival", "textures/items/book_portfolio")
      .button("Creative", "textures/items/book_portfolio")
      .button("Adventure", "textures/items/book_portfolio")
      .button("Spectator", "textures/items/book_portfolio")
      .button("Back", "textures/ui/arrow_left")
  }
}

function createRankFormFactory() {
  return function () {
    return new ActionFormData()
      .title("Admin Rank Panel")
      .body("§7Main Menu §r> §fRank Admin")
      .button("Set Rank", "textures/ui/icon_steve")
      .button("Remove Rank", "textures/ui/trash_default")
      .button("Manage Custom", "textures/ui/creative_icon")
      .button("List Ranks Have Skill", "textures/items/villagebell")
      .button("Set Default", "textures/ui/icon_sign")
      .button("Rank Customize", "textures/ui/icon_recipe_item")
      .button("Rank Benefits", "textures/ui/health_boost_effect")
      .button("Rank Subscription", "textures/ui/timer")
      .button("Back", "textures/ui/arrow_left")
  }
}

function createTimeFormFactory() {
  return function (player) {
    return new ActionFormData()
      .title(Lang.t(player, "time.title"))
      .body(Lang.t(player, "time.body"))
      .button(Lang.t(player, "time.btn.day"), "textures/items/clock_item")
      .button(Lang.t(player, "time.btn.sunset"), "textures/items/clock_item")
      .button(Lang.t(player, "time.btn.night"), "textures/items/clock_item")
      .button(Lang.t(player, "time.btn.clear"), "textures/ui/weather_clear")
      .button(Lang.t(player, "time.btn.rain"), "textures/ui/weather_rain")
      .button(Lang.t(player, "time.btn.storm"), "textures/ui/weather_thunderstorm")
      .button(Lang.t(player, "time.btn.back"), "textures/ui/arrow_left")
  }
}

const kiwora = createKiworaFormFactory()
const killForm = createKillFormFactory()
const playerForm = createPlayerFormFactory()
const scoreboardForm = createScoreboardFormFactory()
const vanishForm = createVanishFormFactory()
const gamemodeForm = createGamemodeFormFactory()
const timeForm = createTimeFormFactory()
const rankForm = createRankFormFactory()

export {
  killForm,
  kiwora,
  playerForm,
  scoreboardForm,
  vanishForm,
  timeForm,
  gamemodeForm,
  rankForm
}
