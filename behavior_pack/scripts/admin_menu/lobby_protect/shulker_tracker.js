import { world, system, ItemStack, ItemComponentTypes, EnchantmentTypes } from '../../core.js';
import { QIDB } from '../../function/QIDB.js';

const SHULKER_CONFIG_KEY = "shulker_tracker:config";
const OLD_SHULKER_PREFIX = "shulker_db:";
const getShulkerConfig = () => {
    try {
        const raw = world.getDynamicProperty(SHULKER_CONFIG_KEY);
        return raw ? JSON.parse(raw) : { enabled: false };
    } catch { return { enabled: false }; }
};
export const saveShulkerConfig = (config) => {
    try { world.setDynamicProperty(SHULKER_CONFIG_KEY, JSON.stringify(config)); return true; } catch { return false; }
};
export const isShulkerTrackingEnabled = () => getShulkerConfig().enabled === true;
export { getShulkerConfig };

const shulkerDB = new QIDB("sk", 20, 1);
shulkerDB.logs = { startUp: false, save: false, load: false, set: false, get: false, has: false, delete: false, clear: false, values: false, keys: false };
const PLAYER_SHULKER_KEY = "shulker:held_id";
const idMapping = new Map();

function generateShortId() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_";
    let id = "";
    for (let i = 0; i < 12; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return id;
}

function isOldUUID(id) {
    return id && id.includes("-") && id.length > 20;
}

function migrateOldShulkerData(oldId) {
    if (idMapping.has(oldId)) return idMapping.get(oldId);
    try {
        const raw = world.getDynamicProperty(OLD_SHULKER_PREFIX + oldId);
        if (!raw) return null;
        const oldItems = JSON.parse(raw);
        if (!Array.isArray(oldItems) || oldItems.length === 0) return null;
        const newId = generateShortId();
        const stacks = [];
        let maxSlot = 0;
        for (const data of oldItems) {
            if (typeof data.s === "number" && data.s > maxSlot) maxSlot = data.s;
        }
        for (let i = 0; i <= maxSlot; i++) stacks.push(undefined);
        for (const data of oldItems) {
            try {
                if (!data || !data.typeId || data.typeId === "minecraft:air") continue;
                const item = new ItemStack(data.typeId, Math.max(1, Number(data.amount) || 1));
                if (data.name) item.nameTag = data.name;
                if (data.lore?.length) item.setLore(data.lore);
                if (data.durability && typeof data.durability === 'object') {
                    const dur = item.getComponent(ItemComponentTypes.Durability);
                    if (dur) {
                        const dmg = data.durability.damage ?? data.durability.currentDamage ?? 0;
                        dur.damage = Math.min(dmg, dur.maxDurability);
                    }
                }
                if (data.enchantments?.length) {
                    const enc = item.getComponent(ItemComponentTypes.Enchantable);
                    if (enc) {
                        for (const e of data.enchantments) {
                            try {
                                const type = EnchantmentTypes.get(e.id);
                                if (type) enc.addEnchantment({ type, level: e.level || 1 });
                            } catch { }
                        }
                    }
                }
                const slot = typeof data.s === "number" ? data.s : stacks.length;
                if (slot < stacks.length) stacks[slot] = item;
                else stacks.push(item);
            } catch { }
        }
        const filtered = stacks.filter(s => s !== undefined);
        if (filtered.length > 0) {
            shulkerDB.set(newId, stacks);
            idMapping.set(oldId, newId);
            return newId;
        }
    } catch { }
    return null;
}

function resolveId(id) {
    if (!id) return null;
    if (isOldUUID(id)) {
        const mapped = idMapping.get(id);
        if (mapped) return mapped;
        const migrated = migrateOldShulkerData(id);
        return migrated;
    }
    return id;
}

export const saveShulkerToDB = (itemStacks, player, existingId = null) => {
    if (!itemStacks || itemStacks.length === 0) return null;
    const resolved = existingId ? resolveId(existingId) : null;
    const id = resolved || generateShortId();
    try {
        shulkerDB.set(id, itemStacks);
        return id;
    } catch { return null; }
};

