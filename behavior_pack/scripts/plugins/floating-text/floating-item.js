import { world, system, EntityComponentTypes, ActionFormData } from '../../core.js';
import { floatingTextMenu } from "./forms/floatingTextMenus.js";
import { getClearlagTimeRemaining } from "../clear-lag/clearlag.js";
const trackedItems = new Map();
const itemSpawnTimes = new Map();
const lastRadarMessage = new Map();
const rainbowColors = ['§c', '§6', '§e', '§a', '§b', '§d'];
const ITEM_DESPAWN_TIME = 6000;
const GRID_SIZE = 2.5;
const DIMENSIONS = ["overworld", "nether", "the_end"];
let currentTheme = 'default';
let timerEnabled = false;
let radarEnabled = false;
let displayEnabled = false;
let currentTick = 0;
let lastUpdateTime = Date.now();
let rainbowIndex = 0;
let isProcessing = false;
const RARITY = {
    COMMON: '§f', UNCOMMON: '§e', RARE: '§b', EPIC: '§d', LEGENDARY: '§6',
    NATURE: '§a', COMBAT: '§c', MAGICAL: '§9', NETHER: '§4', END: '§5'
};
const RARITY_MAP = new Map([
    ['legendary', ['dragon_egg', 'enchanted_golden_apple', 'nether_star', 'beacon', 'conduit', 'heart_of_the_sea', 'totem_of_undying', 'trident']],
    ['epic', ['netherite_sword', 'netherite_pickaxe', 'netherite_axe', 'netherite_shovel', 'netherite_hoe', 'netherite_helmet', 'netherite_chestplate', 'netherite_leggings', 'netherite_boots', 'netherite_ingot', 'netherite_block', 'netherite_scrap', 'ancient_debris', 'elytra', 'shulker_shell', 'end_crystal', 'dragon_breath', 'wither_skeleton_skull', 'music_disc', 'disc_fragment']],
    ['rare', ['diamond', 'diamond_block', 'diamond_ore', 'deepslate_diamond_ore', 'diamond_sword', 'diamond_pickaxe', 'diamond_axe', 'diamond_shovel', 'diamond_hoe', 'diamond_helmet', 'diamond_chestplate', 'diamond_leggings', 'diamond_boots', 'emerald', 'emerald_block', 'emerald_ore', 'deepslate_emerald_ore', 'enchanted_book', 'golden_apple', 'ender_pearl', 'ender_eye', 'blaze_rod', 'ghast_tear', 'phantom_membrane', 'prismarine_shard', 'prismarine_crystals', 'nautilus_shell', 'scute', 'rabbit_foot', 'experience_bottle', 'name_tag', 'saddle', 'horse_armor', 'iron_horse_armor', 'golden_horse_armor', 'diamond_horse_armor']],
    ['magical', ['enchanting_table', 'brewing_stand', 'lapis_lazuli', 'lapis_block', 'lapis_ore', 'amethyst_shard', 'amethyst_cluster', 'amethyst_block', 'spyglass', 'recovery_compass', 'echo_shard', 'potion', 'splash_potion', 'lingering_potion', 'arrow']],
    ['combat', ['bow', 'crossbow', 'shield', 'spectral_arrow', 'tipped_arrow', 'iron_sword', 'stone_sword', 'golden_sword', 'wooden_sword', 'iron_axe', 'stone_axe', 'golden_axe', 'wooden_axe', 'turtle_helmet', 'chainmail_helmet', 'chainmail_chestplate', 'chainmail_leggings', 'chainmail_boots', 'leather_helmet', 'leather_chestplate', 'leather_leggings', 'leather_boots', 'iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots', 'fire_charge', 'firework_rocket', 'firework_star', 'tnt']],
    ['nether', ['netherrack', 'nether_brick', 'nether_bricks', 'red_nether_bricks', 'nether_wart', 'nether_wart_block', 'warped_wart_block', 'soul_sand', 'soul_soil', 'magma_cream', 'magma_block', 'blaze_powder', 'glowstone', 'glowstone_dust', 'shroomlight', 'crying_obsidian', 'respawn_anchor', 'lodestone', 'blackstone', 'gilded_blackstone', 'basalt', 'quartz', 'nether_quartz_ore', 'crimson', 'warped', 'weeping_vines', 'twisting_vines', 'nether_gold_ore', 'gold_nugget']],
    ['end', ['end_stone', 'end_stone_bricks', 'purpur', 'end_rod', 'chorus', 'popped_chorus_fruit', 'shulker_box', 'dragon_head', 'end_portal_frame']],
    ['nature', ['sapling', 'leaves', 'azalea', 'moss', 'dripleaf', 'spore_blossom', 'glow_berries', 'sweet_berries', 'melon', 'pumpkin', 'wheat', 'carrot', 'potato', 'beetroot', 'sugar_cane', 'bamboo', 'cactus', 'kelp', 'seagrass', 'lily_pad', 'vine', 'flower', 'tulip', 'rose', 'dandelion', 'poppy', 'cornflower', 'lily', 'orchid', 'allium', 'azure', 'oxeye', 'sunflower', 'lilac', 'peony', 'fern', 'grass', 'seeds', 'bone_meal', 'cocoa_beans', 'honey', 'honeycomb', 'bee_nest', 'beehive', 'apple', 'egg', 'feather', 'leather', 'rabbit_hide', 'wool', 'string', 'slime_ball', 'ink_sac', 'glow_ink_sac', 'dye']],
    ['uncommon', ['gold_ingot', 'gold_block', 'gold_ore', 'deepslate_gold_ore', 'raw_gold', 'golden_helmet', 'golden_chestplate', 'golden_leggings', 'golden_boots', 'golden_pickaxe', 'golden_shovel', 'golden_hoe', 'clock', 'powered_rail', 'redstone', 'redstone_block', 'redstone_ore', 'deepslate_redstone_ore', 'observer', 'piston', 'sticky_piston', 'hopper', 'dropper', 'dispenser', 'comparator', 'repeater', 'daylight_detector', 'target', 'lever', 'button', 'pressure_plate', 'tripwire_hook', 'trapped_chest', 'iron_ingot', 'iron_block', 'iron_ore', 'deepslate_iron_ore', 'raw_iron', 'copper_ingot', 'copper_block', 'copper_ore', 'deepslate_copper_ore', 'raw_copper', 'coal', 'coal_block', 'coal_ore', 'deepslate_coal_ore', 'charcoal', 'book', 'paper', 'map', 'compass', 'bucket', 'shears', 'flint_and_steel', 'fishing_rod', 'lead', 'carrot_on_a_stick', 'warped_fungus_on_a_stick']]
]);
const RARITY_ORDER = ['legendary', 'epic', 'rare', 'magical', 'combat', 'nether', 'end', 'nature', 'uncommon'];
const RARITY_COLOR_MAP = {
    legendary: RARITY.LEGENDARY, epic: RARITY.EPIC, rare: RARITY.RARE,
    magical: RARITY.MAGICAL, combat: RARITY.COMBAT, nether: RARITY.NETHER,
    end: RARITY.END, nature: RARITY.NATURE, uncommon: RARITY.UNCOMMON
};
const themes = {
    'default': { description: "Minecraft Rarity Colors", quantity: '§7', useRarity: true },
    'classic': { description: "Original simple colors", quantity: '§e', normal: '§f', special: { diamond: '§b', netherite: '§d', gold: '§6', emerald: '§a', enchanted: '§d' } },
    'ocean': { description: "Cool ocean blues and aquas", quantity: '§b', normal: '§3', special: { diamond: '§9', netherite: '§1', gold: '§b', emerald: '§3', enchanted: '§9' } },
    'rainbow': { description: "Smooth cycling rainbow colors", quantity: '§f', normal: 'rainbow', special: { diamond: '§b', netherite: '§5', gold: '§6', emerald: '§a', enchanted: '§d' } },
    'nether': { description: "Fiery nether-themed colors", quantity: '§c', normal: '§4', special: { diamond: '§6', netherite: '§0', gold: '§e', emerald: '§2', enchanted: '§5' } },
    'end': { description: "Mysterious end-themed colors", quantity: '§5', normal: '§d', special: { diamond: '§f', netherite: '§8', gold: '§e', emerald: '§d', enchanted: '§5' } },
    'winter': { description: "Cool winter colors", quantity: '§b', normal: '§f', special: { diamond: '§9', netherite: '§8', gold: '§e', emerald: '§b', enchanted: '§f' } }
};
function loadSettings() {
    currentTheme = world.getDynamicProperty('sft:theme') ?? 'default';
    timerEnabled = world.getDynamicProperty('sft:timerEnabled') ?? false;
    radarEnabled = world.getDynamicProperty('sft:radarEnabled') ?? false;
    displayEnabled = world.getDynamicProperty('sft:displayEnabled') ?? false;
}
function isEntityValid(entity) {
    if (!entity) return false;
    try { return !!entity.id; } catch { return false; }
}
function getRainbowColor() {
    const now = Date.now();
    if (now - lastUpdateTime >= 500) {
        rainbowIndex = (rainbowIndex + 1) % rainbowColors.length;
        lastUpdateTime = now;
    }
    return rainbowColors[rainbowIndex];
}
function formatTime(ticks) {
    const total = Math.floor(ticks / 20);
    return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
}
function getItemAge(itemId) {
    const spawn = itemSpawnTimes.get(itemId);
    return spawn !== undefined ? currentTick - spawn : 0;
}
function getItemRarity(typeId) {
    const itemId = typeId.split(':')[1] || typeId;
    for (const tier of RARITY_ORDER) {
        if (RARITY_MAP.get(tier).some(i => itemId.includes(i))) {
            return RARITY_COLOR_MAP[tier];
        }
    }
    return RARITY.COMMON;
}
function getItemColor(itemStack, theme) {
    if (theme.useRarity) {
        let color = getItemRarity(itemStack.typeId);
        const enchants = itemStack.getComponent?.('minecraft:enchantable');
        if (enchants?.getEnchantments?.()?.length > 0) {
            if (color === RARITY.COMMON || color === RARITY.UNCOMMON || color === RARITY.NATURE) {
                color = RARITY.EPIC;
            }
        }
        return color;
    }
    if (theme.normal === 'rainbow') return getRainbowColor();
    const id = itemStack.typeId.split(':')[1];
    if (id.includes('diamond')) return theme.special.diamond;
    if (id.includes('netherite')) return theme.special.netherite;
    if (id.includes('gold')) return theme.special.gold;
    if (id.includes('emerald')) return theme.special.emerald;
    const enchants = itemStack.getComponent?.('minecraft:enchantable');
    if (enchants?.getEnchantments?.()?.length > 0) return theme.special.enchanted;
    return theme.normal;
}
function formatItemName(typeId, nameTag) {
    if (nameTag?.length > 0) return nameTag;
    const id = typeId.split(':')[1];
    if (!id) return null;
    return id.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}
