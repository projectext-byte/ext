import { ActionFormData } from "../../core.js";
import { Lang } from "../../lib/Lang.js";

function showWhitelistMenu(player) {
  if (!player) return;

  new ActionFormData()
    .title(Lang.t(player, "whitelist.vip.title"))
    .body(Lang.t(player, "whitelist.vip.body"))
    .button(Lang.t(player, "whitelist.vip.buy"), "textures/ui/icon_blackfriday")
    .button(Lang.t(player, "common.back"), "textures/ui/arrow_left")
    .show(player)
    .catch(() => { });
}

const WhitelistManager = {
  isEnabled: () => false,
  isAdmin: () => false,
  isWhitelisted: () => false,
  getWhitelistedPlayers: () => [],
  getKickMessage: () => "",
  addPlayer: () => false,
  removePlayer: () => false,
  toggleWhitelist: () => false,
  setKickMessage: () => false,
};

export { showWhitelistMenu, WhitelistManager };
