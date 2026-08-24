import { system, world } from "../../core.js";
import { isInProtectedRegion, getRegionConfig, getProtectedRegions } from "./config.js";
import { isAuthorizedAdmin, sendProtectionMessage } from "./utils.js";

const CROP_DATA = {
  "minecraft:wheat": { maxStage: 7 },
  "minecraft:carrots": { maxStage: 7 },
  "minecraft:potatoes": { maxStage: 7 },
  "minecraft:beetroot": { maxStage: 7 },
  "minecraft:melon_stem": { maxStage: 7 },
  "minecraft:pumpkin_stem": { maxStage: 7 },
  "minecraft:torchflower_crop": { maxStage: 7 },
  "minecraft:pitcher_crop": { maxStage: 4 },
  "minecraft:sweet_berry_bush": { maxStage: 3 },
  "minecraft:cocoa": { maxStage: 2 },
  "minecraft:nether_wart": { maxStage: 3 },
};
const CROP_TYPES = new Set(Object.keys(CROP_DATA));

const getMaxGrowthStage = (cropType) => CROP_DATA[cropType]?.maxStage ?? 7;

function getCropGrowthStage(block) {
  if (!block || !CROP_TYPES.has(block.typeId)) return null;
  try {
    const states = block.permutation.getAllStates();
    if ("growth" in states) return states.growth;
    if ("age" in states) return states.age;
    return 0;
  } catch {
    return 0;
  }
}

export const isFarmlandProtectedBlock = (blockTypeId, regionId) => {
  if (!CROP_TYPES.has(blockTypeId) && blockTypeId !== "minecraft:farmland") return false;
  return !!getRegionConfig(regionId).farmlandProtection;
};

function isFarmlandRegion(regionId) {
  return !!getRegionConfig(regionId).farmlandProtection;
}

function regionBounds(r) {
  return {
    minX: Math.min(r.pos1.x, r.pos2.x), maxX: Math.max(r.pos1.x, r.pos2.x),
    minY: Math.min(r.pos1.y, r.pos2.y), maxY: Math.max(r.pos1.y, r.pos2.y),
    minZ: Math.min(r.pos1.z, r.pos2.z), maxZ: Math.max(r.pos1.z, r.pos2.z),
  };
}

const KNOWN_FARMLAND = new Map();
const playerMsgCooldown = new Map();
let tick = 0;

function setblock(dim, x, y, z, blockStr) {
  try { dim.runCommand(`setblock ${x} ${y} ${z} ${blockStr} replace`); } catch { }
}

function clearDropsArea(dim, x, y, z) {
  try {
    const seen = new Set();
    for (const dy of [-1, 0, 1]) {
      try {
        const entities = dim.getEntities({
          type: "minecraft:item",
          location: { x, y: y + dy, z },
          maxDistance: 3,
        });
        for (const e of entities) {
          if (!seen.has(e.id)) { seen.add(e.id); try { e.remove(); } catch { } }
        }
      } catch { }
    }
  } catch { }
}

function restoreEntry(dim, entry) {
  if (tick - entry.restoreTick < 3) return;
  entry.restoreTick = tick;
  setblock(dim, entry.x, entry.y, entry.z, `minecraft:farmland ["moisturized_amount"=7]`);
  if (entry.cropType != null && entry.cropStage != null) {
    setblock(dim, entry.x, entry.y + 1, entry.z, `${entry.cropType} ["growth"=${entry.cropStage}]`);
  }
  clearDropsArea(dim, entry.x, entry.y, entry.z);
  system.runTimeout(() => { try { clearDropsArea(dim, entry.x, entry.y, entry.z); } catch { } }, 1);
  system.runTimeout(() => { try { clearDropsArea(dim, entry.x, entry.y, entry.z); } catch { } }, 2);
}

