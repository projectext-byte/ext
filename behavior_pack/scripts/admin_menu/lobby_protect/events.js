import { system, world } from "../../core.js";
import { Lang } from "../../lib/Lang.js";
import { getRegionConfig, isInProtectedRegion, isEntityExcluded, isPlayerRankAllowed, getLobbyRankLabel, getPlayerLobbyRank } from "./config.js";
import { isAuthorizedAdmin, sendProtectionMessage, playerAreas } from "./utils.js";
import { getGenerators, onGeneratorsChanged } from "../ore_generator/database_ore.js";
import { activateLobbyMode, deactivateLobbyMode } from "./lobby_inventory.js"
import { registerFarmlandEvents } from "./farmland_protect.js";

const cache = {
  prot: new Map(),
  lastProt: 0,
  regions: [],
  regionsTime: 0,
  lastPos: new Map(),
  lastReg: new Map(),
  generators: [],
  generatorsTime: 0,
};

const isInOreGen = (loc, dim) => {
  if (dim.id !== "minecraft:overworld") return false;
  const now = Date.now();
  if (now - cache.generatorsTime > 5000) {
    cache.generators = getGenerators().filter(g => g.pos1 && g.pos2);
    cache.generatorsTime = now;
  }
  return cache.generators.some(
    (g) =>
      loc.x >= Math.min(g.pos1.x, g.pos2.x) &&
      loc.x <= Math.max(g.pos1.x, g.pos2.x) &&
      loc.y >= Math.min(g.pos1.y, g.pos2.y) &&
      loc.y <= Math.max(g.pos1.y, g.pos2.y) &&
      loc.z >= Math.min(g.pos1.z, g.pos2.z) &&
      loc.z <= Math.max(g.pos1.z, g.pos2.z),
  );
};
const ADVENTURE_TAG = "lobby_adventure_mode";
const BOW_ITEM_IDS = new Set(["minecraft:bow"]);
const BOW_PROJECTILE_IDS = new Set(["minecraft:arrow", "minecraft:spectral_arrow"]);
const DAMAGE_EFFECT_DURATION = 3;
const DAMAGE_EFFECT_AMPLIFIER = 255;
const damageEffectPlayers = new Set();

const hasAntiBowProtection = (regionId) => !!(getRegionConfig(regionId).antiBowProtection ?? false);

function applyLobbyDamageEffect(player) {
  try {
    player.runCommand(`effect @s resistance ${DAMAGE_EFFECT_DURATION} ${DAMAGE_EFFECT_AMPLIFIER} true`);
    damageEffectPlayers.add(player.id);
  } catch {}
}

export function clearLobbyDamageEffect(player) {
  if (!player || !damageEffectPlayers.has(player.id)) return;
  try {
    player.runCommand("effect @s clear resistance");
  } catch {
    try {
      player.runCommand("effect clear @s resistance");
    } catch {}
  }
  damageEffectPlayers.delete(player.id);
}

function getRegionExitLocation(player, region) {
  const loc = player.location;
  const minX = Math.min(region.pos1.x, region.pos2.x);
  const maxX = Math.max(region.pos1.x, region.pos2.x);
  const minZ = Math.min(region.pos1.z, region.pos2.z);
  const maxZ = Math.max(region.pos1.z, region.pos2.z);
  const exits = [
    { x: minX - 1.5, z: loc.z, distance: Math.abs(loc.x - minX) },
    { x: maxX + 1.5, z: loc.z, distance: Math.abs(loc.x - maxX) },
    { x: loc.x, z: minZ - 1.5, distance: Math.abs(loc.z - minZ) },
    { x: loc.x, z: maxZ + 1.5, distance: Math.abs(loc.z - maxZ) },
  ];
  exits.sort((a, b) => a.distance - b.distance);
  return { x: exits[0].x, y: loc.y, z: exits[0].z };
}

