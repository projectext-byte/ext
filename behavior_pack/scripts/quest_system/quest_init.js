import { world } from '../core.js';
import { MiningQuest } from "./quests/mining_quest.js";
import { CombatQuest } from "./quests/combat_quest.js";
import { FarmingQuest } from "./quests/farming_quest.js";
function initScoreboards() {
    try {
        world.scoreboard.addObjective("diamond", "Diamond Mined");
        world.scoreboard.addObjective("iron", "Iron Mined");
        world.scoreboard.addObjective("gold", "Gold Mined");
        world.scoreboard.addObjective("emerald", "Emerald Mined");
        world.scoreboard.addObjective("coal", "Coal Mined");
        world.scoreboard.addObjective("zombie", "Zombies Killed");
        world.scoreboard.addObjective("skeleton", "Skeletons Killed");
        world.scoreboard.addObjective("spider", "Spiders Killed");
        world.scoreboard.addObjective("creeper", "Creepers Killed");
        world.scoreboard.addObjective("wheat", "Wheat Harvested");
        world.scoreboard.addObjective("carrot", "Carrots Harvested");
        world.scoreboard.addObjective("potato", "Potatoes Harvested");
        world.scoreboard.addObjective("beetroot", "Beetroot Harvested");
    } catch (error) {
        console.warn("Error initializing scoreboards:", error);
    }
}
// Quest progress is persistent player state. Do not periodically remove quest
// tags or scoreboard values; that old cleanup loop erased active quests and
// called removeScore with a Player object instead of a ScoreboardIdentity.
export const QuestSystems = {
    Mining: MiningQuest,
    Combat: CombatQuest,
    Farming: FarmingQuest,
    initialize: initScoreboards
}; 