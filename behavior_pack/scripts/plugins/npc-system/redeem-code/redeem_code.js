import { world, ActionFormData, ModalFormData } from '../../../core.js';
import { addMoney } from "../../../function/moneySystem.js";
const CONFIG = {
    DEFAULT: { redeemCodes: { codes: {} } },
    SOUND: {
        error: { prefix: "§c", sound: "note.bass", pitch: 0.5 },
        warning: { prefix: "§e", sound: "random.pop", pitch: 0.7 },
        success: { prefix: "§a", sound: "random.levelup", pitch: 1.0 },
        info: { prefix: "§b", sound: "random.pop", pitch: 1.0 },
    },
};
const Util = {
    showMsg: (player, type, msg) => {
        const { prefix, sound, pitch } = CONFIG.SOUND[type] || CONFIG.SOUND.info;
        player.sendMessage(`${prefix} ${msg}`);
        try { player.runCommand(`playsound ${sound} @s ~~~ 1 ${pitch}`); } catch { }
    },
    getConfig: () => {
        try { return JSON.parse(world.getDynamicProperty("npcConfig")) || CONFIG.DEFAULT; }
        catch { return CONFIG.DEFAULT; }
    },
    saveConfig: (cfg) => {
        try { world.setDynamicProperty("npcConfig", JSON.stringify(cfg)); return true; }
        catch (e) { console.warn("[NPC] Save failed:", e); return false; }
    },
    parseItems: (str, prefix = "minecraft:") => {
        if (!str?.trim()) return [];
        return str.split(";").map(p => p.trim()).filter(p => p.includes(",")).map(p => {
            const [id, amt] = p.split(",");
            return { item: id.trim().includes(":") ? id.trim() : prefix + id.trim(), amount: parseInt(amt) || 1 };
        });
    },
    stripPrefix: (item, prefix = "minecraft:") => item.replace(prefix, ""),
    particle: (player) => { try { player.runCommand("particle minecraft:totem_particle ~~~"); } catch { } }
};
export async function showRedeemCodeMenu(player) {
    const res = await new ActionFormData()
        .title("§bRedeem Code")
        .body("Welcome! Enter a unique code to receive rewards.\n§cEach code is one-time use.")
        .button("§2Enter Code", "textures/ui/gift_square")
        .button("§cBack", "textures/ui/cancel")
        .show(player);
    if (res.canceled || res.selection !== 0) return;
    const input = await new ModalFormData()
        .title("Enter Gift Code")
        .textField("§eEnter your code below:", "Type code here...")
        .show(player);
    if (input.canceled || !input.formValues[0]) return Util.showMsg(player, "warning", "No code entered.");
    await processRedeemCode(player, input.formValues[0].trim());
}
async function processRedeemCode(player, code) {
    const cfg = Util.getConfig();
    const data = cfg.redeemCodes?.codes?.[code];
    if (!data) return Util.showMsg(player, "warning", "Invalid code.");
    if (data.expiryTime && Date.now() > data.expiryTime) return Util.showMsg(player, "warning", "Code expired.");
    if ((data.redeemedBy || []).includes(player.name)) return Util.showMsg(player, "warning", "Already redeemed.");
    if (data.maxRedemptions && (data.redeemedBy || []).length >= data.maxRedemptions) return Util.showMsg(player, "warning", "Limit reached.");
    const itemText = data.items?.enabled && data.items.list?.length ? `§6Items:§r\n${data.items.list.map(i => `§7• ${Util.stripPrefix(i.item)} x${i.amount}`).join("\n")}` : "";
    const moneyText = data.money?.enabled ? `\n\n§6Money:§r\n§7• $${data.money.amount}` : "";
    const confirm = await new ActionFormData()
        .title("§bConfirm Rewards")
        .body(`Claim rewards for: §f${code}\n\n${itemText}${moneyText}`)
        .button("§2Confirm", "textures/ui/confirm")
        .button("§cCancel", "textures/ui/cancel")
        .show(player);
    if (confirm.canceled || confirm.selection !== 0) return;
    if (data.items?.enabled) data.items.list.forEach(i => { try { player.runCommand(`give @s ${i.item} ${i.amount}`); } catch { } });
    if (data.money?.enabled) addMoney(player, data.money.amount);
    if (!data.redeemedBy) data.redeemedBy = [];
    data.redeemedBy.push(player.name);
    cfg.redeemCodes.codes[code] = data;
    Util.saveConfig(cfg);
    Util.showMsg(player, "success", "Code redeemed!");
    Util.particle(player);
}
export async function showRedeemCodeAdminMenu(player) {
    const actions = [createRedeemCode, manageRedeemCodes, viewRedemptionHistory];
    const res = await new ActionFormData()
        .title("Admin: Redeem Code")
        .button("Create Code", "textures/ui/color_plus")
        .button("Manage Codes", "textures/ui/debug_glyph_color")
        .button("History", "textures/ui/bang_icon")
        .button("Back", "textures/ui/cancel")
        .show(player);
    if (!res.canceled && actions[res.selection]) actions[res.selection](player);
}
async function createRedeemCode(player, existingData = {}, codeEdit = "") {
    const isEdit = !!codeEdit;
    const itemsDefault = (existingData.items?.list || []).map(i => `${Util.stripPrefix(i.item)},${i.amount}`).join(";");
    const expiryDefault = existingData.expiryTime ? Math.max(0, Math.round((existingData.expiryTime - Date.now()) / 3600000)) : 0;
    const res = await new ModalFormData()
        .title(isEdit ? `Edit: ${codeEdit}` : "New Code")
        .textField("Code Name", "SUMMER2025", codeEdit ? { defaultValue: codeEdit } : undefined)
        .toggle("Enable Money", { defaultValue: existingData.money?.enabled ?? true })
        .slider("Money Amount", 0, 50000, { defaultValue: existingData.money?.amount ?? 5000, step: 500 })
        .toggle("Enable Items", { defaultValue: existingData.items?.enabled ?? true })
        .textField("Items (id,amt;...)", "diamond,5", itemsDefault ? { defaultValue: itemsDefault } : undefined)
        .slider("Limit (0=inf)", 0, 100, { defaultValue: existingData.maxRedemptions || 0, step: 1 })
        .slider("Expires (Hrs)", 0, 720, { defaultValue: expiryDefault, step: 1 })
        .show(player);
    if (res.canceled) return;
    const [code, enMoney, moneyAmt, enItems, itemsStr, maxRedeem, expiryHrs] = res.formValues;
    if (!code) return Util.showMsg(player, "warning", "Name required.");
    const cfg = Util.getConfig();
    if (!cfg.redeemCodes) cfg.redeemCodes = { codes: {} };
    if (!isEdit && cfg.redeemCodes.codes[code]) return Util.showMsg(player, "warning", "Code exists.");
    if (isEdit && code !== codeEdit) delete cfg.redeemCodes.codes[codeEdit];
    cfg.redeemCodes.codes[code] = {
        money: { enabled: enMoney, amount: moneyAmt },
        items: { enabled: enItems, list: Util.parseItems(itemsStr) },
        maxRedemptions: maxRedeem > 0 ? maxRedeem : null,
        expiryTime: expiryHrs > 0 ? Date.now() + expiryHrs * 3600000 : null,
        redeemedBy: existingData.redeemedBy || []
    };
    Util.saveConfig(cfg) ? Util.showMsg(player, "success", `Code ${isEdit ? "updated" : "created"}.`) : Util.showMsg(player, "error", "Save failed.");
}
async function manageRedeemCodes(player) {
    const cfg = Util.getConfig();
    const codes = Object.keys(cfg.redeemCodes?.codes || {});
    if (!codes.length) return Util.showMsg(player, "info", "No codes.");
    const form = new ActionFormData().title("Manage Codes");
    codes.forEach(c => {
        const d = cfg.redeemCodes.codes[c];
        form.button(`${c}\n§7(${d.redeemedBy?.length || 0}/${d.maxRedemptions || "∞"})`);
    });
    const res = await form.show(player);
    if (res.canceled) return;
    const selected = codes[res.selection];
    const edit = await new ActionFormData()
        .title(`Manage: ${selected}`)
        .button("Edit", "textures/ui/gear")
        .button("Delete", "textures/ui/redX1")
        .button("Back")
        .show(player);
    if (edit.canceled || edit.selection === 2) return manageRedeemCodes(player);
    if (edit.selection === 0) await createRedeemCode(player, cfg.redeemCodes.codes[selected], selected);
    else if (edit.selection === 1) {
        delete cfg.redeemCodes.codes[selected];
        Util.saveConfig(cfg);
        Util.showMsg(player, "success", "Deleted.");
    }
}
async function viewRedemptionHistory(player) {
    const cfg = Util.getConfig();
    const codes = Object.keys(cfg.redeemCodes?.codes || {});
    if (!codes.length) return Util.showMsg(player, "info", "No history.");
    const form = new ActionFormData().title("History");
    codes.forEach(c => form.button(c));
    const res = await form.show(player);
    if (res.canceled) return;
    const selected = codes[res.selection];
    const list = cfg.redeemCodes.codes[selected].redeemedBy?.join("\n§7- ") || "No redemptions.";
    await new ActionFormData()
        .title(`History: ${selected}`)
        .body(`Redeemed by:\n\n§7- ${list}`)
        .button("Back")
        .show(player);
    viewRedemptionHistory(player);
}