function ejectPlayerFromRegion(player, region, conf) {
  try {
    const allowedRanks = (conf.allowedRanks || []).map(getLobbyRankLabel).join(", ");
    const rank = getLobbyRankLabel(getPlayerLobbyRank(player));
    deactivateLobbyMode(player);
    clearLobbyDamageEffect(player);
    playerAreas.delete(player.id);
    if (player.hasTag(ADVENTURE_TAG)) {
      try { player.runCommand("gamemode survival"); } catch {}
      try { player.removeTag(ADVENTURE_TAG); } catch {}
    }
    player.teleport(getRegionExitLocation(player, region), { dimension: player.dimension });
    sendProtectionMessage(
      player,
      allowedRanks
        ? Lang.t(player, "lobby.rank.denied.allowed", rank, allowedRanks)
        : Lang.t(player, "lobby.rank.denied", rank),
    );
  } catch {}
}

const checkProt = (player, loc, regId, type) => {
  const now = Date.now(),
    key = `${regId}_${type}`;
  if (now - cache.lastProt < 5000 && cache.prot.has(key)) {
    const c = cache.prot.get(key);
    if (c.admin === isAuthorizedAdmin(player, regId)) return c.res;
  }
  const conf = getRegionConfig(regId),
    admin = isAuthorizedAdmin(player, regId);
  const res =
    !conf[type] || admin
      ? false
      : conf.protectedDimensions.includes(player.dimension.id.split(":")[1]);
  cache.prot.set(key, { res, admin });
  cache.lastProt = now;
  return res;
};

const partQ = [];

