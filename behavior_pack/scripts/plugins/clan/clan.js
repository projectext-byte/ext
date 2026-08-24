import {
  system,
  world,
  ActionFormData,
  ModalFormData,
  MessageFormData,
} from "../../core.js";
import { getMaxClanMembers, getMaxModInvites, getClanCreationCost, getClanCreationEnabled, getClanCreationCurrency } from "./admin.js";
import { getFullMoney, removeMoney, formatMoneyValue } from "../../function/moneySystem.js";
import { getScore } from "../../function/getScore.js";
import { clanDB } from "../../function/getClan.js";
import { showClanChatUI } from "./chat_clan.js";
import { showClanInfoMenu } from "./clan_info.js";
const MAX_CLAN_NAME_LENGTH = 32;
const MAX_DISPLAY_NAME_LENGTH = 16;
function genClanId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id = "";
  for (let i = 0; i < 6; i++)
    id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}
function stripColorCodes(text) {
  return text.replace(/§[0-9a-fklmnor]/g, "");
}
function hasValidColorCodes(text) {
  const colorCodePattern = /§[0-9a-fklmnor]/g;
  const matches = text.match(colorCodePattern);
  if (!matches) return true;
  for (let i = 0; i < text.length - 1; i++) {
    if (text[i] === "§") {
      const nextChar = text[i + 1];
      if (!/[0-9a-fklmnor]/.test(nextChar)) {
        return false;
      }
    }
  }
  return true;
}
function isValidClanName(name) {
  if (!name) return false;
  if (!hasValidColorCodes(name)) return false;
  const strippedName = stripColorCodes(name);
  if (strippedName.length < 3 || strippedName.length > MAX_DISPLAY_NAME_LENGTH)
    return false;
  if (name.length > MAX_CLAN_NAME_LENGTH) return false;
  if (!/^[a-zA-Z0-9 _§-]+$/.test(name)) return false;
  if (strippedName.trim() !== strippedName) return false;
  return true;
}
function getClanData(clanId) {
  const data = clanDB.get(`clan_${clanId}`);
  if (!data || !Array.isArray(data.members)) return null;
  return data;
}
export function joinClan(player, clanId) {
  const clan = getClanData(clanId);
  if (!clan) return false;
  if (clan.members.includes(player.name)) return false;
  if (clan.members.length >= getMaxClanMembers()) {
    if (typeof player.sendMessage === "function") {
      player.sendMessage("§cClan is full!");
    }
    return false;
  }
  clan.members.push(player.name);
  clanDB.set(`clan_${clanId}`, clan);
  clanDB.set(`player_${player.name}`, {
    clanId,
    rank: "member",
    inviteCount: 0,
  });
  for (const key of clanDB.keys()) {
    if (key.startsWith(`join_request_`) && key.endsWith(`_${player.name}`)) {
      clanDB.delete(key);
    }
  }
  return true;
}
export function leaveClan(player) {
  const playerData = clanDB.get(`player_${player.name}`);
  const clanId = playerData?.clanId;
  if (!clanId) return false;
  const clan = getClanData(clanId);
  if (!clan) return false;
  if (playerData.rank === "owner") {
    player.sendMessage(
      "§cOwner must disband or transfer ownership before leaving.",
    );
    return false;
  }
  clan.members = clan.members.filter((name) => name !== player.name);
  if (clan.members.length === 0) {
    clanDB.delete(`clan_${clanId}`);
    clanDB.delete(`clan_${clanId}_settings`);
  } else {
    clanDB.set(`clan_${clanId}`, clan);
  }
  clanDB.delete(`player_${player.name}`);
  return true;
}
export function showClanMenu(player) {
  const playerData = clanDB.get(`player_${player.name}`);
  const clanId = playerData?.clanId;
  const inviteData = clanDB.get(`invite_${player.name}`);
  if (inviteData) {
    showInviteApprovalMenu(player, inviteData);
    return;
  }
  if (!clanId) {
    const joinRequestData = getPendingJoinRequest(player.name);
    if (joinRequestData) {
      showJoinRequestStatusMenu(player, joinRequestData);
      return;
    }
    const menu = new ActionFormData()
      .title("Clan Menu")
      .body("Welcome to the Clan Menu!\nChoose an option below to get started.")
      .button("Request to Join Clan", "textures/ui/icon_multiplayer")
      .button("Create Clan", "textures/ui/color_plus")
      .button("Back", "textures/ui/arrow_left");
    menu.show(player).then((res) => {
      if (res.canceled || res.selection === 2) return;
      if (res.selection === 0) joinClanForm(player);
      if (res.selection === 1) createClanForm(player);
    }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:clan:clan] promise error:", String(error?.stack ?? error)); } catch {} });
    return;
  }
  const clan = getClanData(clanId);
  if (!clan) {
    player.sendMessage("§cClan data not found. It may have been deleted.");
    clanDB.delete(`player_${player.name}`);
    showClanMenu(player);
    return;
  }
  const isOwner = playerData.rank === "owner";
  const isMod = playerData.rank === "mod";
  const pendingRequestsCount = getPendingJoinRequestsCount(clanId);
  const form = new ActionFormData()
    .title(`Clan: ${clan.name || clanId}`)
    .body(
      isOwner && pendingRequestsCount > 0
        ? `§eYou have ${pendingRequestsCount} pending join request(s)!`
        : "",
    )
    .button("Clan Info", "textures/ui/creative_icon")
    .button("Members", "textures/ui/icon_multiplayer");
  if (isOwner || isMod) form.button("Invite Member", "textures/ui/icon_panda");
  form.button("Clan Chat", "textures/ui/chat_send");
  form.button("Leave Clan", "textures/ui/cancel");
  if (isOwner) {
    form.button(
      "Manage Join Requests" +
      (pendingRequestsCount > 0 ? ` §e(${pendingRequestsCount})` : ""),
      "textures/ui/icon_panda",
    );
    form.button("Disband Clan §7(Owner Only)§r", "textures/ui/icon_lock");
    form.button(
      "Transfer Ownership §7(Owner Only)§r",
      "textures/ui/dressing_room_customization",
    );
    form.button(
      "Clan Settings §7(Owner Only)§r",
      "textures/ui/automation_glyph_color",
    );
    form.button(
      "Promote/Demote Member §7(Owner Only)§r",
      "textures/ui/filledStar",
    );
    form.button("Kick Member §7(Owner Only)§r", "textures/ui/ErrorGlyph_small");
    form.button("Color Guide", "textures/ui/color_plus");
    form.button("Docs", "textures/ui/creative_icon");
  } else {
    form.button("Color Guide", "textures/ui/color_plus");
  }
  form.show(player).then((res) => {
    if (res.canceled) return;
    const hasInvite = isOwner || isMod;
    switch (res.selection) {
      case 0:
        showClanInfo(player, clan);
        break;
      case 1:
        showMemberList(player, clan);
        break;
      case 2:
        if (hasInvite) {
          inviteMemberForm(player, clanId);
        } else {
          showClanChatUI(player);
        }
        break;
      case 3:
        if (hasInvite) {
          showClanChatUI(player);
        } else {
          handleLeaveClan(player);
        }
        break;
      case 4:
        if (hasInvite) {
          handleLeaveClan(player);
        } else if (isOwner) {
          showJoinRequestsMenu(player, clan);
        }
        break;
      default:
        if (isOwner) {
          const ownerOffset = hasInvite ? 5 : 4;
          if (res.selection === ownerOffset) showJoinRequestsMenu(player, clan);
          else if (res.selection === ownerOffset + 1) handleDisbandClan(player);
          else if (res.selection === ownerOffset + 2)
            transferOwnershipForm(player, clan);
          else if (res.selection === ownerOffset + 3)
            clanSettingsForm(player, clan);
          else if (res.selection === ownerOffset + 4)
            promoteDemoteMemberForm(player, clan);
          else if (res.selection === ownerOffset + 5)
            kickMemberForm(player, clan);
          else if (res.selection === ownerOffset + 6) showColorGuide(player);
          else if (res.selection === ownerOffset + 7) showClanInfoMenu(player);
        } else {
          const nonOwnerOffset = hasInvite ? 5 : 4;
          if (res.selection === nonOwnerOffset) showColorGuide(player);
        }
        break;
    }
  }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:clan:clan] promise error:", String(error?.stack ?? error)); } catch {} });
}
function showClanInfo(player, clan) {
  new MessageFormData()
    .title("Clan Info")
    .body(
      `Name: ${clan.name}\nDescription: ${clan.desc || "-"}\nLevel: ${clan.level}\nXP: ${clan.xp}\nMembers: ${clan.members.length} / ${getMaxClanMembers()}`,
    )
    .button1("Close")
    .button2("Back")
    .show(player)
    .then(({ selection }) => {
      if (selection === 1) showClanMenu(player);
    }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:clan:clan] promise error:", String(error?.stack ?? error)); } catch {} });
}
function showMemberList(player, clan) {
  const max = getMaxClanMembers();
  let owners = [];
  let mods = [];
  let members = [];
  for (const member of clan.members) {
    const pdata = clanDB.get(`player_${member}`);
    const rank = pdata?.rank || "member";
    if (rank === "owner") owners.push(member);
    else if (rank === "mod") mods.push(member);
    else members.push(member);
  }
  const memberList = [];
  if (owners.length > 0) {
    memberList.push("§eOwners:");
    memberList.push(...owners.map((n) => `§f- ${n}`));
  }
  if (mods.length > 0) {
    memberList.push("\n§bMods:");
    memberList.push(...mods.map((n) => `§f- ${n}`));
  }
  if (members.length > 0) {
    memberList.push("\n§aMembers:");
    memberList.push(...members.map((n) => `§f- ${n}`));
  }
  const listText =
    memberList.length > 0 ? memberList.join("\n") : "No members yet.";
  new MessageFormData()
    .title("Member List")
    .body(`Members (${clan.members.length} / ${max}):\n` + listText)
    .button1("Close")
    .button2("Back")
    .show(player)
    .then(({ selection }) => {
      if (selection === 1) showClanMenu(player);
    }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:clan:clan] promise error:", String(error?.stack ?? error)); } catch {} });
}
function inviteMemberForm(player, clanId) {
  const playerData = clanDB.get(`player_${player.name}`);
  if (playerData.rank === "mod") {
    const maxInvites = getMaxModInvites();
    if (playerData.inviteCount >= maxInvites) {
      player.sendMessage(
        `§cYou have reached your invite limit of ${maxInvites}.`,
      );
      showClanMenu(player);
      return;
    }
  }
  const onlinePlayers = world.getPlayers();
  const candidates = onlinePlayers.filter((p) => {
    const pdata = clanDB.get(`player_${p.name}`);
    return !pdata || !pdata.clanId;
  });
  if (candidates.length === 0) {
    new MessageFormData()
      .title("Invite Member")
      .body("No online players to invite.")
      .button1("Close")
      .button2("Back")
      .show(player)
      .then(({ selection }) => {
        if (selection === 1) showClanMenu(player);
      }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:clan:clan] promise error:", String(error?.stack ?? error)); } catch {} });
    return;
  }
  const inviteForm = new ActionFormData().title("Invite Member");
  for (const p of candidates) {
    inviteForm.button(p.name, "textures/ui/friend1_black_outline_2x");
  }
  inviteForm.button("Cancel", "textures/ui/cancel");
  inviteForm.show(player).then((res) => {
    if (res.canceled || res.selection === candidates.length) {
      showClanMenu(player);
      return;
    }
    const targetPlayer = candidates[res.selection];
    if (!targetPlayer) {
      player.sendMessage("§cPlayer not found or offline.");
      showClanMenu(player);
      return;
    }
    clanDB.set(`invite_${targetPlayer.name}`, {
      inviter: player.name,
      clanId: clanId,
    });
    player.sendMessage(`§aInvitation sent to ${targetPlayer.name}!`);
    targetPlayer.sendMessage(
      `§aYou have been invited to join a clan by ${player.name}. Check your Clan Menu to accept or decline.`,
    );
    showClanMenu(player);
  }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:clan:clan] promise error:", String(error?.stack ?? error)); } catch {} });
  if (playerData.rank === "mod") {
    playerData.inviteCount = (playerData.inviteCount || 0) + 1;
    clanDB.set(`player_${player.name}`, playerData);
  }
}
function createClanForm(player, errorMsg = "", errorField = "") {
  const isEnabled = getClanCreationEnabled();
  const cost = getClanCreationCost();
  const currency = getClanCreationCurrency();
  let costLabel = "";
  if (isEnabled && cost > 0) {
    if (currency === "money") {
      try {
        costLabel = `\n§r§7Cost: §a$${formatMoneyValue(BigInt(cost))}`;
      } catch {
        costLabel = `\n§r§7Cost: §a$${cost}`;
      }
    } else {
      costLabel = `\n§r§7Cost: §6${cost} ${currency}`;
    }
  }
  const form = new ModalFormData()
    .title("Create Clan §t§p§a")
    .textField(
      "Clan Name" + costLabel +
      (errorField === "name" && errorMsg ? ` §c(${errorMsg})` : ""),
      "Enter clan name (supports colors: §aGreen§r, §cRed§r, etc.)",
    )
    .textField(
      "Description" +
      (errorField === "desc" && errorMsg ? ` §c(${errorMsg})` : ""),
      "Optional (supports colors)",
    )
    .submitButton("Create Clan");
  form.show(player).then((res) => {
    if (res.canceled) return;
    const [clanName, desc] = res.formValues;
    if (!isValidClanName(clanName)) {
      const strippedLength = stripColorCodes(clanName).length;
      createClanForm(
        player,
        `Display name must be 3-${MAX_DISPLAY_NAME_LENGTH} chars. Current: ${strippedLength}. Use valid color codes (§0-9,a-f,k-o,r)`,
        "name",
      );
      return;
    }
    if (isEnabled && cost > 0) {
      if (currency === "money") {
        try {
          if (getFullMoney(player) < BigInt(cost)) {
            createClanForm(player, "Insufficient money!", "name");
            return;
          }
        } catch {
          createClanForm(player, "Error checking money!", "name");
          return;
        }
      } else {
        const val = getScore(player, currency) || 0;
        if (val < cost) {
          createClanForm(player, `Insufficient ${currency}!`, "name");
          return;
        }
      }
    }
    const ok = createClan(player, clanName, desc || "");
    if (!ok) {
      createClanForm(
        player,
        "Failed to create clan. You may already have a clan or the name is taken.",
        "name",
      );
      return;
    }
    if (isEnabled && cost > 0) {
      if (currency === "money") {
        removeMoney(player, cost);
      } else {
        try {
          player.runCommand(`scoreboard players remove @s "${currency}" ${cost}`);
        } catch { }
      }
    }
    player.sendMessage(`§aClan '${clanName}§a' created!`);
    showClanMenu(player);
  }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:clan:clan] promise error:", String(error?.stack ?? error)); } catch {} });
}
function createClan(player, clanName, desc) {
  const playerData = clanDB.get(`player_${player.name}`);
  if (playerData?.clanId) return false;
  for (const key of clanDB.keys()) {
    if (!key.startsWith("clan_")) continue;
    const data = clanDB.get(key);
    if (
      data &&
      data.name &&
      data.name.trim().toLowerCase() === clanName.trim().toLowerCase()
    ) {
      return false;
    }
  }
  let clanId;
  do {
    clanId = genClanId();
  } while (clanDB.get(`clan_${clanId}`));
  const clanData = {
    name: clanName.trim(),
    desc: desc,
    members: [player.name],
    level: 1,
    xp: 0,
  };
  clanDB.set(`clan_${clanId}`, clanData);
  clanDB.set(`player_${player.name}`, {
    clanId,
    rank: "owner",
    inviteCount: 0,
  });
  return true;
}
export function getClanLeaderboardData() {
  const clans = [];
  for (const key of clanDB.keys()) {
    if (key.startsWith("clan_") && !key.endsWith("_settings")) {
      const clanId = key.slice("clan_".length);
      const clan = clanDB.get(key);
      if (!clan || !Array.isArray(clan.members)) continue;
      const members = clan.members || [];
      const online = members.filter((n) =>
        world.getPlayers().some((p) => p.name === n),
      );
      clans.push({
        clanId,
        name: clan.name || clanId,
        tag: clanId,
        level: clan.level || 1,
        xp: clan.xp || 0,
        memberCount: members.length,
        onlineCount: online.length,
      });
    }
  }
  return clans.sort(
    (a, b) => b.level - a.level || b.memberCount - a.memberCount,
  );
}
function joinClanForm(player) {
  const playerData = clanDB.get(`player_${player.name}`);
  if (playerData?.clanId) {
    player.sendMessage("§cYou are already in a clan!");
    showClanMenu(player);
    return;
  }
  const clans = [];
  for (const key of clanDB.keys()) {
    if (key.startsWith("clan_") && !key.endsWith("_settings")) {
      const clanId = key.slice("clan_".length);
      const clan = clanDB.get(key);
      if (!clan || !Array.isArray(clan.members)) continue;
      if (clan.members.length >= getMaxClanMembers()) continue;
      if (clan.members.includes(player.name)) continue;
      const existingRequest = clanDB.get(
        `join_request_${clanId}_${player.name}`,
      );
      if (existingRequest) continue;
      let owner = "-";
      for (const member of clan.members) {
        const pdata = clanDB.get(`player_${member}`);
        if (pdata?.clanId === clanId && pdata.rank === "owner") {
          owner = member;
          break;
        }
      }
      clans.push({
        clanId,
        name: clan.name || clanId,
        owner,
        memberCount: clan.members.length,
      });
    }
  }
  if (clans.length === 0) {
    player.sendMessage("§cNo clans available to join!");
    showClanMenu(player);
    return;
  }
  const form = new ActionFormData()
    .title("Request to Join Clan")
    .body("Select a clan to send join request:");
  for (const c of clans) {
    form.button(
      `${c.name}§r\n§7Owner: §f${c.owner}§r | §7Members: §f${c.memberCount}`,
    );
  }
  form.button("Cancel");
  form.show(player).then((res) => {
    if (res.canceled || res.selection === clans.length)
      return showClanMenu(player);
    const selected = clans[res.selection];
    requestToJoinClan(player, selected.clanId, selected.name);
  }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:clan:clan] promise error:", String(error?.stack ?? error)); } catch {} });
}
function requestToJoinClan(player, clanId, clanName) {
  const playerData = clanDB.get(`player_${player.name}`);
  if (playerData?.clanId) {
    player.sendMessage("§cYou are already in a clan!");
    showClanMenu(player);
    return;
  }
  const clan = getClanData(clanId);
  if (!clan) {
    player.sendMessage("§cClan not found!");
    showClanMenu(player);
    return;
  }
  if (clan.members.length >= getMaxClanMembers()) {
    player.sendMessage("§cClan is full!");
    showClanMenu(player);
    return;
  }
  const existingRequest = clanDB.get(`join_request_${clanId}_${player.name}`);
  if (existingRequest) {
    player.sendMessage("§cYou already have a pending request for this clan!");
    showClanMenu(player);
    return;
  }
  clanDB.set(`join_request_${clanId}_${player.name}`, {
    playerName: player.name,
    clanId: clanId,
    clanName: clanName,
    timestamp: Date.now(),
    status: "pending",
  });
  player.sendMessage(
    `§aJoin request sent to clan '${clanName}'! The owner will review your request.`,
  );
  const ownerName = getClanOwner(clanId);
  if (ownerName) {
    const ownerPlayer = world.getPlayers().find((p) => p.name === ownerName);
    if (ownerPlayer) {
      ownerPlayer.sendMessage(
        `§e${player.name} has requested to join your clan '${clanName}'. Check your Clan Menu to review.`,
      );
    }
  }
  showClanMenu(player);
}
function getClanOwner(clanId) {
  const clan = getClanData(clanId);
  if (!clan) return null;
  for (const member of clan.members) {
    const pdata = clanDB.get(`player_${member}`);
    if (pdata?.clanId === clanId && pdata.rank === "owner") {
      return member;
    }
  }
  return null;
}
function getPendingJoinRequest(playerName) {
  for (const key of clanDB.keys()) {
    if (key.startsWith(`join_request_`)) {
      const request = clanDB.get(key);
      if (
        request &&
        request.playerName === playerName &&
        request.status === "pending"
      ) {
        return request;
      }
    }
  }
  return null;
}
function getPendingJoinRequestsCount(clanId) {
  let count = 0;
  for (const key of clanDB.keys()) {
    if (key.startsWith(`join_request_${clanId}_`)) {
      const request = clanDB.get(key);
      if (request && request.status === "pending") {
        count++;
      }
    }
  }
  return count;
}
function getAllPendingJoinRequests(clanId) {
  const requests = [];
  for (const key of clanDB.keys()) {
    if (key.startsWith(`join_request_${clanId}_`)) {
      const request = clanDB.get(key);
      if (request && request.status === "pending") {
        const playerData = clanDB.get(`player_${request.playerName}`);
        if (playerData?.clanId) {
          clanDB.delete(key);
          continue;
        }
        const clan = getClanData(clanId);
        if (!clan) {
          clanDB.delete(key);
          continue;
        }
        if (clan.members.includes(request.playerName)) {
          clanDB.delete(key);
          continue;
        }
        if (clan.members.length >= getMaxClanMembers()) {
          clanDB.delete(key);
          continue;
        }
        requests.push({
          key: key,
          ...request,
        });
      }
    }
  }
  return requests.sort((a, b) => a.timestamp - b.timestamp);
}
function showJoinRequestStatusMenu(player, requestData) {
  const clan = getClanData(requestData.clanId);
  if (!clan) {
    clanDB.delete(`join_request_${requestData.clanId}_${player.name}`);
    player.sendMessage("§cClan not found. Your request has been removed.");
    showClanMenu(player);
    return;
  }
  const playerData = clanDB.get(`player_${player.name}`);
  if (playerData?.clanId) {
    clanDB.delete(`join_request_${requestData.clanId}_${player.name}`);
    player.sendMessage(
      "§cYou are already in a clan. Your request has been removed.",
    );
    showClanMenu(player);
    return;
  }
  if (clan.members.includes(player.name)) {
    clanDB.delete(`join_request_${requestData.clanId}_${player.name}`);
    player.sendMessage(
      "§cYou are already a member of this clan. Your request has been removed.",
    );
    showClanMenu(player);
    return;
  }
  new MessageFormData()
    .title("Join Request Status")
    .body(
      `Your request to join clan '${requestData.clanName}' is pending.\n\nThe owner will review your request.\n\nStatus: §ePending`,
    )
    .button1("Close")
    .button2("Cancel Request")
    .show(player)
    .then(({ selection }) => {
      if (selection === 1) {
        cancelJoinRequest(player, requestData.clanId);
      } else {
        showClanMenu(player);
      }
    }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:clan:clan] promise error:", String(error?.stack ?? error)); } catch {} });
}
function cancelJoinRequest(player, clanId) {
  const requestKey = `join_request_${clanId}_${player.name}`;
  const request = clanDB.get(requestKey);
  if (request) {
    clanDB.delete(requestKey);
    player.sendMessage("§aJoin request cancelled.");
  }
  showClanMenu(player);
}
function showJoinRequestsMenu(player, clan) {
  const playerData = clanDB.get(`player_${player.name}`);
  if (playerData.rank !== "owner") {
    player.sendMessage("§cOnly the owner can manage join requests!");
    showClanMenu(player);
    return;
  }
  const requests = getAllPendingJoinRequests(
    clanDB.get(`player_${player.name}`).clanId,
  );
  if (requests.length === 0) {
    new MessageFormData()
      .title("Join Requests")
      .body("No pending join requests.")
      .button1("Close")
      .button2("Back")
      .show(player)
      .then(({ selection }) => {
        if (selection === 1) showClanMenu(player);
      }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:clan:clan] promise error:", String(error?.stack ?? error)); } catch {} });
    return;
  }
  const form = new ActionFormData()
    .title("Join Requests")
    .body(`You have ${requests.length} pending request(s):`);
  for (const req of requests) {
    const isOnline = world.getPlayers().some((p) => p.name === req.playerName);
    form.button(
      `${req.playerName}${isOnline ? " §a[Online]" : " §7[Offline]"}\n§7Requested to join`,
      "textures/ui/friend1_black_outline_2x",
    );
  }
  form.button("Back", "textures/ui/arrow_left");
  form.show(player).then((res) => {
    if (res.canceled || res.selection === requests.length) {
      showClanMenu(player);
      return;
    }
    const selectedRequest = requests[res.selection];
    if (selectedRequest) {
      showJoinRequestActionMenu(player, selectedRequest, clan);
    }
  }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:clan:clan] promise error:", String(error?.stack ?? error)); } catch {} });
}
function showJoinRequestActionMenu(player, request, clan) {
  const isOnline = world
    .getPlayers()
    .some((p) => p.name === request.playerName);
  new MessageFormData()
    .title("Review Join Request")
    .body(
      `Player: ${request.playerName}\nStatus: ${isOnline ? "§aOnline" : "§7Offline"}\n\nDo you want to approve this join request?`,
    )
    .button1("Approve")
    .button2("Reject")
    .show(player)
    .then(({ selection }) => {
      if (selection === 0) {
        approveJoinRequest(player, request, clan);
      } else if (selection === 1) {
        rejectJoinRequest(player, request);
      } else {
        showJoinRequestsMenu(player, clan);
      }
    }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:clan:clan] promise error:", String(error?.stack ?? error)); } catch {} });
}
function approveJoinRequest(owner, request, clan) {
  const clanId = request.clanId;
  const playerName = request.playerName;
  const player = world.getPlayers().find((p) => p.name === playerName);
  const playerData = clanDB.get(`player_${playerName}`);
  if (playerData?.clanId) {
    owner.sendMessage(
      `§c${playerName} is already in a clan. Request rejected.`,
    );
    clanDB.delete(`join_request_${clanId}_${playerName}`);
    showJoinRequestsMenu(owner, clan);
    return;
  }
  const currentClan = getClanData(clanId);
  if (!currentClan) {
    owner.sendMessage("§cClan not found!");
    clanDB.delete(`join_request_${clanId}_${playerName}`);
    showJoinRequestsMenu(owner, clan);
    return;
  }
  if (currentClan.members.length >= getMaxClanMembers()) {
    owner.sendMessage("§cClan is full! Cannot approve request.");
    if (player) {
      player.sendMessage(
        `§cYour join request to clan '${request.clanName}' was rejected because the clan is full.`,
      );
    }
    clanDB.delete(`join_request_${clanId}_${playerName}`);
    showJoinRequestsMenu(owner, clan);
    return;
  }
  if (joinClan(player || { name: playerName }, clanId)) {
    owner.sendMessage(`§aApproved ${playerName}'s join request!`);
    if (player) {
      player.sendMessage(
        `§aYour join request to clan '${request.clanName}' has been approved! You are now a member.`,
      );
    }
    clanDB.delete(`join_request_${clanId}_${playerName}`);
  } else {
    owner.sendMessage(`§cFailed to add ${playerName} to the clan.`);
  }
  showJoinRequestsMenu(owner, clan);
}
function rejectJoinRequest(owner, request) {
  const clanId = request.clanId;
  const playerName = request.playerName;
  const player = world.getPlayers().find((p) => p.name === playerName);
  clanDB.delete(`join_request_${clanId}_${playerName}`);
  owner.sendMessage(`§cRejected ${playerName}'s join request.`);
  if (player) {
    player.sendMessage(
      `§cYour join request to clan '${request.clanName}' has been rejected.`,
    );
  }
  const clan = getClanData(clanId);
  if (clan) {
    showJoinRequestsMenu(owner, clan);
  } else {
    showClanMenu(owner);
  }
}
function transferOwnershipForm(player, clan) {
  const playerData = clanDB.get(`player_${player.name}`);
  if (playerData.rank !== "owner")
    return player.sendMessage("§cOnly the owner can transfer ownership!");
  const candidates = clan.members.filter((n) => n !== player.name);
  if (candidates.length === 0)
    return player.sendMessage("§cNo other members in the clan!");
  const form = new ActionFormData()
    .title("Transfer Ownership")
    .body("Select a member to become the new owner:");
  for (const n of candidates) {
    form.button(n);
  }
  form.button("Cancel");
  form.show(player).then((res) => {
    if (res.canceled || res.selection === candidates.length)
      return showClanMenu(player);
    const newOwner = candidates[res.selection];
    for (const member of clan.members) {
      if (member === player.name) {
        clanDB.set(`player_${member}`, {
          clanId: clanDB.get(`player_${member}`).clanId,
          rank: "member",
        });
      } else if (member === newOwner) {
        clanDB.set(`player_${member}`, {
          clanId: clanDB.get(`player_${member}`).clanId,
          rank: "owner",
        });
      }
    }
    player.sendMessage(`§aOwnership successfully transferred to ${newOwner}`);
    showClanMenu(player);
  }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:clan:clan] promise error:", String(error?.stack ?? error)); } catch {} });
}
function clanSettingsForm(player, clan) {
  const form = new ModalFormData()
    .title("Clan Settings §t§p§a")
    .textField(
      "Clan Name (supports colors: §a§bGreen§r, §c§bRed§r, etc.)",
      clan.name,
    )
    .textField("Description", clan.desc || "");
  form.show(player).then((res) => {
    if (res.canceled) return showClanMenu(player);
    const [name, desc] = res.formValues;
    if (!isValidClanName(name)) {
      const strippedLength = stripColorCodes(name).length;
      player.sendMessage(
        `§cDisplay name must be 3-${MAX_DISPLAY_NAME_LENGTH} chars. Current: ${strippedLength}. Use valid color codes (§0-9,a-f,k-o,r)`,
      );
      clanSettingsForm(player, clan);
      return;
    }
    const clanId = clanDB.get(`player_${player.name}`).clanId;
    const settingsKey = `clan_${clanId}_settings`;
    const clanSettings = clanDB.get(settingsKey) || { nameChangeCount: 0 };
    const oldStripped = stripColorCodes(clan.name);
    const newStripped = stripColorCodes(name.trim());
    if (oldStripped !== newStripped) {
      if (clanSettings.nameChangeCount >= 1) {
        player.sendMessage(
          `§cYou have already changed the clan name once. You cannot change it again.`,
        );
        clanSettingsForm(player, clan);
        return;
      }
      clanSettings.nameChangeCount += 1;
      clanDB.set(settingsKey, clanSettings);
    }
    clan.name = name.trim();
    clan.desc = desc;
    clanDB.set(`clan_${clanId}`, clan);
    player.sendMessage("§aClan settings updated!");
    showClanMenu(player);
  }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:clan:clan] promise error:", String(error?.stack ?? error)); } catch {} });
}
function promoteDemoteMemberForm(player, clan) {
  const playerData = clanDB.get(`player_${player.name}`);
  if (playerData.rank !== "owner")
    return player.sendMessage("§cOnly the owner can promote/demote!");
  const candidates = clan.members.filter((n) => n !== player.name);
  if (candidates.length === 0)
    return player.sendMessage("§cNo other members in the clan!");
  const form = new ActionFormData().title("Promote/Demote Member");
  for (const n of candidates) {
    const pdata = clanDB.get(`player_${n}`);
    form.button(`${n} (${pdata?.rank || "member"})`);
  }
  form.button("Cancel");
  form.show(player).then((res) => {
    if (res.canceled || res.selection === candidates.length)
      return showClanMenu(player);
    const target = candidates[res.selection];
    const pdata = clanDB.get(`player_${target}`);
    const isMod = pdata.rank === "mod";
    const promoteForm = new MessageFormData()
      .title(isMod ? "Demote Member" : "Promote Member")
      .body(isMod ? `Demote ${target} to member?` : `Promote ${target} to mod?`)
      .button1("Yes")
      .button2("No");
    promoteForm.show(player).then((r) => {
      if (r.canceled || r.selection === 1) return showClanMenu(player);
      clanDB.set(`player_${target}`, {
        clanId: pdata.clanId,
        rank: isMod ? "member" : "mod",
      });
      player.sendMessage(
        isMod
          ? `§a${target} demoted to member!`
          : `§a${target} promoted to mod!`,
      );
      showClanMenu(player);
    }).catch(error => { try { console.warn("[EXTREMESMP:clan] nested form error:", String(error?.stack ?? error)); } catch {} });
  }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:clan:clan] promise error:", String(error?.stack ?? error)); } catch {} });
}
function kickMemberForm(player, clan) {
  const playerData = clanDB.get(`player_${player.name}`);
  if (playerData.rank !== "owner")
    return player.sendMessage("§cOnly the owner can kick members!");
  const candidates = clan.members.filter((n) => n !== player.name);
  if (candidates.length === 0)
    return player.sendMessage("§cNo other members in the clan!");
  const form = new ActionFormData().title("Kick Member");
  for (const n of candidates) {
    form.button(n);
  }
  form.button("Cancel");
  form.show(player).then((res) => {
    if (res.canceled || res.selection === candidates.length)
      return showClanMenu(player);
    const target = candidates[res.selection];
    const clanId = clanDB.get(`player_${target}`)?.clanId;
    if (!clanId) return player.sendMessage("§cMember not found!");
    clan.members = clan.members.filter((n) => n !== target);
    clanDB.set(`clan_${clanId}`, clan);
    clanDB.delete(`player_${target}`);
    player.sendMessage(`§a${target} has been kicked from the clan!`);
    showClanMenu(player);
  }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:clan:clan] promise error:", String(error?.stack ?? error)); } catch {} });
}
function showInviteApprovalMenu(player, inviteData) {
  const inviter = inviteData.inviter;
  const clanId = inviteData.clanId;
  const clan = getClanData(clanId);
  if (!clan) {
    player.sendMessage("§cClan data not found. Invitation may be outdated.");
    clanDB.delete(`invite_${player.name}`);
    showClanMenu(player);
    return;
  }
  new MessageFormData()
    .title("Clan Invitation")
    .body(
      `You have been invited to join clan '${clan.name}' by ${inviter}. Do you accept?`,
    )
    .button1("Accept")
    .button2("Decline")
    .show(player)
    .then((r) => {
      if (r.canceled) {
        showClanMenu(player);
        return;
      }
      if (r.selection === 0) {
        if (joinClan(player, clanId)) {
          player.sendMessage(`§aYou have joined clan '${clan.name}'!`);
          const inviterPlayer = world
            .getPlayers()
            .find((p) => p.name === inviter);
          if (inviterPlayer) {
            inviterPlayer.sendMessage(
              `§a${player.name} has accepted your invitation to join the clan!`,
            );
          }
        } else {
          player.sendMessage(
            "§cFailed to join clan. It may be full or you are already in a clan.",
          );
        }
      } else {
        player.sendMessage("§cYou declined the invitation.");
        const inviterPlayer = world
          .getPlayers()
          .find((p) => p.name === inviter);
        if (inviterPlayer) {
          inviterPlayer.sendMessage(
            `§c${player.name} has declined your invitation to join the clan.`,
          );
        }
      }
      clanDB.delete(`invite_${player.name}`);
      showClanMenu(player);
    }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:clan:clan] promise error:", String(error?.stack ?? error)); } catch {} });
}
function handleLeaveClan(player) {
  const firstConfirm = new MessageFormData()
    .title("Leave Clan")
    .body("Are you sure you want to leave your clan?")
    .button1("Continue")
    .button2("Cancel");
  firstConfirm.show(player).then((firstRes) => {
    if (firstRes.canceled || firstRes.selection === 1) {
      showClanMenu(player);
      return;
    }
    const secondConfirm = new MessageFormData()
      .title("Final Confirmation")
      .body("This action will remove you from your clan. Continue?")
      .button1("Yes, Leave Clan")
      .button2("Back");
    secondConfirm.show(player).then((secondRes) => {
      if (secondRes.canceled || secondRes.selection === 1) {
        showClanMenu(player);
        return;
      }
      const ok = leaveClan(player);
      if (ok) {
        player.sendMessage("§aYou have left the clan!");
      } else {
        player.sendMessage("§cFailed to leave the clan.");
      }
      showClanMenu(player);
    }).catch(error => { try { console.warn("[EXTREMESMP:clan] nested form error:", String(error?.stack ?? error)); } catch {} });
  }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:clan:clan] promise error:", String(error?.stack ?? error)); } catch {} });
}
function showColorGuide(player) {
  const colorGuide = [
    "§0§l■§r §0Black (§0)",
    "§1§l■§r §1Dark Blue (§1)",
    "§2§l■§r §2Dark Green (§2)",
    "§3§l■§r §3Dark Aqua (§3)",
    "§4§l■§r §4Dark Red (§4)",
    "§5§l■§r §5Dark Purple (§5)",
    "§6§l■§r §6Gold (§6)",
    "§7§l■§r §7Gray (§7)",
    "§8§l■§r §8Dark Gray (§8)",
    "§9§l■§r §9Blue (§9)",
    "§a§l■§r §aGreen (§a)",
    "§b§l■§r §bAqua (§b)",
    "§c§l■§r §cRed (§c)",
    "§d§l■§r §dLight Purple (§d)",
    "§e§l■§r §eYellow (§e)",
    "§f§l■§r §fWhite (§f)",
    "",
    "§lFormatting Codes:",
    "§k§lObfuscated§r (§k)",
    "§l§lBold§r (§l)",
    "§m§lStrikethrough§r (§m)",
    "§n§lUnderline§r (§n)",
    "§o§lItalic§r (§o)",
    "§r§lReset§r (§r)",
    "",
    "§eExample: §b§lMy§a§lClan§r = §b§lMy§a§lClan",
  ];
  new MessageFormData()
    .title("Color Code Guide")
    .body(colorGuide.join("\n"))
    .button1("Close")
    .button2("Back to Menu")
    .show(player)
    .then(({ selection }) => {
      if (selection === 1) showClanMenu(player);
    }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:clan:clan] promise error:", String(error?.stack ?? error)); } catch {} });
}
function handleDisbandClan(player) {
  const playerData = clanDB.get(`player_${player.name}`);
  const clanId = playerData?.clanId;
  if (!clanId) {
    player.sendMessage("§cClan not found.");
    showClanMenu(player);
    return;
  }
  const clan = getClanData(clanId);
  if (!clan) {
    player.sendMessage("§cClan data not found.");
    showClanMenu(player);
    return;
  }
  const form = new MessageFormData()
    .title("Disband Clan")
    .body(
      `Are you sure you want to disband the clan '${clan.name}'? This cannot be undone.`,
    )
    .button1("Yes")
    .button2("No");
  form.show(player).then((res) => {
    if (res.canceled || res.selection === 1) {
      showClanMenu(player);
      return;
    }
    clanDB.delete(`clan_${clanId}`);
    clanDB.delete(`clan_${clanId}_settings`);
    for (const key of clanDB.keys()) {
      if (key.startsWith(`join_request_${clanId}_`)) {
        clanDB.delete(key);
      }
    }
    for (const member of clan.members) {
      clanDB.delete(`player_${member}`);
      const p = world.getPlayers().find((pl) => pl.name === member);
      if (p)
        p.sendMessage(
          `§cClan '${clan.name}§c' has been disbanded by the owner!`,
        );
    }
    player.sendMessage("§aClan disbanded!");
    showClanMenu(player);
  }).catch(error => { try { console.warn("[EXTREMESMP:scripts:plugins:clan:clan] promise error:", String(error?.stack ?? error)); } catch {} });
}