export const loadShulkerFromDB = (id, player) => {
    const resolved = resolveId(id);
    if (!resolved) return [];
    try {
        if (!shulkerDB.has(resolved)) return [];
        const result = shulkerDB.get(resolved);
        if (!result) return [];
        return Array.isArray(result) ? result : [result];
    } catch { return []; }
};

export const generateShulkerLore = (contents, dbId) => {
    const lore = ["§r§9Items"];
    const items = (contents || []).filter(i => i);
    for (const item of items.slice(0, 5)) {
        const name = (item.nameTag || item.typeId || "").replace("minecraft:", "").split("_").map(w => w[0]?.toUpperCase() + w.slice(1)).join(" ");
        lore.push(`§7${name} x${item.amount}`);
    }
    if (items.length > 5) lore.push(`§7§o...+${items.length - 5} more`);
    lore.push(`§8ID:${dbId}`);
    return lore;
};

const isShulkerBox = id => id?.includes("shulker_box");
const getBlockKey = (loc, dimId) => `${Math.floor(loc.x)},${Math.floor(loc.y)},${Math.floor(loc.z)},${dimId}`;
const extractIdFromLore = lore => { if (!lore) return null; for (const l of lore) { const c = l.replace(/§./g, ""); if (c.startsWith("ID:")) return c.substring(3); } return null; };

export const readShulkerBlockContents = block => {
    if (!block || !isShulkerBox(block.typeId)) return [];
    try {
        const container = block.getComponent("minecraft:inventory")?.container;
        if (!container) return [];
        const items = [];
        for (let i = 0; i < container.size; i++) items.push(container.getItem(i) || undefined);
        while (items.length > 0 && !items[items.length - 1]) items.pop();
        return items;
    } catch { return []; }
};

const readShulkerItemContents = (item, player) => {
    try {
        const dim = player.dimension, loc = player.location;
        const minH = dim.heightRange?.min ?? -64, maxH = dim.heightRange?.max ?? 320;
        let targetY = Math.floor(loc.y) + 5;
        if (targetY >= maxH) targetY = Math.floor(loc.y) - 5;
        if (targetY < minH) targetY = minH + 5;
        const block = dim.getBlock({ x: Math.floor(loc.x), y: targetY, z: Math.floor(loc.z) });
        if (!block) return [];
        const originalPerm = block.permutation, originalType = block.typeId;
        block.setType(item.typeId);
        const contents = readShulkerBlockContents(block);
        try { if (originalPerm) block.setPermutation(originalPerm); else block.setType(originalType || "minecraft:air"); } catch { block.setType("minecraft:air"); }
        return contents;
    } catch { return []; }
};

export const placedShulkerContents = new Map();
const pendingIdGeneration = new Map();

system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
        try {
            const inv = player.getComponent(ItemComponentTypes.Inventory)?.container;
            const slotIndex = player.selectedSlotIndex;
            const item = inv?.getItem(slotIndex);
            const currentStored = player.getDynamicProperty(PLAYER_SHULKER_KEY);
            if (item && isShulkerBox(item.typeId)) {
                const lore = item.getLore();
                const existingId = extractIdFromLore(lore);
                if (existingId) {
                    const resolved = resolveId(existingId);
                    if (resolved && resolved !== existingId) {
                        const newItem = item.clone();
                        newItem.setLore(generateShulkerLore(loadShulkerFromDB(resolved), resolved));
                        inv.setItem(slotIndex, newItem);
                    }
                    if (currentStored !== (resolved || existingId)) player.setDynamicProperty(PLAYER_SHULKER_KEY, resolved || existingId);
                } else if (isShulkerTrackingEnabled()) {
                    const playerKey = player.id + ":" + slotIndex;
                    if (!pendingIdGeneration.has(playerKey)) pendingIdGeneration.set(playerKey, { player, slotIndex, timestamp: Date.now() });
                    if (currentStored) player.setDynamicProperty(PLAYER_SHULKER_KEY, undefined);
                } else {
                    if (currentStored) player.setDynamicProperty(PLAYER_SHULKER_KEY, undefined);
                }
            } else {
                if (currentStored) player.setDynamicProperty(PLAYER_SHULKER_KEY, undefined);
            }
        } catch { }
    }
}, 10);

