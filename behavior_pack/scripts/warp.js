import { system, world, ActionFormData, ModalFormData } from "./core.js";
import {
  CACHE_CONFIG,
  TELEPORT_CONFIG,
  STORAGE_CONFIG,
  ICONS,
  PROGRESS_CHARS,
  SOUNDS,
  PERMISSIONS,
  MINECRAFT,
  isValidCoords,
} from "./optimization.js";
import { hasWarpAccess } from "./plugins/ranks/rank_benefits.js";
import { Lang } from "./lib/Lang.js";
class WarpState {
  constructor() {
    this.cache = null;
    this.cacheTime = 0;
    this.cooldowns = new Map();
    this.activeTeleports = new Map();
    this.playerMap = new Map();
  }
  getWarps() {
    const now = Date.now();
    if (this.cache && now - this.cacheTime < CACHE_CONFIG.WARP_CACHE_TTL) {
      return this.cache;
    }
    this.cache = loadWarpsFromStorage();
    this.cacheTime = now;
    return this.cache;
  }
  invalidate() {
    this.cache = null;
    this.cacheTime = 0;
  }
  getPlayer(id) {
    return this.playerMap.get(id);
  }
  refreshPlayers() {
    try {
      this.playerMap.clear();
      for (const p of world.getPlayers()) {
        this.playerMap.set(p.id, p);
      }
    } catch {
      this.playerMap.clear();
    }
  }
  isOnCooldown(playerId) {
    const until = this.cooldowns.get(playerId);
    return until && Date.now() < until;
  }
  getCooldownRemaining(playerId) {
    const until = this.cooldowns.get(playerId);
    return until ? Math.ceil((until - Date.now()) / 1000) : 0;
  }
  setCooldown(playerId) {
    this.cooldowns.set(playerId, Date.now() + TELEPORT_CONFIG.COOLDOWN);
  }
  cleanup() {
    const now = Date.now();
    let onlineIds;
    try {
      onlineIds = new Set(world.getPlayers().map((p) => p.id));
    } catch {
      return;
    }
    for (const [id, until] of this.cooldowns) {
      if (!onlineIds.has(id) || now > until + TELEPORT_CONFIG.COOLDOWN * 2) {
        this.cooldowns.delete(id);
      }
    }
    for (const [id, data] of this.activeTeleports) {
      if (!onlineIds.has(id) || (data.completed && now > data.time + 5000)) {
        this.activeTeleports.delete(id);
      }
    }
    this.refreshPlayers();
  }
}
const state = new WarpState();
function loadWarpsFromStorage() {
  try {
    const meta = world.getDynamicProperty(STORAGE_CONFIG.META_KEY);
    if (meta) {
      const metaData = JSON.parse(meta);
      if (metaData.isChunked) {
        return loadChunkedWarps(metaData.chunkCount);
      }
    }
    const data = world.getDynamicProperty(STORAGE_CONFIG.WARP_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}
function loadChunkedWarps(chunkCount) {
  const warps = [];
  for (let i = 0; i < chunkCount; i++) {
    const chunk = world.getDynamicProperty(STORAGE_CONFIG.CHUNK_PREFIX + i);
    if (chunk) {
      try {
        warps.push(...JSON.parse(chunk));
      } catch {
        continue;
      }
    }
  }
  return warps;
}
function saveWarps(warps) {
  try {
    const json = JSON.stringify(warps);
    if (warps.length > STORAGE_CONFIG.MAX_WARPS_PER_CHUNK) {
      saveChunked(warps);
    } else {
      world.setDynamicProperty(STORAGE_CONFIG.WARP_KEY, json);
      clearChunks();
    }
    state.cache = warps;
    state.cacheTime = Date.now();
  } catch (e) {
    console.warn("Failed to save warps:", e);
  }
}
function saveChunked(warps) {
  clearChunks();
  const max = STORAGE_CONFIG.MAX_WARPS_PER_CHUNK;
  const chunks = [];
  for (let i = 0; i < warps.length; i += max) {
    chunks.push(warps.slice(i, i + max));
  }
  chunks.forEach((chunk, i) => {
    world.setDynamicProperty(
      STORAGE_CONFIG.CHUNK_PREFIX + i,
      JSON.stringify(chunk),
    );
  });
  world.setDynamicProperty(
    STORAGE_CONFIG.META_KEY,
    JSON.stringify({
      isChunked: true,
      chunkCount: chunks.length,
      totalWarps: warps.length,
      lastUpdated: Date.now(),
    }),
  );
}
function clearChunks() {
  for (let i = 0; i < STORAGE_CONFIG.MAX_CHUNK_CLEANUP; i++) {
    world.setDynamicProperty(STORAGE_CONFIG.CHUNK_PREFIX + i, undefined);
  }
  world.setDynamicProperty(STORAGE_CONFIG.META_KEY, undefined);
}
const PROGRESS_BARS = (() => {
  const bars = [];
  const { FULL, EMPTY, TRANSITIONS } = PROGRESS_CHARS;
  const length = TELEPORT_CONFIG.PROGRESS_BAR_LENGTH;
  const totalFrames = TELEPORT_CONFIG.COUNTDOWN_DURATION * MINECRAFT.TICKS_PER_SECOND;
  for (let frame = 0; frame <= totalFrames; frame++) {
    const remaining = totalFrames - frame;
    const filled = (remaining / totalFrames) * length;
    const fullCount = Math.floor(filled);
    const frac = filled - fullCount;
    let bar = FULL.repeat(fullCount);
    if (frac > 0 && fullCount < length) {
      const transIndex = Math.floor(frac * TRANSITIONS.length);
      bar += TRANSITIONS[Math.min(transIndex, TRANSITIONS.length - 1)];
    }
    bar += EMPTY.repeat(Math.max(0, length - bar.length));
    bars.push(bar);
  }
  return bars;
})();
const TP_TICKS_TOTAL = TELEPORT_CONFIG.COUNTDOWN_DURATION * MINECRAFT.TICKS_PER_SECOND;
function startTeleport(player, warp) {
  if (state.activeTeleports.has(player.id)) {
    player.sendMessage("§c" + Lang.t(player, "warp.already_teleporting"));
    return;
  }
  if (state.isOnCooldown(player.id)) {
    player.sendMessage(
      "§c" + Lang.t(player, "warp.cooldown", state.getCooldownRemaining(player.id)),
    );
    return;
  }
  const { x, y, z } = player.location;
  state.setCooldown(player.id);
  state.activeTeleports.set(player.id, {
    player,
    warp,
    startPos: { x, y, z },
    frame: 0,
    completed: false,
    time: Date.now(),
  });
  player.sendMessage("§e" + Lang.t(player, "warp.teleporting"));
}
function processAllTeleports() {
  if (state.activeTeleports.size === 0) return;
  for (const [playerId, data] of state.activeTeleports) {
    if (data.completed) continue;
    const { player, warp, startPos, frame } = data;
    try {
      player.location;
    } catch {
      state.activeTeleports.delete(playerId);
      continue;
    }
    const pos = player.location;
    const moved =
      Math.abs(pos.x - startPos.x) > TELEPORT_CONFIG.MOVEMENT_TOLERANCE ||
      Math.abs(pos.y - startPos.y) > TELEPORT_CONFIG.MOVEMENT_TOLERANCE ||
      Math.abs(pos.z - startPos.z) > TELEPORT_CONFIG.MOVEMENT_TOLERANCE;
    if (moved) {
      player.sendMessage("§c" + Lang.t(player, "warp.cancelled"));
      player.runCommand(`playsound ${SOUNDS.ERROR} @s`);
      state.activeTeleports.delete(playerId);
      continue;
    }
    const remainingTicks = TP_TICKS_TOTAL - frame;
    const cd = Math.ceil(remainingTicks / MINECRAFT.TICKS_PER_SECOND);
    const bar = PROGRESS_BARS[frame] || PROGRESS_BARS[PROGRESS_BARS.length - 1];
    player.onScreenDisplay.setActionBar(`§e⚡ Teleporting [§b${bar}§e] §b${cd}s`);
    if (frame % MINECRAFT.TICKS_PER_SECOND === 0) {
      const pitch = 0.8 + cd * 0.2;
      player.runCommand(`playsound ${SOUNDS.TICK} @s ~ ~ ~ 0.5 ${pitch}`);
    }
    data.frame++;
    if (data.frame > TP_TICKS_TOTAL) {
      executeTeleport(player, warp);
      data.completed = true;
    }
  }
}
function executeTeleport(player, warp) {
  const { Name, Pos, Dimension, WelcomeMessage } = warp;
  player.runCommand(`gamerule sendcommandfeedback false`);
  try {
    player.runCommand(`execute in ${Dimension} run tp @s ${Pos}`);
    player.sendMessage(Lang.t(player, "warp.success", Name));
    if (WelcomeMessage) player.sendMessage(WelcomeMessage);
    player.onScreenDisplay.setActionBar("§a" + Lang.t(player, "warp.arrived"));
    player.runCommand(`playsound ${SOUNDS.SUCCESS} @s`);
  } catch {
    player.sendMessage("§c" + Lang.t(player, "warp.failed"));
    player.onScreenDisplay.setActionBar("§c" + Lang.t(player, "warp.failed"));
    player.runCommand(`playsound ${SOUNDS.ERROR} @s`);
  } finally {
    player.runCommand(`gamerule sendcommandfeedback true`);
  }
}
const getFormTitle = (player, key) => {
  const titles = {
    WARP_LIST: Lang.t(player, "warp.list.title"),
    CREATE: Lang.t(player, "warp.create.title"),
    EDIT: Lang.t(player, "warp.edit.title"),
    REMOVE: Lang.t(player, "warp.remove.title"),
    MANAGE: Lang.t(player, "warp.menu.title"),
  };
  return titles[key];
};
function createWarpListForm(warps, player) {
  const fm = new ActionFormData()
    .title(getFormTitle(player, "WARP_LIST"))
    .body(Lang.t(player, "warp.list.body") + "\n");
  if (warps.length === 0) {
    const buttonText = player.hasTag(PERMISSIONS.ADMIN_TAG)
      ? `${Lang.t(player, "warp.list.none")}\n${Lang.t(player, "warp.list.add_hint")}`
      : Lang.t(player, "warp.list.none");
    fm.button(buttonText, ICONS.COMMON.CONSTRUCTION);
    return fm;
  }
  for (const warp of warps) {
    const icon = warp.Icon || ICONS.DEFAULT_WARPS[0];
    const desc = warp.Description || `Location: ${warp.Pos}`;
    fm.button(`${warp.Name}\n${desc}`, icon);
  }
  return fm;
}
function createEditForm(warp, player) {
  const iconIndex = Math.max(0, ICONS.EDIT_WARPS.indexOf(warp.Icon));
  return new ModalFormData()
    .title(getFormTitle(player, "EDIT"))
    .textField(Lang.t(player, "warp.create.name"), Lang.t(player, "warp.create.name.placeholder"), {
      defaultValue: warp.Name,
    })
    .textField(Lang.t(player, "warp.create.desc"), Lang.t(player, "warp.create.desc.placeholder"), {
      defaultValue: warp.Description || "",
    })
    .dropdown(
      Lang.t(player, "warp.create.icon"),
      ICONS.EDIT_WARPS.map((i) => i.split("/").pop()),
      { defaultValue: iconIndex },
    )
    .toggle(Lang.t(player, "warp.create.use_current"), { defaultValue: false })
    .textField(Lang.t(player, "warp.create.coords"), "100 64 -200", {
      defaultValue: warp.Pos,
    })
    .toggle(Lang.t(player, "warp.create.welcome"), { defaultValue: !!warp.WelcomeMessage })
    .textField(Lang.t(player, "warp.create.welcome.msg"), Lang.t(player, "warp.create.welcome.placeholder"), {
      defaultValue: warp.WelcomeMessage || Lang.t(player, "warp.create.welcome.placeholder"),
    });
}
function createCreateForm(player) {
  return new ModalFormData()
    .title(getFormTitle(player, "CREATE"))
    .textField(Lang.t(player, "warp.create.name"), Lang.t(player, "warp.create.name.placeholder"), {
      defaultValue: "",
      placeholder: "enter name",
    })
    .textField(Lang.t(player, "warp.create.desc"), Lang.t(player, "warp.create.desc.placeholder"), {
      defaultValue: "",
      placeholder: "enter description",
    })
    .dropdown(
      Lang.t(player, "warp.create.icon"),
      ICONS.DEFAULT_WARPS.map((i) => i.split("/").pop()),
      { defaultValue: 0 },
    )
    .toggle(Lang.t(player, "warp.create.use_current"), { defaultValue: true })
    .textField(Lang.t(player, "warp.create.coords"), "100 64 -200", {
      defaultValue: "~ ~ ~",
    })
    .toggle(Lang.t(player, "warp.create.welcome"), { defaultValue: false })
    .textField(Lang.t(player, "warp.create.welcome.msg"), Lang.t(player, "warp.create.welcome.placeholder"), {
      defaultValue: Lang.t(player, "warp.create.welcome.placeholder"),
    });
}
export function ShowAvailableWarps(player) {
  const warps = state.getWarps();
  const form = createWarpListForm(warps, player);
  form.show(player).then((response) => {
    if (response.canceled || response.selection === undefined) return;
    if (warps.length === 0) {
      if (player.hasTag(PERMISSIONS.ADMIN_TAG)) {
        createWarp(player);
        return;
      }
      player.sendMessage("§c" + Lang.t(player, "warp.list.none.msg"));
      return;
    }
    const selected = warps[response.selection];
    if (!selected) return;
    if (!hasWarpAccess(player, selected.Name)) {
      player.sendMessage("§c" + Lang.t(player, "warp.no_access"));
      player.runCommand(`playsound ${SOUNDS.ERROR} @s`);
      return;
    }
    startTeleport(player, selected);
    player.runCommand(`playsound ${SOUNDS.CLICK} @s`);
  });
}
export function createWarp(player) {
  if (!player.hasTag(PERMISSIONS.ADMIN_TAG)) {
    player.sendMessage("§c" + Lang.t(player, "warp.no_permission", "create"));
    return;
  }
  createCreateForm(player).show(player).then((response) => {
    if (!response || response.canceled) return;
    const [
      name,
      desc,
      iconIndex,
      useCurrent,
      coords,
      hasWelcome,
      welcomeMsg,
    ] = response.formValues;
    if (!name?.trim()) {
      player.sendMessage("§c" + Lang.t(player, "warp.invalid_name"));
      return;
    }
    const warps = state.getWarps();
    const nameLower = name.toLowerCase();
    if (warps.some((w) => w.Name.toLowerCase() === nameLower)) {
      player.sendMessage("§c" + Lang.t(player, "warp.invalid_name"));
      return;
    }
    let pos;
    if (useCurrent) {
      const { x, y, z } = player.location;
      pos = `${Math.floor(x)} ${Math.floor(y)} ${Math.floor(z)}`;
    } else {
      if (!isValidCoords(coords)) {
        player.sendMessage("§c" + Lang.t(player, "warp.invalid_coords"));
        return;
      }
      pos = coords;
    }
    warps.push({
      Name: name,
      Description: desc?.trim() || undefined,
      Icon: ICONS.DEFAULT_WARPS[iconIndex],
      Pos: pos,
      Dimension: player.dimension.id.replace("minecraft:", ""),
      WelcomeMessage: hasWelcome ? welcomeMsg : undefined,
    });
    saveWarps(warps);
    player.sendMessage("§a" + Lang.t(player, "warp.created", name));
    player.runCommand(`playsound ${SOUNDS.SUCCESS} @s`);
  });
}
export function removeWarp(player) {
  if (!player.hasTag(PERMISSIONS.ADMIN_TAG)) {
    player.sendMessage("§c" + Lang.t(player, "warp.no_permission", "remove"));
    return;
  }
  const warps = state.getWarps();
  if (warps.length === 0) {
    player.sendMessage("§c" + Lang.t(player, "warp.list.none.msg"));
    return;
  }
  new ActionFormData()
    .title(getFormTitle(player, "REMOVE"))
    .body(Lang.t(player, "warp.remove.body").replace("\\n", "\n"))
    .button(Lang.t(player, "warp.remove.single"), ICONS.COMMON.TRASH)
    .button(Lang.t(player, "warp.remove.all"), ICONS.COMMON.ICON_TRASH)
    .show(player)
    .then((response) => {
      if (!response || response.canceled) return;
      if (response.selection === 0) {
        new ModalFormData()
          .title(Lang.t(player, "warp.remove.select"))
          .dropdown(Lang.t(player, "warp.select.warp"), warps.map((w) => w.Name), { defaultValue: 0 })
          .show(player)
          .then((resp) => {
            if (!resp || resp.canceled) return;
            const index = resp.formValues[0];
            const name = warps[index].Name;
            warps.splice(index, 1);
            saveWarps(warps);
            player.sendMessage("§a" + Lang.t(player, "warp.removed", name));
            player.runCommand(`playsound ${SOUNDS.BREAK} @s`);
          });
      } else if (response.selection === 1) {
        warps.length = 0;
        saveWarps(warps);
        player.sendMessage("§a" + Lang.t(player, "warp.list.none.msg").replace("Belum ada", "Semua").replace("yang dibuat", "telah dihapus"));
        player.runCommand(`playsound ${SOUNDS.BREAK} @s`);
      }
    });
}
export function EditWarp(player) {
  if (!player.hasTag(PERMISSIONS.ADMIN_TAG)) {
    player.sendMessage("§c" + Lang.t(player, "warp.no_permission", "edit"));
    ShowAvailableWarps(player);
    return;
  }
  const warps = state.getWarps();
  const form = new ActionFormData()
    .title(getFormTitle(player, "MANAGE"))
    .body(Lang.t(player, "warp.menu.body"))
    .button(Lang.t(player, "warp.btn.create"), ICONS.COMMON.CONSTRUCTION)
    .button(Lang.t(player, "warp.btn.delete"), ICONS.COMMON.TRASH);
  for (const warp of warps) {
    form.button(
      `${warp.Name}\n${warp.Description || warp.Pos}`,
      warp.Icon || ICONS.DEFAULT_WARPS[0],
    );
  }
  form.show(player).then((response) => {
    if (!response || response.canceled) return;
    const selection = response.selection;
    if (selection === 0) {
      createWarp(player);
      return;
    }
    if (selection === 1) {
      removeWarp(player);
      return;
    }
    const warpIndex = selection - 2;
    const warp = warps[warpIndex];
    if (!warp) {
      player.sendMessage("§c" + Lang.t(player, "warp.not_found"));
      return;
    }
    createEditForm(warp, player).show(player).then((editResp) => {
      if (!editResp || editResp.canceled) return;
      const [
        newName,
        newDesc,
        iconIndex,
        useCurrent,
        coords,
        hasWelcome,
        welcomeMsg,
      ] = editResp.formValues;
      if (!newName?.trim()) {
        player.sendMessage("§c" + Lang.t(player, "warp.invalid_name"));
        return;
      }
      const nameLower = newName.toLowerCase();
      if (
        newName !== warp.Name &&
        warps.some((w, i) => i !== warpIndex && w.Name.toLowerCase() === nameLower)
      ) {
        player.sendMessage("§c" + Lang.t(player, "warp.invalid_name"));
        return;
      }
      let pos;
      if (useCurrent) {
        const { x, y, z } = player.location;
        pos = `${Math.floor(x)} ${Math.floor(y)} ${Math.floor(z)}`;
      } else {
        if (!isValidCoords(coords)) {
          player.sendMessage("§c" + Lang.t(player, "warp.invalid_coords"));
          return;
        }
        pos = coords;
      }
      warp.Name = newName;
      warp.Description = newDesc?.trim() || undefined;
      warp.Icon = ICONS.EDIT_WARPS[iconIndex];
      warp.Pos = pos;
      warp.WelcomeMessage = hasWelcome ? welcomeMsg : undefined;
      saveWarps(warps);
      player.sendMessage("§a" + Lang.t(player, "warp.updated", newName));
      player.runCommand(`playsound ${SOUNDS.SUCCESS} @s`);
    });
  });
}
export function getAllWarps() {
  return state.getWarps();
}
export function invalidateCache() {
  state.invalidate();
}
export function teleportToWarp(player, warps, index) {
  if (index >= 0 && index < warps.length) {
    startTeleport(player, warps[index]);
  }
}
system.runInterval(() => {
  state.cleanup();
}, CACHE_CONFIG.CACHE_CLEANUP_INTERVAL);
system.runInterval(() => {
  processAllTeleports();
}, TELEPORT_CONFIG.ANIMATION_INTERVAL);