export function registerAllEvents() {
  registerFarmlandEvents();
    onGeneratorsChanged(() => {
      cache.generatorsTime = 0;
    });
  const handleBlock = (ev, type, msg) => {
    try {
      const { player, block } = ev;
      if (type === "blockBreakProtection" && isInOreGen(block.location, block.dimension)) return;
      const reg = isInProtectedRegion(block.location, block.dimension.id);
      if (!reg) return;
      if (type === "blockBreakProtection" && (block.typeId === "minecraft:farmland" || block.typeId?.includes("crop") || block.typeId?.includes("wheat") || block.typeId?.includes("carrot") || block.typeId?.includes("potato") || block.typeId?.includes("beetroot") || block.typeId?.includes("melon_stem") || block.typeId?.includes("pumpkin_stem") || block.typeId?.includes("torchflower") || block.typeId?.includes("pitcher") || block.typeId?.includes("berry") || block.typeId?.includes("cocoa") || block.typeId?.includes("wart"))) return;
      if (!checkProt(player, block.location, reg.id, type)) return;
      ev.cancel = true;
      sendProtectionMessage(player, Lang.t(player, msg));
      if (getRegionConfig(reg.id).showParticles)
        partQ.push({ dim: player.dimension, loc: block.location, type: "minecraft:large_smoke", delay: 0 });
    } catch {}
  };
  world.beforeEvents.playerBreakBlock.subscribe((e) =>
    handleBlock(e, "blockBreakProtection", "lobby.protect.block_break"),
  );
  world.beforeEvents.playerPlaceBlock.subscribe((e) =>
    handleBlock(e, "blockPlaceProtection", "lobby.protect.block_place"),
  );
  world.beforeEvents.playerInteractWithBlock.subscribe((e) => {
    try {
      const { player, block, itemStack } = e;
      if (block.typeId === "minecraft:ender_chest" && player.getDynamicProperty("lobby_protect:saved_inventory")) {
        e.cancel = true;
        sendProtectionMessage(player, Lang.t(player, "lobby.protect.ender_chest"));
        return;
      }
      const reg = isInProtectedRegion(block.location, block.dimension.id);
      if (!reg) return;
      if (
        itemStack &&
        (itemStack.typeId.includes("flint_and_steel") || itemStack.typeId.includes("fire_charge")) &&
        getRegionConfig(reg.id).fireProtection
      ) {
        e.cancel = true;
        sendProtectionMessage(player, Lang.t(player, "lobby.protect.fire"));
        return;
      }
      if (block.typeId === "minecraft:flower_pot") {
        if (
          checkProt(player, block.location, reg.id, "blockPlaceProtection") ||
          checkProt(player, block.location, reg.id, "blockBreakProtection")
        ) {
          e.cancel = true;
          sendProtectionMessage(player, Lang.t(player, "lobby.protect.flower_pot"));
          return;
        }
      }
      if (!checkProt(player, block.location, reg.id, "interactionProtection")) return;
      e.cancel = true;
      sendProtectionMessage(player, Lang.t(player, "lobby.protect.interaction"));
    } catch {}
  });
  world.beforeEvents.playerInteractWithEntity.subscribe((e) => {
    try {
      const { player, target: t } = e;
      if (!t?.isValid() || !t.location) return;
      const reg = isInProtectedRegion(t.location, t.dimension.id);
      if (!reg || isEntityExcluded(t.typeId, reg.id)) return;
      if ((t.typeId === "minecraft:frame" || t.typeId === "minecraft:glow_frame") && !isAuthorizedAdmin(player, reg.id)) {
        e.cancel = true;
        sendProtectionMessage(player, Lang.t(player, "lobby.protect.item_frame"));
        if (getRegionConfig(reg.id).showParticles)
          partQ.push({
            dim: player.dimension,
            loc: t.location,
            type: "minecraft:villager_angry",
            delay: 0,
          });
        return;
      }
      if (!checkProt(player, t.location, reg.id, "interactionProtection")) return;
    } catch {}
  });
  world.beforeEvents.explosion.subscribe((e) => {
    const loc = e.source?.location;
    const dimId = e.source?.dimension?.id ?? e.dimension?.id;
    if (!dimId) return;
    if (loc) {
      const sourceReg = isInProtectedRegion(loc, dimId);
      if (sourceReg && (getRegionConfig(sourceReg.id).explosionProtection ?? true)) {
        e.cancel = true;
        return;
      }
    }
    const impactedBlocks = e.getImpactedBlocks();
    if (!impactedBlocks.length) return;
    const blocksToDestroy = [];
    for (const block of impactedBlocks) {
      const blockReg = isInProtectedRegion(block.location, dimId);
      if (!blockReg || !(getRegionConfig(blockReg.id).explosionProtection ?? true)) {
        blocksToDestroy.push(block);
      }
    }
    if (blocksToDestroy.length === 0) {
      e.cancel = true;
    } else {
      e.setImpactedBlocks(blocksToDestroy);
    }
  });
  world.beforeEvents.itemUse.subscribe((e) => {
    try {
      const itemId = e.itemStack?.typeId;
      const player = e.source;
      if (!itemId || !player) return;
      const reg = isInProtectedRegion(player.location, player.dimension.id);
      if (!reg) return;
      if (BOW_ITEM_IDS.has(itemId) && hasAntiBowProtection(reg.id) && !isAuthorizedAdmin(player, reg.id)) {
        e.cancel = true;
        sendProtectionMessage(player, Lang.t(player, "lobby.protect.bow"));
      }
    } catch {}
  });
  world.afterEvents.itemStartUse?.subscribe?.((e) => {
    try {
      const itemId = e.itemStack?.typeId;
      if (!itemId || !BOW_ITEM_IDS.has(itemId)) return;
      const reg = isInProtectedRegion(e.source.location, e.source.dimension.id);
      if (!reg || !hasAntiBowProtection(reg.id) || isAuthorizedAdmin(e.source, reg.id)) return;
      sendProtectionMessage(e.source, Lang.t(e.source, "lobby.protect.bow"));
    } catch {}
  });
  world.afterEvents.entitySpawn?.subscribe?.((e) => {
    try {
      const entity = e.entity;
      if (!entity || !BOW_PROJECTILE_IDS.has(entity.typeId)) return;
      const reg = isInProtectedRegion(entity.location, entity.dimension.id);
      if (!reg || !hasAntiBowProtection(reg.id)) return;
      entity.remove();
    } catch {}
  });
  world.afterEvents.playerSpawn.subscribe(({ player }) => checkPlayerRegion(player));
  system.runInterval(() => {
    const now = Date.now(),
      players = world.getPlayers();
    if (partQ.length)
      partQ.splice(0, 15).forEach((p, i) =>
        system.runTimeout(() => {
          try {
            p.dim.runCommand(`particle ${p.type} ${p.loc.x + 0.5} ${p.loc.y + 0.5} ${p.loc.z + 0.5}`);
          } catch {}
        }, p.delay + i * 5),
      );
    players.forEach((p) => {
      const reg = isInProtectedRegion(p.location, p.dimension.id);
      if (!reg) {
        clearLobbyDamageEffect(p);
        return;
      }
      const conf = getRegionConfig(reg.id);
      const admin = isAuthorizedAdmin(p, reg.id);
      if (!admin && !isPlayerRankAllowed(p, conf)) {
        ejectPlayerFromRegion(p, reg, conf);
        return;
      }
      if (conf.mobSpawnProtection) {
        p.dimension
          .getEntities({ location: p.location, maxDistance: 24 })
          .filter(
            (e) =>
              e.id !== p.id &&
              !e.typeId.includes("player") &&
              !isEntityExcluded(e.typeId, reg.id) &&
              isInProtectedRegion(e.location, e.dimension.id)?.id === reg.id,
          )
          .forEach((e) => e.remove());
      }
      if (!admin) {
        if (conf.pvpProtection) try {
          p.runCommand("effect @s weakness 2 255 true");
        } catch {}
        if (conf.damageProtection) {
          applyLobbyDamageEffect(p);
        } else {
          clearLobbyDamageEffect(p);
        }
        if (conf.hungerProtection) try {
          p.runCommand("effect @s saturation 2 255 true");
        } catch {}
      } else {
        clearLobbyDamageEffect(p);
      }
    });
    const online = new Set(players.map((p) => p.id));
    [playerAreas, cache.lastPos, cache.lastReg].forEach((m) => {
      for (const k of m.keys()) if (!online.has(k)) m.delete(k);
    });
    for (const id of damageEffectPlayers) if (!online.has(id)) damageEffectPlayers.delete(id);
    players.forEach((p) => {
      try {
        if (p.getTags().some((t) => t.startsWith("loadchunck`"))) return;
        const { x, y, z } = p.location,
          pos = { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) },
          lp = cache.lastPos.get(p.id);
        if (lp && lp.x === pos.x && lp.y === pos.y && lp.z === pos.z) return;
        cache.lastPos.set(p.id, pos);
        const reg = isInProtectedRegion(pos, p.dimension.id),
          curId = reg?.id,
          prevId = cache.lastReg.get(p.id);
        if (curId !== prevId) {
          cache.lastReg.set(p.id, curId);
          checkPlayerRegion(p, reg);
        }
      } catch {}
    });
  }, 20);
}

