import { system, world, ActionFormData } from "../../core.js";
const BATTLEPASS_NAMESPACE = "battlepass";
const REWARDS_PROPERTY = `${BATTLEPASS_NAMESPACE}:rewards`;
world.afterEvents.worldLoad.subscribe(() => {
    if (!world.getDynamicProperty(REWARDS_PROPERTY)) {
        world.setDynamicProperty(REWARDS_PROPERTY, JSON.stringify([]));
    }
});
export function getRewards() {
    const rewards = world.getDynamicProperty(REWARDS_PROPERTY);
    return rewards ? JSON.parse(rewards) : [];
}
export function saveRewards(rewards) {
    world.setDynamicProperty(REWARDS_PROPERTY, JSON.stringify(rewards));
}
async function confirmClaimReward(player, reward, level) {
    const confirmForm = new ActionFormData()
        .title("§6Confirm Reward Claim")
        .body(`§fAre you sure you want to claim: §e${reward.name}§f?`)
        .button("§2Yes, Claim Now", "textures/ui/confirm")
        .button("§4Cancel", "textures/ui/cancel");
    const result = await confirmForm.show(player);
    if (result.canceled || result.selection === 1) return false;
    if (level >= reward.levelRequired && !player.hasTag(reward.tag)) {
        try {
            player.runCommand("gamerule sendcommandfeedback false");
            const isRankReward = reward.isRankReward ||
                (reward.command && reward.command.includes('tag @s add "rank:'));
            if (isRankReward) {
                await handleRankReward(player, reward);
            } else {
                await player.runCommand(reward.command);
            }
            player.runCommand("gamerule sendcommandfeedback true");
            player.runCommand(`tellraw @s {"rawtext":[{"text":"§aSuccess! §r§aYou have claimed §e${reward.name}§a!"}]}`);
            player.addTag(reward.tag);
            player.runCommand(`playsound random.levelup @s`);
            return true;
        } catch (error) {
            player.runCommand("gamerule sendcommandfeedback true");
            player.runCommand(`tellraw @s {"rawtext":[{"text":"§cFailed! §r§cCould not claim §e${reward.name}§c."}]}`);
            console.warn(`Failed to execute reward command: ${error}`);
            return false;
        }
    }
    return false;
}
async function handleRankReward(player, reward) {
    try {
        let rankName = "";
        if (reward.rankName) {
            rankName = reward.rankName;
        } else if (reward.command) {
            const rankMatch = reward.command.match(/tag @s add "rank:(.+?)"/);
            if (rankMatch) {
                rankName = rankMatch[1];
            }
        }
        if (!rankName) {
            throw new Error("Could not determine rank name from reward");
        }
        const existingRankTags = player.getTags().filter(tag => tag.startsWith("rank:"));
        for (const tag of existingRankTags) {
            player.removeTag(tag);
        }
        const newRankTag = `rank:${rankName}`;
        player.addTag(newRankTag);
        player.runCommand(`tellraw @s {"rawtext":[{"text":"§6[RANK] §r§aYour rank has been updated to: §e${rankName}§a!"}]}`);
        console.warn(`[Battlepass] Player ${player.name} received rank: ${rankName}`);
    } catch (error) {
        console.warn(`[Battlepass] Failed to handle rank reward for ${player.name}:`, error);
        throw error;
    }
}
async function viewRewardDetails(player, reward, level) {
    const canClaim = level >= reward.levelRequired && !player.hasTag(reward.tag);
    const alreadyClaimed = player.hasTag(reward.tag);
    const detailForm = new ActionFormData()
        .title(`§6Reward Details: §f${reward.name}`)
        .body(
            `§eReward Information:§r\n` +
            `§fName: §e${reward.name}§r\n` +
            `§fLevel Required: §e${reward.levelRequired}§r\n` +
            `§fStatus: ${alreadyClaimed ? "§aClaimed" : canClaim ? "§eAvailable to Claim" : "§cNot Available"}§r\n` +
            `\n§fYour Current Level: §e${level}§r\n` +
            `${!canClaim && !alreadyClaimed ? `§fLevels Needed: §c${reward.levelRequired - level}§r\n` : ""}`
        );
    detailForm.button(canClaim ? "§2Claim Reward" : alreadyClaimed ? "§7Already Claimed" : "§7Not Enough Level",
        canClaim ? "textures/ui/confirm" : alreadyClaimed ? "textures/ui/check" : "textures/ui/lock");
    detailForm.button("§4Back", "textures/ui/arrow_left");
    const result = await detailForm.show(player);
    if (result.canceled || result.selection === 1) return false;
    if (result.selection === 0 && canClaim) return await confirmClaimReward(player, reward, level);
    return false;
}
export async function openBattlepass(player) {
    const level = player.level;
    let rewards = getRewards().sort((a, b) => a.levelRequired - b.levelRequired);
    const form = new ActionFormData()
        .title("§6BATTLEPASS MENU")
        .body(`§fYour Level: §e${level}\n${getXpBar(player)}`);
    for (const reward of rewards) {
        let text;
        if (player.hasTag(reward.tag)) {
            text = `§a${reward.name}\n§r§a(Claimed)`;
        } else if (level >= reward.levelRequired) {
            text = `§e${reward.name}\n§r§e(Available - Level ${reward.levelRequired})`;
        } else {
            text = `§7${reward.name}\n§r§7(Locked - Level ${reward.levelRequired})`;
        }
        form.button(text, reward.texture);
    }
    const result = await form.show(player);
    if (result.canceled || result.selection === undefined) return;
    const selectedReward = rewards[result.selection];
    const rewardClaimed = await viewRewardDetails(player, selectedReward, level);
    if (!rewardClaimed) {
        system.runTimeout(() => openBattlepass(player), 10);
    }
}
function getXpBar(player) {
    const barLength = 20;
    const currentXP = player.xpEarnedAtCurrentLevel;
    const neededXP = player.totalXpNeededForNextLevel;
    const progress = neededXP > 0 ? currentXP / neededXP : 0;
    const filled = Math.floor(barLength * progress);
    const empty = barLength - filled;
    const percentage = Math.floor(progress * 100);
    return `§a[§2${'■'.repeat(filled)}§7${'□'.repeat(empty)}§a] (${percentage}%)`;
}
system.runInterval(() => {
    for (const player of world.getPlayers()) {
        if (player.hasTag("bpMenu")) {
            player.runCommand(`playsound note.pling @s`);
            openBattlepass(player);
            player.removeTag("bpMenu");
        }
    }
}, 20);