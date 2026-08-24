import { ActionFormData, ModalFormData, world, system } from "../../../core.js";
import { LandDatabase } from "../core/LandDatabase.js";
import { getFullMoney, setMoney } from "../../../function/moneySystem.js";
import { GlobalConfig } from "../../../function/GlobalConfig.js";
export class LandConfig {
  static CONFIG_KEY = "land_config";
  static MONEY_OBJ = "extremesmp_money";
  static DISP_OBJ = "display_money";
  static #cache = null;
  static #lastUpd = 0;
  static #nonSolid = ["minecraft:air", "minecraft:water", "minecraft:lava", "minecraft:fire", "minecraft:grass", "minecraft:tall_grass", "minecraft:seagrass", "minecraft:kelp", "minecraft:snow", "minecraft:vine", "minecraft:dead_bush", "minecraft:torch", "minecraft:flower"];
  static #hazard = ["minecraft:lava", "minecraft:fire", "minecraft:sweet_berry_bush", "minecraft:cactus", "minecraft:magma_block", "minecraft:campfire", "minecraft:soul_campfire", "minecraft:wither_rose"];
  static defaultConfig = { minClaimSize: 10, maxClaimSize: 1000, pricePerBlock: 10, maxClaimsPerPlayer: 3, allowOverlap: false, requireMoney: true, protectionEnabled: true, freeClaim: false, allowTeleport: true, notifyNearby: true, autoVisualize: true, performanceMode: false };
  static initScoreboard() {
    try {
      try { world.scoreboard.removeObjective(this.MONEY_OBJ); world.scoreboard.removeObjective(this.DISP_OBJ); } catch { }
      world.scoreboard.addObjective(this.MONEY_OBJ, "Money");
      world.scoreboard.addObjective(this.DISP_OBJ, "\u00A7b\u00A7l\u2726 BALANCE \u2726");
      this.animScoreboard();
      return true;
    } catch (e) { console.warn("SB Init:", e); return false; }
  }
  static animScoreboard() {
    system.runInterval(() => {
      try {
        const obj = world.scoreboard.getObjective(this.DISP_OBJ);
        if (!obj) return this.initScoreboard();
        for (const p of world.getAllPlayers()) {
          try {
            const m = getFullMoney(p);
            obj.setScore(`\u00A7e${p.name}`, Number(m > 2000000000n ? 2000000000n : m));
          } catch { }
        }
      } catch { }
    }, 20);
  }
  static getConfig() {
    const now = Date.now();
    if (this.#cache && now - this.#lastUpd < 60000) return this.#cache;
    try {
      const s = GlobalConfig.get(this.CONFIG_KEY);
      this.#cache = s ? { ...this.defaultConfig, ...(typeof s === "string" ? JSON.parse(s) : s) } : this.defaultConfig;
      this.#lastUpd = now;
      return this.#cache;
    } catch { return this.defaultConfig; }
  }
  static saveConfig(c) {
    try {
      GlobalConfig.set(this.CONFIG_KEY, c);
      this.#cache = c;
      this.#lastUpd = Date.now();
      return true;
    } catch (e) { console.warn("Save:", e); return false; }
  }
  static async #form(p, f, cb, err) {
    try {
      const r = await f.show(p);
      if (r.canceled) return err?.();
      await cb(r);
    } catch (e) {
      p.sendMessage(e.reason ? `\u00A7cForm rejected: ${e.reason}` : "\u00A7cForm error");
      if (!e.reason) console.warn("Form:", e);
      err?.();
    }
  }
  static async showPerformanceSettings(p) {
    const c = this.getConfig();
    this.#form(p, new ModalFormData().title("Performance Settings")
      .toggle("\u00A7eProtection Enabled\n\u00A78Enable/disable all land protection globally", { defaultValue: c.protectionEnabled !== false })
      .toggle("\u00A7ePerformance Mode\n\u00A78Optimize for low-end devices", { defaultValue: c.performanceMode })
      .toggle("\u00A7eAuto Visualize Claims\n\u00A78Show claim boundaries", { defaultValue: c.autoVisualize })
      .toggle("\u00A7eNotify Nearby Players\n\u00A78Alert players near claims", { defaultValue: c.notifyNearby }),
      (r) => {
        [c.protectionEnabled, c.performanceMode, c.autoVisualize, c.notifyNearby] = r.formValues;
        this.saveConfig(c) && p.sendMessage("\u00A7aPerformance settings updated!");
      }, () => system.runTimeout(() => this.showAdminMenu(p), 1));
  }
  static calcPrice(b) { const c = this.getConfig(); return c.freeClaim ? 0n : BigInt(b) * BigInt(c.pricePerBlock); }
  static calcBlocks(p1, p2) { return (Math.abs(p1.x - p2.x) + 1) * (Math.abs(p1.z - p2.z) + 1); }
  static validateClaim(p1, p2, maxClaimSizeOverride = null) {
    if (!p1 || !p2) return { valid: false, message: "Invalid positions" };
    const c = this.getConfig(), b = this.calcBlocks(p1, p2);
    const maxSize = maxClaimSizeOverride !== null && maxClaimSizeOverride > 0 ? maxClaimSizeOverride : c.maxClaimSize;
    if (b < c.minClaimSize) return { valid: false, message: `Claim too small. Min: ${c.minClaimSize}` };
    if (b > maxSize) return { valid: false, message: `Claim too large. Max: ${maxSize}` };
    return { valid: true, blocks: b, price: this.calcPrice(b) };
  }
  static async showPriceSettings(p) {
    const c = this.getConfig();
    this.#form(p, new ModalFormData().title("Price Settings")
      .toggle("\u00A7eFree Claims\n\u00A78Allow free land claims", { defaultValue: c.freeClaim })
      .toggle("\u00A7eRequire Money\n\u00A78Require payment for claims", { defaultValue: c.requireMoney })
      .textField("\u00A7ePrice Per Block\n\u00A78Cost per block", "Enter price...", { defaultValue: c.pricePerBlock.toString() }),
      (r) => {
        c.freeClaim = r.formValues[0];
        c.requireMoney = r.formValues[1];
        const pr = parseInt(r.formValues[2]);
        if (!isNaN(pr) && pr >= 0) c.pricePerBlock = pr;
        this.saveConfig(c);
        p.sendMessage("\u00A7aPrice settings updated!");
      }, () => system.runTimeout(() => this.showAdminMenu(p), 1));
  }
  static async showFeatureSettings(p) {
    const c = this.getConfig();
    this.#form(p, new ModalFormData().title("Feature Settings")
      .toggle("Allow Teleport to Claims", { defaultValue: c.allowTeleport })
      .toggle("Auto Visualize Claims", { defaultValue: c.autoVisualize }),
      (r) => {
        [c.allowTeleport, c.autoVisualize] = r.formValues;
        this.saveConfig(c);
        p.sendMessage("\u00A7aFeature settings updated!");
      }, () => system.runTimeout(() => this.showAdminMenu(p), 1));
  }
  static async showSizeSettings(p) {
    const c = this.getConfig();
    this.#form(p, new ModalFormData().title("Size Settings")
      .textField("\u00A7eMin Claim Size", "Size...", { defaultValue: c.minClaimSize.toString() })
      .textField("\u00A7eMax Claim Size", "Size...", { defaultValue: c.maxClaimSize.toString() })
      .slider("\u00A7eMax Claims Per Player", 1, 20, { valueStep: 1, defaultValue: c.maxClaimsPerPlayer })
      .toggle("\u00A7eAllow Claim Overlap", { defaultValue: c.allowOverlap }),
      (r) => {
        const [min, max] = [parseInt(r.formValues[0]), parseInt(r.formValues[1])];
        if (isNaN(min) || isNaN(max) || min < 1 || max < min) return p.sendMessage("\u00A7cInvalid size values!");
        [c.minClaimSize, c.maxClaimSize, c.maxClaimsPerPlayer, c.allowOverlap] = [min, max, r.formValues[2], r.formValues[3]];
        this.saveConfig(c);
        p.sendMessage("\u00A7aSize settings updated!");
      }, () => system.runTimeout(() => this.showAdminMenu(p), 1));
  }
  static async showAdminMenu(p) {
    this.#form(p, new ActionFormData().title("Land System Admin").body("Manage land claim system settings")
      .button("Price Settings\nConfigure costs", "textures/ui/MCoin")
      .button("Size Settings\nSet claim limits", "textures/ui/icon_preview")
      .button("Performance Settings\nOptimize for your device", "textures/ui/icon_staffpicks")
      .button("View Land Claims\nManage all claims", "textures/ui/icon_spring"),
      (r) => system.runTimeout(() => {
        const acts = [
          () => this.showPriceSettings(p),
          () => this.showSizeSettings(p),
          () => this.showPerformanceSettings(p),
          () => LandDatabase.getAllClaims().length === 0 ? (p.sendMessage("\u00A7cNo land claims found!"), this.showAdminMenu(p)) : this.showLandList(p)
        ];
        acts[r.selection]?.();
      }, 1));
  }
  static async showLandList(p) {
    try {
      const claims = await LandDatabase.getAllClaims();
      if (!claims?.length) return p.sendMessage("\u00A7cNo land claims found!"), system.runTimeout(() => this.showAdminMenu(p), 1);
      const f = new ActionFormData().title("Land Claim List").body(`\u00A7fTotal Claims: \u00A7a${claims.length}\n\u00A77Click a claim to view details`);
      claims.forEach(c => {
        if (c && typeof c === "object") f.button(`\u00A7e${c.name || "Unnamed"}\n\u00A7fOwner: \u00A7a${LandDatabase.getPlayerName(c.owner)} | Size: \u00A7a${this.calcBlocks(c.pos1, c.pos2)} | Members: \u00A7a${c.members?.length || 0}\n\u00A7fStatus: ${c.allowEntry ? "\u00A7aOpen" : "\u00A7cClosed"}`, "textures/ui/icon_best3");
      });
      this.#form(p, f, (r) => {
        const c = claims[r.selection];
        if (!c) return p.sendMessage("\u00A7cInvalid claim!"), system.runTimeout(() => this.showAdminMenu(p), 1);
        this.showClaimDetails(p, c);
      }, () => system.runTimeout(() => this.showAdminMenu(p), 1));
    } catch (e) { console.warn("List:", e); p.sendMessage("\u00A7cError loading list!"); system.runTimeout(() => this.showAdminMenu(p), 1); }
  }
  static async showClaimDetails(p, c) {
    try {
      const owner = world.getAllPlayers().find(pl => pl.id === c.owner)?.name || c.owner;
      const mems = c.members || [];
      const mList = mems.map(m => `\u00A77- ${world.getAllPlayers().find(pl => pl.id === m.id)?.name || m.id} (${Object.keys(m.permissions).filter(k => m.permissions[k]).join(", ") || "None"})`).join("\n");
      const hList = (c.accessHistory || []).slice(-5).map(h => `\u00A77- ${h.playerName} (${h.action}) on ${new Date(h.timestamp).toLocaleString()}`).join("\n");
      this.#form(p, new ActionFormData().title("Claim Details").body(
        `\u00A7e=== Claim Information ===\n\u00A7fOwner: \u00A7a${owner}\n\u00A7fBlocks: \u00A7a${this.calcBlocks(c.pos1, c.pos2)}\n\u00A7fMembers: \u00A7a${mems.length}\n\u00A7fStatus: ${c.allowEntry ? "\u00A7aOpen" : "\u00A7cMembers only"}\n` +
        `\u00A7fLoc: \u00A77${c.pos1.x},${c.pos1.y},${c.pos1.z} to ${c.pos2.x},${c.pos2.y},${c.pos2.z}\n\n\u00A7fMembers:\n${mList || "\u00A77None"}\n\n\u00A7fHistory:\n${hList || "\u00A77None"}`
      ).button("Teleport", "textures/ui/arrow").button("Permissions", "textures/ui/permissions_member_star").button("Entry Settings", "textures/ui/icon_import").button("Remove", "textures/ui/trash").button("Back", "textures/ui/arrow_left"),
        (r) => system.runTimeout(() => {
          [
            () => {
              try {
                p.teleport({ x: (c.pos1.x + c.pos2.x) / 2, y: this.findSafeY((c.pos1.x + c.pos2.x) / 2, (c.pos1.z + c.pos2.z) / 2, Math.max(c.pos1.y, c.pos2.y)), z: (c.pos1.z + c.pos2.z) / 2 });
                p.sendMessage("\u00A7aTeleported!");
              } catch { p.sendMessage("\u00A7cTeleport failed!"); }
              this.showClaimDetails(p, c);
            },
            () => this.showMemberPermissions(p, c),
            () => this.showEntrySettings(p, c),
            () => this.showRemoveConfirm(p, c),
            () => this.showLandList(p)
          ][r.selection]?.();
        }, 1), () => this.showLandList(p));
    } catch { p.sendMessage("\u00A7cError showing details"); this.showLandList(p); }
  }
  static async showMemberPermissions(p, c) {
    const mems = c.members || [];
    if (!mems.length) return p.sendMessage("\u00A7cNo members!"), system.runTimeout(() => this.showClaimDetails(p, c), 1);
    const f = new ActionFormData().title("Member Permissions").body("\u00A7fSelect member:");
    mems.forEach(m => f.button(`${world.getAllPlayers().find(pl => pl.id === m.id)?.name || m.id}\n${Object.keys(m.permissions).filter(k => m.permissions[k]).join(", ") || "None"}`, "textures/ui/permissions_member"));
    f.button("Back", "textures/ui/arrow_left");
    this.#form(p, f, (r) => r.selection === mems.length ? system.runTimeout(() => this.showClaimDetails(p, c), 1) : this.editMemberPerms(p, c, mems[r.selection]), () => system.runTimeout(() => this.showClaimDetails(p, c), 1));
  }
  static async editMemberPerms(p, c, m) {
    this.#form(p, new ModalFormData().title("Edit Permissions")
      .toggle("Break", { defaultValue: m.permissions.break }).toggle("Place", { defaultValue: m.permissions.place }).toggle("Interact", { defaultValue: m.permissions.interact }).toggle("Entry", { defaultValue: m.permissions.entry }),
      (r) => {
        const upd = { ...c, members: c.members.map(mem => mem.id === m.id ? { ...mem, permissions: { break: r.formValues[0], place: r.formValues[1], interact: r.formValues[2], entry: r.formValues[3] } } : mem) };
        LandDatabase.updateClaim(c.claimId, upd) ? p.sendMessage(`\u00A7aPermissions updated for ${world.getAllPlayers().find(pl => pl.id === m.id)?.name || m.id}`) : p.sendMessage("\u00A7cUpdate failed!");
        system.runTimeout(() => this.showMemberPermissions(p, c), 1);
      }, () => system.runTimeout(() => this.showMemberPermissions(p, c), 1));
  }
  static async showRemoveConfirm(p, c) {
    this.#form(p, new ModalFormData().title("Remove Claim").textField("Type 'CONFIRM':", "CONFIRM", { defaultValue: "" }).toggle("\u00A7cConfirm deletion", { defaultValue: false }),
      (r) => {
        if (r.formValues[0] === "CONFIRM" && r.formValues[1]) {
          LandDatabase.removeClaim(c.claimId) ? (p.sendMessage("\u00A7aClaim removed!"), this.showLandList(p)) : (p.sendMessage("\u00A7cRemove failed!"), system.runTimeout(() => this.showClaimDetails(p, c), 1));
        } else system.runTimeout(() => this.showClaimDetails(p, c), 1);
      }, () => system.runTimeout(() => this.showClaimDetails(p, c), 1));
  }
  static async showEntrySettings(p, c) {
    this.#form(p, new ModalFormData().title("Entry Settings").toggle("Allow all players", { defaultValue: c.allowEntry ?? false }),
      (r) => {
        LandDatabase.updateClaim(c.claimId, { ...c, allowEntry: r.formValues[0] }) ? p.sendMessage(`\u00A7aEntry settings updated! ${r.formValues[0] ? "All allowed" : "Members only"}`) : p.sendMessage("\u00A7cUpdate failed!");
        system.runTimeout(() => this.showClaimDetails(p, c), 1);
      }, () => system.runTimeout(() => this.showClaimDetails(p, c), 1));
  }
  static findSafeY(x, z, maxY) {
    try {
      const dim = world.getDimension("overworld");
      for (let y = Math.min(maxY + 1, 319); y > -64; y--) {
        const [b, c, a] = [dim.getBlock({ x, y: y - 1, z }), dim.getBlock({ x, y, z }), dim.getBlock({ x, y: y + 1, z })];
        if (this.isSolid(b) && !this.isHazard(b) && !this.isSolid(c) && !this.isSolid(a)) return y;
      }
      return maxY + 1;
    } catch { return maxY + 1; }
  }
  static isSolid(b) { return b && !this.#nonSolid.some(id => b.typeId.includes(id)); }
  static isHazard(b) { return b && this.#hazard.some(id => b.typeId.includes(id)); }
}
system.afterEvents.scriptEventReceive.subscribe((e) => { if (e.id === "landsystem:init") LandConfig.initScoreboard(); });
export function AdminLandConfig(p) { return LandConfig.showAdminMenu(p); }
