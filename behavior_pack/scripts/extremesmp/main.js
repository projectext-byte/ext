import {
  world,
  system,
  ItemStack,
  CommandPermissionLevel,
  PlayerPermissionLevel,
  CustomCommandStatus,
  CustomCommandParamType,
} from "@minecraft/server";
import {
  ActionFormData,
  ModalFormData,
  MessageFormData,
} from "../core.js";
import { random_tp } from "../plugins/random-teleport/index.js";
import { registerEXTREMESMPMenu } from "./bridge.js";

const OBJ_MONEY = "extremesmp_money";
const OBJ_RANK = "extremesmp_rank";
const OBJ_JOINS = "extremesmp_joins";
const DATA_VERSION = 5;
const MAX_SCOREBOARD_VALUE = 2147483647;
const MAX_MARKET_TRANSACTION = 2000000000;
const MAX_PLAYER_LISTING_COUNT = 60;
const MARKET_FEE = 0.05;
const CHAT_COOLDOWN_TICKS = 10;
const REPORT_COOLDOWN_TICKS = 100;
const GIFT_COOLDOWN_TICKS = 20;
const OP_OWNER_SYNC_TICKS = 20;
const QUEST_ROTATION_MS = 2 * 60 * 60 * 1000;
const QUEST_CATALOG_SIZE = 1000;
const QUESTS_PER_ROTATION = 8;
const QUEST_CYCLE_WINDOWS = Math.floor(QUEST_CATALOG_SIZE / QUESTS_PER_ROTATION);
const MARKET_REPRICE_MS = 10 * 60 * 1000;
// Legacy PTP defaults retained for compatibility with the supplied 0.mcpack.
const TELEPORT_REQUEST_TIMEOUT_MS = 30 * 1000;
const TELEPORT_REQUEST_TIMEOUT_TICKS = Math.ceil(TELEPORT_REQUEST_TIMEOUT_MS / 50);
const TELEPORT_REQUEST_COOLDOWN_TICKS = 20 * 20;
const TELEPORT_COUNTDOWN_TICKS = 3 * 20;
const TELEPORT_REMINDER_TICKS = 5 * 20;
const TELEPORT_MAX_BLOCKED_PLAYERS = 100;
const TELEPORT_UNSAFE_SEARCH_RADIUS = 4;
// 0.mcpack cancels only after a meaningful 0.35-block movement, not tiny server jitter.
const TELEPORT_MOVE_TOLERANCE = 0.35;
const TELEPORT_REQUESTS = new Map();
const TELEPORT_COUNTDOWNS = new Map();
const RESPAWN_MIN_DISTANCE = 64;
const RESPAWN_MAX_DISTANCE = 512;
// Original RRespawn uses a 5,000-block horizontal range and Y 80..320.
// EXTREMESMP keeps its verified landing scan, but adopts these legacy anchor bounds.
const RESPAWN_LEGACY_RANGE = 5000;
const RESPAWN_LEGACY_MIN_Y = 80;
const RESPAWN_LEGACY_MAX_Y = 320;
const RESPAWN_CONFIG_ITEM = "extremesmp:respawn_config";
// Keep the original RRespawn item usable when that item is still present.
const RRESPAWN_LEGACY_CONFIG_ITEM = "zc:respawn_config";
let rrespawnSpawnQueued = false;
// Keep the player only about seven blocks above a verified dry landing.
const RESPAWN_STAGE_MIN_Y = 7;
const RESPAWN_STAGE_MAX_Y = 7;
const RESPAWN_STAGE_TICKS = 40;
// Bedrock cannot intercept the client chunk renderer like the Java/NeoForge
// Chunk Animator. This lightweight fallback animates only while this pack is
// staging a teleport, with no per-player entities and no block edits.
const CHUNK_LOAD_ANIMATION_STEP_TICKS = 4;
const CHUNK_LOAD_ANIMATION_DURATION_TICKS = 40;
const CHUNK_LOAD_ANIMATION = new Map();
// Runtime-only caches: they are rebuilt from Bedrock state and cleared on leave.
// This prevents repeated world.getPlayers()/dynamic-property reads from hot paths.
const ONLINE_PLAYERS_BY_ID = new Map();
const INITIALIZED_PLAYERS = new Set();
let ONLINE_PLAYERS_TICK = -1;
let ONLINE_PLAYERS_SNAPSHOT = [];
const RANK_TAG_SIGNATURES = new Map();
const NO_RESPAWN_PLAYERS = new Set();
const SECURITY_RUNTIME = new Map();
const SECURITY_FLUSH_TICKS = 40;
// Keep the form token alive while a player is reading or filling a form.
// A newer request replaces the older token; the existing UserBusy retry path
// then waits for Bedrock to finish closing the previous form.
const UI_PENDING = new Map();
// Keep the last valid Bedrock Player object for the UI flow. The SDK can
// briefly return an empty snapshot immediately after a form closes; this
// cache is only a short-lived UI fallback and is never used for permissions.
const UI_LIVE_PLAYERS = new Map();
let UI_SEQUENCE = 0;

const WORLD_OPTIONS = [
  { key: "OVERWORLD", dimensionId: "minecraft:overworld", label: "โลกหลัก", description: "Overworld • เอาชีวิตรอดและตลาดหลัก", icon: "textures/ui/market_items/emerald_block" },
  { key: "NETHER", dimensionId: "minecraft:nether", label: "โลกลาวา", description: "Nether • พื้นที่อันตรายและทรัพยากรหายาก", icon: "textures/ui/market_items/ender_eye" },
  { key: "THE_END", dimensionId: "minecraft:the_end", label: "โลกเอนด์", description: "The End • เกาะว่างและเมืองเอนด์", icon: "textures/ui/market_items/end_stone" },
];

// In-game security is detection and throttling, not a replacement for host
// firewall/DDoS protection. Thresholds are intentionally staged to reduce
// false positives in an anarchy-lite survival server.
const SECURITY_WINDOW_MS = 60 * 1000;
const SECURITY_PROBATION_MS = 90 * 1000;
const SECURITY_ACTION_BURST = 240;
const SECURITY_ORE_BURST = 6;
const SECURITY_FLAG_COOLDOWN_MS = 30 * 1000;
const SECURITY_THROTTLE_MS = 2 * 1000;
const SECURITY_ORE_BLOCKS = new Set([
  "minecraft:diamond_ore", "minecraft:deepslate_diamond_ore",
  "minecraft:emerald_ore", "minecraft:deepslate_emerald_ore",
  "minecraft:gold_ore", "minecraft:deepslate_gold_ore",
  "minecraft:redstone_ore", "minecraft:deepslate_redstone_ore",
  "minecraft:lapis_ore", "minecraft:deepslate_lapis_ore",
  "minecraft:ancient_debris",
]);

const RANKS = {
  PLAYER: { label: "PLAYER", color: "§f", score: 0, glyph: "\uEB00", icon: "textures/ui/market_items/diamond" },
  MEMBER: { label: "MEMBER", color: "§f", score: 10, glyph: "\uEB01", icon: "textures/extremesmp/rank_member" },
  VIP_999: { label: "VIP 999", color: "§6", score: 20, glyph: "\uEB02", icon: "textures/extremesmp/rank_vip_999" },
  PRO: { label: "PRO", color: "§a", score: 30, glyph: "\uEB03", icon: "textures/ui/market_items/diamond" },
  PLATINUM: { label: "PLATINUM", color: "§b", score: 40, glyph: "\uEB04", icon: "textures/ui/market_items/diamond" },
  RUBY: { label: "RUBY", color: "§d", score: 50, glyph: "\uEB05", icon: "textures/ui/market_items/diamond" },
  ELITE: { label: "ELITE", color: "§d", score: 60, glyph: "\uEB06", icon: "textures/ui/market_items/diamond" },
  ULTIMATE: { label: "ULTIMATE", color: "§d", score: 70, glyph: "\uEB07", icon: "textures/ui/market_items/diamond" },
  SSS_MEMBER: { label: "SSS MEMBER", color: "§5", score: 80, glyph: "\uEB08", icon: "textures/extremesmp/rank_sss_member" },
  BETATESTER: { label: "BETATESTER", color: "§b", score: 85, glyph: "\uEB09", icon: "textures/extremesmp/rank_betatester" },
  HELPER: { label: "HELPER", color: "§2", score: 90, glyph: "\uEB0A", icon: "textures/ui/market_items/diamond" },
  TRIAL: { label: "TRIAL", color: "§6", score: 92, glyph: "\uEB0B", icon: "textures/ui/market_items/diamond" },
  MOD: { label: "MOD", color: "§e", score: 94, glyph: "\uEB0C", icon: "textures/ui/market_items/diamond" },
  ADMIN: { label: "ADMIN", color: "§c", score: 96, glyph: "\uEB0D", icon: "textures/extremesmp/rank_admin" },
  OWNER: { label: "OWNER", color: "§4", score: 100, glyph: "\uEB0E", icon: "textures/extremesmp/rank_owner" },
};

const CHAT_RANK_GLYPHS = Object.freeze({
  PLAYER: "\uEA00",
  MEMBER: "\uEA01",
  VIP_999: "\uEA02",
  PRO: "\uEA03",
  PLATINUM: "\uEA04",
  RUBY: "\uEA05",
  ELITE: "\uEA06",
  ULTIMATE: "\uEA07",
  SSS_MEMBER: "\uEA08",
  BETATESTER: "\uEA09",
  HELPER: "\uEA0A",
  TRIAL: "\uEA0B",
  MOD: "\uEA0C",
  ADMIN: "\uEA0D",
  OWNER: "\uEA0E",
});

const RANK_BAR_GLYPHS = Object.freeze({
  PLAYER: "\uE900\uE901\uE902\uE903\uE904\uE905",
  MEMBER: "\uE906\uE907\uE908\uE909\uE90A\uE90B",
  VIP_999: "\uE90C\uE90D\uE90E\uE90F\uE910\uE911\uE912",
  PRO: "\uE913\uE914\uE915",
  PLATINUM: "\uE916\uE917\uE918\uE919\uE91A\uE91B\uE91C\uE91D",
  RUBY: "\uE91E\uE91F\uE920\uE921",
  ELITE: "\uE922\uE923\uE924\uE925\uE926",
  ULTIMATE: "\uE927\uE928\uE929\uE92A\uE92B\uE92C\uE92D\uE92E",
  SSS_MEMBER: "\uE92F\uE930\uE931\uE932\uE933\uE934\uE935\uE936\uE937\uE938",
  BETATESTER: "\uE939\uE93A\uE93B\uE93C\uE93D\uE93E\uE93F\uE940\uE941\uE942",
  HELPER: "\uE943\uE944\uE945\uE946\uE947\uE948",
  TRIAL: "\uE949\uE94A\uE94B\uE94C\uE94D",
  MOD: "\uE94E\uE94F\uE950",
  ADMIN: "\uE951\uE952\uE953\uE954\uE955",
  OWNER: "\uE956\uE957\uE958\uE959\uE95A",
});

// In-game NRC package store. Keys are entered by ADMIN staff and are single-use.
// Rewards are credited to the existing extremesmp_money scoreboard objective.
const NRC_PACKAGE_ICON = "textures/ui/market_items/bundle";
const NRC_PACKAGES = [
  { key: "NRC_5", price: 5, reward: 6, badge: "", icon: NRC_PACKAGE_ICON },
  { key: "NRC_10", price: 10, reward: 12, badge: "ยอดฮิต", icon: NRC_PACKAGE_ICON },
  { key: "NRC_30", price: 30, reward: 35, badge: "", icon: NRC_PACKAGE_ICON },
  { key: "NRC_50", price: 50, reward: 60, badge: "", icon: NRC_PACKAGE_ICON },
  { key: "NRC_100", price: 100, reward: 120, badge: "สุดคุ้ม", icon: NRC_PACKAGE_ICON },
  { key: "NRC_300", price: 300, reward: 330, badge: "", icon: NRC_PACKAGE_ICON },
  { key: "NRC_500", price: 500, reward: 600, badge: "", icon: NRC_PACKAGE_ICON },
  { key: "NRC_999", price: 999, reward: 1199, badge: "พิเศษ", icon: NRC_PACKAGE_ICON },
];
const NRC_PACKAGE_KEYS_PROP = "extremesmp:packageKeys";
const NRC_PACKAGE_MAX_KEYS_PER_PACKAGE = 20;

function normalizePackageKey(value) {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, "").slice(0, 80);
}

function maskPackageKey(key) {
  const normalized = normalizePackageKey(key);
  return normalized.length > 4 ? `****${normalized.slice(-4)}` : "****";
}

function packageKeyState() {
  const raw = getJson(world, NRC_PACKAGE_KEYS_PROP, {});
  const state = { available: {}, used: {} };
  for (const pack of NRC_PACKAGES) {
    const legacy = Array.isArray(raw?.[pack.key]) ? raw[pack.key] : [];
    const available = Array.isArray(raw?.available?.[pack.key]) ? raw.available[pack.key] : legacy;
    const used = Array.isArray(raw?.used?.[pack.key]) ? raw.used[pack.key] : [];
    state.available[pack.key] = [...new Set(available.map(normalizePackageKey).filter(Boolean))].slice(-NRC_PACKAGE_MAX_KEYS_PER_PACKAGE);
    state.used[pack.key] = [...new Set(used.map(normalizePackageKey).filter(Boolean))].slice(-NRC_PACKAGE_MAX_KEYS_PER_PACKAGE);
  }
  return state;
}

function savePackageKeyState(state) {
  setJson(world, NRC_PACKAGE_KEYS_PROP, state);
  return state;
}

const LOOT_BOXES = {
  COMMON: {
    key: "COMMON", label: "ธรรมดา", color: "§7", cost: 500,
    icon: NRC_PACKAGE_ICON,
    rewards: [
      { kind: "item", id: "minecraft:bread", label: "ขนมปัง 16", amount: 16, weight: 30 },
      { kind: "item", id: "minecraft:iron_ingot", label: "เหล็ก 8", amount: 8, weight: 25 },
      { kind: "item", id: "minecraft:coal", label: "ถ่านหิน 16", amount: 16, weight: 20 },
      { kind: "item", id: "minecraft:gold_ingot", label: "ทอง 4", amount: 4, weight: 15 },
      { kind: "item", id: "minecraft:emerald", label: "มรกต 1", amount: 1, weight: 7 },
      { kind: "coins", label: "500 NRC", amount: 500, weight: 3 },
    ],
  },
  RARE: {
    key: "RARE", label: "หายาก", color: "§b", cost: 1500,
    icon: NRC_PACKAGE_ICON,
    rewards: [
      { kind: "item", id: "minecraft:gold_ingot", label: "ทอง 12", amount: 12, weight: 25 },
      { kind: "item", id: "minecraft:diamond", label: "เพชร 2", amount: 2, weight: 18 },
      { kind: "item", id: "minecraft:emerald", label: "มรกต 3", amount: 3, weight: 17 },
      { kind: "item", id: "minecraft:experience_bottle", label: "ขวดประสบการณ์ 8", amount: 8, weight: 15 },
      { kind: "item", id: "minecraft:obsidian", label: "ออบซิเดียน 16", amount: 16, weight: 15 },
      { kind: "coins", label: "2,500 NRC", amount: 2500, weight: 10 },
    ],
  },
  EPIC: {
    key: "EPIC", label: "มหากาพย์", color: "§d", cost: 5000,
    icon: NRC_PACKAGE_ICON,
    rewards: [
      { kind: "item", id: "minecraft:diamond", label: "เพชร 8", amount: 8, weight: 30 },
      { kind: "item", id: "minecraft:netherite_scrap", label: "เศษเนเธอไรต์ 2", amount: 2, weight: 18 },
      { kind: "item", id: "minecraft:enchanted_golden_apple", label: "แอปเปิลทองคำเสริมพลัง 1", amount: 1, weight: 5 },
      { kind: "item", id: "minecraft:emerald", label: "มรกต 16", amount: 16, weight: 20 },
      { kind: "item", id: "minecraft:crying_obsidian", label: "ออบซิเดียนร้องไห้ 16", amount: 16, weight: 17 },
      { kind: "coins", label: "10,000 NRC", amount: 10000, weight: 10 },
    ],
  },
  LEGENDARY: {
    key: "LEGENDARY", label: "ราชานุสรณ์", color: "§6", cost: 15000,
    icon: NRC_PACKAGE_ICON,
    rewards: [
      { kind: "item", id: "minecraft:netherite_ingot", label: "แท่งเนเธอไรต์ 1", amount: 1, weight: 20 },
      { kind: "item", id: "minecraft:diamond_block", label: "บล็อกเพชร 4", amount: 4, weight: 20 },
      { kind: "item", id: "minecraft:beacon", label: "บีคอน 1", amount: 1, weight: 10 },
      { kind: "item", id: "minecraft:golden_apple", label: "แอปเปิลทองคำ 8", amount: 8, weight: 20 },
      { kind: "item", id: "minecraft:ender_pearl", label: "ไข่มุกเอนเดอร์ 16", amount: 16, weight: 15 },
      { kind: "coins", label: "50,000 NRC", amount: 50000, weight: 15 },
    ],
  },
};

const MARKET_TEXTURE_IDS = new Set([
  "minecraft:acacia_chest_boat",
  "minecraft:acacia_hanging_sign",
  "minecraft:acacia_shelf",
  "minecraft:acacia_trapdoor",
  "minecraft:amethyst_block",
  "minecraft:amethyst_cluster",
  "minecraft:amethyst_shard",
  "minecraft:angler_pottery_sherd",
  "minecraft:apple",
  "minecraft:archer_pottery_sherd",
  "minecraft:armadillo_scute",
  "minecraft:armor_stand",
  "minecraft:arms_up_pottery_sherd",
  "minecraft:arrow",
  "minecraft:azalea_leaves",
  "minecraft:bamboo",
  "minecraft:bamboo_block",
  "minecraft:bamboo_chest_raft",
  "minecraft:bamboo_door",
  "minecraft:bamboo_fence",
  "minecraft:bamboo_fence_gate",
  "minecraft:bamboo_hanging_sign",
  "minecraft:bamboo_mosaic",
  "minecraft:bamboo_planks",
  "minecraft:bamboo_raft",
  "minecraft:bamboo_shelf",
  "minecraft:bamboo_sign",
  "minecraft:bamboo_trapdoor",
  "minecraft:barrier",
  "minecraft:beacon",
  "minecraft:bedrock",
  "minecraft:beetroot",
  "minecraft:beetroot_soup",
  "minecraft:birch_chest_boat",
  "minecraft:birch_hanging_sign",
  "minecraft:birch_shelf",
  "minecraft:birch_trapdoor",
  "minecraft:blackstone",
  "minecraft:blade_pottery_sherd",
  "minecraft:blaze_powder",
  "minecraft:blaze_rod",
  "minecraft:blue_egg",
  "minecraft:blue_ice",
  "minecraft:bolt_armor_trim_smithing_template",
  "minecraft:bone",
  "minecraft:bookshelf",
  "minecraft:bordure_indented_banner_pattern",
  "minecraft:bowl",
  "minecraft:bread",
  "minecraft:breeze_rod",
  "minecraft:brewer_pottery_sherd",
  "minecraft:brewing_stand",
  "minecraft:brick",
  "minecraft:brown_egg",
  "minecraft:brush",
  "minecraft:budding_amethyst",
  "minecraft:bundle",
  "minecraft:burn_pottery_sherd",
  "minecraft:bush",
  "minecraft:cactus_flower",
  "minecraft:cake",
  "minecraft:calcite",
  "minecraft:campfire",
  "minecraft:carrot",
  "minecraft:carrot_on_a_stick",
  "minecraft:cauldron",
  "minecraft:chainmail_boots",
  "minecraft:chainmail_chestplate",
  "minecraft:chainmail_helmet",
  "minecraft:chainmail_leggings",
  "minecraft:charcoal",
  "minecraft:cherry_boat",
  "minecraft:cherry_chest_boat",
  "minecraft:cherry_door",
  "minecraft:cherry_hanging_sign",
  "minecraft:cherry_leaves",
  "minecraft:cherry_planks",
  "minecraft:cherry_sapling",
  "minecraft:cherry_shelf",
  "minecraft:cherry_sign",
  "minecraft:cherry_trapdoor",
  "minecraft:chiseled_cinnabar",
  "minecraft:chiseled_copper",
  "minecraft:chiseled_nether_bricks",
  "minecraft:chiseled_polished_blackstone",
  "minecraft:chiseled_resin_bricks",
  "minecraft:chiseled_sulfur",
  "minecraft:chiseled_tuff",
  "minecraft:chiseled_tuff_bricks",
  "minecraft:chorus_flower",
  "minecraft:chorus_fruit",
  "minecraft:chorus_plant",
  "minecraft:cinnabar",
  "minecraft:cinnabar_bricks",
  "minecraft:clay",
  "minecraft:clay_ball",
  "minecraft:coal",
  "minecraft:coal_block",
  "minecraft:coal_ore",
  "minecraft:coarse_dirt",
  "minecraft:coast_armor_trim_smithing_template",
  "minecraft:cobblestone",
  "minecraft:command_block",
  "minecraft:comparator",
  "minecraft:cookie",
  "minecraft:copper_axe",
  "minecraft:copper_bars",
  "minecraft:copper_block",
  "minecraft:copper_boots",
  "minecraft:copper_bulb",
  "minecraft:copper_chain",
  "minecraft:copper_chestplate",
  "minecraft:copper_door",
  "minecraft:copper_grate",
  "minecraft:copper_helmet",
  "minecraft:copper_hoe",
  "minecraft:copper_horse_armor",
  "minecraft:copper_ingot",
  "minecraft:copper_lantern",
  "minecraft:copper_leggings",
  "minecraft:copper_nugget",
  "minecraft:copper_ore",
  "minecraft:copper_pickaxe",
  "minecraft:copper_shovel",
  "minecraft:copper_sword",
  "minecraft:copper_torch",
  "minecraft:copper_trapdoor",
  "minecraft:cracked_nether_bricks",
  "minecraft:cracked_polished_blackstone_bricks",
  "minecraft:creeper_banner_pattern",
  "minecraft:crimson_door",
  "minecraft:crimson_fungus",
  "minecraft:crimson_hanging_sign",
  "minecraft:crimson_roots",
  "minecraft:crimson_shelf",
  "minecraft:crying_obsidian",
  "minecraft:cut_copper",
  "minecraft:danger_pottery_sherd",
  "minecraft:dark_oak_chest_boat",
  "minecraft:dark_oak_hanging_sign",
  "minecraft:dark_oak_shelf",
  "minecraft:dark_oak_trapdoor",
  "minecraft:deadbush",
  "minecraft:diamond",
  "minecraft:diamond_axe",
  "minecraft:diamond_block",
  "minecraft:diamond_boots",
  "minecraft:diamond_chestplate",
  "minecraft:diamond_helmet",
  "minecraft:diamond_hoe",
  "minecraft:diamond_horse_armor",
  "minecraft:diamond_leggings",
  "minecraft:diamond_ore",
  "minecraft:diamond_pickaxe",
  "minecraft:diamond_shovel",
  "minecraft:diamond_sword",
  "minecraft:dirt",
  "minecraft:dirt_with_roots",
  "minecraft:disc_fragment_5",
  "minecraft:dragon_egg",
  "minecraft:dried_kelp",
  "minecraft:dripstone_block",
  "minecraft:dune_armor_trim_smithing_template",
  "minecraft:echo_shard",
  "minecraft:egg",
  "minecraft:elytra",
  "minecraft:emerald",
  "minecraft:emerald_block",
  "minecraft:emerald_ore",
  "minecraft:end_bricks",
  "minecraft:end_crystal",
  "minecraft:end_rod",
  "minecraft:end_stone",
  "minecraft:ender_eye",
  "minecraft:ender_pearl",
  "minecraft:experience_bottle",
  "minecraft:explorer_pottery_sherd",
  "minecraft:exposed_chiseled_copper",
  "minecraft:exposed_copper",
  "minecraft:exposed_copper_bars",
  "minecraft:exposed_copper_bulb",
  "minecraft:exposed_copper_chain",
  "minecraft:exposed_copper_door",
  "minecraft:exposed_copper_grate",
  "minecraft:exposed_copper_lantern",
  "minecraft:exposed_copper_trapdoor",
  "minecraft:exposed_cut_copper",
  "minecraft:exposed_lightning_rod",
  "minecraft:eye_armor_trim_smithing_template",
  "minecraft:feather",
  "minecraft:field_masoned_banner_pattern",
  "minecraft:firefly_bush",
  "minecraft:flint",
  "minecraft:flint_and_steel",
  "minecraft:flow_armor_trim_smithing_template",
  "minecraft:flow_banner_pattern",
  "minecraft:flow_pottery_sherd",
  "minecraft:flower_banner_pattern",
  "minecraft:flower_pot",
  "minecraft:friend_pottery_sherd",
  "minecraft:ghast_tear",
  "minecraft:gilded_blackstone",
  "minecraft:glass",
  "minecraft:globe_banner_pattern",
  "minecraft:glow_berries",
  "minecraft:glow_lichen",
  "minecraft:glowstone",
  "minecraft:glowstone_dust",
  "minecraft:goat_horn",
  "minecraft:gold_block",
  "minecraft:gold_ingot",
  "minecraft:gold_nugget",
  "minecraft:gold_ore",
  "minecraft:golden_dandelion",
  "minecraft:gravel",
  "minecraft:gunpowder",
  "minecraft:guster_banner_pattern",
  "minecraft:guster_pottery_sherd",
  "minecraft:hanging_roots",
  "minecraft:hardened_clay",
  "minecraft:heart_pottery_sherd",
  "minecraft:heartbreak_pottery_sherd",
  "minecraft:heavy_core",
  "minecraft:honey_bottle",
  "minecraft:honeycomb",
  "minecraft:hopper",
  "minecraft:host_armor_trim_smithing_template",
  "minecraft:howl_pottery_sherd",
  "minecraft:ice",
  "minecraft:iron_axe",
  "minecraft:iron_bars",
  "minecraft:iron_block",
  "minecraft:iron_boots",
  "minecraft:iron_chestplate",
  "minecraft:iron_helmet",
  "minecraft:iron_hoe",
  "minecraft:iron_horse_armor",
  "minecraft:iron_ingot",
  "minecraft:iron_leggings",
  "minecraft:iron_nugget",
  "minecraft:iron_ore",
  "minecraft:iron_pickaxe",
  "minecraft:iron_shovel",
  "minecraft:iron_sword",
  "minecraft:iron_trapdoor",
  "minecraft:jungle_chest_boat",
  "minecraft:netherite_ingot",
  "minecraft:netherite_scrap",
  "minecraft:obsidian",
]);

const MARKET_FALLBACK_ICONS = Object.freeze({
  WEAPONS: "textures/ui/market_categories/weapons",
  ARMOR: "textures/ui/market_categories/armor",
  TOOLS: "textures/ui/market_categories/tools",
  BLOCKS: "textures/ui/market_categories/blocks",
  FOOD: "textures/ui/market_categories/food",
  ORES: "textures/ui/market_categories/ores",
  MOB_DROPS: "textures/ui/market_categories/mob_drops",
  FARM: "textures/ui/market_categories/farm",
  POTIONS: "textures/ui/market_categories/potions",
  DECORATIONS: "textures/ui/market_categories/decorations",
});

function marketIcon(item) {
  if (item && MARKET_TEXTURE_IDS.has(item.id)) {
    return `textures/ui/market_items/${String(item.id).split(":")[1]}`;
  }
  const itemKey = String(item?.id || "").split(":")[1] || "";
  const category = Object.entries(MARKET_CATEGORY_RULES).find(([, rule]) => rule.test(itemKey))?.[0];
  return MARKET_FALLBACK_ICONS[category] || "textures/ui/market_categories/all";
}

const POPULAR_MARKET_IDS = new Set([
  "minecraft:diamond", "minecraft:emerald", "minecraft:iron_ingot", "minecraft:gold_ingot",
  "minecraft:netherite_ingot", "minecraft:netherite_scrap", "minecraft:ancient_debris",
  "minecraft:diamond_sword", "minecraft:diamond_pickaxe", "minecraft:netherite_sword",
  "minecraft:netherite_pickaxe", "minecraft:elytra", "minecraft:totem_of_undying",
  "minecraft:enchanted_golden_apple", "minecraft:golden_apple", "minecraft:ender_pearl",
  "minecraft:obsidian", "minecraft:beacon", "minecraft:experience_bottle", "minecraft:arrow",
  "minecraft:bow", "minecraft:crossbow", "minecraft:shield", "minecraft:bread",
]);

const MARKET_CATEGORY_RULES = {
  WEAPONS: /(?:sword|bow|crossbow|trident|mace|arrow|shield|tnt|firework_rocket|fishing_rod|flint_and_steel)$/,
  ARMOR: /(?:helmet|chestplate|leggings|boots|elytra|shield|turtle_helmet)$/,
  TOOLS: /(?:pickaxe|shovel|hoe|shears|compass|clock|bucket|spyglass|lead|name_tag)$/,
  BLOCKS: /(?:block|_log$|_wood$|_planks$|_stairs$|_slab$|_wall$|_fence$|_door$|_trapdoor$|_button$|_pressure_plate$|_glass$|_wool$|_terracotta$|_concrete$|_brick|_stone$|_dirt$|_sand$|_gravel$|_ore$|anvil$|chest$|barrel$)/,
  FOOD: /(?:apple|bread|beef|porkchop|chicken|mutton|rabbit|cod|salmon|pufferfish|tropical_fish|potato|carrot|beetroot|cake|cookie|melon|berry|stew|soup|mushroom|honey_bottle|chorus_fruit|dried_kelp)$/,
  ORES: /(?:diamond|emerald|iron_ingot|iron_nugget|gold_ingot|gold_nugget|copper_ingot|coal|charcoal|redstone|lapis|quartz|amethyst|ancient_debris|netherite|raw_.*_ore|_ore$)/,
  MOB_DROPS: /(?:spawn_egg|bone|string|gunpowder|leather|slime_ball|blaze_rod|ghast_tear|spider_eye|fermented_spider_eye|ender_pearl|shulker_shell|phantom_membrane|rabbit_foot|prismarine_shard|ink_sac|glow_ink_sac|nautilus_shell|heart_of_the_sea)$/,
  FARM: /(?:wheat|seed|sugar_cane|cactus|bamboo|kelp|nether_wart|cocoa_beans|mushroom|sweet_berries|glow_berries|chorus_fruit|flower|dandelion|poppy|orchid|allium|tulip|daisy|cornflower|sunflower|lilac|peony|petals)$/,
  POTIONS: /(?:potion|enchanted_book)$/,
  DECORATIONS: /(?:banner|pottery_sherd|music_disc|armor_trim_smithing_template|dye|stained_glass|shulker_box)$/,
};

const MARKET_CATEGORIES = [
  { key: "ALL", label: "ทั้งหมด", icon: "textures/ui/market_categories/all" },
  { key: "POPULAR", label: "ของยอดฮิต", icon: "textures/ui/market_categories/popular" },
  { key: "WEAPONS", label: "อาวุธ", icon: "textures/ui/market_categories/weapons" },
  { key: "ARMOR", label: "เกราะ", icon: "textures/ui/market_categories/armor" },
  { key: "TOOLS", label: "เครื่องมือ", icon: "textures/ui/market_categories/tools" },
  { key: "BLOCKS", label: "บล็อก/วัสดุ", icon: "textures/ui/market_categories/blocks" },
  { key: "FOOD", label: "อาหาร", icon: "textures/ui/market_categories/food" },
  { key: "ORES", label: "แร่/วัตถุดิบ", icon: "textures/ui/market_categories/ores" },
  { key: "MOB_DROPS", label: "ของดรอป/ม็อบ", icon: "textures/ui/market_categories/mob_drops" },
  { key: "FARM", label: "ฟาร์ม/พืช", icon: "textures/ui/market_categories/farm" },
  { key: "POTIONS", label: "โพชั่น/หนังสือเวท", icon: "textures/ui/market_categories/potions" },
  { key: "DECORATIONS", label: "ของตกแต่ง/สะสม", icon: "textures/ui/market_categories/decorations" },
];

function marketCategory(categoryKey) {
  return MARKET_CATEGORIES.find(category => category.key === categoryKey) ?? MARKET_CATEGORIES[0];
}

function marketCategoryMatches(item, categoryKey) {
  const key = String(categoryKey || "ALL");
  if (key === "ALL") return true;
  if (key === "POPULAR") return POPULAR_MARKET_IDS.has(item.id);
  const itemKey = String(item.id || "").split(":")[1] || "";
  return MARKET_CATEGORY_RULES[key]?.test(itemKey) ?? true;
}

function marketCategoryItems(catalog, categoryKey) {
  return catalog.filter(item => marketCategoryMatches(item, categoryKey));
}

