import { world } from "@minecraft/server";

const LAVA_RANKS = Object.freeze({
  PLAYER: { label: "PLAYER", score: 0 },
  MEMBER: { label: "MEMBER", score: 10 },
  VIP_999: { label: "VIP 999", score: 20 },
  PRO: { label: "PRO", score: 30 },
  PLATINUM: { label: "PLATINUM", score: 40 },
  RUBY: { label: "RUBY", score: 50 },
  ELITE: { label: "ELITE", score: 60 },
  ULTIMATE: { label: "ULTIMATE", score: 70 },
  SSS_MEMBER: { label: "SSS MEMBER", score: 80 },
  BETATESTER: { label: "BETATESTER", score: 85 },
  HELPER: { label: "HELPER", score: 90 },
  TRIAL: { label: "TRIAL", score: 92 },
  MOD: { label: "MOD", score: 94 },
  ADMIN: { label: "ADMIN", score: 96 },
  OWNER: { label: "OWNER", score: 100 },
});

function normalizeRank(value) {
  const key = String(value ?? "").trim().toUpperCase().replace(/[ -]+/g, "_");
  return LAVA_RANKS[key] ? key : "";
}

function getLavaRankLabel(player) {
  try {
    const selected = normalizeRank(player.getDynamicProperty("extremesmp:selectedRank"));
    if (selected) return LAVA_RANKS[selected].label;
    const legacy = normalizeRank(player.getDynamicProperty("extremesmp:rank"));
    if (legacy) return LAVA_RANKS[legacy].label;

    let score = 10;
    try {
      const objective = world.scoreboard.getObjective("extremesmp_rank");
      if (objective && player.scoreboardIdentity) {
        score = Number(objective.getScore(player.scoreboardIdentity)) || 0;
      }
    } catch { }
    const keys = Object.keys(LAVA_RANKS).sort((a, b) => LAVA_RANKS[b].score - LAVA_RANKS[a].score);
    return LAVA_RANKS[keys.find(key => score >= LAVA_RANKS[key].score) ?? "MEMBER"].label;
  } catch {
    return "MEMBER";
  }
}

export { getLavaRankLabel };
