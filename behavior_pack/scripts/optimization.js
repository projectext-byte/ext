export const MINECRAFT = {
  TICKS_PER_SECOND: 20,
  secondsToTicks: (seconds) => seconds * 20,
  ticksToSeconds: (ticks) => ticks / 20,
  secondsToMs: (seconds) => seconds * 1000,
  msToSeconds: (ms) => ms / 1000,
  ticksToMs: (ticks) => (ticks / 20) * 1000,
  msToTicks: (ms) => (ms / 1000) * 20,
};
export const CACHE_CONFIG = {
  WARP_CACHE_TTL: MINECRAFT.secondsToMs(10),
  PLAYER_CACHE_TTL: MINECRAFT.secondsToMs(5),
  DATABASE_CACHE_TTL: MINECRAFT.secondsToMs(15),
  CACHE_CLEANUP_INTERVAL: MINECRAFT.secondsToTicks(5),
  CACHE_EXPIRY_MULTIPLIER: 2,
};
export const TELEPORT_CONFIG = {
  COOLDOWN: MINECRAFT.secondsToMs(3),
  COUNTDOWN_DURATION: 3,
  MAX_CONCURRENT: 20,
  QUEUE_PROCESS_INTERVAL: 5,
  QUEUE_BATCH_SIZE: 5,
  MOVEMENT_TOLERANCE: 0.1,
  PROGRESS_BAR_LENGTH: 10,
  ANIMATION_INTERVAL: 1,
};
export const STORAGE_CONFIG = {
  MAX_WARPS_PER_CHUNK: 50,
  CHUNK_PREFIX: "warps_chunk_",
  META_KEY: "warps_meta",
  MAX_CHUNK_CLEANUP: 20,
  WARP_KEY: "warps",
};
export const PERFORMANCE = {
  MAX_LOOPS_PER_TICK: 100,
  HEAVY_OPERATION_DELAY: MINECRAFT.secondsToTicks(0.05),
  MAX_PLAYER_CHECKS: 50,
  GLOBAL_CLEANUP_INTERVAL: MINECRAFT.secondsToTicks(300),
};
export const UI_CONFIG = {
  FORM_TIMEOUT: MINECRAFT.secondsToMs(60),
  MAX_ITEMS_PER_PAGE: 20,
  ACTION_BAR_UPDATE_DELAY: 1,
};
export const ICONS = {
  DEFAULT_WARPS: [
    "textures/ui/icon_bell",
    "textures/items/book_portfolio",
    "textures/items/acacia_chest_boat",
    "textures/items/bordure_indented_banner_pattern",
    "textures/ui/icon_multiplayer",
    "textures/items/ender_pearl",
  ],
  EDIT_WARPS: [
    "textures/ui/icon_bell",
    "textures/ui/creative_icon",
    "textures/ui/csb_faq_fox",
    "textures/ui/fire_resistance_effect",
    "textures/ui/hanging_sign_bamboo",
    "textures/ui/icon_deals",
    "textures/ui/icon_balloon",
    "textures/ui/icon_recipe_nature",
  ],
  COMMON: {
    TRASH: "textures/ui/trash",
    ICON_TRASH: "textures/ui/icon_trash",
    CONSTRUCTION: "textures/ui/icon_recipe_construction",
    SUCCESS: "textures/ui/check",
    ERROR: "textures/ui/cross",
    WARNING: "textures/ui/icon_warning",
  },
};
export const MESSAGES = {
  NO_PERMISSION: "You don't have permission to {action} warps!",
  NO_WARPS: "No warps to {action}!",
  INVALID_NAME: "Invalid or duplicate warp name!",
  INVALID_COORDS: "Invalid coordinates format! Use: X Y Z",
  SUCCESS: (action, name) => `Warp "${name}" ${action} successfully!`,
  TELEPORTING: "Teleporting in 3 seconds. Don't move!",
  CANCELLED: "Teleport cancelled - You moved!",
  FAILED: "Teleport failed!",
  COOLDOWN: "Please wait {time} seconds before teleporting again!",
  QUEUE: "You are in teleport queue. Position: {pos}",
  SERVER_BUSY: "Server is busy. Please try again later!",
};
export const PROGRESS_CHARS = {
  FULL: "█",
  EMPTY: " ",
  TRANSITIONS: ["▏", "▎", "▍", "▌", "▋", "▊", "▉"],
};
export const SOUNDS = {
  SUCCESS: "random.levelup",
  ERROR: "note.bass",
  CLICK: "random.orb",
  BREAK: "random.break",
  TICK: "note.harp",
};
export const PERMISSIONS = {
  ADMIN_TAG: "admin",
  MODERATOR_TAG: "moderator",
  VIP_TAG: "vip",
};
export const SETHOME_CONFIG = {
  DEFAULT_MAX_HOMES: 5,
  MIN_Y: -64,
  TELEPORT_DELAY: 3,
  COOLDOWN_MS: MINECRAFT.secondsToMs(5),
  CACHE_TTL_MS: MINECRAFT.secondsToMs(10),
  MAX_HOME_NAME_LENGTH: 20,
  RATE_LIMIT_WINDOW_MS: MINECRAFT.secondsToMs(1),
  MAX_OPERATIONS_PER_WINDOW: 3,
  TELEPORT_MOVEMENT_TOLERANCE: 0.1,
};
export const SETHOME_ICONS = {
  LAND: "textures/ui/icon_recipe_nature",
  BED: "textures/ui/icon_recipe_item",
  CHEST: "textures/ui/icon_blackfriday",
  MINE: "textures/ui/icon_iron_pickaxe",
  FARM: "textures/ui/icon_new",
  SHOP: "textures/ui/icon_staffpicks",
  PORTAL: "textures/ui/portalBg",
  BELL: "textures/ui/icon_bell",
};
export class PlayerCache {
  constructor() {
    this.cache = new Map();
    this.lastAccessed = new Map();
  }
  get(playerId) {
    const data = this.cache.get(playerId);
    if (!data) return null;
    if (Date.now() - data.timestamp > SETHOME_CONFIG.CACHE_TTL_MS) {
      this.cache.delete(playerId);
      this.lastAccessed.delete(playerId);
      return null;
    }
    this.lastAccessed.set(playerId, Date.now());
    return data.value;
  }
  set(playerId, value) {
    this.cache.set(playerId, { value, timestamp: Date.now() });
    this.lastAccessed.set(playerId, Date.now());
  }
  invalidate(playerId) {
    this.cache.delete(playerId);
    this.lastAccessed.delete(playerId);
  }
  cleanup() {
    const now = Date.now();
    for (const [playerId, data] of this.cache) {
      if (now - data.timestamp > SETHOME_CONFIG.CACHE_TTL_MS * 2) {
        this.cache.delete(playerId);
        this.lastAccessed.delete(playerId);
      }
    }
  }
}
export class CooldownManager {
  constructor() {
    this.cooldowns = new Map();
  }
  setCooldown(playerId, durationMs = SETHOME_CONFIG.COOLDOWN_MS) {
    this.cooldowns.set(playerId, Date.now() + durationMs);
  }
  isOnCooldown(playerId) {
    const expiry = this.cooldowns.get(playerId);
    if (!expiry) return false;
    if (Date.now() > expiry) {
      this.cooldowns.delete(playerId);
      return false;
    }
    return true;
  }
  getRemainingMs(playerId) {
    const expiry = this.cooldowns.get(playerId);
    if (!expiry) return 0;
    return Math.max(0, expiry - Date.now());
  }
  cleanup() {
    const now = Date.now();
    for (const [playerId, expiry] of this.cooldowns) {
      if (now > expiry) {
        this.cooldowns.delete(playerId);
      }
    }
  }
}
export class RateLimiter {
  constructor(maxOps = SETHOME_CONFIG.MAX_OPERATIONS_PER_WINDOW, windowMs = SETHOME_CONFIG.RATE_LIMIT_WINDOW_MS) {
    this.operations = new Map();
    this.maxOps = maxOps;
    this.windowMs = windowMs;
  }
  canPerform(playerId) {
    const now = Date.now();
    const ops = this.operations.get(playerId) || [];
    const validOps = ops.filter((time) => now - time < this.windowMs);
    this.operations.set(playerId, validOps);
    return validOps.length < this.maxOps;
  }
  recordOperation(playerId) {
    const ops = this.operations.get(playerId) || [];
    ops.push(Date.now());
    this.operations.set(playerId, ops);
  }
  cleanup() {
    const now = Date.now();
    for (const [playerId, ops] of this.operations) {
      const validOps = ops.filter((time) => now - time < this.windowMs);
      if (validOps.length === 0) {
        this.operations.delete(playerId);
      } else {
        this.operations.set(playerId, validOps);
      }
    }
  }
}
export function delay(ticks) {
  return new Promise((resolve) => {
    import("./core.js").then(({ system }) => {
      system.runTimeout(resolve, ticks);
    });
  });
}
export function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
export function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
export function isValidCoords(coords) {
  const parts = coords.split(" ");
  return parts.length === 3 && parts.every((p) => !isNaN(parseFloat(p)));
}
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
export default {
  MINECRAFT,
  CACHE_CONFIG,
  TELEPORT_CONFIG,
  STORAGE_CONFIG,
  PERFORMANCE,
  UI_CONFIG,
  ICONS,
  MESSAGES,
  PROGRESS_CHARS,
  SOUNDS,
  PERMISSIONS,
  SETHOME_CONFIG,
  SETHOME_ICONS,
  PlayerCache,
  CooldownManager,
  RateLimiter,
  delay,
  chunkArray,
  formatTime,
  isValidCoords,
  clamp,
};