// Curated EXTREMESMP market catalog: safe player-facing items only; no spawn eggs, command blocks, or editor-only IDs.
// Server Sells: 199 items. Server Buys: 388 items, including renewable drops, farming, collectibles, and gear.
const SERVER_SELL_IDS = [
  "minecraft:stone",
  "minecraft:cobblestone",
  "minecraft:dirt",
  "minecraft:sand",
  "minecraft:gravel",
  "minecraft:glass",
  "minecraft:glass_pane",
  "minecraft:sandstone",
  "minecraft:red_sandstone",
  "minecraft:bricks",
  "minecraft:nether_bricks",
  "minecraft:quartz_block",
  "minecraft:smooth_stone",
  "minecraft:andesite",
  "minecraft:diorite",
  "minecraft:granite",
  "minecraft:obsidian",
  "minecraft:netherrack",
  "minecraft:soul_sand",
  "minecraft:end_stone",
  "minecraft:purpur_block",
  "minecraft:oak_planks",
  "minecraft:oak_log",
  "minecraft:spruce_planks",
  "minecraft:spruce_log",
  "minecraft:birch_planks",
  "minecraft:birch_log",
  "minecraft:jungle_planks",
  "minecraft:jungle_log",
  "minecraft:acacia_planks",
  "minecraft:acacia_log",
  "minecraft:dark_oak_planks",
  "minecraft:dark_oak_log",
  "minecraft:mangrove_planks",
  "minecraft:mangrove_log",
  "minecraft:cherry_planks",
  "minecraft:cherry_log",
  "minecraft:white_wool",
  "minecraft:orange_wool",
  "minecraft:magenta_wool",
  "minecraft:light_blue_wool",
  "minecraft:yellow_wool",
  "minecraft:lime_wool",
  "minecraft:pink_wool",
  "minecraft:gray_wool",
  "minecraft:light_gray_wool",
  "minecraft:cyan_wool",
  "minecraft:purple_wool",
  "minecraft:blue_wool",
  "minecraft:brown_wool",
  "minecraft:green_wool",
  "minecraft:red_wool",
  "minecraft:black_wool",
  "minecraft:white_concrete",
  "minecraft:orange_concrete",
  "minecraft:magenta_concrete",
  "minecraft:light_blue_concrete",
  "minecraft:yellow_concrete",
  "minecraft:lime_concrete",
  "minecraft:pink_concrete",
  "minecraft:gray_concrete",
  "minecraft:light_gray_concrete",
  "minecraft:cyan_concrete",
  "minecraft:purple_concrete",
  "minecraft:blue_concrete",
  "minecraft:brown_concrete",
  "minecraft:green_concrete",
  "minecraft:red_concrete",
  "minecraft:black_concrete",
  "minecraft:white_concrete_powder",
  "minecraft:orange_concrete_powder",
  "minecraft:magenta_concrete_powder",
  "minecraft:light_blue_concrete_powder",
  "minecraft:yellow_concrete_powder",
  "minecraft:lime_concrete_powder",
  "minecraft:pink_concrete_powder",
  "minecraft:gray_concrete_powder",
  "minecraft:light_gray_concrete_powder",
  "minecraft:cyan_concrete_powder",
  "minecraft:purple_concrete_powder",
  "minecraft:blue_concrete_powder",
  "minecraft:brown_concrete_powder",
  "minecraft:green_concrete_powder",
  "minecraft:red_concrete_powder",
  "minecraft:black_concrete_powder",
  "minecraft:white_terracotta",
  "minecraft:orange_terracotta",
  "minecraft:magenta_terracotta",
  "minecraft:light_blue_terracotta",
  "minecraft:yellow_terracotta",
  "minecraft:lime_terracotta",
  "minecraft:pink_terracotta",
  "minecraft:gray_terracotta",
  "minecraft:light_gray_terracotta",
  "minecraft:cyan_terracotta",
  "minecraft:purple_terracotta",
  "minecraft:blue_terracotta",
  "minecraft:brown_terracotta",
  "minecraft:green_terracotta",
  "minecraft:red_terracotta",
  "minecraft:black_terracotta",
  "minecraft:white_stained_glass",
  "minecraft:orange_stained_glass",
  "minecraft:magenta_stained_glass",
  "minecraft:light_blue_stained_glass",
  "minecraft:yellow_stained_glass",
  "minecraft:lime_stained_glass",
  "minecraft:pink_stained_glass",
  "minecraft:gray_stained_glass",
  "minecraft:light_gray_stained_glass",
  "minecraft:cyan_stained_glass",
  "minecraft:purple_stained_glass",
  "minecraft:blue_stained_glass",
  "minecraft:brown_stained_glass",
  "minecraft:green_stained_glass",
  "minecraft:red_stained_glass",
  "minecraft:black_stained_glass",
  "minecraft:bread",
  "minecraft:apple",
  "minecraft:cooked_beef",
  "minecraft:cooked_porkchop",
  "minecraft:cooked_chicken",
  "minecraft:cooked_mutton",
  "minecraft:cooked_rabbit",
  "minecraft:baked_potato",
  "minecraft:carrot",
  "minecraft:potato",
  "minecraft:cookie",
  "minecraft:cake",
  "minecraft:melon",
  "minecraft:pumpkin_pie",
  "minecraft:golden_carrot",
  "minecraft:wooden_pickaxe",
  "minecraft:wooden_axe",
  "minecraft:wooden_shovel",
  "minecraft:wooden_hoe",
  "minecraft:stone_pickaxe",
  "minecraft:stone_axe",
  "minecraft:stone_shovel",
  "minecraft:stone_hoe",
  "minecraft:iron_pickaxe",
  "minecraft:iron_axe",
  "minecraft:iron_shovel",
  "minecraft:iron_hoe",
  "minecraft:iron_sword",
  "minecraft:bow",
  "minecraft:arrow",
  "minecraft:shield",
  "minecraft:fishing_rod",
  "minecraft:shulker_box",
  "minecraft:white_shulker_box",
  "minecraft:orange_shulker_box",
  "minecraft:magenta_shulker_box",
  "minecraft:light_blue_shulker_box",
  "minecraft:yellow_shulker_box",
  "minecraft:lime_shulker_box",
  "minecraft:pink_shulker_box",
  "minecraft:gray_shulker_box",
  "minecraft:light_gray_shulker_box",
  "minecraft:cyan_shulker_box",
  "minecraft:purple_shulker_box",
  "minecraft:blue_shulker_box",
  "minecraft:brown_shulker_box",
  "minecraft:green_shulker_box",
  "minecraft:red_shulker_box",
  "minecraft:black_shulker_box",
  "minecraft:torch",
  "minecraft:ladder",
  "minecraft:bucket",
  "minecraft:water_bucket",
  "minecraft:lava_bucket",
  "minecraft:oak_boat",
  "minecraft:minecart",
  "minecraft:rail",
  "minecraft:white_bed",
  "minecraft:saddle",
  "minecraft:lead",
  "minecraft:name_tag",
  "minecraft:bone_meal",
  "minecraft:string",
  "minecraft:coal",
  "minecraft:charcoal",
  "minecraft:flint",
  "minecraft:gunpowder",
  "minecraft:redstone",
  "minecraft:redstone_torch",
  "minecraft:stone_button",
  "minecraft:stone_pressure_plate",
  "minecraft:hopper",
  "minecraft:dropper",
  "minecraft:dispenser",
  "minecraft:chest",
  "minecraft:ender_chest",
  "minecraft:repeater",
  "minecraft:comparator",
  "minecraft:piston",
  "minecraft:sticky_piston",
  "minecraft:observer",
  "minecraft:tripwire_hook",
];
const SERVER_BUY_IDS = [
  "minecraft:stone",
  "minecraft:cobblestone",
  "minecraft:dirt",
  "minecraft:sand",
  "minecraft:gravel",
  "minecraft:glass",
  "minecraft:glass_pane",
  "minecraft:sandstone",
  "minecraft:red_sandstone",
  "minecraft:bricks",
  "minecraft:nether_bricks",
  "minecraft:quartz_block",
  "minecraft:smooth_stone",
  "minecraft:andesite",
  "minecraft:diorite",
  "minecraft:granite",
  "minecraft:obsidian",
  "minecraft:netherrack",
  "minecraft:soul_sand",
  "minecraft:end_stone",
  "minecraft:purpur_block",
  "minecraft:oak_planks",
  "minecraft:oak_log",
  "minecraft:spruce_planks",
  "minecraft:spruce_log",
  "minecraft:birch_planks",
  "minecraft:birch_log",
  "minecraft:jungle_planks",
  "minecraft:jungle_log",
  "minecraft:acacia_planks",
  "minecraft:acacia_log",
  "minecraft:dark_oak_planks",
  "minecraft:dark_oak_log",
  "minecraft:mangrove_planks",
  "minecraft:mangrove_log",
  "minecraft:cherry_planks",
  "minecraft:cherry_log",
  "minecraft:white_wool",
  "minecraft:orange_wool",
  "minecraft:magenta_wool",
  "minecraft:light_blue_wool",
  "minecraft:yellow_wool",
  "minecraft:lime_wool",
  "minecraft:pink_wool",
  "minecraft:gray_wool",
  "minecraft:light_gray_wool",
  "minecraft:cyan_wool",
  "minecraft:purple_wool",
  "minecraft:blue_wool",
  "minecraft:brown_wool",
  "minecraft:green_wool",
  "minecraft:red_wool",
  "minecraft:black_wool",
  "minecraft:white_concrete",
  "minecraft:orange_concrete",
  "minecraft:magenta_concrete",
  "minecraft:light_blue_concrete",
  "minecraft:yellow_concrete",
  "minecraft:lime_concrete",
  "minecraft:pink_concrete",
  "minecraft:gray_concrete",
  "minecraft:light_gray_concrete",
  "minecraft:cyan_concrete",
  "minecraft:purple_concrete",
  "minecraft:blue_concrete",
  "minecraft:brown_concrete",
  "minecraft:green_concrete",
  "minecraft:red_concrete",
  "minecraft:black_concrete",
  "minecraft:white_concrete_powder",
  "minecraft:orange_concrete_powder",
  "minecraft:magenta_concrete_powder",
  "minecraft:light_blue_concrete_powder",
  "minecraft:yellow_concrete_powder",
  "minecraft:lime_concrete_powder",
  "minecraft:pink_concrete_powder",
  "minecraft:gray_concrete_powder",
  "minecraft:light_gray_concrete_powder",
  "minecraft:cyan_concrete_powder",
  "minecraft:purple_concrete_powder",
  "minecraft:blue_concrete_powder",
  "minecraft:brown_concrete_powder",
  "minecraft:green_concrete_powder",
  "minecraft:red_concrete_powder",
  "minecraft:black_concrete_powder",
  "minecraft:white_terracotta",
  "minecraft:orange_terracotta",
  "minecraft:magenta_terracotta",
  "minecraft:light_blue_terracotta",
  "minecraft:yellow_terracotta",
  "minecraft:lime_terracotta",
  "minecraft:pink_terracotta",
  "minecraft:gray_terracotta",
  "minecraft:light_gray_terracotta",
  "minecraft:cyan_terracotta",
  "minecraft:purple_terracotta",
  "minecraft:blue_terracotta",
  "minecraft:brown_terracotta",
  "minecraft:green_terracotta",
  "minecraft:red_terracotta",
  "minecraft:black_terracotta",
  "minecraft:white_stained_glass",
  "minecraft:orange_stained_glass",
  "minecraft:magenta_stained_glass",
  "minecraft:light_blue_stained_glass",
  "minecraft:yellow_stained_glass",
  "minecraft:lime_stained_glass",
  "minecraft:pink_stained_glass",
  "minecraft:gray_stained_glass",
  "minecraft:light_gray_stained_glass",
  "minecraft:cyan_stained_glass",
  "minecraft:purple_stained_glass",
  "minecraft:blue_stained_glass",
  "minecraft:brown_stained_glass",
  "minecraft:green_stained_glass",
  "minecraft:red_stained_glass",
  "minecraft:black_stained_glass",
  "minecraft:bread",
  "minecraft:apple",
  "minecraft:cooked_beef",
  "minecraft:cooked_porkchop",
  "minecraft:cooked_chicken",
  "minecraft:cooked_mutton",
  "minecraft:cooked_rabbit",
  "minecraft:baked_potato",
  "minecraft:carrot",
  "minecraft:potato",
  "minecraft:cookie",
  "minecraft:cake",
  "minecraft:melon",
  "minecraft:pumpkin_pie",
  "minecraft:golden_carrot",
  "minecraft:wooden_pickaxe",
  "minecraft:wooden_axe",
  "minecraft:wooden_shovel",
  "minecraft:wooden_hoe",
  "minecraft:stone_pickaxe",
  "minecraft:stone_axe",
  "minecraft:stone_shovel",
  "minecraft:stone_hoe",
  "minecraft:iron_pickaxe",
  "minecraft:iron_axe",
  "minecraft:iron_shovel",
  "minecraft:iron_hoe",
  "minecraft:iron_sword",
  "minecraft:bow",
  "minecraft:arrow",
  "minecraft:shield",
  "minecraft:fishing_rod",
  "minecraft:shulker_box",
  "minecraft:white_shulker_box",
  "minecraft:orange_shulker_box",
  "minecraft:magenta_shulker_box",
  "minecraft:light_blue_shulker_box",
  "minecraft:yellow_shulker_box",
  "minecraft:lime_shulker_box",
  "minecraft:pink_shulker_box",
  "minecraft:gray_shulker_box",
  "minecraft:light_gray_shulker_box",
  "minecraft:cyan_shulker_box",
  "minecraft:purple_shulker_box",
  "minecraft:blue_shulker_box",
  "minecraft:brown_shulker_box",
  "minecraft:green_shulker_box",
  "minecraft:red_shulker_box",
  "minecraft:black_shulker_box",
  "minecraft:torch",
  "minecraft:ladder",
  "minecraft:bucket",
  "minecraft:water_bucket",
  "minecraft:lava_bucket",
  "minecraft:oak_boat",
  "minecraft:minecart",
  "minecraft:rail",
  "minecraft:white_bed",
  "minecraft:saddle",
  "minecraft:lead",
  "minecraft:name_tag",
  "minecraft:bone_meal",
  "minecraft:string",
  "minecraft:coal",
  "minecraft:charcoal",
  "minecraft:flint",
  "minecraft:gunpowder",
  "minecraft:redstone",
  "minecraft:redstone_torch",
  "minecraft:stone_button",
  "minecraft:stone_pressure_plate",
  "minecraft:hopper",
  "minecraft:dropper",
  "minecraft:dispenser",
  "minecraft:chest",
  "minecraft:ender_chest",
  "minecraft:repeater",
  "minecraft:comparator",
  "minecraft:piston",
  "minecraft:sticky_piston",
  "minecraft:observer",
  "minecraft:tripwire_hook",
  "minecraft:iron_ingot",
  "minecraft:gold_ingot",
  "minecraft:copper_ingot",
  "minecraft:lapis_lazuli",
  "minecraft:diamond",
  "minecraft:emerald",
  "minecraft:netherite_scrap",
  "minecraft:netherite_ingot",
  "minecraft:ancient_debris",
  "minecraft:raw_iron",
  "minecraft:raw_gold",
  "minecraft:raw_copper",
  "minecraft:rotten_flesh",
  "minecraft:bone",
  "minecraft:spider_eye",
  "minecraft:ender_pearl",
  "minecraft:blaze_rod",
  "minecraft:blaze_powder",
  "minecraft:ghast_tear",
  "minecraft:slime_ball",
  "minecraft:magma_cream",
  "minecraft:phantom_membrane",
  "minecraft:rabbit_hide",
  "minecraft:rabbit_foot",
  "minecraft:feather",
  "minecraft:leather",
  "minecraft:ink_sac",
  "minecraft:glow_ink_sac",
  "minecraft:wheat",
  "minecraft:wheat_seeds",
  "minecraft:sugar_cane",
  "minecraft:cactus",
  "minecraft:bamboo",
  "minecraft:kelp",
  "minecraft:dried_kelp",
  "minecraft:nether_wart",
  "minecraft:cocoa_beans",
  "minecraft:brown_mushroom",
  "minecraft:red_mushroom",
  "minecraft:mushroom_stew",
  "minecraft:sweet_berries",
  "minecraft:glow_berries",
  "minecraft:chorus_fruit",
  "minecraft:pumpkin_seeds",
  "minecraft:melon_seeds",
  "minecraft:cod",
  "minecraft:salmon",
  "minecraft:tropical_fish",
  "minecraft:pufferfish",
  "minecraft:prismarine_shard",
  "minecraft:prismarine_crystals",
  "minecraft:sponge",
  "minecraft:wet_sponge",
  "minecraft:nether_star",
  "minecraft:elytra",
  "minecraft:totem_of_undying",
  "minecraft:trident",
  "minecraft:heart_of_the_sea",
  "minecraft:nautilus_shell",
  "minecraft:dragon_breath",
  "minecraft:shulker_shell",
  "minecraft:wither_skeleton_skull",
  "minecraft:potion",
  "minecraft:splash_potion",
  "minecraft:lingering_potion",
  "minecraft:enchanted_book",
  "minecraft:diamond_sword",
  "minecraft:diamond_pickaxe",
  "minecraft:diamond_axe",
  "minecraft:diamond_shovel",
  "minecraft:diamond_hoe",
  "minecraft:diamond_helmet",
  "minecraft:diamond_chestplate",
  "minecraft:diamond_leggings",
  "minecraft:diamond_boots",
  "minecraft:netherite_sword",
  "minecraft:netherite_pickaxe",
  "minecraft:netherite_axe",
  "minecraft:netherite_shovel",
  "minecraft:netherite_hoe",
  "minecraft:netherite_helmet",
  "minecraft:netherite_chestplate",
  "minecraft:netherite_leggings",
  "minecraft:netherite_boots",
  "minecraft:white_dye",
  "minecraft:orange_dye",
  "minecraft:magenta_dye",
  "minecraft:light_blue_dye",
  "minecraft:yellow_dye",
  "minecraft:lime_dye",
  "minecraft:pink_dye",
  "minecraft:gray_dye",
  "minecraft:light_gray_dye",
  "minecraft:cyan_dye",
  "minecraft:purple_dye",
  "minecraft:blue_dye",
  "minecraft:brown_dye",
  "minecraft:green_dye",
  "minecraft:red_dye",
  "minecraft:black_dye",
  "minecraft:dandelion",
  "minecraft:poppy",
  "minecraft:blue_orchid",
  "minecraft:allium",
  "minecraft:azure_bluet",
  "minecraft:red_tulip",
  "minecraft:orange_tulip",
  "minecraft:white_tulip",
  "minecraft:pink_tulip",
  "minecraft:oxeye_daisy",
  "minecraft:cornflower",
  "minecraft:lily_of_the_valley",
  "minecraft:wither_rose",
  "minecraft:sunflower",
  "minecraft:lilac",
  "minecraft:peony",
  "minecraft:pink_petals",
  "minecraft:white_banner",
  "minecraft:orange_banner",
  "minecraft:magenta_banner",
  "minecraft:light_blue_banner",
  "minecraft:yellow_banner",
  "minecraft:lime_banner",
  "minecraft:pink_banner",
  "minecraft:gray_banner",
  "minecraft:light_gray_banner",
  "minecraft:cyan_banner",
  "minecraft:purple_banner",
  "minecraft:blue_banner",
  "minecraft:brown_banner",
  "minecraft:green_banner",
  "minecraft:red_banner",
  "minecraft:black_banner",
  "minecraft:angler_pottery_sherd",
  "minecraft:archer_pottery_sherd",
  "minecraft:arms_up_pottery_sherd",
  "minecraft:blade_pottery_sherd",
  "minecraft:brewer_pottery_sherd",
  "minecraft:burn_pottery_sherd",
  "minecraft:danger_pottery_sherd",
  "minecraft:explorer_pottery_sherd",
  "minecraft:friend_pottery_sherd",
  "minecraft:heart_pottery_sherd",
  "minecraft:heartbreak_pottery_sherd",
  "minecraft:howl_pottery_sherd",
  "minecraft:miner_pottery_sherd",
  "minecraft:mourner_pottery_sherd",
  "minecraft:plenty_pottery_sherd",
  "minecraft:prize_pottery_sherd",
  "minecraft:sheaf_pottery_sherd",
  "minecraft:skull_pottery_sherd",
  "minecraft:snort_pottery_sherd",
  "minecraft:flow_pottery_sherd",
  "minecraft:music_disc_13",
  "minecraft:music_disc_cat",
  "minecraft:music_disc_blocks",
  "minecraft:music_disc_chirp",
  "minecraft:music_disc_far",
  "minecraft:music_disc_mall",
  "minecraft:music_disc_mellohi",
  "minecraft:music_disc_stal",
  "minecraft:music_disc_strad",
  "minecraft:music_disc_ward",
  "minecraft:music_disc_11",
  "minecraft:music_disc_wait",
  "minecraft:music_disc_otherside",
  "minecraft:music_disc_5",
  "minecraft:music_disc_pigstep",
  "minecraft:music_disc_relic",
  "minecraft:music_disc_creator",
  "minecraft:music_disc_creator_music_box",
  "minecraft:music_disc_precipice",
  "minecraft:coast_armor_trim_smithing_template",
  "minecraft:dune_armor_trim_smithing_template",
  "minecraft:eye_armor_trim_smithing_template",
  "minecraft:rib_armor_trim_smithing_template",
  "minecraft:snout_armor_trim_smithing_template",
  "minecraft:spire_armor_trim_smithing_template",
  "minecraft:tide_armor_trim_smithing_template",
  "minecraft:vex_armor_trim_smithing_template",
  "minecraft:ward_armor_trim_smithing_template",
  "minecraft:wild_armor_trim_smithing_template",
  "minecraft:silence_armor_trim_smithing_template",
  "minecraft:wayfinder_armor_trim_smithing_template",
  "minecraft:raiser_armor_trim_smithing_template",
  "minecraft:shaper_armor_trim_smithing_template",
  "minecraft:host_armor_trim_smithing_template",
  "minecraft:flow_armor_trim_smithing_template",
  "minecraft:bolt_armor_trim_smithing_template",
];
const MARKET_PRICE_OVERRIDES = Object.freeze({
  "minecraft:stone": 8,
  "minecraft:cobblestone": 6,
  "minecraft:dirt": 5,
  "minecraft:sand": 7,
  "minecraft:gravel": 7,
  "minecraft:coal": 18,
  "minecraft:iron_ingot": 55,
  "minecraft:gold_ingot": 85,
  "minecraft:diamond": 320,
  "minecraft:emerald": 260,
  "minecraft:netherite_ingot": 1800,
  "minecraft:ancient_debris": 900,
  "minecraft:nether_star": 5000,
  "minecraft:elytra": 8500,
  "minecraft:totem_of_undying": 3000,
  "minecraft:trident": 2600,
  "minecraft:enchanted_book": 450,
});
const MARKET_LABEL_OVERRIDES = Object.freeze({
  "minecraft:golden_carrot": "Golden Carrot",
  "minecraft:netherite_scrap": "Netherite Scrap",
  "minecraft:raw_iron": "Raw Iron",
  "minecraft:raw_gold": "Raw Gold",
  "minecraft:raw_copper": "Raw Copper",
  "minecraft:lapis_lazuli": "Lapis Lazuli",
  "minecraft:prismarine_shard": "Prismarine Shard",
  "minecraft:prismarine_crystals": "Prismarine Crystals",
  "minecraft:heart_of_the_sea": "Heart of the Sea",
  "minecraft:dragon_breath": "Dragon Breath",
});
function prettyMarketLabel(itemId) {
  const raw = String(itemId).split(":")[1] || String(itemId);
  return raw.split("_").map(part => part ? part[0].toUpperCase() + part.slice(1) : part).join(" ");
}

function marketBasePrice(itemId) {
  if (MARKET_PRICE_OVERRIDES[itemId] !== undefined) return MARKET_PRICE_OVERRIDES[itemId];
  const id = String(itemId).split(":")[1] || String(itemId);
  if (/(?:stone|cobblestone|dirt|sand|gravel|netherrack|end_stone|wool|concrete|terracotta|glass|planks|log|wood)$/.test(id)) return 12;
  if (/(?:bread|apple|potato|carrot|melon|cookie|beef|porkchop|chicken|mutton|rabbit|cake|pie|berries)$/.test(id)) return 28;
  if (/(?:wooden|stone|iron)_(?:pickaxe|axe|shovel|hoe|sword)$/.test(id)) return 95;
  if (/(?:diamond|netherite)_(?:pickaxe|axe|shovel|hoe|sword|helmet|chestplate|leggings|boots)$/.test(id)) return id.startsWith("netherite_") ? 1500 : 750;
  if (/(?:helmet|chestplate|leggings|boots)$/.test(id)) return 280;
  if (/(?:music_disc|pottery_sherd|armor_trim_smithing_template|banner)$/.test(id)) return 380;
  if (/(?:dye|flower|tulip|orchid|allium|daisy|cornflower|sunflower|lilac|peony|petals)$/.test(id)) return 24;
  if (/(?:potion|enchanted_book)$/.test(id)) return 450;
  if (/(?:elytra|totem|trident|nether_star|dragon_breath|heart_of_the_sea|wither_skeleton_skull)$/.test(id)) return 1800;
  if (/(?:diamond|emerald|netherite|ancient_debris|gold|iron|copper|lapis|coal|redstone)/.test(id)) return 120;
  return 45;
}

function buildMarketCatalog(ids) {
  return [...new Set(ids)].map(id => {
    const base = Math.max(1, Math.floor(marketBasePrice(id)));
    return { id, label: MARKET_LABEL_OVERRIDES[id] || prettyMarketLabel(id), base, sell: Math.max(1, Math.floor(base * (1 - MARKET_FEE))), icon: "textures/ui/market_items/emerald" };
  });
}

const SERVER_SELL_CATALOG = buildMarketCatalog(SERVER_SELL_IDS);
const SERVER_BUY_CATALOG = buildMarketCatalog(SERVER_BUY_IDS);

// Player Market accepts all server-buy catalog items; each entry remains one Bedrock item type.
const MARKET = SERVER_BUY_CATALOG;

const PREFIX = "extremesmp:";

function isUsablePlayer(player) {
  try {
    const id = player?.id;
    return Boolean(player && id !== undefined && id !== null && String(id).trim() && typeof player.name === "string" && player.name.trim());
  } catch {
    return false;
  }
}

function objective(id, displayName) {
  try {
    return world.scoreboard.getObjective(id) ?? world.scoreboard.addObjective(id, displayName);
  } catch (error) {
    try { console.warn(`[EXTREMESMP] scoreboard objective unavailable (${id}): ${String(error?.stack ?? error)}`); } catch {}
    return undefined;
  }
}

function getScore(player, id, fallback = 0) {
  if (!isUsablePlayer(player)) return fallback;
  try {
    const o = world.scoreboard.getObjective(id);
    if (!o || !o.hasParticipant(player)) return fallback;
    return o.getScore(player) ?? fallback;
  } catch { return fallback; }
}

function setScore(player, id, value) {
  const n = Math.max(0, Math.min(MAX_SCOREBOARD_VALUE, Math.floor(Number(value) || 0)));
  if (!isUsablePlayer(player)) return n;
  try {
    const o = objective(id, id);
    if (o) o.setScore(player, n);
  } catch { /* scoreboard or player may be unavailable */ }
  return n;
}

function addScore(player, id, amount) {
  return setScore(player, id, getScore(player, id, 0) + Math.floor(Number(amount) || 0));
}

function propKey(kind, player) {
  // Player dynamic properties belong to the player entity; do not include the
  // runtime entity id because it can change after reconnecting.
  return `${PREFIX}${kind}`;
}

function getProp(target, key, fallback = undefined) {
  const value = target.getDynamicProperty(key);
  return value === undefined ? fallback : value;
}

function setJson(target, key, value) {
  target.setDynamicProperty(key, JSON.stringify(value));
}

function getJson(target, key, fallback) {
  const raw = target.getDynamicProperty(key);
  if (typeof raw !== "string") return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off", ""].includes(normalized)) return false;
  }
  return fallback;
}

function onlinePlayersSnapshot() {
  const tick = system.currentTick;
  if (ONLINE_PLAYERS_TICK === tick) return ONLINE_PLAYERS_SNAPSHOT;
  try {
    ONLINE_PLAYERS_SNAPSHOT = world.getPlayers();
  } catch {
    ONLINE_PLAYERS_SNAPSHOT = [];
  }
  ONLINE_PLAYERS_TICK = tick;
  const seen = new Set();
  for (const player of ONLINE_PLAYERS_SNAPSHOT) {
    if (!player?.id) continue;
    const id = String(player.id);
    seen.add(id);
    ONLINE_PLAYERS_BY_ID.set(id, player);
  }
  for (const id of ONLINE_PLAYERS_BY_ID.keys()) if (!seen.has(id)) ONLINE_PLAYERS_BY_ID.delete(id);
  return ONLINE_PLAYERS_SNAPSHOT;
}

function currentOnlinePlayer(id) {
  const key = String(id || "");
  if (!key) return undefined;
  onlinePlayersSnapshot();
  return ONLINE_PLAYERS_BY_ID.get(key);
}

// Preserve the supplied PTP pack's persistent property names and defaults.
const PTP_BLOCKLIST_PROPERTY = "ptp:blocklist";
const PTP_SETTINGS_PROPERTY = "ptp:settings";
const PTP_DEFAULT_SETTINGS = Object.freeze({
  autoAccept: false,
  autoDecline: false,
  sound: true,
  actionbar: true,
  chat: true,
});

function teleportSettings(player) {
  const saved = safeObject(getJson(player, PTP_SETTINGS_PROPERTY, {}));
  return {
    autoAccept: safeBoolean(saved.autoAccept, PTP_DEFAULT_SETTINGS.autoAccept),
    autoDecline: safeBoolean(saved.autoDecline, PTP_DEFAULT_SETTINGS.autoDecline),
    sound: safeBoolean(saved.sound, PTP_DEFAULT_SETTINGS.sound),
    actionbar: safeBoolean(saved.actionbar, PTP_DEFAULT_SETTINGS.actionbar),
    chat: safeBoolean(saved.chat, PTP_DEFAULT_SETTINGS.chat),
  };
}

function saveTeleportSettings(player, next) {
  const raw = safeObject(next);
  const safe = {
    autoAccept: safeBoolean(raw.autoAccept, PTP_DEFAULT_SETTINGS.autoAccept),
    autoDecline: safeBoolean(raw.autoDecline, PTP_DEFAULT_SETTINGS.autoDecline),
    sound: safeBoolean(raw.sound, PTP_DEFAULT_SETTINGS.sound),
    actionbar: safeBoolean(raw.actionbar, PTP_DEFAULT_SETTINGS.actionbar),
    chat: safeBoolean(raw.chat, PTP_DEFAULT_SETTINGS.chat),
  };
  try { setJson(player, PTP_SETTINGS_PROPERTY, safe); } catch { /* player may be leaving */ }
  return safe;
}

function teleportBlocklist(player) {
  const list = getJson(player, PTP_BLOCKLIST_PROPERTY, []);
  return Array.isArray(list) ? list.map(String).filter(Boolean).slice(0, TELEPORT_MAX_BLOCKED_PLAYERS) : [];
}

function saveTeleportBlocklist(player, list) {
  const safe = [...new Set((Array.isArray(list) ? list : []).map(String).filter(Boolean))].slice(0, TELEPORT_MAX_BLOCKED_PLAYERS);
  try { setJson(player, PTP_BLOCKLIST_PROPERTY, safe); } catch { /* player may be leaving */ }
  return safe;
}

function teleportBlocked(target, requester) {
  if (!target || !requester) return false;
  return teleportBlocklist(target).includes(String(requester.id));
}

function teleportNotify(player, text, sound = "random.orb") {
  if (!player) return;
  const settings = teleportSettings(player);
  try {
    if (settings.chat) player.sendMessage(`§8[§6EXTREMESMP§8] §r${text}`);
    if (settings.sound) player.playSound(sound);
  } catch { /* player may have left */ }
}

function findOutgoingTeleportRequest(playerId) {
  return [...TELEPORT_REQUESTS.values()].find(request => request.requesterId === playerId && request.expiresAt > now());
}

function findIncomingTeleportRequest(playerId) {
  return [...TELEPORT_REQUESTS.values()].find(request => request.targetId === playerId && request.expiresAt > now());
}

function normalizeCommandTarget(target) {
  return Array.isArray(target) ? target[0] : target;
}

function sameLocation(a, b, tolerance = TELEPORT_MOVE_TOLERANCE) {
  if (!a || !b) return false;
  const dx = Number(a.x) - Number(b.x);
  const dy = Number(a.y) - Number(b.y);
  const dz = Number(a.z) - Number(b.z);
  if (![dx, dy, dz].every(Number.isFinite)) return false;
  return (dx * dx) + (dy * dy) + (dz * dz) <= tolerance * tolerance;
}

function cancelTeleportCountdown(requestId, message = "คำขอเทเลพอร์ตถูกยกเลิก") {
  const countdown = TELEPORT_COUNTDOWNS.get(requestId);
  if (!countdown) return;
  TELEPORT_COUNTDOWNS.delete(requestId);
  const requester = findOnlinePlayerById(countdown.requesterId);
  const target = findOnlinePlayerById(countdown.targetId);
  if (requester) teleportNotify(requester, message, "note.bass");
  if (target) teleportNotify(target, message, "note.bass");
}

function now() { return Date.now(); }

const RANK_ALIASES = Object.freeze({
  PLAYER: "PLAYER",
  MEMBER: "MEMBER",
  VIP999: "VIP_999",
  VIP_999: "VIP_999",
  "VIP 999": "VIP_999",
  PRO: "PRO",
  PLATINUM: "PLATINUM",
  RUBY: "RUBY",
  ELITE: "ELITE",
  ULTIMATE: "ULTIMATE",
  SSSMEMBER: "SSS_MEMBER",
  SSS_MEMBER: "SSS_MEMBER",
  "SSS MEMBER": "SSS_MEMBER",
  BETATESTER: "BETATESTER",
  "BETA TESTER": "BETATESTER",
  HELPER: "HELPER",
  TRIAL: "TRIAL",
  MOD: "MOD",
  ADMIN: "ADMIN",
  OWNER: "OWNER",
});

function normalizeRankKey(value) {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/[§\uE800-\uE8FF\uEB00-\uEBFF]/g, "").replace(/[<>]/g, "").trim().toUpperCase();
  const canonical = RANK_ALIASES[cleaned] ?? (RANKS[cleaned] ? cleaned : undefined);
  return canonical && RANKS[canonical] ? canonical : undefined;
}

function rankKeyFromScore(score) {
  const numeric = Number(score);
  const eligible = Object.entries(RANKS)
    .filter(([, data]) => data.score <= numeric)
    .sort((a, b) => b[1].score - a[1].score);
  return eligible[0]?.[0] ?? "MEMBER";
}

const LEGACY_RANK_TAG_ALIASES = Object.freeze({
  EXTREMESMP_OWNER: "OWNER",
  EXTREMESMP_ADMIN: "ADMIN",
  EXTREMESMP_MOD: "MOD",
  EXTREMESMP_HELPER: "HELPER",
  EXTREMESMP_TRIAL: "TRIAL",
  EXTREMESMP_BETATESTER: "BETATESTER",
  EXTREMESMP_BETA: "BETATESTER",
});

function rankKeysFromLegacyTags(player) {
  const found = [];
  let tags = [];
  try { tags = typeof player?.getTags === "function" ? player.getTags() : []; } catch { tags = []; }
  for (const tag of tags) {
    const raw = String(tag ?? "").trim().toUpperCase();
    const candidates = [
      LEGACY_RANK_TAG_ALIASES[raw],
      raw,
      raw.replace(/^EXTREMESMP[:_]?RANK[:_]?/, ""),
      raw.replace(/^EXTREMESMP[:_]?/, ""),
      raw.replace(/^RANK[:_]?/, ""),
    ];
    for (const candidate of candidates) {
      const canonical = normalizeRankKey(candidate);
      if (canonical && canonical !== "PLAYER") found.push(canonical);
    }
  }
  return [...new Set(found)];
}

function rankKey(player) {
  // Read-only display path. A selected rank is authoritative once it has
  // been explicitly chosen; old worlds may have selectedRank=MEMBER from the
  // broken migration, so recover a higher owned/legacy rank without writing.
  const selected = normalizeRankKey(getProp(player, propKey("selectedRank", player)));
  const explicit = Number(getProp(player, propKey("rankCompatVersion", player), 0)) >= 2;
  if (selected && (explicit || (selected !== "MEMBER" && selected !== "PLAYER"))) return selected;

  const legacy = normalizeRankKey(getProp(player, propKey("rank", player)));
  const scored = rankKeyFromScore(getScore(player, OBJ_RANK, RANKS.MEMBER.score));
  const candidates = [selected, legacy, scored, ...rankKeysFromLegacyTags(player), ...ownedRankKeys(player)].filter(key => key && RANKS[key]);
  const recovered = candidates.slice().sort((a, b) => RANKS[b].score - RANKS[a].score)[0];
  return recovered && RANKS[recovered].score > RANKS.MEMBER.score ? recovered : (selected ?? legacy ?? scored ?? "MEMBER");
}

