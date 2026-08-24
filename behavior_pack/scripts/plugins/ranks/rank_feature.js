import { system, world } from '../../core.js';
import { rankDefault as rankSettings } from "./rank_default.js"
import { RankDatabase } from "./rank_database.js"
export class RankFeature {
  static init() {
    world.afterEvents.playerSpawn.subscribe(({ player }) => {
      RankDatabase.loadPlayerRank(player)
    })
    world.beforeEvents.chatSend.subscribe(({ sender: player, message }) => {
      const rank = RankDatabase.getPlayerRank(player)
      if (!rank || !rankSettings.ranks[rank]) return
      const command = rankSettings.ranks[rank].commands[message]
      if (!command) return
      if (command.cmd) {
        try {
          system.run(() => {
            player.dimension.runCommand(command.cmd.replace("@s", `"${player.name}"`))
          })
          player.sendMessage(rankSettings.ranks[rank].prefix + " " + command.msg)
        } catch (e) {
          player.sendMessage("§cError executing command: " + e.message)
          console.warn(`Command error for ${player.name}: ${e}`)
        }
      } else {
        player.sendMessage(command.msg)
      }
    })
  }
  static getRankInfo(rank) {
    return rankSettings.ranks[rank]
  }
  static getAllRanks() {
    return Object.keys(rankSettings.ranks)
  }
  static getRankPlayers(rank) {
    return RankDatabase.getAllPlayersWithRank(rank)
  }
}
