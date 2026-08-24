import { system, world, ActionFormData, ModalFormData } from "../core.js";
import { showMainMenu } from "../kiwora.js";
import { Bank } from "../plugins/bank/bank.js";
import { showClanMenu } from "../plugins/clan/clan.js";
import { Shop as ShopMenu } from "../menu_member/functions/shop/index.js";
import { ShowPlayerWarps } from "../plugins/player-warp/index.js";
import { getRTPConfig, random_tp } from "../plugins/random-teleport/index.js";
import { configureRandomTeleport } from "../menu_member/control_member/control.js";
import { showQuestAdminMenu } from "../quest_system/admin/quest_admin.js";
import { CombatQuest } from "../quest_system/quests/combat_quest.js";
import { FarmingQuest } from "../quest_system/quests/farming_quest.js";
import { MiningQuest } from "../quest_system/quests/mining_quest.js";
import { EditWarp, ShowAvailableWarps } from "../warp.js";
import { editRules, showRules } from "./rules.js";
import { createNPCText } from "../plugins/floating-text/floating_text.js";
import { GlobalConfig } from "../function/GlobalConfig.js";
import { Lang } from "../lib/Lang.js";

import { showXPShop, showXPShopAdmin } from "../plugins/npc-system/xp-shop/xp_shop.js";
import { showStarterKitMenu } from "../plugins/npc-system/starter-kit/starter.js";
import { showBountyMenu } from "../plugins/npc-system/bounty/bounty.js";
import { showTopUpRankMenu } from "../plugins/npc-system/top-up-rank/top-up-rank.js";
import { openBackpackMenu } from "../plugins/backpack/menu.js";
import { vote, showVoteAdminMenu } from "../plugins/npc-system/vote/index.js";
import { showRareShop, showRareShopAdmin } from "../plugins/npc-system/rare-shop/rare_shop.js";
import { showDailyRewardMenu as claimDailyReward, showDailyRewardAdminMenu } from "../plugins/npc-system/daily-reward/daily_reward.js";
import { showTeleportMenu, showTeleportAdminMenu } from "../plugins/npc-system/teleport/teleport.js";
import { showNPCShop, showNPCShopAdmin } from "../plugins/npc-system/npc-shop/npc_shop.js";
import { showRedeemCodeMenu, showRedeemCodeAdminMenu } from "../plugins/npc-system/redeem-code/redeem_code.js";
import { getLobbyConfig, saveLobbyConfig, getRegionConfig, saveRegionConfig, isInProtectedRegion } from "./lobby_protect/config.js";
const SOUNDS = {
  error: { prefix: "§c", sound: "note.bass", pitch: 0.5 },
  warning: { prefix: "§e", sound: "random.pop", pitch: 0.7 },
  success: { prefix: "§a", sound: "random.levelup", pitch: 1.0 },
  info: { prefix: "§b", sound: "random.pop", pitch: 1.0 },
};
const showMsg = (player, type, msg) => {
  const { prefix, sound, pitch } = SOUNDS[type] || SOUNDS.info;
  player.sendMessage(`${prefix} ${msg}`);
  try { player.runCommand(`playsound ${sound} @s ~~~ 1 ${pitch}`); } catch { }
};
const hasVipAccess = (player) => {
  return false;
};
const NPC_TYPES = [
  { name: "Shop NPC", icon: "textures/ui/trade_icon", npcName: "§eMerchant", desc: "Buy and sell items", fn: ShopMenu },
  { name: "Daily Reward NPC", icon: "textures/ui/achievements", npcName: "§dDaily Reward", desc: "Claim your daily reward", fn: claimDailyReward, admin: showDailyRewardAdminMenu },
  { name: "Quest NPC", icon: "textures/items/book_enchanted", npcName: "§6Quest", desc: "Daily missions & challenges", fn: showQuestMenu, admin: showQuestAdminMenu },
  { name: "Bank NPC", icon: "textures/ui/MCoin", npcName: "§6Bank", desc: "Manage your finances", fn: Bank },
  { name: "Redeem Code NPC", icon: "textures/ui/market_items/bookshelf", npcName: "§bRedeem Code", desc: "Redeem a gift code", fn: showRedeemCodeMenu, admin: showRedeemCodeAdminMenu },
  { name: "Vote NPC", icon: "textures/ui/icon_deals", npcName: "§dVote", desc: "Vote for the server", fn: vote, admin: showVoteAdminMenu },
  { name: "Clan NPC", icon: "textures/items/bordure_indented_banner_pattern", npcName: "§bClan", desc: "Clan management", fn: showClanMenu },
  { name: "Warp NPC", icon: "textures/ui/csb_faq_parrot", npcName: "§aWarp", desc: "Teleport to a location", fn: ShowAvailableWarps, admin: EditWarp },
  { name: "Backpack NPC", icon: "textures/ui/inventory_icon", npcName: "§dBackpack", desc: "Access extra storage", fn: openBackpackMenu },
  { name: "Rules NPC", icon: "textures/ui/market_items/bookshelf", npcName: "§6Rules", desc: "View server rules", fn: showRules, admin: editRules },
  { name: "Random Teleport NPC", icon: "textures/ui/dressing_room_capes", npcName: "§aRandom Teleport", desc: "Teleport to a random location", fn: random_tp, admin: editRandomTeleportSettings },
  { name: "Player Warp NPC", icon: "textures/ui/icon_recipe_construction", npcName: "§aPlayer Warp", desc: "Player-created warps", fn: ShowPlayerWarps },

  { name: "XP Shop NPC", icon: "textures/items/experience_bottle", npcName: "§6XP Shop", desc: "Buy and sell XP", fn: showXPShop, admin: showXPShopAdmin },
  { name: "Starter Kit NPC", icon: "textures/ui/gift_square", npcName: "§bStarter Kit", desc: "Claim your starter kit", fn: showStarterKitMenu },
  { name: "Bounty NPC", icon: "textures/ui/regeneration_effect", npcName: "§cBounty", desc: "Set and claim bounties", fn: showBountyMenu },
  { name: "Top Up Rank NPC", icon: "textures/ui/MCoin", npcName: "§eTop Up Rank", desc: "Buy a premium rank", fn: showTopUpRankMenu },
  { name: "Rare Shop NPC", icon: "textures/items/nether_star", npcName: "§bRare Shop", desc: "Buy exclusive items", fn: showRareShop, admin: showRareShopAdmin },
  { name: "Teleport NPC", icon: "textures/ui/dressing_room_capes", npcName: "§aTeleport", desc: "Teleport to a location", fn: (p, n) => showTeleportMenu(p, n), admin: (p, n) => showTeleportAdminMenu(p, n) },
  { name: "Custom Shop NPC", icon: "textures/ui/trade_icon", npcName: "§eCustom Shop", desc: "Customizable shop system", fn: showNPCShop, admin: showNPCShopAdmin },
].map(n => ({ ...n, fullName: `${n.npcName}\n§7${n.desc}\n§8[Click Here]` }));
async function showUniversalNPCCustomization(player, npc, npcEntity) {
  const isKiwoNPC = npcEntity?.typeId === "kiwo:npc";
  const entityInfo = isKiwoNPC ? "§dInvisible (kiwo:npc)" : "§aVisible (minecraft:npc)";
  const entityId = npcEntity?.id;
  const entityType = npcEntity?.typeId;
  const entityDimension = npcEntity?.dimension?.id;
  const entityLocation = npcEntity?.location ? { ...npcEntity.location } : null;
  const btns = [
    { text: `Use ${npc.name}\n§8Test functionality`, icon: npc.icon, actionType: "use" },
    ...(npc.admin ? [{ text: "Admin Settings\n§8Configure settings", icon: "textures/ui/gear", actionType: "admin" }] : []),
    ...(!isKiwoNPC ? [{ text: "Customize Appearance\n§8Change skin & name", icon: "textures/ui/dressing_room_skins", actionType: "customize" }] : []),
    { text: "§cRemove NPC", icon: "textures/ui/trash_default", actionType: "remove" },
    { text: "§cClose", icon: "textures/ui/cancel", actionType: "close" }
  ];
  const form = new ActionFormData()
    .title(`§b${npc.name} Options`)
    .body(`§eWhat would you like to do with this ${npc.name}?\n\n§7Entity Type: ${entityInfo}`);
  btns.forEach(b => form.button(b.text, b.icon));
  const res = await form.show(player);
  if (res.canceled) return;
  const selectedAction = btns[res.selection]?.actionType;
  if (!selectedAction) return;
  switch (selectedAction) {
    case "use":
      npc.fn(player, npcEntity);
      break;
    case "admin":
      npc.admin(player, npcEntity);
      break;
    case "customize":
      try { player.runCommand(`dialogue open @e[type=npc,c=1,r=5] @s`); } catch { }
      break;
    case "remove":
      removeNPCById(player, entityId, entityType, entityDimension, entityLocation);
      break;
  }
}
function removeNPCById(player, entityId, entityType, dimensionId, location) {
  try {
    if (!entityId || !entityType || !dimensionId) {
      showMsg(player, "error", "NPC data not found!");
      return;
    }
    const dim = world.getDimension(dimensionId);
    if (!dim) {
      showMsg(player, "error", "Dimension not found!");
      return;
    }
    const searchOptions = {
      type: entityType,
      location: location || player.location,
      maxDistance: 10,
      tags: ["fixed_position"]
    };
    const entities = dim.getEntities(searchOptions);
    const isEntityValid = (e) => e && (typeof e.isValid !== "function" || e.isValid());
    let npcEntity = entities.find(e => e.id === entityId && isEntityValid(e));
    if (!npcEntity) {
      npcEntity = entities.find(e => isEntityValid(e));
    }
    if (!npcEntity) {
      showMsg(player, "error", "NPC not found! It may have been removed already.");
      return;
    }
    removeNPCEntity(player, npcEntity);
  } catch (e) {
    console.warn("[NPC] Remove by ID error:", e);
    showMsg(player, "error", "Failed to find NPC!");
  }
}
function cleanupNPCAttachments(dimension, npcId, location, npcTypeName) {
  if (!dimension || !location) return;
  const nearbyRadius = 4;
  const nearbyTextHeight = 3.5;
  const textEntities = dimension.getEntities({
    type: "add:floating_text",
    location,
    maxDistance: nearbyRadius,
    tags: ["npc_text"]
  });
  const linkedTexts = textEntities.filter(text => {
    const tags = text.getTags();
    const hasMatchingId = npcId && tags.includes(`text_id:${npcId}`);
    const hasMatchingType = npcTypeName && tags.includes(npcTypeName);
    const isNearNPCLabel = Math.abs(text.location.x - location.x) <= 1.25
      && Math.abs(text.location.y - (location.y + 2)) <= nearbyTextHeight
      && Math.abs(text.location.z - location.z) <= 1.25;
    return hasMatchingId || (hasMatchingType && isNearNPCLabel) || isNearNPCLabel;
  });
  linkedTexts.forEach(text => { try { text.remove(); } catch { } });

  if (!npcId) return;
  const modelEntities = dimension.getEntities({ tags: [`model_id:${npcId}`] });
  modelEntities.forEach(model => { try { model.remove(); } catch { } });
}
function isTextNearNPCBase(text, npcLocation) {
  return Math.abs(text.location.x - npcLocation.x) <= 1.25
    && Math.abs(text.location.y - (npcLocation.y + 2)) <= 3.5
    && Math.abs(text.location.z - npcLocation.z) <= 1.25;
}
function removeNPCEntity(player, npcEntity) {
  try {
    if (!npcEntity) {
      showMsg(player, "error", "NPC entity is null!");
      return;
    }
    if (typeof npcEntity.isValid === "function" && !npcEntity.isValid()) {
      showMsg(player, "error", "NPC is no longer valid!");
      return;
    }
    const tags = npcEntity.getTags();
    const npcIdTag = tags.find(t => t.startsWith("npc_id:"));
    const npcId = npcIdTag?.replace("npc_id:", "") || null;
    const npcType = NPC_TYPES.find(type => tags.includes(type.name));
    const npcLocation = { ...npcEntity.location };
    const npcDimension = npcEntity.dimension;

    cleanupNPCAttachments(npcDimension, npcId, npcLocation, npcType?.name);
    npcEntity.remove();
    system.runTimeout(() => cleanupNPCAttachments(npcDimension, npcId, npcLocation, npcType?.name), 1);
    showMsg(player, "success", "NPC removed successfully!");
  } catch (e) {
    console.warn("[NPC] Remove error:", e);
    showMsg(player, "error", "Failed to remove NPC: " + e.message);
  }
}
async function editRandomTeleportSettings(player) {
  try {
    await new Promise(resolve => system.runTimeout(resolve, 2));
    configureRandomTeleport(player);
  } catch (e) {
    console.warn("[RTP Settings] Error:", e);
    showMsg(player, "error", "Unable to open Random Teleport settings.");
  }
}
function showQuestMenu(player) {
  const quests = [MiningQuest, CombatQuest, FarmingQuest];
  new ActionFormData()
    .title("§6Quest Menu")
    .body("§eSelect a quest type:")
    .button("Mining Quests\n§8Mine ores and minerals", "textures/blocks/emerald_ore")
    .button("Combat Quests\n§8Defeat monsters", "textures/ui/sword")
    .button("Farming Quests\n§8Harvest crops", "textures/blocks/beetroots_stage_3")
    .button("§cExit", "textures/ui/redX1")
    .show(player)
    .then(res => !res.canceled && res.selection < 3 && quests[res.selection].showMenu(player));
}
const setupNPCEntity = (npc, selected) => {
  npc.nameTag = "§r";
  npc.addTag(selected.name);
  npc.addTag("fixed_position");
  npc.addTag("from_menu");
  let idTag = npc.getTags().find(t => t.startsWith("npc_id:"));
  let id;
  if (idTag) {
    id = idTag.replace("npc_id:", "");
  } else {
    id = Math.floor(Math.random() * 1e9).toString();
    npc.addTag("npc_id:" + id);
  }
  const pos = npc.location;
  const rot = npc.getRotation();
  npc.setDynamicProperty("npc:position", JSON.stringify({ ...pos, ry: rot.y }));
  system.runTimeout(() => {
    try {
      const text = createNPCText(npc.dimension, { x: pos.x, y: pos.y + 2, z: pos.z }, selected.fullName);
      if (text) {
        text.addTag("text_id:" + id);
        text.addTag(selected.name);
      }
    } catch (e) { console.warn("[NPC] Text error:", e); }
  }, 5);
};
const NPC_ENTITY_TYPES = ["minecraft:npc", "kiwo:npc"];
function resetNPCSystem(player) {
  let count = 0;
  ["overworld", "nether", "the_end"].forEach(dimName => {
    const dim = world.getDimension(dimName);
    if (!dim) return;
    NPC_ENTITY_TYPES.forEach(entityType => {
      dim.getEntities({ type: entityType, tags: ["fixed_position"] }).forEach(n => { n.remove(); count++; });
    });
    dim.getEntities({ tags: ["npc_model"] }).forEach(m => { m.remove(); count++; });
    dim.getEntities({ type: "add:floating_text", tags: ["npc_text"] }).forEach(t => { t.remove(); count++; });
  });
  showMsg(player, "success", `Removed ${count} system entities (NPCs + Models + Text).`);
}
function showMaintenanceMenu(player) {
  new ActionFormData()
    .title("§cNPC Maintenance")
    .body("§7Options to clean up or reset the NPC system.")
    .button("§cClean All NPCs & Texts", "textures/ui/trash_default")
    .button("Back", "textures/ui/arrow_left")
    .show(player)
    .then(res => !res.canceled && (res.selection === 0 ? resetNPCSystem(player) : npc_system(player)));
}
async function showNPCTypeMenu(player, selected) {
  const canUseCustomModel = hasVipAccess(player);
  const form = new ActionFormData()
    .title(`§b${selected.name}`)
    .body(Lang.t(player, "npc.appearance.body"))
    .button(Lang.t(player, "npc.appearance.normal"), "textures/ui/icon_steve")
    .button(
      Lang.t(player, canUseCustomModel ? "npc.appearance.custom" : "npc.appearance.custom.vip_locked"),
      "textures/ui/dressing_room_skins",
    )
    .button(Lang.t(player, "npc.appearance.cancel"), "textures/ui/cancel");
  const res = await form.show(player);
  if (res.canceled || res.selection === 2) return;
  if (res.selection === 0) {
    spawnNPCWithType(player, selected, false, null);
  } else {
    if (!canUseCustomModel) {
      showMsg(player, "warning", Lang.t(player, "npc.custom.vip_only"));
      return showNPCTypeMenu(player, selected);
    }
    showModelSelectionMenu(player, selected);
  }
}
const NPC_CUSTOM_MODELS = [
  { id: "npc_merchant_general", name: "Merchant General", icon: "textures/ui/trade_icon" },
  { id: "npc_merchant_blacksmith", name: "Blacksmith", icon: "textures/ui/anvil_icon" },
  { id: "npc_merchant_farming", name: "Farmer Merchant", icon: "textures/blocks/wheat_stage_7" },
  { id: "npc_merchant_mining", name: "Miner Merchant", icon: "textures/blocks/iron_ore" },
  { id: "npc_merchant_food", name: "Food Merchant", icon: "textures/items/apple" },
  { id: "npc_merchant_enchant", name: "Enchant Merchant", icon: "textures/items/book_enchanted" },
  { id: "npc_merchant_grinding", name: "Grinding Merchant", icon: "textures/items/diamond" },
  { id: "npc_merchant_shady", name: "Shady Merchant", icon: "textures/ui/icon_skull" },
  { id: "npc_farmer_male", name: "Farmer (Male)", icon: "textures/items/wheat" },
  { id: "npc_farmer_female", name: "Farmer (Female)", icon: "textures/items/carrot" },
  { id: "npc_miner_male", name: "Miner (Male)", icon: "textures/items/iron_pickaxe" },
  { id: "npc_miner_female", name: "Miner (Female)", icon: "textures/items/diamond_pickaxe" },
  { id: "npc_warrior_male", name: "Warrior (Male)", icon: "textures/items/iron_sword" },
  { id: "npc_warrior_female", name: "Warrior (Female)", icon: "textures/items/diamond_sword" },
  { id: "npc_archer", name: "Archer", icon: "textures/items/bow_standby" },
  { id: "npc_swordsman", name: "Swordsman", icon: "textures/ui/sword" },
  { id: "npc_lumberjack", name: "Lumberjack", icon: "textures/items/iron_axe" },
  { id: "npc_martial_artist", name: "Martial Artist", icon: "textures/ui/strength_effect" },
  { id: "npc_mage_general", name: "Mage General", icon: "textures/items/blaze_rod" },
  { id: "npc_mage_combat", name: "Combat Mage", icon: "textures/ui/strength_effect" },
  { id: "npc_mage_farming", name: "Farming Mage", icon: "textures/blocks/wheat_stage_7" },
  { id: "npc_mage_mining", name: "Mining Mage", icon: "textures/blocks/diamond_ore" },
  { id: "npc_mage_skyblock", name: "Skyblock Mage", icon: "textures/ui/dressing_room_capes" },
  { id: "npc_old_mage", name: "Old Mage", icon: "textures/items/book_enchanted" },
  { id: "npc_tamer_regular", name: "Tamer Regular", icon: "textures/items/lead" },
  { id: "npc_tamer_combat", name: "Combat Tamer", icon: "textures/items/iron_sword" },
  { id: "npc_tamer_farming", name: "Farming Tamer", icon: "textures/items/wheat" },
  { id: "npc_tamer_mining", name: "Mining Tamer", icon: "textures/items/iron_pickaxe" },
  { id: "npc_fancy_man", name: "Fancy Man", icon: "textures/ui/icon_alex" },
  { id: "npc_fancy_lady", name: "Fancy Lady", icon: "textures/ui/dressing_room_skins" },
  { id: "npc_pretty_lady", name: "Pretty Lady", icon: "textures/ui/dressing_room_skins" },
  { id: "npc_blond_guy", name: "Blond Guy", icon: "textures/ui/icon_steve" },
  { id: "npc_architect", name: "Architect", icon: "textures/ui/icon_recipe_construction" },
  { id: "npc_seer", name: "Seer", icon: "textures/items/ender_eye" },
  { id: "npc_death", name: "Death", icon: "textures/items/bone" },
  { id: "npc_evil_overlord", name: "Evil Overlord", icon: "textures/ui/icon_skull" },
  { id: "npc_wacky_salesman", name: "Wacky Salesman", icon: "textures/ui/icon_deals" },
  { id: "npc_baby_phoenix", name: "Baby Phoenix", icon: "textures/items/blaze_powder" },
  { id: "npc_skyblock_phoenix", name: "Skyblock Phoenix", icon: "textures/items/magma_cream" },
  { id: "npc_whale_balloon", name: "Whale Balloon", icon: "textures/ui/dressing_room_capes" },
];
async function showModelSelectionMenu(player, selected) {
  if (!hasVipAccess(player)) {
    showMsg(player, "warning", Lang.t(player, "npc.custom.vip_only"));
    return showNPCTypeMenu(player, selected);
  }
  const form = new ActionFormData()
    .title(Lang.t(player, "npc.model.title"))
    .body(Lang.t(player, "npc.model.body", selected.name));
  NPC_CUSTOM_MODELS.forEach(m => form.button(`${m.name}\n§8enchanted:${m.id}`, m.icon));
  form.button(Lang.t(player, "npc.appearance.cancel"), "textures/ui/cancel");
  const res = await form.show(player);
  if (res.canceled || res.selection >= NPC_CUSTOM_MODELS.length) return;
  const selectedModel = NPC_CUSTOM_MODELS[res.selection];
  spawnNPCWithType(player, selected, true, selectedModel);
}
function spawnNPCWithType(src, selected, isInvisible, customModel) {
  if (isInvisible && !hasVipAccess(src)) {
    return showMsg(src, "warning", Lang.t(src, "npc.custom.vip_only"));
  }
  const entityType = isInvisible ? "kiwo:npc" : "minecraft:npc";
  const playerRot = src.getRotation();
  try {
    const region = isInProtectedRegion(src.location);
    if (region) {
      const rc = getRegionConfig(region.id);
      const entitiesToExclude = ["minecraft:npc", "kiwo:npc"];
      entitiesToExclude.forEach(e => {
        if (!rc.excludedEntities?.includes(e)) {
          rc.excludedEntities = [...(rc.excludedEntities || []), e];
        }
      });
      saveRegionConfig(region.id, rc);
    }
    const lc = getLobbyConfig();
    const entitiesToExclude = ["minecraft:npc", "kiwo:npc"];
    entitiesToExclude.forEach(e => {
      if (!lc.excludedEntities?.includes(e)) {
        lc.excludedEntities = [...(lc.excludedEntities || []), e];
      }
    });
    saveLobbyConfig(lc);
    if (isInvisible) {
      src.runCommand(`summon kiwo:npc ~~~`);
      if (customModel) {
        src.runCommand(`summon enchanted:${customModel.id} ~~~`);
      }
    } else {
      src.runCommand(`summon minecraft:npc ~~~`);
    }
  } catch (e) {
    console.warn("[NPC] Summon failed:", e);
    return showMsg(src, "error", "Failed to spawn NPC.");
  }
  system.runTimeout(() => {
    const entities = src.dimension.getEntities({ type: entityType, location: src.location, maxDistance: 3 });
    const npcEntity = entities.find(e => !e.hasTag("fixed_position") && !e.hasTag("from_menu"));
    if (npcEntity) {
      npcEntity.setRotation(playerRot);
      setupNPCEntity(npcEntity, selected);
      if (isInvisible && customModel) {
        const modelEntities = src.dimension.getEntities({
          type: `enchanted:${customModel.id}`,
          location: src.location,
          maxDistance: 3
        });
        const modelEntity = modelEntities.find(e => !e.hasTag("fixed_position") && !e.hasTag("npc_model"));
        if (modelEntity) {
          const npcIdTag = npcEntity.getTags().find(t => t.startsWith("npc_id:"));
          if (npcIdTag) {
            modelEntity.addTag(npcIdTag.replace("npc_id:", "model_id:"));
            modelEntity.addTag("npc_model");
            modelEntity.addTag("fixed_position");
            modelEntity.setRotation(playerRot);
            modelEntity.setDynamicProperty("npc:position", JSON.stringify({ ...src.location, ry: playerRot.y }));
          }
        }
        showMsg(src, "success", Lang.t(src, "npc.spawn.custom_success", selected.name, customModel.name));
      } else {
        const typeText = isInvisible ? " (Invisible - kiwo:npc)" : "";
        showMsg(src, "success", Lang.t(src, "npc.spawn.success", `${selected.name}${typeText}`));
      }
    } else {
      showMsg(src, "error", Lang.t(src, "npc.spawn.err.not_found"));
    }
  }, 10);
}
export function npc_system(src) {
  try {
    const form = new ActionFormData().title(Lang.t(src, "npc.system.title")).body(Lang.t(src, "npc.system.body"));
    NPC_TYPES.forEach(n => form.button(`${n.name}\n§r${n.desc}`, n.icon));
    form.button(Lang.t(src, "npc.system.maintenance"), "textures/ui/automation_glyph_color");
    form.button(Lang.t(src, "common.back"), "textures/ui/arrow_left");
    form.show(src).then(res => {
      if (res.canceled) return;
      if (res.selection === NPC_TYPES.length) return showMaintenanceMenu(src);
      if (res.selection === NPC_TYPES.length + 1) return showMainMenu(src);
      const selected = NPC_TYPES[res.selection];
      showNPCTypeMenu(src, selected);
    });
  } catch (e) { console.warn("[NPC] Menu error:", e); showMsg(src, "error", "An error occurred in the NPC menu."); }
}
world.afterEvents.entitySpawn.subscribe(e => {
  if (e.entity.typeId !== "minecraft:npc") return;
  system.runTimeout(() => {
    try {
      if (!e.entity.isValid() || NPC_TYPES.some(t => e.entity.hasTag(t.name)) || e.entity.hasTag("from_menu")) return;
      const npcType = NPC_TYPES.find(t => e.entity.hasTag(t.name));
      if (npcType) setupNPCEntity(e.entity, npcType);
    } catch { }
  }, 1);
});
const handleNPCInteraction = (player, npcEntity) => {
  if (!NPC_TYPES.some(t => npcEntity.hasTag(t.name)) && !npcEntity.hasTag("from_menu")) return;
  const npcType = NPC_TYPES.find(t => npcEntity.hasTag(t.name));
  system.run(() => {
    if (npcEntity.typeId === "kiwo:npc" && !player.hasTag("admin") && !hasVipAccess(player)) {
      showMsg(player, "warning", Lang.t(player, "npc.custom.vip_only"));
      return;
    }
    if (player.hasTag("admin")) {
      if (npcType) showUniversalNPCCustomization(player, npcType, npcEntity);
    } else if (npcType) {
      npcType.fn(player, npcEntity);
      try { player.runCommand("playsound random.pop @s ~~~ 1 1"); } catch { }
    }
  });
};
world.beforeEvents.playerInteractWithEntity.subscribe(e => {
  if (NPC_ENTITY_TYPES.includes(e.target.typeId) && (NPC_TYPES.some(t => e.target.hasTag(t.name)) || e.target.hasTag("from_menu"))) {
    e.cancel = true;
    handleNPCInteraction(e.player, e.target);
  }
});
world.afterEvents.entityHitEntity.subscribe(e => {
  if (NPC_ENTITY_TYPES.includes(e.hitEntity.typeId) && e.damagingEntity.typeId === "minecraft:player") {
    if (NPC_TYPES.some(t => e.hitEntity.hasTag(t.name)) || e.hitEntity.hasTag("from_menu")) handleNPCInteraction(e.damagingEntity, e.hitEntity);
  }
});
const FISHING_RECOVERY_RADIUS = 64;
const POSITION_SETTLE_TICKS = 5;
function restoreFixedTextNear(dimension, location, maxDistance) {
  try {
    const texts = dimension.getEntities({ type: "add:floating_text", tags: ["fixed_position"], location, maxDistance });
    for (const text of texts) {
      try {
        const sPos = text.getDynamicProperty("sft:fixedPosition");
        if (typeof sPos !== "string") continue;
        const sp = JSON.parse(sPos);
        const restore = () => {
          try { text.clearVelocity(); } catch { }
          try { text.teleport({ x: sp.x, y: sp.y, z: sp.z }); } catch { }
        };
        restore();
        system.runTimeout(restore, POSITION_SETTLE_TICKS);
      } catch { }
    }
  } catch { }
}
world.afterEvents.projectileHitEntity.subscribe(e => {
  if (e.projectile.typeId !== "minecraft:fishing_hook") return;
  try {
    const hit = e.getEntityHit()?.entity;
    if (hit) restoreFixedTextNear(hit.dimension, hit.location, 4);
  } catch { }
});
world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
  if (itemStack.typeId !== "minecraft:fishing_rod") return;
  try { restoreFixedTextNear(source.dimension, source.location, FISHING_RECOVERY_RADIUS); } catch { }
});
let tick = 0;
system.runInterval(() => {
  tick = (tick + 1) % 8;
  ["overworld", "nether", "the_end"].forEach(dimName => {
    const dim = world.getDimension(dimName);
    if (!dim) return;
    try {
      const npcs = [];
      NPC_ENTITY_TYPES.forEach(entityType => {
        npcs.push(...dim.getEntities({ type: entityType, tags: ["fixed_position"] }));
      });
      npcs.forEach(npc => {
        const sPos = npc.getDynamicProperty("npc:position");
        if (sPos) {
          const sp = JSON.parse(sPos);
          if (Math.abs(npc.location.x - sp.x) > 0.01 || Math.abs(npc.location.y - sp.y) > 0.01 || Math.abs(npc.location.z - sp.z) > 0.01) {
            npc.teleport({ x: sp.x, y: sp.y, z: sp.z }, { rotation: { x: 0, y: sp.ry ?? npc.getRotation().y } });
          }
        }
      });
      if (tick === 0) {
        const texts = dim.getEntities({ type: "add:floating_text", tags: ["npc_text"] });
        const textMap = new Map(texts.map(t => {
          const tag = t.getTags().find(tg => tg.startsWith("text_id:"));
          return tag ? [tag.replace("text_id:", ""), t] : null;
        }).filter(Boolean));
        npcs.forEach(npc => {
          const id = npc.getTags().find(t => t.startsWith("npc_id:"))?.replace("npc_id:", "");
          if (!id) return;
          const text = textMap.get(id);
          const pos = { x: npc.location.x, y: npc.location.y + 2, z: npc.location.z };
          const type = NPC_TYPES.find(t => npc.hasTag(t.name));
          if (text?.isValid) {
            text.teleport(pos);
            text.setDynamicProperty("sft:fixedPosition", JSON.stringify(pos));
          } else if (type) {
            const newText = createNPCText(dim, pos, type.fullName);
            if (newText) { newText.addTag(`text_id:${id}`); newText.addTag(type.name); }
          }
        });
        textMap.forEach((text, id) => {
          if (!npcs.some(n => n.hasTag(`npc_id:${id}`))) {
            try { text.remove(); } catch { }
          }
        });
        texts.forEach(text => {
          if (typeof text.isValid === "function" && !text.isValid()) return;
          const hasLinkedId = text.getTags().some(tag => tag.startsWith("text_id:"));
          const attachedNPC = npcs.find(npc => isTextNearNPCBase(text, npc.location));
          if (!hasLinkedId && !attachedNPC) {
            try { text.remove(); } catch { }
          }
        });
      }
    } catch { }
  });
}, 5);
