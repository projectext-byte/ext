import { world, ModalFormData } from "../../core.js";
import { clanDB } from "../../function/getClan.js";
export function sendClanChatMessage(player, message) {
  const playerData = clanDB.get(`player_${player.name}`);
  const clanId = playerData?.clanId;
  if (!clanId) {
    player.sendMessage("§cYou are not in a clan!");
    return false;
  }
  const clan = clanDB.get(`clan_${clanId}`);
  if (!clan) {
    player.sendMessage("§cClan data not found.");
    return false;
  }
  const formattedMessage = `§e[Clan Chat] §7${player.name}: §f${message}`;
  clan.members.forEach((memberName) => {
    const member = world.getPlayers().find((p) => p.name === memberName);
    if (member) {
      member.sendMessage(formattedMessage);
    }
  });
  return true;
}
export function showClanChatForm(player) {
  const playerData = clanDB.get(`player_${player.name}`);
  const clanId = playerData?.clanId;
  if (!clanId) {
    player.sendMessage("§cYou are not in a clan!");
    return false;
  }
  const form = new ModalFormData()
    .title("Clan Chat §t§p§a")
    .textField("Message", "Type your message here")
    .show(player)
    .then((res) => {
      if (res.canceled) return;
      const [message] = res.formValues;
      if (message && message.trim()) {
        sendClanChatMessage(player, message.trim());
      }
    });
  return true;
}
