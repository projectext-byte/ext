import { world } from '../../../core.js';
export const DEFAULT_CONFIG = {
    categories: [
        { id: "weapons", name: "§6Weapons", icon: "textures/items/diamond_sword" },
        { id: "armor", name: "§bArmor", icon: "textures/items/diamond_chestplate" },
        { id: "tools", name: "§aTools", icon: "textures/items/diamond_pickaxe" },
        { id: "food", name: "§eFood", icon: "textures/items/beef_cooked" }
    ],
    items: {
        weapons: [
            { id: "minecraft:diamond_sword", name: "Diamond Sword", price: 500, amount: 1, icon: "textures/items/diamond_sword" },
            { id: "minecraft:netherite_sword", name: "Netherite Sword", price: 2000, amount: 1, icon: "textures/items/netherite_sword" }
        ],
        armor: [
            { id: "minecraft:diamond_helmet", name: "Diamond Helmet", price: 300, amount: 1, icon: "textures/items/diamond_helmet" },
            { id: "minecraft:diamond_chestplate", name: "Diamond Chestplate", price: 500, amount: 1, icon: "textures/items/diamond_chestplate" },
            { id: "minecraft:diamond_leggings", name: "Diamond Leggings", price: 400, amount: 1, icon: "textures/items/diamond_leggings" },
            { id: "minecraft:diamond_boots", name: "Diamond Boots", price: 300, amount: 1, icon: "textures/items/diamond_boots" }
        ],
        tools: [
            { id: "minecraft:diamond_pickaxe", name: "Diamond Pickaxe", price: 400, amount: 1, icon: "textures/items/diamond_pickaxe" },
            { id: "minecraft:diamond_axe", name: "Diamond Axe", price: 350, amount: 1, icon: "textures/items/diamond_axe" },
            { id: "minecraft:diamond_shovel", name: "Diamond Shovel", price: 300, amount: 1, icon: "textures/items/diamond_shovel" }
        ],
        food: [
            { id: "minecraft:cooked_beef", name: "Steak", price: 10, amount: 16, icon: "textures/items/beef_cooked" },
            { id: "minecraft:golden_apple", name: "Golden Apple", price: 100, amount: 1, icon: "textures/items/apple_golden" }
        ]
    }
};
export const NPCShopConfig = {
    get: (shopId = null) => {
        try {
            const key = shopId ? `custom_shop_config_${shopId}` : "custom_shop_config";
            const data = world.getDynamicProperty(key);
            if (!data && shopId) {
                 const globalData = world.getDynamicProperty("custom_shop_config");
                 return globalData ? JSON.parse(globalData) : JSON.parse(JSON.stringify(DEFAULT_CONFIG));
            }
            return data ? JSON.parse(data) : JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        } catch (e) {
            console.warn("Failed to load npc shop config:", e);
            return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        }
    },
    save: (config, shopId = null) => {
        try {
            const key = shopId ? `custom_shop_config_${shopId}` : "custom_shop_config";
            world.setDynamicProperty(key, JSON.stringify(config));
            return true;
        } catch (e) {
            console.warn("Failed to save npc shop config:", e);
            return false;
        }
    }
};