function checkKnownFarmlands() {
  for (const [posKey, entry] of KNOWN_FARMLAND.entries()) {
    try {
      let dim;
      try { dim = world.getDimension(entry.dimId); } catch { continue; }
      const block = dim.getBlock({ x: entry.x, y: entry.y, z: entry.z });
      if (!block) continue;
      const bReg = isInProtectedRegion({ x: entry.x, y: entry.y, z: entry.z }, entry.dimId);
      if (!bReg || !isFarmlandRegion(bReg.id)) {
        KNOWN_FARMLAND.delete(posKey);
        continue;
      }
      if (block.typeId === "minecraft:dirt") {
        restoreEntry(dim, entry);
      } else if (block.typeId === "minecraft:farmland") {
        const cropBlock = dim.getBlock({ x: entry.x, y: entry.y + 1, z: entry.z });
        if (cropBlock && CROP_TYPES.has(cropBlock.typeId)) {
          entry.cropType = cropBlock.typeId;
          entry.cropStage = getCropGrowthStage(cropBlock);
        } else if (cropBlock && cropBlock.typeId === "minecraft:air") {
          entry.cropType = null;
          entry.cropStage = null;
        }
      } else {
        KNOWN_FARMLAND.delete(posKey);
      }
    } catch { }
  }
}

function discoverFarmlandsAroundPlayers() {
  for (const player of world.getPlayers()) {
    try {
      if (!player?.isValid()) continue;
      const reg = isInProtectedRegion(player.location, player.dimension.id);
      if (!reg || !isFarmlandRegion(reg.id)) continue;
      const dim = player.dimension;
      const pLoc = player.location;
      const radius = 12;
      for (let x = Math.floor(pLoc.x) - radius; x <= Math.floor(pLoc.x) + radius; x++) {
        for (let z = Math.floor(pLoc.z) - radius; z <= Math.floor(pLoc.z) + radius; z++) {
          for (let y = Math.floor(pLoc.y) - 2; y <= Math.floor(pLoc.y) + 4; y++) {
            try {
              const posKey = `${x},${y},${z}:${dim.id}`;
              if (KNOWN_FARMLAND.has(posKey)) continue;
              const block = dim.getBlock({ x, y, z });
              if (!block || block.typeId !== "minecraft:farmland") continue;
              const bReg = isInProtectedRegion({ x, y, z }, dim.id);
              if (!bReg || !isFarmlandRegion(bReg.id)) continue;
              const cropBlock = dim.getBlock({ x, y: y + 1, z });
              const cropType = (cropBlock && CROP_TYPES.has(cropBlock.typeId)) ? cropBlock.typeId : null;
              const cropStage = cropBlock ? getCropGrowthStage(cropBlock) : null;
              KNOWN_FARMLAND.set(posKey, {
                x, y, z,
                dimId: dim.id,
                cropType,
                cropStage,
                time: Date.now(),
                restoreTick: 0,
              });
            } catch { }
          }
        }
      }
    } catch { }
  }
}

let scanRegions = [];
let scanRegionI = 0;
let curRegion = null;
let curBounds = null;
let scanX = 0;
let scanZ = 0;
let scanDimIds = [];

function advanceGlobalScan() {
  if (!curRegion) {
    if (scanRegionI >= scanRegions.length) { scanRegionI = 0; return; }
    curRegion = scanRegions[scanRegionI++];
    curBounds = regionBounds(curRegion);
    scanX = curBounds.minX;
    scanZ = curBounds.minZ;
    const conf = getRegionConfig(curRegion.id);
    scanDimIds = (conf.protectedDimensions || ["overworld"]).map(d => `minecraft:${d}`);
  }
  const b = curBounds;
  const COLS = 8;
  let n = 0;
  outer:
  for (; scanX <= b.maxX; scanX++) {
    for (; scanZ <= b.maxZ; scanZ++) {
      if (n++ >= COLS) break outer;
      for (const dimId of scanDimIds) {
        let dim;
        try { dim = world.getDimension(dimId); } catch { continue; }
        for (let y = b.minY; y <= b.maxY; y++) {
          try {
            const posKey = `${scanX},${y},${scanZ}:${dimId}`;
            if (KNOWN_FARMLAND.has(posKey)) continue;
            const block = dim.getBlock({ x: scanX, y, z: scanZ });
            if (!block || block.typeId !== "minecraft:farmland") continue;
            const cropBlock = dim.getBlock({ x: scanX, y: y + 1, z: scanZ });
            const cropType = (cropBlock && CROP_TYPES.has(cropBlock.typeId)) ? cropBlock.typeId : null;
            const cropStage = cropBlock ? getCropGrowthStage(cropBlock) : null;
            KNOWN_FARMLAND.set(posKey, {
              x: scanX, y, z: scanZ,
              dimId,
              cropType,
              cropStage,
              time: Date.now(),
              restoreTick: 0,
            });
          } catch { }
        }
      }
    }
    scanZ = b.minZ;
  }
  if (scanX > b.maxX) curRegion = null;
}