function ownedRankKeys(player) {
  const raw = getJson(player, propKey("ownedRanks", player), []);
  const values = Array.isArray(raw) ? raw : [];
  const valid = values.map(normalizeRankKey).filter(Boolean);
  if (!valid.includes("PLAYER")) valid.unshift("PLAYER");
  return [...new Set(valid)];
}

function ensureRankState(player) {
  const existing = ownedRankKeys(player);
  const tagRanks = rankKeysFromLegacyTags(player);
  const legacy = normalizeRankKey(getProp(player, propKey("rank", player)));
  const scored = rankKeyFromScore(getScore(player, OBJ_RANK, RANKS.MEMBER.score));
  const storedSelected = normalizeRankKey(getProp(player, propKey("selectedRank", player)));
  const owned = [...existing];
  for (const tagRank of tagRanks) if (!owned.includes(tagRank)) owned.push(tagRank);
  // Every player starts with PLAYER and MEMBER; preserve legacy rank and scoreboard rank.
  if (!owned.includes("PLAYER")) owned.unshift("PLAYER");
  if (!owned.includes("MEMBER")) owned.push("MEMBER");
  if (legacy && RANKS[legacy] && !owned.includes(legacy)) owned.push(legacy);
  if (scored && RANKS[scored] && RANKS[scored].score > RANKS.MEMBER.score && !owned.includes(scored)) owned.push(scored);
  // Preserve a valid selected rank even when owned-rank migration has not
  // completed yet. This prevents the first display refresh from downgrading it.
  if (storedSelected && !owned.includes(storedSelected)) owned.push(storedSelected);
  const compatibilityVersion = Number(getProp(player, propKey("rankCompatVersion", player), 0));
  const selectedExplicit = compatibilityVersion >= 2;
  const legacyCandidates = [legacy, scored, ...tagRanks, ...existing].filter(key => key && RANKS[key]);
  const bestLegacy = legacyCandidates.slice().sort((a, b) => RANKS[b].score - RANKS[a].score)[0];
  // Recovery for worlds affected by the old MEMBER overwrite. Once a player
  // chooses a rank in the collection, rankCompatVersion=2 protects that
  // deliberate choice, including an intentional choice of MEMBER.
  let current = storedSelected ?? legacy ?? scored;
  if (!selectedExplicit && bestLegacy && RANKS[bestLegacy].score > RANKS.MEMBER.score && (!storedSelected || storedSelected === "MEMBER" || storedSelected === "PLAYER")) current = bestLegacy;
  const selected = current && owned.includes(current) ? current : (owned.includes("MEMBER") ? "MEMBER" : "PLAYER");
  setJson(player, propKey("ownedRanks", player), [...new Set(owned)]);
  player.setDynamicProperty(propKey("selectedRank", player), selected);
  player.setDynamicProperty(propKey("rank", player), selected); // legacy compatibility
  player.setDynamicProperty(propKey("rankCompatVersion", player), Math.max(1, compatibilityVersion));
  if (getScore(player, OBJ_RANK, -1) !== RANKS[selected].score) setScore(player, OBJ_RANK, RANKS[selected].score);
  return [...new Set(owned)];
}

function rankData(player) {
  const key = rankKey(player);
  return { key, ...(RANKS[key] ?? RANKS.MEMBER) };
}

function highestOwnedRankKey(player) {
  const owned = ensureRankState(player);
  return owned.slice().sort((a, b) => (RANKS[b]?.score ?? 0) - (RANKS[a]?.score ?? 0))[0] ?? "PLAYER";
}

function highestOwnedRankData(player) { return RANKS[highestOwnedRankKey(player)] ?? RANKS.PLAYER; }

function hasOwnedRank(player, key) {
  const canonical = normalizeRankKey(key);
  return Boolean(canonical && ensureRankState(player).includes(canonical));
}

function setSelectedRank(player, key) {
  const canonical = normalizeRankKey(key);
  if (!canonical || !RANKS[canonical]) return false;

  // Write path: normalize once, preserve ownership, then persist the selected
  // display rank across current, legacy, and scoreboard storage.
  const owned = ensureRankState(player);
  if (!owned.includes(canonical)) {
    owned.push(canonical);
    setJson(player, propKey("ownedRanks", player), [...new Set(owned)]);
  }
  player.setDynamicProperty(propKey("selectedRank", player), canonical);
  player.setDynamicProperty(propKey("rank", player), canonical);
  player.setDynamicProperty(propKey("rankCompatVersion", player), 2);
  setScore(player, OBJ_RANK, RANKS[canonical].score);
  applyRankNameTag(player);
  return true;
}

function formatRankBadge(rank, glyph) {
  const icon = glyph || rank.glyph;
  // Kiw's useful pattern is a stable bracketed badge with a readable rank
  // name. EXTREMESMP keeps that UX pattern but uses its own EB/EA glyph atlas,
  // colors, labels, and dynamic-property backend.
  return `§8[§r${icon} ${rank.color}${rank.label}§8]`;
}

function rankBar(rank) {
  return formatRankBadge(rank, rank.glyph);
}

function rankBadge(player) {
  return rankBar(rankData(player));
}
function chatRankBadge(player) {
  const rank = rankData(player);
  const glyph = CHAT_RANK_GLYPHS[rank.key] ?? CHAT_RANK_GLYPHS.PLAYER;
  return formatRankBadge(rank, glyph);
}
function applyRankNameTag(player) {
  try {
    const r = rankData(player);
    const signature = `${r.key}|${r.glyph}|${r.color}|${r.label}|${player.name}`;
    if (RANK_TAG_SIGNATURES.get(String(player.id)) === signature) return;
    player.nameTag = `${rankBar(r)} §7| §f${player.name}`;
    RANK_TAG_SIGNATURES.set(String(player.id), signature);
  } catch { /* player may be leaving */ }
}

function isOperator(player) {
  try {
    const permission = player?.playerPermissionLevel;
    const permissionText = String(permission ?? "").trim().toLowerCase();
    if (/operator|admin|host/.test(permissionText)) return true;
    const playerLevel = Number(permission);
    if (Number.isFinite(playerLevel)) {
      return playerLevel >= Number(PlayerPermissionLevel.Operator);
    }

    // Compatibility fallback for server builds exposing only command permission.
    const commandPermission = player?.commandPermissionLevel;
    const commandText = String(commandPermission ?? "").trim().toLowerCase();
    if (/game_director|director|operator|admin/.test(commandText)) return true;
    const commandLevel = Number(commandPermission);
    return Number.isFinite(commandLevel) && commandLevel >= Number(CommandPermissionLevel.GameDirectors);
  } catch {
    return false;
  }
}

// OP is a server permission, not a rank tag. Synchronize it into the active
// EXTREMESMP rank store so the HUD, chat badge, admin checks, and rank menus all
// see OWNER immediately after /op or a permission change.
function syncOperatorOwnerRank(player) {
  if (!player?.id || !isOperator(player)) return false;
  try {
    const owned = ensureRankState(player);
    if (!owned.includes("OWNER")) {
      owned.push("OWNER");
      setJson(player, propKey("ownedRanks", player), [...new Set(owned)]);
    }
    const alreadyOwner = normalizeRankKey(getProp(player, propKey("selectedRank", player))) === "OWNER"
      && normalizeRankKey(getProp(player, propKey("rank", player))) === "OWNER"
      && getScore(player, OBJ_RANK, -1) === RANKS.OWNER.score;
    if (!alreadyOwner) setSelectedRank(player, "OWNER");
    if (!player.hasTag("extremesmp_owner")) player.addTag("extremesmp_owner");
    if (!safeBoolean(getProp(player, propKey("opOwnerGranted", player), false))) {
      player.setDynamicProperty(propKey("opOwnerGranted", player), true);
    }
    return true;
  } catch (error) {
    try { console.warn(`[EXTREMESMP] OP-owner sync failed for ${player.name}: ${String(error?.stack ?? error)}`); } catch {}
    return false;
  }
}

function requireAdminPanelOperator(player, fallback = openMenu) {
  if (isOperator(player)) return true;
  notify(player, "Admin Panel เปิดได้เฉพาะผู้เล่นที่มี OP เท่านั้น", "note.bass");
  if (player?.id && typeof fallback === "function") runForOnlinePlayer(player.id, fallback, 1);
  return false;
}

function isStaff(player, minimum = "HELPER") {
  // OP is the authoritative server-side admin permission. Rank/tag staff
  // access remains available for non-panel staff workflows where applicable.
  if (isOperator(player)) return true;
  const current = highestOwnedRankData(player).score;
  return current >= (RANKS[minimum]?.score ?? 60) || player.hasTag("extremesmp_owner") || player.hasTag("extremesmp_admin");
}

const AUDIT_MAX_ENTRIES = 300;
const AUDIT_MAX_BYTES = 24000;

function auditPayload(payload) {
  try {
    const serialized = JSON.stringify(payload ?? {});
    if (serialized.length <= 700) return payload ?? {};
    return { summary: serialized.slice(0, 680) };
  } catch {
    return { summary: String(payload ?? "").slice(0, 680) };
  }
}

function logAudit(type, actor, payload = {}) {
  const entry = { id: `${now()}-${Math.random().toString(36).slice(2, 8)}`, t: new Date().toISOString(), type, actor: actor?.name ?? "SYSTEM", payload: auditPayload(payload) };
  const stored = getJson(world, "extremesmp:audit", []);
  const list = Array.isArray(stored) ? stored : [];
  list.unshift(entry);
  while (list.length > AUDIT_MAX_ENTRIES || JSON.stringify(list).length > AUDIT_MAX_BYTES) list.pop();
  try { setJson(world, "extremesmp:audit", list); } catch { /* audit failure must not break gameplay transactions */ }
  return entry.id;
}

function notify(player, text, sound = "random.orb") {
  try { player.sendMessage(`§8[§6EXTREMESMP§8] §r${text}`); player.playSound(sound); } catch { /* player left */ }
}

function noRespawnPointEnabled(player) {
  // Honor both EXTREMESMP storage and the original RRespawn `reconfig` tag.
  const enabled = Boolean(getProp(player, propKey("noRespawnPoint", player), false)) || Boolean(player?.hasTag?.("reconfig"));
  if (player?.id) {
    if (enabled) NO_RESPAWN_PLAYERS.add(String(player.id));
    else NO_RESPAWN_PLAYERS.delete(String(player.id));
  }
  return enabled;
}

function setNoRespawnPoint(player, enabled) {
  const next = Boolean(enabled);
  if (player?.id) {
    if (next) NO_RESPAWN_PLAYERS.add(String(player.id));
    else NO_RESPAWN_PLAYERS.delete(String(player.id));
  }
  try { player.setDynamicProperty(propKey("noRespawnPoint", player), next); } catch { /* player may be leaving */ }
  try {
    if (next && !player.hasTag("reconfig")) player.addTag("reconfig");
    if (!next && player.hasTag("reconfig")) player.removeTag("reconfig");
  } catch { /* player may be leaving */ }
}

function openRespawnConfig(player) {
  const enabled = noRespawnPointEnabled(player);
  const form = new ModalFormData()
    .title("§1EXTREMESMP §8| §bEXTREMESMP Respawn")
    .body("§7ระบบสุ่มเกิดของ EXTREMESMP จะค้นหาพื้นที่แห้งและปลอดภัยให้โดยอัตโนมัติ\n\n§eเปิดตัวเลือกนี้เพื่อไม่ใช้จุดเกิดจากเตียงหรือจุดเกิดส่วนตัว และให้ระบบล้างจุดเกิดเป็นระยะ\n§8การตั้งค่านี้เป็นรายผู้เล่นและเปลี่ยนได้ทุกเมื่อ")
    .toggle("ล้างจุดเกิดส่วนตัว", enabled);
  showUiForPlayer(player.id, form, (response, current) => {
    if (response.canceled) return;
    const next = Boolean(response.formValues?.[0]);
    setNoRespawnPoint(current, next);
    notify(current, next ? "เปิดโหมดไม่ใช้จุดเกิดส่วนตัวแล้ว" : "ปิดโหมดใช้จุดเกิดส่วนตัวแล้ว", "random.orb");
    logAudit("RESPAWN_CONFIG_CHANGED", current, { noRespawnPoint: next });
  }, openRespawnConfig);
}

function renderChunkLoadAnimation(player, session) {
  try {
    const elapsed = Math.max(0, system.currentTick - session.startedTick);
    const progress = Math.min(0.92, elapsed / Math.max(1, session.durationTicks));
    const filled = Math.max(0, Math.min(12, Math.floor(progress * 12)));
    const frame = Math.floor(system.currentTick / CHUNK_LOAD_ANIMATION_STEP_TICKS) % 4;
    const dots = [".", "..", "...", ""];
    const bar = "#".repeat(filled) + "-".repeat(12 - filled);
    player.onScreenDisplay?.setActionBar?.(`§bกำลังโหลดพื้นที่${dots[frame]} §7[§b${bar}§7]`);
  } catch { /* player left or HUD unavailable */ }
}

function startChunkLoadAnimation(player, durationTicks = CHUNK_LOAD_ANIMATION_DURATION_TICKS) {
  if (!player?.id) return;
  const session = {
    startedTick: system.currentTick,
    durationTicks: Math.max(20, Number(durationTicks) || CHUNK_LOAD_ANIMATION_DURATION_TICKS),
  };
  CHUNK_LOAD_ANIMATION.set(player.id, session);
  renderChunkLoadAnimation(player, session);
}

function stopChunkLoadAnimation(player) {
  if (!player?.id) return;
  CHUNK_LOAD_ANIMATION.delete(player.id);
  try { player.onScreenDisplay?.setActionBar?.(""); } catch { /* player left or HUD unavailable */ }
}

function inventoryContainer(player) {
  try {
    return player.getComponent("minecraft:inventory")?.container ?? player.getComponent("inventory")?.container;
  } catch { return undefined; }
}

function cooldown(player, name, ticks) {
  const key = propKey(`cooldown:${name}`, player);
  const last = Number(getProp(player, key, 0));
  const tick = system.currentTick;
  if (tick - last < ticks) return false;
  player.setDynamicProperty(key, tick);
  return true;
}

function securityState(player) {
  const key = String(player?.id || player?.name || "");
  const cached = key ? SECURITY_RUNTIME.get(key) : undefined;
  if (cached?.state) return cached.state;
  const fallback = {
    sessionStartedAt: now(),
    chatSeen: false,
    actions: [],
    ores: [],
    lastActionAt: {},
    lastInterval: {},
    stableIntervals: {},
    flags: 0,
    lastFlagAt: 0,
    throttleUntil: 0,
  };
  const stored = getJson(player, propKey("security", player), fallback);
  const state = stored && typeof stored === "object" && !Array.isArray(stored) ? { ...fallback, ...stored } : fallback;
  if (!Array.isArray(state.actions)) state.actions = [];
  if (!Array.isArray(state.ores)) state.ores = [];
  if (!state.lastActionAt || typeof state.lastActionAt !== "object" || Array.isArray(state.lastActionAt)) state.lastActionAt = {};
  if (!state.lastInterval || typeof state.lastInterval !== "object" || Array.isArray(state.lastInterval)) state.lastInterval = {};
  if (!state.stableIntervals || typeof state.stableIntervals !== "object" || Array.isArray(state.stableIntervals)) state.stableIntervals = {};
  if (key) SECURITY_RUNTIME.set(key, { state, lastFlushTick: Number(system.currentTick ?? 0), dirty: false });
  return state;
}

function saveSecurityState(player, state, force = false) {
  state.actions = safeArray(state.actions).slice(-300);
  state.ores = safeArray(state.ores).slice(-80);
  const key = String(player?.id || player?.name || "");
  const tick = Number(system.currentTick ?? 0);
  let runtime = key ? SECURITY_RUNTIME.get(key) : undefined;
  if (!runtime) {
    runtime = { state, lastFlushTick: tick - SECURITY_FLUSH_TICKS, dirty: false };
    if (key) SECURITY_RUNTIME.set(key, runtime);
  }
  runtime.state = state;
  runtime.dirty = true;
  if (!force && tick - runtime.lastFlushTick < SECURITY_FLUSH_TICKS) return;
  try {
    setJson(player, propKey("security", player), state);
    runtime.lastFlushTick = tick;
    runtime.dirty = false;
  } catch { /* security telemetry must not break gameplay */ }
}

function flushSecurityState(player) {
  const key = String(player?.id || player?.name || "");
  const runtime = key ? SECURITY_RUNTIME.get(key) : undefined;
  if (runtime?.dirty) saveSecurityState(player, runtime.state, true);
}

function securityWindow(state, timestamp) {
  state.actions = state.actions.filter(t => timestamp - Number(t) <= SECURITY_WINDOW_MS);
  state.ores = state.ores.filter(t => timestamp - Number(t) <= SECURITY_WINDOW_MS);
}

function securityNotifyStaff(text) {
  for (const staff of onlinePlayersSnapshot()) {
    try { if (isStaff(staff, "HELPER")) staff.sendMessage(`§c[SECURITY] §f${text}`); } catch {}
  }
}

function securityFlag(player, type, detail = {}) {
  const state = securityState(player);
  const timestamp = now();
  if (timestamp - Number(state.lastFlagAt || 0) < SECURITY_FLAG_COOLDOWN_MS) return;
  state.lastFlagAt = timestamp;
  state.flags = Math.min(999, Number(state.flags || 0) + 1);
  state.throttleUntil = timestamp + SECURITY_THROTTLE_MS;
  saveSecurityState(player, state, true);
  logAudit(`SECURITY_${type}`, player, { ...detail, flags: state.flags });
  securityNotifyStaff(`${player.name} ถูกตั้งธง ${type} §7(${JSON.stringify(detail).slice(0, 180)})`);
  notify(player, "ระบบความปลอดภัยตรวจพบรูปแบบการเล่นผิดปกติ — ลดความเร็วชั่วคราวและบันทึกให้ทีมงานตรวจสอบ", "note.bass");
}

function securityIsThrottled(player) {
  const state = securityState(player);
  return now() < Number(state.throttleUntil || 0);
}

function markSecuritySession(player) {
  const state = securityState(player);
  const name = String(player.name || "");
  if (/^(bot|npc|proxy|test|afk)[_-]?\d*$/i.test(name)) {
    logAudit("SECURITY_BOT_NAME_HEURISTIC", player, { name: name.slice(0, 32) });
    securityNotifyStaff(`${name} ตรงกับ heuristic ชื่อบอท — ตรวจสอบเพิ่มเติมก่อนลงโทษ`);
  }
  state.sessionStartedAt = now();
  state.chatSeen = false;
  state.actions = [];
  state.ores = [];
  state.lastActionAt = {};
  state.lastInterval = {};
  state.stableIntervals = {};
  saveSecurityState(player, state, true);
}

function markSecurityChat(player) {
  const state = securityState(player);
  state.chatSeen = true;
  saveSecurityState(player, state);
}

function recordSecurityAction(player, kind, detail = {}) {
  try {
    const timestamp = now();
    const state = securityState(player);
    securityWindow(state, timestamp);
    state.actions.push(timestamp);
    const previous = Number(state.lastActionAt[kind] || 0);
    const interval = previous ? timestamp - previous : 0;
    if (interval > 0 && interval <= 2000) {
      const bucket = Math.round(interval / 50);
      if (state.lastInterval[kind] === bucket) state.stableIntervals[kind] = Number(state.stableIntervals[kind] || 0) + 1;
      else state.stableIntervals[kind] = 0;
      state.lastInterval[kind] = bucket;
    } else {
      state.stableIntervals[kind] = 0;
    }
    state.lastActionAt[kind] = timestamp;

    const age = timestamp - Number(state.sessionStartedAt || timestamp);
    if (detail.blockId && SECURITY_ORE_BLOCKS.has(detail.blockId)) state.ores.push(timestamp);
    securityWindow(state, timestamp);
    saveSecurityState(player, state);

    // Anti-bot: a new session that performs a large burst before any chat is
    // suspicious, but is flagged for review rather than kicked immediately.
    if (!state.chatSeen && age < SECURITY_PROBATION_MS && state.actions.length >= 80) {
      securityFlag(player, "BOT_PROBATION", { actions: state.actions.length, ageMs: age });
    }
    // Anti-macro: repeated equal 50ms buckets are a review signal; network lag
    // and ordinary mining are allowed because this does not auto-ban.
    if (Number(state.stableIntervals[kind] || 0) >= 8) {
      securityFlag(player, "MACRO_PATTERN", { kind, intervalMs: interval, repeats: state.stableIntervals[kind] });
    }
    // Anti-xray: ore density is a behavioral signal. It detects abnormal ore
    // bursts without claiming that every lucky mining run is cheating.
    if (detail.blockId && state.ores.length >= SECURITY_ORE_BURST) {
      securityFlag(player, "ORE_PATTERN", { oreBreaks: state.ores.length, lastBlock: detail.blockId });
    }
    if (state.actions.length >= SECURITY_ACTION_BURST) {
      securityFlag(player, "ACTION_BURST", { actions: state.actions.length, kind });
    }
  } catch { /* security telemetry must never break gameplay */ }
}

function ensurePlayer(player) {
  if (!isUsablePlayer(player)) return false;
  try {
    const playerId = String(player.id);
    if (INITIALIZED_PLAYERS.has(playerId)) {
      syncOperatorOwnerRank(player);
      return true;
    }
    objective(OBJ_MONEY, "EXTREMESMP Coins (NRC)");
    objective(OBJ_RANK, "EXTREMESMP Rank");
    objective(OBJ_JOINS, "EXTREMESMP Joins");
    const version = Number(getProp(player, propKey("version", player), 0));
    if (version < DATA_VERSION) {
      player.setDynamicProperty(propKey("version", player), DATA_VERSION);
      if (getProp(player, propKey("rank", player)) === undefined) player.setDynamicProperty(propKey("rank", player), "MEMBER");
      if (getProp(player, propKey("currency", player)) === undefined) player.setDynamicProperty(propKey("currency", player), "NRC");
      if (getProp(player, propKey("joinedAt", player)) === undefined) player.setDynamicProperty(propKey("joinedAt", player), now());
      if (getProp(player, propKey("giftClaimed", player)) === undefined) player.setDynamicProperty(propKey("giftClaimed", player), false);
      if (getProp(player, propKey("chatColor", player)) === undefined) player.setDynamicProperty(propKey("chatColor", player), "§f");
      setScore(player, OBJ_MONEY, getScore(player, OBJ_MONEY, 0));
      setScore(player, OBJ_RANK, rankData(player).score);
      setScore(player, OBJ_JOINS, getScore(player, OBJ_JOINS, 0) + 1);
    }
    if (getProp(player, propKey("noRespawnPoint", player)) === undefined) {
      player.setDynamicProperty(propKey("noRespawnPoint", player), false);
    }
    noRespawnPointEnabled(player);
    syncOperatorOwnerRank(player);
    ensureRankState(player);
    setScore(player, OBJ_RANK, rankData(player).score);
    applyRankNameTag(player);
    collectPlayerPayouts(player);
    INITIALIZED_PLAYERS.add(playerId);
    return true;
  } catch (error) {
    try { console.warn(`[EXTREMESMP] player initialization deferred for ${player.name}: ${String(error?.stack ?? error)}`); } catch {}
    return false;
  }
}

