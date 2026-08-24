import { world, system, ActionFormData, ModalFormData } from "../../core.js"
import { showMainMenu } from "../../kiwora.js"
import { clearAllFloatingItemTexts } from "../floating-text/floating-item.js"
import { GlobalConfig } from "../../function/GlobalConfig.js"

const DEFAULT_CONFIG = {
  enabled: false,
  interval: 300,
  warningTimes: [60, 30, 15, 10, 5],
  prefix: "[CLEAR LAG]",
  messages: {
    start: "Clearing items in {time} seconds",
    countdown: "{time} seconds until items clear",
    success: "Removed {count} items from ground",
    noEntities: "No items found to clear",
  },
}
let currentConfig = null
let configLoadAttempts = 0
const MAX_CONFIG_ATTEMPTS = 3

function getConfig(forceReload = false) {
  if (currentConfig && !forceReload) return currentConfig
  try {
    const saved = GlobalConfig.get("clearlagConfig")
    if (saved) {
      const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved
      currentConfig = { ...DEFAULT_CONFIG, ...parsed }
    } else {
      currentConfig = DEFAULT_CONFIG
    }
    return currentConfig
  } catch (e) {
    console.warn("[ClearLag] Error loading config:", e)
    return currentConfig || DEFAULT_CONFIG
  }
}
function saveConfig(config) {
  try {
    GlobalConfig.set("clearlagConfig", config)
    currentConfig = config
    return true
  } catch {
    return false
  }
}
function countClearableEntities() {
  let count = 0
  try {
    for (const dimension of [world.getDimension("overworld"), world.getDimension("nether"), world.getDimension("the_end")]) {
      count += dimension.getEntities({ type: "minecraft:item" }).length
    }
  } catch { }
  return count
}
function clearEntities() {
  let cleared = 0
  try {
    clearAllFloatingItemTexts()
    for (const dimension of [world.getDimension("overworld"), world.getDimension("nether"), world.getDimension("the_end")]) {
      const items = dimension.getEntities({ type: "minecraft:item" })
      for (const item of items) {
        item.remove()
        cleared++
      }
    }
  } catch { }
  return cleared
}
export async function clearlag(source) {
  try {
    const config = getConfig()
    const entityCount = countClearableEntities()
    const form = new ActionFormData()
      .title("Clear Lag System")
      .body("Server Statistics:\n" + `• Items on Ground: ${entityCount}\n` + `• Auto Clear Status: ${config.enabled ? "Enabled" : "Disabled"}\n` + `• Interval: ${config.interval} seconds\n\n` + "Select an option:")
      .button("Clear Items Now\nRemove all items", "textures/ui/trash")
      .button("Auto Clear Settings\nConfigure timing & messages", "textures/ui/immersive_reader")
      .button("Message Settings\nCustomize messages", "textures/ui/ic_send_white_48dp")
      .button("Back", "textures/ui/arrow_left")
    const response = await form.show(source)
    if (!response.canceled) {
      switch (response.selection) {
        case 0:
          await clearEntitiesWithConfirmation(source)
          break
        case 1:
          await showAutoClearSettings(source)
          break
        case 2:
          await showMessageSettings(source)
          break
        case 3:
          showMainMenu(source)
          break
      }
    }
  } catch {
    source.sendMessage("[ERROR] Failed to open clear lag menu")
  }
}
async function clearEntitiesWithConfirmation(source) {
  try {
    const entityCount = countClearableEntities()
    const config = getConfig()
    const form = new ActionFormData()
      .title("Confirm Clear Items")
      .body(`There are ${entityCount} items on the ground.\n\n` + "Items to be cleared:\n" + "• All items dropped on ground\n\n" + "⚠ This action cannot be undone!")
      .button("Clear Now\nClick to proceed", "textures/ui/trash")
      .button("Cancel", "textures/ui/arrow_left")
    const response = await form.show(source)
    if (!response.canceled && response.selection === 0) {
      const cleared = clearEntities()
      source.runCommand("playsound random.levelup @s ~~~ 1 1")
      const msg = cleared > 0 ? config.messages.success.replace("{count}", cleared) : config.messages.noEntities
      world.sendMessage(msg)
    }
  } catch {
    source.sendMessage("⚠ An error occurred while clearing items!")
  }
}
async function showAutoClearSettings(source) {
  try {
    const config = getConfig()
    const form = new ModalFormData()
      .title("AUTO CLEAR SETTINGS")
      .toggle("Enable Auto Clear\nAutomatically clear items periodically", { defaultValue: config.enabled })
      .textField("Interval\nTime between clears in seconds (min: 5)", "300", { defaultValue: config.interval.toString() })
      .textField("Warning Times\nWhen to show warnings (comma separated)", "60,30,10,5", { defaultValue: config.warningTimes.join(",") })
    const response = await form.show(source)
    if (!response.canceled && response.formValues) {
      try {
        const [enabled, intervalStr, warningTimesStr] = response.formValues
        const interval = Math.max(5, parseInt(intervalStr) || 300)
        const warningTimes = warningTimesStr
          .split(",")
          .map(t => parseInt(t.trim()))
          .filter(t => !isNaN(t) && t > 0 && t < interval)
          .sort((a, b) => b - a)
        const newConfig = { ...config, enabled, interval, warningTimes }
        if (saveConfig(newConfig)) {
          source.sendMessage("[SETTINGS] Auto clear configuration updated")
          if (enabled) {
            startAutoClearSystem()
          } else {
            stopAutoClearSystem()
          }
        } else {
          source.sendMessage("[ERROR] Failed to save settings to world properties")
        }
      } catch (error) {
        source.sendMessage(`[ERROR] Invalid settings format: ${error.message || "Unknown error"}`)
      }
    }
  } catch (error) {
    source.sendMessage(`[ERROR] Failed to show settings form: ${error.message || "Unknown error"}`)
  }
}
async function showMessageSettings(source) {
  try {
    const config = getConfig()
    const form = new ModalFormData()
      .title("MESSAGE SETTINGS")
      .textField("Prefix Text\nText shown before messages", "[Clear Lag]", { defaultValue: config.prefix })
      .textField("Initial Message\nMessage shown when clear starts\nUse {time} for countdown", "Clearing items in {time} seconds", { defaultValue: config.messages.start })
      .textField("Countdown Message\nMessage shown during countdown\nUse {time} for countdown", "{time} seconds until items clear", { defaultValue: config.messages.countdown })
      .textField("Success Message\nMessage shown after clearing\nUse {count} for item count", "Removed {count} items from ground", { defaultValue: config.messages.success })
      .textField("No Items Message\nMessage when no items to clear", "No items found to clear", { defaultValue: config.messages.noEntities })
    const response = await form.show(source)
    if (!response.canceled) {
      const [prefix, start, countdown, success, noEntities] = response.formValues
      const newConfig = {
        ...config,
        prefix: prefix || DEFAULT_CONFIG.prefix,
        messages: {
          start: start || DEFAULT_CONFIG.messages.start,
          countdown: countdown || DEFAULT_CONFIG.messages.countdown,
          success: success || DEFAULT_CONFIG.messages.success,
          noEntities: noEntities || DEFAULT_CONFIG.messages.noEntities,
        },
      }
      if (saveConfig(newConfig)) {
        source.sendMessage("Messages updated successfully!")
        startAutoClearSystem()
      } else {
        source.sendMessage("Failed to save messages!")
      }
    }
  } catch {
    source.sendMessage("An error occurred in message settings!")
  }
}
let autoClearTask = null
let clearlagTimeRemaining = -1
export function getClearlagTimeRemaining() {
  const config = getConfig()
  if (!config.enabled) return -1
  return clearlagTimeRemaining
}
function startAutoClearSystem() {
  stopAutoClearSystem()
  clearlagTimeRemaining = getConfig().interval
  autoClearTask = system.runInterval(() => {
    try {
      const config = getConfig()
      if (!config.enabled) {
        clearlagTimeRemaining = -1
        stopAutoClearSystem()
        return
      }
      clearlagTimeRemaining--
      if (config.warningTimes.includes(clearlagTimeRemaining)) {
        const msg = clearlagTimeRemaining >= 30 ? config.messages.start : config.messages.countdown
        world.sendMessage(`${config.prefix} ${msg.replace("{time}", clearlagTimeRemaining)}`)
        if (clearlagTimeRemaining <= 10) {
          for (const player of world.getAllPlayers()) {
            player.runCommand("playsound note.pling @s ~~~ 1 0.5")
          }
        }
      }
      if (clearlagTimeRemaining <= 0) {
        for (const player of world.getAllPlayers()) {
          player.runCommand("playsound random.levelup @s ~~~ 1 1")
        }
        const cleared = clearEntities()
        const message = cleared > 0 ? `${config.prefix} ${config.messages.success.replace("{count}", cleared)}` : `${config.prefix} ${config.messages.noEntities}`
        world.sendMessage(message)
        clearlagTimeRemaining = config.interval
      }
    } catch { }
  }, 20)
}
function stopAutoClearSystem() {
  if (autoClearTask !== null) {
    system.clearRun(autoClearTask)
    autoClearTask = null
    clearlagTimeRemaining = -1
  }
}
function initializeClearLag() {
  configLoadAttempts++
  const config = getConfig(true)
  if (config.enabled) {
    startAutoClearSystem()
    console.warn("[ClearLag] Auto clear system started (enabled: true)")
  } else if (configLoadAttempts === 1) {
    console.warn("[ClearLag] Auto clear disabled in config")
  }
}

world.afterEvents.worldLoad.subscribe(() => {
  configLoadAttempts = 0
  currentConfig = null
  system.runTimeout(() => {
    initializeClearLag()
  }, 60)
})

system.runTimeout(() => {
  if (configLoadAttempts === 0) {
    initializeClearLag()
  }
}, 100)
