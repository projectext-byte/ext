import { ActionFormData, ModalFormData, world, system } from "../../../core.js"
import { sortirLeaderboardMenu } from "../sortir-[vip-only].js"
import { getSortedObjectives, MONEY_DISPLAY_OPTIONS, getMoneyDisplayMode, setMoneyDisplayMode } from "../leaderboard.js"
import { floatingItemsMenu } from "../floating-item.js"
const COLORS = {
  names: ["§4Dark Red§r", "§cRed§r", "§6Gold§r", "§eYellow§r", "§2Dark Green§r", "§aGreen§r", "§bAqua§r", "§3Dark Aqua§r", "§1Dark Blue§r", "§9Blue§r", "§dLight Purple§r", "§5Dark Purple§r", "§fWhite§r", "§7Gray§r", "§8Dark Gray§r", "§0Black§r"],
  codes: ["§4", "§c", "§6", "§e", "§2", "§a", "§b", "§3", "§1", "§9", "§d", "§5", "§f", "§7", "§8", "§0"],
}
const DIMS = ["overworld", "nether", "the_end"]
const fmtPos = (p, o = 0) => `${p.x.toFixed(2)} ${(p.y + o).toFixed(2)} ${p.z.toFixed(2)}`
const parsePos = (s, o = 0) => { const [x, y, z] = s.trim().split(" ", 3).map(Number); return { x, y: y + o, z } }
const getDim = n => world.getDimension(n)
export function toggleMoneyDisplayMode(viewer) {
  const cur = getMoneyDisplayMode()
  const newMode = cur === MONEY_DISPLAY_OPTIONS.FULL ? MONEY_DISPLAY_OPTIONS.TRUNCATED : cur === MONEY_DISPLAY_OPTIONS.TRUNCATED ? MONEY_DISPLAY_OPTIONS.STARS : MONEY_DISPLAY_OPTIONS.FULL
  setMoneyDisplayMode(newMode)
  const modeText = newMode === MONEY_DISPLAY_OPTIONS.FULL ? "§aFull (123456789)" : newMode === MONEY_DISPLAY_OPTIONS.STARS ? "§e****" : "§bTruncated (123.4M)"
  viewer.sendMessage(`§fMoney Display Mode: ${modeText}`)
  floatingTextMenu(viewer)
}
const clipboard = new Map()
export function floatingTextMenu(viewer, error) {
  const mode = getMoneyDisplayMode()
  const moneyDisplayText = mode === MONEY_DISPLAY_OPTIONS.FULL ? "§aFull" : mode === MONEY_DISPLAY_OPTIONS.STARS ? "§e****" : "§bTruncated"
  const form = new ActionFormData()
    .title("floating text menu")
    .body(error ?? "")
    .button("new root text (stackable)", "textures/ui/anvil-plus")
    .button("new floating leaderboard", "textures/ui/book_addpicture_default")
    .button("new countdown", "textures/ui/timer")
    .button("edit loaded texts", "textures/ui/icon_book_writable")
    .button("§dmanage root \u0026 children", "textures/ui/creative_icon")
    .button("auto set leaderboard", "textures/ui/icon_bookshelf")
    .button(`money display: ${moneyDisplayText}`, "textures/ui/debug_glyph_color")
    .button("floating items settings", "textures/items/gold_ingot")
  const hasClip = clipboard.has(viewer.name)
  if (hasClip) form.button(`§ePASTE: ${clipboard.get(viewer.name).type}`, "textures/ui/paste")
  form.show(viewer)
    .then(({ selection: s, canceled }) => {
      if (canceled) return
      const actions = [createRootText, newLeaderboard, createCountdownText, showTexts, showRootManagementMenu, sortirLeaderboardMenu, toggleMoneyDisplayMode, floatingItemsMenu]
      if (hasClip) actions.push(pasteText)
      actions[s]?.(viewer)
    }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:floating-text:forms:floatingTextMenus] promise error:", String(error?.stack ?? error)); } catch {} })
}
export function newLeaderboard(viewer) {
  const sorted = getSortedObjectives(), objs = sorted.map(o => o.id), names = sorted.map(o => o.displayName)
  new ModalFormData()
    .title("new floating leaderboard")
    .textField("leaderboard title", "custom title", { defaultValue: "Leaderboard" })
    .dropdown("scoreboard objective", names, { defaultValueIndex: 0 })
    .textField("position", "x y z", { defaultValue: fmtPos(viewer.location) })
    .dropdown("scores organization", ["ascending", "descending"], { defaultValueIndex: 1 })
    .toggle("enumerate players", { defaultValue: true })
    .dropdown("enumeration color", COLORS.names, { defaultValueIndex: 2 })
    .dropdown("player name color", COLORS.names, { defaultValueIndex: 12 })
    .dropdown("score color", COLORS.names, { defaultValueIndex: 1 })
    .slider("amount of listed players", 1, 15, { defaultValue: 8, valueStep: 1 })
    .show(viewer).then(r => {
      if (r.canceled) return floatingTextMenu(viewer)
      const v = r.formValues, pos = parsePos(v[2], -0.58), e = viewer.dimension.spawnEntity("add:floating_text", pos)
      e.addTag("sft:scoreboard")
      e.setDynamicProperty("sft:scoreboardData", JSON.stringify([v[0], objs[v[1]], v[3], v[4], COLORS.codes[v[5]], COLORS.codes[v[6]], COLORS.codes[v[7]], v[8], {}]))
      e.nameTag = "LOADING..."
      e.setDynamicProperty("sft:fixedPosition", JSON.stringify(pos))
      floatingTextMenu(viewer, "§aLeaderboard created!")
    }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:floating-text:forms:floatingTextMenus] promise error:", String(error?.stack ?? error)); } catch {} })
}
export function createCountdownText(viewer) {
  const tz = parseInt((world.getDynamicProperty("time:timezone") || "UTC+7").replace("UTC", "")) || 7
  const now = new Date(); now.setHours(now.getHours() + tz - now.getTimezoneOffset() / 60)
  const tom = new Date(now); tom.setDate(tom.getDate() + 1)
  const defDate = `${tom.getFullYear()}-${String(tom.getMonth() + 1).padStart(2, "0")}-${String(tom.getDate()).padStart(2, "0")}`
  const defTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
  new ModalFormData()
    .title("countdown text")
    .textField("title", "title", { defaultValue: "Event Countdown" })
    .textField("target date", "yyyy-mm-dd", { defaultValue: defDate })
    .textField("target time", "hh:mm", { defaultValue: defTime })
    .dropdown("format", ["days, hours, minutes, seconds", "days, hours, minutes", "hours, minutes, seconds", "hours, minutes"], { defaultValueIndex: 0 })
    .dropdown("title color", COLORS.names, { defaultValueIndex: 5 })
    .dropdown("time color", COLORS.names, { defaultValueIndex: 2 })
    .textField("text position", "x y z", { defaultValue: fmtPos(viewer.location) })
    .show(viewer).then(({ formValues: v, canceled }) => {
      if (canceled) return floatingTextMenu(viewer)
      const pos = parsePos(v[6], -0.58)
      try {
        const [yr, mo, dy] = (v[1] || defDate).split("-").map(Number), [hr, mn] = (v[2] || defTime).split(":").map(Number)
        const ts = new Date(Date.UTC(yr, mo - 1, dy, hr - tz, mn, 0)).getTime()
        if (isNaN(ts)) { floatingTextMenu(viewer, "§cInvalid date/time format."); return }
        const e = viewer.dimension.spawnEntity("add:floating_text", pos)
        e.nameTag = `${COLORS.codes[v[4]]}${v[0] || "Event Countdown"}\n§rLoading...`
        e.setDynamicProperty("sft:fixedPosition", JSON.stringify(pos))
        e.setDynamicProperty("sft:countdownData", JSON.stringify({ title: v[0] || "Event Countdown", targetTime: ts, formatIndex: v[3], titleColor: COLORS.codes[v[4]], timeColor: COLORS.codes[v[5]], created: Date.now(), timezone: tz }))
        e.addTag("sft:countdown"); e.addTag("fixed_position")
        floatingTextMenu(viewer, `§aCountdown created! Timezone: UTC${tz >= 0 ? "+" : ""}${tz}`)
      } catch (err) { floatingTextMenu(viewer, "§cError: " + err.message) }
    }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:floating-text:forms:floatingTextMenus] promise error:", String(error?.stack ?? error)); } catch {} })
}
function editText(viewer, entity) {
  const pos = entity.location
  new ModalFormData()
    .title(entity.nameTag.replace(/\n.+/g, ""))
    .textField("text to display", "text", { defaultValue: entity.nameTag.replace(/\n/g, "\\n") })
    .textField("text position", "x y z", { defaultValue: fmtPos(pos, 0.58) })
    .toggle("§bCOPY TEXT?§r", { defaultValue: false })
    .toggle("§cdelete?§r", { defaultValue: false })
    .show(viewer).then(r => {
      if (r.canceled) return showTexts(viewer)
      const v = r.formValues
      if (v[2]) { clipboard.set(viewer.name, { type: "text", content: entity.nameTag }); floatingTextMenu(viewer, "§aText Copied!"); return }
      if (v[3]) { entity.remove(); showTexts(viewer); return }
      const newPos = parsePos(v[1], -0.58)
      entity.nameTag = (v[0] || "Floating Text").replace(/\\n/g, "\n")
      entity.teleport(newPos)
      entity.setDynamicProperty("sft:fixedPosition", JSON.stringify(newPos))
      showTexts(viewer)
    }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:floating-text:forms:floatingTextMenus] promise error:", String(error?.stack ?? error)); } catch {} })
}
export function editLeaderboard(viewer, entity) {
  const sorted = getSortedObjectives(), objs = sorted.map(o => o.id), names = sorted.map(o => o.displayName)
  const data = JSON.parse(entity.getDynamicProperty("sft:scoreboardData")), objIdx = objs.indexOf(data[1])
  const moneyOpts = ["Full (123456789)", "Truncated (123.4M)", "Stars (****)"]
  const curMode = getMoneyDisplayMode()
  let moneyIdx = curMode === MONEY_DISPLAY_OPTIONS.FULL ? 0 : curMode === MONEY_DISPLAY_OPTIONS.STARS ? 2 : 1
  const form = new ModalFormData()
    .title(data[0])
    .textField("title", "title", { defaultValue: data[0] })
    .dropdown("objective", names, { defaultValueIndex: Math.max(0, objIdx) })
    .textField("position", "x y z", { defaultValue: fmtPos(entity.location, 0.58) })
    .dropdown("organization", ["ascending", "descending"], { defaultValueIndex: data[2] ? 1 : 0 })
    .toggle("enumerate", { defaultValue: data[3] })
    .dropdown("enum color", COLORS.names, { defaultValueIndex: Math.max(0, COLORS.codes.indexOf(data[4])) })
    .dropdown("name color", COLORS.names, { defaultValueIndex: Math.max(0, COLORS.codes.indexOf(data[5])) })
    .dropdown("score color", COLORS.names, { defaultValueIndex: Math.max(0, COLORS.codes.indexOf(data[6])) })
    .slider("players", 1, 15, { defaultValue: data[7] || 8, valueStep: 1 })
  if (data[1] === "money") form.dropdown("money format", moneyOpts, { defaultValueIndex: moneyIdx })
  form.toggle("§bCOPY?§r", { defaultValue: false })
  form.toggle("§cdelete?§r", { defaultValue: false })
  form.show(viewer).then(r => {
    if (r.canceled) return showTexts(viewer)
    const v = r.formValues, copyIdx = data[1] === "money" ? 10 : 9, delIdx = data[1] === "money" ? 11 : 10
    if (v[copyIdx]) { clipboard.set(viewer.name, { type: "leaderboard", data: JSON.parse(entity.getDynamicProperty("sft:scoreboardData")) }); floatingTextMenu(viewer, "§aLeaderboard Copied!"); return }
    if (v[delIdx]) { entity.remove(); showTexts(viewer); return }
    if (objs[v[1]] === "money") {
      const mfi = data[1] === "money" ? v[9] : moneyIdx
      setMoneyDisplayMode(mfi === 0 ? MONEY_DISPLAY_OPTIONS.FULL : mfi === 2 ? MONEY_DISPLAY_OPTIONS.STARS : MONEY_DISPLAY_OPTIONS.TRUNCATED)
    }
    const newPos = parsePos(v[2], -0.58)
    entity.nameTag = "LOADING..."
    entity.setDynamicProperty("sft:scoreboardData", JSON.stringify([v[0], objs[v[1]], v[3], v[4], COLORS.codes[v[5]], COLORS.codes[v[6]], COLORS.codes[v[7]], v[8], data[8]]))
    entity.teleport(newPos); entity.setDynamicProperty("sft:fixedPosition", JSON.stringify(newPos))
    showTexts(viewer)
  }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:floating-text:forms:floatingTextMenus] promise error:", String(error?.stack ?? error)); } catch {} })
}
export function editCountdown(viewer, entity) {
  const tz = parseInt((world.getDynamicProperty("time:timezone") || "UTC+7").replace("UTC", "")) || 7
  const cd = JSON.parse(entity.getDynamicProperty("sft:countdownData"))
  if (!cd) { showTexts(viewer); return }
  const td = new Date(cd.targetTime); td.setHours(td.getHours() + tz)
  const ds = `${td.getFullYear()}-${String(td.getMonth() + 1).padStart(2, "0")}-${String(td.getDate()).padStart(2, "0")}`
  const ts = `${String(td.getHours()).padStart(2, "0")}:${String(td.getMinutes()).padStart(2, "0")}`
  new ModalFormData()
    .title("edit countdown")
    .textField("title", "title", { defaultValue: cd.title })
    .textField("target date", "yyyy-mm-dd", { defaultValue: ds })
    .textField("target time", "hh:mm", { defaultValue: ts })
    .dropdown("format", ["days, hours, minutes, seconds", "days, hours, minutes", "hours, minutes, seconds", "hours, minutes"], { defaultValueIndex: cd.formatIndex })
    .dropdown("title color", COLORS.names, { defaultValueIndex: Math.max(0, COLORS.codes.indexOf(cd.titleColor)) })
    .dropdown("time color", COLORS.names, { defaultValueIndex: Math.max(0, COLORS.codes.indexOf(cd.timeColor)) })
    .textField("position", "x y z", { defaultValue: fmtPos(entity.location, 0.58) })
    .toggle("§bCOPY?§r", { defaultValue: false })
    .toggle("§cdelete?§r", { defaultValue: false })
    .show(viewer).then(({ formValues: v, canceled }) => {
      if (canceled) return showTexts(viewer)
      if (v[7]) { clipboard.set(viewer.name, { type: "countdown", data: JSON.parse(entity.getDynamicProperty("sft:countdownData")) }); floatingTextMenu(viewer, "§aCountdown Copied!"); return }
      if (v[8]) { entity.remove(); showTexts(viewer); return }
      const pos = parsePos(v[6], -0.58)
      try {
        const [yr, mo, dy] = v[1].split("-").map(Number), [hr, mn] = v[2].split(":").map(Number)
        const ts = new Date(Date.UTC(yr, mo - 1, dy, hr - tz, mn, 0)).getTime()
        if (isNaN(ts)) { showTexts(viewer); return }
        entity.setDynamicProperty("sft:countdownData", JSON.stringify({ title: v[0] || "Event Countdown", targetTime: ts, formatIndex: v[3], titleColor: COLORS.codes[v[4]], timeColor: COLORS.codes[v[5]], created: cd.created, timezone: tz }))
        entity.teleport(pos); entity.setDynamicProperty("sft:fixedPosition", JSON.stringify(pos))
        showTexts(viewer)
      } catch (err) { showTexts(viewer) }
    }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:floating-text:forms:floatingTextMenus] promise error:", String(error?.stack ?? error)); } catch {} })
}
export function showTexts(viewer) {
  const entities = DIMS.flatMap(d => getDim(d).getEntities({ type: "add:floating_text" }))
  if (!entities.length) { floatingTextMenu(viewer, "§cNo loaded Floating Texts found."); return }
  const ui = new ActionFormData().title("edit nearby texts").body("Only loaded chunks shown.")
  entities.forEach(e => {
    const isSb = e.hasTag("sft:scoreboard"), isCd = e.hasTag("sft:countdown")
    ui.button(`${e.nameTag.replace(/\n.+/g, "")}§r\n§8[${isSb ? "Leaderboard" : isCd ? "Countdown" : "Text"}]`)
  })
  ui.show(viewer).then(r => {
    if (r.canceled) return floatingTextMenu(viewer)
    const e = entities[r.selection]
    e.hasTag("sft:scoreboard") ? editLeaderboard(viewer, e) : e.hasTag("sft:countdown") ? editCountdown(viewer, e) : editTextWrapper(viewer, e)
  }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:floating-text:forms:floatingTextMenus] promise error:", String(error?.stack ?? error)); } catch {} })
}
export function showRootManagementMenu(viewer) {
  const loc = viewer.location
  const roots = viewer.dimension.getEntities({ type: "add:floating_text", location: loc, maxDistance: 100 }).filter(e => e.getTags().some(t => t.startsWith("root:")))
  const form = new ActionFormData().title("§dManage Root & Children")
  if (!roots.length) {
    form.body("§cNo Root Entities found nearby.\n\n§7Create one from main menu!")
    form.button("§7Back")
    form.show(viewer).then(() => floatingTextMenu(viewer)).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:floating-text:forms:floatingTextMenus] promise error:", String(error?.stack ?? error)); } catch {} }); return
  }
  roots.sort((a, b) => Math.hypot(a.location.x - loc.x, a.location.y - loc.y, a.location.z - loc.z) - Math.hypot(b.location.x - loc.x, b.location.y - loc.y, b.location.z - loc.z))
  form.body("§fSelect a Root Entity:")
  for (const r of roots) {
    const uid = r.getTags().find(t => t.startsWith("root:"))?.replace("root:", "") || "?"
    const cc = viewer.dimension.getEntities({ type: "add:floating_text", tags: [`parent:${uid}`] }).length
    const dist = Math.hypot(r.location.x - loc.x, r.location.y - loc.y, r.location.z - loc.z).toFixed(1)
    form.button(`§e${(r.nameTag?.replace(/\n/g, " / ") || "No Name").substring(0, 35)}§r\n§7Children: §b${cc} §7| §a${dist}m`)
  }
  form.show(viewer).then(r => { if (r.canceled) floatingTextMenu(viewer); else editRootText(viewer, roots[r.selection]) }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:floating-text:forms:floatingTextMenus] promise error:", String(error?.stack ?? error)); } catch {} })
}
function getGroup(root) {
  const rt = root.getTags().find(t => t.startsWith("root:"))
  if (!rt) {
    const pt = root.getTags().find(t => t.startsWith("parent:"))
    if (!pt) return [root]
    const pRoot = root.dimension.getEntities({ type: "add:floating_text", tags: [`root:${pt.replace("parent:", "")}`] })[0]
    return pRoot ? getGroup(pRoot) : [root]
  }
  const uid = rt.replace("root:", "")
  return [root, ...root.dimension.getEntities({ type: "add:floating_text", tags: [`parent:${uid}`] })].sort((a, b) => a.location.y - b.location.y)
}
function updateRootNameTag(root) {
  try {
    const rt = root.getTags().find(t => t.startsWith("root:")); if (!rt) return
    const uid = rt.replace("root:", "")
    root.nameTag = root.getDynamicProperty("sft:rootContent") || root.nameTag || "Root Text"
    for (const c of root.dimension.getEntities({ type: "add:floating_text", tags: [`parent:${uid}`] })) c.nameTag = c.getDynamicProperty("sft:childContent") || "Child Text"
  } catch (e) { console.error("[FT] updateRootNameTag:", e) }
}
export function createRootText(viewer) {
  new ModalFormData()
    .title("§aCreate Root Text (Unlimited)")
    .textField("Part 1 (Paste here):", "Content...", { defaultValue: "Root Text" })
    .textField("Part 2 (Optional):", "Content...", { defaultValue: "" })
    .textField("Part 3 (Optional):", "Content...", { defaultValue: "" })
    .textField("Part 4 (Optional):", "Content...", { defaultValue: "" })
    .textField("Part 5 (Optional):", "Content...", { defaultValue: "" })
    .textField("Position (X Y Z):", "x y z", { defaultValue: fmtPos(viewer.location) })
    .show(viewer).then(({ formValues: v, canceled }) => {
      if (canceled) return floatingTextMenu(viewer)
      const txt = v.slice(0, 5).join("").replace(/\\n/g, "\n")
      const pos = parsePos(v[5], -0.58)
      const e = viewer.dimension.spawnEntity("add:floating_text", pos)
      e.setDynamicProperty("sft:fixedPosition", JSON.stringify(pos))
      e.addTag("sft:text"); e.addTag("fixed_position")
      const uid = Date.now().toString(36) + Math.random().toString(36).substring(2, 5)
      e.addTag(`root:${uid}`)
      applyUnlimitedText(viewer, e, txt)
      floatingTextMenu(viewer, `§aRoot created! ID: §e${uid}`)
    }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:floating-text:forms:floatingTextMenus] promise error:", String(error?.stack ?? error)); } catch {} })
}
function editRootText(viewer, root) {
  const uid = root.getTags().find(t => t.startsWith("root:"))?.replace("root:", "")
  new ActionFormData()
    .title(`§eEdit Root [${uid?.substring(0, 6)}]`)
    .body(`§fEditing:\n§e${root.nameTag?.replace(/\n/g, " / ") || "No Name"}\n\n§fSelect action:`)
    .button("Change Root Content").button("§bManage Children").button("§dAdd Child Below")
    .button("Change Group Coords").button("Teleport Group to You").button("Teleport You to Root").button("§bCOPY GROUP").button("§aEDIT FULL CONTENT").button("§cDelete Entire Group")
    .show(viewer).then(r => {
      if (r.canceled) return showRootManagementMenu(viewer)
      switch (r.selection) {
        case 0: promptRenameRoot(viewer, root); break
        case 1: showChildMenu(viewer, root); break
        case 2: addChild(viewer, root); break
        case 3: changeGroupCoords(viewer, root); break
        case 4: moveGroupToPlayer(viewer, root); editRootText(viewer, root); break
        case 5: viewer.teleport(root.location); viewer.sendMessage("§aTeleported!"); editRootText(viewer, root); break
        case 6: 
          const copyData = {
            type: "root",
            rootContent: root.getDynamicProperty("sft:rootContent") || root.nameTag,
            children: getGroup(root).filter(e => e !== root).map(c => ({
               content: c.getDynamicProperty("sft:childContent"),
               dy: c.location.y - root.location.y
            }))
          }
          clipboard.set(viewer.name, copyData)
          floatingTextMenu(viewer, "§aGroup Copied to Clipboard!")
          break
        case 7: promptEditFullContent(viewer, root); break
        case 8: const g = getGroup(root); g.forEach(e => { try { e.remove() } catch { } }); showRootManagementMenu(viewer); break
      }
    }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:floating-text:forms:floatingTextMenus] promise error:", String(error?.stack ?? error)); } catch {} })
}
function promptEditFullContent(viewer, root) {
  const g = getGroup(root).reverse()
  const fullText = g.map(e => e === root ? (e.getDynamicProperty("sft:rootContent") || e.nameTag) : (e.getDynamicProperty("sft:childContent") || e.nameTag)).join("\n").replace(/\n/g, "\\n")
  const CHUNK_SIZE = 3000
  const chunks = []
  for (let i = 0; i < fullText.length; i += CHUNK_SIZE) {
    chunks.push(fullText.substring(i, i + CHUNK_SIZE))
  }
  if (!chunks.length) chunks.push("")
  const form = new ModalFormData().title("§eEdit Full Content (Segmented)")
  chunks.forEach((c, i) => form.textField(`Segment ${i + 1}`, "Content...", { defaultValue: c }))
  const extra = 5 - chunks.length
  for (let i = 0; i < Math.max(1, extra); i++) {
    form.textField(`New Segment ${chunks.length + i + 1}`, "Append content here...", { defaultValue: "" })
  }
  form.show(viewer).then(r => {
    if (r.canceled) return editRootText(viewer, root)
    const txt = r.formValues.join("").replace(/\\n/g, "\n")
    applyUnlimitedText(viewer, root, txt)
    editRootText(viewer, root)
  }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:floating-text:forms:floatingTextMenus] promise error:", String(error?.stack ?? error)); } catch {} })
}
function promptRenameRoot(viewer, root) {
  const cur = root.getDynamicProperty("sft:rootContent") || root.nameTag || ""
  new ModalFormData().title("§eChange Root Content").textField("Content (\\n for new line)", "Root Text", { defaultValue: cur.replace(/\n/g, "\\n") })
    .show(viewer).then(r => {
      if (r.canceled) return editRootText(viewer, root)
      root.setDynamicProperty("sft:rootContent", (r.formValues[0].trim() || "Root Text").replace(/\\n/g, "\n"))
      updateRootNameTag(root); editRootText(viewer, root)
    }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:floating-text:forms:floatingTextMenus] promise error:", String(error?.stack ?? error)); } catch {} })
}
function showChildMenu(viewer, root) {
  const children = getGroup(root).filter(e => !e.getTags().some(t => t.startsWith("root:")))
  const form = new ActionFormData().title("§eManage Children")
  if (!children.length) {
    form.body("§cNo children.").button("Back")
    form.show(viewer).then(() => editRootText(viewer, root)).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:floating-text:forms:floatingTextMenus] promise error:", String(error?.stack ?? error)); } catch {} }); return
  }
  form.body("§fSelect a child:")
  children.forEach((e, i) => form.button(`Child ${i + 1}: ${(e.getDynamicProperty("sft:childContent") || "No Name").replace(/\n/g, " / ").substring(0, 40)}...`))
  form.show(viewer).then(r => { if (r.canceled) editRootText(viewer, root); else manageChild(viewer, root, children[r.selection]) }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:floating-text:forms:floatingTextMenus] promise error:", String(error?.stack ?? error)); } catch {} })
}
function manageChild(viewer, root, child) {
  const content = child.getDynamicProperty("sft:childContent") || "No Name"
  new ActionFormData()
    .title(`§eManage Child`)
    .body(`§fSelected:\n§e${content.replace(/\n/g, " / ").substring(0, 50)}...\n\n§fAction:`)
    .button("Change Content").button("Move (Y Offset)").button("§cDelete")
    .show(viewer).then(r => {
      if (r.canceled) return showChildMenu(viewer, root)
      switch (r.selection) {
        case 0: promptRenameChild(viewer, root, child); break
        case 1: moveChild(viewer, root, child); break
        case 2: try { child.remove(); updateRootNameTag(root) } catch { } showChildMenu(viewer, root); break
      }
    }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:floating-text:forms:floatingTextMenus] promise error:", String(error?.stack ?? error)); } catch {} })
}
function promptRenameChild(viewer, root, child) {
  const cur = child.getDynamicProperty("sft:childContent") || ""
  new ModalFormData().title("§eChange Child Content").textField("Content (\\n for new line)", "Child Text", { defaultValue: cur.replace(/\n/g, "\\n") })
    .show(viewer).then(r => {
      if (r.canceled) return manageChild(viewer, root, child)
      child.setDynamicProperty("sft:childContent", (r.formValues[0].trim() || "Child Text").replace(/\\n/g, "\n"))
      updateRootNameTag(root); manageChild(viewer, root, child)
    }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:floating-text:forms:floatingTextMenus] promise error:", String(error?.stack ?? error)); } catch {} })
}
function moveChild(viewer, root, child, err = "", last = "") {
  const curY = (child.location.y - root.location.y).toFixed(2)
  new ModalFormData().title("§eMove Child").textField(err ? `§c${err}` : "Relative Y Offset:", `Current: ${curY}`, { defaultValue: last || curY })
    .show(viewer).then(r => {
      if (r.canceled) return manageChild(viewer, root, child)
      const v = r.formValues[0].trim()
      if (/[a-zA-Z]/.test(v) || v === "") return moveChild(viewer, root, child, "Must be a number!", v)
      const n = Number(v); if (isNaN(n)) return moveChild(viewer, root, child, "Invalid number!", v)
      child.teleport({ x: child.location.x, y: root.location.y + n, z: child.location.z }, { dimension: viewer.dimension })
      manageChild(viewer, root, child)
    }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:floating-text:forms:floatingTextMenus] promise error:", String(error?.stack ?? error)); } catch {} })
}
function addChild(viewer, root) {
  const rt = root.getTags().find(t => t.startsWith("root:"))
  if (!rt) { editRootText(viewer, root); return }
  new ModalFormData().title("§aAdd Child").textField("Content (\\n for new line):", "Child Text", { defaultValue: "Child Text" })
    .show(viewer).then(({ formValues: v, canceled }) => {
      if (canceled) return editRootText(viewer, root)
      spawnChild(viewer, root, (v[0] || "Child Text").replace(/\\n/g, "\n"))
    }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:floating-text:forms:floatingTextMenus] promise error:", String(error?.stack ?? error)); } catch {} })
}
function spawnChild(viewer, root, txt) {
  try {
    const uid = root.getTags().find(t => t.startsWith("root:")).replace("root:", ""), dim = root.dimension
    const children = getGroup(root).filter(e => e !== root).length
    const pos = { x: root.location.x, y: root.location.y - (children + 1) * 0.27, z: root.location.z }
    const e = dim.spawnEntity("add:floating_text", pos)
    e.addTag(`parent:${uid}`); e.addTag("sft:text"); e.addTag("fixed_position")
    e.setDynamicProperty("sft:childContent", txt); e.setDynamicProperty("sft:fixedPosition", JSON.stringify(pos)); e.nameTag = " "
    updateRootNameTag(root)
    editRootText(viewer, root)
  } catch (err) { editRootText(viewer, root) }
}
function changeGroupCoords(viewer, root, err = "", last = []) {
  const loc = root.location
  const [dx, dy, dz] = [last[0] ?? loc.x.toFixed(2), last[1] ?? loc.y.toFixed(2), last[2] ?? loc.z.toFixed(2)]
  new ModalFormData().title("§eChange Group Coords")
    .textField(err ? `§c${err}` : "X", "Ex: 10", { defaultValue: dx })
    .textField("Y", "Ex: 64", { defaultValue: dy })
    .textField("Z", "Ex: -5", { defaultValue: dz })
    .show(viewer).then(r => {
      if (r.canceled) return editRootText(viewer, root)
      const [x, y, z] = r.formValues.map(v => v.trim())
      if ([x, y, z].some(v => /[a-zA-Z]/.test(v) || v === "")) return changeGroupCoords(viewer, root, "Invalid format!", [x, y, z])
      const [nx, ny, nz] = [Number(x), Number(y), Number(z)]
      if ([nx, ny, nz].some(isNaN)) return changeGroupCoords(viewer, root, "Must be numbers!", [x, y, z])
      const g = getGroup(root); if (!g.length) return
      const [dX, dY, dZ] = [nx - root.location.x, ny - root.location.y, nz - root.location.z]
      for (const e of g) {
        const np = { x: e.location.x + dX, y: e.location.y + dY, z: e.location.z + dZ }
        e.teleport(np, { dimension: viewer.dimension }); e.setDynamicProperty("sft:fixedPosition", JSON.stringify(np))
      }
      editRootText(viewer, root)
    }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:floating-text:forms:floatingTextMenus] promise error:", String(error?.stack ?? error)); } catch {} })
}
function moveGroupToPlayer(viewer, root) {
  const g = getGroup(root); if (!g.length) return
  const tgt = viewer.location, old = root.location, [dx, dy, dz] = [tgt.x - old.x, tgt.y - old.y, tgt.z - old.z]
  for (const e of g) {
    const np = { x: e.location.x + dx, y: e.location.y + dy, z: e.location.z + dz }
    e.teleport(np, { dimension: viewer.dimension }); e.setDynamicProperty("sft:fixedPosition", JSON.stringify(np))
  }
}
function editTextWrapper(viewer, entity) {
  entity.getTags().find(t => t.startsWith("root:")) ? editRootText(viewer, entity) : editText(viewer, entity)
}
export { editTextWrapper as editText }
function applyUnlimitedText(viewer, root, fullText) {
  const lines = fullText.split("\n")
  const rootText = lines.shift() 
  const uid = root.getTags().find(t => t.startsWith("root:")).replace("root:", "")
  root.nameTag = rootText
  root.setDynamicProperty("sft:rootContent", rootText)
  const children = getGroup(root).filter(e => e !== root).reverse()
  for (let i = 0; i < Math.max(lines.length, children.length); i++) {
    const line = lines[i]
    const child = children[i]
    if (line !== undefined && child !== undefined) {
      child.nameTag = line
      child.setDynamicProperty("sft:childContent", line)
      const offset = (i + 1) * 0.27
      const targetPos = { x: root.location.x, y: root.location.y - offset, z: root.location.z }
      if (Math.abs(child.location.y - targetPos.y) > 0.01) {
        child.teleport(targetPos)
        child.setDynamicProperty("sft:fixedPosition", JSON.stringify(targetPos))
      }
    } else if (line !== undefined && !child) {
      const offset = (i + 1) * 0.27
      const pos = { x: root.location.x, y: root.location.y - offset, z: root.location.z }
      try {
        const e = root.dimension.spawnEntity("add:floating_text", pos)
        e.addTag(`parent:${uid}`); e.addTag("sft:text"); e.addTag("fixed_position")
        e.setDynamicProperty("sft:childContent", line)
        e.setDynamicProperty("sft:fixedPosition", JSON.stringify(pos))
        e.nameTag = line
      } catch {}
    } else if (line === undefined && child) {
      try { child.remove() } catch {}
    }
  }
}
function pasteText(viewer) {
  const data = clipboard.get(viewer.name)
  if (!data) return floatingTextMenu(viewer, "§cClipboard empty!")
  const pos = viewer.location
  const p = { x: pos.x, y: pos.y, z: pos.z } 
  try {
    if (data.type === "root") {
      const e = viewer.dimension.spawnEntity("add:floating_text", p)
      e.setDynamicProperty("sft:fixedPosition", JSON.stringify(p))
      e.setDynamicProperty("sft:rootContent", data.rootContent)
      e.addTag("sft:text"); e.addTag("fixed_position")
      const uid = Date.now().toString(36) + Math.random().toString(36).substring(2, 5)
      e.addTag(`root:${uid}`)
      e.nameTag = data.rootContent
      data.children.forEach(c => {
        const cp = { x: p.x, y: p.y + c.dy, z: p.z }
        const child = viewer.dimension.spawnEntity("add:floating_text", cp)
        child.addTag(`parent:${uid}`); child.addTag("sft:text"); child.addTag("fixed_position")
        child.setDynamicProperty("sft:childContent", c.content)
        child.setDynamicProperty("sft:fixedPosition", JSON.stringify(cp))
        child.nameTag = c.content
      })
      floatingTextMenu(viewer, `§aGroup Pasted! ID: §e${uid}`)
    } else if (data.type === "text") {
      const e = viewer.dimension.spawnEntity("add:floating_text", p)
      e.nameTag = data.content
      e.setDynamicProperty("sft:fixedPosition", JSON.stringify(p))
      e.addTag("npc_text"); e.addTag("fixed_position"); e.addTag("permanent")
      floatingTextMenu(viewer, "§aText Pasted!")
    } else if (data.type === "leaderboard") {
      const e = viewer.dimension.spawnEntity("add:floating_text", p)
      e.addTag("sft:scoreboard")
      e.setDynamicProperty("sft:scoreboardData", JSON.stringify(data.data))
      e.nameTag = "LOADING..."
      e.setDynamicProperty("sft:fixedPosition", JSON.stringify(p))
      floatingTextMenu(viewer, "§aLeaderboard Pasted!")
    } else if (data.type === "countdown") {
      const e = viewer.dimension.spawnEntity("add:floating_text", p)
      e.setDynamicProperty("sft:countdownData", JSON.stringify(data.data))
      e.addTag("sft:countdown"); e.addTag("fixed_position")
      e.setDynamicProperty("sft:fixedPosition", JSON.stringify(p))
      e.nameTag = "Loading..."
      floatingTextMenu(viewer, "§aCountdown Pasted!")
    }
  } catch(e) {
    floatingTextMenu(viewer, `§cPaste Error: ${e.message}`)
  }
}