function marketKey(itemId) {
  return `extremesmp:market_${String(itemId).replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
}

const MARKET_CATALOG_VERSION = 3;

function marketState(item) {
  const key = marketKey(item.id);
  const state = {
    catalogVersion: MARKET_CATALOG_VERSION,
    stock: 299,
    buyCapacity: 499,
    price: item.base,
    previous: item.base,
    demand: 0,
    updated: now(),
    ...safeObject(getJson(world, key, {})),
  };
  if (state.catalogVersion !== MARKET_CATALOG_VERSION) {
    state.catalogVersion = MARKET_CATALOG_VERSION;
    state.stock = 299;
    state.buyCapacity = 499;
    state.price = item.base;
    state.previous = item.base;
    state.demand = 0;
    state.updated = now();
  }
  state.stock = Number.isFinite(Number(state.stock)) ? Math.max(0, Math.min(1000, Math.floor(Number(state.stock)))) : 299;
  state.buyCapacity = Number.isFinite(Number(state.buyCapacity)) ? Math.max(0, Math.min(5000, Math.floor(Number(state.buyCapacity)))) : 499;
  state.price = Number.isFinite(Number(state.price)) && Number(state.price) > 0 ? Math.floor(Number(state.price)) : item.base;
  state.previous = Number.isFinite(Number(state.previous)) && Number(state.previous) > 0 ? Math.floor(Number(state.previous)) : state.price;
  state.demand = Number.isFinite(Number(state.demand)) ? Math.max(-5000, Math.min(5000, Math.floor(Number(state.demand)))) : 0;
  state.updated = Number.isFinite(Number(state.updated)) && Number(state.updated) > 0 ? Math.floor(Number(state.updated)) : now();
  const age = now() - state.updated;
  if (age > MARKET_REPRICE_MS) {
    state.demand = Math.floor(Number(state.demand || 0) * 0.85);
    state.stock = Math.min(1000, Math.floor(Number(state.stock || 0) + 25));
    state.buyCapacity = Math.min(5000, Math.floor(Number(state.buyCapacity || 0) + 50));
    state.previous = state.price;
    state.price = boundedPrice(item, state);
    state.updated = now();
    setJson(world, marketKey(item.id), state);
  }
  return state;
}

function boundedPrice(item, state) {
  const stockFactor = Math.max(0.75, Math.min(1.35, 1.2 - (Number(state.stock || 0) / 1000) * 0.35));
  const demandFactor = Math.max(0.8, Math.min(1.6, 1 + Number(state.demand || 0) / 500));
  return Math.max(Math.floor(item.base * 0.6), Math.min(Math.floor(item.base * 2.2), Math.floor(item.base * stockFactor * demandFactor)));
}

function marketItem(id) { return MARKET.find(item => item.id === id); }

const QUEST_BASES = [
  { item: "minecraft:stone", label: "หิน", target: 16, reward: 80, icon: "textures/blocks/stone" },
  { item: "minecraft:oak_log", label: "ไม้โอ๊ก", target: 12, reward: 90, icon: "textures/items/oak_log" },
  { item: "minecraft:coal", label: "ถ่านหิน", target: 10, reward: 110, icon: "textures/items/coal" },
  { item: "minecraft:iron_ingot", label: "แท่งเหล็ก", target: 8, reward: 180, icon: "textures/items/iron_ingot" },
  { item: "minecraft:gold_ingot", label: "แท่งทอง", target: 6, reward: 240, icon: "textures/items/gold_ingot" },
  { item: "minecraft:bread", label: "ขนมปัง", target: 12, reward: 120, icon: "textures/items/bread" },
  { item: "minecraft:wheat", label: "ข้าวสาลี", target: 20, reward: 100, icon: "textures/items/wheat" },
  { item: "minecraft:glass", label: "กระจก", target: 16, reward: 140, icon: "textures/blocks/glass" },
  { item: "minecraft:oak_planks", label: "แผ่นไม้โอ๊ก", target: 24, reward: 130, icon: "textures/blocks/planks_oak" },
  { item: "minecraft:emerald", label: "มรกต", target: 3, reward: 450, icon: "textures/items/emerald" },
  { item: "minecraft:diamond", label: "เพชร", target: 2, reward: 700, icon: "textures/items/diamond" },
  { item: "minecraft:ender_pearl", label: "ไข่มุกเอนเดอร์", target: 4, reward: 380, icon: "textures/items/ender_pearl" },
];

function questHash(value) {
  let x = (Number(value) >>> 0) + 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

function questDefinition(index) {
  const id = Math.max(0, Math.min(QUEST_CATALOG_SIZE - 1, Number(index) || 0));
  const base = QUEST_BASES[id % QUEST_BASES.length];
  const tier = Math.floor(id / QUEST_BASES.length) % 6;
  const target = base.target + tier * Math.max(1, Math.floor(base.target / 2));
  const reward = base.reward + tier * Math.max(10, Math.floor(base.reward / 3));
  return { id: `Q${String(id + 1).padStart(4, "0")}`, item: base.item, label: base.label, target, reward, icon: base.icon };
}

function activeQuestRotation() {
  const window = Math.floor(now() / QUEST_ROTATION_MS);
  const saved = safeObject(getJson(world, "extremesmp:questRotation", {}));
  if (saved.window === window && Array.isArray(saved.ids) && saved.ids.length === QUESTS_PER_ROTATION) return saved;
  const ids = [];
  const cycleWindow = ((window % QUEST_CYCLE_WINDOWS) + QUEST_CYCLE_WINDOWS) % QUEST_CYCLE_WINDOWS;
  const cyclePosition = cycleWindow * QUESTS_PER_ROTATION;
  // 997 is coprime with 1000, so this permutation visits every quest exactly once
  // across a full 125-window cycle before repeating the catalog.
  for (let i = 0; i < QUESTS_PER_ROTATION; i++) {
    ids.push(((cyclePosition + i) * 997 + 113) % QUEST_CATALOG_SIZE);
  }
  const rotation = { window, ids, startedAt: window * QUEST_ROTATION_MS, catalogSize: QUEST_CATALOG_SIZE };
  setJson(world, "extremesmp:questRotation", rotation);
  logAudit("QUEST_ROTATION", undefined, { window, ids, catalogSize: QUEST_CATALOG_SIZE });
  return rotation;
}

function questPlayerState(player, rotation) {
  const saved = safeObject(getJson(player, "extremesmp:questState", {}));
  if (saved.window !== rotation.window || !Array.isArray(saved.claimed)) {
    const fresh = { window: rotation.window, claimed: [] };
    setJson(player, "extremesmp:questState", fresh);
    return fresh;
  }
  return saved;
}

function claimQuest(player, quest, rotation) {
  const state = questPlayerState(player, rotation);
  if (state.claimed.includes(quest.id)) return notify(player, "ภารกิจนี้รับรางวัลแล้ว", "note.bass");
  const have = countItem(player, quest.item);
  if (have < quest.target) return notify(player, `ของไม่พอ ต้องมี ${quest.target} ${quest.label}`, "note.bass");
  try {
    removeItems(player, quest.item, quest.target);
    addScore(player, OBJ_MONEY, quest.reward);
    state.claimed = [...state.claimed, quest.id].slice(-QUESTS_PER_ROTATION);
    setJson(player, "extremesmp:questState", state);
    logAudit("QUEST_CLAIM", player, { quest: quest.id, item: quest.item, amount: quest.target, reward: quest.reward, window: rotation.window });
    notify(player, `รับรางวัลภารกิจ ${quest.id} แล้ว: §e${quest.reward} NRC`, "random.levelup");
  } catch (error) {
    try { addItems(player, quest.item, quest.target); } catch {}
    logAudit("QUEST_ROLLBACK", player, { quest: quest.id, error: String(error) });
    notify(player, "ภารกิจล้มเหลว ระบบคืนไอเท็มที่ตรวจสอบได้แล้ว", "note.bass");
  }
}

function openQuests(player) {
  const rotation = activeQuestRotation();
  const state = questPlayerState(player, rotation);
  const remaining = Math.max(0, QUEST_ROTATION_MS - (now() - rotation.startedAt));
  const minutes = Math.floor(remaining / 60000);
  const form = new ActionFormData().title("§1EXTREMESMP §8| §bภารกิจ EXTREMESMP").body(`§eทำสำเร็จแล้ว ${state.claimed.length}/${QUESTS_PER_ROTATION} ภารกิจ\n§7เปลี่ยนรอบในประมาณ ${minutes} นาที\n§8เลือกภารกิจเพื่อสะสมของและรับ NRC`);
  for (const index of rotation.ids) {
    const quest = questDefinition(index);
    const claimed = state.claimed.includes(quest.id);
    const have = countItem(player, quest.item);
    form.button(`${claimed ? "§8[รับแล้ว]" : `§f${quest.id}`}\n${quest.label} ${have}/${quest.target}  §e+${quest.reward} NRC`, quest.icon || "textures/ui/market_items/experience_bottle");
  }
  form.button("§cกลับ");
  showUiForPlayer(player.id, form, (res, current) => {
    if (res.canceled || res.selection === rotation.ids.length) return runForOnlinePlayer(current.id, openMenu, 1);
    if (res.selection < 0 || res.selection >= rotation.ids.length) return runForOnlinePlayer(current.id, openQuests, 1);
    claimQuest(current, questDefinition(rotation.ids[res.selection]), rotation);
    runForOnlinePlayer(current.id, openQuests, 2);
  }, openMenu);
}

function marketEntryForId(itemId) {
  const id = String(itemId ?? "");
  return SERVER_BUY_CATALOG.find(entry => entry.id === id)
    ?? SERVER_SELL_CATALOG.find(entry => entry.id === id)
    ?? {
      id,
      label: MARKET_LABEL_OVERRIDES[id] || prettyMarketLabel(id),
      base: Math.max(1, Math.floor(marketBasePrice(id))),
      sell: Math.max(1, Math.floor(marketBasePrice(id) * (1 - MARKET_FEE))),
      icon: "textures/ui/market_categories/all",
      generated: true,
    };
}

function isValidMarketEntry(item) {
  return Boolean(item && typeof item.id === "string" && item.id.includes(":"));
}

function createTransaction(player, item, amount, side, key) {
  if (!cooldown(player, "transaction", 5)) return { ok: false, message: "ทำรายการเร็วเกินไป กรุณารอสักครู่" };
  if (!isValidMarketEntry(item)) return { ok: false, message: "สินค้าไม่ถูกต้อง" };
  if (side !== "BUY" && side !== "SELL") return { ok: false, message: "ประเภทธุรกรรมไม่ถูกต้อง" };
  if (!Number.isInteger(amount) || amount <= 0 || amount > 2304) return { ok: false, message: "จำนวนไม่ถูกต้อง" };
  const idemKey = String(key ?? "").trim().slice(0, 120);
  if (!idemKey) return { ok: false, message: "ไม่พบรหัสรายการ" };
  const idempotency = safeObject(getJson(player, "extremesmp:idempotency", {}));
  if (idempotency[idemKey] !== undefined) return { ok: false, message: "รายการนี้ถูกประมวลผลไปแล้ว" };
  const state = marketState(item);
  const price = side === "BUY" ? state.price : Math.max(1, Math.floor(state.price * (1 - MARKET_FEE)));
  const total = price * amount;
  if (!Number.isSafeInteger(total) || total <= 0 || total > MAX_MARKET_TRANSACTION) return { ok: false, message: "ยอดรวมเกินขีดจำกัดที่ระบบรองรับ" };
  const inv = inventoryContainer(player);
  if (!inv) return { ok: false, message: "ไม่พบ inventory" };
  const oldMoney = getScore(player, OBJ_MONEY, 0);
  const oldStock = state.stock;
  const oldBuyCapacity = state.buyCapacity;
  const oldDemand = state.demand;
  const oldPrice = state.price;
  const oldItems = countItem(player, item.id);
  if (side === "BUY") {
    if (oldMoney < total) return { ok: false, message: `ยอดไม่พอ ต้องใช้ §e${total} NRC` };
    if (!inventoryHasSpace(player, item.id, amount)) return { ok: false, message: "ช่องเก็บของไม่พอ" };
    if (state.stock < amount) return { ok: false, message: "สินค้าหมดชั่วคราว" };
  } else {
    if (oldItems < amount) return { ok: false, message: `คุณมี ${oldItems} ชิ้น ไม่พอขาย ${amount} ชิ้น` };
    if (state.buyCapacity < amount) return { ok: false, message: "เซิร์ฟเวอร์รับซื้อโควต้าครบแล้วชั่วคราว" };
  }
  const auditId = logAudit("TXN_PREPARE", player, { item: item.id, amount, side, price, total, key });
  try {
    if (side === "BUY") {
      setScore(player, OBJ_MONEY, oldMoney - total);
      addItems(player, item.id, amount);
      state.stock -= amount;
      state.demand += amount;
    } else {
      removeItems(player, item.id, amount);
      setScore(player, OBJ_MONEY, oldMoney + total);
      state.stock = Math.min(1000, state.stock + amount);
      state.buyCapacity = Math.max(0, state.buyCapacity - amount);
      state.demand = Math.max(0, state.demand - Math.ceil(amount / 2));
    }
    state.previous = state.price;
    state.price = boundedPrice(item, state);
    state.updated = now();
    setJson(world, marketKey(item.id), state);
    setJson(player, propKey("history", player), [
      { id: auditId, t: new Date().toISOString(), side, item: item.id, amount, price, total },
      ...safeArray(getJson(player, propKey("history", player), [])).slice(0, 24),
    ]);
    idempotency[idemKey] = auditId;
    const idemEntries = Object.entries(idempotency).slice(-50);
    setJson(player, "extremesmp:idempotency", Object.fromEntries(idemEntries));
    logAudit("TXN_COMMIT", player, { auditId, item: item.id, amount, side, price, total, idempotency: idemKey });
    return { ok: true, price, total, auditId };
  } catch (error) {
    // Best-effort rollback for every mutation, including inventory changes.
    try { setScore(player, OBJ_MONEY, oldMoney); } catch {}
    try {
      const currentItems = countItem(player, item.id);
      const delta = currentItems - oldItems;
      if (delta > 0) removeItems(player, item.id, delta);
      else if (delta < 0) addItems(player, item.id, -delta);
    } catch {}
    try { state.stock = oldStock; state.buyCapacity = oldBuyCapacity; state.demand = oldDemand; state.price = oldPrice; setJson(world, marketKey(item.id), state); } catch {}
    logAudit("TXN_ROLLBACK", player, { auditId, item: item.id, amount, side, error: String(error) });
    return { ok: false, message: "รายการล้มเหลว ระบบคืนเงิน/ไอเท็มที่ตรวจสอบได้แล้ว กรุณาแจ้งทีมงานพร้อมรหัส " + auditId };
  }
}

function countItem(player, id) {
  const inv = inventoryContainer(player);
  if (!inv) return 0;
  let total = 0;
  for (let i = 0; i < inv.size; i++) {
    const stack = inv.getItem(i);
    if (stack?.typeId === id) total += stack.amount;
  }
  return total;
}

function inventoryHasSpace(player, id, amount) {
  const inv = inventoryContainer(player);
  if (!inv) return false;
  let capacity = 0;
  for (let i = 0; i < inv.size; i++) {
    const stack = inv.getItem(i);
    if (!stack) capacity += 64;
    else if (stack.typeId === id) capacity += Math.max(0, 64 - stack.amount);
  }
  return capacity >= amount;
}

function addItems(player, id, amount) {
  const inv = inventoryContainer(player);
  let left = amount;
  while (left > 0) {
    const count = Math.min(64, left);
    const remainder = inv.addItem(new ItemStack(id, count));
    if (remainder) throw new Error("inventory add failed");
    left -= count;
  }
}

function removeItems(player, id, amount) {
  const inv = inventoryContainer(player);
  let left = amount;
  for (let i = 0; i < inv.size && left > 0; i++) {
    const stack = inv.getItem(i);
    if (!stack || stack.typeId !== id) continue;
    const take = Math.min(left, stack.amount);
    if (take === stack.amount) inv.setItem(i, undefined);
    else { stack.amount -= take; inv.setItem(i, stack); }
    left -= take;
  }
  if (left > 0) throw new Error("inventory remove failed");
}

function weightedLoot(box) {
  const total = box.rewards.reduce((sum, reward) => sum + Math.max(0, Number(reward.weight) || 0), 0);
  let roll = Math.random() * total;
  for (const reward of box.rewards) {
    roll -= Math.max(0, Number(reward.weight) || 0);
    if (roll <= 0) return reward;
  }
  return box.rewards[box.rewards.length - 1];
}

function crateHistory(player) {
  const history = getJson(player, propKey("crateHistory", player), []);
  return Array.isArray(history) ? history : [];
}

function animateLootBox(player, box, reward) {
  for (let step = 0; step < 7; step++) {
    runForOnlinePlayer(player.id, current => {
      const text = step < 6
        ? `${box.color}${box.label} §fกำลังเปิด${".".repeat((step % 3) + 1)}`
        : `§6ได้รับรางวัล §f${reward.label}`;
      current.runCommandAsync(`title @s actionbar ${text}`).catch(() => {});
      current.playSound(step < 6 ? "random.orb" : "random.levelup");
      if (step === 6) current.runCommandAsync("particle minecraft:totem_particle ~ ~1 ~").catch(() => {});
    }, step * 3);
  }
}

function openLootCrate(player, tier) {
  const box = LOOT_BOXES[tier];
  if (!box) return runForOnlinePlayer(player.id, openCrates, 1);
  if (!cooldown(player, "crate", 20)) return notify(player, "เปิดกล่องเร็วเกินไป กรุณารอสักครู่", "note.bass");
  const balance = getScore(player, OBJ_MONEY, 0);
  if (balance < box.cost) {
    notify(player, `ต้องใช้ §e${box.cost} NRC §fแต่คุณมี §e${balance} NRC`, "note.bass");
    return runForOnlinePlayer(player.id, openCrates, 1);
  }
  const reward = weightedLoot(box);
  if (reward.kind === "item" && !inventoryHasSpace(player, reward.id, reward.amount)) {
    notify(player, "ช่องเก็บของไม่พอสำหรับรางวัลนี้ กรุณาเคลียร์ช่องแล้วลองใหม่", "note.bass");
    return runForOnlinePlayer(player.id, openCrates, 1);
  }
  const oldBalance = balance;
  const oldAmount = reward.kind === "item" ? countItem(player, reward.id) : 0;
  try {
    setScore(player, OBJ_MONEY, oldBalance - box.cost);
    if (reward.kind === "item") addItems(player, reward.id, reward.amount);
    else addScore(player, OBJ_MONEY, reward.amount);
    const history = crateHistory(player);
    history.unshift({ t: new Date().toISOString(), tier: box.key, reward: reward.label, kind: reward.kind, amount: reward.amount });
    setJson(player, propKey("crateHistory", player), history.slice(0, 50));
    logAudit("LOOT_BOX_OPEN", player, { tier: box.key, cost: box.cost, reward: reward.label, kind: reward.kind, amount: reward.amount });
    animateLootBox(player, box, reward);
    notify(player, `${box.color}${box.label} §fเปิดสำเร็จ — รางวัล: §e${reward.label}`, "random.levelup");
  } catch (error) {
    try { setScore(player, OBJ_MONEY, oldBalance); } catch {}
    if (reward.kind === "item") {
      try {
        const delta = countItem(player, reward.id) - oldAmount;
        if (delta > 0) removeItems(player, reward.id, delta);
      } catch {}
    }
    logAudit("LOOT_BOX_ROLLBACK", player, { tier: box.key, error: String(error) });
    notify(player, "เปิดกล่องไม่สำเร็จ ระบบคืน NRC และรางวัลแล้ว", "note.bass");
  }
  runForOnlinePlayer(player.id, openCrates, 22);
}

function openLootHistory(player) {
  const history = crateHistory(player);
  const body = history.length
    ? history.slice(0, 20).map((entry, index) => `§e${index + 1}. §7${String(entry.t || "").slice(0, 19)} §f${entry.tier}\n§8${entry.reward}`).join("\n")
    : "ยังไม่มีประวัติการเปิดกล่อง";
  const form = new MessageFormData().title("§1EXTREMESMP §8| §bประวัติกล่องสุ่ม").body(body).button1("กลับ").button2("ปิด");
  showUiForPlayer(player.id, form, (_res, current) => runForOnlinePlayer(current.id, openCrates, 1), openCrates);
}

function openCrates(player) {
  const keys = Object.keys(LOOT_BOXES);
  const form = new ActionFormData().title("§1EXTREMESMP §8| §bEXTREMESMP LOOT BOXES").body(`§eNRC: §f${getScore(player, OBJ_MONEY, 0)}\n§7ระบบสุ่มถ่วงน้ำหนัก • ทุกกล่องบันทึกประวัติ\n§8หมายเหตุ: กล่องใช้ NRC ในเกม ไม่ผูกกับการจ่ายเงินจริง`);
  for (const key of keys) {
    const box = LOOT_BOXES[key];
    form.button(`${box.color}${box.label}\n§fเปิดด้วย ${box.cost} NRC`, box.icon);
  }
  form.button("§bประวัติการเปิดกล่อง");
  form.button("§cกลับ");
  showUiForPlayer(player.id, form, (res, current) => {
    if (res.canceled || res.selection === keys.length + 1) return runForOnlinePlayer(current.id, openRewards, 1);
    if (res.selection === keys.length) return runForOnlinePlayer(current.id, openLootHistory, 1);
    if (res.selection >= 0 && res.selection < keys.length) return runForOnlinePlayer(current.id, next => openLootCrate(next, keys[res.selection]), 1);
    return runForOnlinePlayer(current.id, openRewards, 1);
  }, openRewards);
}

function openRewards(player) {
  const claimed = getProp(player, propKey("giftClaimed", player), false);
  const form = new ActionFormData().title("§1EXTREMESMP §8| §bรางวัล EXTREMESMP").body(`§eสถานะของขวัญผู้เล่นใหม่: ${claimed ? "§aรับแล้ว" : "§6ยังไม่ได้รับ"}\n§7กล่องสุ่มใช้ NRC ในเกมและมีประวัติทุกครั้ง\n§8ไม่มีการตัดเงินจริงจากระบบนี้`)
    .button(claimed ? "§8ของขวัญผู้เล่นใหม่ (รับแล้ว)" : "§aรับของขวัญผู้เล่นใหม่", "textures/ui/market_items/diamond")
    .button("§dกล่องสุ่ม 4 ระดับ", NRC_PACKAGE_ICON)
    .button("§bประวัติการเปิดกล่อง")
    .button("§cกลับ");
  showUiForPlayer(player.id, form, (res, current) => {
    if (res.canceled || res.selection === 3) return runForOnlinePlayer(current.id, openMenu, 1);
    if (res.selection === 0) { claimNewPlayerGift(current); return runForOnlinePlayer(current.id, openRewards, 2); }
    if (res.selection === 1) return runForOnlinePlayer(current.id, openCrates, 1);
    if (res.selection === 2) return runForOnlinePlayer(current.id, openLootHistory, 1);
  }, openMenu);
}

function claimNewPlayerGift(player) {
  if (getProp(player, propKey("giftClaimed", player), false)) return notify(player, "คุณรับของขวัญผู้เล่นใหม่ไปแล้ว", "note.bass");
  if (!cooldown(player, "gift", GIFT_COOLDOWN_TICKS)) return;
  if (!inventoryHasSpace(player, "minecraft:bread", 16) || !inventoryHasSpace(player, "minecraft:stone_pickaxe", 1)) {
    return notify(player, "ช่องเก็บของไม่พอ กรุณาเคลียร์ช่องแล้วลองใหม่", "note.bass");
  }
  const oldMoney = getScore(player, OBJ_MONEY, 0);
  const oldBread = countItem(player, "minecraft:bread");
  const oldPickaxe = countItem(player, "minecraft:stone_pickaxe");
  try {
    addItems(player, "minecraft:bread", 16);
    addItems(player, "minecraft:stone_pickaxe", 1);
    setScore(player, OBJ_MONEY, oldMoney + 250);
    player.setDynamicProperty(propKey("giftClaimed", player), true);
    logAudit("NEW_PLAYER_GIFT", player, { coins: 250, bread: 16, tool: "stone_pickaxe" });
    notify(player, "รับของขวัญผู้เล่นใหม่แล้ว: §e250 NRC §f+ ขนมปัง 16 + พลั่วหิน", "random.levelup");
  } catch (error) {
    try { setScore(player, OBJ_MONEY, oldMoney); } catch {}
    try {
      const breadDelta = countItem(player, "minecraft:bread") - oldBread;
      if (breadDelta > 0) removeItems(player, "minecraft:bread", breadDelta);
      const pickaxeDelta = countItem(player, "minecraft:stone_pickaxe") - oldPickaxe;
      if (pickaxeDelta > 0) removeItems(player, "minecraft:stone_pickaxe", pickaxeDelta);
    } catch {}
    logAudit("NEW_PLAYER_GIFT_ROLLBACK", player, { error: String(error) });
    notify(player, "รับของขวัญไม่สำเร็จ ระบบยังไม่ตัดสิทธิ์ กรุณาลองใหม่", "note.bass");
  }
}

function playerListingState() {
  const raw = getJson(world, "extremesmp:playerListings", {});
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

function savePlayerListingState(listings) {
  const active = Object.values(listings)
    .filter(x => x && typeof x.id === "string" && typeof x.sellerName === "string" && x.sellerName.length > 0 && typeof x.item === "string" && Number.isInteger(Number(x.remaining)) && Number(x.remaining) > 0 && Number.isInteger(Number(x.unitPrice)) && Number(x.unitPrice) > 0)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(0, MAX_PLAYER_LISTING_COUNT);
  setJson(world, "extremesmp:playerListings", Object.fromEntries(active.map(x => [x.id, x])));
}

function playerPayoutKey(name) {
  return `extremesmp:payout_${String(name).replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 48)}`;
}

function collectPlayerPayouts(player) {
  const key = playerPayoutKey(player.name);
  const state = safeObject(getJson(world, key, {}));
  const balance = Math.max(0, Math.floor(Number(state.balance) || 0));
  if (!balance) return;
  const oldMoney = getScore(player, OBJ_MONEY, 0);
  const nextMoney = Math.min(MAX_SCOREBOARD_VALUE, oldMoney + balance);
  const credited = Math.max(0, nextMoney - oldMoney);
  if (!credited) return notify(player, "ยอดเงินของคุณเต็มขีดจำกัด จึงยังรับเงินตลาดไม่ได้", "note.bass");
  try {
    const objective = world.scoreboard.getObjective(OBJ_MONEY) ?? world.scoreboard.addObjective(OBJ_MONEY, OBJ_MONEY);
    objective.setScore(player, nextMoney);
    if (getScore(player, OBJ_MONEY, oldMoney) !== nextMoney) throw new Error("payout score verification failed");
    const remaining = balance - credited;
    setJson(world, key, { balance: remaining, entries: safeArray(state.entries).slice(-30) });
    logAudit("PLAYER_MARKET_PAYOUT", player, { amount: credited, remaining });
    notify(player, `รับเงินจากตลาดผู้เล่นแล้ว §e${credited} NRC`, "random.orb");
  } catch (error) {
    logAudit("PLAYER_MARKET_PAYOUT_RETRY", player, { amount: balance, error: String(error) });
    notify(player, "รับเงินตลาดยังไม่สำเร็จ ระบบคงยอดไว้ให้ลองใหม่ภายหลัง", "note.bass");
  }
}

function activePlayerListings() {
  const listings = playerListingState();
  let changed = false;
  for (const [id, listing] of Object.entries(listings)) {
    if (!listing || Number(listing.remaining) <= 0) {
      delete listings[id];
      changed = true;
    }
  }
  if (changed) savePlayerListingState(listings);
  return Object.values(listings).filter(x => Number(x.remaining) > 0).sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
}

function createPlayerListing(player, itemIndex, amount, unitPrice) {
  if (!cooldown(player, "playerListing", 20)) return notify(player, "ลงขายเร็วเกินไป กรุณารอสักครู่", "note.bass");
  const item = MARKET[Number(itemIndex)];
  const normalizedAmount = Number(amount);
  const normalizedUnitPrice = Number(unitPrice);
  if (!item || !Number.isInteger(normalizedAmount) || normalizedAmount <= 0 || normalizedAmount > 2304 || !Number.isInteger(normalizedUnitPrice) || normalizedUnitPrice <= 0 || normalizedUnitPrice > 1000000000 || normalizedAmount * normalizedUnitPrice > MAX_MARKET_TRANSACTION) return notify(player, "ข้อมูลประกาศไม่ถูกต้องหรือยอดรวมเกินขีดจำกัด", "note.bass");
  if (countItem(player, item.id) < normalizedAmount) return notify(player, "ไอเท็มในตัวไม่พอสำหรับลงขาย", "note.bass");
  const listings = playerListingState();
  const sellerListings = Object.values(listings).filter(x => x?.sellerName === player.name && Number(x.remaining) > 0).length;
  if (sellerListings >= 10) return notify(player, "คุณมีประกาศที่เปิดอยู่ครบ 10 รายการแล้ว", "note.bass");
  const id = `L${now()}${Math.random().toString(36).slice(2, 7)}`;
  const listing = { id, sellerName: player.name, item: item.id, label: item.label, remaining: normalizedAmount, unitPrice: normalizedUnitPrice, createdAt: now() };
  try {
    removeItems(player, item.id, normalizedAmount);
    listings[id] = listing;
    savePlayerListingState(listings);
    logAudit("PLAYER_LISTING_CREATE", player, { id, item: item.id, amount: normalizedAmount, unitPrice: normalizedUnitPrice });
    notify(player, `ลงขาย ${item.label} ${normalizedAmount} ชิ้นแล้ว`, "random.orb");
  } catch (error) {
    try { addItems(player, item.id, normalizedAmount); } catch {}
    logAudit("PLAYER_LISTING_ROLLBACK", player, { id, error: String(error) });
    notify(player, "ลงขายไม่สำเร็จ ระบบคืนไอเท็มที่ตรวจสอบได้แล้ว", "note.bass");
  }
}

function buyPlayerListing(player, listingId, amount) {
  const listings = playerListingState();
  const listingKey = String(listingId ?? "").slice(0, 80);
  const listing = listings[listingKey];
  if (!listing || typeof listing.item !== "string" || !Number.isInteger(Number(listing.remaining)) || Number(listing.remaining) <= 0) return notify(player, "ประกาศนี้หมดแล้ว", "note.bass");
  if (listing.sellerName === player.name) return notify(player, "ซื้อประกาศของตัวเองไม่ได้", "note.bass");
  if (!Number.isInteger(amount) || amount <= 0 || amount > Number(listing.remaining)) return notify(player, "จำนวนซื้อไม่ถูกต้อง", "note.bass");
  const item = marketItem(listing.item);
  if (!item) return notify(player, "รายการนี้ใช้ไอเท็มที่ไม่รองรับแล้ว", "note.bass");
  if (!inventoryHasSpace(player, item.id, amount)) return notify(player, "ช่องเก็บของไม่พอ", "note.bass");
  const unitPrice = Math.max(1, Math.floor(Number(listing.unitPrice) || 0));
  const total = amount * unitPrice;
  if (!Number.isSafeInteger(total) || total <= 0 || total > MAX_MARKET_TRANSACTION) return notify(player, "ยอดรวมของประกาศนี้เกินขีดจำกัด", "note.bass");
  const oldMoney = getScore(player, OBJ_MONEY, 0);
  const oldItems = countItem(player, item.id);
  if (oldMoney < total) return notify(player, `ยอดไม่พอ ต้องใช้ §e${total} NRC`, "note.bass");
  const oldRemaining = Number(listing.remaining);
  const payoutKey = playerPayoutKey(listing.sellerName);
  const payout = safeObject(getJson(world, payoutKey, {}));
  const oldPayout = {
    balance: Math.max(0, Math.min(MAX_SCOREBOARD_VALUE, Math.floor(Number(payout.balance) || 0))),
    entries: safeArray(payout.entries).filter(entry => entry && typeof entry === "object").slice(-30),
  };
  const idemKey = `player:${listingKey}:${amount}:${Math.floor(now() / 5000)}`;
  const idempotency = safeObject(getJson(player, "extremesmp:idempotency", {}));
  if (idempotency[idemKey] !== undefined) return notify(player, "รายการนี้ถูกประมวลผลไปแล้ว", "note.bass");
  const auditId = logAudit("PLAYER_TXN_PREPARE", player, { listingId: listingKey, amount, total, seller: listing.sellerName });
  try {
    setScore(player, OBJ_MONEY, oldMoney - total);
    addItems(player, item.id, amount);
    listing.remaining = oldRemaining - amount;
    const nextPayoutBalance = oldPayout.balance + total;
    if (!Number.isSafeInteger(nextPayoutBalance) || nextPayoutBalance > MAX_SCOREBOARD_VALUE) throw new Error("seller payout exceeds scoreboard limit");
    payout.balance = nextPayoutBalance;
    payout.entries = [...oldPayout.entries, { id: auditId, from: player.name, item: item.id, amount, total, t: now() }].slice(-30);
    idempotency[idemKey] = auditId;
    savePlayerListingState(listings);
    setJson(world, payoutKey, payout);
    setJson(player, "extremesmp:idempotency", Object.fromEntries(Object.entries(idempotency).slice(-50)));
    logAudit("PLAYER_TXN_COMMIT", player, { auditId, listingId: listingKey, item: item.id, amount, total, seller: listing.sellerName });
    notify(player, `ซื้อจากตลาดผู้เล่นสำเร็จ ${amount} ${item.label} รวม ${total} NRC`, "random.orb");
  } catch (error) {
    try { setScore(player, OBJ_MONEY, oldMoney); } catch {}
    try { const delta = countItem(player, item.id) - oldItems; if (delta > 0) removeItems(player, item.id, delta); } catch {}
    listing.remaining = oldRemaining;
    try { savePlayerListingState(listings); } catch {}
    try { setJson(world, payoutKey, oldPayout); } catch {}
    logAudit("PLAYER_TXN_ROLLBACK", player, { auditId, listingId: listingKey, error: String(error) });
    notify(player, "ตลาดผู้เล่นล้มเหลว ระบบคืนยอดที่ตรวจสอบได้แล้ว", "note.bass");
  }
}

function openPlayerListingCreate(player) {
  const form = new ModalFormData().title("ลงขายตลาดผู้เล่น").dropdown("สินค้า", MARKET.map(x => x.label), 0).textField("จำนวน", "เช่น 16", "1").textField("ราคาต่อชิ้น NRC", "เช่น 25", "25");
  showUiForPlayer(player.id, form, (res, current) => {
    if (res.canceled) return runForOnlinePlayer(current.id, openPlayerMarket, 1);
    createPlayerListing(current, Number(res.formValues?.[0] ?? 0), Math.floor(Number(res.formValues?.[1] ?? 0)), Math.floor(Number(res.formValues?.[2] ?? 0)));
    runForOnlinePlayer(current.id, openPlayerMarket, 2);
  }, openPlayerMarket);
}

function openPlayerPurchase(player, listing) {
  const form = new ModalFormData().title(`ซื้อ ${listing.label}`).body(`ผู้ขาย: ${listing.sellerName}\nราคา: ${listing.unitPrice} NRC/ชิ้น\nเหลือ: ${listing.remaining} ชิ้น`).textField("จำนวน", "จำนวนที่ต้องการ", "1");
  showUiForPlayer(player.id, form, (res, current) => {
    if (res.canceled) return runForOnlinePlayer(current.id, openPlayerMarket, 1);
    buyPlayerListing(current, listing.id, Math.floor(Number(res.formValues?.[0] ?? 0)));
    runForOnlinePlayer(current.id, openPlayerMarket, 2);
  }, openPlayerMarket);
}

function openPlayerMarket(player) {
  const listings = activePlayerListings().slice(0, 30);
  const form = new ActionFormData().title("§1EXTREMESMP §8| §bตลาดผู้เล่น").body(listings.length ? `§7มีประกาศที่ยังขายอยู่ ${listings.length} รายการ\n§8ตลาดนี้แสดงเฉพาะของที่ผู้เล่นลงขายจริง` : "§7ยังไม่มีผู้เล่นลงขายของ\n§8เมื่อมีรายการจะแสดงที่หน้านี้").button("§aลงขายของ");
  for (const listing of listings) form.button(`§f${listing.label} x${listing.remaining}\n§e${listing.unitPrice} NRC/ชิ้น §8โดย ${listing.sellerName}`, marketIcon(marketItem(listing.item)));
  form.button("§cกลับ");
  showUiForPlayer(player.id, form, (res, current) => {
    if (res.canceled || res.selection === listings.length + 1) return runForOnlinePlayer(current.id, openMarket, 1);
    if (res.selection === 0) return runForOnlinePlayer(current.id, openPlayerListingCreate, 1);
    const listing = listings[res.selection - 1];
    if (listing) return runForOnlinePlayer(current.id, next => openPlayerPurchase(next, listing), 1);
    return runForOnlinePlayer(current.id, openPlayerMarket, 1);
  }, openMarket);
}

function inventoryRowsForPricing(player) {
  const inv = inventoryContainer(player);
  if (!inv) return [];
  const amounts = new Map();
  for (let slot = 0; slot < inv.size; slot++) {
    const stack = inv.getItem(slot);
    if (!stack?.typeId || !Number.isInteger(stack.amount) || stack.amount <= 0) continue;
    amounts.set(stack.typeId, (amounts.get(stack.typeId) ?? 0) + stack.amount);
  }
  return [...amounts.entries()].map(([id, amount]) => {
    const item = marketEntryForId(id);
    const state = marketState(item);
    const price = Math.max(1, Math.floor(state.price * (1 - MARKET_FEE)));
    return { id, amount, item, state, price, total: price * amount };
  }).sort((a, b) => b.total - a.total || a.item.label.localeCompare(b.item.label));
}

function heldInventoryStack(player) {
  const inv = inventoryContainer(player);
  if (!inv) return undefined;
  try {
    return inv.getItem(Number(player.selectedSlotIndex) || 0);
  } catch {
    return undefined;
  }
}

function bulkSellInventory(player) {
  if (!cooldown(player, "bulkSell", 20)) return { ok: false, message: "ขายของเร็วเกินไป กรุณารอสักครู่" };
  const rows = inventoryRowsForPricing(player);
  if (!rows.length) return { ok: false, message: "ไม่พบไอเท็มในกระเป๋า" };
  const sellRows = rows.map(row => ({ ...row, amount: Math.min(row.amount, row.state.buyCapacity) })).filter(row => row.amount > 0);
  if (!sellRows.length) return { ok: false, message: "โควต้ารับซื้อของเซิร์ฟเวอร์เต็มชั่วคราว" };
  const total = sellRows.reduce((sum, row) => sum + row.price * row.amount, 0);
  if (!Number.isSafeInteger(total) || total <= 0 || total > MAX_MARKET_TRANSACTION) return { ok: false, message: "ยอดขายรวมเกินขีดจำกัด กรุณาขายทีละส่วน" };
  const oldMoney = getScore(player, OBJ_MONEY, 0);
  const oldCounts = new Map(sellRows.map(row => [row.id, countItem(player, row.id)]));
  const oldStates = new Map(sellRows.map(row => [row.id, { ...row.state }]));
  const auditId = logAudit("BULK_SELL_PREPARE", player, { itemTypes: sellRows.length, total });
  try {
    for (const row of sellRows) removeItems(player, row.id, row.amount);
    setScore(player, OBJ_MONEY, oldMoney + total);
    const history = sellRows.slice(0, 24).map(row => ({ id: auditId, t: new Date().toISOString(), side: "SELL", item: row.id, amount: row.amount, price: row.price, total: row.price * row.amount, bulk: true }));
    setJson(player, propKey("history", player), [...history, ...safeArray(getJson(player, propKey("history", player), [])).slice(0, Math.max(0, 25 - history.length))]);
    for (const row of sellRows) {
      row.state.stock = Math.min(1000, row.state.stock + row.amount);
      row.state.buyCapacity = Math.max(0, row.state.buyCapacity - row.amount);
      row.state.demand = Math.max(-5000, row.state.demand - Math.ceil(row.amount / 2));
      row.state.previous = row.state.price;
      row.state.price = boundedPrice(row.item, row.state);
      row.state.updated = now();
      setJson(world, marketKey(row.id), row.state);
    }
    logAudit("BULK_SELL_COMMIT", player, { auditId, itemTypes: sellRows.length, total, sold: sellRows.map(row => ({ item: row.id, amount: row.amount, total: row.price * row.amount })) });
    return { ok: true, itemTypes: sellRows.length, total, skipped: rows.length - sellRows.length };
  } catch (error) {
    try { setScore(player, OBJ_MONEY, oldMoney); } catch {}
    for (const [id, oldCount] of oldCounts) {
      try {
        const currentCount = countItem(player, id);
        const delta = currentCount - oldCount;
        if (delta > 0) removeItems(player, id, delta);
        else if (delta < 0) addItems(player, id, -delta);
      } catch {}
    }
    for (const [id, state] of oldStates) {
      try { setJson(world, marketKey(id), state); } catch {}
    }
    logAudit("BULK_SELL_ROLLBACK", player, { auditId, error: String(error) });
    return { ok: false, message: `ขายไม่สำเร็จ ระบบพยายามคืนไอเท็มแล้ว รหัส ${auditId}` };
  }
}

function openInventorySellItem(player, item, returnTo = openInventorySell) {
  const count = countItem(player, item.id);
  const state = marketState(item);
  const price = Math.max(1, Math.floor(state.price * (1 - MARKET_FEE)));
  const maxAmount = Math.min(count, state.buyCapacity, 2304);
  const form = new ModalFormData().title(`§0ขาย ${item.label}`).textField(`§eราคาขาย ${price} NRC/ชิ้น\n§7มีในกระเป๋า ${count} ชิ้น • โควตารับซื้อ ${state.buyCapacity}`, "จำนวนที่ขาย", { defaultValue: "1", placeholder: "1" });
  showUiForPlayer(player.id, form, (res, current) => {
    if (res.canceled) return runForOnlinePlayer(current.id, next => returnTo(next), 1);
    const amount = Math.floor(Number(res.formValues?.[0] ?? 0));
    if (amount <= 0 || amount > maxAmount) notify(current, `จำนวนต้องอยู่ระหว่าง 1-${maxAmount}`, "note.bass");
    else {
      const result = createTransaction(current, item, amount, "SELL", `inventory:${item.id}:${amount}:${Math.floor(now() / 5000)}`);
      notify(current, result.ok ? `§aขาย ${item.label} ${amount} ชิ้น ได้ §e${result.total} NRC` : `§c${result.message}`, result.ok ? "random.orb" : "note.bass");
    }
    runForOnlinePlayer(current.id, next => returnTo(next), 2);
  }, returnTo);
}

function openInventorySell(player, returnTo = openMenu) {
  const rows = inventoryRowsForPricing(player);
  const form = new ActionFormData().title("§1EXTREMESMP §8| §bขายของในกระเป๋า").body(rows.length
    ? `§fไอเท็มที่มีราคา ${rows.length} ชนิด\n§7เลือกขายรายชนิด หรือกดขายทั้งหมด\n§8ราคาขายอิงตลาดรับซื้อ EXTREMESMP และมีโควต้ารายชิ้น`
    : "§7ไม่พบไอเท็มในกระเป๋า");
  for (const row of rows) form.button(`§f${row.item.label}\n§e${row.price} NRC/ชิ้น §8× ${row.amount}\n§7รวมประมาณ ${row.total} NRC`, marketIcon(row.item));
  const itemCount = rows.length;
  form.button("§aขายทั้งหมดในกระเป๋า\n§7ขายทุกชิ้นที่ระบบรับซื้อ", "textures/ui/market_items/gold_ingot");
  form.button("§bดูราคาของที่ถือ\n§7ตรวจสอบไอเท็มในมือ", "textures/ui/market_items/emerald");
  form.button("§cกลับ", "textures/ui/arrow_left");
  showUiForPlayer(player.id, form, (res, current) => {
    if (res.canceled || res.selection === itemCount + 2) return runForOnlinePlayer(current.id, next => returnTo(next), 1);
    if (res.selection < itemCount) return runForOnlinePlayer(current.id, next => openInventorySellItem(next, rows[Number(res.selection)].item, returnTo), 1);
    if (res.selection === itemCount) {
      const result = bulkSellInventory(current);
      notify(current, result.ok ? `§aขายของสำเร็จ ${result.itemTypes} ชนิด ได้ §e${result.total} NRC` : `§c${result.message}`, result.ok ? "random.orb" : "note.bass");
      return runForOnlinePlayer(current.id, next => openInventorySell(next, returnTo), 2);
    }
    if (res.selection === itemCount + 1) return runForOnlinePlayer(current.id, next => openHeldPrice(next, returnTo), 1);
  }, returnTo);
}

function openHeldPrice(player, returnTo = openMenu) {
  const stack = heldInventoryStack(player);
  if (!stack?.typeId) {
    const empty = new MessageFormData().title("§1EXTREMESMP §8| §bดูราคาของที่ถือ").body("§7มือหลักของคุณว่างอยู่\n§fถือไอเท็มที่ต้องการตรวจสอบ แล้วเปิดเมนูนี้อีกครั้ง").button1("กลับ").button2("ปิด");
    return showUiForPlayer(player.id, empty, (_res, current) => runForOnlinePlayer(current.id, next => returnTo(next), 1), returnTo);
  }
  const item = marketEntryForId(stack.typeId);
  const state = marketState(item);
  const sellPrice = Math.max(1, Math.floor(state.price * (1 - MARKET_FEE)));
  const body = `§fไอเท็ม: §e${item.label}\n§fจำนวนในมือ: §e${stack.amount}\n\n§aซื้อจากระบบ: §e${state.price} NRC/ชิ้น\n§cขายให้ระบบ: §e${sellPrice} NRC/ชิ้น\n§7ถ้าขายทั้งกองจะได้ประมาณ §e${sellPrice * stack.amount} NRC\n§8ราคาปรับตาม stock และ quota ของตลาด`;
  const form = new MessageFormData().title("§1EXTREMESMP §8| §bราคาของที่ถือ").body(body).button1("กลับ").button2("ปิด");
  showUiForPlayer(player.id, form, (_res, current) => runForOnlinePlayer(current.id, next => returnTo(next), 1), returnTo);
}

function toggleLavaScoreboard(player) {
  const disabled = Boolean(player.getDynamicProperty("personal_scoreboard_disabled"));
  player.setDynamicProperty("personal_scoreboard_disabled", !disabled);
  notify(player, !disabled ? "ปิด scoreboard ส่วนตัวแล้ว" : "เปิด scoreboard ส่วนตัวแล้ว", "random.orb");
}

function openSettings(player) {
  const disabled = Boolean(player.getDynamicProperty("personal_scoreboard_disabled"));
  const form = new ActionFormData().title("§1EXTREMESMP §8| §bSettings").body(`§7ตั้งค่าการแสดงผลและการใช้งาน\n§fScoreboard: ${disabled ? "§cปิดอยู่" : "§aเปิดอยู่"}`)
    .button(`${disabled ? "§aเปิด" : "§cปิด"} Scoreboard\n§7แสดงข้อมูลส่วนตัวบนหน้าจอ`, "textures/ui/settings_glyph")
    .button("§bตั้งค่า PTP\n§7โหมดเทเลพอร์ตและการแจ้งเตือน", "textures/ui/market_items/bookshelf")
    .button("§cกลับเมนูหลัก", "textures/ui/arrow_left");
  showUiForPlayer(player.id, form, (res, current) => {
    if (res.canceled || res.selection === 2) return runForOnlinePlayer(current.id, openMenu, 1);
    if (res.selection === 0) {
      toggleLavaScoreboard(current);
      return runForOnlinePlayer(current.id, openSettings, 1);
    }
    if (res.selection === 1) return runForOnlinePlayer(current.id, openTeleportSettings, 1);
  }, openMenu);
}

function rankButton(rank) {
  const data = RANKS[rank] ?? RANKS.MEMBER;
  return formatRankBadge({ key: rank, ...data }, data.glyph);
}

const EXTREMESMP_MENU_CATEGORIES = [
  {
    id: "TEAM",
    label: "Team",
    icon: "textures/ui/market_items/armor_stand",
    description: "จัดการเพื่อน แชท ภารกิจ และแจ้งทีมงาน",
    actions: [
      { label: "§fเพื่อนและแชทส่วนตัว\n§7จัดการผู้เล่นและ PTP", icon: "textures/ui/market_items/bookshelf", route: openFriends },
      { label: "§fภารกิจ\n§7ทำเควสต์และรับ NRC", icon: "textures/ui/market_items/experience_bottle", route: openQuests },
      { label: "§fรายงานผู้เล่น\n§7แจ้งปัญหาให้ทีมงาน", icon: "textures/ui/market_items/bookshelf", route: openReport },
    ],
  },
  {
    id: "TELEPORT",
    label: "Teleport",
    icon: "textures/ui/market_items/ender_pearl",
    description: "เดินทางข้ามโลกและตั้งค่าการเทเลพอร์ต",
    actions: [
      { label: "§fเลือกโลก\n§7Overworld / Nether / The End", icon: "textures/ui/market_items/emerald_block", route: openWorldSelector },
      { label: "§bตั้งค่า PTP\n§7โหมดเทเลพอร์ตและการแจ้งเตือน", icon: "textures/ui/market_items/bookshelf", route: openTeleportSettings },
    ],
  },
  {
    id: "ECONOMY",
    label: "Economy",
    icon: "textures/ui/market_items/emerald",
    description: "Manage your NRC balance, server shop, and player trading.",
    actions: [
      { label: "§eOpen Server Shop\n§7Buy and sell items", icon: "textures/ui/market_items/gold_ingot", route: openMarket },
      { label: "§6Sell All Inventory\n§7Sell accepted items from your inventory", icon: "textures/ui/market_items/gold_ingot", route: (p) => openInventorySell(p, (next) => openCategoryMenu(next, "ECONOMY")) },
      { label: "§bCheck Held Price\n§7Inspect the item in your hand", icon: "textures/ui/market_items/emerald", route: (p) => openHeldPrice(p, (next) => openCategoryMenu(next, "ECONOMY")) },
      { label: "§dPlayer Market\n§7Buy and list player items", icon: "textures/ui/market_items/bundle", route: openPlayerMarket },
    ],
  },
  {
    id: "PROFILE",
    label: "Profile",
    icon: "textures/ui/market_items/diamond",
    description: "ดูโปรไฟล์ ยศ การแสดงผล และรางวัล",
    actions: [
      { label: "§fโปรไฟล์และยศ\n§7เลือกป้ายชื่อที่แสดง", icon: "textures/ui/market_items/armor_stand", route: openProfile },
      { label: "§fรางวัล\n§7ของขวัญและรางวัลสะสม", icon: "textures/ui/market_items/bookshelf", route: openRewards },
      { label: "§bSettings\n§7เปิด-ปิด scoreboard และตั้งค่า PTP", icon: "textures/ui/settings_glyph", route: openSettings },
    ],
  },
  {
    id: "BUNDLES",
    label: "Bundles",
    icon: "textures/ui/market_items/bundle",
    description: "แลกแพ็กเกจ NRC ด้วยคีย์จากทีมงาน",
    actions: [
      { label: "§dร้านแพ็กเกจ NRC\n§7แลกคีย์เป็นเครดิตในเกม", icon: "textures/ui/market_items/bundle", route: openNrcPackageStore },
      { label: "§fรางวัล\n§7ตรวจสอบของขวัญและสิทธิ์ที่มี", icon: "textures/ui/market_items/bookshelf", route: openRewards },
    ],
  },
  {
    id: "STORE",
    label: "Store",
    icon: "textures/ui/market_items/gold_ingot",
    description: "เปิดร้านหลักและบริการเศรษฐกิจทั้งหมด",
    actions: [
      { label: "§eเปิดร้านค้า\n§7ซื้อและขายไอเท็ม", icon: "textures/ui/market_items/gold_ingot", route: openMarket },
      { label: "§dร้านแพ็กเกจ NRC\n§7เติมเครดิตด้วยคีย์แพ็กเกจ", icon: "textures/ui/market_items/bundle", route: openNrcPackageStore },
    ],
  },
];

function categoryTabLabel(tab, activeId) {
  const isActive = tab.id === activeId;
  const color = isActive ? "§c" : "§f";
  const marker = isActive ? "§l▸ " : "§r";
  return `${color}${marker}${tab.label.toUpperCase()}\n§7${isActive ? "OPEN" : "SELECT"}`;
}

function categoryHeaderText(player, category, currentRank) {
  const balance = getScore(player, OBJ_MONEY, 0);
  const economyLine = category.id === "ECONOMY"
    ? `\n\n§aBalance: §f${balance} NRC\n§7Buy, sell, compare prices, and trade with players.`
    : `\n\n§7Current money: §a${balance} NRC`;
  return `§f${category.description}\n§7Rank: ${currentRank.color}${currentRank.label} §8• §7EXTREMESMP${economyLine}`;
}

function openCategoryMenu(player, categoryId = "TEAM") {
  ensurePlayer(player);
  const category = EXTREMESMP_MENU_CATEGORIES.find(item => item.id === categoryId) ?? EXTREMESMP_MENU_CATEGORIES[0];
  const currentRank = rankData(player);
  const form = new ActionFormData()
    .title(`§\uE890§l§fEXTREMESMP §8| §b${category.label.toUpperCase()}`)
    .body(categoryHeaderText(player, category, currentRank));

  // Keep six navigation entries and four fixed action slots so the custom UI
  // can render the reference layout without changing any route indices.
  for (const tab of EXTREMESMP_MENU_CATEGORIES) {
    form.button(categoryTabLabel(tab, category.id), tab.icon);
  }
  for (let index = 0; index < 4; index += 1) {
    const action = category.actions[index];
    form.button(action?.label ?? "", action?.icon ?? "");
  }
  form.button("§cBack to Main Menu", "textures/ui/arrow_left");

  const tabCount = EXTREMESMP_MENU_CATEGORIES.length;
  const backIndex = tabCount + 4; // 6 tabs + 4 fixed action slots = index 10
  showUiForPlayer(player.id, form, (res, current) => {
    if (res.canceled) return runForOnlinePlayer(current.id, openMenu, 1);
    const selection = Number(res.selection);
    if (selection < tabCount) {
      const next = EXTREMESMP_MENU_CATEGORIES[selection];
      return next ? runForOnlinePlayer(current.id, () => openCategoryMenu(current, next.id), 1) : openMenu(current);
    }
    if (selection === backIndex) return runForOnlinePlayer(current.id, openMenu, 1);
    const action = category.actions[selection - tabCount];
    if (!action?.route) return runForOnlinePlayer(current.id, () => openCategoryMenu(current, category.id), 1);
    try {
      return action.route(current);
    } catch (error) {
      reportRuntimeFailure(current, `category_${category.id}_${action.label}`, error, "เปิดหมวดหมู่ไม่สำเร็จ กำลังกลับหน้าหมวดหมู่");
      return runForOnlinePlayer(current.id, () => openCategoryMenu(current, category.id), 2);
    }
  }, openMenu);
}

function openMenu(player) {
  ensurePlayer(player);
  // /menu is an explicit user request. Clear only EXTREMESMP's stale lock;
  // showUiForPlayer will retry safely if another form is still visible.
  UI_PENDING.delete(String(player.id));
  const form = new ActionFormData()
    .title("§l§fEXTREMESMP §8| §bMAIN MENU")
    .body(`§bWelcome, ${player.name}\n§7Choose a category to continue.\n\n§fBalance: §a${getScore(player, OBJ_MONEY, 0)} NRC\n\n§cTEAM §8• §fTELEPORT §8• §fECONOMY §8• §fPROFILE §8• §fBUNDLES §8• §fSTORE\n\n§6SELECT A CATEGORY BELOW`);
  for (const category of EXTREMESMP_MENU_CATEGORIES) {
    form.button(`§f${category.label}\n§7${category.description}`, category.icon);
  }
  if (isOperator(player)) form.button("§fADMIN\n§7Operator panel", "textures/ui/market_items/beacon");
  const adminIndex = EXTREMESMP_MENU_CATEGORIES.length;
  showUiForPlayer(player.id, form, (res, current) => {
    if (res.canceled || res.selection === undefined) return;
    const selection = Number(res.selection);
    if (selection < EXTREMESMP_MENU_CATEGORIES.length) {
      const category = EXTREMESMP_MENU_CATEGORIES[selection];
      return category ? runForOnlinePlayer(current.id, () => openCategoryMenu(current, category.id), 1) : openMenu(current);
    }
    if (selection === adminIndex && isOperator(current)) return runForOnlinePlayer(current.id, openAdmin, 1);
    return openMenu(current);
  }, openMenu);
}

function packageLabel(pack) {
  const badge = pack.badge ? ` §6[${pack.badge}]` : "";
  return `§e${pack.price} บาท §8→ §f${pack.reward} NRC${badge}`;
}

function openDiscordInfo(player) {
  const form = new MessageFormData().title("§1EXTREMESMP §8| §bDiscord EXTREMESMP").body("§bช่องทาง Discord\n§fใช้สำหรับประกาศ ข่าวสาร แจ้งปัญหา และติดต่อทีมงาน\n\n§7ลิงก์ Discord ให้ขอจากแอดมินหรือดูจากประกาศเซิร์ฟเวอร์").button1("กลับ").button2("ปิด");
  showUiForPlayer(player.id, form, (_res, current) => runForOnlinePlayer(current.id, openNrcPackageStore, 1), openNrcPackageStore);
}

function redeemNrcPackageKey(player, pack, rawKey) {
  if (!pack) return runForOnlinePlayer(player.id, openNrcPackageStore, 1);
  if (!cooldown(player, "nrcPackage", 20)) return;
  const key = normalizePackageKey(rawKey);
  if (!key) return notify(player, "กรุณากรอกคีย์แพ็กเกจ", "note.bass");
  const state = packageKeyState();
  const available = state.available[pack.key] ?? [];
  const index = available.indexOf(key);
  if (index < 0) {
    const wasUsed = (state.used[pack.key] ?? []).includes(key);
    notify(player, wasUsed ? "คีย์นี้ถูกใช้งานไปแล้ว" : "คีย์ไม่ถูกต้องหรือไม่ตรงกับแพ็กเกจที่เลือก", "note.bass");
    logAudit("NRC_PACKAGE_KEY_REJECTED", player, { package: pack.key, key: maskPackageKey(key), reason: wasUsed ? "USED" : "INVALID" });
    return;
  }
  const before = getScore(player, OBJ_MONEY, 0);
  available.splice(index, 1);
  state.used[pack.key] = [...(state.used[pack.key] ?? []), key].slice(-NRC_PACKAGE_MAX_KEYS_PER_PACKAGE);
  try {
    setScore(player, OBJ_MONEY, before + pack.reward);
    savePackageKeyState(state);
    logAudit("NRC_PACKAGE_REDEEM", player, { package: pack.key, price: pack.price, reward: pack.reward, key: maskPackageKey(key), before, after: getScore(player, OBJ_MONEY, 0) });
    notify(player, `แลกแพ็กเกจสำเร็จ: §e+${pack.reward} NRC §7(มูลค่า ${pack.price} บาท)`, "random.levelup");
  } catch (error) {
    available.splice(index, 0, key);
    state.used[pack.key] = (state.used[pack.key] ?? []).filter(value => value !== key);
    try { savePackageKeyState(state); } catch {}
    try { setScore(player, OBJ_MONEY, before); } catch {}
    logAudit("NRC_PACKAGE_REDEEM_ROLLBACK", player, { package: pack.key, key: maskPackageKey(key), error: String(error) });
    notify(player, "แลกแพ็กเกจไม่สำเร็จ ระบบยังไม่ใช้คีย์ กรุณาลองใหม่", "note.bass");
  }
}

function openPackageRedeem(player, pack) {
  const form = new ModalFormData().title(`§0ซื้อเงิน NRC ${pack.price} บาท`).body(`${packageLabel(pack)}\n\n§7กรอกคีย์ที่ได้รับจากแอดมิน\n§8คีย์ใช้ได้ครั้งเดียวและต้องเลือกแพ็กเกจให้ตรงกับคีย์`).textField("คีย์แพ็กเกจ", "เช่น NRC-XXXX-XXXX", "");
  showUiForPlayer(player.id, form, (res, current) => {
    if (res.canceled) return runForOnlinePlayer(current.id, openNrcPackageStore, 1);
    runForOnlinePlayer(current.id, next => redeemNrcPackageKey(next, pack, res.formValues?.[0]), 0);
    runForOnlinePlayer(current.id, openNrcPackageStore, 2);
  }, openNrcPackageStore);
}

function openPackageCatalog(player) {
  const form = new ActionFormData().title("§1EXTREMESMP §8| §bแพ็กเกจเงิน NRC").body(`§eยอด NRC ปัจจุบัน: §f${getScore(player, OBJ_MONEY, 0)}\n§7เลือกแพ็กเกจ แล้วกรอกคีย์เพื่อรับเครดิต\n§8RC ในรายการหมายถึงเครดิต NRC ของเซิร์ฟเวอร์`);
  for (const pack of NRC_PACKAGES) form.button(packageLabel(pack), pack.icon);
  form.button("§cกลับ");
  showUiForPlayer(player.id, form, (res, current) => {
    if (res.canceled || res.selection === NRC_PACKAGES.length) return runForOnlinePlayer(current.id, openNrcPackageStore, 1);
    const pack = NRC_PACKAGES[Number(res.selection)];
    if (pack) return runForOnlinePlayer(current.id, next => openPackageRedeem(next, pack), 1);
    return runForOnlinePlayer(current.id, openNrcPackageStore, 1);
  }, openNrcPackageStore);
}

function openNrcBalanceInfo(player) {
  const form = new MessageFormData().title("§1EXTREMESMP §8| §bเงิน NRC").body(`§eNRC ของคุณ\n\n§fยอดปัจจุบัน: §a${getScore(player, OBJ_MONEY, 0)} NRC\n\n§7เครดิตจากแพ็กเกจจะเข้าบัญชีนี้ทันทีเมื่อคีย์ถูกต้องและยังไม่ถูกใช้`).button1("กลับร้านค้า").button2("ปิด");
  showUiForPlayer(player.id, form, (_res, current) => runForOnlinePlayer(current.id, openNrcPackageStore, 1), openNrcPackageStore);
}

function openNrcPackageStore(player) {
  const state = packageKeyState();
  const available = NRC_PACKAGES.reduce((sum, pack) => sum + (state.available[pack.key]?.length ?? 0), 0);
  const form = new ActionFormData().title("§1EXTREMESMP §8| §bร้านแพ็กเกจ NRC").body(`§eแลกคีย์เป็นเครดิต NRC ในเกม\n§fยอดปัจจุบัน: §a${getScore(player, OBJ_MONEY, 0)} NRC\n§7คีย์พร้อมใช้ในระบบ: ${available} ใบ`)
    .button("§6EXTREMESMP\n§8กลับเมนูหลัก", "textures/extremesmp/logo")
    .button("§bDiscord\n§8ข่าวสารและติดต่อทีมงาน", "textures/ui/market_items/armor_stand")
    .button("§eเงิน NRC\n§8ดูยอดเครดิตของคุณ", "textures/ui/market_items/emerald")
    .button("§dแพ็กเกจ\n§8เลือกแพ็กเกจและกรอกคีย์", "textures/ui/market_items/bundle")
    .button("§cกลับตลาดโลก");
  showUiForPlayer(player.id, form, (res, current) => {
    if (res.canceled || res.selection === 4) return runForOnlinePlayer(current.id, openMarket, 1);
    if (res.selection === 0) return runForOnlinePlayer(current.id, openMenu, 1);
    if (res.selection === 1) return runForOnlinePlayer(current.id, openDiscordInfo, 1);
    if (res.selection === 2) return runForOnlinePlayer(current.id, openNrcBalanceInfo, 1);
    if (res.selection === 3) return runForOnlinePlayer(current.id, openPackageCatalog, 1);
  }, openMarket);
}

function openMarket(player) {
  const form = new ActionFormData().title("§1EXTREMESMP §8| §bตลาด EXTREMESMP").body(`§bเลือกบริการตลาด\n§eเงิน NRC: §f${getScore(player, OBJ_MONEY, 0)}\n§7ซื้อ ขาย ดูราคาของที่ถือ หรือเปิดตลาดผู้เล่น`)
    .button("§eร้านแพ็กเกจ NRC\n§8แลกคีย์เป็นเครดิต", "textures/ui/market_items/emerald")
    .button(`§aเซิร์ฟเวอร์ขาย\n§8ซื้อของจากระบบ • ${SERVER_SELL_CATALOG.length} รายการ`, "textures/ui/market_items/gold_ingot")
    .button(`§cเซิร์ฟเวอร์รับซื้อ\n§8ขายของให้ระบบ • ${SERVER_BUY_CATALOG.length} รายการ`, "textures/ui/market_items/emerald")
    .button("§6ขายของในตัว\n§8ขายไอเท็มทั้งหมดที่ระบบรับซื้อ", "textures/ui/market_items/gold_ingot")
    .button("§bดูราคาของที่ถือ\n§8ดูราคาจากไอเท็มในมือ", "textures/ui/market_items/emerald")
    .button("§dตลาดผู้เล่น\n§8ซื้อและลงขายของผู้เล่น", "textures/ui/market_items/bundle")
    .button("§cกลับเมนูหลัก");
  showUiForPlayer(player.id, form, (res, current) => {
    if (res.canceled || res.selection === 6) return runForOnlinePlayer(current.id, openMenu, 1);
    if (res.selection === 0) return runForOnlinePlayer(current.id, openNrcPackageStore, 1);
    if (res.selection === 1) return runForOnlinePlayer(current.id, next => openMarketCategories(next, "SELL"), 1);
    if (res.selection === 2) return runForOnlinePlayer(current.id, next => openMarketCategories(next, "BUY"), 1);
    if (res.selection === 3) return runForOnlinePlayer(current.id, next => openInventorySell(next, openMarket), 1);
    if (res.selection === 4) return runForOnlinePlayer(current.id, next => openHeldPrice(next, openMarket), 1);
    if (res.selection === 5) return runForOnlinePlayer(current.id, openPlayerMarket, 1);
  }, openMenu);
}

function openMarketCategories(player, catalogSide) {
  const catalog = catalogSide === "SELL" ? SERVER_SELL_CATALOG : SERVER_BUY_CATALOG;
  const sideLabel = catalogSide === "SELL" ? "เซิร์ฟเวอร์ขาย" : "เซิร์ฟเวอร์รับซื้อ";
  const form = new ActionFormData().title(`§0${sideLabel} §8| หมวดสินค้า`).body(`§7${catalogSide === "SELL" ? "เซิร์ฟเวอร์ขายให้ผู้เล่น" : "เซิร์ฟเวอร์รับซื้อจากผู้เล่น"}\n§eเลือกหมวดเพื่อแก้ปัญหารายการยาวและหาไอเท็มง่ายขึ้น`);
  for (const category of MARKET_CATEGORIES) {
    const count = marketCategoryItems(catalog, category.key).length;
    form.button(`§f${category.label}\n§8${count} รายการ`, category.icon);
  }
  form.button("§cกลับตลาดโลก");
  showUiForPlayer(player.id, form, (res, current) => {
    if (res.canceled || res.selection === MARKET_CATEGORIES.length) return runForOnlinePlayer(current.id, openMarket, 1);
    const category = MARKET_CATEGORIES[Number(res.selection)];
    if (category) return runForOnlinePlayer(current.id, next => openServerCatalog(next, catalogSide, category.key, 0), 1);
    return runForOnlinePlayer(current.id, next => openMarketCategories(next, catalogSide), 1);
  }, openMarket);
}

function openServerCatalog(player, catalogSide, categoryKey = "ALL", page = 0) {
  const sourceCatalog = catalogSide === "SELL" ? SERVER_SELL_CATALOG : SERVER_BUY_CATALOG;
  const category = marketCategory(categoryKey);
  const catalog = marketCategoryItems(sourceCatalog, category.key);
  const pageSize = 24;
  const maxPage = Math.max(0, Math.ceil(catalog.length / pageSize) - 1);
  const safePage = Math.max(0, Math.min(maxPage, Number(page) || 0));
  const start = safePage * pageSize;
  const rows = catalog.slice(start, start + pageSize);
  const form = new ActionFormData().title(`§0${catalogSide === "SELL" ? "เซิร์ฟเวอร์ขาย" : "เซิร์ฟเวอร์รับซื้อ"} §8| ${category.label} ${safePage + 1}/${maxPage + 1}`).body(catalogSide === "SELL" ? `§aเซิร์ฟเวอร์ขายให้ผู้เล่น\n§dหมวด: ${category.label}\n§7มีสินค้า ${catalog.length} ชนิด • แสดง ${start + 1}-${start + rows.length}\n§8ซื้อแล้ว stock ของรายการนั้นลดลง ราคาปรับตามตลาด` : `§cเซิร์ฟเวอร์รับซื้อจากผู้เล่น\n§dหมวด: ${category.label}\n§7มีสินค้า ${catalog.length} ชนิด • แสดง ${start + 1}-${start + rows.length}\n§8ขายแล้ว quota รับซื้อของรายการนั้นลดลง ราคาปรับตามตลาด`);
  for (const item of rows) {
    const s = marketState(item);
    const price = catalogSide === "SELL" ? s.price : Math.max(1, Math.floor(s.price * (1 - MARKET_FEE)));
    const capacity = catalogSide === "SELL" ? s.stock : s.buyCapacity;
    form.button(`§f${item.label}\n§e${price} NRC / 1 ชิ้น\n§8คงเหลือ ${capacity}`, marketIcon(item));
  }
  if (safePage > 0) form.button("§bหน้าก่อน");
  if (safePage < maxPage) form.button("§bหน้าถัดไป");
  form.button("§bเปลี่ยนหมวด");
  form.button("§cกลับตลาดโลก");
  showUiForPlayer(player.id, form, (res, current) => {
    if (res.canceled) return runForOnlinePlayer(current.id, next => openMarketCategories(next, catalogSide), 1);
    const chosen = Number(res.selection ?? -1);
    if (chosen < rows.length) {
      const item = rows[chosen];
      if (item) return runForOnlinePlayer(current.id, next => openTrade(next, item, catalogSide === "SELL" ? "BUY" : "SELL", safePage, category.key), 1);
      return runForOnlinePlayer(current.id, next => openServerCatalog(next, catalogSide, category.key, safePage), 1);
    }
    let cursor = rows.length;
    if (safePage > 0 && chosen === cursor) return runForOnlinePlayer(current.id, next => openServerCatalog(next, catalogSide, category.key, safePage - 1), 1);
    if (safePage > 0) cursor++;
    if (safePage < maxPage && chosen === cursor) return runForOnlinePlayer(current.id, next => openServerCatalog(next, catalogSide, category.key, safePage + 1), 1);
    cursor += safePage < maxPage ? 1 : 0;
    if (chosen === cursor) return runForOnlinePlayer(current.id, next => openMarketCategories(next, catalogSide), 1);
    return runForOnlinePlayer(current.id, openMarket, 1);
  }, openMarket);
}

function openTrade(player, item, forcedSide = undefined, returnPage = 0, returnCategoryKey = "ALL") {
  const s = marketState(item);
  const options = forcedSide === "BUY" ? ["ซื้อจากเซิร์ฟเวอร์"] : forcedSide === "SELL" ? ["ขายให้เซิร์ฟเวอร์"] : ["ซื้อจากเซิร์ฟเวอร์", "ขายให้เซิร์ฟเวอร์"];
  const form = new ModalFormData().title(`§0${item.label}`).textField(`ราคา §a${forcedSide === "SELL" ? Math.max(1, Math.floor(s.price * (1 - MARKET_FEE))) : s.price} NRC§r\n1 รายการ = ไอเท็ม 1 ชนิด • จำนวนทำรายการเลือกได้`, "จำนวน", "1").dropdown("การทำรายการ", options, 0);
  showUiForPlayer(player.id, form, (res, current) => {
    if (res.canceled) return runForOnlinePlayer(current.id, next => openServerCatalog(next, forcedSide === "BUY" ? "SELL" : "BUY", returnCategoryKey, returnPage), 1);
    const amount = Math.floor(Number(res.formValues?.[0] ?? 0));
    const side = forcedSide ?? (Number(res.formValues?.[1] ?? 0) === 0 ? "BUY" : "SELL");
    const key = `${Math.floor(now() / 5000)}:${side}:${item.id}:${amount}`;
    const result = createTransaction(current, item, amount, side, key);
    if (!result.ok) notify(current, `§c${result.message}`, "note.bass");
    else notify(current, `§aสำเร็จ §f${side === "BUY" ? "ซื้อจากเซิร์ฟเวอร์" : "ขายให้เซิร์ฟเวอร์"} ${amount} ${item.label} §7รวม ${result.total} NRC`, "random.orb");
    runForOnlinePlayer(current.id, next => openServerCatalog(next, forcedSide === "BUY" ? "SELL" : "BUY", returnCategoryKey, returnPage), 2);
  }, openMarket);
}

function canClaimBetaTester(player) {
  return player.hasTag("extremesmp_betatester") || player.hasTag("betatester") || player.hasTag("extremesmp_beta");
}

function openRankCollection(player) {
  const owned = ensureRankState(player).slice().sort((a, b) => (RANKS[a]?.score ?? 0) - (RANKS[b]?.score ?? 0));
  const selected = rankKey(player);
  const form = new ActionFormData()
    .title("§1EXTREMESMP §8| §bเลือก / เลื่อนขั้น Rank")
    .body(`§fยศที่อยู่ในครอบครอง: §e${owned.length}\n§7เลือกได้เฉพาะ Rank ที่คุณได้รับแล้ว\n§aป้ายที่กำลังแสดง: ${rankButton(selected)}`);
  for (const key of owned) {
    const rank = RANKS[key];
    form.button(`${key === selected ? "§a✓ " : "§7"}${rank.color}${rank.label}\n§8${key === selected ? "กำลังแสดง" : "เลือกแสดงยศนี้"}`, rank.icon);
  }
  form.button("§cกลับโปรไฟล์", "textures/ui/market_items/diamond");
  showUiForPlayer(player.id, form, (res, current) => {
    if (res.canceled || res.selection === owned.length) return runForOnlinePlayer(current.id, openProfile, 1);
    const key = owned[Number(res.selection)];
    if (!key || !setSelectedRank(current, key)) return runForOnlinePlayer(current.id, openRankCollection, 1);
    notify(current, `เลือก ${RANKS[key].color}${RANKS[key].label}§f เป็นยศที่แสดงแล้ว`);
    logAudit("RANK_SELECTED", current, { rank: key, ownedCount: owned.length });
    runForOnlinePlayer(current.id, openRankCollection, 1);
  }, openProfile);
}

function openProfile(player) {
  const owned = ensureRankState(player);
  const r = rankData(player);
  const colors = ["§fขาว", "§aเขียว", "§bฟ้า", "§6ทอง", "§dม่วง"];
  const actions = [{ kind: "ranks" }];
  if (canClaimBetaTester(player) && !owned.includes("BETATESTER")) actions.push({ kind: "claimBeta" });
  actions.push({ kind: "color" }, { kind: "leaderboard" }, { kind: "history" }, { kind: "back" });
  const form = new ActionFormData()
    .title("§1EXTREMESMP §8| §bโปรไฟล์ EXTREMESMP")
    .body(`${rankBadge(player)}\n§f${player.name}\n§e${getScore(player, OBJ_MONEY, 0)} NRC\n§7Rank ในครอบครอง: §e${owned.length}\n§7เข้าร่วมเมื่อ ${new Date(Number(getProp(player, propKey("joinedAt", player), now()))).toLocaleDateString("th-TH")}`)
    .button(`§bจัดการ Rank\n§7เลือก / เลื่อนขั้น (${owned.length})`, r.icon);
  if (actions.some(action => action.kind === "claimBeta")) form.button("§bรับ BETATESTER\n§7เฉพาะผู้มีสิทธิ์", RANKS.BETATESTER.icon);
  form.button("§bเลือกสีแชท", "textures/ui/market_items/armor_stand")
    .button("§6อันดับเศรษฐีออนไลน์", "textures/ui/market_items/diamond")
    .button("§dประวัติการซื้อขาย", "textures/ui/market_items/emerald")
    .button("§cกลับ");
  showUiForPlayer(player.id, form, (res, current) => {
    if (res.canceled) return runForOnlinePlayer(current.id, openMenu, 1);
    const action = actions[Number(res.selection)];
    if (!action || action.kind === "back") return runForOnlinePlayer(current.id, openMenu, 1);
    if (action.kind === "ranks") return runForOnlinePlayer(current.id, openRankCollection, 1);
    if (action.kind === "claimBeta") {
      if (!canClaimBetaTester(current) || hasOwnedRank(current, "BETATESTER")) return runForOnlinePlayer(current.id, openProfile, 1);
      const nextOwned = ownedRankKeys(current);
      nextOwned.push("BETATESTER");
      setJson(current, propKey("ownedRanks", current), [...new Set(nextOwned)]);
      setSelectedRank(current, "BETATESTER");
      logAudit("BETA_RANK_CLAIMED", current, { rank: "BETATESTER" });
      notify(current, "ได้รับ Rank BETATESTER และตั้งเป็นยศที่แสดงแล้ว");
      return runForOnlinePlayer(current.id, openProfile, 1);
    }
    if (action.kind === "color") {
      const colorForm = new ModalFormData().title("สีแชท").dropdown("เลือกสี", colors, 0);
      return showUiForPlayer(current.id, colorForm, (x, latest) => {
        if (!x.canceled) {
          const map = ["§f", "§a", "§b", "§6", "§d"];
          latest.setDynamicProperty(propKey("chatColor", latest), map[Number(x.formValues?.[0] ?? 0)]);
          notify(latest, "บันทึกสีแชทแล้ว");
        }
        runForOnlinePlayer(latest.id, openProfile, 1);
      }, openProfile);
    }
    if (action.kind === "leaderboard") return runForOnlinePlayer(current.id, openLeaderboard, 1);
    if (action.kind === "history") return runForOnlinePlayer(current.id, openHistory, 1);
  }, openMenu);
}

function openHistory(player) {
  const history = safeArray(getJson(player, propKey("history", player), []));
  const body = history.length ? history.slice(0, 15).map(x => {
    const time = String(x?.t ?? "").slice(0, 16);
    const itemId = String(x?.item ?? "").split(":").pop() || "unknown";
    return `§7${time} §f${x?.side === "BUY" ? "ซื้อ" : "ขาย"} ${Number(x?.amount ?? 0)} §e${itemId} §7${Number(x?.total ?? 0)} NRC`;
  }).join("\n") : "ยังไม่มีรายการซื้อขาย";
  const form = new MessageFormData().title("§1EXTREMESMP §8| §bประวัติการซื้อขาย").body(body).button1("กลับ").button2("ปิด");
  showUiForPlayer(player.id, form, (_res, current) => runForOnlinePlayer(current.id, openProfile, 1), openProfile);
}

function openPrivateMessage(player) {
  if (player.hasTag("extremesmp_muted")) {
    notify(player, "คุณถูกปิดแชทส่วนตัวชั่วคราว", "note.bass");
    return runForOnlinePlayer(player.id, openMenu, 2);
  }
  const targets = onlinePlayersSnapshot().filter(x => x.id !== player.id);
  if (!targets.length) { notify(player, "ยังไม่มีผู้เล่นอื่นออนไลน์", "note.bass"); return runForOnlinePlayer(player.id, openMenu, 2); }
  const names = targets.map(x => x.name);
  const form = new ModalFormData().title("§1EXTREMESMP §8| §bแชทส่วนตัว").dropdown("ผู้รับ", names, 0).textField("ข้อความ", "พิมพ์ข้อความ", "สวัสดี");
  showUiForPlayer(player.id, form, (res, current) => {
    const playerId = current.id;
    if (res.canceled) return runForOnlinePlayer(playerId, openMenu, 2);
    if (current.hasTag("extremesmp_muted")) {
      notify(current, "คุณถูกปิดแชทส่วนตัวชั่วคราว", "note.bass");
      return runForOnlinePlayer(playerId, openMenu, 2);
    }
    const targetId = targets[Number(res.formValues?.[0] ?? 0)]?.id;
    const target = targetId ? findOnlinePlayerById(targetId) : undefined;
    const text = String(res.formValues?.[1] ?? "").trim().slice(0, 200);
    if (!target || !text) { notify(current, "ข้อมูลไม่ครบ", "note.bass"); return runForOnlinePlayer(playerId, openMenu, 2); }
    if (!cooldown(current, "msg", CHAT_COOLDOWN_TICKS)) { notify(current, "ส่งข้อความเร็วเกินไป", "note.bass"); return runForOnlinePlayer(playerId, openMenu, 2); }
    const color = getProp(current, propKey("chatColor", current), "§f");
    target.sendMessage(`§8[§dPM§8] ${color}${current.name} §f→ §bคุณ§f: ${text}`);
    current.sendMessage(`§8[§dPM§8] §bคุณ §f→ ${color}${target.name}§f: ${text}`);
    logAudit("PRIVATE_MESSAGE", current, { target: target.name, length: text.length });
    runForOnlinePlayer(playerId, openMenu, 2);
  }, openMenu);
}

function findOnlinePlayerById(id) {
  const key = String(id || "");
  if (!key) return undefined;
  try {
    const current = currentOnlinePlayer(key);
    if (current) {
      UI_LIVE_PLAYERS.set(key, current);
      return current;
    }
  } catch {}
  const cached = UI_LIVE_PLAYERS.get(key);
  try {
    if (cached?.id && String(cached.id) === key) return cached;
  } catch {}
  return undefined;
}

function runtimeErrorCode(prefix = "UI") {
  try {
    return `${prefix}_${Date.now().toString(36).slice(-6).toUpperCase()}`;
  } catch {
    return `${prefix}_UNKNOWN`;
  }
}

function reportRuntimeFailure(player, operation, error, userText = "เมนูทำงานไม่สำเร็จ") {
  const detail = String(error?.stack ?? error ?? "Unknown error");
  const op = String(operation || "anonymous").slice(0, 80);
  const code = runtimeErrorCode("CALLBACK");
  try { console.warn(`[EXTREMESMP] ${op} failed: ${detail}`); } catch {}
  try { logAudit("RUNTIME_CALLBACK_ERROR", player, { operation: op, code, message: detail.slice(0, 680) }); } catch {}
  try { player?.sendMessage?.(`§cEXTREMESMP: ${userText} §7[${code}]`); } catch {}
}

function reportUiFailure(player, operation, error, userText = "เปิดเมนูไม่สำเร็จ") {
  const detail = String(error?.stack ?? error ?? "Unknown error");
  const op = String(operation || "form_show").slice(0, 80);
  const code = runtimeErrorCode("FORM");
  try { console.warn(`[EXTREMESMP UI] ${op} failed: ${detail}`); } catch {}
  try { logAudit("UI_RUNTIME_ERROR", player, { operation: op, code, message: detail.slice(0, 680) }); } catch {}
  try { player?.sendMessage?.(`§cEXTREMESMP: ${userText} §7[${code}]`); } catch {}
}

function runForOnlinePlayer(playerId, callback, delayTicks = 0) {
  const id = String(playerId || "");
  if (!id || typeof callback !== "function") return;
  // Bedrock may still be closing the previous native form when the callback
  // fires. Keep the route on the game thread and add a short close-window gap
  // so every menu, including STORE, opens consistently instead of returning
  // a silent UserBusy cancellation.
  const requestedDelay = Math.max(0, Number(delayTicks) || 0);
  const safeDelay = requestedDelay + 2;
  system.runTimeout(() => {
    const current = findOnlinePlayerById(id);
    if (!current) return;
    UI_LIVE_PLAYERS.set(id, current);
    try {
      const returned = callback(current);
      if (returned && typeof returned.then === "function") {
        returned.catch(error => reportRuntimeFailure(current, callback.name || "anonymous", error));
      }
    } catch (error) {
      reportRuntimeFailure(current, callback.name || "anonymous", error);
    }
  }, safeDelay);
}
function isUiBusy(value) {
  const reason = String(value?.cancelationReason ?? value?.cancellationReason ?? value?.reason ?? value?.message ?? value ?? "");
  return /UserBusy|busy/i.test(reason);
}

function showUiForPlayer(playerId, form, onResult, fallback, attempt = 0) {
  const id = String(playerId || "");
  if (!id || !form || typeof form.show !== "function" || typeof onResult !== "function") return;
  const token = `${id}:${++UI_SEQUENCE}`;
  UI_PENDING.set(id, { token });
  system.runTimeout(() => {
    if (UI_PENDING.get(id)?.token !== token) return;
    const current = findOnlinePlayerById(id);
    if (!current) {
      UI_PENDING.delete(id);
      UI_LIVE_PLAYERS.delete(id);
      return;
    }
    UI_LIVE_PLAYERS.set(id, current);
    let pending;
    try {
      pending = form.show(current);
    } catch (error) {
      UI_PENDING.delete(id);
      if (isUiBusy(error) && attempt < 8) return showUiForPlayer(id, form, onResult, fallback, attempt + 1);
      if (attempt < 2) return showUiForPlayer(id, form, onResult, fallback, attempt + 1);
      reportUiFailure(current, "form_show", error, "เมนูผู้เล่นไม่พร้อมใช้งาน");
      if (typeof fallback === "function") runForOnlinePlayer(id, fallback, 2);
      return;
    }
    Promise.resolve(pending).then(result => {
      if (UI_PENDING.get(id)?.token !== token) return;
      UI_PENDING.delete(id);
      const live = findOnlinePlayerById(id) || UI_LIVE_PLAYERS.get(id);
      if (!live) return;
      UI_LIVE_PLAYERS.set(id, live);
      // Bedrock returns UserBusy as a canceled response when another form is
      // closing. Treat it as retryable instead of silently dropping /menu.
      if (result?.canceled && isUiBusy(result)) {
        if (attempt < 8) return showUiForPlayer(id, form, onResult, fallback, attempt + 1);
        try { live.sendMessage("§eเมนูยังมีหน้าต่างอื่นเปิดอยู่ กรุณาปิดหน้าต่างเดิมแล้วพิมพ์ /menu อีกครั้ง"); } catch {}
        return;
      }
      try {
        const returned = onResult(result, live);
        if (returned && typeof returned.then === "function") {
          returned.catch(error => {
            reportRuntimeFailure(live, onResult.name || "form_handler", error, "เมนูย่อยทำงานไม่สำเร็จ");
            if (typeof fallback === "function") runForOnlinePlayer(id, fallback, 2);
          });
        }
      } catch (error) {
        reportRuntimeFailure(live, onResult.name || "form_handler", error, "เมนูย่อยทำงานไม่สำเร็จ");
        if (typeof fallback === "function") runForOnlinePlayer(id, fallback, 2);
      }
    }).catch(error => {
      if (UI_PENDING.get(id)?.token !== token) return;
      UI_PENDING.delete(id);
      if (isUiBusy(error) && attempt < 8) return showUiForPlayer(id, form, onResult, fallback, attempt + 1);
      if (attempt < 2) return showUiForPlayer(id, form, onResult, fallback, attempt + 1);
      const live = findOnlinePlayerById(id) || current;
      reportUiFailure(live, "form_promise", error, "เมนูผู้เล่นไม่พร้อมใช้งาน");
      if (typeof fallback === "function") runForOnlinePlayer(id, fallback, 2);
    });
  }, 2);
}
function dimensionById(dimensionId) {
  try { return world.getDimension(dimensionId); } catch { return undefined; }
}

function openTeleportSettings(player) {
  const settings = teleportSettings(player);
  const form = new ModalFormData()
    .title("§1EXTREMESMP §8| §bPTP Settings")
    .toggle("รับคำขอเทเลพอร์ตอัตโนมัติ", settings.autoAccept)
    .toggle("ปฏิเสธคำขอเทเลพอร์ตอัตโนมัติ", settings.autoDecline)
    .toggle("เสียงแจ้งเตือน", settings.sound)
    .toggle("ข้อความบน actionbar", settings.actionbar)
    .toggle("ข้อความในแชท", settings.chat);
  showUiForPlayer(player.id, form, (res, current) => {
    const playerId = current.id;
    if (res.canceled) return runForOnlinePlayer(playerId, openFriends, 2);
    const next = saveTeleportSettings(current, {
      autoAccept: Boolean(res.formValues?.[0]),
      autoDecline: Boolean(res.formValues?.[1]),
      sound: Boolean(res.formValues?.[2]),
      actionbar: Boolean(res.formValues?.[3]),
      chat: Boolean(res.formValues?.[4]),
    });
    if (next.autoAccept && next.autoDecline) saveTeleportSettings(current, { ...next, autoDecline: false });
    teleportNotify(current, "บันทึก PTP Settings แล้ว", "random.orb");
    runForOnlinePlayer(playerId, openFriends, 2);
  }, openFriends);
}

function openFriends(player) {
  const others = onlinePlayersSnapshot().filter(target => target.id !== player.id);
  const incoming = [...TELEPORT_REQUESTS.values()].filter(request => request.targetId === player.id && request.expiresAt > now());
  const form = new ActionFormData().title("§1EXTREMESMP §8| §bผู้เล่นและ PTP").body("§bเลือกฟังก์ชันที่ต้องการ\n§7ส่งคำขอเทเลพอร์ต แชทส่วนตัว หรือสุ่มเทเลพอร์ต\n§8คูลดาวน์ PTP 20 วินาที • คำขอหมดอายุ 30 วินาที");
  form.button("§ePTP Settings", "textures/ui/market_items/armor_stand");
  form.button("§dแชทส่วนตัว", "textures/ui/market_items/armor_stand");
  form.button("§bเทเลพอร์ตไปหาผู้เล่น", "textures/ui/market_items/ender_pearl");
  form.button("§aสุ่มเทเลพอร์ต", "textures/ui/market_items/ender_eye");
  if (others.length) form.button(`§fผู้เล่นออนไลน์ ${others.length} คน`, "textures/ui/market_items/emerald_block");
  if (incoming.length) form.button(`§aคำขอเทเลพอร์ตที่รอ ${incoming.length} รายการ`, "textures/ui/market_items/ender_pearl");
  form.button("§cกลับ");
  showUiForPlayer(player.id, form, (res, current) => {
    const playerId = current.id;
    if (res.canceled) return runForOnlinePlayer(playerId, openMenu, 2);
    const onlineIndex = 4;
    const requestIndex = onlineIndex + (others.length ? 1 : 0);
    const backIndex = requestIndex + (incoming.length ? 1 : 0);
    if (res.selection === backIndex) return runForOnlinePlayer(playerId, openMenu, 2);
    if (res.selection === 0) return runForOnlinePlayer(playerId, openTeleportSettings, 2);
    if (res.selection === 1) return runForOnlinePlayer(playerId, openPrivateMessage, 2);
    if (res.selection === 2) return runForOnlinePlayer(playerId, openTeleportRequest, 2);
    if (res.selection === 3) return runForOnlinePlayer(playerId, random_tp, 1);
    if (others.length && res.selection === onlineIndex) return runForOnlinePlayer(playerId, openOnlinePlayers, 2);
    if (incoming.length && res.selection === requestIndex) return runForOnlinePlayer(playerId, showTeleportRequests, 2);
    return runForOnlinePlayer(playerId, openFriends, 2);
  }, openMenu);
}

function openOnlinePlayers(player) {
  const others = onlinePlayersSnapshot().filter(target => target.id !== player.id);
  const body = others.length ? others.map(target => `§f${target.name} §8| ${target.dimension?.id ?? "unknown"}`).join("\n") : "ไม่มีผู้เล่นอื่นออนไลน์";
  const form = new MessageFormData().title("§1EXTREMESMP §8| §bผู้เล่นออนไลน์").body(body).button1("กลับ Friends").button2("ปิด");
  showUiForPlayer(player.id, form, (_res, current) => runForOnlinePlayer(current.id, openFriends, 2), openFriends);
}

function scheduleTeleportReminder(requestId) {
  system.runTimeout(() => {
    const pending = TELEPORT_REQUESTS.get(requestId);
    if (!pending || pending.expiresAt <= now()) return;
    const target = findOnlinePlayerById(pending.targetId);
    if (target) {
      const remaining = Math.max(1, Math.ceil((pending.expiresAt - now()) / 1000));
      const settings = teleportSettings(target);
      if (settings.actionbar) {
        try { target.onScreenDisplay?.setActionBar?.(`§b[PTP] §fคำขอจาก ${pending.requesterName} §7เหลือ ${remaining} วิ §8/ptp:accept`); } catch {}
      }
      pending.lastReminderAt = now();
    }
    scheduleTeleportReminder(requestId);
  }, TELEPORT_REMINDER_TICKS);
}

function createTeleportRequest(player, target) {
  if (!player || !target || target.typeId !== "minecraft:player") return { ok: false, reason: "offline" };
  if (target.id === player.id) return { ok: false, reason: "self" };
  if (teleportBlocked(target, player)) return { ok: false, reason: "blocked" };
  if (findOutgoingTeleportRequest(player.id)) return { ok: false, reason: "sender_already_pending" };
  if (findIncomingTeleportRequest(target.id)) return { ok: false, reason: "target_already_pending" };
  if (!cooldown(player, "teleportRequest", TELEPORT_REQUEST_COOLDOWN_TICKS)) return { ok: false, reason: "cooldown" };

  const targetSettings = teleportSettings(target);
  if (targetSettings.autoDecline) {
    teleportNotify(player, `${target.name} ปฏิเสธคำขอเทเลพอร์ตอัตโนมัติ`, "note.bass");
    teleportNotify(target, `ปฏิเสธคำขอจาก ${player.name} อัตโนมัติ`, "note.bass");
    logAudit("TELEPORT_REQUEST_AUTO_DECLINED", player, { target: target.name });
    return { ok: true, auto: "declined" };
  }

  const requestId = `TP${now()}${Math.random().toString(36).slice(2, 7)}`;
  const request = {
    id: requestId,
    requesterId: player.id,
    targetId: target.id,
    requesterName: player.name,
    targetName: target.name,
    createdAt: now(),
    expiresAt: now() + TELEPORT_REQUEST_TIMEOUT_MS,
    lastReminderAt: now(),
  };
  TELEPORT_REQUESTS.set(requestId, request);
  teleportNotify(target, `${player.name} ขอเทเลพอร์ตไปหาคุณ — กดยอมรับภายใน 30 วินาที`, "note.bass");
  scheduleTeleportReminder(requestId);
  if (targetSettings.actionbar) {
    try { target.onScreenDisplay?.setActionBar?.(`§b[PTP] §fคำขอจาก ${player.name} §7/ptp:accept`); } catch {}
  }
  teleportNotify(player, `ส่งคำขอไปหา ${target.name} แล้ว รอการยินยอม 30 วินาที`, "random.orb");
  logAudit("TELEPORT_REQUEST", player, { requestId, target: target.name, expiresAt: request.expiresAt });

  if (targetSettings.autoAccept) system.runTimeout(() => acceptTeleportRequest(target, requestId), 1);
  system.runTimeout(() => {
    const pending = TELEPORT_REQUESTS.get(requestId);
    if (!pending || pending.expiresAt > now()) return;
    TELEPORT_REQUESTS.delete(requestId);
    cancelTeleportCountdown(requestId, "คำขอเทเลพอร์ตหมดเวลา");
    const requester = findOnlinePlayerById(pending.requesterId);
    const recipient = findOnlinePlayerById(pending.targetId);
    if (requester) teleportNotify(requester, `คำขอเทเลพอร์ตไปหา ${pending.targetName} หมดเวลา`, "note.bass");
    if (recipient) teleportNotify(recipient, `คำขอเทเลพอร์ตจาก ${pending.requesterName} หมดเวลา`, "note.bass");
    logAudit("TELEPORT_REQUEST_EXPIRED", requester ?? recipient, { requestId });
  }, TELEPORT_REQUEST_TIMEOUT_TICKS);
  return { ok: true, request };
}

function teleportResultMessage(player, target, result) {
  if (result.ok) return;
  const messages = {
    self: "ไม่สามารถขอเทเลพอร์ตหาตัวเองได้",
    blocked: `${target?.name ?? "ผู้เล่น"} บล็อกคำขอเทเลพอร์ตของคุณไว้`,
    sender_already_pending: "คุณมีคำขอเทเลพอร์ตขาออกที่รออยู่แล้ว",
    target_already_pending: "ผู้เล่นนี้มีคำขอเทเลพอร์ตที่รออยู่แล้ว",
    cooldown: "ส่งคำขอเร็วเกินไป กรุณารอ 20 วินาที",
    offline: "ไม่พบผู้เล่นปลายทางออนไลน์",
  };
  teleportNotify(player, messages[result.reason] ?? "ส่งคำขอเทเลพอร์ตไม่สำเร็จ", "note.bass");
}

function openTeleportRequest(player) {
  const targets = onlinePlayersSnapshot().filter(target => target.id !== player.id);
  if (!targets.length) { notify(player, "ยังไม่มีผู้เล่นอื่นออนไลน์", "note.bass"); return runForOnlinePlayer(player.id, openFriends, 2); }
  const names = targets.map(target => `${target.name} §8(${target.dimension?.id?.replace("minecraft:", "") ?? "unknown"})`);
  const form = new ModalFormData().title("§1EXTREMESMP §8| §bขอเทเลพอร์ต").dropdown("ผู้เล่นปลายทาง", names, 0);
  showUiForPlayer(player.id, form, (res, current) => {
    const playerId = current.id;
    if (res.canceled) return runForOnlinePlayer(playerId, openFriends, 2);
    const targetId = targets[Number(res.formValues?.[0] ?? 0)]?.id;
    const target = targetId ? findOnlinePlayerById(targetId) : undefined;
    if (!target) {
      notify(current, "ผู้เล่นปลายทางออกจากเกมแล้ว", "note.bass");
      return runForOnlinePlayer(playerId, openFriends, 2);
    }
    const result = createTeleportRequest(current, target);
    teleportResultMessage(current, target, result);
    runForOnlinePlayer(playerId, openFriends, 2);
  }, openFriends);
}

function currentTeleportRequest(player, requestId) {
  if (requestId) return TELEPORT_REQUESTS.get(String(requestId));
  return findIncomingTeleportRequest(player?.id);
}

function ptpBlockId(block) {
  return String(block?.typeId || "").toLowerCase();
}

function isPtpAir(block) {
  return Boolean(block?.isAir) || isSpawnAir(block);
}

function isPtpLiquid(block) {
  return Boolean(block?.isLiquid) || isSpawnLiquid(block);
}

function isPtpHazard(block) {
  const id = ptpBlockId(block);
  return /lava|fire|magma|powder_snow|cactus|campfire|soul_campfire|pointed_dripstone/.test(id);
}

function isPtpPassable(block) {
  return isPtpAir(block) || isPtpLiquid(block);
}

// PTP follows 0.mcpack's narrow exact-column safety check. Spawn safety rules
// such as cave-ceiling and 3-block hazard-radius rejection must not block a
// player who is standing safely inside a house or base.
function isPtpSafeColumn(dimension, location) {
  try {
    const x = Math.floor(Number(location?.x));
    const feetY = Math.floor(Number(location?.y));
    const z = Math.floor(Number(location?.z));
    if (![x, feetY, z].every(Number.isFinite)) return false;
    if (feetY < Number(dimension.heightRange?.min ?? -64) + 1) return false;
    const ground = getSpawnBlock(dimension, x, feetY - 1, z);
    const feet = getSpawnBlock(dimension, x, feetY, z);
    const head = getSpawnBlock(dimension, x, feetY + 1, z);
    if (!ground || !feet || !head) return false;
    if (isPtpHazard(ground) || isPtpHazard(feet) || isPtpHazard(head)) return false;
    if (!isPtpPassable(feet) || !isPtpPassable(head)) return false;
    if (isPtpLiquid(ground)) return false;
    return true;
  } catch {
    return false;
  }
}

function findPtpSafeLocation(dimension, anchorLocation) {
  if (!anchorLocation) return undefined;
  if (isPtpSafeColumn(dimension, anchorLocation)) return {
    x: Number(anchorLocation.x),
    y: Number(anchorLocation.y),
    z: Number(anchorLocation.z),
  };
  for (let dy = 1; dy <= TELEPORT_UNSAFE_SEARCH_RADIUS; dy++) {
    const up = { x: anchorLocation.x, y: anchorLocation.y + dy, z: anchorLocation.z };
    if (isPtpSafeColumn(dimension, up)) return up;
    const down = { x: anchorLocation.x, y: anchorLocation.y - dy, z: anchorLocation.z };
    if (isPtpSafeColumn(dimension, down)) return down;
  }
  return undefined;
}

function isAtPtpDestination(entity, dimension, destination) {
  try {
    if (!entity || !destination || entity.dimension?.id !== dimension?.id) return false;
    return sameLocation(entity.location, destination, 1.5);
  } catch {
    return false;
  }
}

function finishPtpTeleport(requester, target, request, dimension, destination, attemptNumber = 0) {
  const currentRequester = findOnlinePlayerById(requester?.id);
  const currentTarget = findOnlinePlayerById(target?.id);
  if (!currentRequester || !currentTarget) {
    if (currentRequester) teleportNotify(currentRequester, "เทเลพอร์ตถูกยกเลิกเพราะผู้เล่นออกจากเกม", "note.bass");
    return;
  }

  let rotation;
  try { rotation = currentRequester.getRotation?.(); } catch { rotation = undefined; }
  const options = {
    dimension,
    // The exact destination column was checked while the target was present.
    // Disable the engine's extra collision rejection so loaded chunks and
    // cross-dimension requests do not fail spuriously.
    checkForBlocks: false,
    keepVelocity: false,
    forceProvidedPositionOnDimensionChange: true,
  };
  if (rotation && Number.isFinite(Number(rotation.x)) && Number.isFinite(Number(rotation.y))) options.rotation = rotation;

  const alreadyThere = isAtPtpDestination(currentRequester, dimension, destination);
  const moved = alreadyThere || attemptEntityTeleport(currentRequester, destination, options);
  system.runTimeout(() => {
    const traveler = findOnlinePlayerById(requester.id);
    const anchor = findOnlinePlayerById(target.id);
    if (traveler && anchor && isAtPtpDestination(traveler, dimension, destination)) {
      teleportNotify(anchor, `ยินยอมให้ ${traveler.name} เทเลพอร์ตแล้ว`, "random.orb");
      teleportNotify(traveler, `เทเลพอร์ตไปหา ${anchor.name} สำเร็จ`, "random.orb");
      logAudit("TELEPORT_ACCEPTED", anchor, { requestId: request.id, requester: traveler.name, dimension: dimension.id });
      return;
    }
    if (attemptNumber < 3) {
      // Retry after the destination chunk has had time to load. This is the
      // important difference from the old one-shot direct teleport.
      return system.runTimeout(() => finishPtpTeleport(requester, target, request, dimension, destination, attemptNumber + 1), 4);
    }
    if (anchor) teleportNotify(anchor, "เทเลพอร์ตไม่สำเร็จ ระบบไม่สามารถโหลดพื้นที่ปลายทางได้", "note.bass");
    if (traveler) teleportNotify(traveler, "เทเลพอร์ตไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", "note.bass");
    logAudit("TELEPORT_FAILED", anchor ?? traveler, { requestId: request.id, requester: requester.name, moved });
  }, 2);
}

function finishAcceptedTeleport(player, requester, request) {
  let destination;
  let dimension;
  try {
    dimension = player.dimension;
    destination = findPtpSafeLocation(dimension, {
      x: player.location.x,
      y: player.location.y,
      z: player.location.z,
    });
  } catch {
    destination = undefined;
  }
  TELEPORT_REQUESTS.delete(request.id);
  if (!destination || !dimension) {
    teleportNotify(player, "เทเลพอร์ตไม่สำเร็จ จุดยืนของผู้เล่นปลายทางไม่ปลอดภัย", "note.bass");
    teleportNotify(requester, "เทเลพอร์ตไม่สำเร็จ กรุณาให้ผู้เล่นปลายทางยืนในพื้นที่โล่ง", "note.bass");
    logAudit("TELEPORT_FAILED", player, { requestId: request.id, requester: requester.name, reason: "unsafe_target_column" });
    return false;
  }
  finishPtpTeleport(requester, player, request, dimension, destination);
  return true;
}

function acceptTeleportRequest(player, requestId) {
  const request = currentTeleportRequest(player, requestId);
  if (!request) return { ok: false, reason: "no_request" };
  if (request.expiresAt <= now()) {
    TELEPORT_REQUESTS.delete(request.id);
    return { ok: false, reason: "expired" };
  }
  const requester = findOnlinePlayerById(request.requesterId);
  if (!requester) {
    TELEPORT_REQUESTS.delete(request.id);
    return { ok: false, reason: "requester_offline" };
  }
  const existing = TELEPORT_COUNTDOWNS.get(request.id);
  if (existing) return { ok: false, reason: "already_counting" };
  const countdown = {
    requesterId: requester.id,
    targetId: player.id,
    requesterStart: { ...requester.location },
    targetStart: { ...player.location },
    dimensionId: player.dimension.id,
  };
  TELEPORT_COUNTDOWNS.set(request.id, countdown);
  teleportNotify(player, `เริ่มนับถอยหลังเทเลพอร์ต ${requester.name} — 3 วินาที`, "random.orb");
  teleportNotify(requester, `คำขอได้รับการยินยอม กำลังเทเลพอร์ตใน 3 วินาที`, "random.orb");
  for (let second = 3; second >= 1; second--) {
    system.runTimeout(() => {
      const state = TELEPORT_COUNTDOWNS.get(request.id);
      const currentRequester = findOnlinePlayerById(request.requesterId);
      const currentTarget = findOnlinePlayerById(request.targetId);
      if (!state || !currentRequester || !currentTarget || currentTarget.dimension.id !== state.dimensionId || !sameLocation(currentRequester.location, state.requesterStart) || !sameLocation(currentTarget.location, state.targetStart)) {
        cancelTeleportCountdown(request.id, "เทเลพอร์ตถูกยกเลิกเพราะมีการเคลื่อนที่หรือผู้เล่นออกจากเกม");
        TELEPORT_REQUESTS.delete(request.id);
        return;
      }
      if (second > 0) {
        if (teleportSettings(currentRequester).actionbar) currentRequester.onScreenDisplay?.setActionBar?.(`§bPTP §f${second}...`);
        if (teleportSettings(currentTarget).actionbar) currentTarget.onScreenDisplay?.setActionBar?.(`§bPTP §f${second}...`);
      }
    }, (3 - second) * 20);
  }
  system.runTimeout(() => {
    const state = TELEPORT_COUNTDOWNS.get(request.id);
    const currentRequester = findOnlinePlayerById(request.requesterId);
    const currentTarget = findOnlinePlayerById(request.targetId);
    TELEPORT_COUNTDOWNS.delete(request.id);
    if (!state || !currentRequester || !currentTarget || currentTarget.dimension.id !== state.dimensionId || !sameLocation(currentRequester.location, state.requesterStart) || !sameLocation(currentTarget.location, state.targetStart)) {
      TELEPORT_REQUESTS.delete(request.id);
      if (currentRequester) teleportNotify(currentRequester, "เทเลพอร์ตถูกยกเลิกเพราะมีการเคลื่อนที่", "note.bass");
      if (currentTarget) teleportNotify(currentTarget, "เทเลพอร์ตถูกยกเลิกเพราะมีการเคลื่อนที่", "note.bass");
      return;
    }
    finishAcceptedTeleport(currentTarget, currentRequester, request);
  }, TELEPORT_COUNTDOWN_TICKS);
  return { ok: true };
}

function denyTeleportRequest(player, requestId) {
  const request = currentTeleportRequest(player, requestId);
  if (!request) return { ok: false, reason: "no_request" };
  TELEPORT_REQUESTS.delete(request.id);
  cancelTeleportCountdown(request.id, `${player.name} ปฏิเสธคำขอเทเลพอร์ต`);
  const requester = findOnlinePlayerById(request.requesterId);
  if (requester) teleportNotify(requester, `${player.name} ปฏิเสธคำขอเทเลพอร์ต`, "note.bass");
  teleportNotify(player, "ปฏิเสธคำขอเทเลพอร์ตแล้ว", "note.bass");
  logAudit("TELEPORT_REQUEST_DECLINED", player, { requestId: request.id, requester: request.requesterName });
  return { ok: true };
}

function cancelOutgoingTeleportRequest(player, requestId) {
  const request = requestId ? TELEPORT_REQUESTS.get(String(requestId)) : findOutgoingTeleportRequest(player?.id);
  if (!request || request.requesterId !== player.id) return { ok: false, reason: "no_request" };
  TELEPORT_REQUESTS.delete(request.id);
  cancelTeleportCountdown(request.id, "ผู้ขอยกเลิกคำขอเทเลพอร์ต");
  const target = findOnlinePlayerById(request.targetId);
  if (target) teleportNotify(target, `${player.name} ยกเลิกคำขอเทเลพอร์ต`, "note.bass");
  teleportNotify(player, "ยกเลิกคำขอเทเลพอร์ตแล้ว", "note.bass");
  logAudit("TELEPORT_REQUEST_CANCELLED", player, { requestId: request.id, target: request.targetName });
  return { ok: true };
}


function showTeleportRequests(player) {
  const pending = [...TELEPORT_REQUESTS.values()].filter(request => request.targetId === player.id && request.expiresAt > now());
  if (!pending.length) { teleportNotify(player, "ไม่มีคำขอเทเลพอร์ตที่รอการยินยอม", "note.bass"); return runForOnlinePlayer(player.id, openFriends, 2); }
  const form = new ActionFormData().title("§1EXTREMESMP §8| §bคำขอเทเลพอร์ต").body("§eคำขอจะหมดอายุภายใน 30 วินาที และมี countdown 3 วินาทีก่อนเทเลพอร์ต");
  for (const request of pending) form.button(`§aยินยอม ${request.requesterName}\n§8เหลือ ${Math.max(0, Math.ceil((request.expiresAt - now()) / 1000))} วิ`, "textures/ui/market_items/ender_pearl");
  form.button("§cปฏิเสธทั้งหมด");
  showUiForPlayer(player.id, form, (res, current) => {
    const playerId = current.id;
    if (res.canceled) return runForOnlinePlayer(playerId, openFriends, 2);
    const selected = Number(res.selection ?? -1);
    if (selected === pending.length) {
      for (const request of pending) denyTeleportRequest(current, request.id);
      return runForOnlinePlayer(playerId, openFriends, 2);
    }
    const request = pending[selected];
    if (!request) return runForOnlinePlayer(playerId, openFriends, 2);
    const result = acceptTeleportRequest(current, request.id);
    if (!result.ok) teleportNotify(current, result.reason === "requester_offline" ? "ผู้ขอออกจากเกมแล้ว" : result.reason === "expired" ? "คำขอนี้หมดเวลาแล้ว" : "ไม่สามารถยอมรับคำขอนี้ได้", "note.bass");
    runForOnlinePlayer(playerId, openFriends, 2);
  }, openFriends);
}

function randomInteger(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const SPAWN_SEARCH_DOWN = 96;
const SPAWN_SEARCH_RADIUS = TELEPORT_UNSAFE_SEARCH_RADIUS;
const SPAWN_LIQUID_RADIUS = 3;
const SPAWN_VERTICAL_CLEARANCE = 4;

function spawnBlockId(block) {
  return String(block?.typeId || "").toLowerCase();
}

function isSpawnAir(block) {
  const id = spawnBlockId(block);
  return id === "minecraft:air" || id === "minecraft:cave_air" || id === "minecraft:void_air";
}

function isSpawnPassable(block) {
  const id = spawnBlockId(block);
  return isSpawnAir(block) || /(?:short_grass|tall_grass|fern|large_fern|dead_bush|dandelion|poppy|blue_orchid|allium|azure_bluet|cornflower|oxeye_daisy|lily_of_the_valley|wither_rose|torchflower|pink_petals|seagrass)$/.test(id);
}

function isSpawnLiquid(block) {
  const id = spawnBlockId(block);
  return id === "minecraft:water" || id === "minecraft:flowing_water"
    || id === "minecraft:lava" || id === "minecraft:flowing_lava"
    || id === "minecraft:bubble_column" || id === "minecraft:powder_snow"
    || /(?:water|lava|bubble_column|powder_snow)$/.test(id);
}

function isUnsafeSpawnFloor(block) {
  const id = spawnBlockId(block);
  return /water|lava|bubble_column|powder_snow|fire|soul_fire|magma|cactus|sweet_berry_bush|kelp|seagrass|coral|lily_pad|ice|snow|leaves|vine|web|campfire|soul_campfire|pointed_dripstone/.test(id);
}

function isUnsafeSpawnNeighbour(block) {
  const id = spawnBlockId(block);
  return isSpawnLiquid(block) || /kelp|seagrass|coral|lily_pad|fire|soul_fire|magma|cactus|powder_snow|ice|campfire|soul_campfire/.test(id);
}

function getSpawnBlock(dimension, x, y, z) {
  try { return dimension.getBlock({ x, y, z }); } catch { return undefined; }
}

function hasLiquidOrHazardNearby(dimension, x, y, z) {
  for (let dx = -SPAWN_LIQUID_RADIUS; dx <= SPAWN_LIQUID_RADIUS; dx++) {
    for (let dz = -SPAWN_LIQUID_RADIUS; dz <= SPAWN_LIQUID_RADIUS; dz++) {
      for (let dy = -4; dy <= SPAWN_VERTICAL_CLEARANCE; dy++) {
        const block = getSpawnBlock(dimension, x + dx, y + dy, z + dz);
        // A block that cannot be read is not safe to stand beside. The caller
        // will retry after the chunk has been loaded instead of crashing the scan.
        if (!block || isUnsafeSpawnNeighbour(block)) return true;
      }
    }
  }
  return false;
}

function isNaturalCoverBlock(block) {
  const id = spawnBlockId(block);
  return /leaves|leaf|vine|azalea|mangrove_roots|bamboo|log|wood|stem|hyphae/.test(id);
}

function hasCaveCeilingNearby(dimension, x, y, z) {
  // getTopmostBlock also sees tree canopies. A canopy above an otherwise
  // valid surface is not a cave, while a stone/deepslate/netherrack roof is.
  const top = getSpawnTopmostBlock(dimension, x, z);
  if (!top) return true;
  if (isSpawnLiquid(top)) return true;
  if (isNaturalCoverBlock(top)) return false;
  const topY = Number(top.location?.y ?? top.y);
  if (!Number.isFinite(topY)) return true;
  return topY > y + SPAWN_VERTICAL_CLEARANCE;
}

function isSafeSpawnColumn(dimension, x, y, z) {
  const floor = getSpawnBlock(dimension, x, y, z);
  // The floor must be a real solid surface, not air, foliage, liquid or a
  // hazard. This prevents landing on grass, flowers, kelp and similar blocks.
  if (!floor || isSpawnAir(floor) || isSpawnPassable(floor) || isSpawnLiquid(floor) || isUnsafeSpawnFloor(floor)) return false;
  for (let dy = 1; dy <= SPAWN_VERTICAL_CLEARANCE; dy++) {
    const block = getSpawnBlock(dimension, x, y + dy, z);
    if (!block || !isSpawnPassable(block) || isSpawnLiquid(block)) return false;
  }
  if (hasCaveCeilingNearby(dimension, x, y, z)) return false;
  if (hasLiquidOrHazardNearby(dimension, x, y, z)) return false;
  return true;
}

function isVerifiedDryLanding(dimension, landing) {
  if (!landing) return false;
  const x = Math.floor(Number(landing.x));
  const y = Math.floor(Number(landing.y)) - 1;
  const z = Math.floor(Number(landing.z));
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return false;
  if (!isSafeSpawnColumn(dimension, x, y, z)) return false;
  for (let dy = 1; dy <= SPAWN_VERTICAL_CLEARANCE; dy++) {
    const block = getSpawnBlock(dimension, x, y + dy, z);
    if (!block || !isSpawnPassable(block) || isSpawnLiquid(block)) return false;
  }
  return true;
}

function isSpawnChunkLoaded(dimension, x, z) {
  try {
    if (typeof dimension?.isChunkLoaded !== "function") return true;
    return Boolean(dimension.isChunkLoaded({ x, y: 0, z }));
  } catch { return false; }
}

function getSpawnTopmostBlock(dimension, x, z) {
  try { return dimension.getTopmostBlock({ x, z }); } catch { return undefined; }
}

function findSafeLanding(dimension, anchor, options = {}) {
  const originX = Math.floor(Number(anchor?.x));
  const originZ = Math.floor(Number(anchor?.z));
  if (!Number.isFinite(originX) || !Number.isFinite(originZ)) return undefined;
  const dimensionMinY = Number(dimension.heightRange?.min ?? -64);
  const dimensionMaxY = Number(dimension.heightRange?.max ?? 319);
  const legacyY = Boolean(options?.legacyY);
  const minY = legacyY ? Math.max(dimensionMinY, RESPAWN_LEGACY_MIN_Y) : dimensionMinY;
  const maxY = legacyY ? Math.min(dimensionMaxY, RESPAWN_LEGACY_MAX_Y) : dimensionMaxY;
  if (minY > maxY) return undefined;
  // Search a small spiral instead of trusting one random column. Each column
  // is isolated so one unloaded/invalid block cannot abort the entire scan.
  const searchRadius = Number.isFinite(Number(options?.searchRadius)) ? Math.max(0, Math.floor(Number(options.searchRadius))) : SPAWN_SEARCH_RADIUS;
  for (let radius = 0; radius <= searchRadius; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (radius > 0 && Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
        const x = originX + dx;
        const z = originZ + dz;
        if (!isSpawnChunkLoaded(dimension, x, z)) continue;
        const top = getSpawnTopmostBlock(dimension, x, z);
        if (!top) continue;
        const topY = Number(top.location?.y ?? top.y);
        if (!Number.isFinite(topY)) continue;
        const firstY = Math.min(maxY - 2, topY);
        const lastY = Math.max(minY + 2, firstY - SPAWN_SEARCH_DOWN);
        for (let y = firstY; y >= lastY; y--) {
          try {
            const candidate = { x: x + 0.5, y: y + 1, z: z + 0.5 };
            if (isVerifiedDryLanding(dimension, candidate)) return candidate;
          } catch { /* skip only this column candidate */ }
        }
      }
    }
  }
  return undefined;
}

function findSafeStagingPosition(dimension, landing) {
  const x = Math.floor(Number(landing?.x));
  const z = Math.floor(Number(landing?.z));
  const feetY = Math.floor(Number(landing?.y));
  if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(feetY)) return undefined;
  for (let extra = 2; extra <= 12; extra++) {
    const stageY = feetY + extra;
    let clear = true;
    for (let y = feetY; y <= stageY + 1; y++) {
      const block = getSpawnBlock(dimension, x, y, z);
      if (!block || !isSpawnAir(block)) { clear = false; break; }
    }
    if (clear) return { x: landing.x, y: stageY, z: landing.z };
  }
  return undefined;
}

function rrespawnRandomCoord(range) {
  // Exact RRespawn1.8 behavior: Math.floor(Math.random() * (range * 2 + 1)) - range.
  return Math.floor(Math.random() * (range * 2 + 1)) - range;
}

function rrespawnSafeY() {
  // Exact RRespawn1.8 behavior: inclusive random Y from 80 through 320.
  return Math.floor(Math.random() * (RESPAWN_LEGACY_MAX_Y - RESPAWN_LEGACY_MIN_Y + 1)) + RESPAWN_LEGACY_MIN_Y;
}

function queueRRespawnWorldSpawn(deadPlayer) {
  if (rrespawnSpawnQueued) return;
  rrespawnSpawnQueued = true;
  system.run(() => {
    const x = rrespawnRandomCoord(RESPAWN_LEGACY_RANGE);
    const z = rrespawnRandomCoord(RESPAWN_LEGACY_RANGE);
    const y = rrespawnSafeY();
    const overworld = world.getDimension("overworld");
    overworld.runCommandAsync(`setworldspawn ${x} ${y} ${z}`)
      .catch(error => console.warn("RRespawn setworldspawn failed:", error))
      .finally(() => { rrespawnSpawnQueued = false; });
    if (deadPlayer) logAudit("RRESPAWN_WORLDSPAWN_QUEUED", deadPlayer, { x, y, z });
  });
}

function randomSpawnAnchorFromOrigin(origin) {
  // Compatibility helper for legacy EXTREMESMP callers. Actual death respawn
  // uses queueRRespawnWorldSpawn(), exactly like the supplied RRespawn1.8 file.
  void origin;
  return { x: rrespawnRandomCoord(RESPAWN_LEGACY_RANGE), z: rrespawnRandomCoord(RESPAWN_LEGACY_RANGE) };
}

function randomSpawnAnchor(player) {
  return randomSpawnAnchorFromOrigin(player?.location);
}

function findRecoveryLanding(dimension, anchor, options = {}) {
  const direct = findSafeLanding(dimension, anchor, options);
  if (direct) return direct;
  const rings = [8, 16, 24, 32, 48, 64];
  for (const radius of rings) {
    for (let index = 0; index < 16; index++) {
      const angle = (Math.PI * 2 * index) / 16;
      const candidate = findSafeLanding(dimension, {
        x: Math.floor(anchor.x + Math.cos(angle) * radius),
        z: Math.floor(anchor.z + Math.sin(angle) * radius),
      }, options);
      if (candidate) return candidate;
    }
  }
  return undefined;
}

function attemptEntityTeleport(entity, destination, options) {
  // Entity.teleport returns void; only exceptions indicate failure. Newer hosts
  // may expose tryTeleport(), which provides an explicit boolean result.
  try {
    if (typeof entity?.tryTeleport === "function") {
      return entity.tryTeleport(destination, options) === true;
    }
    entity.teleport(destination, options);
    return true;
  } catch {
    return false;
  }
}

function teleportWithLoadedChunk(player, destination, dimension, label = "เทเลพอร์ต") {
  const moved = attemptEntityTeleport(player, destination, { dimension, checkForBlocks: true, forceProvidedPositionOnDimensionChange: true });
  if (!moved) notify(player, `${label} ไม่สำเร็จ พื้นที่ปลายทางไม่พร้อมหรือมีบล็อกกีดขวาง`, "note.bass");
  return moved;
}

function queueChunkRetry(player, dimension, dimensionId, anchor, label, attempt, fallbackAnchor) {
  const maxY = Number(dimension.heightRange?.max ?? 319);
  const loaderY = Math.min(maxY - 8, Math.max(96, Number(player.location.y) + 16));
  const moved = attemptEntityTeleport(player, { x: anchor.x + 0.5, y: loaderY, z: anchor.z + 0.5 }, { dimension, checkForBlocks: false, forceProvidedPositionOnDimensionChange: true });
  if (!moved) {
    stopChunkLoadAnimation(player);
    notify(player, `${label} กำลังโหลดพื้นที่ใหม่ไม่สำเร็จ`, "note.bass");
    return;
  }
  startChunkLoadAnimation(player, CHUNK_LOAD_ANIMATION_DURATION_TICKS);
  system.runTimeout(() => completeChunkStagedTeleport(player.id, dimensionId, anchor, label, attempt, fallbackAnchor), 20);
}

function completeChunkStagedTeleport(playerId, dimensionId, anchor, label, attempt = 0, fallbackAnchor = anchor) {
  const player = findOnlinePlayerById(playerId);
  const dimension = dimensionById(dimensionId);
  if (!player || !dimension) return;
  const legacySpawnBounds = String(label).startsWith("จุดเกิด");
  let landing = findSafeLanding(dimension, anchor, { legacyY: legacySpawnBounds });
  // Re-check immediately before staging/final release in case water flowed in
  // after the first scan while the destination chunk was loading.
  if (landing && !isVerifiedDryLanding(dimension, landing)) landing = undefined;
  if (!landing) {
    if (attempt < 6) {
      const retryAnchor = String(label).startsWith("จุดเกิด")
        ? randomSpawnAnchorFromOrigin(fallbackAnchor)
        : { x: anchor.x + randomInteger(-48, 48), z: anchor.z + randomInteger(-48, 48) };
      queueChunkRetry(player, dimension, dimensionId, retryAnchor, label, attempt + 1, fallbackAnchor);
      return;
    }
    const emergency = findRecoveryLanding(dimension, fallbackAnchor, { legacyY: legacySpawnBounds });
    if (emergency && teleportWithLoadedChunk(player, emergency, dimension, `${label} fallback`)) {
      stopChunkLoadAnimation(player);
      notify(player, `${label} ใช้จุดสำรองที่ตรวจแล้วว่าไม่ใช่ทะเล`, "random.orb");
      logAudit("SAFE_SPAWN_FALLBACK", player, { label, dimension: dimensionId, x: emergency.x, y: emergency.y, z: emergency.z });
      return;
    }
    // Never release the player onto an unverified surface. Leaving the player
    // at the loader position is safer than sending them into water or lava.
    stopChunkLoadAnimation(player);
    notify(player, `${label} ยังไม่พบพื้นปลอดภัย จึงยังไม่ปล่อยลงพื้น`, "note.bass");
    logAudit("SAFE_SPAWN_BLOCKED", player, { label, dimension: dimensionId, reason: "no_verified_surface" });
    return;
  }
  const staging = findSafeStagingPosition(dimension, landing);
  if (!staging) {
    const moved = teleportWithLoadedChunk(player, landing, dimension, label);
    stopChunkLoadAnimation(player);
    if (moved) notify(player, `${label} สำเร็จ`, "random.orb");
    return;
  }
  if (!teleportWithLoadedChunk(player, staging, dimension, `${label} staging`)) {
    // Never leave the player floating at the loader position when staging is
    // blocked. Use the already verified landing as the safe fallback.
    const moved = teleportWithLoadedChunk(player, landing, dimension, label);
    stopChunkLoadAnimation(player);
    if (moved) notify(player, `${label} สำเร็จ`, "random.orb");
    return;
  }
  startChunkLoadAnimation(player, CHUNK_LOAD_ANIMATION_DURATION_TICKS);
  notify(player, `โหลดพื้นที่แล้ว กำลังลงสู่พื้นในอีกประมาณ 2 วินาที`, "random.orb");
  system.runTimeout(() => {
    const current = findOnlinePlayerById(playerId);
    if (!current) return;
    // Re-scan the exact column immediately before release. This handles water,
    // lava, falling blocks, or another player changing the destination while
    // the staging delay was running.
    const refreshed = findSafeLanding(dimension, { x: landing.x, z: landing.z }, { legacyY: legacySpawnBounds });
    const finalLanding = refreshed && isVerifiedDryLanding(dimension, refreshed) ? refreshed : undefined;
    if (!finalLanding) {
      stopChunkLoadAnimation(current);
      if (attempt < 6) {
        completeChunkStagedTeleport(playerId, dimensionId, anchor, label, attempt + 1, fallbackAnchor);
      } else {
        notify(current, `${label} ไม่ปลอดภัยแล้ว จึงยกเลิกการปล่อยลงพื้น`, "note.bass");
        logAudit("SAFE_SPAWN_BLOCKED", current, { label, dimension: dimensionId, reason: "landing_changed_before_release" });
      }
      return;
    }
    const moved = teleportWithLoadedChunk(current, finalLanding, dimension, label);
    stopChunkLoadAnimation(current);
    if (moved) {
      notify(current, `${label} สำเร็จ`, "random.levelup");
      logAudit("STAGED_TELEPORT_COMPLETE", current, { label, dimension: dimensionId, x: finalLanding.x, y: finalLanding.y, z: finalLanding.z });
    }
  }, RESPAWN_STAGE_TICKS);
}

function beginChunkStagedTeleport(player, dimensionId, anchor, label) {
  const dimension = dimensionById(dimensionId);
  if (!dimension) return notify(player, "โลกนี้ไม่พร้อมใช้งานบนเซิร์ฟเวอร์นี้", "note.bass");
  const fallbackAnchor = { x: Math.floor(player.location.x), z: Math.floor(player.location.z) };
  const maxY = Number(dimension.heightRange?.max ?? 319);
  const loaderY = Math.min(maxY - 8, Math.max(96, Number(player.location.y) + 32));
  const loader = { x: anchor.x + 0.5, y: loaderY, z: anchor.z + 0.5 };
  if (!attemptEntityTeleport(player, loader, { dimension, checkForBlocks: false, forceProvidedPositionOnDimensionChange: true })) {
    return notify(player, `${label} ไม่สำเร็จ ไม่สามารถโหลดพื้นที่ปลายทางได้`, "note.bass");
  }
  startChunkLoadAnimation(player, CHUNK_LOAD_ANIMATION_DURATION_TICKS);
  notify(player, `${label}: กำลังโหลด chunk ปลายทาง`, "random.orb");
  logAudit("STAGED_TELEPORT_BEGIN", player, { label, dimension: dimensionId, x: anchor.x, z: anchor.z });
  system.runTimeout(() => completeChunkStagedTeleport(player.id, dimensionId, anchor, label, 0, fallbackAnchor), RESPAWN_STAGE_TICKS);
}

function openWorldSelector(player) {
  const currentDimension = String(player.dimension?.id || "");
  const form = new ActionFormData().title("§1EXTREMESMP §8| §bเลือกโลก").body(`§bมี 3 โลกให้เลือก\n§7โลกปัจจุบัน: §f${currentDimension.replace("minecraft:", "")}`);
  for (const option of WORLD_OPTIONS) form.button(`§f${option.label}\n§8${option.description}`, option.icon);
  form.button("§eข้อมูลและกฎเซิร์ฟเวอร์", "textures/ui/market_items/bookshelf");
  form.button("§cกลับ");
  showUiForPlayer(player.id, form, (res, current) => {
    if (res.canceled || res.selection === WORLD_OPTIONS.length + 1) return runForOnlinePlayer(current.id, openMenu, 1);
    if (res.selection === WORLD_OPTIONS.length) return runForOnlinePlayer(current.id, openRules, 1);
    const option = WORLD_OPTIONS[Number(res.selection)];
    if (!option) return runForOnlinePlayer(current.id, openWorldSelector, 1);
    const liveDimension = String(current.dimension?.id || "");
    if (liveDimension === option.dimensionId) {
      notify(current, `คุณอยู่ใน${option.label}อยู่แล้ว`, "note.bass");
      return runForOnlinePlayer(current.id, openWorldSelector, 1);
    }
    beginChunkStagedTeleport(current, option.dimensionId, { x: 0, z: 0 }, `ไป${option.label}`);
  }, openMenu);
}

function beginRespawnStaging(player, reason) {
  // Compatibility entry point only. Death respawn is now driven by the
  // RRespawn1.8-style entityDie -> setworldspawn flow below.
  if (reason === "DEATH") queueRRespawnWorldSpawn(player);
}

function openLeaderboard(player) {
  const rows = onlinePlayersSnapshot().map(p => ({ name: p.name, money: getScore(p, OBJ_MONEY, 0) })).sort((a, b) => b.money - a.money).slice(0, 10);
  const body = rows.length ? rows.map((x, i) => `§e${i + 1}. §f${x.name} §7— §a${x.money} NRC`).join("\n") : "ยังไม่มีข้อมูล";
  const form = new MessageFormData().title("§1EXTREMESMP §8| §bอันดับเศรษฐีออนไลน์").body(body).button1("กลับ").button2("ปิด");
  showUiForPlayer(player.id, form, (_res, current) => runForOnlinePlayer(current.id, openProfile, 1), openProfile);
}

function openReport(player) {
  const targets = onlinePlayersSnapshot().filter(x => x.id !== player.id);
  if (!targets.length) { notify(player, "ยังไม่มีผู้เล่นให้รายงาน", "note.bass"); return runForOnlinePlayer(player.id, openMenu, 1); }
  const reasons = ["โกง", "หลอกลวง", "รบกวนแชท", "เนื้อหาไม่เหมาะสม", "อื่น ๆ"];
  const form = new ModalFormData().title("§1EXTREMESMP §8| §bรายงานผู้เล่น").dropdown("ผู้เล่น", targets.map(x => x.name), 0).dropdown("เหตุผล", reasons, 0).textField("รายละเอียด", "อธิบายสั้น ๆ", "");
  showUiForPlayer(player.id, form, (res, current) => {
    if (res.canceled) return runForOnlinePlayer(current.id, openMenu, 1);
    if (!cooldown(current, "report", REPORT_COOLDOWN_TICKS)) { notify(current, "ส่งรายงานเร็วเกินไป", "note.bass"); return runForOnlinePlayer(current.id, openMenu, 1); }
    const targetName = targets[Number(res.formValues?.[0] ?? 0)]?.name;
    const target = targetName ? onlinePlayersSnapshot().find(x => x.name === targetName) : undefined;
    const reason = reasons[Number(res.formValues?.[1] ?? 0)] ?? reasons[reasons.length - 1];
    const detail = String(res.formValues?.[2] ?? "").slice(0, 300);
    const id = logAudit("PLAYER_REPORT", current, { target: targetName ?? "unknown", reason, detail });
    notify(current, `ส่งรายงานแล้ว §7รหัส ${id}`, "random.orb");
    for (const staff of onlinePlayersSnapshot()) if (isStaff(staff, "HELPER")) staff.sendMessage(`§c[REPORT] §f${current.name} รายงาน ${targetName ?? "?"}: ${reason} §7(${id})`);
    runForOnlinePlayer(current.id, openMenu, 1);
  }, openMenu);
}

function openRules(player) {
  const form = new ActionFormData().title("§1EXTREMESMP §8| §bข้อมูล EXTREMESMP")
    .body("§eกฎหลัก\n§f1. ห้ามใช้โปรแกรมโกงหรือเจาะระบบ\n§f2. โลกในเกมเปิดให้แข่งขันและปล้นได้ตามธีมไร้กฎ\n§f3. ห้ามหลอกชำระเงิน เปิดเผยข้อมูลส่วนตัว หรือเนื้อหาผิดกฎหมาย\n§f4. แจ้งปัญหาผ่านเมนูรายงานและเก็บรหัสรายการไว้\n§f5. ราคาสินค้าและสิทธิ์การขายต้องอ่านได้ก่อนซื้อ\n\n§7ไม่ใช่ผลิตภัณฑ์ Minecraft อย่างเป็นทางการ และไม่เกี่ยวข้องกับ Mojang/Microsoft")
    .button("§aกฎการเล่น", "textures/ui/market_items/emerald_block")
    .button("§bนโยบายคืนเงิน", "textures/ui/market_items/experience_bottle")
    .button("§eประกาศ maintenance", "textures/ui/market_items/emerald")
    .button("§cกลับ");
  showUiForPlayer(player.id, form, (res, current) => {
    if (res.canceled || res.selection === 3) return runForOnlinePlayer(current.id, openMenu, 1);
    const bodies = [
      "โลกเปิดให้ PvP, raid, trade และทำลายสิ่งก่อสร้างได้ตามธีม แต่ห้ามโกง เจาะระบบ หรือใช้บัคเพื่อทำลาย economy",
      "การคืนเงินให้ติดต่อผู้ดูแลผ่านช่องทางที่ประกาศ พร้อมหลักฐาน order และ transaction ID ห้ามส่งรหัสผ่านหรือข้อมูลบัตรในแชท",
      "Maintenance จะแจ้งล่วงหน้าผ่านประกาศเซิร์ฟเวอร์และช่องทางชุมชน ควรออกจากเกมก่อนเวลาที่แจ้งเพื่อป้องกันข้อมูลค้าง"
    ];
    const infoForm = new MessageFormData().title("§1EXTREMESMP §8| §bข้อมูล").body(bodies[res.selection] ?? "").button1("กลับ").button2("ปิด");
    showUiForPlayer(current.id, infoForm, (_info, latest) => runForOnlinePlayer(latest.id, openRules, 1), openRules);
  }, openMenu);
}

function adminPackageKeys(player) {
  if (!requireAdminPanelOperator(player, openAdmin)) return;
  const state = packageKeyState();
  const body = NRC_PACKAGES.map(pack => `${packageLabel(pack)} §8| พร้อมใช้ ${state.available[pack.key].length} ใบ`).join("\n");
  const form = new ActionFormData().title("§1EXTREMESMP §8| §bจัดการคีย์แพ็กเกจ").body(`§7เลือกแพ็กเกจเพื่อเพิ่มคีย์\n§8คีย์จะใช้ได้ครั้งเดียวและระบบเก็บประวัติ audit\n\n${body}`);
  for (const pack of NRC_PACKAGES) form.button(`${packageLabel(pack)}\n§8เพิ่มคีย์`, pack.icon);
  form.button("§cกลับ Admin");
  showUiForPlayer(player.id, form, (res, current) => {
    if (res.canceled || res.selection === NRC_PACKAGES.length) return runForOnlinePlayer(current.id, openAdmin, 1);
    const pack = NRC_PACKAGES[Number(res.selection)];
    if (pack) return runForOnlinePlayer(current.id, next => adminAddPackageKey(next, pack), 1);
    return runForOnlinePlayer(current.id, openAdmin, 1);
  }, openAdmin);
}

function adminAddPackageKey(player, pack) {
  if (!requireAdminPanelOperator(player, openAdmin)) return;
  const state = packageKeyState();
  const form = new ModalFormData().title(`เพิ่มคีย์ ${pack.price} บาท`).body(`${packageLabel(pack)}\n§7กรอกคีย์ที่ได้รับจากผู้ให้บริการ\n§8ใส่ได้หลายคีย์โดยคั่นด้วยช่องว่างหรือขึ้นบรรทัดใหม่`).textField("คีย์แพ็กเกจ", "เช่น ABCD-1234", "");
  showUiForPlayer(player.id, form, (res, current) => {
    if (res.canceled) return runForOnlinePlayer(current.id, adminPackageKeys, 1);
    const keys = [...new Set(String(res.formValues?.[0] ?? "").split(/[\\s,]+/).map(normalizePackageKey).filter(Boolean))];
    if (!keys.length) { notify(current, "กรุณากรอกคีย์อย่างน้อย 1 ใบ", "note.bass"); return runForOnlinePlayer(current.id, adminPackageKeys, 1); }
    const available = state.available[pack.key];
    const used = state.used[pack.key];
    const accepted = [];
    const duplicate = [];
    for (const key of keys) {
      if (available.includes(key) || used.includes(key)) duplicate.push(key);
      else if (available.length + accepted.length < NRC_PACKAGE_MAX_KEYS_PER_PACKAGE) accepted.push(key);
    }
    if (!accepted.length) { notify(current, "คีย์ทั้งหมดซ้ำหรือแพ็กเกจเต็มแล้ว", "note.bass"); return runForOnlinePlayer(current.id, adminPackageKeys, 1); }
    const previousAvailable = [...available];
    state.available[pack.key] = [...available, ...accepted];
    try {
      savePackageKeyState(state);
    } catch (error) {
      state.available[pack.key] = previousAvailable;
      notify(current, "บันทึกคีย์ไม่สำเร็จ พื้นที่ข้อมูลแพ็กเกจอาจเต็ม", "note.bass");
      logAudit("ADMIN_PACKAGE_KEY_ADD_FAILED", current, { package: pack.key, count: accepted.length, error: String(error) });
      return runForOnlinePlayer(current.id, adminPackageKeys, 1);
    }
    logAudit("ADMIN_PACKAGE_KEY_ADD", current, { package: pack.key, count: accepted.length, duplicateCount: duplicate.length, keys: accepted.map(maskPackageKey) });
    notify(current, `เพิ่มคีย์ ${pack.price} บาทแล้ว ${accepted.length} ใบ${duplicate.length ? ` ข้ามคีย์ซ้ำ ${duplicate.length} ใบ` : ""}`, "random.orb");
    runForOnlinePlayer(current.id, adminPackageKeys, 1);
  }, openAdmin);
}

function openAdmin(player) {
  if (!requireAdminPanelOperator(player)) return;
  const form = new ActionFormData().title("§1EXTREMESMP §8| §bEXTREMESMP Admin Panel").body(`§fผู้ดูแล: ${player.name}\n§7ระดับ: ${rankData(player).label}\n§8Dashboard แยกงานเป็นระบบและทุกการเปลี่ยนแปลงบันทึก audit`)
    .button("§eDashboard ภาพรวม", "textures/ui/market_items/beacon")
    .button("§fAudit filter", "textures/ui/market_items/beacon")
    .button("§aรายงาน Economy", "textures/ui/market_items/emerald")
    .button("§bMonitor ตลาด", "textures/ui/market_items/gold_ingot")
    .button("§cMonitor Security", "textures/ui/market_items/bookshelf")
    .button("§aปรับเงินผู้เล่น", "textures/ui/market_items/emerald")
    .button("§cModeration", "textures/ui/market_items/bookshelf")
    .button("§bตั้ง Rank", "textures/ui/market_items/beacon")
    .button("§eจัดการคีย์แพ็กเกจ", "textures/ui/market_items/emerald")
    .button("§6Maintenance / ประกาศ", "textures/ui/market_items/beacon")
    .button("§cกลับ");
  showUiForPlayer(player.id, form, (res, current) => {
    if (res.canceled || res.selection === 10) return runForOnlinePlayer(current.id, openMenu, 1);
    if (res.selection === 0) return runForOnlinePlayer(current.id, adminDashboard, 1);
    if (res.selection === 1) return runForOnlinePlayer(current.id, adminAuditFilter, 1);
    if (res.selection === 2) return runForOnlinePlayer(current.id, adminEconomyReport, 1);
    if (res.selection === 3) return runForOnlinePlayer(current.id, adminMarketOverview, 1);
    if (res.selection === 4) return runForOnlinePlayer(current.id, adminSecurityOverview, 1);
    if (res.selection === 5) return runForOnlinePlayer(current.id, adminMoney, 1);
    if (res.selection === 6) return runForOnlinePlayer(current.id, adminModeration, 1);
    if (res.selection === 7) return runForOnlinePlayer(current.id, adminRank, 1);
    if (res.selection === 8) return runForOnlinePlayer(current.id, adminPackageKeys, 1);
    if (res.selection === 9) return runForOnlinePlayer(current.id, announceMaintenance, 1);
  }, openMenu);
}

function adminDashboard(player) {
  if (!requireAdminPanelOperator(player, openAdmin)) return;
  const players = onlinePlayersSnapshot();
  const totalMoney = players.reduce((sum, target) => sum + getScore(target, OBJ_MONEY, 0), 0);
  const flagged = players.map(target => ({ player: target, state: securityState(target) })).filter(x => Number(x.state.flags) > 0);
  const listings = activePlayerListings();
  const audits = safeArray(getJson(world, "extremesmp:audit", []));
  const reports = audits.filter(entry => String(entry?.type ?? "") === "PLAYER_REPORT").length;
  const maintenance = safeObject(getJson(world, "extremesmp:maintenance", {}));
  const leaders = players.slice().sort((a, b) => getScore(b, OBJ_MONEY, 0) - getScore(a, OBJ_MONEY, 0)).slice(0, 5);
  const topText = leaders.length ? leaders.map((target, index) => `§e${index + 1}. §f${target.name} §a${getScore(target, OBJ_MONEY, 0)} NRC`).join("\n") : "ยังไม่มีผู้เล่นออนไลน์";
  const body = [
    `§fผู้ดูแล: ${player.name} §8(${rankData(player).label})`,
    `§bออนไลน์: §f${players.length} §8| §aเงินรวม: §f${totalMoney} NRC`,
    `§dPlayer listings: §f${listings.length} §8| §cรายงานใน audit: §f${reports}`,
    `§cSecurity flags ออนไลน์: §f${flagged.length} §8| §6audit ทั้งหมด: §f${audits.length}`,
    `§6Maintenance: §f${maintenance?.enabled ? "เปิด" : "ปิด"}`,
    `\n§eTop NRC ออนไลน์\n${topText}`,
  ].join("\n");
  const form = new ActionFormData().title("§1EXTREMESMP §8| §bAdmin Dashboard").body(body)
    .button("§aรายงาน Economy", "textures/ui/market_items/emerald")
    .button("§bMonitor ตลาด", "textures/ui/market_items/gold_ingot")
    .button("§cMonitor Security", "textures/ui/market_items/bookshelf")
    .button("§fAudit filter", "textures/ui/market_items/beacon")
    .button("§cกลับ Admin");
  showUiForPlayer(player.id, form, (res, current) => {
    if (res.canceled || res.selection === 4) return runForOnlinePlayer(current.id, openAdmin, 1);
    if (res.selection === 0) return runForOnlinePlayer(current.id, adminEconomyReport, 1);
    if (res.selection === 1) return runForOnlinePlayer(current.id, adminMarketOverview, 1);
    if (res.selection === 2) return runForOnlinePlayer(current.id, adminSecurityOverview, 1);
    if (res.selection === 3) return runForOnlinePlayer(current.id, adminAuditFilter, 1);
    return runForOnlinePlayer(current.id, openAdmin, 1);
  }, openAdmin);
}

function adminEconomyReport(player) {
  if (!requireAdminPanelOperator(player, openAdmin)) return;
  const players = onlinePlayersSnapshot();
  const rows = players.slice().sort((a, b) => getScore(b, OBJ_MONEY, 0) - getScore(a, OBJ_MONEY, 0)).slice(0, 12);
  const total = players.reduce((sum, target) => sum + getScore(target, OBJ_MONEY, 0), 0);
  const average = players.length ? Math.floor(total / players.length) : 0;
  const body = `§aผู้เล่นออนไลน์: §f${players.length}\n§eเงินรวม: §f${total} NRC\n§bค่าเฉลี่ย: §f${average} NRC\n\n${rows.map((target, index) => `§e${index + 1}. §f${target.name} §a${getScore(target, OBJ_MONEY, 0)} NRC §8${rankData(target).label}`).join("\n") || "ยังไม่มีข้อมูล"}`;
  const form = new MessageFormData().title("§1EXTREMESMP §8| §bEconomy Report").body(body).button1("ปรับเงิน").button2("กลับ Admin");
  showUiForPlayer(player.id, form, (res, current) => res.selection === 0 ? runForOnlinePlayer(current.id, adminMoney, 1) : runForOnlinePlayer(current.id, openAdmin, 1), openAdmin);
}

function adminMarketOverview(player) {
  if (!requireAdminPanelOperator(player, openAdmin)) return;
  const listings = activePlayerListings();
  const popular = [...POPULAR_MARKET_IDS].map(id => marketItem(id)).filter(Boolean).slice(0, 12);
  const body = [
    `§bPlayer Market active: §f${listings.length} รายการ`,
    `§7ระบบ escrow/payout ทำงานกับรายการที่มี remaining > 0`,
    "",
    "§eMarket snapshot ของยอดฮิต",
    popular.map(item => { const state = marketState(item); return `§f${item.label} §8| §e${state.price} NRC §7stock ${state.stock} §8buy ${state.buyCapacity}`; }).join("\n") || "ไม่มีรายการยอดฮิต",
  ].join("\n");
  const form = new MessageFormData().title("§1EXTREMESMP §8| §bMarket Monitor").body(body).button1("กลับ Admin").button2("ปิด");
  showUiForPlayer(player.id, form, (_res, current) => runForOnlinePlayer(current.id, openAdmin, 1), openAdmin);
}

function adminSecurityOverview(player) {
  if (!requireAdminPanelOperator(player, openAdmin)) return;
  const rows = onlinePlayersSnapshot().map(target => {
    const state = securityState(target);
    return `§f${target.name} §8| flags §c${Number(state.flags || 0)} §7actions ${state.actions.length} §eores ${state.ores.length} ${now() < Number(state.throttleUntil || 0) ? "§6THROTTLED" : "§aOK"}`;
  });
  const recent = safeArray(getJson(world, "extremesmp:audit", [])).filter(entry => String(entry?.type ?? "").startsWith("SECURITY_")).slice(0, 8);
  const body = `§cผู้เล่นและสถานะ security\n${rows.join("\n") || "ไม่มีผู้เล่นออนไลน์"}\n\n§eSecurity audit ล่าสุด\n${recent.map(entry => `§7${String(entry.t).slice(11, 19)} §f${entry.type} §8${entry.actor}`).join("\n") || "ยังไม่มี security audit"}`;
  const form = new ActionFormData().title("§1EXTREMESMP §8| §bSecurity Monitor").body(body)
    .button("§aล้างธง/ปลด throttle", "textures/ui/market_items/beacon")
    .button("§fดู security audit", "textures/ui/market_items/bookshelf")
    .button("§cกลับ Admin");
  showUiForPlayer(player.id, form, (res, current) => {
    if (res.canceled || res.selection === 2) return runForOnlinePlayer(current.id, openAdmin, 1);
    if (res.selection === 0) return runForOnlinePlayer(current.id, adminSecurityReset, 1);
    const securityAudit = safeArray(getJson(world, "extremesmp:audit", [])).filter(entry => String(entry?.type ?? "").startsWith("SECURITY_")).slice(0, 20);
    return runForOnlinePlayer(current.id, next => showAudit(next, securityAudit, "Security Audit"), 1);
  }, openAdmin);
}

function adminSecurityReset(player) {
  if (!requireAdminPanelOperator(player, openAdmin)) return;
  const targets = world.getPlayers();
  if (!targets.length) return notify(player, "ไม่มีผู้เล่นออนไลน์", "note.bass");
  const form = new ModalFormData().title("จัดการ Security state").dropdown("ผู้เล่น", targets.map(target => target.name), 0).dropdown("การทำงาน", ["ล้าง flags", "ปลด throttle", "ล้างทั้งคู่"], 2);
  showUiForPlayer(player.id, form, (res, current) => {
    if (res.canceled) return runForOnlinePlayer(current.id, adminSecurityOverview, 1);
    const targetId = targets[Number(res.formValues?.[0] ?? 0)]?.id;
    const target = targetId ? findOnlinePlayerById(targetId) : undefined;
    const action = Number(res.formValues?.[1] ?? 2);
    if (!target) return runForOnlinePlayer(current.id, adminSecurityOverview, 1);
    const state = securityState(target);
    if (action === 0 || action === 2) state.flags = 0;
    if (action === 1 || action === 2) state.throttleUntil = 0;
    saveSecurityState(target, state);
    logAudit("ADMIN_SECURITY_RESET", current, { target: target.name, action });
    notify(current, `ปรับ Security state ของ ${target.name} แล้ว`);
    runForOnlinePlayer(current.id, adminSecurityOverview, 1);
  }, openAdmin);
}

function adminAuditFilter(player) {
  if (!requireAdminPanelOperator(player, openAdmin)) return;
  const scopes = ["ทั้งหมด", "SECURITY", "ECONOMY", "MARKET", "MODERATION", "REPORT", "MAINTENANCE"];
  const form = new ModalFormData().title("Audit Filter").dropdown("หมวด", scopes, 0).textField("ค้นหา actor/type", "เว้นว่างเพื่อดูทั้งหมด", "");
  showUiForPlayer(player.id, form, (res, current) => {
    if (res.canceled) return runForOnlinePlayer(current.id, openAdmin, 1);
    const scope = scopes[Number(res.formValues?.[0] ?? 0)];
    const query = String(res.formValues?.[1] ?? "").trim().toLowerCase();
    const all = safeArray(getJson(world, "extremesmp:audit", []));
    const filtered = all.filter(entry => {
      if (!entry || typeof entry !== "object") return false;
      const type = String(entry.type || "");
      const scopeOk = scope === "ทั้งหมด" || (scope === "SECURITY" && type.startsWith("SECURITY_")) || (scope === "ECONOMY" && /MONEY|TXN|PAYOUT|GIFT/.test(type)) || (scope === "MARKET" && /MARKET|PLAYER_LISTING/.test(type)) || (scope === "MODERATION" && /WARN|MUTE|BAN|TEMPBAN|KICK/.test(type)) || (scope === "REPORT" && type === "PLAYER_REPORT") || (scope === "MAINTENANCE" && type.includes("MAINTENANCE"));
      const queryOk = !query || `${entry.actor ?? ""} ${type} ${JSON.stringify(entry.payload ?? {})}`.toLowerCase().includes(query);
      return scopeOk && queryOk;
    }).slice(0, 30);
    runForOnlinePlayer(current.id, next => showAudit(next, filtered, `Audit ${scope}`), 1);
  }, openAdmin);
}

function showAudit(player, entries = undefined, title = "Audit Log") {
  const list = safeArray(Array.isArray(entries) ? entries : getJson(world, "extremesmp:audit", []));
  const body = list.slice(0, 30).map(x => `§7${String(x?.t ?? "").slice(0, 19)} §f${String(x?.type ?? "UNKNOWN")} §8${String(x?.actor ?? "SYSTEM")}\n§8${JSON.stringify(x?.payload ?? {}).slice(0, 140)}`).join("\n") || "ยังไม่มี audit log";
  const form = new MessageFormData().title(`§0${title}`).body(body).button1("กลับ Admin").button2("ปิด");
  showUiForPlayer(player.id, form, (_res, current) => runForOnlinePlayer(current.id, openAdmin, 1), openAdmin);
}

function adminMoney(player) {
  if (!requireAdminPanelOperator(player, openAdmin)) return;
  const targets = world.getPlayers();
  if (!targets.length) { notify(player, "ไม่มีผู้เล่นออนไลน์", "note.bass"); return runForOnlinePlayer(player.id, openAdmin, 1); }
  const form = new ModalFormData().title("จัดการเงิน").dropdown("ผู้เล่น", targets.map(x => x.name), 0).textField("จำนวนที่จะเพิ่ม/ลด", "เช่น 100 หรือ -100", "0").textField("เหตุผล", "เหตุผลบังคับ", "แก้ไขโดยทีมงาน");
  showUiForPlayer(player.id, form, (res, current) => {
    if (res.canceled) return runForOnlinePlayer(current.id, openAdmin, 1);
    const targetId = targets[Number(res.formValues?.[0] ?? 0)]?.id;
    const target = targetId ? findOnlinePlayerById(targetId) : undefined;
    const delta = Math.floor(Number(res.formValues?.[1] ?? 0));
    const reason = String(res.formValues?.[2] ?? "").slice(0, 120);
    if (!target || !delta || !reason) { notify(current, "ข้อมูลไม่ครบหรือจำนวนเป็นศูนย์", "note.bass"); return runForOnlinePlayer(current.id, openAdmin, 1); }
    const before = getScore(target, OBJ_MONEY, 0);
    setScore(target, OBJ_MONEY, before + delta);
    logAudit("ADMIN_MONEY", current, { target: target.name, before, delta, after: getScore(target, OBJ_MONEY, 0), reason });
    notify(current, `ปรับยอด ${target.name} เรียบร้อย`);
    notify(target, `ยอดเงินถูกปรับโดยทีมงาน: §e${delta} NRC §7(${reason})`);
    runForOnlinePlayer(current.id, openAdmin, 1);
  }, openAdmin);
}

function adminModeration(player) {
  if (!requireAdminPanelOperator(player, openAdmin)) return;
  const targets = onlinePlayersSnapshot().filter(x => x.id !== player.id);
  if (!targets.length) { notify(player, "ไม่มีผู้เล่นอื่นออนไลน์", "note.bass"); return runForOnlinePlayer(player.id, openAdmin, 1); }
  const actions = ["เตือน", "mute แชท", "ยกเลิก mute", "เตะออก", "แบนชั่วคราว", "ยกเลิกแบนชั่วคราว", "แบนถาวร", "ยกเลิกแบนถาวร"];
  const form = new ModalFormData().title("Moderation").dropdown("ผู้เล่น", targets.map(x => x.name), 0).dropdown("การทำงาน", actions, 0).textField("เหตุผล", "เหตุผล", "ดำเนินการโดยทีมงาน");
  showUiForPlayer(player.id, form, (res, current) => {
    if (res.canceled) return runForOnlinePlayer(current.id, openAdmin, 1);
    const targetId = targets[Number(res.formValues?.[0] ?? 0)]?.id;
    const target = targetId ? findOnlinePlayerById(targetId) : undefined;
    const action = Number(res.formValues?.[1] ?? 0);
    const reason = String(res.formValues?.[2] ?? "ดำเนินการโดยทีมงาน").slice(0, 120);
    if (!target) return runForOnlinePlayer(current.id, openAdmin, 1);
    const actionName = ["WARN", "MUTE", "UNMUTE", "KICK", "TEMPBAN", "UNTEMPBAN", "BAN", "UNBAN"][action];
    if (actionName === "MUTE") target.addTag("extremesmp_muted");
    if (actionName === "UNMUTE") target.removeTag("extremesmp_muted");
    if (actionName === "TEMPBAN") { target.addTag("extremesmp_tempban"); target.setDynamicProperty("extremesmp:tempbanUntil", now() + 60 * 60 * 1000); }
    if (actionName === "UNTEMPBAN") { target.removeTag("extremesmp_tempban"); target.setDynamicProperty("extremesmp:tempbanUntil", 0); }
    if (actionName === "BAN") target.addTag("extremesmp_banned");
    if (actionName === "UNBAN") target.removeTag("extremesmp_banned");
    logAudit(actionName, current, { target: target.name, reason });
    if (actionName !== "UNMUTE" && actionName !== "UNTEMPBAN" && actionName !== "UNBAN") notify(target, actionName === "WARN" ? `คำเตือนจากทีมงาน: ${reason}` : `ทีมงานดำเนินการ ${actionName}: ${reason}`, "note.bass");
    if (actionName === "KICK" || actionName === "TEMPBAN" || actionName === "BAN") {
      runForOnlinePlayer(target.id, next => next.runCommandAsync(`kick @s ${actionName === "BAN" ? "ถูกแบนถาวร" : actionName === "TEMPBAN" ? "ถูกแบนชั่วคราว" : "ถูกเตะออกโดยทีมงาน"}`).catch(() => {}));
    }
    notify(current, `ดำเนินการ ${actionName} กับ ${target.name} แล้ว`);
    runForOnlinePlayer(current.id, openAdmin, 1);
  }, openAdmin);
}

function adminRank(player) {
  if (!requireAdminPanelOperator(player, openAdmin)) return;
  const targets = onlinePlayersSnapshot().filter(target => target.id !== player.id);
  const actorScore = player.hasTag("extremesmp_owner")
    ? RANKS.OWNER.score
    : Math.max(highestOwnedRankData(player).score, player.hasTag("extremesmp_admin") ? RANKS.ADMIN.score : 0);
  const keys = Object.keys(RANKS).filter(key => RANKS[key].score < actorScore);
  if (!targets.length) return notify(player, "ยังไม่มีผู้เล่นอื่นให้ตั้ง Rank", "note.bass");
  if (!keys.length) return notify(player, "ไม่มี Rank ที่ต่ำกว่าสิทธิ์ของคุณให้มอบ", "note.bass");
  const defaultRankIndex = Math.max(0, keys.indexOf(rankKey(player)));
  const form = new ModalFormData().title("ตั้ง Rank")
    .dropdown("ผู้เล่น", targets.map(x => x.name), 0)
    .dropdown("Rank ที่มอบได้", keys.map(x => rankButton(x)), defaultRankIndex);
  showUiForPlayer(player.id, form, (res, current) => {
    if (res.canceled) return runForOnlinePlayer(current.id, openAdmin, 1);
    const targetId = targets[Number(res.formValues?.[0] ?? 0)]?.id;
    const target = targetId ? findOnlinePlayerById(targetId) : undefined;
    const key = keys[Number(res.formValues?.[1] ?? 0)];
    if (!target || !RANKS[key]) return runForOnlinePlayer(current.id, openAdmin, 1);
    if (target.id === current.id || RANKS[key].score >= actorScore) {
      notify(current, "ตั้ง Rank ไม่สำเร็จ: มอบได้เฉพาะผู้เล่นอื่นและ Rank ที่ต่ำกว่าสิทธิ์ของคุณ", "note.bass");
      return runForOnlinePlayer(current.id, openAdmin, 1);
    }
    ensureRankState(target);
    const owned = ownedRankKeys(target);
    if (!owned.includes(key)) owned.push(key);
    setJson(target, propKey("ownedRanks", target), owned);
    setSelectedRank(target, key);
    logAudit("ADMIN_RANK", current, { target: target.name, rank: key, actorScore, ownedCount: owned.length });
    notify(target, `ได้รับ Rank ${rankButton(key)} แล้ว และตั้งเป็นยศที่แสดงอยู่`);
    notify(current, `ตั้ง Rank ${target.name} สำเร็จ`);
    runForOnlinePlayer(current.id, openAdmin, 1);
  }, openAdmin);
}

function announceMaintenance(player) {
  if (!requireAdminPanelOperator(player, openAdmin)) return;
  const form = new ModalFormData().title("ประกาศ Maintenance").textField("ข้อความ", "เช่น ปิดปรับปรุงเวลา 04:00 น.", "").dropdown("สถานะ", ["ประกาศอย่างเดียว", "เปิด Maintenance", "ปิด Maintenance"], 0);
  showUiForPlayer(player.id, form, (res, current) => {
    if (res.canceled) return runForOnlinePlayer(current.id, openAdmin, 1);
    const text = String(res.formValues?.[0] ?? "").trim().slice(0, 240);
    const mode = Number(res.formValues?.[1] ?? 0);
    if (!text) return runForOnlinePlayer(current.id, openAdmin, 1);
    const previous = {
      enabled: false,
      text: "",
      updatedAt: 0,
      updatedBy: "",
      ...safeObject(getJson(world, "extremesmp:maintenance", {})),
    };
    const enabled = mode === 1 ? true : mode === 2 ? false : Boolean(previous.enabled);
    const state = { enabled, text, updatedAt: now(), updatedBy: current.name };
    setJson(world, "extremesmp:maintenance", state);
    const prefix = enabled ? "§c[MAINTENANCE EXTREMESMP]" : "§6[ประกาศ EXTREMESMP]";
    for (const p of onlinePlayersSnapshot()) p.sendMessage(`${prefix} §f${text}`);
    logAudit("MAINTENANCE_ANNOUNCEMENT", current, { text, enabled, mode });
    notify(current, `บันทึก Maintenance แล้ว: ${enabled ? "เปิด" : "ปิด/ประกาศอย่างเดียว"}`);
    runForOnlinePlayer(current.id, openAdmin, 1);
  }, openAdmin);
}

function handleChat(event) {
  const player = event.sender;
  if (!player?.id) return;
  if (event.cancel) return;
  if (!INITIALIZED_PLAYERS.has(String(player.id))) ensurePlayer(player);
  const raw = String(event.message ?? "").trim();
  runForOnlinePlayer(player.id, markSecurityChat);
  const lower = raw.toLowerCase();
  if (["/menu", "!menu", "menu"].includes(lower)) { event.cancel = true; runForOnlinePlayer(player.id, openMenu); return; }
  if (["/money", "!money"].includes(lower)) { event.cancel = true; runForOnlinePlayer(player.id, current => notify(current, `ยอดเงินของคุณคือ §e${getScore(current, OBJ_MONEY, 0)} NRC`)); return; }
  if (["/admin", "!admin"].includes(lower)) { event.cancel = true; runForOnlinePlayer(player.id, openAdmin); return; }
  if (lower.startsWith("/msg ") || lower.startsWith("!msg ")) {
    event.cancel = true;
    if (player.hasTag("extremesmp_muted")) { notify(player, "คุณถูกปิดแชทส่วนตัวชั่วคราว", "note.bass"); return; }
    const parts = raw.split(" ");
    const name = parts[1];
    const text = parts.slice(2).join(" ").slice(0, 200);
    const target = onlinePlayersSnapshot().find(p => p.name.toLowerCase() === String(name).toLowerCase());
    if (!target || !text) return notify(player, "ใช้ /msg ชื่อผู้เล่น ข้อความ", "note.bass");
    if (!cooldown(player, "msg", CHAT_COOLDOWN_TICKS)) return notify(player, "ส่งข้อความเร็วเกินไป", "note.bass");
    target.sendMessage(`§8[§dPM§8] §f${player.name} §7→ §fคุณ§r: ${text}`);
    player.sendMessage(`§8[§dPM§8] §fคุณ §7→ ${target.name}§r: ${text}`);
    logAudit("PRIVATE_MESSAGE", player, { target: target.name, length: text.length });
    return;
  }
  if (player.hasTag("extremesmp_muted")) { event.cancel = true; notify(player, "คุณถูกปิดแชทสาธารณะชั่วคราว", "note.bass"); return; }
  if (raw.length > 300) { event.cancel = true; notify(player, "ข้อความยาวเกินกำหนด", "note.bass"); return; }
  const color = getProp(player, propKey("chatColor", player), "§f");
  event.cancel = true;
  for (const p of onlinePlayersSnapshot()) p.sendMessage(`${chatRankBadge(player)} §f${color}${player.name}§7: §f${raw}`);
}

world.afterEvents.entityDie?.subscribe(({ deadEntity }) => {
  if (!deadEntity || deadEntity.typeId !== "minecraft:player") return;
  // RRespawn1.8 sets a new global Overworld spawn once per death event.
  queueRRespawnWorldSpawn(deadEntity);
});

system.runInterval(() => {
  for (const player of onlinePlayersSnapshot()) {
    try {
      noRespawnPointEnabled(player);
      ensureRankState(player);
      applyRankNameTag(player);
    } catch (error) {
      try { console.warn(`[EXTREMESMP] player state refresh failed for ${player.name}: ${String(error?.stack ?? error)}`); } catch {}
    }
  }
}, 100);

// Bedrock does not expose a universal after-event for operator permission
// changes. Polling once per second keeps /op and login behavior synchronized
// without moving the heavier player-state refresh onto every tick.
system.runInterval(() => {
  for (const player of onlinePlayersSnapshot()) {
    try {
      if (syncOperatorOwnerRank(player)) applyRankNameTag(player);
    } catch (error) {
      try { console.warn(`[EXTREMESMP] OP-owner poll failed for ${player.name}: ${String(error?.stack ?? error)}`); } catch {}
    }
  }
}, OP_OWNER_SYNC_TICKS);

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  ensurePlayer(player);
  syncOperatorOwnerRank(player);
  const tempbanUntil = Number(getProp(player, "extremesmp:tempbanUntil", 0));
  if (player.hasTag("extremesmp_tempban") && tempbanUntil > now()) {
    notify(player, "บัญชีนี้ถูกแบนชั่วคราวจากเซิร์ฟเวอร์", "note.bass");
    runForOnlinePlayer(player.id, current => current.runCommandAsync("kick @s §cถูกแบนชั่วคราว").catch(() => {}), 2);
    return;
  }
  if (player.hasTag("extremesmp_banned")) {
    notify(player, "บัญชีนี้ถูกแบนจากเซิร์ฟเวอร์", "note.bass");
    runForOnlinePlayer(player.id, current => current.runCommandAsync("kick @s §cบัญชีถูกแบน").catch(() => {}), 2);
    return;
  }
  if (initialSpawn) runForOnlinePlayer(player.id, markSecuritySession);
  if (!initialSpawn) {
    // Exact RRespawn1.8 post-respawn protection; entityDie already set the
    // world spawn, so no second EXTREMESMP random landing teleport is issued.
    try {
      player.runCommandAsync("effect @s blindness 1 10 true").catch(() => {});
      player.runCommandAsync("effect @s resistance 8 10 true").catch(() => {});
    } catch { /* player may be between dimensions */ }
  }
  if (initialSpawn && !getProp(player, propKey("welcomed", player), false)) {
    player.setDynamicProperty(propKey("welcomed", player), true);
    notify(player, "ยินดีต้อนรับสู่ EXTREMESMP! พิมพ์ §e/menu §fเพื่อเปิดเมนู");
    runForOnlinePlayer(player.id, openMenu, 20);
  }
});

world.beforeEvents.playerLeave?.subscribe(({ player }) => {
  if (!player?.id) return;
  try {
    flushSecurityState(player);
    if (player.hasTag("reconfig")) player.removeTag("reconfig");
  } catch { /* player may be leaving */ }
  for (const [requestId, countdown] of TELEPORT_COUNTDOWNS) {
    if (countdown.requesterId === player.id || countdown.targetId === player.id) cancelTeleportCountdown(requestId, "เทเลพอร์ตถูกยกเลิกเพราะผู้เล่นออกจากเกม");
  }
});

world.afterEvents.playerLeave?.subscribe(({ playerId }) => {
  if (!playerId) return;
  const id = String(playerId);
  CHUNK_LOAD_ANIMATION.delete(id);
  ONLINE_PLAYERS_BY_ID.delete(id);
  INITIALIZED_PLAYERS.delete(id);
  UI_PENDING.delete(id);
  if (ONLINE_PLAYERS_TICK === Number(system.currentTick ?? 0)) ONLINE_PLAYERS_TICK = -1;
  RANK_TAG_SIGNATURES.delete(id);
  NO_RESPAWN_PLAYERS.delete(id);
  SECURITY_RUNTIME.delete(id);
  for (const [requestId, request] of TELEPORT_REQUESTS) {
    if (request.requesterId === playerId || request.targetId === playerId) TELEPORT_REQUESTS.delete(requestId);
  }
  for (const [requestId, countdown] of TELEPORT_COUNTDOWNS) {
    if (countdown.requesterId === playerId || countdown.targetId === playerId) TELEPORT_COUNTDOWNS.delete(requestId);
  }
});

world.beforeEvents.chatSend.subscribe(handleChat);

// Detection hooks are optional-safe for minor API differences across Bedrock
// server builds. A single signal never bans a player; suspicious activity is
// recorded and only temporarily throttled after a threshold is reached.
world.beforeEvents.playerBreakBlock?.subscribe((event) => {
  const player = event.player;
  const block = event.block;
  if (!player || !block) return;
  if (securityIsThrottled(player)) { event.cancel = true; return; }
  const blockId = String(block.typeId || "unknown");
  runForOnlinePlayer(player.id, current => recordSecurityAction(current, "break", { blockId }));
});

world.beforeEvents.itemUse?.subscribe((event) => {
  const player = event.source;
  if (!player || player.typeId !== "minecraft:player") return;
  if (securityIsThrottled(player)) { event.cancel = true; return; }
  const itemId = String(event.itemStack?.typeId || "unknown");
  if (itemId === RESPAWN_CONFIG_ITEM || itemId === RRESPAWN_LEGACY_CONFIG_ITEM) {
    event.cancel = true;
    runForOnlinePlayer(player.id, openRespawnConfig, 1);
    return;
  }
  runForOnlinePlayer(player.id, current => recordSecurityAction(current, "use", { itemId }));
});

function registerCustomCommands() {
  try {
    const registry = system.beforeEvents.startup;
    registry.subscribe((init) => {
      const commandRegistry = init.customCommandRegistry;
      if (!commandRegistry) return;
      // Bedrock exposes /menu as the unnamespaced chat alias for extremesmp:menu.
      // Keep the explicit namespaced form for command blocks and integrations.
      commandRegistry.registerCommand({
        name: "extremesmp:menu",
        description: "เปิดเมนูหลัก EXTREMESMP",
        permissionLevel: CommandPermissionLevel.Any,
      }, (origin) => {
        const player = origin.sourceEntity;
        if (!player || player.typeId !== "minecraft:player") return { status: CustomCommandStatus.Failure, message: "คำสั่งนี้ใช้ได้ในเกมเท่านั้น" };
        runForOnlinePlayer(player.id, openMenu);
        return { status: CustomCommandStatus.Success };
      });

      commandRegistry.registerCommand({
        name: "extremesmp:admin",
        description: "เปิด Admin Panel สำหรับ OP เท่านั้น",
        permissionLevel: CommandPermissionLevel.Admin,
      }, (origin) => {
        const player = origin.sourceEntity;
        if (!player || player.typeId !== "minecraft:player") return { status: CustomCommandStatus.Failure, message: "คำสั่งนี้ใช้ได้โดยผู้เล่นเท่านั้น" };
        if (!isOperator(player)) return { status: CustomCommandStatus.Failure, message: "Admin Panel เปิดได้เฉพาะผู้เล่นที่มี OP เท่านั้น" };
        runForOnlinePlayer(player.id, openAdmin, 1);
        return { status: CustomCommandStatus.Success };
      });

      // Compatibility command set from the supplied 0.mcpack (PTP).
      commandRegistry.registerCommand({
        name: "ptp:ptp",
        description: "เปิดเมนู Player Teleport",
        permissionLevel: CommandPermissionLevel.Any,
        cheatsRequired: false,
      }, (origin) => {
        const player = origin.sourceEntity;
        if (!player || player.typeId !== "minecraft:player") return { status: CustomCommandStatus.Failure };
        runForOnlinePlayer(player.id, openFriends, 1);
        return { status: CustomCommandStatus.Success };
      });
      commandRegistry.registerCommand({
        name: "ptp:send",
        description: "ส่งคำขอเทเลพอร์ตไปหาผู้เล่น",
        permissionLevel: CommandPermissionLevel.Any,
        cheatsRequired: false,
        mandatoryParameters: [{ name: "target", type: CustomCommandParamType.PlayerSelector }],
      }, (origin, target) => {
        const player = origin.sourceEntity;
        if (!player || player.typeId !== "minecraft:player") return { status: CustomCommandStatus.Failure };
        runForOnlinePlayer(player.id, current => {
          const destination = normalizeCommandTarget(target);
          const result = createTeleportRequest(current, destination);
          teleportResultMessage(current, destination, result);
        }, 1);
        return { status: CustomCommandStatus.Success };
      });
      commandRegistry.registerCommand({
        name: "ptp:accept",
        description: "ยอมรับคำขอเทเลพอร์ตที่เข้ามา",
        permissionLevel: CommandPermissionLevel.Any,
        cheatsRequired: false,
      }, (origin) => {
        const player = origin.sourceEntity;
        if (!player || player.typeId !== "minecraft:player") return { status: CustomCommandStatus.Failure };
        runForOnlinePlayer(player.id, current => {
          const result = acceptTeleportRequest(current);
          if (!result.ok) teleportNotify(current, result.reason === "no_request" ? "ไม่มีคำขอเทเลพอร์ตที่รออยู่" : "ไม่สามารถยอมรับคำขอนี้ได้", "note.bass");
        }, 1);
        return { status: CustomCommandStatus.Success };
      });
      commandRegistry.registerCommand({
        name: "ptp:deny",
        description: "ปฏิเสธคำขอเทเลพอร์ตที่เข้ามา",
        permissionLevel: CommandPermissionLevel.Any,
        cheatsRequired: false,
      }, (origin) => {
        const player = origin.sourceEntity;
        if (!player || player.typeId !== "minecraft:player") return { status: CustomCommandStatus.Failure };
        runForOnlinePlayer(player.id, current => {
          const result = denyTeleportRequest(current);
          if (!result.ok) teleportNotify(current, "ไม่มีคำขอเทเลพอร์ตที่รออยู่", "note.bass");
        }, 1);
        return { status: CustomCommandStatus.Success };
      });
      commandRegistry.registerCommand({
        name: "ptp:cancel",
        description: "ยกเลิกคำขอเทเลพอร์ตขาออกของตนเอง",
        permissionLevel: CommandPermissionLevel.Any,
        cheatsRequired: false,
      }, (origin) => {
        const player = origin.sourceEntity;
        if (!player || player.typeId !== "minecraft:player") return { status: CustomCommandStatus.Failure };
        runForOnlinePlayer(player.id, current => {
          const result = cancelOutgoingTeleportRequest(current);
          if (!result.ok) teleportNotify(current, "ไม่มีคำขอเทเลพอร์ตขาออกที่รอยกเลิก", "note.bass");
        }, 1);
        return { status: CustomCommandStatus.Success };
      });
      commandRegistry.registerCommand({
        name: "ptp:requests",
        description: "เปิดรายการคำขอเทเลพอร์ตที่รออยู่",
        permissionLevel: CommandPermissionLevel.Any,
        cheatsRequired: false,
      }, (origin) => {
        const player = origin.sourceEntity;
        if (!player || player.typeId !== "minecraft:player") return { status: CustomCommandStatus.Failure };
        runForOnlinePlayer(player.id, showTeleportRequests, 1);
        return { status: CustomCommandStatus.Success };
      });
      commandRegistry.registerCommand({
        name: "ptp:block",
        description: "บล็อกผู้เล่นไม่ให้ส่งคำขอเทเลพอร์ต",
        permissionLevel: CommandPermissionLevel.Any,
        cheatsRequired: false,
        mandatoryParameters: [{ name: "target", type: CustomCommandParamType.PlayerSelector }],
      }, (origin, target) => {
        const player = origin.sourceEntity;
        if (!player || player.typeId !== "minecraft:player") return { status: CustomCommandStatus.Failure };
        runForOnlinePlayer(player.id, current => {
          const blocked = normalizeCommandTarget(target);
          if (!blocked || blocked.id === current.id) return teleportNotify(current, "ผู้เล่นปลายทางไม่ถูกต้อง", "note.bass");
          const list = teleportBlocklist(current);
          if (list.includes(String(blocked.id))) return teleportNotify(current, `${blocked.name} ถูกบล็อกอยู่แล้ว`, "note.bass");
          if (list.length >= TELEPORT_MAX_BLOCKED_PLAYERS) return teleportNotify(current, `รายการบล็อกเต็มแล้ว (${TELEPORT_MAX_BLOCKED_PLAYERS} คน)`, "note.bass");
          saveTeleportBlocklist(current, [...list, blocked.id]);
          const pending = TELEPORT_REQUESTS.values();
          for (const request of pending) {
            if (request.requesterId === blocked.id && request.targetId === current.id) {
              TELEPORT_REQUESTS.delete(request.id);
              const requester = findOnlinePlayerById(request.requesterId);
              if (requester) teleportNotify(requester, `${current.name} บล็อกคำขอเทเลพอร์ตของคุณ`, "note.bass");
            }
          }
          teleportNotify(current, `บล็อก ${blocked.name} แล้ว`, "random.orb");
        }, 1);
        return { status: CustomCommandStatus.Success };
      });
      commandRegistry.registerCommand({
        name: "ptp:unblock",
        description: "ยกเลิกการบล็อกผู้เล่น",
        permissionLevel: CommandPermissionLevel.Any,
        cheatsRequired: false,
        mandatoryParameters: [{ name: "target", type: CustomCommandParamType.PlayerSelector }],
      }, (origin, target) => {
        const player = origin.sourceEntity;
        if (!player || player.typeId !== "minecraft:player") return { status: CustomCommandStatus.Failure };
        runForOnlinePlayer(player.id, current => {
          const blocked = normalizeCommandTarget(target);
          if (!blocked) return teleportNotify(current, "ไม่พบผู้เล่นปลายทาง", "note.bass");
          const list = teleportBlocklist(current);
          if (!list.includes(String(blocked.id))) return teleportNotify(current, `${blocked.name} ไม่ได้ถูกบล็อก`, "note.bass");
          saveTeleportBlocklist(current, list.filter(id => id !== String(blocked.id)));
          teleportNotify(current, `ยกเลิกการบล็อก ${blocked.name} แล้ว`, "random.orb");
        }, 1);
        return { status: CustomCommandStatus.Success };
      });
      commandRegistry.registerCommand({
        name: "ptp:help",
        description: "แสดงคำสั่ง Player Teleport",
        permissionLevel: CommandPermissionLevel.Any,
        cheatsRequired: false,
      }, (origin) => {
        const player = origin.sourceEntity;
        if (!player || player.typeId !== "minecraft:player") return { status: CustomCommandStatus.Failure };
        runForOnlinePlayer(player.id, current => teleportNotify(current, "/ptp | /ptp:send <player> | /ptp:accept | /ptp:deny | /ptp:cancel | /ptp:requests | /ptp:block <player> | /ptp:unblock <player>"), 1);
        return { status: CustomCommandStatus.Success };
      });

      commandRegistry.registerCommand({
        name: "extremesmp:money",
        description: "ดูยอดเงิน EXTREMESMP Coins (NRC)",
        permissionLevel: CommandPermissionLevel.Any,
      }, (origin) => {
        const player = origin.sourceEntity;
        if (!player || player.typeId !== "minecraft:player") return { status: CustomCommandStatus.Failure, message: "คำสั่งนี้ใช้ได้ในเกมเท่านั้น" };
        runForOnlinePlayer(player.id, current => notify(current, `ยอดเงินของคุณคือ §e${getScore(current, OBJ_MONEY, 0)} NRC`));
        return { status: CustomCommandStatus.Success };
      });
      commandRegistry.registerCommand({
        name: "extremesmp:msg",
        description: "ส่งข้อความส่วนตัวให้ผู้เล่น EXTREMESMP",
        permissionLevel: CommandPermissionLevel.Any,
        mandatoryParameters: [
          { type: CustomCommandParamType.String, name: "player" },
          { type: CustomCommandParamType.String, name: "message" },
        ],
      }, (origin, playerName, message) => {
        const sender = origin.sourceEntity;
        if (!sender || sender.typeId !== "minecraft:player") return { status: CustomCommandStatus.Failure, message: "คำสั่งนี้ใช้ได้ในเกมเท่านั้น" };
        runForOnlinePlayer(sender.id, current => {
          if (current.hasTag("extremesmp_muted")) return notify(current, "คุณถูกปิดแชทส่วนตัวชั่วคราว", "note.bass");
          const target = onlinePlayersSnapshot().find(p => p.name.toLowerCase() === String(playerName).toLowerCase());
          const text = String(message ?? "").slice(0, 200);
          if (!target || !text) return notify(current, "ใช้ /extremesmp:msg ชื่อผู้เล่น ข้อความ", "note.bass");
          if (!cooldown(current, "msg", CHAT_COOLDOWN_TICKS)) return notify(current, "ส่งข้อความเร็วเกินไป", "note.bass");
          target.sendMessage(`§8[§dPM§8] §f${current.name} §7→ §fคุณ§r: ${text}`);
          current.sendMessage(`§8[§dPM§8] §fคุณ §7→ ${target.name}§r: ${text}`);
          logAudit("PRIVATE_MESSAGE", current, { target: target.name, length: text.length });
        });
        return { status: CustomCommandStatus.Success };
      });
    });
  } catch (error) {
    // The add-on still loads on older hosts; the !menu fallback remains available.
    try { logAudit("COMMAND_REGISTRATION_FAILED", undefined, { error: String(error) }); } catch {}
  }
}

registerCustomCommands();

// A single shared, low-frequency renderer keeps the effect smooth without
// creating one interval per player or doing work when no teleport is active.
system.runInterval(() => {
  if (!CHUNK_LOAD_ANIMATION.size) return;
  for (const [playerId, session] of CHUNK_LOAD_ANIMATION) {
    const player = findOnlinePlayerById(playerId);
    if (!player) {
      CHUNK_LOAD_ANIMATION.delete(playerId);
      continue;
    }
    renderChunkLoadAnimation(player, session);
  }
}, CHUNK_LOAD_ANIMATION_STEP_TICKS);

let maintenanceCycle = 0;
system.runInterval(() => {
  const players = onlinePlayersSnapshot();
  const slowCycle = maintenanceCycle++ % 5 === 0;
  if (slowCycle) activeQuestRotation();
  for (const player of players) {
    if (slowCycle) {
      try { collectPlayerPayouts(player); } catch { /* payout recovery must not break the loop */ }
      const until = Number(getProp(player, "extremesmp:tempbanUntil", 0));
      if (player.hasTag("extremesmp_tempban") && until && now() > until) {
        player.removeTag("extremesmp_tempban");
        player.setDynamicProperty("extremesmp:tempbanUntil", 0);
        notify(player, "หมดเวลาการแบนชั่วคราวแล้ว");
      }
    }
    if (NO_RESPAWN_PLAYERS.has(String(player.id))) {
      player.runCommandAsync("clearspawnpoint @s").catch(() => {});
    }
  }
}, 20);

system.runTimeout(() => {
  objective(OBJ_MONEY, "EXTREMESMP Coins (NRC)");
  objective(OBJ_RANK, "EXTREMESMP Rank");
  objective(OBJ_JOINS, "EXTREMESMP Joins");
  for (const player of onlinePlayersSnapshot()) {
    try { ensurePlayer(player); } catch { /* a joining player may not be ready yet */ }
  }
  if (getProp(world, "extremesmp:bootVersion") === undefined) {
    world.setDynamicProperty("extremesmp:bootVersion", DATA_VERSION);
    logAudit("SERVER_BOOT", undefined, { version: DATA_VERSION });
  }
}, 1);

// Register after openMenu is declared so Kiw legacy entry points all open
// the same EXTREMESMP-owned unified menu without a circular import.
registerEXTREMESMPMenu(openMenu);
