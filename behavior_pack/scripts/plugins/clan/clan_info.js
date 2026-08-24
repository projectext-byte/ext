import { MessageFormData } from "../../core.js"
export function showClanInfoMenu(player) {
  const form = new MessageFormData()
    .title("Clan Menu Info")
    .body(
      "§eClan Menu Functions Explanation:\n\n" +
        "§fClan Info: §7Displays clan details like name, description, level, XP, and member count.\n\n" +
        "§fMembers: §7Lists all clan members, divided into Owner, Mod, and Member.\n\n" +
        "§fInvite Member: §7Invite online players not in a clan (only for Owner/Mod).\n\n" +
        "§fClan Chat: §7Send messages to all clan members.\n\n" +
        "§fLeave Clan: §7Leave the clan (not available for Owner).\n\n" +
        "§fDisband Clan: §7Disband the clan (only Owner).\n\n" +
        "§fTransfer Ownership: §7Transfer clan ownership to another member (only Owner).\n\n" +
        "§fClan Settings: §7Edit clan name and description (only Owner).\n\n" +
        "§fPromote/Demote Member: §7Promote member to Mod or demote Mod to member (only Owner).\n\n" +
        "§fKick Member: §7Kick a member from the clan (only Owner).\n\n" +
        "§fClan Change Name: §7You can only change the clan name once.\n\n"
    )
    .button1("Close")
    .button2("Back")
  form.show(player).then(res => {
    if (res.selection === 1) {
      import("./clan.js").then(mod => mod.showClanMenu(player))
    }
  })
}
