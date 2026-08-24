import { ItemStack, EnchantmentTypes, ItemComponentTypes, EquipmentSlot } from '../../core.js';
import { saveShulkerToDB, loadShulkerFromDB, generateShulkerLore, readShulkerBlockContents } from "./shulker_tracker.js";
import { QIDB } from '../../function/QIDB.js';
const isShulkerBox = id => id?.includes("shulker_box");
const isContainerItem = id => id === "minecraft:bundle";
const itemBackupDB = new QIDB("ib", 128, 4);
itemBackupDB.logs = { startUp: false, save: false, load: false, set: false, get: false, has: false, delete: false, clear: false, values: false, keys: false };
function generateBackupId() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_";
    let id = "";
    for (let i = 0; i < 12; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return id;
}
const cloneItemStack = item => {
    try { return typeof item?.clone === "function" ? item.clone() : item; } catch { return item; }
};
const backupRawItem = (item, entry) => {
    try {
        const backupId = generateBackupId();
        itemBackupDB.set(backupId, cloneItemStack(item));
        entry.rawItemId = backupId;
        return true;
    } catch {
        return false;
    }
};
const serializeItemData = item => {
    const data = {};
    if (item.nameTag) data.name = item.nameTag;
    const lore = item.getLore(); if (lore?.length) data.lore = lore;
    const dur = item.getComponent(ItemComponentTypes.Durability);
    if (dur?.maxDurability > 0) data.durability = { max: dur.maxDurability, damage: dur.damage };
    const enc = item.getComponent(ItemComponentTypes.Enchantable)?.getEnchantments();
    if (enc?.length) data.enchantments = enc.map(e => ({ id: e.type?.id || "unknown", level: e.level || 1 }));
    try { const propIds = item.getDynamicPropertyIds(); if (propIds?.length) { data.dynamicProperties = {}; for (const id of propIds) { const val = item.getDynamicProperty(id); if (val !== undefined) data.dynamicProperties[id] = val; } } } catch { }
    return data;
};
const applyItemData = (item, data) => {
    if (!data) return;
    if (data.name) item.nameTag = data.name;
    if (data.lore?.length) item.setLore(data.lore);
    if (data.durability) { const dur = item.getComponent(ItemComponentTypes.Durability); if (dur) try { dur.damage = Math.min(data.durability.damage, dur.maxDurability); } catch { } }
    if (data.enchantments?.length) { const enc = item.getComponent(ItemComponentTypes.Enchantable); if (enc?.addEnchantment) for (const e of data.enchantments) { try { const type = EnchantmentTypes.get(e.id); if (type) enc.addEnchantment({ type, level: e.level || 1 }); } catch { } } }
    if (data.dynamicProperties) { try { for (const [k, v] of Object.entries(data.dynamicProperties)) item.setDynamicProperty(k, v); } catch { } }
};
const extractShulkerId = item => { try { const lore = item.getLore(); if (lore) for (const line of lore) { const clean = line.replace(/§./g, ""); if (clean.startsWith("ID:")) return clean.substring(3); } } catch { } return null; };
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
const processItem = (item, slot, location, player) => {
    const slotId = location === "eq" ? (slot === "head" ? "Head" : slot === "chest" ? "Chest" : slot === "legs" ? "Legs" : slot === "feet" ? "Feet" : slot === "offhand" ? "Offhand" : slot) : slot;
    const entry = { typeId: item.typeId, amount: item.amount, s: slotId, l: location, data: serializeItemData(item) };
    backupRawItem(item, entry);
    if (isShulkerBox(item.typeId)) {
        const existingId = extractShulkerId(item);
        if (existingId) {
            entry.shulkerId = existingId;
            if (!entry.rawItemId) {
                const contents = loadShulkerFromDB(existingId, player);
                if (contents?.length) entry.shulkerContents = contents;
            }
        } else {
            // Can't read shulker item contents via Script API, backup raw ItemStack
            if (!entry.rawItemId) backupRawItem(item, entry);
        }
    }
    if (isContainerItem(item.typeId)) {
        if (!entry.rawItemId) backupRawItem(item, entry);
    }
    return entry;
};
export const serializePlayerInventory = player => {
    const items = [];
    try {
        const inv = player.getComponent(ItemComponentTypes.Inventory)?.container;
        if (inv) for (let i = 0; i < inv.size; i++) { const item = inv.getItem(i); if (item) items.push(processItem(item, i, "inv", player)); }
        const eq = player.getComponent("minecraft:equippable");
        if (eq) for (const [key, name] of [["Head", "head"], ["Chest", "chest"], ["Legs", "legs"], ["Feet", "feet"], ["Offhand", "offhand"]]) { try { const item = eq.getEquipment(EquipmentSlot[key]); if (item) items.push(processItem(item, name, "eq", player)); } catch { } }
    } catch { }
    return items;
};
const restoreShulkerContentsToBlock = (block, contents, player) => {
    if (!block || !contents?.length) return;
    const container = block.getComponent("minecraft:inventory")?.container;
    if (!container) return;
    for (let i = 0; i < contents.length; i++) {
        const entry = contents[i];
        if (!entry) continue;
        try {
            let innerItem;
            if (typeof entry.clone === "function") {
                innerItem = cloneItemStack(entry);
            } else if (isShulkerBox(entry.typeId) && entry.shulkerContents?.length) {
                innerItem = createShulkerItem(entry.typeId, entry.shulkerContents, entry.amount, player, entry.shulkerId);
                applyItemData(innerItem, entry.data);
            } else {
                innerItem = new ItemStack(entry.typeId, entry.amount);
                applyItemData(innerItem, entry.data || entry);
            }
            const slot = typeof entry.s === "number" ? entry.s : i;
            if (slot >= 0 && slot < container.size) container.setItem(slot, innerItem);
        } catch { }
    }
};
const createShulkerItem = (typeId, contents, amount, player, existingId = null) => {
    const item = new ItemStack(typeId, amount);
    if (contents?.length) { const dbId = existingId || saveShulkerToDB(contents, player); if (dbId) item.setLore(generateShulkerLore(contents, dbId)); }
    return item;
};
const createShulkerWithContents = (typeId, contents, amount, player, existingId = null) => {
    try {
        const dim = player.dimension, loc = player.location;
        const minH = dim.heightRange?.min ?? -64, maxH = dim.heightRange?.max ?? 320;
        let targetY = Math.floor(loc.y) + 3;
        if (targetY >= maxH) targetY = Math.floor(loc.y) - 3;
        if (targetY < minH) targetY = minH + 5;
        const block = dim.getBlock({ x: Math.floor(loc.x), y: targetY, z: Math.floor(loc.z) });
        if (!block) return createShulkerItem(typeId, contents, amount, player, existingId);
        const originalPerm = block.permutation, originalType = block.typeId;
        block.setType(typeId);
        restoreShulkerContentsToBlock(block, contents, player);
        let item; try { item = typeof block.getItemStack === "function" ? block.getItemStack(amount, true) : null; } catch { }
        if (!item) item = new ItemStack(typeId, amount);
        const dbId = existingId || saveShulkerToDB(contents, player);
        if (dbId && contents?.length) item.setLore(generateShulkerLore(contents, dbId));
        try { if (originalPerm) block.setPermutation(originalPerm); else block.setType(originalType || "minecraft:air"); } catch { block.setType("minecraft:air"); }
        return item;
    } catch { return createShulkerItem(typeId, contents, amount, player, existingId); }
};
export const deserializePlayerInventory = (player, items) => {
    if (!items?.length) return;
    try {
        const inv = player.getComponent(ItemComponentTypes.Inventory)?.container;
        const eq = player.getComponent("minecraft:equippable");
        for (const entry of items) {
            try {
                let item;
                let rawItemIdToDelete = null;
                if (entry.rawItemId) {
                    try {
                        const raw = itemBackupDB.get(entry.rawItemId);
                        if (raw) {
                            item = cloneItemStack(raw);
                            rawItemIdToDelete = entry.rawItemId;
                        }
                    } catch { }
                    if (!item) { item = new ItemStack(entry.typeId, entry.amount); applyItemData(item, entry.data); }
                } else {
                    const shulkerContents = entry.shulkerContents?.length ? entry.shulkerContents : entry.shulkerId ? loadShulkerFromDB(entry.shulkerId, player) : null;
                    const hasShulkerContents = isShulkerBox(entry.typeId) && shulkerContents?.length;
                    if (hasShulkerContents) { item = createShulkerWithContents(entry.typeId, shulkerContents, entry.amount, player, entry.shulkerId); if (entry.data) { const { lore, ...dataNoLore } = entry.data; applyItemData(item, dataNoLore); } }
                    else { item = new ItemStack(entry.typeId, entry.amount); applyItemData(item, entry.data); }
                }
                let restored = false;
                if (entry.l === "eq" && eq) {
                    const slotMap = { Head: EquipmentSlot.Head, Chest: EquipmentSlot.Chest, Legs: EquipmentSlot.Legs, Feet: EquipmentSlot.Feet, Offhand: EquipmentSlot.Offhand };
                    const slot = slotMap[entry.s];
                    if (slot) try { eq.setEquipment(slot, item); restored = true; } catch { }
                }
                else if (typeof entry.s === "number" && inv && entry.s < inv.size) try { inv.setItem(entry.s, item); restored = true; } catch { }
                if (restored && rawItemIdToDelete) try { itemBackupDB.delete(rawItemIdToDelete); } catch { }
            } catch { }
        }
    } catch { }
};
export const purgePlayerInventory = player => {
    try { player.getComponent(ItemComponentTypes.Inventory)?.container?.clearAll(); const eq = player.getComponent("minecraft:equippable"); if (eq) for (const slot of [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet, EquipmentSlot.Offhand]) try { eq.setEquipment(slot, undefined); } catch { } } catch { }
};
