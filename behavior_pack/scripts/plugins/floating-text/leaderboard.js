import { world, system } from "../../core.js";
import { getClanLeaderboardData } from "../clan/clan.js";
import { getScore, metricNumbers } from "../../lib/game.js";
import { getFullMoney, formatMoneyValue, useDecimalMode } from "../../function/moneySystem.js";
import { getBank } from "../bank/bank.js";
export const MONEY_DISPLAY_OPTIONS = { FULL: "full", TRUNCATED: "truncated", STARS: "stars" };
let moneyDisplayMode = MONEY_DISPLAY_OPTIONS.TRUNCATED;
export function getMoneyDisplayMode() {
  return world.getDynamicProperty("sft:moneyDisplayMode") || moneyDisplayMode;
}
export function setMoneyDisplayMode(mode) {
  if (Object.values(MONEY_DISPLAY_OPTIONS).includes(mode)) {
    world.setDynamicProperty("sft:moneyDisplayMode", mode);
    moneyDisplayMode = mode;
  }
}
export function formatMoneyDisplay(value) {
  if (value === undefined || value === null) return "0";
  if (useDecimalMode()) {
    try { return formatMoneyValue(BigInt(value)); } catch { return "0"; }
  }
  const mode = getMoneyDisplayMode();
  switch (mode) {
    case MONEY_DISPLAY_OPTIONS.FULL: return value.toString();
    case MONEY_DISPLAY_OPTIONS.STARS: return "****";
    default: return metricNumbers(value.toString());
  }
}
function formatPlaytime(score, unitIndex) {
  switch (unitIndex) {
    case 0: return `${score} Seconds`;
    case 1: return `${Math.floor(score / 60)} Minute`;
    case 2: return `${(score / 3600).toFixed(2)} Hours`;
    case 3: return `${(score / 86400).toFixed(2)} Days`;
    default: return `${score} Seconds`;
  }
}
function getPlaytimeNumericValue(score, unitIndex) {
  switch (unitIndex) {
    case 0: return score;
    case 1: return score / 60;
    case 2: return score / 3600;
    case 3: return score / 86400;
    default: return score;
  }
}
let playerScoreCache = new Map();
let cacheTime = 0;
const CACHE_DURATION = 5000;
function getCachedPlayerScores(objectiveId, unitIndex) {
  const now = Date.now();
  const cacheKey = `${objectiveId}_${unitIndex}`;
  if (now - cacheTime > CACHE_DURATION) {
    playerScoreCache.clear();
    cacheTime = now;
  }
  if (playerScoreCache.has(cacheKey)) {
    return playerScoreCache.get(cacheKey);
  }
  const players = world.getPlayers();
  const scores = {};
  const numericScores = {};
  for (const player of players) {
    const name = player.name;
    if (objectiveId === "extremesmp_money") {
      const moneyAmount = getFullMoney(player) || 0;
      scores[name] = moneyAmount.toString();
      numericScores[name] = parseInt(moneyAmount.toString());
    } else if (objectiveId === "bank") {
      const bankAmount = getBank(player) || 0n;
      scores[name] = bankAmount.toString();
      numericScores[name] = parseInt(bankAmount.toString());
    } else if (objectiveId === "coin") {
      const coinAmount = getScore(player, "coin") || 0;
      scores[name] = coinAmount;
      numericScores[name] = coinAmount;
    } else if (objectiveId === "playtime" || objectiveId === "online_time") {
      const score = getScore(player, "playtime") || 0;
      numericScores[name] = getPlaytimeNumericValue(score, unitIndex ?? 2);
      scores[name] = formatPlaytime(score, unitIndex ?? 2);
    } else {
      const score = getScore(player, objectiveId) || 0;
      scores[name] = score;
      numericScores[name] = score;
    }
  }
  const result = { scores, numericScores, playerCount: players.length };
  playerScoreCache.set(cacheKey, result);
  return result;
}
const lastSavedData = new Map();
function shouldSaveData(entityId, data) {
  const lastData = lastSavedData.get(entityId);
  if (!lastData) return true;
  const currentHash = JSON.stringify([data[8], data[10]]);
  if (lastData !== currentHash) {
    lastSavedData.set(entityId, currentHash);
    return true;
  }
  return false;
}
export function updateLeaderboard(entity, data) {
  if (data[1] === "clan_leaderboard") {
    const clanData = getClanLeaderboardData().slice(0, 10);
    const sep = "§8" + "=".repeat(28);
    const entries = clanData.map((clan, i) =>
      `§7#${i + 1} §8${clan.tag} §r${clan.name}§r\n§7Level: §a${clan.level} §8| §e${clan.memberCount} members §8| §a${clan.onlineCount} online`
    );
    entity.nameTag = [`§l§dTOP CLAN LEADERBOARD§r`, `§8(by level & member)`, sep, ...entries, sep].join("\n");
    return;
  }
  if (data[1] === "clan_member_count") {
    const clanData = getClanLeaderboardData().sort((a, b) => b.memberCount - a.memberCount).slice(0, 10);
    const sep = "§8" + "=".repeat(28);
    const entries = clanData.map((clan, i) =>
      `§7#${i + 1} §8${clan.tag} §r${clan.name}§r\n§7Members: §e${clan.memberCount} §8| §a${clan.onlineCount} online`
    );
    entity.nameTag = [`§l§dCLAN MEMBER COUNT§r`, `§8(by member count)`, sep, ...entries, sep].join("\n");
    return;
  }
  if (data[1] === "clan_level") {
    const clanData = getClanLeaderboardData().sort((a, b) => b.level - a.level).slice(0, 10);
    const sep = "§8" + "=".repeat(28);
    const entries = clanData.map((clan, i) =>
      `§7#${i + 1} §r${clan.name}§r\n§7Level: §a${clan.level} §8| §e${clan.memberCount} members`
    );
    entity.nameTag = [`§l§dCLAN LEVEL LEADERBOARD§r`, `§8(by level & member)`, sep, ...entries, sep].join("\n");
    return;
  }
  const unitIndex = data[9] ?? 2;
  const cached = getCachedPlayerScores(data[1], unitIndex);
  const { scores, numericScores, playerCount } = cached;
  if (data[1] === "online_time") {
    const cachedScores = data[8] || {};
    const cachedNumericScores = data[10] || {};
    for (const name in cachedScores) {
      if (!scores[name]) { delete cachedScores[name]; delete cachedNumericScores[name]; }
    }
    Object.assign(cachedScores, scores);
    Object.assign(cachedNumericScores, numericScores);
    const sorted = Object.entries(cachedNumericScores)
      .map(([name, num]) => ({ name, numericScore: num, displayScore: cachedScores[name] }))
      .sort((a, b) => data[2] ? b.numericScore - a.numericScore : a.numericScore - b.numericScore)
      .slice(0, data[7]);
    const sep = "§8" + "=".repeat(28);
    const colors = ["§6", "§b", "§a"];
    const entries = sorted.map(({ name, displayScore }, i) => {
      const c = colors[i] || "§f";
      const dn = name.length > 16 ? name.substring(0, 14) + ".." : name.padEnd(16, " ");
      return `${c}#${(i + 1).toString().padStart(2, " ")} §r${data[5]}${dn}§r §8| ${data[6]}${displayScore}§r`;
    });
    entity.nameTag = [`§l${data[0] || "ONLINE PLAYERS"}§r`, `§8(Current online: ${playerCount})`, sep, ...entries, sep].join("\n");
    data[8] = cachedScores; data[10] = cachedNumericScores;
    if (shouldSaveData(entity.id, data)) entity.setDynamicProperty("sft:scoreboardData", JSON.stringify(data));
    return;
  }
  const objective = world.scoreboard.getObjective(data[1]);
  if (!objective) {
    try { world.getDimension("overworld").runCommand(`scoreboard objectives add ${data[1]} dummy`); } catch { }
    if (!world.scoreboard.getObjective(data[1])) {
      entity.nameTag = `§l${data[0] || "LEADERBOARD"}§r\n§8${"".repeat(28)}\n§cScoreboard '${data[1]}' not found!`;
      return;
    }
  }
  const cachedScores = data[8] || {};
  const cachedNumericScores = data[10] || {};
  Object.assign(cachedScores, scores);
  Object.assign(cachedNumericScores, numericScores);
  const sorted = Object.entries(cachedNumericScores)
    .map(([name, num]) => ({ name, numericScore: num || 0, displayScore: cachedScores[name] || 0 }))
    .sort((a, b) => data[2] ? b.numericScore - a.numericScore : a.numericScore - b.numericScore)
    .slice(0, data[7]);
  const sep = "§8" + "=".repeat(28);
  const colors = ["§6", "§b", "§a"];
  const entries = sorted.map(({ name, displayScore }, i) => {
    const c = colors[i] || "§f";
    const dn = name.length > 16 ? name.substring(0, 14) + ".." : name.padEnd(16, " ");
    let fs = displayScore;
    if (data[1] === "money" || data[1] === "bank" || data[1] === "coin") fs = formatMoneyDisplay(displayScore);
    return `${c}#${(i + 1).toString().padStart(2, " ")} §r${data[5]}${dn}§r §8| ${data[6]}${fs}§r`;
  });
  entity.nameTag = [`§l${data[0] || "LEADERBOARD"}§r`, sep, ...entries, sep].join("\n");
  data[8] = cachedScores; data[10] = cachedNumericScores;
  if (shouldSaveData(entity.id, data)) entity.setDynamicProperty("sft:scoreboardData", JSON.stringify(data));
}
export function getSortedObjectives() {
  const allowedObjectives = {
    money: "Money Leaderboard", bank: "Top Bank", coin: "Coin Leaderboard",
    kill: "Kill Leaderboard", death: "Death Leaderboard", clan_leaderboard: "Top Clan (Overall)",
    clan_level: "Clan Level Ranking", clan_member_count: "Clan Member Count", mining: "Top Mining",
  };
  const priority = ["extremesmp_money", "bank", "coin", "kill", "death", "clan_leaderboard", "clan_level", "clan_member_count", "mining"];
  const existingObjectives = world.scoreboard.getObjectives();
  const allObjectives = existingObjectives.map(obj => ({ id: obj.id, displayName: allowedObjectives[obj.id] ?? obj.displayName }));
  for (const id of priority) {
    if (!allObjectives.find(obj => obj.id === id)) allObjectives.push({ id, displayName: allowedObjectives[id] ?? id });
  }
  allObjectives.sort((a, b) => {
    const aIndex = priority.indexOf(a.id), bIndex = priority.indexOf(b.id);
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return a.displayName.localeCompare(b.displayName);
  });
  return allObjectives;
}
