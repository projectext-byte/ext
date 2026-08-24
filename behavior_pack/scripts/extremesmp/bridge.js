import { system } from "@minecraft/server";

let openMenuHandler = null;
const pendingMenuPlayers = new Set();

export function registerEXTREMESMPMenu(handler) {
  openMenuHandler = typeof handler === "function" ? handler : null;
}

function playerKey(player) {
  try {
    return String(player?.id || player?.name || "");
  } catch {
    return "";
  }
}

function notifyMenuUnavailable(player) {
  try {
    player?.sendMessage?.("§cEXTREMESMP: เมนูยังไม่พร้อมใช้งาน §7[MENU_NOT_READY]");
  } catch {
    // The player may have left before the bridge finished retrying.
  }
}

function retryOpen(player, attempt = 0) {
  const key = playerKey(player);
  if (!key) return;
  if (typeof openMenuHandler === "function") {
    pendingMenuPlayers.delete(key);
    try {
      openMenuHandler(player);
    } catch {
      notifyMenuUnavailable(player);
    }
    return;
  }
  if (attempt >= 20) {
    pendingMenuPlayers.delete(key);
    notifyMenuUnavailable(player);
    return;
  }
  system.runTimeout(() => retryOpen(player, attempt + 1), 2);
}

export function openEXTREMESMPMenu(player) {
  if (typeof openMenuHandler === "function") {
    try {
      return openMenuHandler(player);
    } catch {
      notifyMenuUnavailable(player);
      return undefined;
    }
  }
  const key = playerKey(player);
  if (!key || pendingMenuPlayers.has(key)) return undefined;
  pendingMenuPlayers.add(key);
  system.runTimeout(() => retryOpen(player, 0), 1);
  return undefined;
}
