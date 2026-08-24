import { system, world } from "../core.js";
import { board, subscribeToConfig } from "../board/_config.js";
import { ScoreboardDB, PlaceholderDB } from "../board/data.js";
import { getClan } from "../function/getClan.js";
import { getPlaceholder } from "../function/getPlaceholder.js";
import { getLavaRankLabel } from "./extremesmpRank.js";
import { getScore } from "../function/getScore.js";
import { metricNumbers } from "../lib/game.js";
import { clanDB } from "../function/getClan.js";
import { getBank } from "../plugins/bank/bank.js";
import { GlobalConfig } from "../function/GlobalConfig.js";
import { getScoreboardDate, getScoreboardTimestamp } from "../function/timeSystem.js";
const UPDATE_INTERVAL = 60;
const OBJECTIVES = ["extremesmp_money", "death", "kill", "playtime", "online_time", "coin"];
// EXTREMESMP server capacity. Keep the HUD denominator stable at 1000.
const SERVER_MAX_ONLINE = "1000";
const DEFAULT_MAX_ONLINE = SERVER_MAX_ONLINE;
const cache = {
  currency: "§a$",
  moneyObjective: "money",
  maxOnline: DEFAULT_MAX_ONLINE,
  timeEnabled: false,
  placeholders: {},
  lastTpsUpdate: Date.now(),
  tps: 20
};
const activePlayers = new Set();
const MONEY_OBJECTIVE = "extremesmp_money";

function getLiveMoney(player) {
  try {
    const objective = world.scoreboard.getObjective(MONEY_OBJECTIVE);
    const score = objective?.getScore(player.scoreboardIdentity);
    return Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0;
  } catch {
    return 0;
  }
}

function formatFullMoney(value) {
  const safeValue = Math.max(0, Math.floor(Number(value) || 0));
  return String(safeValue).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function formatPlaytime(score) {
  // playtime is incremented once per 60 ticks; display elapsed time as h/m.
  const totalSeconds = Math.max(0, Math.floor(Number(score) || 0) * (UPDATE_INTERVAL / 20));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${String(minutes).padStart(2, "0")}m` : `${minutes}m`;
}
function getPlayerPing(player) {
  // Bedrock Script API does not expose server latency on every runtime. Use a supplied dynamic value when available.
  try {
    const candidates = [player.ping, player.latency, player.getDynamicProperty("extremesmp:ping")];
    for (const candidate of candidates) {
      const value = Number(candidate);
      if (Number.isFinite(value) && value >= 0) return Math.round(value);
    }
  } catch { }
  return "—";
}
function setupScoreboards() {
  const sb = world.scoreboard;
  for (const obj of OBJECTIVES) {
    if (!sb.getObjective(obj)) {
      try { sb.addObjective(obj, obj); } catch (e) { }
    }
  }
}
async function refreshCache() {
  await ScoreboardDB.ready();
  cache.currency = "§a$";
  cache.moneyObjective = ScoreboardDB.get("ScoreboardDBConfig-default-money") || "extremesmp_money";
  // Migrate old oneui values such as 10/99 and keep the live HUD at 1/1000.
  cache.maxOnline = SERVER_MAX_ONLINE;
  if (ScoreboardDB.get("ScoreboardDBConfig-max-online") !== SERVER_MAX_ONLINE) {
    ScoreboardDB.set("ScoreboardDBConfig-max-online", SERVER_MAX_ONLINE);
  }
  cache.timeEnabled = GlobalConfig.get("time:enabled") ?? false;
  cache.placeholders = Object.fromEntries(PlaceholderDB.entries());
}
system.run(async () => {
  setupScoreboards();
  await refreshCache();
});
subscribeToConfig(refreshCache);
system.runInterval(() => {
  const now = getScoreboardTimestamp();
  const diff = now - cache.lastTpsUpdate;
  if (diff > 0) {
    cache.tps = Math.min(20, (1000 / diff) * UPDATE_INTERVAL);
  }
  cache.lastTpsUpdate = now;
  const date = getScoreboardDate(now);
  const dateData = {
    HOUR: date.hour,
    MINUTE: date.minute,
    DAY: date.day,
    MONTH: date.month,
    YEAR: date.year,
    TPS: cache.tps.toFixed(1),
    ONLINE: world.getPlayers().length,
    MAXON: cache.maxOnline,
    TIMEZONE: date.timezone,
    BLANK: " "
  };
  const sb = world.scoreboard;
  const playtimeObj = sb.getObjective("playtime");
  const onlineTimeObj = sb.getObjective("online_time");
  for (const player of world.getPlayers()) {
    try {
      if (playtimeObj) playtimeObj.addScore(player, 1);
      if (onlineTimeObj) onlineTimeObj.setScore(player, 1);
    } catch { }
    if (player.getDynamicProperty("personal_scoreboard_disabled")) {
      if (activePlayers.has(player.id)) {
        player.onScreenDisplay.setTitle("", { fadeInDuration: 0, stayDuration: 0, fadeOutDuration: 0 });
        activePlayers.delete(player.id);
      }
      continue;
    }
    activePlayers.add(player.id);
    const healthComponent = player.getComponent("minecraft:health");
    const health = healthComponent ? Math.ceil(healthComponent.currentValue) : 0;
    const placeholders = {
      ...cache.placeholders,
      ...dateData,
      NAME: player.name.length > 10 ? player.name.substring(0, 10) + ".." : player.name,
      CURRENCY: "§a$",
      MONEY: `§a${formatFullMoney(getLiveMoney(player))}`,
      BANK: metricNumbers(getBank(player)),
      COIN: formatFullMoney(getScore(player, "coin") || 0),
      RANK: getLavaRankLabel(player),
      CLAN: getClan(player) || clanDB.get("ClanDBConfig-default") || "None",
      HEALTH: health,
      LEVEL: player.level,
      XP: player.getTotalXp(),
      KILL: getScore(player, "kill"),
      DEATH: getScore(player, "death"),
      KILLS: getScore(player, "kill"),
      DEATHS: getScore(player, "death"),
      PLAYTIME: formatPlaytime(getScore(player, "playtime")),
      PING: getPlayerPing(player),
      DIMENSION: player.dimension.id.split(":")[1].replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      X: Math.floor(player.location.x),
      Y: Math.floor(player.location.y),
      Z: Math.floor(player.location.z)
    };
    const text = getPlaceholder(board.Line.join("\n"), [placeholders]);
    player.onScreenDisplay.setTitle(text, {
      fadeInDuration: 0,
      // Keep the title lifetime shorter than the 60-tick refresh interval.
      // The previous 70-tick lifetime caused two HUD frames to overlap.
      stayDuration: Math.max(1, UPDATE_INTERVAL - 1),
      fadeOutDuration: 0,
    });
  }
}, UPDATE_INTERVAL);
world.afterEvents.entityDie.subscribe((event) => {
  const { deadEntity, damageSource } = event;
  if (deadEntity.typeId === "minecraft:player") {
    try {
      world.scoreboard.getObjective("death")?.addScore(deadEntity, 1);
    } catch { }
    if (damageSource?.damagingEntity?.typeId === "minecraft:player") {
      try {
        world.scoreboard.getObjective("kill")?.addScore(damageSource.damagingEntity, 1);
      } catch { }
    }
  }
});
export { };
