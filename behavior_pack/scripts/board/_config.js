import { ScoreboardDB, ScoreboardLines } from "./data.js";
import { system } from "../core.js";
import { globalCache } from "../lib/cache.js";
const CACHE_CONFIG = {
  maxAge: 300000,
  updateInterval: 10,
};
const configListeners = new Set();
function subscribeToConfig(listener) {
  configListeners.add(listener);
  return () => configListeners.delete(listener);
}
function notifyConfigChange() {
  const now = Date.now();
  globalCache.set("lastUpdate", now);
  globalCache.delete("lines");
  globalCache.delete("title");
  const listeners = Array.from(configListeners);
  for (const element of listeners) {
    element();
  }
}
const DEFAULT_LINES = [
  "§f@NAME §8| §7@RANK",
  "§e@CURRENCY@MONEY",
  "§7ONLINE §f@ONLINE/@MAXON",
  "§7KILLS §f@KILLS",
  "§7DEATHS §f@DEATHS",
  "§7PLAYTIME §f@PLAYTIME",
];
const board = {
  get Line() {
    const isEnabled = ScoreboardDB.get("ScoreboardDBConfig-enabled") ?? true;
    if (!isEnabled) return [];
    const cachedLines = globalCache.get("lines");
    if (cachedLines) {
      return cachedLines;
    }
    let customLines = ScoreboardLines.get("lines");
    if (!customLines) {
      customLines = ScoreboardDB.get("ScoreboardDBConfig-lines");
    }
    // The new EXTREMESMP HUD is intentionally fixed so legacy saved templates cannot render a second sidebar.
    const lines = DEFAULT_LINES;
    globalCache.set("lines", lines);
    globalCache.set("lastUpdate", Date.now());
    return lines;
  },
};
system.runInterval(() => {
  globalCache.cleanup();
}, 6000);
export { board, subscribeToConfig, notifyConfigChange, DEFAULT_LINES };