export function checkPlayerRegion(player, region = undefined) {
  try {
    const reg =
      region === undefined
        ? isInProtectedRegion(player.location, player.dimension.id)
        : region;
    if (!reg) {
      if (playerAreas.has(player.id)) {
        deactivateLobbyMode(player);
        player.onScreenDisplay.setActionBar(Lang.t(player, "lobby.action.wilderness"));
        playerAreas.delete(player.id);
      }
      clearLobbyDamageEffect(player);
      if (player.hasTag(ADVENTURE_TAG)) {
        player.runCommand("gamemode survival");
        try { player.removeTag(ADVENTURE_TAG); } catch {}
      }
      return;
    }
    const conf = getRegionConfig(reg.id);
    const admin = isAuthorizedAdmin(player, reg.id);
    if (!admin && !isPlayerRankAllowed(player, conf)) {
      ejectPlayerFromRegion(player, reg, conf);
      return;
    }
    conf.lobbyInventoryEnabled ? activateLobbyMode(player) : deactivateLobbyMode(player);
    if (!admin && conf.damageProtection) applyLobbyDamageEffect(player);
    else clearLobbyDamageEffect(player);
    if (conf.adventureModeEnabled && !admin && !player.hasTag(ADVENTURE_TAG)) {
      player.runCommand("gamemode adventure");
      try { player.addTag(ADVENTURE_TAG); } catch {}
    }
    playerAreas.set(player.id, { regionId: reg.id, isProtected: true });
    if (conf.notifyOnEnter) {
      player.onScreenDisplay.setActionBar(
        admin
          ? Lang.t(player, "lobby.action.admin_zone")
          : Lang.t(player, "lobby.action.safe_zone"),
      );
    }
  } catch {}
}
