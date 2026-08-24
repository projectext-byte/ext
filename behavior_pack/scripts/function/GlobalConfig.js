import { world, system } from '../core.js';

const PREFIX = "kiw:cfg:";
const LEGACY_PROP = "kiw_essentials:config";
const MIGRATED_FLAG = "kiw:cfg_migrated";
const CONFIG_READY_FLAG = "kiw:cfg_ready";

const LEGACY_KEYS = [
    "currency:config", "reports", "antinuker_config", "chat_settings",
    "time:timezone", "time:enabled", "time:displayTime",
    "scoreboard_lines", "nametag_settings", "afkConfig", "bannedItems",
    "banItemAutoClearEnabled", "bankResetTimestamp", "backpack_config",
    "bp_version", "customRanks", "customRankList", "defaultRank", "sft:theme",
    "sft:timerEnabled", "sft:radarEnabled", "sft:displayEnabled",
    "sft:moneyDisplayMode", "moneySystem:config", "homeConfig",
    "clearlagConfig", "xpShopConfig", "npcConfig", "dailyRewardConfig",
    "custom_shop_config", "starterKitConfig", "rare_shop_config",
    "totalServerVotes", "voteRewards", "cfg:admin_tag", "cfg:sys_db",
    "cfg:plr_db", "cfg:ses_db", "sys:auth_enabled", "bounty:minAmount",
    "bounty:refundPercent", "bounty:cooldown", "bounty:expire",
    "transferConfig", "rare_shop:stock_mode", "rare_shop:restock_interval"
];

function encodeValue(value) {
    if (value === null || value === undefined) return undefined;
    if (typeof value === "boolean" || typeof value === "number") return String(value);
    if (typeof value === "string") return value;
    return JSON.stringify(value);
}

function decodeValue(raw) {
    if (raw === undefined || raw === null) return undefined;
    if (typeof raw !== "string") return raw;
    if (raw === "true") return true;
    if (raw === "false") return false;
    const num = Number(raw);
    if (!isNaN(num) && raw.trim() !== "") return num;
    try {
        if (raw.startsWith("{") || raw.startsWith("[")) return JSON.parse(raw);
    } catch { }
    return raw;
}

class GlobalConfig {
    static _migrated = false;
    static _ready = false;

    static _migrateOnce() {
        if (this._migrated) return;
        this._migrated = true;

        try {
            if (world.getDynamicProperty(MIGRATED_FLAG)) {
                this._ready = true;
                return;
            }
        } catch (e) {
            console.warn("[GlobalConfig] Error checking migration flag:", e);
            return;
        }

        let count = 0;

        try {
            const rawGlobal = world.getDynamicProperty(LEGACY_PROP);
            if (rawGlobal) {
                try {
                    const parsed = JSON.parse(rawGlobal);
                    for (const [k, v] of Object.entries(parsed)) {
                        if (v !== undefined && v !== null) {
                            try {
                                world.setDynamicProperty(PREFIX + k, encodeValue(v));
                                count++;
                            } catch (e) {
                                console.warn(`[GlobalConfig] Failed to migrate key "${k}":`, e);
                            }
                        }
                    }
                } catch (e) {
                    console.warn("[GlobalConfig] Failed to parse legacy config:", e);
                }
                try { world.setDynamicProperty(LEGACY_PROP, undefined); } catch { }
            }
        } catch (e) {
            console.warn("[GlobalConfig] Error reading legacy prop:", e);
        }

        for (const key of LEGACY_KEYS) {
            try {
                const raw = world.getDynamicProperty(key);
                if (raw !== undefined) {
                    try {
                        world.setDynamicProperty(PREFIX + key, typeof raw === "string" ? raw : encodeValue(raw));
                        world.setDynamicProperty(key, undefined);
                        count++;
                    } catch (e) {
                        console.warn(`[GlobalConfig] Failed to migrate legacy key "${key}":`, e);
                    }
                }
            } catch { }
        }

        try {
            world.setDynamicProperty(MIGRATED_FLAG, true);
        } catch (e) {
            console.warn("[GlobalConfig] Failed to set migration flag:", e);
        }

        this._ready = true;
        if (count > 0) console.warn(`[GlobalConfig] Migrasi selesai: ${count} key dipindahkan ke format baru.`);
    }

    static isReady() {
        return this._ready;
    }

    static get(key, defaultValue) {
        this._migrateOnce();
        try {
            const raw = world.getDynamicProperty(PREFIX + key);
            if (raw === undefined || raw === null) return defaultValue;
            return decodeValue(raw);
        } catch (e) {
            console.warn(`[GlobalConfig] Error getting key "${key}":`, e);
            return defaultValue;
        }
    }

    static set(key, value) {
        this._migrateOnce();
        try {
            if (value === undefined || value === null) {
                world.setDynamicProperty(PREFIX + key, undefined);
            } else {
                world.setDynamicProperty(PREFIX + key, encodeValue(value));
            }
            return true;
        } catch (e) {
            console.warn(`[GlobalConfig] Gagal simpan key "${key}":`, e);
            return false;
        }
    }

    static delete(key) {
        this._migrateOnce();
        try {
            world.setDynamicProperty(PREFIX + key, undefined);
            return true;
        } catch (e) {
            console.warn(`[GlobalConfig] Error deleting key "${key}":`, e);
            return false;
        }
    }
}

world.afterEvents.worldLoad.subscribe(() => {
    GlobalConfig._migrated = false;
    GlobalConfig._ready = false;
    system.runTimeout(() => {
        GlobalConfig._migrateOnce();
        console.warn("[GlobalConfig] Initialized after worldLoad");
    }, 20);
});

system.runTimeout(() => {
    GlobalConfig._migrateOnce();
}, 10);

export { GlobalConfig };
