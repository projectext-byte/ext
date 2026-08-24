import { world } from "../../core.js";
import { rankDefault } from "../../plugins/ranks/rank_default.js";
const KEYS = {
    CONFIG: "lobby_protection_config",
    REGIONS: "lobby_protected_regions",
    REGION_PREFIX: "lobby_region_"
};

const stripLegacyProtectionKeys = (config) => {
    if (!config || Array.isArray(config)) return config;
    const { liquidProtection, fluidFlowProtection, ...cleanConfig } = config;
    return cleanConfig;
};

const BASE_PROTECTION = {
    blockBreakProtection: true,
    blockPlaceProtection: true,
    interactionProtection: true,
    farmlandProtection: false,
    itemUseProtection: true,
    antiBowProtection: true,
    pvpProtection: true,
    damageProtection: true,
    mobSpawnProtection: true,
    explosionProtection: true,
    visualizeOnEnter: true,
    notifyOnEnter: true,
    playSounds: true,
    showParticles: true,
    fireProtection: true,
    adventureModeEnabled: false,
    antiFly: false,
    antiSpamEnabled: true,
    antiSpamCooldown: 2,
    adminBypassEnabled: true,
    adminTag: "admin",
    allowedRanks: [],
    protectedDimensions: ["overworld", "nether"],
    excludedEntities: [
        "minecraft:player", "minecraft:npc", "minecraft:egg", "minecraft:item",
        "minecraft:arrow", "minecraft:experience_bottle", "minecraft:enderman",
        "minecraft:ender_dragon", "minecraft:end_crystal",
        "xp_orb", "minecraft:painting", "add:floating_text", "add:*"
    ],
    maxPlayersPerBatch: 20,
    regionCacheDuration: 2000,
    effectBatchSize: 20,
    particleBatchSize: 15,
    teleportBatchSize: 10,
    cleanupInterval: 500,
    messageBatchSize: 25,
    entitySpawnBatchSize: 30
};
const DEFAULTS = {
    main: Object.freeze({
        enabled: true,
        fireSpreadProtection: true,
        itemDropProtection: true,
        lobbyInventoryEnabled: false,
        maxPlayersPerBatch: 20,
        regionCacheDuration: 2000,
        effectBatchSize: 20,
        particleBatchSize: 15,
        teleportBatchSize: 10,
        cleanupInterval: 500,
        messageBatchSize: 25,
        entitySpawnBatchSize: 30,
        performanceMonitoring: true,
        highPlayerThreshold: 50,
        ...BASE_PROTECTION
    }),
    region: Object.freeze({
        ...BASE_PROTECTION,
        maxParticlesPerVisualization: 50,
        particleStep: 8,
        batchProcessingEnabled: true,
        maxPlayersPerBatch: 20,
        regionCacheDuration: 2000,
        effectBatchSize: 20,
        particleBatchSize: 15,
        teleportBatchSize: 10,
        cleanupInterval: 500,
        messageBatchSize: 25,
        entitySpawnBatchSize: 30,
        lobbyInventoryEnabled: false
    })
};
const parseJSON = (str, fallback) => {
    try { return JSON.parse(str) || fallback; }
    catch { return fallback; }
};
const saveConfig = (key, config) => {
    try {
        world.setDynamicProperty(key, JSON.stringify(stripLegacyProtectionKeys(config)));
        return true;
    } catch { return false; }
};
const loadConfig = (key, defaults) => {
    const saved = world.getDynamicProperty(key);
    return saved ? { ...defaults, ...stripLegacyProtectionKeys(parseJSON(saved, {})) } : { ...defaults };
};
export const getLobbyConfig = () => loadConfig(KEYS.CONFIG, DEFAULTS.main);
export const saveLobbyConfig = (config) => saveConfig(KEYS.CONFIG, config);
export const getProtectedRegions = () => parseJSON(world.getDynamicProperty(KEYS.REGIONS), []);
export const saveProtectedRegions = (regions) => saveConfig(KEYS.REGIONS, regions);
export const getRegionConfig = (regionId) => {
    const key = `${KEYS.REGION_PREFIX}${regionId}_config`;
    return loadConfig(key, DEFAULTS.region);
};
export const saveRegionConfig = (regionId, config) => {
    const key = `${KEYS.REGION_PREFIX}${regionId}_config`;
    return saveConfig(key, config);
};
const RANK_PREFIX = "rank:";
const stripColorCodes = (value) => String(value || "").replace(/§./g, "");
export const normalizeAllowedRanks = (ranks) => {
    if (!Array.isArray(ranks)) return [];
    const result = [];
    const seen = new Set();
    for (const rawRank of ranks) {
        const rank = String(rawRank || "").startsWith(RANK_PREFIX)
            ? String(rawRank).slice(RANK_PREFIX.length)
            : String(rawRank || "");
        if (!rank) continue;
        const key = rank.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(rank);
    }
    return result;
};
const parseDynamicArray = (propertyId) => {
    try {
        const raw = world.getDynamicProperty(propertyId);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};
const parseDynamicObject = (propertyId) => {
    try {
        const raw = world.getDynamicProperty(propertyId);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
};
const getFallbackLobbyRank = () => {
    const rankKeys = Object.keys(rankDefault.ranks || {});
    const memberRank = rankKeys.find((key) => rankDefault.ranks[key]?.name === "Member");
    return normalizeAllowedRanks([memberRank || rankKeys[0]])[0] || "";
};
export const getAvailableLobbyRanks = () => {
    const ranks = [];
    const pushRank = (rank) => {
        const normalized = normalizeAllowedRanks([rank])[0];
        if (!normalized) return;
        if (ranks.some((entry) => entry.rank.toLowerCase() === normalized.toLowerCase())) return;
        ranks.push({ rank: normalized, label: getLobbyRankLabel(normalized) });
    };
    Object.keys(rankDefault.ranks || {}).forEach(pushRank);
    parseDynamicArray("customRankList").forEach(pushRank);
    Object.keys(parseDynamicObject("customRanks")).forEach(pushRank);
    return ranks;
};
export const getLobbyRankLabel = (rank) => {
    const normalized = normalizeAllowedRanks([rank])[0] || "";
    const key = `${RANK_PREFIX}${normalized}`;
    const customRanks = parseDynamicObject("customRanks");
    const info =
        rankDefault.ranks?.[key] ||
        rankDefault.ranks?.[key.toLowerCase()] ||
        customRanks[key] ||
        customRanks[key.toLowerCase()];
    const name = stripColorCodes(info?.name || normalized);
    return name && name !== normalized ? `${name} (${normalized})` : normalized;
};
export const getPlayerLobbyRank = (player) => {
    const rankTag = player?.getTags?.().find((tag) => tag.startsWith(RANK_PREFIX));
    if (rankTag) return rankTag.slice(RANK_PREFIX.length);
    try {
        return world.getDynamicProperty("defaultRank") || getFallbackLobbyRank();
    } catch {
        return getFallbackLobbyRank();
    }
};
export const isPlayerRankAllowed = (player, config) => {
    const allowedRanks = normalizeAllowedRanks(config?.allowedRanks);
    if (!allowedRanks.length) return true;
    const playerRank = String(getPlayerLobbyRank(player) || "").toLowerCase();
    return allowedRanks.some((rank) => rank.toLowerCase() === playerRank);
};
let regionCache = new Map();
let lastRegionCacheUpdate = 0;
const REGION_CACHE_DURATION = 2000;
export const isInProtectedRegion = (position, dimensionId = null) => {
    const now = Date.now();
    if (now - lastRegionCacheUpdate > REGION_CACHE_DURATION) {
        regionCache.clear();
        const regions = getProtectedRegions();
        regions.forEach(region => {
            const key = `${region.pos1.x},${region.pos1.y},${region.pos1.z},${region.pos2.x},${region.pos2.y},${region.pos2.z}`;
            regionCache.set(key, region);
        });
        lastRegionCacheUpdate = now;
    }
    const dimName = dimensionId ? dimensionId.split(":")[1] || dimensionId : null;
    for (const [key, region] of regionCache) {
        const [rx1, ry1, rz1, rx2, ry2, rz2] = key.split(',').map(Number);
        // Normalise so min <= max regardless of selection direction
        const minX = Math.min(rx1, rx2), maxX = Math.max(rx1, rx2);
        const minY = Math.min(ry1, ry2), maxY = Math.max(ry1, ry2);
        const minZ = Math.min(rz1, rz2), maxZ = Math.max(rz1, rz2);
        if (position.x < minX || position.x > maxX ||
            position.y < minY || position.y > maxY ||
            position.z < minZ || position.z > maxZ) {
            continue;
        }
        if (dimName) {
            const regionConf = getRegionConfig(region.id);
            const protectedDims = regionConf.protectedDimensions || ["overworld", "nether"];
            if (!protectedDims.includes(dimName)) {
                continue;
            }
        }
        return region;
    }
    const regions = getProtectedRegions();
    for (let i = 0; i < regions.length; i++) {
        const r = regions[i];
        // Normalise so min <= max regardless of selection direction
        const minX = Math.min(r.pos1.x, r.pos2.x), maxX = Math.max(r.pos1.x, r.pos2.x);
        const minY = Math.min(r.pos1.y, r.pos2.y), maxY = Math.max(r.pos1.y, r.pos2.y);
        const minZ = Math.min(r.pos1.z, r.pos2.z), maxZ = Math.max(r.pos1.z, r.pos2.z);
        if (position.x >= minX && position.x <= maxX &&
            position.y >= minY && position.y <= maxY &&
            position.z >= minZ && position.z <= maxZ) {
            if (dimName) {
                const regionConf = getRegionConfig(r.id);
                const protectedDims = regionConf.protectedDimensions || ["overworld", "nether"];
                if (!protectedDims.includes(dimName)) {
                    continue;
                }
            }
            const key = `${r.pos1.x},${r.pos1.y},${r.pos1.z},${r.pos2.x},${r.pos2.y},${r.pos2.z}`;
            regionCache.set(key, r);
            return r;
        }
    }
    return null;
};
export const isEntityExcluded = (entityTypeId, regionId = null) => {
    const config = regionId ? getRegionConfig(regionId) : getLobbyConfig();
    if (!config.excludedEntities) return false;
    if (config.excludedEntities.includes(entityTypeId)) return true;
    return config.excludedEntities.some(excludedType => {
        if (excludedType.includes('*')) {
            const regex = new RegExp(excludedType.replace(/\*/g, '.*'));
            return regex.test(entityTypeId);
        }
        return entityTypeId.includes(excludedType) ||
            entityTypeId.split(':')[1]?.includes(excludedType.split(':')[1] || excludedType);
    });
};
export const isValidEntityTypeId = (entityTypeId) =>
    typeof entityTypeId === 'string' && /^[a-zA-Z0-9_]+:[a-zA-Z0-9_]+$|^[a-zA-Z0-9_]+$/.test(entityTypeId);
export const getSuggestedEntityExclusions = () => [
    'minecraft:player', 'minecraft:npc', 'minecraft:villager', 'minecraft:item',
    'minecraft:experience_orb', 'minecraft:arrow', 'minecraft:egg', 'minecraft:enderman',
    'minecraft:ender_dragon', 'minecraft:end_crystal',
    'minecraft:painting', 'minecraft:*projectile*', 'minecraft:*particle*', 'custom:*', 'addon:*',
    '*item*', '*projectile*', '*particle*', 'minecraft:boat', 'minecraft:minecart',
    'minecraft:armor_stand', 'minecraft:item_frame', 'minecraft:glow_item_frame',
    'add:floating_text', 'add:*'
];
export const defaultLobbyConfig = DEFAULTS.main;
export const getPerformanceStats = () => {
    const players = world.getPlayers();
    const regions = getProtectedRegions();
    const playerCount = players.length;
    return {
        playerCount,
        regionCount: regions.length,
        isHighLoad: playerCount > 50,
        recommendedBatchSize: playerCount > 100 ? 25 : playerCount > 50 ? 20 : 15,
        recommendedCacheDuration: playerCount > 100 ? 3000 : 2000,
        performanceLevel: playerCount > 100 ? 'HIGH' : playerCount > 50 ? 'MEDIUM' : 'LOW',
        estimatedCapacity: playerCount > 100 ? '100-200 players' : playerCount > 50 ? '50-100 players' : '20-50 players'
    };
};