system.runInterval(() => {
    for (const [key, data] of pendingIdGeneration.entries()) {
        try {
            const { player, slotIndex, timestamp } = data;
            if (Date.now() - timestamp < 500) continue;
            const inv = player.getComponent(ItemComponentTypes.Inventory)?.container;
            const item = inv?.getItem(slotIndex);
            if (!item || !isShulkerBox(item.typeId)) { pendingIdGeneration.delete(key); continue; }
            if (!isShulkerTrackingEnabled()) { pendingIdGeneration.delete(key); continue; }
            const existingId = extractIdFromLore(item.getLore());
            if (existingId) { pendingIdGeneration.delete(key); continue; }
            const contents = readShulkerItemContents(item, player);
            const filtered = (contents || []).filter(i => i);
            if (filtered.length > 0) {
                const newId = saveShulkerToDB(contents, player);
                if (newId) {
                    const newItem = item.clone();
                    newItem.setLore(generateShulkerLore(contents, newId));
                    inv.setItem(slotIndex, newItem);
                    player.setDynamicProperty(PLAYER_SHULKER_KEY, newId);
                }
            }
            pendingIdGeneration.delete(key);
        } catch { pendingIdGeneration.delete(key); }
    }
}, 20);

world.afterEvents.playerPlaceBlock.subscribe(e => {
    if (!isShulkerBox(e.block.typeId)) return;
    system.run(() => {
        const key = getBlockKey(e.block.location, e.block.dimension.id);
        const dbId = e.player.getDynamicProperty(PLAYER_SHULKER_KEY);
        if (dbId) {
            e.player.setDynamicProperty(PLAYER_SHULKER_KEY, undefined);
            const resolved = resolveId(dbId);
            const contents = resolved ? loadShulkerFromDB(resolved, e.player) : [];
            if (contents?.length) {
                const container = e.block.getComponent("minecraft:inventory")?.container;
                if (container) {
                    for (let i = 0; i < contents.length; i++) {
                        try { if (contents[i] && i < container.size) container.setItem(i, contents[i]); } catch { }
                    }
                }
            }
        }
        placedShulkerContents.set(key, { contents: readShulkerBlockContents(e.block), typeId: e.block.typeId, originalId: resolveId(dbId) || dbId, lastUpdate: Date.now() });
    });
});

world.beforeEvents.playerBreakBlock.subscribe(e => {
    const block = e.block;
    if (!isShulkerBox(block.typeId)) return;
    const contents = readShulkerBlockContents(block);
    const filtered = contents.filter(i => i);
    if (!filtered.length) return;
    const key = getBlockKey(block.location, block.dimension.id);
    const cached = placedShulkerContents.get(key);
    const existingId = cached?.originalId || null;
    if (!isShulkerTrackingEnabled()) return;
    const dbId = saveShulkerToDB(contents, e.player, existingId);
    if (dbId) {
        placedShulkerContents.set(key, { contents, typeId: block.typeId, broken: true, originalId: dbId, lastUpdate: Date.now() });
        e.cancel = true;
        system.run(() => {
            try {
                let item = new ItemStack(block.typeId, 1);
                block.setType("minecraft:air");
                item.setLore(generateShulkerLore(contents, dbId));
                e.player.dimension.spawnItem(item, { x: block.location.x + 0.5, y: block.location.y + 0.5, z: block.location.z + 0.5 });
                e.player.runCommand("playsound random.break @a[r=10]");
            } catch { }
        });
    }
});

system.runInterval(() => { const now = Date.now(); for (const [k, v] of placedShulkerContents.entries()) if (now - v.lastUpdate > 3600000) placedShulkerContents.delete(k); }, 6000);
