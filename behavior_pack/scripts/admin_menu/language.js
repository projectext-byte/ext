import { ActionFormData } from '../core.js';
import { Lang } from "../lib/Lang.js";
export function showLanguageMenu(player, onBack) {
    new ActionFormData()
        .title(Lang.t(player, "lang.menu.title"))
        .body("§c⚠ This feature is WIP and Unstable! ⚠\n\n" + Lang.t(player, "lang.menu.body"))
        .button("English", "textures/ui/language_glyph_color")
        .button("Indonesia", "textures/ui/language_glyph_color")
        .button(Lang.t(player, "common.back"), "textures/ui/arrow_left")
        .show(player)
        .then(({ selection, canceled }) => {
            if (canceled) return;
            if (selection === 0) {
                Lang.set(player, 'en');
                player.sendMessage(Lang.t(player, "cmd.lang.success", "English"));
                if (onBack) onBack();
            } else if (selection === 1) {
                Lang.set(player, 'id');
                player.sendMessage(Lang.t(player, "cmd.lang.success", "Indonesia"));
                if (onBack) onBack();
            } else if (selection === 2) {
                if (onBack) onBack();
            }
        });
}
