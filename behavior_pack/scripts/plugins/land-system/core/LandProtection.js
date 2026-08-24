import { system, world } from '../../../core.js';
import { LandDatabase } from "./LandDatabase.js"
import { LandParticles } from "./LandParticles.js"
import { LandConfig } from "../admin/LandConfig.js"
const CFG = { CLEANUP: 6e4, MAX_CACHE: 2e3, NOTIFY_CD: 500, PERM_TTL: 15e3, TTL: 6e4, BATCH: 10 }
let _protEnabled = true, _protTime = 0
const isProtectionEnabled = () => {
  const now = Date.now()
  if (now - _protTime > 15e3) { _protEnabled = LandConfig.getConfig().protectionEnabled !== false; _protTime = now }
  return _protEnabled
}
const CACHE = {
  sneakStates: new Map(), lastPos: new Map(), safePos: new Map(), landInfo: new Map(),
  lastNotify: new Map(), claim: new Map(), notify: new Map(), perm: new Map(),
  effects: new Map(), allClaims: new Map(), claimsTime: 0, priority: new Set(), idx: 0
}
const MSG = { PROT: a => `\u00A7c\u00A7l! \u00A7r\u00A77${a}`, FRAME: "\u00A7c\u00A7l! \u00A7r\u00A77You cannot interact with item frames", FLUID: "\u00A7c\u00A7l! \u00A7r\u00A77You cannot place fluids here" }
const toBlock = l => ({ x: Math.floor(l.x), y: Math.floor(l.y), z: Math.floor(l.z) })
const dimName = d => d.id.split(":")[1]
const isProtDim = (c, d) => c.settings?.protectedDimensions?.includes(d)
const cmd = (p, c) => { try { p?.id && p.runCommand(c) } catch { } }
function notify(p, type, msg, sound = "note.bass") {
  const now = Date.now(), key = `${p.id}_${type}`
  if (CACHE.lastNotify.get(key) && now - CACHE.lastNotify.get(key) < CFG.NOTIFY_CD) return
  CACHE.lastNotify.set(key, now)
  system.run(() => { try { p?.onScreenDisplay?.setActionBar(msg) } catch { try { p?.sendMessage(msg) } catch { } } })
  if (sound) system.run(() => cmd(p, `playsound ${sound} @s`))
}
function isMember(p, c) { return c?.members?.some(m => m.id === p.id || m.name === p.name) }
function memberPvp(p, c) { return c?.members?.find(m => m.id === p.id || m.name === p.name)?.permissions?.pvp === true }
export class LandProtection {
  static claimCache = CACHE.claim
  static notificationCache = CACHE.notify
  static permissionCache = CACHE.perm
  static init() {
    system.runInterval(() => {
      const now = Date.now(), players = world.getAllPlayers()
      if (!players.length) { CACHE.idx = 0; return }
      const max = Math.min(CFG.BATCH, players.length)
      const start = CACHE.idx % players.length, end = Math.min(start + max, players.length)
      for (let i = start; i < end; i++) {
        const p = players[i]
        if (!p?.location || !p?.id) continue
        const pos = toBlock(p.location), claim = this.getClaimFromCache(pos)
        if (claim) {
          CACHE.priority.add(p.id)
          this.processPlayer(p, pos, claim)
          this.handleEntry(p, claim)
          if (isProtectionEnabled() && claim.settings?.mobSpawning === false && isProtDim(claim, dimName(p.dimension))) {
            p.dimension.getEntities({ location: p.location, maxDistance: 32 }).forEach(e => {
              if (['minecraft:player', 'item', 'arrow'].some(t => e.typeId.includes(t))) return
              const ec = this.getClaimFromCache(toBlock(e.location))
              if (ec?.claimId === claim.claimId) e.remove()
            })
          }
        } else {
          CACHE.safePos.set(p.id, { location: p.location, dimension: p.dimension })
          CACHE.priority.delete(p.id)
          if (CACHE.effects.has(p.id)) { CACHE.effects.delete(p.id); cmd(p, `effect @s weakness 0`) }
        }
        CACHE.lastPos.set(p.id, pos)
        if (p.isSneaking) {
          if (claim) {
            const owner = LandDatabase.getPlayerName(claim.owner)
            const display = (owner && !owner.startsWith("-")) ? owner : "Unknown"
            try { p.onScreenDisplay.setActionBar(`\u00A7e${claim.name || "Unnamed"} \u00A77- \u00A7f${display}'s Land`) } catch { }
            const lastPt = CACHE.landInfo.get(p.id + "_pt") || 0
            if (now - lastPt > 1000) { LandParticles.showLandOutline(claim.pos1, claim.pos2); CACHE.landInfo.set(p.id + "_pt", now) }
          }
        }
      }
      CACHE.idx = (CACHE.idx + max) % players.length
      if (CACHE.claim.size > CFG.MAX_CACHE) {
        [...CACHE.claim.entries()].sort((a, b) => a[1].time - b[1].time).slice(0, Math.floor(CFG.MAX_CACHE / 2)).forEach(([k]) => CACHE.claim.delete(k))
      }
      for (const [k, t] of CACHE.notify) if (now - t > CFG.NOTIFY_CD) CACHE.notify.delete(k)
      for (const [k, t] of CACHE.lastNotify) if (now - t > CFG.NOTIFY_CD) CACHE.lastNotify.delete(k)
      for (const [k, t] of CACHE.landInfo) if (now - t > CFG.TTL) CACHE.landInfo.delete(k)
      for (const [k, d] of CACHE.perm) if (now - d.timestamp > CFG.PERM_TTL) CACHE.perm.delete(k)
      if (now - CACHE.claimsTime > CFG.TTL * 2) { CACHE.allClaims.clear(); CACHE.claimsTime = 0 }
    }, 40)
    system.run(() => this.getAllClaims())
    world.afterEvents.playerLeave.subscribe(({ playerId: id }) => {
      ['effects', 'lastPos', 'safePos', 'landInfo', 'priority'].forEach(k => CACHE[k].delete?.(id))
    })
    world.afterEvents.playerSpawn.subscribe(({ player }) => {
      if (player?.isValid) LandDatabase.updatePlayerName(player.id, player.name)
    })
    system.run(() => world.getAllPlayers().forEach(p => p?.isValid && LandDatabase.updatePlayerName(p.id, p.name)))
    world.beforeEvents.explosion.subscribe(e => {
      try {
        if (!isProtectionEnabled()) return
        const dim = dimName(e.dimension)
        if (e.source?.location) {
          const sc = this.getClaimFromCache(toBlock(e.source.location))
          if (sc && sc.settings?.explosions !== true && isProtDim(sc, dim)) { e.cancel = true; return }
        }
        const blocks = e.getImpactedBlocks()
        if (!blocks.length) return
        let [minX, minZ, maxX, maxZ] = [Infinity, Infinity, -Infinity, -Infinity]
        blocks.forEach(b => { minX = Math.min(minX, b.location.x); maxX = Math.max(maxX, b.location.x); minZ = Math.min(minZ, b.location.z); maxZ = Math.max(maxZ, b.location.z) })
        let claims = this.getAllClaims(); if (!claims.length) claims = this.getAllClaims(true)
        const relevant = claims.filter(c => c.pos1 && c.pos2 && Math.floor(minX) <= Math.max(c.pos1.x, c.pos2.x) && Math.floor(maxX) >= Math.min(c.pos1.x, c.pos2.x) && Math.floor(minZ) <= Math.max(c.pos1.z, c.pos2.z) && Math.floor(maxZ) >= Math.min(c.pos1.z, c.pos2.z))
        if (relevant.length) {
          const allowed = blocks.filter(b => {
            const x = Math.floor(b.location.x), z = Math.floor(b.location.z)
            return !relevant.some(c => x >= Math.min(c.pos1.x, c.pos2.x) && x <= Math.max(c.pos1.x, c.pos2.x) && z >= Math.min(c.pos1.z, c.pos2.z) && z <= Math.max(c.pos1.z, c.pos2.z) && c.settings?.explosions !== true && isProtDim(c, dim))
          })
          if (allowed.length !== blocks.length) e.setImpactedBlocks(allowed)
        }
      } catch { }
    })
    const handleAction = (e, type, msg, check = () => true) => {
      try {
        if (!isProtectionEnabled()) return
        const { player: p, block: b } = e, pos = toBlock(b.location), c = this.getClaimFromCache(pos)
        if (c && isProtDim(c, dimName(p.dimension)) && check(p, b, c) && !this.hasPermission(p, c, type)) {
          e.cancel = true; notify(p, "PROTECTION", MSG.PROT(msg), "note.bass")
        }
      } catch { }
    }
    world.beforeEvents.playerBreakBlock.subscribe(e => handleAction(e, "break", "You cannot break blocks", (p, b, c) => {
      if (b.typeId.includes("frame")) {
        const f = b.dimension.getEntities({ location: b.location, type: b.typeId.includes("glow") ? "minecraft:glow_frame" : "minecraft:frame" })[0]
        if (f?.getComponent("minecraft:item_container")?.container?.size > 0) { e.cancel = true; notify(p, "PROTECTION", MSG.FRAME, "note.bass"); return false }
      }
      return true
    }))
    world.beforeEvents.playerPlaceBlock.subscribe(e => {
      const { player: p, block: b } = e, inv = p?.getComponent("minecraft:inventory")
      const isFluid = inv?.container?.getItem(p.selectedSlotIndex ?? p.selectedSlot)?.typeId?.toLowerCase().includes("bucket")
      handleAction(e, isFluid ? "interact" : "place", isFluid ? "You cannot place fluids" : "You cannot place blocks", (p, b, c) => c.owner !== p.id)
    })
    world.beforeEvents.playerInteractWithEntity.subscribe(e => {
      if (!isProtectionEnabled()) return
      if (e.target?.typeId?.includes("sign")) {
        const c = this.getClaimFromCache(toBlock(e.target.location))
        if (c && c.owner !== e.player.id && !this.hasPermission(e.player, c, "interact")) { e.cancel = true; notify(e.player, "PROTECTION", MSG.PROT("You cannot edit signs"), "note.bass") }
      }
    })
    world.beforeEvents.playerInteractWithBlock.subscribe(e => {
      if (!isProtectionEnabled()) return
      const { player: p, block: b } = e, c = this.getClaimFromCache(toBlock(b.location))
      if (c && c.owner !== p.id && !p.getTags().includes("admin") && isProtDim(c, dimName(p.dimension)) && !this.hasPermission(p, c, "interact")) {
        e.cancel = true
        const key = `interact_${p.id}`, now = Date.now()
        if (!CACHE.notify.get(key) || now - CACHE.notify.get(key) > CFG.NOTIFY_CD) {
          CACHE.notify.set(key, now)
          notify(p, "PROTECTION", MSG.PROT("You cannot interact with blocks here"), "note.bass")
        }
      }
    })
    const onDamage = e => {
      try {
        if (!isProtectionEnabled()) return
        const t = e.hurtEntity || e.entity, s = e.damageSource
        if (!t || !s) return
        const c = this.getClaimFromCache(toBlock(t.location))
        if (!c || !isProtDim(c, dimName(t.dimension))) return
        if ((s.cause === "entity_explosion" || s.cause === "block_explosion") && c.settings?.explosions !== true) { e.cancel = true; return }
        if (t.typeId !== "minecraft:player" && s.damagingEntity?.typeId === "minecraft:player" && !this.hasPermission(s.damagingEntity, c, "interact")) {
          e.cancel = true; notify(s.damagingEntity, "PROTECTION", "You cannot hurt entities here", "note.bass")
        }
      } catch { }
    }
    const be = world.beforeEvents
    if (be.entityHurt) be.entityHurt.subscribe(onDamage)
    else if (be.entityDamage) be.entityDamage.subscribe(onDamage)
    world.beforeEvents.fluidPlaceEvent?.subscribe?.(e => {
      if (!isProtectionEnabled()) return
      const p = e.source, loc = toBlock(e.block?.location || p.location), c = this.getClaimFromCache(loc)
      if (c && c.owner !== p.id && !this.hasPermission(p, c, "interact")) { e.cancel = true; notify(p, "PROTECTION", MSG.FLUID, "note.bass") }
    })
  }
  static handleEntry(p, c) {
    if (!isProtectionEnabled()) return
    if (!isProtDim(c, dimName(p.dimension)) || c.allowEntry || c.owner === p.id || p.getTags().includes("admin")) return
    if (c.members?.find(m => m.id === p.id || m.name === p.name)?.permissions?.entry) return
    const safe = CACHE.safePos.get(p.id), deny = () => notify(p, "ENTRY_DENIED", MSG.PROT("You cannot enter this land"), "note.bass")
    try {
      if (safe && p.dimension.id === safe.dimension.id) { p.teleport(safe.location); deny() }
      else { const v = p.getViewDirection(), m = safe ? 1 : 2; p.teleport({ x: p.location.x - v.x * m, y: p.location.y, z: p.location.z - v.z * m }); deny() }
    } catch { }
  }
  static processPlayer(p, pos, c) {
    if (!isProtectionEnabled() || c.owner === p.id || !isProtDim(c, dimName(p.dimension))) { if (CACHE.effects.has(p.id)) { CACHE.effects.delete(p.id); cmd(p, `effect @s weakness 0`) }; return }
    const canPvp = p.getTags().includes("admin") || memberPvp(p, c)
    if (c.settings?.pvp === false && !canPvp) {
      const ed = CACHE.effects.get(p.id)
      if (!ed || Date.now() - (ed.appliedAt || 0) > 980000) {
        if (ed) CACHE.effects.delete(p.id)
        cmd(p, `effect @s weakness 999 255 true`); CACHE.effects.set(p.id, { claimId: c.claimId, appliedAt: Date.now() })
      }
    } else if (CACHE.effects.has(p.id)) { CACHE.effects.delete(p.id); cmd(p, `effect @s weakness 0`) }
  }
  static getDefaultPermissions() { return { break: false, place: false, interact: false, entry: false, pvp: false } }
  static async isPlayerInClaim(p) { return p?.location ? this.getClaimFromCache(toBlock(p.location)) : null }
  static clearClaimCache(id) { for (const [k, v] of this.claimCache) if (v.claim?.claimId === id) this.claimCache.delete(k) }
  static updateClaimInCache(id, data) { for (const [k, v] of this.claimCache) if (v.claim?.claimId === id) v.claim = { ...v.claim, ...data } }
  static hasPermission(p, c, action) {
    if (p.getTags().includes("admin") || c.owner === p.id || !isProtDim(c, dimName(p.dimension))) return true
    return c.members?.find(m => m.id === p.id || m.name === p.name)?.permissions?.[action] === true
  }
  static checkBlockInteraction(p, b, c) {
    if (!b || !p || !c || c.owner === p.id) return false
    if (b.typeId.toLowerCase().includes("sign") && !this.hasPermission(p, c, "interact")) { notify(p, "PROTECTION", MSG.PROT("You cannot edit signs"), "note.bass"); return true }
    return false
  }
  static getAllClaims(force = false) {
    const now = Date.now()
    if (!force && CACHE.allClaims.size && now - CACHE.claimsTime < CFG.TTL) return Array.from(CACHE.allClaims.values())
    try {
      let claims = []
      const get = id => { try { const d = world.getDynamicProperty(id); if (d) claims.push(...JSON.parse(d)) } catch { } }
      const pIds = world.getAllPlayers().map(p => { const id = p.id; get(LandDatabase.getPlayerClaimKey(id)); return id })
      try { const props = world.getDynamicPropertyIds(); if (props) for (const id of props) if (id.startsWith(LandDatabase.CLAIMS_PREFIX) && !pIds.includes(id.substring(LandDatabase.CLAIMS_PREFIX.length))) get(id) } catch { }
      CACHE.allClaims.clear()
      claims.forEach(c => c?.claimId && CACHE.allClaims.set(c.claimId, c))
      CACHE.claimsTime = now
      return claims
    } catch { return [] }
  }
  static getClaimFromCache(loc) {
    if (!loc || typeof loc.x !== "number") return null
    const key = `${Math.floor(loc.x)},${Math.floor(loc.z)}`, cached = CACHE.claim.get(key)
    if (cached && Date.now() - cached.time < CFG.TTL) return cached.claim
    try {
      let claims = this.getAllClaims(); if (!claims.length) { CACHE.claim.set(key, { claim: null, time: Date.now() }); return null }
      const x = Math.floor(loc.x), z = Math.floor(loc.z)
      const find = list => list.find(c => c?.pos1 && c?.pos2 && x >= Math.min(c.pos1.x, c.pos2.x) && x <= Math.max(c.pos1.x, c.pos2.x) && z >= Math.min(c.pos1.z, c.pos2.z) && z <= Math.max(c.pos1.z, c.pos2.z))
      let claim = find(claims); if (!claim) { claims = this.getAllClaims(true); claim = find(claims) }
      CACHE.claim.set(key, { claim: claim || null, time: Date.now() })
      return claim || null
    } catch { return null }
  }
  static revokeAccess(p, c, mId) {
    return this.modifyClaim(c.owner, c.claimId, cl => {
      cl.members = cl.members?.filter(m => m.id !== mId && m.name !== LandDatabase.getPlayerName(mId)) || []
      cl.accessHistory = [...(cl.accessHistory || []), { playerName: LandDatabase.getPlayerName(mId), action: "revoked", timestamp: Date.now() }]
      this.clearClaimCache(c.claimId)
    })
  }
  static setMemberPermissions(id, name, perms) {
    let owner = world.getAllPlayers().find(p => { try { return JSON.parse(world.getDynamicProperty(LandDatabase.getPlayerClaimKey(p.id)) || "[]").some(c => c.claimId === id) } catch { return false } })?.id
    if (!owner) try { owner = world.getDynamicPropertyIds().find(k => k.startsWith(LandDatabase.CLAIMS_PREFIX) && JSON.parse(world.getDynamicProperty(k) || "[]").some(c => c.claimId === id))?.substring(LandDatabase.CLAIMS_PREFIX.length) } catch { }
    return owner ? this.modifyClaim(owner, id, cl => { if (!cl.members) cl.members = []; const m = cl.members.find(m => m.name === name); m ? m.permissions = perms : cl.members.push({ name, permissions: perms }) }) : false
  }
  static modifyClaim(ownerId, claimId, modifier) {
    try {
      const key = LandDatabase.getPlayerClaimKey(ownerId), data = world.getDynamicProperty(key)
      if (!data) return false
      const claims = JSON.parse(data), idx = claims.findIndex(c => c.claimId === claimId)
      if (idx === -1) return false
      modifier(claims[idx])
      world.setDynamicProperty(key, JSON.stringify(claims))
      return true
    } catch { return false }
  }
  static sendProtectionMessage(p, m, o) { notify(p, "PROTECTION", `\u00A7c${m} (Owner: ${o})`, "note.bass") }
  static getBlockCategory(id) { return id.toLowerCase().includes("sign") ? "sign" : null }
  static getProtectionMessage() { return "You cannot interact with this block" }
  static sendSuccessMessage(p, m) { p.sendMessage(`\u00A7a\u00A7l\u2713 \u00A7r\u00A77${m}`); cmd(p, `playsound random.levelup @s`) }
  static sendErrorMessage(p, m) { p.sendMessage(`\u00A7c\u00A7l! \u00A7r\u00A77${m}`); cmd(p, `playsound note.bass @s`) }
}
export { isMember as isClaimMember, memberPvp as isMemberAllowPvp }
