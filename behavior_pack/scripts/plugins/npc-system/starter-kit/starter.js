import { world, ActionFormData, ModalFormData } from "../../../core.js";
const DEFAULT_STARTER_KIT = {
    items: [
        { item: "diamond_sword", amount: 1 },
        { item: "diamond_pickaxe", amount: 1 },
        { item: "bread", amount: 16 },
        { item: "iron_helmet", amount: 1 },
        { item: "iron_chestplate", amount: 1 },
        { item: "iron_leggings", amount: 1 },
        { item: "iron_boots", amount: 1 }
    ],
    cooldown: 24 * 60 * 60 * 1000,
    once: true
};
function getStarterKitConfig() {
    const raw = world.getDynamicProperty("starterKitConfig");
    if (!raw) return { ...DEFAULT_STARTER_KIT };
    try {
        return JSON.parse(raw);
    } catch {
        return { ...DEFAULT_STARTER_KIT };
    }
}
function saveStarterKitConfig(config) {
    world.setDynamicProperty("starterKitConfig", JSON.stringify(config));
}
function getCurrentTimestamp() {
    return Date.now();
}
function formatDuration(ms) {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0) parts.push(`${seconds}s`);
    return parts.length > 0 ? parts.join(" ") : "0s";
}
export async function showStarterKitMenu(player) {
    const isAdmin = player.hasTag("admin");
    const config = getStarterKitConfig();
    if (isAdmin) {
        const cooldownLabel = config.once
            ? `§7Cooldown: §b${formatDuration(config.cooldown)} §7(only for repeatable mode)`
            : `§7Cooldown: §b${formatDuration(config.cooldown)}`;
        const form = new ActionFormData()
            .title("§bSTARTER KIT SETTINGS")
            .body(
                `§7Kit Items: §f${config.items.map(i => `${i.item} x${i.amount}`).join(", ")}` +
                `\n§7Mode: §b${config.once ? "Only Once" : "Repeatable"}` +
                `\n${cooldownLabel}`
            )
            .button("Set Kit Items", "textures/ui/gift_square")
            .button(
                config.once
                    ? "§8Set Cooldown (Only for repeatable mode)"
                    : "Set Cooldown",
                "textures/ui/timer"
            )
            .button(config.once ? "Switch to Repeatable" : "Switch to Only Once", "textures/ui/refresh")
            .button("Preview Kit", "textures/ui/copy")
            .button("Customize NPC", "textures/ui/dressing_room_skins")
            .button("§cClose", "textures/ui/cancel");
        const res = await form.show(player);
        if (res.canceled) return;
        if (res.selection === 0) await editStarterKitItems(player);
        else if (res.selection === 1 && !config.once) await editStarterKitCooldown(player);
        else if (res.selection === 2) await toggleStarterKitOnce(player);
        else if (res.selection === 3) await previewStarterKit(player);
        else if (res.selection === 4) {
            player.runCommand('dialogue open @e[type=npc,c=1,r=5] @s');
            return;
        }
    } else {
        await claimStarterKitMenu(player);
    }
}
async function claimStarterKitMenu(player) {
    const config = getStarterKitConfig();
    const lastClaim = player.getDynamicProperty("starterKit:lastClaim") || 0;
    const now = getCurrentTimestamp();
    const timeLeft = config.cooldown - (now - lastClaim);
    const alreadyClaimed = player.getDynamicProperty("starterKit:claimedOnce") === true || player.getDynamicProperty("starterKit:claimedOnce") === 1;
    let body = "§eClaim your free starter kit to begin your adventure!\n\n" +
        config.items.map(i => `§7• ${i.item} x${i.amount}`).join("\n") +
        `\n\n§7Mode: §b${config.once ? "Only Once" : "Repeatable"}`;
    if (!config.once) {
        body += `\n§fCooldown: §b${formatDuration(config.cooldown)}`;
    }
    if (config.once && alreadyClaimed) {
        body += "\n§cYou can only claim the starter kit once.";
    }
    const form = new ActionFormData()
        .title("§bSTARTER KIT")
        .body(body)
        .button(config.once && alreadyClaimed ? "§7Already Claimed" : "§aClaim Starter Kit", "textures/ui/gift_square")
        .button("§cClose", "textures/ui/cancel");
    const res = await form.show(player);
    if (!res.canceled && res.selection === 0) {
        if (config.once && alreadyClaimed) {
            player.sendMessage("§cYou can only claim the starter kit once per account!");
            player.runCommand("playsound note.bass @s ~~~ 1 1");
            return;
        }
        if (timeLeft > 0 && !config.once) {
            player.sendMessage(`§eYou can claim the starter kit again in: §c${formatDuration(timeLeft)}`);
            player.runCommand("playsound note.bass @s ~~~ 1 1");
            return;
        }
        for (const i of config.items) {
            try {
                player.runCommand(`give @s ${i.item} ${i.amount}`);
            } catch { }
        }
        player.setDynamicProperty("starterKit:lastClaim", now);
        if (config.once) player.setDynamicProperty("starterKit:claimedOnce", true);
        player.sendMessage("§aStarter kit successfully claimed!");
        player.runCommand("playsound random.levelup @s ~~~ 1 1");
    }
}
async function editStarterKitItems(player) {
    const config = getStarterKitConfig();
    const form = new ModalFormData()
        .title("§bSet Starter Kit Items")
        .textField("Item list (format: item,amount;item,amount)", "diamond_sword,1;bread,16", {
            defaultValue: config.items.map(i => `${i.item},${i.amount}`).join(";")
        });
    const res = await form.show(player);
    if (res.canceled) return;
    const itemsStr = res.formValues[0];
    const items = itemsStr.split(";").map(s => {
        const [item, amount] = s.split(",");
        return { item: item.trim(), amount: parseInt(amount) || 1 };
    }).filter(i => i.item);
    config.items = items;
    saveStarterKitConfig(config);
    player.sendMessage("§aStarter kit updated!");
}
async function editStarterKitCooldown(player) {
    const config = getStarterKitConfig();
    const form = new ModalFormData()
        .title("§bSet Starter Kit Cooldown")
        .slider("Cooldown (hours)", 1, 168, {
            defaultValue: Math.max(1, Math.floor(config.cooldown / 3600000)),
            valueStep: 1
        });
    const res = await form.show(player);
    if (res.canceled) return;
    const hours = res.formValues[0];
    config.cooldown = hours * 60 * 60 * 1000;
    saveStarterKitConfig(config);
    player.sendMessage(`§aStarter kit cooldown set to ${hours} hours!`);
}
async function toggleStarterKitOnce(player) {
    const config = getStarterKitConfig();
    config.once = !config.once;
    saveStarterKitConfig(config);
    player.sendMessage(`§aStarter kit mode changed to: ${config.once ? "Only Once" : "Repeatable"}`);
}
async function previewStarterKit(player) {
    const config = getStarterKitConfig();
    player.sendMessage("§eStarter kit preview:");
    for (const i of config.items) {
        player.sendMessage(`§7• ${i.item} x${i.amount}`);
    }
    player.sendMessage(`§bCooldown: ${formatDuration(config.cooldown)}`);
    player.sendMessage(`§bMode: ${config.once ? "Only Once" : "Repeatable"}`);
}
export function giveStarterKit(player) {
    const config = getStarterKitConfig();
    let originalFeedback = null;
    try {
        const feedbackResult = player.runCommand("gamerule sendcommandfeedback");
        if (feedbackResult && feedbackResult.statusMessage) {
            const match = feedbackResult.statusMessage.match(/sendcommandfeedback = (true|false)/);
            if (match) originalFeedback = match[1] === "true";
        }
        player.runCommand("gamerule sendcommandfeedback false");
    } catch { }
    for (const i of config.items) {
        try {
            player.runCommand(`give @s ${i.item} ${i.amount}`);
        } catch { }
    }
    if (originalFeedback !== null) {
        try {
            player.runCommand(`gamerule sendcommandfeedback ${originalFeedback}`);
        } catch { }
    }
}