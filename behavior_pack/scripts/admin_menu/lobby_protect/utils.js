import { system, world } from "../../core.js";
import { getLobbyConfig, getRegionConfig } from "./config.js";
export const playerAreas = new Map();
const msgCooldowns = new Map();
const msgQueue = [];
export const isAuthorizedAdmin = (p, rId) => {
    const tag = (rId ? getRegionConfig(rId)?.adminTag : null) || getLobbyConfig().adminTag || "admin";
    const player = typeof p === 'string' ? [...world.getPlayers()].find(pl => pl.id === p) : p;
    return player?.hasTag(tag) ?? false;
};
export const sendProtectionMessage = (p, msg) => {
    if (!p || (typeof p.isValid === 'function' && !p.isValid())) return;
    const conf = getLobbyConfig();
    if (conf.antiSpamEnabled) {
        const now = Date.now(), last = msgCooldowns.get(p.id) || 0;
        if (now - last < (conf.antiSpamCooldown || 2) * 1000) return;
        msgCooldowns.set(p.id, now);
    }
    msgQueue.push({ p, msg });
};
let cleanupCounter = 0;
system.runInterval(() => {
    if (msgQueue.length) {
        msgQueue.splice(0, 25).forEach(({ p, msg }) => {
            try {
                if (p.isValid()) {
                    p.sendMessage(msg);
                    if (getLobbyConfig().playSounds) p.runCommand(`playsound note.bass @s ~ ~ ~ 1 0.5`);
                }
            } catch { }
        });
    }
    if (++cleanupCounter >= 30) {
        cleanupCounter = 0;
        const online = new Set(world.getPlayers().map(p => p.id));
        for (const id of msgCooldowns.keys()) if (!online.has(id)) msgCooldowns.delete(id);
        for (const id of playerAreas.keys()) if (!online.has(id)) playerAreas.delete(id);
    }
}, 20);
