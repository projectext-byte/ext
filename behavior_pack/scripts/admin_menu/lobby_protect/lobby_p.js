import { system, world, ActionFormData, ModalFormData } from "../../core.js";
import { Lang } from "../../lib/Lang.js";
import {
  getLobbyConfig,
  saveLobbyConfig,
  getProtectedRegions,
  saveProtectedRegions,
  getRegionConfig,
  saveRegionConfig,
  isValidEntityTypeId,
  getSuggestedEntityExclusions,
  getAvailableLobbyRanks,
  normalizeAllowedRanks,
  getLobbyRankLabel,
} from "./config.js";
import { sendProtectionMessage, playerAreas } from "./utils.js";
import { registerAllEvents, checkPlayerRegion, clearLobbyDamageEffect } from "./events.js";
import { showHelpMenu } from "./help.js";
import { LandDatabase } from "../../plugins/land-system/index.js";
import { activateLobbyMode } from "./lobby_inventory.js";
import { getShulkerConfig, saveShulkerConfig, isShulkerTrackingEnabled } from "./shulker_tracker.js";
export class LobbyProtection {
  static positionSelections = new Map();
  static isInitialized = false;
  static init() {
    if (!getLobbyConfig().enabled || this.isInitialized) return;
    this.isInitialized = true;
    system.runTimeout(() => {
      try {
        registerAllEvents();
      } catch (e) {
        console.error("Init error:", e);
      }
    }, 100);
  }
  static visualizeRegion({ pos1, pos2 }) {
    try {
      const dim = world.getDimension("overworld"),
        cmds = [];
      const [min, max] = [
        {
          x: Math.min(pos1.x, pos2.x),
          y: Math.min(pos1.y, pos2.y),
          z: Math.min(pos1.z, pos2.z),
        },
        {
          x: Math.max(pos1.x, pos2.x),
          y: Math.max(pos1.y, pos2.y),
          z: Math.max(pos1.z, pos2.z),
        },
      ];
      const addP = (x, y, z) =>
        cmds.push(`particle minecraft:basic_flame_particle ${x} ${y} ${z}`);
      for (let x of [min.x, max.x])
        for (let y of [min.y, max.y])
          for (let z of [min.z, max.z]) addP(x, y, z);
      const edges = (k, c1, c2) => {
        for (let i = min[k]; i <= max[k]; i += 8) {
          [min[c1], max[c1]].forEach((v1) =>
            [min[c2], max[c2]].forEach((v2) => {
              const p = { x: min.x, y: min.y, z: min.z };
              p[k] = i;
              p[c1] = v1;
              p[c2] = v2;
              addP(p.x, p.y, p.z);
            }),
          );
        }
      };
      edges("x", "y", "z");
      edges("y", "x", "z");
      edges("z", "x", "y");
      for (let i = 0; i < cmds.length; i += 20)
        system.runTimeout(
          () =>
            cmds.slice(i, i + 20).forEach((c) => {
              try {
                dim.runCommand(c);
              } catch { }
            }),
          Math.floor(i / 20) * 10,
        );
    } catch { }
  }
  static setPos(player, num) {
    const pos = {
      x: Math.floor(player.location.x),
      y: Math.floor(player.location.y),
      z: Math.floor(player.location.z),
    };
    if (!this.positionSelections.has(player.id))
      this.positionSelections.set(player.id, {});
    const sel = this.positionSelections.get(player.id);
    sel[`pos${num}`] = pos;
    player.sendMessage(
      Lang.t(player, "lobby.msg.pos_set", num, pos.x, pos.y, pos.z),
    );
    return pos;
  }
  static async setPosition2(player) {
    const pos = this.setPos(player, 2);
    const sel = this.positionSelections.get(player.id);
    if (sel.pos1) {
      try {
        const check = await LandDatabase.checkClaimOverlap(sel.pos1, pos);
        if (check.overlaps && check.overlapType === "land_claim")
          player.sendMessage(
            Lang.t(player, "lobby.msg.overlap", check.withClaim.name),
          );
      } catch (e) {
        console.warn("Overlap check error:", e);
      }
    }
  }
  static resetPositions(player) {
    this.positionSelections.delete(player.id);
    player.sendMessage(Lang.t(player, "lobby.msg.reset"));
  }
  static async createProtectedRegion(player, name) {
    const sel = this.positionSelections.get(player.id);
    if (!sel?.pos1 || !sel?.pos2)
      return (
        player.sendMessage(Lang.t(player, "lobby.err.pos")) && false
      );
    const pos1 = {
      x: Math.min(sel.pos1.x, sel.pos2.x),
      y: -64,
      z: Math.min(sel.pos1.z, sel.pos2.z),
    };
    const pos2 = {
      x: Math.max(sel.pos1.x, sel.pos2.x),
      y: 320,
      z: Math.max(sel.pos1.z, sel.pos2.z),
    };
    try {
      const check = await LandDatabase.checkClaimOverlap(pos1, pos2);
      if (check.overlaps && check.overlapType === "land_claim")
        return (
          player.sendMessage(
            Lang.t(player, "lobby.msg.overlap", check.withClaim.name),
          ) && false
        );
    } catch (e) {
      console.warn("Overlap check error:", e);
    }
    const regions = getProtectedRegions();
    const newRegion = {
      id: Date.now().toString(),
      name: name || `Lobby ${regions.length + 1}`,
      pos1,
      pos2,
      createdBy: player.name,
      createdAt: new Date().toISOString(),
    };
    saveProtectedRegions([...regions, newRegion]);
    saveRegionConfig(newRegion.id, getRegionConfig("default"));
    player.sendMessage(Lang.t(player, "lobby.msg.created", newRegion.name));
    this.resetPositions(player);
    return true;
  }
  static removeProtectedRegion(id) {
    const regions = getProtectedRegions();
    const filtered = regions.filter((r) => r.id !== id);
    if (regions.length === filtered.length) return false;
    world.getPlayers().forEach((p) => {
      if (playerAreas.get(p.id)?.regionId === id) {
        playerAreas.delete(p.id);
        clearLobbyDamageEffect(p);
        try {
          p.runCommand(`effect clear @s weakness`);
        } catch { }
      }
    });
    try {
      world.setDynamicProperty(`lobby_region_${id}_config`, undefined);
    } catch { }
    saveProtectedRegions(filtered);
    return true;
  }
  static async showMainMenu(player) {
    const config = getLobbyConfig();
    const statusText = config.enabled ? Lang.t(player, "common.on") : Lang.t(player, "common.off");
    const statusColor = config.enabled ? "§a" : "§c";
    const res = await new ActionFormData()
      .title(Lang.t(player, "lobby.title"))
      .body(Lang.t(player, "lobby.body"))
      .button(
        Lang.t(player, "lobby.btn.status", statusColor, statusText),
        config.enabled ? "textures/ui/toggle_on" : "textures/ui/toggle_off",
      )
      .button(
        Lang.t(player, "lobby.btn.pos1"),
        "textures/ui/Rotate",
      )
      .button(
        Lang.t(player, "lobby.btn.pos2"),
        "textures/ui/Rotate",
      )
      .button(
        Lang.t(player, "lobby.btn.create"),
        "textures/ui/RTX_Sparkle",
      )
      .button(
        Lang.t(player, "lobby.btn.manage"),
        "textures/ui/Scaffolding",
      )
      .button(
        Lang.t(player, "lobby.btn.exclude"),
        "textures/ui/realms_faq_fox",
      )
      .button(Lang.t(player, "lobby.btn.reset"), "textures/ui/pointer")
      .button(Lang.t(player, "lobby.btn.shulker"), "textures/ui/icon_recipe_item")
      .button(Lang.t(player, "lobby.btn.defaults"), "textures/ui/icon_setting")
      .button(Lang.t(player, "lobby.btn.help"), "textures/ui/promo_creeper")
      .show(player);
    if (res.canceled) return;
    const actions = [
      () => {
        config.enabled = !config.enabled;
        saveLobbyConfig(config);
        const statusMsg = config.enabled ? Lang.t(player, "common.enabled") : Lang.t(player, "common.disabled");
        player.sendMessage(
          Lang.t(player, "lobby.msg.status", statusMsg),
        );
        if (config.enabled) registerAllEvents();
        this.showMainMenu(player);
      },
      () => {
        this.setPos(player, 1);
        this.showMainMenu(player);
      },
      () => this.setPosition2(player).then(() => this.showMainMenu(player)),
      () => this.showCreateRegionForm(player),
      () => this.showRegionsList(player),
      () => this.showEntityExclusionsMenu(player),
      () => {
        this.resetPositions(player);
        this.showMainMenu(player);
      },
      () => this.showShulkerTrackingMenu(player),
      () => this.showDefaultSettingsMenu(player),
      () => showHelpMenu(player),
    ];
    actions[res.selection]?.();
  }
  static async showDefaultSettingsMenu(player) {
    const config = getLobbyConfig();
    const res = await new ModalFormData()
      .title(Lang.t(player, "lobby.defaults.title"))
      .toggle(Lang.t(player, "lobby.defaults.adventure"), {
        defaultValue: config.adventureModeEnabled ?? false,
      })
      .toggle(Lang.t(player, "lobby.create.damage"), {
        defaultValue: config.damageProtection ?? true,
      })
      .show(player);
    if (res.canceled) return this.showMainMenu(player);
    const [adventureModeDefault, damageProtectionDefault] = res.formValues;
    config.adventureModeEnabled = adventureModeDefault;
    config.damageProtection = damageProtectionDefault;
    saveLobbyConfig(config);
    player.sendMessage(Lang.t(player, "lobby.defaults.msg.saved"));
    this.showMainMenu(player);
  }
  static async showShulkerTrackingMenu(player) {
    const config = getShulkerConfig();
    const enabled = config.enabled ?? true;
    const statusText = enabled ? Lang.t(player, "common.on") : Lang.t(player, "common.off");
    const toggleAction = enabled ? Lang.t(player, "lobby.shulker.action.disable") : Lang.t(player, "lobby.shulker.action.enable");
    const res = await new ActionFormData()
      .title(Lang.t(player, "lobby.shulker.title"))
      .body(Lang.t(player, "lobby.shulker.body", statusText))
      .button(
        Lang.t(player, "lobby.shulker.btn.toggle", toggleAction),
        enabled ? "textures/ui/toggle_off" : "textures/ui/toggle_on"
      )
      .button(Lang.t(player, "lobby.shulker.btn.back"), "textures/ui/arrow_left")
      .show(player);
    if (res.canceled) return this.showMainMenu(player);
    if (res.selection === 0) {
      config.enabled = !enabled;
      saveShulkerConfig(config);
      const statusMsg = config.enabled ? Lang.t(player, "common.enabled") : Lang.t(player, "common.disabled");
      player.sendMessage(Lang.t(player, "lobby.msg.shulker", statusMsg));
      this.showShulkerTrackingMenu(player);
    } else {
      this.showMainMenu(player);
    }
  }
  static async showEntityExclusionsMenu(player) {
    const config = getLobbyConfig();
    const res = await new ActionFormData()
      .title(Lang.t(player, "lobby.exclude.title"))
      .body(Lang.t(player, "lobby.exclude.body", (config.excludedEntities || []).length))
      .button(Lang.t(player, "lobby.exclude.btn.list"), "textures/ui/magnifyingGlass")
      .button(Lang.t(player, "lobby.exclude.btn.add"), "textures/ui/plus")
      .button(Lang.t(player, "lobby.exclude.btn.remove"), "textures/ui/trash")
      .button(Lang.t(player, "lobby.exclude.btn.reset"), "textures/ui/recap_glyph_desaturated")
      .button(Lang.t(player, "spawn.btn.back"), "textures/ui/arrow_left")
      .show(player);
    if (res.canceled) return;
    [
      () => this.showExcludedEntitiesList(player),
      () => this.showAddEntityExclusionForm(player),
      () => this.showRemoveEntityExclusionForm(player),
      () => this.resetEntityExclusions(player),
      () => this.showMainMenu(player),
    ][res.selection]?.();
  }
  static async showExcludedEntitiesList(player) {
    const list = getLobbyConfig().excludedEntities || [];
    if (!list.length)
      return (
        player.sendMessage(Lang.t(player, "lobby.exclude.msg.empty")) ||
        this.showEntityExclusionsMenu(player)
      );
    await new ActionFormData()
      .title(Lang.t(player, "lobby.exclude.title"))
      .body(list.map((e, i) => `§f${i + 1}. §a${e}`).join("\n"))
      .button(Lang.t(player, "common.back"))
      .show(player);
    this.showEntityExclusionsMenu(player);
  }
  static async showAddEntityExclusionForm(player) {
    const res = await new ModalFormData()
      .title(Lang.t(player, "lobby.exclude.add.title"))
      .textField(Lang.t(player, "lobby.exclude.add.id"), "minecraft:zombie or *", {
        defaultValue: "minecraft:",
      })
      .textField(Lang.t(player, "lobby.exclude.add.wildcard"), "Pattern...", { defaultValue: "" })
      .toggle(Lang.t(player, "lobby.exclude.add.all"), { defaultValue: true })
      .toggle(Lang.t(player, "lobby.exclude.add.sugg"), { defaultValue: false })
      .show(player);
    if (res.canceled) return this.showEntityExclusionsMenu(player);
    const [id, pat, all, sugg] = res.formValues;
    if (sugg) return this.showEntitySuggestions(player);
    const final = (id || pat || "").trim();
    if (
      !final ||
      final === "minecraft:" ||
      (!pat && !isValidEntityTypeId(final))
    )
      return (
        player.sendMessage(Lang.t(player, "lobby.exclude.err.id")) ||
        this.showEntityExclusionsMenu(player)
      );
    const config = getLobbyConfig();
    if (!config.excludedEntities) config.excludedEntities = [];
    if (config.excludedEntities.includes(final))
      return (
        player.sendMessage(Lang.t(player, "lobby.exclude.err.exists")) ||
        this.showEntityExclusionsMenu(player)
      );
    config.excludedEntities.push(final);
    saveLobbyConfig(config);
    if (all)
      getProtectedRegions().forEach((r) => {
        const rc = getRegionConfig(r.id);
        if (!rc.excludedEntities?.includes(final)) {
          rc.excludedEntities = [...(rc.excludedEntities || []), final];
          saveRegionConfig(r.id, rc);
        }
      });
    player.sendMessage(Lang.t(player, "lobby.exclude.msg.added", final));
    this.showEntityExclusionsMenu(player);
  }
  static async showEntitySuggestions(player) {
    const suggs = getSuggestedEntityExclusions();
    const form = new ActionFormData()
      .title(Lang.t(player, "lobby.exclude.sugg.title"))
      .body(Lang.t(player, "lobby.exclude.sugg.body"));
    suggs.forEach((s) =>
      form.button(`${s.includes("*") ? "§e⚡" : "§a●"} ${s}`),
    );
    const res = await form.button(Lang.t(player, "common.back")).show(player);
    if (res.canceled || res.selection === suggs.length)
      return this.showAddEntityExclusionForm(player);
    const sel = suggs[res.selection];
    const config = getLobbyConfig();
    if (!config.excludedEntities) config.excludedEntities = [];
    if (!config.excludedEntities.includes(sel)) {
      config.excludedEntities.push(sel);
      saveLobbyConfig(config);
      getProtectedRegions().forEach((r) => {
        const rc = getRegionConfig(r.id);
        if (!rc.excludedEntities?.includes(sel)) {
          rc.excludedEntities = [...(rc.excludedEntities || []), sel];
          saveRegionConfig(r.id, rc);
        }
      });
      player.sendMessage(Lang.t(player, "lobby.exclude.msg.added", sel));
    }
    this.showEntityExclusionsMenu(player);
  }
  static async showRemoveEntityExclusionForm(player) {
    const config = getLobbyConfig();
    const list = config.excludedEntities || [];
    if (!list.length)
      return (
        player.sendMessage(Lang.t(player, "lobby.exclude.msg.empty")) ||
        this.showEntityExclusionsMenu(player)
      );
    const form = new ActionFormData()
      .title(Lang.t(player, "lobby.exclude.remove.title"))
      .body(Lang.t(player, "lobby.exclude.remove.body"));
    list.forEach((e) => form.button(`§c${e}`));
    const res = await form.button(Lang.t(player, "common.back")).show(player);
    if (res.canceled || res.selection === list.length)
      return this.showEntityExclusionsMenu(player);
    const rem = list[res.selection];
    config.excludedEntities = list.filter((e) => e !== rem);
    saveLobbyConfig(config);
    getProtectedRegions().forEach((r) => {
      const rc = getRegionConfig(r.id);
      if (rc.excludedEntities) {
        rc.excludedEntities = rc.excludedEntities.filter((e) => e !== rem);
        saveRegionConfig(r.id, rc);
      }
    });
    player.sendMessage(Lang.t(player, "lobby.exclude.msg.removed", rem));
    this.showEntityExclusionsMenu(player);
  }
  static resetEntityExclusions(player) {
    const def = getSuggestedEntityExclusions();
    const c = getLobbyConfig();
    c.excludedEntities = [...def];
    saveLobbyConfig(c);
    getProtectedRegions().forEach((r) => {
      const rc = getRegionConfig(r.id);
      rc.excludedEntities = [...def];
      saveRegionConfig(r.id, rc);
    });
    player.sendMessage(Lang.t(player, "lobby.exclude.msg.reset"));
    this.showEntityExclusionsMenu(player);
  }
  static async showCreateRegionForm(player) {
    const sel = this.positionSelections.get(player.id);
    const defaultConfig = getLobbyConfig();
    if (!sel?.pos1 || !sel?.pos2)
      return (
        player.sendMessage(Lang.t(player, "lobby.err.pos")) ||
        this.showMainMenu(player)
      );
    const defName = `Lobby ${getProtectedRegions().length + 1}`;
    const form = new ModalFormData()
      .title(Lang.t(player, "lobby.create.title"))
      .textField(Lang.t(player, "lobby.create.name"), "Name...", { defaultValue: defName })
      .toggle(Lang.t(player, "lobby.create.bb"), { defaultValue: true })
      .toggle(Lang.t(player, "lobby.create.bp"), { defaultValue: true })
      .toggle(Lang.t(player, "lobby.create.entity"), { defaultValue: true })
      .toggle(Lang.t(player, "lobby.create.interactive"), { defaultValue: true })
      .toggle(Lang.t(player, "lobby.create.farm"), { defaultValue: false })
      .toggle(Lang.t(player, "lobby.create.restricted"), { defaultValue: true })
      .toggle(Lang.t(player, "lobby.create.pvp"), { defaultValue: true })
      .toggle(Lang.t(player, "lobby.create.damage"), {
        defaultValue: defaultConfig.damageProtection ?? true,
      })
      .toggle(Lang.t(player, "lobby.create.explosions"), { defaultValue: true })
      .toggle(Lang.t(player, "lobby.create.fly"), { defaultValue: false })
      .toggle(Lang.t(player, "lobby.create.admin"), { defaultValue: true })
      .textField(Lang.t(player, "lobby.create.tag"), "Tag...", { defaultValue: "admin" })
      .toggle(Lang.t(player, "lobby.create.ow"), { defaultValue: true })
      .toggle(Lang.t(player, "lobby.create.nether"), { defaultValue: false })
      .toggle(Lang.t(player, "lobby.create.end"), { defaultValue: false })
      .toggle(Lang.t(player, "lobby.create.inv"), { defaultValue: false })
      .toggle(Lang.t(player, "lobby.create.adventure"), {
        defaultValue: defaultConfig.adventureModeEnabled ?? false,
      });
    const res = await form.show(player);
    if (res.canceled) return this.showMainMenu(player);
    const [
      name,
      blockBreak,
      blockPlace,
      entityInteraction,
      interactiveBlocks,
      farmland,
      restrictedItems,
      pvp,
      damageProtection,
      explosions,
      antiFly,
      adminBypass,
      adminTag,
      overworld,
      nether,
      theEnd,
      lobbyInv,
      adventureMode,
    ] = res.formValues;
    if (await this.createProtectedRegion(player, name || defName)) {
      const regions = getProtectedRegions();
      const region = regions[regions.length - 1];
      const config = {
        blockBreakProtection: blockBreak,
        blockPlaceProtection: blockPlace,
        interactionProtection: entityInteraction,
        entityInteractionProtection: entityInteraction,
        interactiveBlocksProtection: interactiveBlocks,
        farmlandProtection: farmland,
        itemUseProtection: restrictedItems,
        restrictedItemsProtection: restrictedItems,
        pvpProtection: pvp,
        damageProtection,
        explosionProtection: explosions,
        antiFly: antiFly,
        adminBypassEnabled: adminBypass,
        adminTag: adminTag || "admin",
        allowedRanks: [],
        protectedDimensions: [
          overworld && "overworld",
          nether && "nether",
          theEnd && "the_end",
        ].filter(Boolean),
        lobbyInventoryEnabled: lobbyInv,
        adventureModeEnabled: adventureMode,
      };
      saveRegionConfig(region.id, config);
      const s = sel;
      const size =
        (Math.abs(s.pos1.x - s.pos2.x) + 1) *
        (Math.abs(s.pos1.y - s.pos2.y) + 1) *
        (Math.abs(s.pos1.z - s.pos2.z) + 1);
      player.sendMessage(
        Lang.t(player, "lobby.create.success_size", name || defName, size),
      );
    }
    this.showMainMenu(player);
  }
  static async showRegionsList(player) {
    const regions = getProtectedRegions();
    if (!regions.length)
      return (
        player.sendMessage(Lang.t(player, "lobby.regions.msg.empty")) ||
        this.showMainMenu(player)
      );
    const form = new ActionFormData()
      .title(Lang.t(player, "lobby.regions.title"))
      .body(Lang.t(player, "lobby.regions.body", regions.length));
    regions.forEach((r) => {
      const c = getRegionConfig(r.id);
      const s =
        (Math.abs(r.pos1.x - r.pos2.x) + 1) *
        (Math.abs(r.pos1.y - r.pos2.y) + 1) *
        (Math.abs(r.pos1.z - r.pos2.z) + 1);
      const protections = [];
      if (c.blockBreakProtection) protections.push("BB");
      if (c.blockPlaceProtection) protections.push("BP");
      if (c.entityInteractionProtection ?? c.interactionProtection) protections.push("EI");
      if (c.interactiveBlocksProtection) protections.push("IB");
      if (c.farmlandProtection) protections.push("FP");
      if (c.restrictedItemsProtection ?? c.itemUseProtection) protections.push("RI");
      if (c.antiBowProtection) protections.push("AB");
      if (c.explosionProtection) protections.push("EX");
      if (c.pvpProtection) protections.push("PVP");
      if (c.damageProtection) protections.push("DMG");
      if (normalizeAllowedRanks(c.allowedRanks).length) protections.push("RANK");
      const p = protections.length > 0 ? protections.join(" ") : Lang.t(player, "common.none");
      form.button(Lang.t(player, "lobby.regions.btn", r.name, s, p), "textures/ui/icon_map");
    });
    const res = await form
      .button(Lang.t(player, "common.back"), "textures/ui/arrow_left")
      .show(player);
    if (res.canceled || res.selection === regions.length)
      return this.showMainMenu(player);
    this.showRegionDetails(player, regions[res.selection]);
  }
  static async showRegionDetails(player, region) {
    const c = getRegionConfig(region.id);
    const s =
      (Math.abs(region.pos1.x - region.pos2.x) + 1) *
      (Math.abs(region.pos1.y - region.pos2.y) + 1) *
      (Math.abs(region.pos1.z - region.pos2.z) + 1);
    const protections = [];
    if (c.blockBreakProtection) protections.push(Lang.t(player, "lobby.protection.block_break"));
    if (c.blockPlaceProtection) protections.push(Lang.t(player, "lobby.protection.block_place"));
    if (c.entityInteractionProtection ?? c.interactionProtection) protections.push(Lang.t(player, "lobby.protection.entity"));
    if (c.interactiveBlocksProtection) protections.push(Lang.t(player, "lobby.protection.interactive"));
    if (c.farmlandProtection) protections.push(Lang.t(player, "lobby.protection.farmland"));
    if (c.restrictedItemsProtection ?? c.itemUseProtection) protections.push(Lang.t(player, "lobby.protection.restricted"));
    if (c.antiBowProtection) protections.push(Lang.t(player, "lobby.protection.anti_bow"));
    if (c.explosionProtection) protections.push(Lang.t(player, "lobby.protection.explosions"));
    if (c.pvpProtection) protections.push("PVP");
    if (c.damageProtection) protections.push(Lang.t(player, "lobby.protection.damage"));
    if (normalizeAllowedRanks(c.allowedRanks).length) protections.push(Lang.t(player, "lobby.protection.rank_access"));
    const p = protections.length > 0 ? protections.join(", ") : Lang.t(player, "common.none");
    const res = await new ActionFormData()
      .title(`§b${region.name}`)
      .body(
        Lang.t(player, "lobby.details.body", region.name, region.createdBy, s, p),
      )
      .button(Lang.t(player, "lobby.details.tp"), "textures/ui/arrow")
      .button(Lang.t(player, "lobby.details.vis"), "textures/ui/icon_recipe_nature")
      .button(Lang.t(player, "lobby.details.rename"), "textures/ui/icon_sign")
      .button(Lang.t(player, "lobby.details.settings"), "textures/ui/icon_setting")
      .button(Lang.t(player, "lobby.rank.btn"), "textures/ui/permissions_custom_dots")
      .button(Lang.t(player, "lobby.details.delete"), "textures/ui/trash")
      .button(Lang.t(player, "common.back"), "textures/ui/arrow_left")
      .show(player);
    if (res.canceled) return this.showRegionsList(player);
    const acts = [
      () => {
        try {
          const t = {
            x: Math.floor((region.pos1.x + region.pos2.x) / 2),
            y: 320,
            z: Math.floor((region.pos1.z + region.pos2.z) / 2),
          };
          player.addTag(
            `oldchunck\`${JSON.stringify({ ...player.location, dim: player.dimension.id })}`,
          );
          player.teleport(t, { dimension: world.getDimension("overworld") });
          player.addTag(`loadchunck\`${JSON.stringify(t)}`);
          player.runCommand(
            `titleraw @s actionbar {"rawtext":[{"text":"${Lang.t(player, "lobby.details.tp.msg")}"}]}`,
          );
        } catch { }
        this.showRegionDetails(player, region);
      },
      () => {
        this.visualizeRegion(region);
        player.sendMessage(Lang.t(player, "lobby.details.vis.msg"));
        this.showRegionDetails(player, region);
      },
      () => this.showRenameRegionForm(player, region),
      () => this.showToggleProtectionsForm(player, region),
      () => this.showRankAccessMenu(player, region),
      () => this.showDeleteConfirmation(player, region),
      () => this.showRegionsList(player),
    ];
    acts[res.selection]?.();
  }
  static async showRenameRegionForm(player, region) {
    const res = await new ModalFormData()
      .title(Lang.t(player, "lobby.rename.title"))
      .textField(Lang.t(player, "lobby.rename.label"), "Name", { defaultValue: region.name })
      .show(player);
    if (res.canceled) return this.showRegionDetails(player, region);
    const name = res.formValues[0];
    if (!name)
      return (
        player.sendMessage(Lang.t(player, "lobby.err.empty")) ||
        this.showRegionDetails(player, region)
      );
    const regions = getProtectedRegions().map((r) =>
      r.id === region.id ? { ...r, name } : r,
    );
    saveProtectedRegions(regions);
    player.sendMessage(Lang.t(player, "lobby.rename.msg", name));
    this.showRegionDetails(
      player,
      regions.find((r) => r.id === region.id),
    );
  }
  static async showRankAccessMenu(player, region) {
    const config = getRegionConfig(region.id);
    const availableRanks = getAvailableLobbyRanks();
    const allowedRanks = normalizeAllowedRanks(config.allowedRanks);
    const allowedKeys = new Set(allowedRanks.map((rank) => rank.toLowerCase()));
    const form = new ModalFormData()
      .title(Lang.t(player, "lobby.rank.title", region.name))
      .toggle(Lang.t(player, "lobby.rank.restrict"), {
        defaultValue: allowedRanks.length > 0,
      });
    availableRanks.forEach(({ rank, label }) => {
      form.toggle(`${label} (${rank})`, {
        defaultValue: allowedKeys.has(rank.toLowerCase()),
      });
    });
    const res = await form.show(player);
    if (res.canceled) return this.showRegionDetails(player, region);
    const [restrictByRank, ...rankValues] = res.formValues;
    const nextAllowed = restrictByRank
      ? availableRanks
        .filter((_, index) => rankValues[index])
        .map(({ rank }) => rank)
      : [];
    if (restrictByRank && !nextAllowed.length) {
      player.sendMessage(Lang.t(player, "lobby.rank.err.none_selected"));
      return this.showRankAccessMenu(player, region);
    }
    config.allowedRanks = normalizeAllowedRanks(nextAllowed);
    saveRegionConfig(region.id, config);
    system.runTimeout(() => world.getPlayers().forEach(checkPlayerRegion), 5);
    player.sendMessage(
      config.allowedRanks.length
        ? Lang.t(player, "lobby.rank.msg.updated", config.allowedRanks.map(getLobbyRankLabel).join(", "))
        : Lang.t(player, "lobby.rank.msg.reset"),
    );
    this.showRegionDetails(player, region);
  }
  static async showToggleProtectionsForm(player, region) {
    const config = getRegionConfig(region.id);
    const res = await new ModalFormData()
      .title(Lang.t(player, "lobby.settings.title", region.name))
      .toggle(Lang.t(player, "lobby.create.bb"), {
        defaultValue: config.blockBreakProtection ?? true,
      })
      .toggle(Lang.t(player, "lobby.create.bp"), {
        defaultValue: config.blockPlaceProtection ?? true,
      })
      .toggle(Lang.t(player, "lobby.create.entity"), {
        defaultValue: config.entityInteractionProtection ?? config.interactionProtection ?? true,
      })
      .toggle(Lang.t(player, "lobby.create.interactive"), {
        defaultValue: config.interactiveBlocksProtection ?? true,
      })
      .toggle(Lang.t(player, "lobby.create.farm"), {
        defaultValue: config.farmlandProtection ?? false,
      })
      .toggle(Lang.t(player, "lobby.create.restricted"), {
        defaultValue: config.restrictedItemsProtection ?? config.itemUseProtection ?? true,
      })
      .toggle(Lang.t(player, "lobby.create.anti_bow"), {
        defaultValue: config.antiBowProtection ?? false,
      })
      .toggle(Lang.t(player, "lobby.create.pvp"), {
        defaultValue: config.pvpProtection ?? true,
      })
      .toggle(Lang.t(player, "lobby.create.damage"), {
        defaultValue: config.damageProtection ?? true,
      })
      .toggle(Lang.t(player, "lobby.create.explosions"), {
        defaultValue: config.explosionProtection ?? true,
      })
      .toggle(Lang.t(player, "lobby.create.fly"), { defaultValue: config.antiFly ?? false })
      .toggle(Lang.t(player, "lobby.create.admin"), {
        defaultValue: config.adminBypassEnabled ?? true,
      })
      .textField(Lang.t(player, "lobby.create.tag"), "admin", {
        defaultValue: config.adminTag ?? "admin",
      })
      .toggle(Lang.t(player, "lobby.create.ow"), {
        defaultValue: config.protectedDimensions?.includes("overworld") ?? true,
      })
      .toggle(Lang.t(player, "lobby.create.nether"), {
        defaultValue: config.protectedDimensions?.includes("nether") ?? true,
      })
      .toggle(Lang.t(player, "lobby.create.end"), {
        defaultValue: config.protectedDimensions?.includes("the_end") ?? false,
      })
      .toggle(Lang.t(player, "lobby.create.inv"), {
        defaultValue: config.lobbyInventoryEnabled ?? false,
      })
      .toggle(Lang.t(player, "lobby.create.adventure"), {
        defaultValue: config.adventureModeEnabled ?? false,
      })
      .show(player);
    if (res.canceled) return this.showRegionDetails(player, region);
    const [
      blockBreak,
      blockPlace,
      entityInteraction,
      interactiveBlocks,
      farmland,
      restrictedItems,
      antiBow,
      pvp,
      damageProtection,
      explosions,
      antiFly,
      adminBypass,
      adminTag,
      overworld,
      nether,
      theEnd,
      lobbyInv,
      adventureMode,
    ] = res.formValues;
    if (lobbyInv && !isShulkerTrackingEnabled()) {
      player.sendMessage(Lang.t(player, "lobby.shulker.warn_disabled"));
    }
    config.blockBreakProtection = blockBreak;
    config.blockPlaceProtection = blockPlace;
    config.interactionProtection = entityInteraction;
    config.entityInteractionProtection = entityInteraction;
    config.interactiveBlocksProtection = interactiveBlocks;
    config.farmlandProtection = farmland;
    config.itemUseProtection = restrictedItems;
    config.restrictedItemsProtection = restrictedItems;
    config.antiBowProtection = antiBow;
    config.pvpProtection = pvp;
    config.damageProtection = damageProtection;
    config.explosionProtection = explosions;
    config.antiFly = antiFly;
    config.adminBypassEnabled = adminBypass;
    config.adminTag = adminTag || "admin";
    config.protectedDimensions = [
      overworld && "overworld",
      nether && "nether",
      theEnd && "the_end",
    ].filter(Boolean);
    config.lobbyInventoryEnabled = lobbyInv;
    config.adventureModeEnabled = adventureMode;
    saveRegionConfig(region.id, config);
    player.sendMessage(Lang.t(player, "lobby.settings.msg.updated"));
    this.showRegionDetails(player, region);
  }
  static async showDeleteConfirmation(player, region) {
    const res = await new ModalFormData()
      .title(Lang.t(player, "lobby.delete.title"))
      .textField(Lang.t(player, "lobby.delete.label"), "CONFIRM", { defaultValue: "" })
      .toggle(Lang.t(player, "lobby.delete.confirm"), { defaultValue: false })
      .show(player);
    if (res.canceled || res.formValues[0] !== "CONFIRM" || !res.formValues[1])
      return this.showRegionDetails(player, region);
    this.visualizeRegion(region);
    world
      .getPlayers()
      .forEach(
        (p) =>
          playerAreas.get(p.id)?.regionId === region.id &&
          sendProtectionMessage(p, Lang.t(p, "lobby.delete.warn")),
      );
    if (this.removeProtectedRegion(region.id)) {
      player.sendMessage(Lang.t(player, "lobby.delete.msg"));
      system.runTimeout(() => world.getPlayers().forEach(checkPlayerRegion), 5);
      this.showRegionsList(player);
    } else {
      player.sendMessage(Lang.t(player, "lobby.err.failed"));
      this.showRegionDetails(player, region);
    }
  }
}
system.afterEvents.scriptEventReceive.subscribe((e) => {
  if (e.id === "lobbyprotect:init") LobbyProtection.init();
  if (e.id === "lobbyprotect:menu" && e.sourceEntity)
    LobbyProtectMenu(e.sourceEntity);
});
system.runTimeout(() => {
  try {
    LobbyProtection.init();
  } catch { }
}, 20);
export function LobbyProtectMenu(player) {
  const t = getLobbyConfig().adminTag || "admin";
  if (!player.getTags().includes(t))
    return player.sendMessage(Lang.t(player, "lobby.err.access", t));
  LobbyProtection.showMainMenu(player);
}
system.runInterval(() => {
  try {
    const players = world
      .getPlayers()
      .filter((p) => p.getTags().some((t) => t.startsWith("loadchunck`")));
    if (!players.length) return;
    players.forEach((p) => {
      const tag = p.getTags().find((t) => t.startsWith("loadchunck`"));
      try {
        const { x, z } = JSON.parse(tag.split("`")[1]);
        let i = 320,
          block = p.dimension.getBlock({ x, y: i, z });
        while (i >= -64 && block && (block.isAir || i === 320)) {
          i--;
          block = p.dimension.getBlock({ x, y: i, z });
        }
        if (i >= -64 && block) {
          const y = Math.round(block.y + 1);
          p.teleport(
            { x: block.x + 0.5, y, z: block.z + 0.5 },
            { dimension: world.getDimension("overworld") },
          );
          p.removeTag(tag);
          const old = p.getTags().find((t) => t.startsWith("oldchunck`"));
          if (old) p.removeTag(old);
          p.onScreenDisplay.setTitle("§aTeleport Success!");
          p.onScreenDisplay.updateSubtitle(
            `§fTo §bX: ${Math.round(block.x + 0.5)} Y: ${y} Z: ${Math.round(block.z + 0.5)}`,
          );
          try {
            p.runCommand("playsound mob.endermen.portal @s ~ ~ ~ 1 1 1");
          } catch { }
        }
      } catch { }
    });
  } catch { }
}, 20);
world.beforeEvents.playerLeave.subscribe(({ player }) => {
  const tag = player.getTags().find((k) => k.startsWith("loadchunck`"));
  if (!tag) return;
  system.run(() => {
    player.removeTag(tag);
    const oldTag = player.getTags().find((k) => k.startsWith("oldchunck`"));
    if (oldTag) {
      const { x, y, z, dim } = JSON.parse(oldTag.split("`")[1]);
      player.teleport({ x, y, z }, { dimension: world.getDimension(dim) });
      player.removeTag(oldTag);
      player.addTag("unload");
    }
  });
});
export { LobbyProtectMenu as lobbyProtectMenu };
