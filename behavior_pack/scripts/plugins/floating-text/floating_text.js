import { system, world } from "../../core.js"
import { updateLeaderboard } from "./leaderboard.js"
import { setupPlayerBreakBlockEvent } from "./events/playerBreakBlock.js"
import { floatingTextMenu } from "./forms/floatingTextMenus.js"
import "./floating-item.js"
import { GlobalConfig } from "../../function/GlobalConfig.js"
const DIMS = ["overworld", "nether", "the_end"]
const getDim = n => world.getDimension(n)
let lbCounter = 0
system.runInterval(() => {
  const tz = parseInt((GlobalConfig.get("time:timezone") || "UTC+7").replace("UTC", "")) || 7
  for (const d of DIMS) {
    try {
      const entities = getDim(d).getEntities({ type: "add:floating_text", tags: ["sft:countdown"] })
      for (const e of entities) {
        try {
          const cd = JSON.parse(e.getDynamicProperty("sft:countdownData") ?? "null")
          if (!cd) continue
          if (cd.timezone !== tz) {
            cd.targetTime -= (tz - cd.timezone) * 36e5
            cd.timezone = tz
            e.setDynamicProperty("sft:countdownData", JSON.stringify(cd))
          }
          const left = cd.targetTime - Date.now()
          if (left <= 0) { e.nameTag = `${cd.titleColor}${cd.title}\n§r${cd.timeColor}Time's up!`; continue }
          const s = Math.floor(left / 1e3) % 60, m = Math.floor(left / 6e4) % 60, h = Math.floor(left / 36e5) % 24, dy = Math.floor(left / 864e5)
          const ts = cd.formatIndex === 1 ? `${dy}d ${h}h ${m}m` : cd.formatIndex === 2 ? `${h + dy * 24}h ${m}m ${s}s` : cd.formatIndex === 3 ? `${h + dy * 24}h ${m}m` : `${dy}d ${h}h ${m}m ${s}s`
          e.nameTag = `${cd.titleColor}${cd.title}\n§r${cd.timeColor}${ts}`
        } catch { }
      }
    } catch { }
  }
  if (++lbCounter >= 10) {
    lbCounter = 0
    const updates = new Map()
    for (const d of DIMS) {
      try {
        const entities = getDim(d).getEntities({ type: "add:floating_text", tags: ["sft:scoreboard"] })
        for (const e of entities) {
          const data = JSON.parse(e.getDynamicProperty("sft:scoreboardData") ?? "null")
          if (data) updates.set(e, data)
        }
      } catch { }
    }
    updates.forEach((data, e) => updateLeaderboard(e, data))
  }
}, 40)
export function createNPCText(dimension, position, text) {
  try {
    const e = dimension.spawnEntity("add:floating_text", position)
    e.nameTag = text || "NPC Text"
    e.setDynamicProperty("sft:fixedPosition", JSON.stringify(position))
    e.addTag("npc_text"); e.addTag("fixed_position"); e.addTag("permanent")
    system.runTimeout(() => { try { if (e?.isValid()) { e.teleport(position); e.setDynamicProperty("sft:fixedPosition", JSON.stringify(position)) } } catch { } }, 1)
    return e
  } catch { return null }
}
setupPlayerBreakBlockEvent()
export { floatingTextMenu }