function getSimpleItemName(itemStack) {
    return formatItemName(itemStack.typeId, itemStack.nameTag) ?? "Unknown";
}
function formatItemDisplay(item, itemId, overrideCount = null) {
    if (!isEntityValid(item)) return null;
    const comp = item.getComponent(EntityComponentTypes.Item);
    if (!comp?.itemStack) return null;
    const stack = comp.itemStack;
    if (stack.amount === undefined || !stack.typeId) return null;
    const count = overrideCount ?? stack.amount;
    const name = formatItemName(stack.typeId, stack.nameTag);
    if (!name) return null;
    const theme = themes[currentTheme];
    if (!theme) return null;
    const color = getItemColor(stack, theme);
    let display = `${theme.quantity}x${count} ${color}${name}`;
    const clearlag = getClearlagTimeRemaining?.() ?? 0;
    if (clearlag > 0) {
        const m = Math.floor(clearlag / 60);
        const s = clearlag % 60;
        const urgency = clearlag <= 10 ? '§c' : clearlag <= 30 ? '§6' : clearlag <= 60 ? '§e' : '§7';
        display += ` §r${urgency}[⚠${m}:${s.toString().padStart(2, '0')}]`;
    }
    if (timerEnabled && itemId) {
        const left = Math.max(0, ITEM_DESPAWN_TIME - getItemAge(itemId));
        display += ` §r§8[${formatTime(left)}]`;
    }
    return display;
}
function updateRainbowItems() {
    if (currentTheme !== 'rainbow') return;
    system.run(() => {
        const newColor = getRainbowColor();
        for (const [, text] of trackedItems) {
            if (!isEntityValid(text)) continue;
            const tag = text.nameTag;
            const idx = tag.indexOf(' [');
            if (idx !== -1) {
                text.nameTag = tag.substring(0, idx).replace(/§[0-9a-f]/gi, newColor) + tag.substring(idx);
            } else {
                text.nameTag = tag.replace(/§[0-9a-f]/gi, newColor);
            }
        }
    });
}
function updateRadar() {
    if (!radarEnabled) {
        for (const [id, has] of lastRadarMessage) {
            if (has) {
                world.getPlayers().find(p => p.id === id)?.onScreenDisplay.setActionBar("");
                lastRadarMessage.delete(id);
            }
        }
        return;
    }
    for (const player of world.getPlayers()) {
        const items = player.dimension.getEntities({ type: "minecraft:item", location: player.location, maxDistance: 100 });
        let nearest = null;
        let minDist = Infinity;
        for (const item of items) {
            if (!isEntityValid(item)) continue;
            const comp = item.getComponent(EntityComponentTypes.Item);
            if (!comp?.itemStack) continue;
            const loc = item.location;
            const dx = loc.x - player.location.x;
            const dy = loc.y - player.location.y;
            const dz = loc.z - player.location.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist < minDist) {
                minDist = dist;
                nearest = { name: getSimpleItemName(comp.itemStack), dist, typeId: comp.itemStack.typeId };
            }
        }
        if (nearest) {
            const theme = themes[currentTheme];
            const id = nearest.typeId.split(':')[1];
            let color = theme.normal ?? '§f';
            if (theme.special) {
                if (id.includes('diamond')) color = theme.special.diamond;
                else if (id.includes('netherite')) color = theme.special.netherite;
                else if (id.includes('gold')) color = theme.special.gold;
                else if (id.includes('emerald')) color = theme.special.emerald;
            }
            player.onScreenDisplay.setActionBar(`§e[RADAR] ${color}${nearest.name} §7(${Math.floor(nearest.dist)}m)`);
            lastRadarMessage.set(player.id, true);
        } else if (lastRadarMessage.get(player.id)) {
            player.onScreenDisplay.setActionBar("");
            lastRadarMessage.set(player.id, false);
        }
    }
}
function cleanupOrphanedTexts() {
    const tracked = new Set([...trackedItems.values()].filter(t => t?.id).map(t => t.id));
    for (const dimId of DIMENSIONS) {
        const dim = world.getDimension(dimId);
        try {
            for (const text of dim.getEntities({ type: "add:floating_text", tags: ["sft:item_name"] })) {
                if (isEntityValid(text) && !tracked.has(text.id)) {
                    try { text.remove(); } catch (e) {}
                }
            }
        } catch (e) {}
    }
}
function isVisibleToAnyPlayer(pos, dimension) {
    const players = world.getPlayers();
    for (const player of players) {
        if (player.dimension.id !== dimension.id) continue;
        const pLoc = player.location;
        let headLoc;
        try { headLoc = player.getHeadLocation(); } catch { headLoc = { x: pLoc.x, y: pLoc.y + 1.62, z: pLoc.z }; }
        const targetPos = { x: pos.x, y: pos.y, z: pos.z };
        const dx = targetPos.x - headLoc.x;
        const dy = targetPos.y - headLoc.y;
        const dz = targetPos.z - headLoc.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist > 64) continue;
        if (dist < 0.2) return true;
        const dir = { x: dx / dist, y: dy / dist, z: dz / dist };
        const options = {
            maxDistance: dist,
            includePassableBlocks: false,
            includeLiquidBlocks: false
        };
        const hit = dimension.getBlockFromRay(headLoc, dir, options);
        if (!hit) return true;
    }
    return false;
}
function* processItemsGenerator() {
    if (isProcessing) return;
    isProcessing = true;
    if (!displayEnabled) {
        for (const [key, text] of trackedItems) {
            try { text.remove(); } catch (e) {}
        }
        trackedItems.clear();
        itemSpawnTimes.clear();
        isProcessing = false;
        return;
    }
    try {
        const activeKeys = new Set();
        const clustersList = [];
        for (const dimId of DIMENSIONS) {
            const dim = world.getDimension(dimId);
            const items = dim.getEntities({ type: "minecraft:item" });
            const clusters = new Map();
            for (const item of items) {
                let comp;
                try {
                    comp = item.getComponent(EntityComponentTypes.Item);
                } catch (e) {
                    continue;
                }
                if (!comp?.itemStack) continue;
                const loc = item.location;
                const typeId = comp.itemStack.typeId;
                const amount = comp.itemStack.amount;
                const gx = Math.round(loc.x / GRID_SIZE);
                const gy = Math.round(loc.y / GRID_SIZE);
                const gz = Math.round(loc.z / GRID_SIZE);
                const key = `${dim.id}:${gx},${gy},${gz}:${typeId}`;
                if (!clusters.has(key)) {
                    clusters.set(key, { anchor: item, total: 0, count: 0, sum: { x: 0, y: 0, z: 0 }, dim });
                }
                const c = clusters.get(key);
                c.total += amount;
                c.count++;
                c.sum.x += loc.x;
                c.sum.y += loc.y;
                c.sum.z += loc.z;
                yield;
            }
            for (const [key, c] of clusters) {
                activeKeys.add(key);
                const pos = { x: c.sum.x / c.count, y: (c.sum.y / c.count) + 0.5, z: c.sum.z / c.count };
                const display = formatItemDisplay(c.anchor, key, c.total);
                if (display) {
                    clustersList.push({ key, pos, display, dim, basePos: { ...pos } });
                }
                yield;
            }
        }
        const usedIndices = new Set();
        const groups = [];
        clustersList.sort((a, b) => a.basePos.y - b.basePos.y);
        for (let i = 0; i < clustersList.length; i++) {
            if (usedIndices.has(i)) continue;
            const group = [clustersList[i]];
            usedIndices.add(i);
            for (let j = i + 1; j < clustersList.length; j++) {
                if (usedIndices.has(j)) continue;
                const a = clustersList[i];
                const b = clustersList[j];
                if (a.dim.id === b.dim.id) {
                    const dist = Math.hypot(a.basePos.x - b.basePos.x, a.basePos.z - b.basePos.z);
                    if (dist < 0.8 && Math.abs(a.basePos.y - b.basePos.y) < 1.5) {
                        group.push(b);
                        usedIndices.add(j);
                    }
                }
            }
            groups.push(group);
            yield;
        }
        for (const group of groups) {
            group.sort((a, b) => {
                const timeA = itemSpawnTimes.get(a.key) || Number.MAX_SAFE_INTEGER;
                const timeB = itemSpawnTimes.get(b.key) || Number.MAX_SAFE_INTEGER;
                if (timeA !== timeB) return timeA - timeB;
                return a.key.localeCompare(b.key);
            });
            for (let k = 0; k < group.length; k++) {
                group[k].pos.y += k * 0.35;
            }
        }
        for (const data of clustersList) {
            const { key, pos, display, dim } = data;
            if (!trackedItems.has(key)) {
                try {
                    const text = dim.spawnEntity("add:floating_text", pos);
                    text.addTag("sft:item_name");
                    text.nameTag = display;
                    trackedItems.set(key, text);
                    itemSpawnTimes.set(key, currentTick);
                } catch (e) {}
            } else {
                const text = trackedItems.get(key);
                if (isEntityValid(text)) {
                    try {
                        if (Math.hypot(text.location.x - pos.x, text.location.y - pos.y, text.location.z - pos.z) > 0.05) {
                            text.teleport(pos);
                        }
                        const isVisible = isVisibleToAnyPlayer(pos, dim);
                        const targetTag = isVisible ? display : "";
                        if (text.nameTag !== targetTag) {
                            text.nameTag = targetTag;
                        }
                    } catch (e) {}
                } else {
                    trackedItems.delete(key);
                    itemSpawnTimes.delete(key);
                }
            }
            yield;
        }
        const toDelete = [];
        for (const [key, text] of trackedItems) {
            if (!activeKeys.has(key)) {
                if (isEntityValid(text)) {
                    try { text.remove(); } catch (e) {}
                }
                toDelete.push(key);
            }
        }
        for (const key of toDelete) {
            trackedItems.delete(key);
            itemSpawnTimes.delete(key);
        }
    } catch (e) {
    } finally {
        isProcessing = false;
    }
}
function clearTrackedItems() {
    for (const [, text] of trackedItems) {
        if (isEntityValid(text)) text.remove();
    }
    trackedItems.clear();
    itemSpawnTimes.clear();
}
export function floatingItemsMenu(viewer) {
    new ActionFormData()
        .title("Floating Items Settings")
        .body(`Current Theme: ${currentTheme}\nDisplay: ${displayEnabled ? "§aON" : "§cOFF"}\nTimer: ${timerEnabled ? "§aON" : "§cOFF"}\nRadar: ${radarEnabled ? "§aON" : "§cOFF"}`)
        .button("Change Theme", "textures/ui/color_picker")
        .button(`Toggle Display: ${displayEnabled ? "§aON" : "§cOFF"}`, "textures/items/name_tag")
        .button(`Toggle Timer: ${timerEnabled ? "§aON" : "§cOFF"}`, "textures/ui/timer")
        .button(`Toggle Radar: ${radarEnabled ? "§aON" : "§cOFF"}`, "textures/ui/spyglass_flat")
        .button("Back", "textures/ui/arrow_left")
        .show(viewer).then(r => {
            if (r.canceled) return;
            if (r.selection === 0) changeThemeMenu(viewer);
            else if (r.selection === 1) {
                displayEnabled = !displayEnabled;
                world.setDynamicProperty('sft:displayEnabled', displayEnabled);
                if (!displayEnabled) {
                    clearTrackedItems();
                }
                floatingItemsMenu(viewer);
            } else if (r.selection === 2) {
                timerEnabled = !timerEnabled;
                world.setDynamicProperty('sft:timerEnabled', timerEnabled);
                floatingItemsMenu(viewer);
            } else if (r.selection === 3) {
                radarEnabled = !radarEnabled;
                world.setDynamicProperty('sft:radarEnabled', radarEnabled);
                if (!radarEnabled) {
                    viewer.onScreenDisplay.setActionBar("");
                    lastRadarMessage.delete(viewer.id);
                }
                floatingItemsMenu(viewer);
            } else if (r.selection === 4) {
                floatingTextMenu(viewer);
            }
        });
}
function changeThemeMenu(viewer) {
    const keys = Object.keys(themes);
    const form = new ActionFormData().title("Select Theme");
    for (const k of keys) form.button(`${k}\n${themes[k].description}`);
    form.show(viewer).then(r => {
        if (r.canceled) return floatingItemsMenu(viewer);
        if (r.selection >= 0 && r.selection < keys.length) {
            currentTheme = keys[r.selection];
            world.setDynamicProperty('sft:theme', currentTheme);
            viewer.sendMessage(`§aTheme changed to: §f${currentTheme}`);
            clearTrackedItems();
        }
        floatingItemsMenu(viewer);
    });
}
export function clearAllFloatingItemTexts() {
    clearTrackedItems();
}
system.run(loadSettings);
system.runInterval(() => { currentTick++; }, 5);
system.runInterval(() => { system.runJob(processItemsGenerator()); }, 10);
system.runInterval(() => { if (currentTheme === 'rainbow') updateRainbowItems(); }, 20);
system.runInterval(() => { updateRadar(); }, 20);
system.runInterval(cleanupOrphanedTexts, 200);
