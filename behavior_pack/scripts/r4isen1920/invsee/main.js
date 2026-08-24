import { system as E, Player as b, EquipmentSlot as c, ItemStack as d, world as f, system, world, Player, ActionFormData, ModalFormData as q, ActionFormData as v } from '../../core.js';
import { getCustomItemConfig } from "../../admin_menu/customitem.js"
import "../../board/_load.js"
import "../../function/_load.js"
import { hasPermission, showMainMenu } from "../../kiwora.js"
import { showMemberMenu } from "../../member.js"
import "../../plugins/launchpad/launchpad.js"
import "../../extremesmp/main.js"
const INVSEE_USE_COOLDOWN_TICKS = 15
const USE_INVSEE_CUSTOM_UI = !0
const invseeUseCooldowns = new Map()
function getEntitySafe(e) {
  if (typeof e != "string" || !e) return
  try {
    return f.getEntity(e)
  } catch {
    return
  }
}
function canOpenInvseeFromItem(e) {
  let n = system.currentTick,
    t = invseeUseCooldowns.get(e.id) ?? 0
  if (n < t) return !1
  return invseeUseCooldowns.set(e.id, n + INVSEE_USE_COOLDOWN_TICKS), !0
}
function openInvseeFromItem(e) {
  if (!(e instanceof Player) || !canOpenInvseeFromItem(e)) return
  system.run(() => {
    try {
      e.hasTag("admin") ? m(e) : showNoPermissionMessage(e, "admin")
    } catch (n) {
      console.warn("[InvSee] Failed to open viewer:", n)
    }
  })
}
function l(e) {
  let n = e.getComponent("inventory").container,
    t = Array.from({ length: n.size }, (i, o) => n.getItem(o) || { typeId: "air" })
  return e instanceof b ? t.slice(9).concat(t.slice(0, 9)) : t
}
function p(e) {
  return JSON.stringify(e.map(n => ({ typeId: n?.typeId || "air", amount: n?.amount || 0 })))
}
function h(e) {
  let n = e.getComponent("equippable")
  return [n.getEquipment(c.Head), n.getEquipment(c.Chest), n.getEquipment(c.Legs), n.getEquipment(c.Feet), n.getEquipment(c.Offhand)]
}
function w(e) {
  return e
    .map(n => (n?.typeId && n.typeId !== "air" ? "a" : "b"))
    .join("")
    .replace(/[\[\],"]/g, "")
}
function A(e, n, t = []) {
  e.nameTag = USE_INVSEE_CUSTOM_UI ? `_r4ui:inventory:${w(t.slice(0, 5))}:${n}` : `InvSee | ${n}`
}
function I(e, n) {
  n.runCommand("ride @s stop_riding")
  let t = l(e),
    i = h(e),
    o = n.dimension.spawnEntity("r4isen1920_invsee:inventory", n.location),
    s = o.getComponent("inventory").container
  A(o, e.name, i)
  for (let r = 0; r < 36; r++)
    if (t[r].typeId !== "air") s.setItem(r, t[r])
    else continue
  for (let r = 45; r < 53; r++)
    if (i[r - 45]?.typeId !== "air") s.setItem(r, i[r - 45])
    else continue
  n.runCommand("ride @s start_riding @e[type=r4isen1920_invsee:inventory,c=1] teleport_ride"), o.addTag("invsee"), o.setDynamicProperty("r4isen1920_invsee:target", e.id), e.setDynamicProperty("r4isen1920_invsee:old_log", p(t.concat(i))), o.setDynamicProperty("r4isen1920_invsee:old_log", p(l(o)))
}
function y(e) {
  return f.getDimension(e).getEntities({ type: "r4isen1920_invsee:inventory", tags: ["invsee"] })
}
function C(e) {
  let n = getEntitySafe(e.getDynamicProperty("r4isen1920_invsee:target"))
  if (!(n instanceof b)) {
    try {
      e.remove()
    } catch { }
    return
  }
  A(e, n.name, h(n))
  let
    t = p(l(n).concat(h(n))),
    i = p(l(e))
  t !== n.getDynamicProperty("r4isen1920_invsee:old_log") ? D(e, n) : i !== e.getDynamicProperty("r4isen1920_invsee:old_log") && T(e, n), n.setDynamicProperty("r4isen1920_invsee:old_log", t), e.setDynamicProperty("r4isen1920_invsee:old_log", i), e.removeTag("updating")
}
function D(e, n) {
  if (e.hasTag("updating")) return
  e.addTag("updating")
  let t = l(n),
    i = h(n),
    o = e.getComponent("inventory").container
    ; (A(e, n.name, i), o.clearAll())
  for (let s = 0; s < 36; s++)
    if (t[s].typeId !== "air") o.setItem(s, t[s])
    else continue
  for (let s = 45; s < 53; s++)
    if (i[s - 45]?.typeId !== "air") o.setItem(s, i[s - 45])
    else continue
}
function T(e, n) {
  if (e.hasTag("updating")) return
  e.addTag("updating")
  let t = n.getComponent("inventory").container,
    i = n.getComponent("equippable"),
    o = l(e).slice(0, 36),
    s = [...o.slice(-9), ...o.slice(0, -9)],
    r = l(e).slice(45, 53),
    u = [[45, c.Head], [46, c.Chest], [47, c.Legs], [48, c.Feet], [49, c.Offhand]]
  A(e, n.name, r)
  t.clearAll(), i.setEquipment(c.Head, new d("minecraft:air")), i.setEquipment(c.Chest, new d("minecraft:air")), i.setEquipment(c.Legs, new d("minecraft:air")), i.setEquipment(c.Feet, new d("minecraft:air")), i.setEquipment(c.Offhand, new d("minecraft:air"))
  for (let a = 0; a < 36; a++)
    if (s[a].typeId !== "air") t.setItem(a, s[a])
    else continue
  for (let [a, g] of u)
    if (r[a - 45]?.typeId !== "air") i.setEquipment(g, r[a - 45])
    else continue
}
function m(e) {
  let n = new v().title({ translate: "gui.invsee.title" }).body({ translate: "gui.invsee.body" }).button({ translate: "gui.invsee.search" }, "textures/ui/icon_multiplayer"),
    t = f.getAllPlayers()
  for (let i of t) n.button(i.name)
  n.show(e).then(i => {
    if (!i.canceled) {
      if (i.selection === 0) {
        S(e)
        return
      }
      let o = t[i.selection - 1]
      if (!o) {
        m(e)
        return
      }
      if (o.name === e.name) {
        n = new v()
          .title({ translate: "gui.invsee.title" })
          .body({ translate: "gui.invsee.ownInventory" })
          .button({ translate: "gui.invsee.back" })
          .show(e)
          .then(o => {
            o.canceled || m(e)
          })
          .catch(() => { })
        return
      }
      I(o, e)
    }
  }).catch(() => { })
}
function S(e) {
  new q()
    .title({ translate: "gui.invsee.search" })
    .textField({ translate: "gui.invsee.textField" }, e.name)
    .show(e)
    .then(t => {
      if (t.canceled) {
        m(e)
        return
      }
      let i = f.getAllPlayers(),
        o = `${t.formValues?.[0] ?? ""}`.toLowerCase(),
        s = i.filter(u => u.name.toLowerCase().includes(o)),
        r = new v()
      s.length === 0 ?
        r
          .title({ translate: "gui.invsee.search" })
          .body({ translate: "gui.invsee.notFound", with: [o] })
          .button({ translate: "gui.invsee.searchAgain" }, "textures/ui/icon_multiplayer")
        : (r.title({ translate: "gui.invsee.search" }).body({
          translate: `gui.invsee.matchFound.${s.length > 1 ? "plural" : "singular"}`,
        }),
          s.forEach(u => {
            let a = u.name,
              g = a.toLowerCase().indexOf(o)
            if (g !== -1) {
              let _ = `\xA7r${a.substring(0, g)}\xA7l${a.substring(g, g + o.length)}\xA7r${a.substring(g + o.length)}\xA7r`
              r.button(_)
            }
          })),
        r.show(e).then(u => {
          if (u.canceled) {
            m(e)
            return
          }
          s[u.selection]?.name === e.name ?
            new v()
              .title({ translate: "gui.invsee.search" })
              .body({ translate: "gui.invsee.ownInventory" })
              .button({ translate: "gui.invsee.back" })
              .show(e)
              .then(a => {
                a.canceled || m(e)
              })
              .catch(() => { })
            : s[u.selection]?.name === void 0 ? m(e)
              : I(s[u.selection], e)
        }).catch(() => { })
    }).catch(() => { })
}
world.beforeEvents.itemUse.subscribe(e => {
  let { itemStack: n, source: t } = e
  if (n?.typeId !== "r4isen1920_invsee:inventory") return
  e.cancel = !0
  openInvseeFromItem(t)
})
E.runInterval(() => {
  y("overworld")
    .concat(y("nether"))
    .concat(y("the_end"))
    .forEach(n => {
      C(n)
    })
}, 2)
world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
  const config = getCustomItemConfig(),
    itemId = itemStack.typeId
  const playSound = () =>
    system.run(() => {
      try { source.runCommand("playsound random.enderchestopen @s ~ ~ ~ 1 1") } catch { }
    })
  if (config.useCustomItems) {
    if (itemId === config.adminItem && hasPermission(source, "admin")) playSound(), showMainMenu(source)
    else if (itemId === config.memberItem) playSound(), showMemberMenu(source)
    else if (itemId === config.adminItem && !hasPermission(source, "admin")) showNoPermissionMessage(source, "admin")
  } else {
    if (itemId === "kwd:item01" && hasPermission(source, "admin")) playSound(), showMainMenu(source)
    else if (itemId === "kwd:member01") playSound(), showMemberMenu(source)
    else if (itemId === "kwd:item01" && !hasPermission(source, "admin")) showNoPermissionMessage(source, "admin")
  }
})
const showNoPermissionMessage = (source, requiredTag) => {
  const messages = [`§8§l[§r§c§lACCESS DENIED§r§8§l]§r`, `§7You don't have permission to use this menu!`, ``, `§fRequired Tag:`]
  if (requiredTag === "admin") messages.push(`§8• §cAdmin §7- Full access`, ``, `§7Type §e/tag @s add admin §7to access the Admin menu.`)
  else messages.push(`§8• §eMember §7- Basic access`, ``, `§7Type §e/tag @s add member §7to access the Member menu.`)
  source.onScreenDisplay.setActionBar("§c✖ §7Insufficient permissions §c✖")
  source.sendMessage(messages.join("\n") + "\n")
}
