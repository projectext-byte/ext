import {
  world,
  ActionFormData,
  ModalFormData,
  MessageFormData,
} from "../../core.js";
import { clanDB } from "../../function/getClan.js";
import { GlobalConfig } from "../../function/GlobalConfig.js";
const DEFAULT_THRESHOLDS = [0, 5, 10, 20, 35, 50];
const DEFAULT_MAX_MEMBERS = 20;
const DEFAULT_MAX_NAME_LENGTH = 16;
const DEFAULT_DESC = "Welcome to our clan!";
const DEFAULT_JOIN_MSG = "§a{player} has joined the clan!";
const DEFAULT_LEAVE_MSG = "§c{player} has left the clan.";
const DEFAULT_COLOR = "§f";
const DEFAULT_MAX_MOD_INVITES = 5;
const DEFAULT_CREATION_COST = 0;
const DEFAULT_CREATION_ENABLED = false;
const DEFAULT_CREATION_CURRENCY = "money";
function getClanLevelThresholds() {
  const raw = GlobalConfig.get("clanLevelThresholds");
  if (!raw) return [...DEFAULT_THRESHOLDS];
  try {
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(arr)) return arr;
  } catch { }
  return [...DEFAULT_THRESHOLDS];
}
function setClanLevelThresholds(arr) {
  GlobalConfig.set("clanLevelThresholds", arr);
}
export function getMaxClanMembers() {
  return parseInt(
    GlobalConfig.get("clanMaxMembers") ?? DEFAULT_MAX_MEMBERS,
  );
}
function setMaxClanMembers(val) {
  GlobalConfig.set("clanMaxMembers", val);
}
function getMaxClanNameLength() {
  return parseInt(
    GlobalConfig.get("clanMaxNameLength") ?? DEFAULT_MAX_NAME_LENGTH,
  );
}
function setMaxClanNameLength(val) {
  GlobalConfig.set("clanMaxNameLength", val);
}
function getDefaultClanDesc() {
  return GlobalConfig.get("clanDefaultDesc") ?? DEFAULT_DESC;
}
function setDefaultClanDesc(val) {
  GlobalConfig.set("clanDefaultDesc", val);
}
function getJoinMsg() {
  return GlobalConfig.get("clanJoinMsg") ?? DEFAULT_JOIN_MSG;
}
function setJoinMsg(val) {
  GlobalConfig.set("clanJoinMsg", val);
}
function getLeaveMsg() {
  return GlobalConfig.get("clanLeaveMsg") ?? DEFAULT_LEAVE_MSG;
}
function setLeaveMsg(val) {
  GlobalConfig.set("clanLeaveMsg", val);
}
function getClanNameColor() {
  return GlobalConfig.get("clanNameColor") ?? DEFAULT_COLOR;
}
function setClanNameColor(val) {
  GlobalConfig.set("clanNameColor", val);
}
export function getMaxModInvites() {
  return parseInt(
    GlobalConfig.get("clanMaxModInvites") ?? DEFAULT_MAX_MOD_INVITES,
  );
}
function setMaxModInvites(val) {
  GlobalConfig.set("clanMaxModInvites", val);
}
export function getClanCreationCost() {
  return parseInt(GlobalConfig.get("clanCreationCost") ?? DEFAULT_CREATION_COST);
}
function setClanCreationCost(val) {
  GlobalConfig.set("clanCreationCost", val);
}
export function getClanCreationEnabled() {
  return GlobalConfig.get("clanCreationEnabled") ?? DEFAULT_CREATION_ENABLED;
}
function setClanCreationEnabled(val) {
  GlobalConfig.set("clanCreationEnabled", val);
}
export function getClanCreationCurrency() {
  return GlobalConfig.get("clanCreationCurrency") ?? DEFAULT_CREATION_CURRENCY;
}
function setClanCreationCurrency(val) {
  GlobalConfig.set("clanCreationCurrency", val);
}
export function showClanAdminMenu(player) {
  const form = new ActionFormData()
    .title("Clan Admin Settings")
    .body("§eManage all clan system settings below.")
    .button("Edit Level Member Requirements", "textures/ui/icon_setting")
    .button("Set Max Clan Members", "textures/ui/icon_setting")
    .button("Set Max Clan Name Length", "textures/ui/icon_setting")
    .button("Set Default Clan Description", "textures/ui/icon_setting")
    .button("Set Join/Leave Messages", "textures/ui/icon_setting")
    .button("Set Clan Name Color", "textures/ui/icon_setting")
    .button("Set Max Invites for Mods", "textures/ui/icon_setting")
    .button("Set Creation Cost", "textures/ui/icon_setting")
    .button("View Clan Statistics", "textures/ui/icon_setting")
    .button("Delete Clan", "textures/ui/icon_trash")
    .button("Close", "textures/ui/arrow_left");
  form.show(player).then((res) => {
    if (res.canceled || res.selection === 10) return;
    switch (res.selection) {
      case 0:
        showEditThresholdsMenu(player, getClanLevelThresholds());
        break;
      case 1:
        showSetMaxMembersMenu(player);
        break;
      case 2:
        showSetMaxNameLengthMenu(player);
        break;
      case 3:
        showSetDefaultDescMenu(player);
        break;
      case 4:
        showSetJoinLeaveMsgMenu(player);
        break;
      case 5:
        showSetNameColorMenu(player);
        break;
      case 6:
        showSetMaxModInvitesMenu(player);
        break;
      case 7:
        showSetCreationCostMenu(player);
        break;
      case 8:
        showClanStatsMenu(player);
        break;
      case 9:
        showDeleteClanMenu(player);
        break;
    }
  }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:clan:admin] promise error:", String(error?.stack ?? error)); } catch {} });
}
function showEditThresholdsMenu(player, thresholds) {
  let form = new ModalFormData().title("Edit Clan Level Requirements §t§p§a");
  for (let i = 1; i < thresholds.length; i++) {
    form = form.textField(
      ` Number of members needed for this level Level ${i + 1}`,
      `Req. Members (Number of members needed for this level)`,
      { defaultValue: thresholds[i].toString() },
    );
  }
  form.submitButton("Save");
  form.show(player).then((res) => {
    if (res.canceled) {
      showClanAdminMenu(player);
      return;
    }
    let newThresholds = [0];
    for (let i = 0; i < thresholds.length - 1; i++) {
      const val = parseInt(res.formValues[i]);
      if (isNaN(val) || val < 0) {
        player.sendMessage(
          `§cInvalid value for level ${i + 2}. Must be a non-negative number.`,
        );
        showEditThresholdsMenu(player, thresholds);
        return;
      }
      newThresholds.push(val);
    }
    setClanLevelThresholds(newThresholds);
    player.sendMessage("§aClan level requirements updated!");
    showClanAdminMenu(player);
  }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:clan:admin] promise error:", String(error?.stack ?? error)); } catch {} });
}
function showSetMaxMembersMenu(player) {
  new ModalFormData()
    .title("Set Max Clan Members §t§p§a")
    .textField("Max Members", "Number", {
      defaultValue: getMaxClanMembers().toString(),
    })
    .submitButton("Save")
    .show(player)
    .then((res) => {
      if (res.canceled) return showClanAdminMenu(player);
      const val = parseInt(res.formValues[0]);
      if (isNaN(val) || val < 1) {
        player.sendMessage("§cInvalid value. Must be a positive number.");
        return showSetMaxMembersMenu(player);
      }
      setMaxClanMembers(val);
      player.sendMessage("§aMax clan members updated!");
      showClanAdminMenu(player);
    }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:clan:admin] promise error:", String(error?.stack ?? error)); } catch {} });
}
function showSetMaxNameLengthMenu(player) {
  new ModalFormData()
    .title("Set Max Clan Name Length §t§p§a")
    .textField("Max Name Length", "Number", {
      defaultValue: getMaxClanNameLength().toString(),
    })
    .submitButton("Save")
    .show(player)
    .then((res) => {
      if (res.canceled) return showClanAdminMenu(player);
      const val = parseInt(res.formValues[0]);
      if (isNaN(val) || val < 3) {
        player.sendMessage("§cInvalid value. Must be at least 3.");
        return showSetMaxNameLengthMenu(player);
      }
      setMaxClanNameLength(val);
      player.sendMessage("§aMax clan name length updated!");
      showClanAdminMenu(player);
    }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:clan:admin] promise error:", String(error?.stack ?? error)); } catch {} });
}
function showSetDefaultDescMenu(player) {
  new ModalFormData()
    .title("Set Default Clan Description §t§p§a")
    .textField("Default Description", "Text", {
      defaultValue: getDefaultClanDesc(),
    })
    .submitButton("Save")
    .show(player)
    .then((res) => {
      if (res.canceled) return showClanAdminMenu(player);
      setDefaultClanDesc(res.formValues[0] || DEFAULT_DESC);
      player.sendMessage("§aDefault clan description updated!");
      showClanAdminMenu(player);
    }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:clan:admin] promise error:", String(error?.stack ?? error)); } catch {} });
}
function showSetJoinLeaveMsgMenu(player) {
  new ModalFormData()
    .title("Set Join/Leave Messages §t§p§a")
    .textField("Join Message", "Text", { defaultValue: getJoinMsg() })
    .textField("Leave Message", "Text", { defaultValue: getLeaveMsg() })
    .submitButton("Save")
    .show(player)
    .then((res) => {
      if (res.canceled) return showClanAdminMenu(player);
      setJoinMsg(res.formValues[0] || DEFAULT_JOIN_MSG);
      setLeaveMsg(res.formValues[1] || DEFAULT_LEAVE_MSG);
      player.sendMessage("§aJoin/Leave messages updated!");
      showClanAdminMenu(player);
    }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:clan:admin] promise error:", String(error?.stack ?? error)); } catch {} });
}
function showSetNameColorMenu(player) {
  new ModalFormData()
    .title("Set Clan Name Color §t§p§a")
    .textField("Color Code (e.g. §a, §b, §c)", "Text", {
      defaultValue: getClanNameColor(),
    })
    .submitButton("Save")
    .show(player)
    .then((res) => {
      if (res.canceled) return showClanAdminMenu(player);
      setClanNameColor(res.formValues[0] || DEFAULT_COLOR);
      player.sendMessage("§aClan name color updated!");
      showClanAdminMenu(player);
    }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:clan:admin] promise error:", String(error?.stack ?? error)); } catch {} });
}
function showSetMaxModInvitesMenu(player) {
  new ModalFormData()
    .title("Set Max Invites for Mods §t§p§a")
    .textField("Max Invites", "Number", {
      defaultValue: getMaxModInvites().toString(),
    })
    .submitButton("Save")
    .show(player)
    .then((res) => {
      if (res.canceled) return showClanAdminMenu(player);
      const val = parseInt(res.formValues[0]);
      if (isNaN(val) || val < 0) {
        player.sendMessage("§cInvalid value. Must be a non-negative number.");
        return showSetMaxModInvitesMenu(player);
      }
      setMaxModInvites(val);
      player.sendMessage("§aMax invites for mods updated!");
      showClanAdminMenu(player);
    }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:clan:admin] promise error:", String(error?.stack ?? error)); } catch {} });
}
function showSetCreationCostMenu(player) {
  new ModalFormData()
    .title("Set Clan Creation Cost §t§p§a")
    .toggle("Enable Paid Creation", { defaultValue: getClanCreationEnabled() })
    .textField("Cost Amount", "Number", {
      defaultValue: getClanCreationCost().toString(),
    })
    .textField("Currency Objective (e.g. money, coin)", "Scoreboard Objective", {
      defaultValue: getClanCreationCurrency(),
    })
    .submitButton("Save")
    .show(player)
    .then((res) => {
      if (res.canceled) return showClanAdminMenu(player);
      const [enabled, costStr, currency] = res.formValues;
      const cost = parseInt(costStr);
      if (isNaN(cost) || cost < 0) {
        player.sendMessage("§cInvalid cost. Must be a non-negative number.");
        return showSetCreationCostMenu(player);
      }
      setClanCreationEnabled(enabled);
      setClanCreationCost(cost);
      setClanCreationCurrency(currency || "money");
      player.sendMessage("§aClan creation cost settings updated!");
      showClanAdminMenu(player);
    }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:clan:admin] promise error:", String(error?.stack ?? error)); } catch {} });
}
function showClanStatsMenu(player) {
  let totalClans = 0,
    totalMembers = 0;
  for (const key of clanDB.keys()) {
    if (key.startsWith("clan_") && !key.endsWith("_settings")) {
      const clan = clanDB.get(key);
      if (clan && Array.isArray(clan.members)) {
        totalClans++;
        totalMembers += clan.members.length;
      }
    }
  }
  const avg = totalClans ? (totalMembers / totalClans).toFixed(2) : 0;
  new MessageFormData()
    .title("Clan Statistics")
    .body(
      `Total Clans: §a${totalClans}\nTotal Members: §a${totalMembers}\nAvg Members/Clan: §a${avg}`,
    )
    .button1("Back")
    .show(player)
    .then(() => showClanAdminMenu(player)).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:clan:admin] promise error:", String(error?.stack ?? error)); } catch {} });
}
function showDeleteClanMenu(player) {
  const clans = [];
  for (const key of clanDB.keys()) {
    if (key.startsWith("clan_") && !key.endsWith("_settings")) {
      const clan = clanDB.get(key);
      if (clan && Array.isArray(clan.members)) {
        const clanId = key.slice("clan_".length);
        clans.push({ clanId, name: clan.name || clanId, memberCount: clan.members.length });
      }
    }
  }
  if (clans.length === 0) {
    new MessageFormData()
      .title("Delete Clan")
      .body("§cNo clans found to delete.")
      .button1("Back")
      .show(player)
      .then(() => showClanAdminMenu(player)).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:clan:admin] promise error:", String(error?.stack ?? error)); } catch {} });
    return;
  }
  const form = new ActionFormData()
    .title("Delete Clan")
    .body("§cSelect a clan to delete. This action cannot be undone!");
  clans.forEach((clan) => {
    form.button(`${clan.name} §7(${clan.memberCount} members)`, "textures/ui/icon_trash");
  });
  form.button("Back", "textures/ui/arrow_left");
  form.show(player).then((res) => {
    if (res.canceled || res.selection === clans.length) {
      showClanAdminMenu(player);
      return;
    }
    const selected = clans[res.selection];
    showDeleteConfirmMenu(player, selected);
  }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:clan:admin] promise error:", String(error?.stack ?? error)); } catch {} });
}
function showDeleteConfirmMenu(player, clan) {
  new MessageFormData()
    .title("Confirm Delete Clan")
    .body(`§cAre you sure you want to delete this clan?\n\n§fClan Name: §e${clan.name}\n§fMembers: §e${clan.memberCount}\n\n§cThis action cannot be undone!`)
    .button1("§cYes, Delete")
    .button2("Cancel")
    .show(player)
    .then((res) => {
      if (res.canceled || res.selection === 1) {
        showDeleteClanMenu(player);
        return;
      }
      deleteClan(player, clan);
    }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:clan:admin] promise error:", String(error?.stack ?? error)); } catch {} });
}
function deleteClan(player, clan) {
  const clanData = clanDB.get(`clan_${clan.clanId}`);
  if (!clanData) {
    player.sendMessage("§cClan not found!");
    showDeleteClanMenu(player);
    return;
  }
  for (const member of clanData.members) {
    clanDB.delete(`player_${member}`);
  }
  clanDB.delete(`clan_${clan.clanId}`);
  clanDB.delete(`clan_${clan.clanId}_settings`);
  for (const key of clanDB.keys()) {
    if (key.startsWith(`join_request_${clan.clanId}_`)) {
      clanDB.delete(key);
    }
  }
  player.sendMessage(`§aClan '${clan.name}' has been deleted successfully!`);
  showDeleteClanMenu(player);
}
export function showAllClansMenu(player) {
  const clans = [];
  for (const key of clanDB.keys()) {
    if (key.startsWith("clan_") && !key.endsWith("_settings")) {
      const clan = clanDB.get(key);
      if (clan && Array.isArray(clan.members)) {
        const clanId = key.slice("clan_".length);
        clans.push({ clanId, name: clan.name || clanId, memberCount: clan.members.length, level: clan.level || 1 });
      }
    }
  }
  if (clans.length === 0) {
    new MessageFormData()
      .title("All Clans")
      .body("§7No clans found.")
      .button1("Back")
      .show(player)
      .then(() => showClanAdminMenu(player)).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:clan:admin] promise error:", String(error?.stack ?? error)); } catch {} });
    return;
  }
  const form = new ActionFormData()
    .title("All Clans")
    .body(`§eTotal Clans: §f${clans.length}`);
  clans.forEach((clan) => {
    form.button(`${clan.name}\n§7Level: ${clan.level} | Members: ${clan.memberCount}`, "textures/ui/icon_multiplayer");
  });
  form.button("Back", "textures/ui/arrow_left");
  form.show(player).then((res) => {
    if (res.canceled || res.selection === clans.length) {
      showClanAdminMenu(player);
      return;
    }
    showAllClansMenu(player);
  }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:clan:admin] promise error:", String(error?.stack ?? error)); } catch {} });
}
