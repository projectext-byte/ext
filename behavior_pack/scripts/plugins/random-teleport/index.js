import { system, world, ActionFormData } from '../../core.js';
import { GlobalConfig } from "../../function/GlobalConfig.js";
import { Lang } from '../../lib/Lang.js';

const cooldowns = new Map();
const pending = new Map();
const rtpQueue = new Map();
const MAX_RETRIES = 5;
const DEFAULT_RTP_CONFIG = {
  maxUses: 3,
  cooldownTime: 5 * 60,
  maxDistance: 2000,
  teleportDelay: 3,
  allowOverworld: true,
  allowNether: true,
  allowTheEnd: false
};
const UNSAFE_BLOCKS = new Set([
  "minecraft:lava", "minecraft:flowing_lava",
  "minecraft:cactus", "minecraft:magma",
  "minecraft:sweet_berry_bush", "minecraft:fire",
  "minecraft:soul_fire", "minecraft:campfire",
  "minecraft:soul_campfire", "minecraft:wither_rose",
  "minecraft:powder_snow", "minecraft:pointed_dripstone"
]);

const actMsg = (pl, key, ...args) => `{"rawtext":[{"text":"${Lang.t(pl, key, ...args)}"}]}`;

function parseSavedRTPConfig(saved) {
  if (!saved) return {};
  if (typeof saved === "string") {
    try {
      return JSON.parse(saved);
    } catch {
      return {};
    }
  }
  return typeof saved === "object" ? saved : {};
}