function sweepDropsOnFarmlands() {
  for (const player of world.getPlayers()) {
    try {
      if (!player?.isValid()) continue;
      const reg = isInProtectedRegion(player.location, player.dimension.id);
      if (!reg || !isFarmlandRegion(reg.id)) continue;
      const dim = player.dimension;
      try {
        const items = dim.getEntities({
          type: "minecraft:item",
          location: player.location,
          maxDistance: 16,
        });
        for (const item of items) {
          try {
            if (!item?.isValid()) continue;
            const ix = Math.floor(item.location.x);
            const iy = Math.floor(item.location.y);
            const iz = Math.floor(item.location.z);
            if (
              KNOWN_FARMLAND.has(`${ix},${iy - 1},${iz}:${dim.id}`) ||
              KNOWN_FARMLAND.has(`${ix},${iy},${iz}:${dim.id}`) ||
              KNOWN_FARMLAND.has(`${ix},${iy + 1},${iz}:${dim.id}`)
            ) {
              item.remove();
            }
          } catch { }
        }
      } catch { }
    } catch { }
  }
}

export function registerFarmlandEvents() {
  system.runInterval(() => {
    try {
      scanRegions = getProtectedRegions().filter(r => isFarmlandRegion(r.id));
      for (const [posKey, entry] of KNOWN_FARMLAND.entries()) {
        const bReg = isInProtectedRegion({ x: entry.x, y: entry.y, z: entry.z }, entry.dimId);
        if (!bReg || !isFarmlandRegion(bReg.id)) KNOWN_FARMLAND.delete(posKey);
      }
    } catch { }
  }, 100);

  system.runInterval(() => {
    try { advanceGlobalScan(); } catch { }
  }, 10);

  system.runInterval(() => {
    tick++;
    try { checkKnownFarmlands(); } catch { }
    if (tick % 5 === 0) {
      try { discoverFarmlandsAroundPlayers(); } catch { }
    }
    if (tick % 10 === 0) {
      try { sweepDropsOnFarmlands(); } catch { }
    }
    if (tick % 400 === 0) {
      const now = Date.now();
      for (const [key, entry] of KNOWN_FARMLAND.entries()) {
        if (now - entry.time > 180000) KNOWN_FARMLAND.delete(key);
      }
      for (const [id, t] of playerMsgCooldown.entries()) {
        if (now - t > 10000) playerMsgCooldown.delete(id);
      }
    }
  }, 1);

  world.beforeEvents.playerBreakBlock.subscribe((e) => {
    try {
      const { player, block } = e;
      if (!CROP_TYPES.has(block.typeId) && block.typeId !== "minecraft:farmland") return;
      const reg = isInProtectedRegion(block.location, block.dimension.id);
      if (!reg || !isFarmlandRegion(reg.id)) return;
      if (isAuthorizedAdmin(player, reg.id)) return;
      e.cancel = true;
      const loc = { x: block.location.x, y: block.location.y, z: block.location.z };
      const typeId = block.typeId;
      const dim = player.dimension;
      system.run(() => {
        try {
          if (typeId === "minecraft:farmland") {
            setblock(dim, loc.x, loc.y, loc.z, `minecraft:farmland ["moisturized_amount"=7]`);
          } else {
            const growthStage = getCropGrowthStage(block);
            setblock(dim, loc.x, loc.y, loc.z, `${typeId} ["growth"=${growthStage != null ? growthStage : getMaxGrowthStage(typeId)}]`);
          }
          clearDropsArea(dim, loc.x, loc.y, loc.z);
        } catch { }
      });
      system.runTimeout(() => { try { clearDropsArea(dim, loc.x, loc.y, loc.z); } catch { }; }, 2);
    } catch { }
  });

  world.beforeEvents.playerPlaceBlock.subscribe((e) => {
    try {
      const { player, block } = e;
      const reg = isInProtectedRegion(block.location, block.dimension.id);
      if (!reg || !isFarmlandRegion(reg.id)) return;
      if (isAuthorizedAdmin(player, reg.id)) return;
      const below = player.dimension.getBlock({
        x: block.location.x, y: block.location.y - 1, z: block.location.z,
      });
      if (below && below.typeId === "minecraft:farmland") {
        e.cancel = true;
        sendProtectionMessage(player, "§c⚠ §7Cannot place blocks on farmland!");
      }
    } catch { }
  });
}
