import { serializePlayerInventory, deserializePlayerInventory, purgePlayerInventory } from "./inventory_utils.js";
const S_KEY = "lobby_protect:saved_inventory";
const L_KEY = "lobby_protect:lobby_inventory";
export function activateLobbyMode(p) {
    try {
        if (p.dimension.id === "minecraft:the_end") return;
        if (p.getDynamicProperty(S_KEY)) return;
        const survivalData = serializePlayerInventory(p);
        p.setDynamicProperty(S_KEY, JSON.stringify(survivalData));
        purgePlayerInventory(p);
        const lobbyDataStr = p.getDynamicProperty(L_KEY);
        if (lobbyDataStr) { try { deserializePlayerInventory(p, JSON.parse(lobbyDataStr)); } catch { } }
    } catch { }
}
export function deactivateLobbyMode(p) {
    try {
        const survivalDataStr = p.getDynamicProperty(S_KEY);
        if (!survivalDataStr) return;
        if (p.dimension.id !== "minecraft:the_end") {
            const lobbyData = serializePlayerInventory(p);
            p.setDynamicProperty(L_KEY, JSON.stringify(lobbyData));
        }
        purgePlayerInventory(p);
        try { deserializePlayerInventory(p, JSON.parse(survivalDataStr)); } catch { }
        p.setDynamicProperty(S_KEY, null);
    } catch { }
}
export function clearLobbyData(p) {
    try { p.setDynamicProperty(S_KEY, null); p.setDynamicProperty(L_KEY, null); } catch { }
}