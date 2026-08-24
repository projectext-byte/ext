import { ActionFormData, ModalFormData, system, world } from "../../core.js";
import { getSethomeBenefits } from "../ranks/rank_benefits.js";
import { GlobalConfig } from "../../function/GlobalConfig.js";
import { Lang } from "../../lib/Lang.js";
const HOME_DP_PREFIX = "sethome:";
import {
  SETHOME_CONFIG,
  SETHOME_ICONS,
  PlayerCache,
  CooldownManager,
  RateLimiter,
  PROGRESS_CHARS,
} from "../../optimization.js";
const getHomeCfg = () => {
  const defaults = {
    maxHomes: SETHOME_CONFIG.DEFAULT_MAX_HOMES,
    minY: SETHOME_CONFIG.MIN_Y,
    teleportDelay: SETHOME_CONFIG.TELEPORT_DELAY,
  };
  const numberOr = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };
  const normalize = (cfg) => ({
    maxHomes: Math.max(1, numberOr(cfg?.maxHomes, defaults.maxHomes)),
    minY: numberOr(cfg?.minY, defaults.minY),
    teleportDelay: Math.max(1, numberOr(cfg?.teleportDelay, defaults.teleportDelay)),
  });
  try {
    const legacy = world.getDynamicProperty("homeConfig");
    if (legacy) {
      const parsedLegacy = typeof legacy === "string" ? JSON.parse(legacy) : legacy;
      GlobalConfig.set("homeConfig", parsedLegacy);
      try { world.setDynamicProperty("homeConfig", undefined); } catch { }
      return normalize(parsedLegacy);
    }
    const s = GlobalConfig.get("homeConfig");
    return normalize(s ? (typeof s === "string" ? JSON.parse(s) : s) : defaults);
  } catch {
    return defaults;
  }
};
const ICONS = SETHOME_ICONS;
const iconKeys = Object.keys(ICONS);
const SETHOME_TIME_MARKERS = {
  morning: "",
  day: "",
  evening: "",
  night: "",
};
const SETHOME_MENU_MARKER = "";
const SETHOME_TELEPORT_GRID_MARKER = "";
const SETHOME_TIME_ICONS = {
  morning: "textures/ui/icon_bell",
  day: "textures/ui/icon_bell",
  evening: "textures/ui/icon_bell",
  night: "textures/ui/icon_bell",
};
const homeCache = new PlayerCache();
const teleportCooldowns = new CooldownManager();
const operationRateLimiter = new RateLimiter();
const activeTeleports = new Map();
system.runInterval(() => {
  homeCache.cleanup();
  teleportCooldowns.cleanup();
  operationRateLimiter.cleanup();
}, 100);
const rawMsg = (text) => `{"rawtext":[{"text":"${text.replace(/"/g, '\\"')}"}]}`;
const getSethomeTimeMode = () => {
  let time = 0;
  try {
    time = world.getTimeOfDay();
  } catch { }
  time = ((time % 24000) + 24000) % 24000;
  if (time < 6000) return "morning";
  if (time < 12000) return "day";
  if (time < 18000) return "evening";
  return "night";
};
const sethomeTitle = (pl, key, ...args) => {
  return Lang.t(pl, key, ...args);
};
const getSethomeTimeIcon = () => SETHOME_TIME_ICONS[getSethomeTimeMode()];
const buildHomeSlotIndicator = (used, max) => {
  const total = Math.max(1, Number(max) || 1);
  const filled = Math.max(0, Math.min(Number(used) || 0, total));
  const visibleSlots = Math.min(total, 24);
  const slot = "\u25AC";
  let text = "";
  for (let i = 0; i < visibleSlots; i++) {
    text += `${i < filled ? "\u00A7c" : "\u00A7a"}${slot}`;
    if (visibleSlots <= 14 && i < visibleSlots - 1) text += " ";
  }
  if (total > visibleSlots) text += ` \u00A77+${total - visibleSlots}`;
  return text;
};
const plainSethomeText = (text) => String(text).replace(/(?:Â§|§)./g, "");
const menuCardText = (text) => plainSethomeText(text).split("\n")[0].trim();
const getMaxHomes = (pl) => {
  const cfgMax = getHomeCfg().maxHomes;
  const benefitMax = Number(getSethomeBenefits(pl)?.maxHomes) || 0;
  return Math.max(cfgMax, benefitMax);
};
const isValidHomeName = (name) => {
  if (!name || typeof name !== "string") return false;
  const trimmed = name.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= SETHOME_CONFIG.MAX_HOME_NAME_LENGTH &&
    !/[\x00-\x1F\x7F"\\]/.test(trimmed)
  );
};
const getDimColor = (dim) => {
  const colors = { overworld: "§a", nether: "§c", the_end: "§d" };
  return colors[dim] || "§7";
};
const getHomes = (pl, useCache = true) => {
  const playerId = pl.id;
  if (useCache) {
    const cached = homeCache.get(playerId);
    if (cached) return cached;
  }
  const dpKey = HOME_DP_PREFIX + pl.name;
  let homes = [];
  let migrated = false;
  let rawDp = world.getDynamicProperty(dpKey);
  if (rawDp) {
    try {
      homes = typeof rawDp === "string" ? JSON.parse(rawDp) : rawDp;
    } catch (e) {
      homes = [];
    }
  } else {
    const legacyKey = pl.name + "_homes";
    const legacyRaw = GlobalConfig.get(legacyKey);
    if (legacyRaw) {
      try {
        homes = typeof legacyRaw === "string" ? JSON.parse(legacyRaw) : legacyRaw;
        migrated = true;
      } catch (e) {
        homes = [];
      }
    } else {
      const tags = pl.getTags();
      for (const tag of tags) {
        if (!tag.startsWith('{"Home":{')) continue;
        try {
          const parsed = JSON.parse(tag);
          if (parsed?.Home) homes.push(parsed.Home);
          pl.removeTag(tag);
          migrated = true;
        } catch {
          pl.removeTag(tag);
        }
      }
    }
  }
  homeCache.set(playerId, homes);
  if (migrated) {
    saveHomes(pl, homes);
    pl.sendMessage(Lang.t(pl, "sethome.migrated"));
  }
  return homes;
};
const invalidateHomeCache = (pl) => {
  homeCache.invalidate(pl.id);
};
const saveHomes = (pl, homes) => {
  const dpKey = HOME_DP_PREFIX + pl.name;
  world.setDynamicProperty(dpKey, JSON.stringify(homes));
  invalidateHomeCache(pl);
};
const createHomeObj = (name, desc, iconIdx, wmsg, location, dim) => ({
  Name: name.trim(),
  Description: desc.trim() || undefined,
  Pos: `${Math.trunc(location.x)} ${Math.trunc(location.y)} ${Math.trunc(location.z)}`,
  Dimension: dim,
  Icon: ICONS[iconKeys[iconIdx]],
  WelcomeMessage: wmsg.trim() || undefined,
  UUID: `${dim}:${Math.trunc(location.x)}:${Math.trunc(location.y)}:${Math.trunc(location.z)}`,
});
function homeMenu(pl) {
  if (!operationRateLimiter.canPerform(pl.id)) {
    pl.sendMessage(Lang.t(pl, "sethome.slowdown"));
    return;
  }
  operationRateLimiter.recordOperation(pl.id);
  const homes = getHomes(pl);
  const maxHomes = getMaxHomes(pl);
  new ActionFormData()
    .title(sethomeTitle(pl, "sethome.menu.title"))
    .body(buildHomeSlotIndicator(homes.length, maxHomes))
    .button(menuCardText(Lang.t(pl, "sethome.btn.create")), getSethomeTimeIcon())
    .button(menuCardText(Lang.t(pl, "sethome.btn.manage")), "textures/ui/icon_setting")
    .button(menuCardText(Lang.t(pl, "sethome.btn.teleport")), "textures/ui/icon_map")
    .show(pl)
    .then((r) => {
      if (r?.selection === undefined) return;
      const actions = [
        () =>
          homes.length >= maxHomes
            ? (pl.runCommand(`titleraw @s actionbar ${rawMsg(Lang.t(pl, "sethome.err.max"))}`),
              pl.runCommand("playsound note.bass @s"))
            : createHome(pl),
        () =>
          homes.length
            ? manageHome(pl, homes)
            : pl.runCommand(`titleraw @s actionbar ${rawMsg(Lang.t(pl, "sethome.err.none"))}`),
        () =>
          homes.length
            ? viewHome(pl, homes)
            : pl.runCommand(`titleraw @s actionbar ${rawMsg(Lang.t(pl, "sethome.err.none"))}`),
      ];
      actions[r.selection]?.();
    });
}
function createHome(pl) {
  new ModalFormData()
    .title(sethomeTitle(pl, "sethome.create.title"))
    .textField(Lang.t(pl, "sethome.create.name"), Lang.t(pl, "sethome.create.name.placeholder"), { defaultValue: "" })
    .textField(Lang.t(pl, "sethome.create.desc"), Lang.t(pl, "sethome.create.desc.placeholder"), { defaultValue: "" })
    .dropdown(Lang.t(pl, "sethome.create.icon"), iconKeys, { defaultValue: 0 })
    .textField(Lang.t(pl, "sethome.create.wmsg"), Lang.t(pl, "sethome.create.wmsg.placeholder"), { defaultValue: "" })
    .show(pl)
    .then((r) => {
      if (!r?.formValues) return;
      const [name, desc, iconIdx, wmsg] = r.formValues;
      const trimmedName = name.trim();
      const latestHomes = getHomes(pl, false);
      const maxHomes = getMaxHomes(pl);
      if (latestHomes.length >= maxHomes) {
        pl.runCommand(`titleraw @s actionbar ${rawMsg(Lang.t(pl, "sethome.err.max"))}`);
        pl.runCommand("playsound note.bass @s");
        return;
      }
      if (!isValidHomeName(trimmedName)) {
        pl.sendMessage(Lang.t(pl, "sethome.err.invalid_name", String(SETHOME_CONFIG.MAX_HOME_NAME_LENGTH)));
        return;
      }
      if (latestHomes.some((h) => h.Name.toLowerCase() === trimmedName.toLowerCase())) {
        pl.sendMessage(Lang.t(pl, "sethome.err.name_exists"));
        return;
      }
      const dim = pl.dimension.id.replace("minecraft:", "");
      const home = createHomeObj(name, desc, iconIdx, wmsg, pl.location, dim);
      latestHomes.push(home);
      saveHomes(pl, latestHomes);
      pl.sendMessage(Lang.t(pl, "sethome.created", trimmedName));
      pl.runCommand("playsound random.levelup @s");
    });
}
function manageHome(pl, homes) {
  const fm = new ActionFormData()
    .title(sethomeTitle(pl, "sethome.manage.title"))
    .body(Lang.t(pl, "sethome.manage.body", String(homes.length)));
  homes.forEach((home) => {
    fm.button(
      `${home.Name}§r\n§8${home.Description || home.Pos}`,
      home.Icon || ICONS.BELL,
    );
  });
  fm.show(pl).then((r) => {
    if (r?.selection !== undefined) editHome(pl, homes[r.selection]);
  });
}
function editHome(pl, home) {
  new ActionFormData()
    .title(sethomeTitle(pl, "sethome.edit.title", home.Name))
    .body(Lang.t(pl, "sethome.edit.body", home.Pos, home.Dimension))
    .button(Lang.t(pl, "sethome.edit.btn.location"), "textures/ui/levitation_effect")
    .button(Lang.t(pl, "sethome.edit.btn.details"), "textures/ui/icon_setting")
    .button(Lang.t(pl, "sethome.edit.btn.delete"), "textures/ui/icon_trash")
    .show(pl)
    .then((r) => {
      if (r?.selection === undefined) return;
      const actions = [
        () => updateHomeLoc(pl, home),
        () => editHomeDetail(pl, home),
        () => delHome(pl, home),
      ];
      actions[r.selection]();
    });
}
function viewHome(pl, homes) {
  const fm = new ActionFormData()
    .title(sethomeTitle(pl, "sethome.tp.title"))
    .body(Lang.t(pl, "sethome.tp.body"));
  const teleportIcon = getSethomeTimeIcon();
  homes.forEach((home) => {
    fm.button(plainSethomeText(home.Name), teleportIcon);
  });
  fm.show(pl).then((r) => {
    if (r?.selection !== undefined) tpHome(pl, homes[r.selection]);
  });
}
function updateHomeLoc(pl, home) {
  const { x, y, z } = pl.location;
  const dim = pl.dimension.id.replace("minecraft:", "");
  const newHome = {
    ...home,
    Pos: `${Math.trunc(x)} ${Math.trunc(y)} ${Math.trunc(z)}`,
    Dimension: dim,
    UUID: `${dim}:${Math.trunc(x)}:${Math.trunc(y)}:${Math.trunc(z)}`,
  };
  const homes = getHomes(pl);
  const index = homes.findIndex(h => h.UUID === home.UUID);
  if (index !== -1) {
    homes[index] = newHome;
    saveHomes(pl, homes);
    pl.sendMessage(Lang.t(pl, "sethome.loc.updated", home.Name));
    pl.runCommand("playsound random.levelup @s");
  }
}
function editHomeDetail(pl, home) {
  const currentIcon = iconKeys.findIndex((key) => ICONS[key] === home.Icon);
  new ModalFormData()
    .title(sethomeTitle(pl, "sethome.edit.title", home.Name))
    .textField(Lang.t(pl, "sethome.create.name"), Lang.t(pl, "sethome.create.name.placeholder"), { defaultValue: home.Name })
    .textField(Lang.t(pl, "sethome.create.desc"), Lang.t(pl, "sethome.create.desc.placeholder"), { defaultValue: home.Description || "" })
    .dropdown(Lang.t(pl, "sethome.create.icon"), iconKeys, { defaultValue: Math.max(0, currentIcon) })
    .textField(Lang.t(pl, "sethome.create.wmsg"), Lang.t(pl, "sethome.create.wmsg.placeholder"), { defaultValue: home.WelcomeMessage || "" })
    .show(pl)
    .then((r) => {
      if (!r?.formValues) return;
      const [name, desc, iconIdx, wmsg] = r.formValues;
      const trimmedName = name.trim();
      if (trimmedName !== home.Name && !isValidHomeName(trimmedName)) {
        pl.sendMessage(Lang.t(pl, "sethome.err.invalid_name", String(SETHOME_CONFIG.MAX_HOME_NAME_LENGTH)));
        return;
      }
      const homes = getHomes(pl);
      if (
        trimmedName !== home.Name &&
        homes.some((h) => h.UUID !== home.UUID && h.Name.toLowerCase() === trimmedName.toLowerCase())
      ) {
        pl.sendMessage(Lang.t(pl, "sethome.err.name_exists"));
        return;
      }
      const newHome = {
        ...home,
        Name: trimmedName || home.Name,
        Description: desc.trim() || undefined,
        Icon: ICONS[iconKeys[iconIdx]],
        WelcomeMessage: wmsg.trim() || undefined,
      };
      const index = homes.findIndex(h => h.UUID === home.UUID);
      if (index !== -1) {
        homes[index] = newHome;
        saveHomes(pl, homes);
        pl.sendMessage(Lang.t(pl, "sethome.updated", newHome.Name));
        pl.runCommand("playsound random.levelup @s");
      }
    });
}
function delHome(pl, home) {
  new ActionFormData()
    .title(sethomeTitle(pl, "sethome.delete.title"))
    .body(Lang.t(pl, "sethome.delete.body", home.Name))
    .button(Lang.t(pl, "sethome.delete.confirm"), "textures/ui/icon_trash")
    .button(Lang.t(pl, "sethome.delete.cancel"), "textures/ui/icon_cancel")
    .show(pl)
    .then((r) => {
      if (r?.selection === 0) {
        const homes = getHomes(pl);
        const newHomes = homes.filter((h) => h.UUID !== home.UUID);
        if (homes.length !== newHomes.length) {
          saveHomes(pl, newHomes);
          pl.sendMessage(Lang.t(pl, "sethome.deleted", home.Name));
          pl.runCommand("playsound random.break @s");
        }
      }
    });
}
function tpHome(pl, home) {
  if (activeTeleports.has(pl.id)) {
    pl.sendMessage(Lang.t(pl, "sethome.tp.already"));
    return;
  }
  if (teleportCooldowns.isOnCooldown(pl.id)) {
    const remaining = Math.ceil(teleportCooldowns.getRemainingMs(pl.id) / 1000);
    pl.sendMessage(Lang.t(pl, "sethome.tp.cooldown", String(remaining)));
    return;
  }
  const cfg = getHomeCfg();
  const { Name, Pos, Dimension, WelcomeMessage } = home;
  const coords = Pos.split(" ");
  if (coords.length !== 3) return;
  const [x, y, z] = coords;
  const pos0 = { ...pl.location };
  let cd = cfg.teleportDelay;
  let frame = 0;
  const playerId = pl.id;
  activeTeleports.set(playerId, true);
  teleportCooldowns.setCooldown(playerId);
  const intv = system.runInterval(() => {
    let location;
    try {
      location = pl.location;
    } catch (e) {
      system.clearRun(intv);
      activeTeleports.delete(playerId);
      return;
    }
    if (
      Math.abs(pos0.x - location.x) > SETHOME_CONFIG.TELEPORT_MOVEMENT_TOLERANCE ||
      Math.abs(pos0.y - location.y) > SETHOME_CONFIG.TELEPORT_MOVEMENT_TOLERANCE ||
      Math.abs(pos0.z - location.z) > SETHOME_CONFIG.TELEPORT_MOVEMENT_TOLERANCE
    ) {
      system.clearRun(intv);
      activeTeleports.delete(playerId);
      try {
        pl.runCommand(`titleraw @s actionbar ${rawMsg(Lang.t(pl, "sethome.tp.move"))}`);
        pl.runCommand("playsound note.bass @s");
      } catch (e) { }
      return;
    }
    const totalFrames = cfg.teleportDelay * 20;
    const progress = (cd / cfg.teleportDelay) * 10 - (frame / totalFrames) * 10;
    const full = Math.max(0, Math.floor(progress));
    let bar = PROGRESS_CHARS.FULL.repeat(full);
    const frac = progress - full;
    if (frac > 0 && full < 10) {
      bar += PROGRESS_CHARS.TRANSITIONS[Math.floor(frac * PROGRESS_CHARS.TRANSITIONS.length)];
    }
    bar += PROGRESS_CHARS.EMPTY.repeat(Math.max(0, 10 - bar.length));
    try {
      pl.onScreenDisplay.setActionBar(Lang.t(pl, "sethome.tp.countdown", bar, String(cd)));
    } catch (e) { }
    if (++frame >= 20) {
      frame = 0;
      cd--;
    }
    if (cd <= 0) {
      system.clearRun(intv);
      activeTeleports.delete(playerId);
      try {
        pl.runCommand(`execute in ${Dimension} run tp @s ${x} ${y} ${z}`);
        pl.runCommand(`titleraw @s actionbar ${rawMsg(Lang.t(pl, "sethome.tp.ok", Name))}`);
        if (WelcomeMessage) pl.sendMessage(`§e➤ ${WelcomeMessage}`);
        pl.runCommand("playsound random.levelup @s");
      } catch (e) { }
    }
  }, 1);
}
export { homeMenu as HomeSystem, invalidateHomeCache };