function normalizeInteger(value, fallback, min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const integer = Math.floor(number);
  if (integer < min) return fallback;
  if (integer > Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;
  if (!Number.isSafeInteger(integer)) return fallback;
  return integer;
}

function normalizeRTPConfig(config = {}) {
  const source = parseSavedRTPConfig(config);
  return {
    maxUses: normalizeInteger(source.maxUses, DEFAULT_RTP_CONFIG.maxUses, 1),
    cooldownTime: normalizeInteger(source.cooldownTime, DEFAULT_RTP_CONFIG.cooldownTime, 0),
    maxDistance: normalizeInteger(source.maxDistance, DEFAULT_RTP_CONFIG.maxDistance, 1),
    teleportDelay: normalizeInteger(source.teleportDelay, DEFAULT_RTP_CONFIG.teleportDelay, 0),
    allowOverworld: typeof source.allowOverworld === "boolean" ? source.allowOverworld : DEFAULT_RTP_CONFIG.allowOverworld,
    allowNether: typeof source.allowNether === "boolean" ? source.allowNether : DEFAULT_RTP_CONFIG.allowNether,
    allowTheEnd: typeof source.allowTheEnd === "boolean" ? source.allowTheEnd : DEFAULT_RTP_CONFIG.allowTheEnd,
  };
}

function randomOffset(maxDistance) {
  const distance = normalizeInteger(maxDistance, DEFAULT_RTP_CONFIG.maxDistance, 1);
  const magnitude = Math.floor(Math.random() * (distance + 1));
  return Math.random() < 0.5 ? -magnitude : magnitude;
}

function clearAllRtpOldTags(pl) {
  pl.getTags().filter((t) => t.startsWith("rtpOld`")).forEach((t) => pl.removeTag(t));
}

function getDimYRange(dimId) {
  if (dimId === "minecraft:nether") return { top: 127, bottom: 0, fakeY: 128 };
  if (dimId === "minecraft:the_end") return { top: 255, bottom: 0, fakeY: 256 };
  return { top: 319, bottom: -64, fakeY: 320 };
}

function isAirLike(blk) {
  if (!blk) return false;
  return blk.isAir || blk.typeId === "minecraft:cave_air";
}

function isSafeGround(blk) {
  if (!blk || blk.isAir || blk.isLiquid) return false;
  if (blk.typeId === "minecraft:cave_air") return false;
  if (UNSAFE_BLOCKS.has(blk.typeId)) return false;
  if (blk.typeId.includes("leaves") || blk.typeId.includes("log")) return false;
  return true;
}

function findSurface(dim, x, z, topY, bottomY) {
  let y = topY;
  let blk;
  try { blk = dim.getBlock({ x, y, z }); } catch { return null; }
  if (!blk) return null;

  while (y >= bottomY) {
    if (!isAirLike(blk)) break;
    y--;
    try { blk = dim.getBlock({ x, y, z }); } catch { return null; }
    if (!blk) return null;
  }

  if (y < bottomY || !isSafeGround(blk)) return false;

  const above1 = dim.getBlock({ x, y: y + 1, z });
  const above2 = dim.getBlock({ x, y: y + 2, z });
  if (!above1 || !above2 || !isAirLike(above1) || !isAirLike(above2)) return false;

  let openAir = 2;
  for (let checkY = y + 3; checkY <= topY; checkY++) {
    const aboveBlk = dim.getBlock({ x, y: checkY, z });
    if (!aboveBlk || !isAirLike(aboveBlk)) break;
    openAir++;
  }

  if (openAir < 5) return false;

  return { x, y: blk.y, z };
}

function returnToOldLocation(pl) {
  try {
    const oldTag = pl.getTags().find((t) => t.startsWith("rtpOld`"));
    if (oldTag) {
      const { x, y, z, dim } = JSON.parse(oldTag.split("`")[1]);
      pl.teleport({ x, y, z }, { dimension: world.getDimension(dim) });
    }
    clearAllRtpOldTags(pl);
  } catch { }
  pl?.runCommand?.(`titleraw @s actionbar ${actMsg(pl, "rtp.error")}`);
}

export function random_tp(pl) {
  const cfg = getRTPConfig();
  const currentDim = pl.dimension.id;
  if (
    (currentDim === "minecraft:overworld" && !cfg.allowOverworld) ||
    (currentDim === "minecraft:nether" && !cfg.allowNether) ||
    (currentDim === "minecraft:the_end" && !cfg.allowTheEnd)
  ) {
    pl.runCommand(`titleraw @s actionbar ${actMsg(pl, "rtp.not_allowed")}`);
    return;
  }
  const now = Date.now();
  let ts = cooldowns.get(pl.name) || [];
  ts = ts.filter((t) => now - t < cfg.cooldownTime * 1000);
  if (ts.length >= cfg.maxUses) {
    const sisa = Math.ceil((cfg.cooldownTime * 1000 - (now - ts[0])) / 1000);
    pl.runCommand(`titleraw @s actionbar ${actMsg(pl, "rtp.cd", sisa)}`);
    return;
  }
  if (pending.has(pl.name) || rtpQueue.has(pl.name)) {
    pl.runCommand(`titleraw @s actionbar ${actMsg(pl, "rtp.under")}`);
    return;
  }
  const sisa = cfg.maxUses - ts.length;
  const dimName = currentDim.replace('minecraft:', '').replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
  new ActionFormData()
    .title(Lang.t(pl, "rtp.title"))
    .body(Lang.t(pl, "rtp.body", sisa, cfg.maxUses, cfg.maxDistance, dimName))
    .button(Lang.t(pl, "rtp.btn.tp"), "textures/ui/icon_winter")
    .divider()
    .button(Lang.t(pl, "rtp.btn.cancel"), "textures/ui/cancel")
    .show(pl)
    .then((res) => handleRTP(pl, ts, now, res))
    .catch(() => pl.runCommand(`titleraw @s actionbar ${actMsg(pl, "rtp.error")}`));
}

function doRandomTeleport(pl, ts, now) {
  const cfg = getRTPConfig();
  const dimId = pl.dimension.id;
  const { top, bottom, fakeY } = getDimYRange(dimId);
  const x = randomOffset(cfg.maxDistance);
  const z = randomOffset(cfg.maxDistance);
  const loc = { x, y: fakeY, z };
  const oldLoc = { ...pl.location, dim: dimId };
  pl.addTag(`rtpOld\`${JSON.stringify(oldLoc)}`);
  try {
    if (!pl || !pl.dimension) throw new Error("Player tidak valid");
    try { deactivateLobbyMode(pl); } catch (e) { }
    if (pl.hasTag("lobby_adventure_mode")) {
      try { pl.runCommand("gamemode survival"); pl.removeTag("lobby_adventure_mode"); } catch {}
    }
    pl.teleport(loc, { dimension: pl.dimension });
    rtpQueue.set(pl.name, {
      loc, old: oldLoc, dim: dimId,
      topY: top, bottomY: bottom, fakeY,
      waitTicks: 120, retries: 0, chunkWaitCount: 0, totalTicks: 0
    });
    pl.runCommand(`titleraw @s actionbar ${actMsg(pl, "rtp.wait")}`);
    ts.push(now);
    cooldowns.set(pl.name, ts);
  } catch (e) {
    clearAllRtpOldTags(pl);
    pending.delete(pl.name);
    rtpQueue.delete(pl.name);
    pl?.runCommand?.(`titleraw @s actionbar ${actMsg(pl, "rtp.error")}`);
  }
}
function doRandomTeleportWithCountdown(pl, ts, now, cb) {
  const cfg = getRTPConfig();
  const DELAY = normalizeInteger(cfg.teleportDelay, DEFAULT_RTP_CONFIG.teleportDelay, 0);
  if (DELAY <= 0) {
    cb();
    return;
  }
  const pos0 = pl.location;
  let cd = DELAY,
    frame = 0;
  pending.set(pl.name, true);
  const barLen = 10;
  const intv = system.runInterval(() => {
    const pos = pl.location;
    if (
      Math.abs(pos.x - pos0.x) > 0.1 ||
      Math.abs(pos.y - pos0.y) > 0.1 ||
      Math.abs(pos.z - pos0.z) > 0.1
    ) {
      system.clearRun(intv);
      pending.delete(pl.name);
      pl.runCommand(`titleraw @s actionbar ${actMsg(pl, "rtp.move")}`);
      return;
    }
    const totalFrames = DELAY * 20;
    const progress = (cd / DELAY) * barLen - (frame / totalFrames) * barLen;
    const trans = ["▏", "▎", "▍", "▌", "▋", "▊", "▉"];
    const full = Math.max(0, Math.floor(progress));
    let bar = "█".repeat(full);
    const frac = progress - full;
    if (frac > 0 && full < barLen)
      bar += trans[Math.floor(frac * trans.length)];
    bar += " ".repeat(Math.max(0, barLen - bar.length));
    pl.onScreenDisplay.setActionBar(Lang.t(pl, "rtp.countdown", `§b${bar}`, cd));
    frame++;
    if (frame >= 20) {
      frame = 0;
      cd--;
    }
    if (cd <= 0) {
      system.clearRun(intv);
      pending.delete(pl.name);
      cb();
    }
  }, 1);
}
function handleRTP(pl, ts, now, res) {
  if (res.canceled || res.selection === 1) {
    pl.runCommand(`titleraw @s actionbar ${actMsg(pl, "rtp.cancel")}`);
    return;
  }
  try {
    doRandomTeleportWithCountdown(pl, ts, now, () =>
      doRandomTeleport(pl, ts, now),
    );
  } catch {
    pl.runCommand(`titleraw @s actionbar ${actMsg(pl, "rtp.error")}`);
    pending.delete(pl.name);
  }
}
system.runInterval(() => {
  for (const [name, data] of rtpQueue) {
    const pl = world.getPlayers().find((p) => p.name === name);
    if (!pl) { rtpQueue.delete(name); continue; }

    data.totalTicks++;
    if (data.totalTicks > 600) {
      returnToOldLocation(pl);
      rtpQueue.delete(name);
      continue;
    }

    if (data.waitTicks > 0) {
      data.waitTicks--;
      try {
        pl.teleport({ x: data.loc.x, y: data.fakeY, z: data.loc.z }, { dimension: pl.dimension });
      } catch { }
      continue;
    }

    const result = findSurface(pl.dimension, data.loc.x, data.loc.z, data.topY, data.bottomY);

    if (result === null) {
      data.chunkWaitCount = (data.chunkWaitCount || 0) + 1;
      if (data.chunkWaitCount > 15) {
        data.retries++;
        data.chunkWaitCount = 0;
        if (data.retries >= MAX_RETRIES) {
          returnToOldLocation(pl);
          rtpQueue.delete(name);
          continue;
        }
        const cfg = getRTPConfig();
        const { top, bottom, fakeY } = getDimYRange(data.dim);
        data.loc.x = randomOffset(cfg.maxDistance);
        data.loc.z = randomOffset(cfg.maxDistance);
        data.loc.y = fakeY;
        data.fakeY = fakeY;
        data.topY = top;
        data.bottomY = bottom;
        data.waitTicks = 120;
        try { pl.teleport(data.loc, { dimension: pl.dimension }); } catch { }
      } else {
        data.waitTicks = 120;
      }
      continue;
    }

    if (result === false) {
      data.retries++;
      if (data.retries >= MAX_RETRIES) {
        returnToOldLocation(pl);
        rtpQueue.delete(name);
      } else {
        const cfg = getRTPConfig();
        const { top, bottom, fakeY } = getDimYRange(data.dim);
        data.loc.x = randomOffset(cfg.maxDistance);
        data.loc.z = randomOffset(cfg.maxDistance);
        data.loc.y = fakeY;
        data.fakeY = fakeY;
        data.topY = top;
        data.bottomY = bottom;
        data.waitTicks = 120;
        try { pl.teleport(data.loc, { dimension: pl.dimension }); } catch { }
      }
      continue;
    }

    const fy = result.y + 1;
    try {
      pl.teleport(
        { x: result.x + 0.5, y: fy, z: result.z + 0.5 },
        { dimension: pl.dimension },
      );
      clearAllRtpOldTags(pl);
      pl.onScreenDisplay.updateSubtitle(
        Lang.t(pl, "rtp.success", Math.round(result.x + 0.5), fy, Math.round(result.z + 0.5))
      );
      pl.runCommand("playsound mob.endermen.portal @s ~ ~ ~ 1 1 1");
    } catch (e) {
      pl?.runCommand?.(`titleraw @s actionbar ${actMsg(pl, "rtp.error")}`);
    }
    rtpQueue.delete(name);
  }
}, 2);
world.beforeEvents.playerLeave.subscribe(({ player: pl }) => {
  if (pending.has(pl.name)) pending.delete(pl.name);
  if (rtpQueue.has(pl.name)) rtpQueue.delete(pl.name);
  const old = pl.getTags().find((t) => t.startsWith("rtpOld`"));
  if (old) {
    const { x, y, z, dim } = JSON.parse(old.split("`")[1]);
    system.run(() => {
      try {
        pl.teleport({ x, y, z }, { dimension: world.getDimension(dim) });
      } catch { } finally {
        clearAllRtpOldTags(pl);
      }
    });
  }
});
export function getRTPConfig() {
  try {
    const s = GlobalConfig.get("rtpConfig");
    if (s) {
      return normalizeRTPConfig(s);
    }
  } catch { }
  return { ...DEFAULT_RTP_CONFIG };
}
export function random_tp_instant(pl) {
  const cfg = getRTPConfig();
  const currentDim = pl.dimension.id;
  if (
    (currentDim === "minecraft:overworld" && !cfg.allowOverworld) ||
    (currentDim === "minecraft:nether" && !cfg.allowNether) ||
    (currentDim === "minecraft:the_end" && !cfg.allowTheEnd)
  ) {
    system.run(() => {
      pl.runCommand(`titleraw @s actionbar ${actMsg(pl, "rtp.not_allowed")}`);
    });
    return;
  }
  const now = Date.now();
  let ts = cooldowns.get(pl.name) || [];
  ts = ts.filter((t) => now - t < cfg.cooldownTime * 1000);
  if (ts.length >= cfg.maxUses) {
    const sisa = Math.ceil((cfg.cooldownTime * 1000 - (now - ts[0])) / 1000);
    system.run(() => {
      pl.runCommand(`titleraw @s actionbar ${actMsg(pl, "rtp.cd", sisa)}`);
    });
    return;
  }
  if (pending.has(pl.name) || rtpQueue.has(pl.name)) {
    system.run(() => {
      pl.runCommand(`titleraw @s actionbar ${actMsg(pl, "rtp.under")}`);
    });
    return;
  }
  system.run(() => {
    doRandomTeleportWithCountdown(pl, ts, now, () =>
      doRandomTeleport(pl, ts, now),
    );
  });
}
