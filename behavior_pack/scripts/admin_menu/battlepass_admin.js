import { system, world } from "../core.js";
import { ActionFormData, ModalFormData } from "../core.js";
import { getRewards, saveRewards } from "../plugins/battlepass/index.js";
const PAGE_SIZE = 10;
function getSortedRewardsCache() {
  const rewards = getRewards();
  return rewards.slice().sort((a, b) => a.levelRequired - b.levelRequired);
}
async function addRewardUI(player) {
  try {
    const form = new ModalFormData()
      .title("§bAdd Battlepass Reward")
      .dropdown(
        "§eReward Type\n§6Select the type of reward",
        ["Item/Command Reward", "Rank Reward"],
        { defaultValueIndex: 0 },
      )
      .textField(
        "§eReward Name\n§6Enter a name for this reward",
        "Example: Iron Sword / VIP Rank",
        { defaultValue: "", placeholder: "Enter reward name" },
      )
      .textField(
        "§eLevel Required\n§6Level needed to claim reward",
        "Example: 10",
        { defaultValue: "", placeholder: "Enter level number" },
      )
      .textField(
        "§eTexture Path (Optional)\n§6Icon path for the reward - leave empty for default",
        "Example: textures/items/iron_sword",
        { defaultValue: "", placeholder: "Leave empty for default icon" },
      )
      .textField(
        "§eCommand/Rank\n§6For items: give command | For ranks: rank name",
        "Example: give @s iron_sword 1 OR vip",
        { defaultValue: "", placeholder: "Enter command or rank name" },
      )
      .textField(
        "§eTag Name\n§6Unique tag for tracking claims",
        "Example: claimedIronSword",
        { defaultValue: "", placeholder: "Enter tag name" },
      );
    const result = await form.show(player);
    if (result.canceled) return;
    if (!result.formValues || result.formValues.length !== 6) {
      player.runCommand(
        `tellraw @s {"rawtext":[{"text":"§c✘ §7Form error - invalid data received!"}]}`,
      );
      return;
    }
    const [rewardType, name, levelRequired, texture, commandOrRank, tag] =
      result.formValues;
    if (
      name === null ||
      name === undefined ||
      name.toString().trim() === "" ||
      levelRequired === null ||
      levelRequired === undefined ||
      levelRequired.toString().trim() === "" ||
      commandOrRank === null ||
      commandOrRank === undefined ||
      commandOrRank.toString().trim() === "" ||
      tag === null ||
      tag === undefined ||
      tag.toString().trim() === ""
    ) {
      player.runCommand(
        `tellraw @s {"rawtext":[{"text":"§c✘ §7Required fields must be filled! (Name, Level, Command/Rank, Tag)"}]}`,
      );
      return;
    }
    const level = parseInt(levelRequired.toString(), 10);
    if (isNaN(level) || level < 1 || level > 1000) {
      player.runCommand(
        `tellraw @s {"rawtext":[{"text":"§c✘ §7Level must be a valid number between 1-1000!"}]}`,
      );
      return;
    }
    const rewards = getRewards();
    for (const r of rewards) {
      if (r.tag === tag) {
        player.runCommand(
          `tellraw @s {"rawtext":[{"text":"§c✘ §7Tag already used by another reward!"}]}`,
        );
        return;
      }
    }
    let command;
    let isRankReward = false;
    try {
      if (rewardType === 0) {
        command = commandOrRank.toString().trim();
      } else {
        isRankReward = true;
        const rankName = commandOrRank.toString().trim();
        if (rankName.includes('"') || rankName.includes("'")) {
          player.runCommand(
            `tellraw @s {"rawtext":[{"text":"§c✘ §7Rank name cannot contain quotes!"}]}`,
          );
          return;
        }
        command = `tag @s add "rank:${rankName}"`;
      }
    } catch (error) {
      player.runCommand(
        `tellraw @s {"rawtext":[{"text":"§c✘ §7Error processing command/rank data!"}]}`,
      );
      return;
    }
    const finalTexture =
      texture === null ||
      texture === undefined ||
      texture.toString().trim() === ""
        ? isRankReward
          ? "textures/ui/icon_setting"
          : "textures/items/paper"
        : texture.toString().trim();
    const rewardData = {
      name: name.toString().trim(),
      levelRequired: level,
      texture: finalTexture,
      command,
      tag: tag.toString().trim(),
      isRankReward: isRankReward,
      rankName: isRankReward ? commandOrRank.toString().trim() : null,
    };
    rewards.push(rewardData);
    saveRewards(rewards);
    const rewardTypeText = isRankReward ? "rank" : "item";
    const safeName = name.toString().trim().replace(/"/g, '\\"');
    player.runCommand(
      `tellraw @s {"rawtext":[{"text":"§a✔ §7${rewardTypeText} reward \\"${safeName}\\" added!"}]}`,
    );
    player.runCommand(`playsound random.levelup @s`);
  } catch (error) {
    player.runCommand(
      `tellraw @s {"rawtext":[{"text":"§c✘ §7Unexpected error occurred!"}]}`,
    );
  }
}
async function editRewardUI(player, page = 0) {
  try {
    const sortedRewards = getSortedRewardsCache();
    if (sortedRewards.length === 0) {
      player.runCommand(
        `tellraw @s {"rawtext":[{"text":"§cFailed: §r§cNo rewards to edit!"}]}`,
      );
      return;
    }
    const totalPages = Math.ceil(sortedRewards.length / PAGE_SIZE);
    const pagedRewards = sortedRewards.slice(
      page * PAGE_SIZE,
      (page + 1) * PAGE_SIZE,
    );
    const selectForm = new ActionFormData()
      .title(`§bEdit Reward (Page ${page + 1}/${totalPages})`)
      .body("§fSelect a reward to edit:");
    for (const reward of pagedRewards) {
      selectForm.button(
        `§f${reward.name}\n§r§7(Level ${reward.levelRequired})`,
        reward.texture,
      );
    }
    if (totalPages > 1) {
      if (page > 0)
        selectForm.button("§ePrevious Page", "textures/ui/arrow_left");
      if (page < totalPages - 1)
        selectForm.button("§eNext Page", "textures/ui/arrow_right");
    }
    const selection = await selectForm.show(player);
    if (selection.canceled || selection.selection === undefined) return;
    if (totalPages > 1) {
      const lastBtnIdx = pagedRewards.length;
      if (page > 0 && selection.selection === lastBtnIdx) {
        await editRewardUI(player, page - 1);
        return;
      }
      if (
        page < totalPages - 1 &&
        selection.selection === lastBtnIdx + (page > 0 ? 1 : 0)
      ) {
        await editRewardUI(player, page + 1);
        return;
      }
    }
    const selectedReward = pagedRewards[selection.selection];
    const rewards = getRewards();
    let originalIndex = -1;
    for (let i = 0; i < rewards.length; i++) {
      if (rewards[i].tag === selectedReward.tag) {
        originalIndex = i;
        break;
      }
    }
    if (originalIndex === -1) {
      player.runCommand(
        `tellraw @s {"rawtext":[{"text":"§cFailed: §r§cReward not found!"}]}`,
      );
      return;
    }
    const isCurrentlyRankReward =
      selectedReward.isRankReward ||
      (selectedReward.command &&
        selectedReward.command.includes('tag @s add "rank:'));
    let currentRankName = "";
    if (isCurrentlyRankReward && selectedReward.rankName) {
      currentRankName = selectedReward.rankName;
    } else if (isCurrentlyRankReward && selectedReward.command) {
      const rankMatch = selectedReward.command.match(/tag @s add "rank:(.+?)"/);
      if (rankMatch) {
        currentRankName = rankMatch[1];
      }
    }
    const editForm = new ModalFormData()
      .title("§bEdit Battlepass Reward")
      .dropdown(
        "§eReward Type\n§8Select the type of reward",
        ["Item/Command Reward", "Rank Reward"],
        { defaultValueIndex: isCurrentlyRankReward ? 1 : 0 },
      )
      .textField(
        "§eReward Name\n§8Enter a new name for this reward",
        "Example: Iron Sword / VIP Rank",
        { defaultValue: selectedReward.name, placeholder: "Enter reward name" },
      )
      .textField(
        "§eLevel Required\n§8Level needed to claim reward",
        "Example: 10",
        {
          defaultValue: selectedReward.levelRequired.toString(),
          placeholder: "Enter level number",
        },
      )
      .textField(
        "§eTexture Path (Optional)\n§8Icon path for the reward - leave empty for default",
        "Example: textures/items/iron_sword",
        {
          defaultValue: selectedReward.texture,
          placeholder: "Leave empty for default icon",
        },
      )
      .textField(
        "§eCommand/Rank\n§8For items: give command | For ranks: rank name",
        "Example: give @s iron_sword 1 OR vip",
        {
          defaultValue: isCurrentlyRankReward
            ? currentRankName
            : selectedReward.command,
          placeholder: "Enter command or rank name",
        },
      )
      .textField(
        "§eTag Name\n§8Unique tag for tracking claims",
        "Example: claimedIronSword",
        { defaultValue: selectedReward.tag, placeholder: "Enter tag name" },
      );
    const result = await editForm.show(player);
    if (result.canceled) return;
    if (!result.formValues || result.formValues.length !== 6) {
      player.runCommand(
        `tellraw @s {"rawtext":[{"text":"§cFailed: §r§cForm error - invalid data received!"}]}`,
      );
      return;
    }
    const [rewardType, name, levelRequired, texture, commandOrRank, tag] =
      result.formValues;
    if (
      name === null ||
      name === undefined ||
      name.toString().trim() === "" ||
      levelRequired === null ||
      levelRequired === undefined ||
      levelRequired.toString().trim() === "" ||
      commandOrRank === null ||
      commandOrRank === undefined ||
      commandOrRank.toString().trim() === "" ||
      tag === null ||
      tag === undefined ||
      tag.toString().trim() === ""
    ) {
      player.runCommand(
        `tellraw @s {"rawtext":[{"text":"§cFailed: §r§cRequired fields must be filled! (Name, Level, Command/Rank, Tag)"}]}`,
      );
      return;
    }
    const level = parseInt(levelRequired.toString(), 10);
    if (isNaN(level) || level < 1 || level > 1000) {
      player.runCommand(
        `tellraw @s {"rawtext":[{"text":"§cFailed: §r§cLevel must be a valid number between 1-1000!"}]}`,
      );
      return;
    }
    if (tag !== selectedReward.tag) {
      for (const r of rewards) {
        if (r.tag === tag) {
          player.runCommand(
            `tellraw @s {"rawtext":[{"text":"§cFailed: §r§cTag already used by another reward!"}]}`,
          );
          return;
        }
      }
    }
    let command;
    let isRankReward = false;
    try {
      if (rewardType === 0) {
        command = commandOrRank.toString().trim();
      } else {
        isRankReward = true;
        const rankName = commandOrRank.toString().trim();
        if (rankName.includes('"') || rankName.includes("'")) {
          player.runCommand(
            `tellraw @s {"rawtext":[{"text":"§cFailed: §r§cRank name cannot contain quotes!"}]}`,
          );
          return;
        }
        command = `tag @s add "rank:${rankName}"`;
      }
    } catch (error) {
      player.runCommand(
        `tellraw @s {"rawtext":[{"text":"§cFailed: §r§cError processing command/rank data!"}]}`,
      );
      return;
    }
    const finalTexture =
      texture === null ||
      texture === undefined ||
      texture.toString().trim() === ""
        ? isRankReward
          ? "textures/ui/icon_setting"
          : "textures/items/paper"
        : texture.toString().trim();
    const rewardData = {
      name: name.toString().trim(),
      levelRequired: level,
      texture: finalTexture,
      command,
      tag: tag.toString().trim(),
      isRankReward: isRankReward,
      rankName: isRankReward ? commandOrRank.toString().trim() : null,
    };
    rewards[originalIndex] = rewardData;
    saveRewards(rewards);
    const rewardTypeText = isRankReward ? "rank" : "item";
    const safeName = name.toString().trim().replace(/"/g, '\\"');
    player.runCommand(
      `tellraw @s {"rawtext":[{"text":"§aSuccess! §r§a${rewardTypeText} reward \\"${safeName}\\" edited!"}]}`,
    );
    player.runCommand(`playsound random.levelup @s`);
  } catch (error) {
    player.runCommand(
      `tellraw @s {"rawtext":[{"text":"§cFailed: §r§cUnexpected error occurred!"}]}`,
    );
    console.warn(`[Battlepass Error] Edit reward failed:`, error);
  }
}
async function deleteRewardUI(player, page = 0) {
  const sortedRewards = getSortedRewardsCache();
  if (sortedRewards.length === 0) {
    player.runCommand(
      `tellraw @s {"rawtext":[{"text":"§cFailed: §r§cNo rewards to delete!"}]}`,
    );
    return;
  }
  const totalPages = Math.ceil(sortedRewards.length / PAGE_SIZE);
  const pagedRewards = sortedRewards.slice(
    page * PAGE_SIZE,
    (page + 1) * PAGE_SIZE,
  );
  const selectForm = new ActionFormData()
    .title(`§cDelete Reward (Page ${page + 1}/${totalPages})`)
    .body("§fSelect a reward to delete:");
  for (const reward of pagedRewards) {
    selectForm.button(
      `§f${reward.name}\n§r§7(Level ${reward.levelRequired})`,
      reward.texture,
    );
  }
  if (totalPages > 1) {
    if (page > 0)
      selectForm.button("§ePrevious Page", "textures/ui/arrow_left");
    if (page < totalPages - 1)
      selectForm.button("§eNext Page", "textures/ui/arrow_right");
  }
  const selection = await selectForm.show(player);
  if (selection.canceled || selection.selection === undefined) return;
  if (totalPages > 1) {
    const lastBtnIdx = pagedRewards.length;
    if (page > 0 && selection.selection === lastBtnIdx) {
      await deleteRewardUI(player, page - 1);
      return;
    }
    if (
      page < totalPages - 1 &&
      selection.selection === lastBtnIdx + (page > 0 ? 1 : 0)
    ) {
      await deleteRewardUI(player, page + 1);
      return;
    }
  }
  const selectedReward = pagedRewards[selection.selection];
  const rewards = getRewards();
  let originalIndex = -1;
  for (let i = 0; i < rewards.length; i++) {
    if (rewards[i].tag === selectedReward.tag) {
      originalIndex = i;
      break;
    }
  }
  if (originalIndex === -1) {
    player.runCommand(
      `tellraw @s {"rawtext":[{"text":"§cFailed: §r§cReward not found!"}]}`,
    );
    return;
  }
  const confirmForm = new ActionFormData()
    .title("§cConfirm Deletion")
    .body(`§fAre you sure you want to delete: §e${selectedReward.name}§f?`)
    .button("§2Yes, Delete", "textures/ui/confirm")
    .button("§4Cancel", "textures/ui/cancel");
  const confirmResult = await confirmForm.show(player);
  if (confirmResult.canceled || confirmResult.selection === 1) return;
  rewards.splice(originalIndex, 1);
  saveRewards(rewards);
  player.runCommand(
    `tellraw @s {"rawtext":[{"text":"§aSuccess! §r§aReward \"${selectedReward.name}\" deleted!"}]}`,
  );
  player.runCommand(`playsound random.levelup @s`);
}
async function viewRewardClaimedByPlayers(
  player,
  rewardPage = 0,
  playerPage = 0,
  cachedPlayers = null,
  selectedRewardCache = null,
) {
  const sortedRewards = getSortedRewardsCache();
  if (sortedRewards.length === 0) {
    player.runCommand(
      `tellraw @s {"rawtext":[{"text":"§cFailed: §r§cNo rewards to view!"}]}`,
    );
    return;
  }
  const totalRewardPages = Math.ceil(sortedRewards.length / PAGE_SIZE);
  const pagedRewards = sortedRewards.slice(
    rewardPage * PAGE_SIZE,
    (rewardPage + 1) * PAGE_SIZE,
  );
  if (!selectedRewardCache) {
    const selectForm = new ActionFormData()
      .title(
        `§bView Players Who Claimed (Page ${rewardPage + 1}/${totalRewardPages})`,
      )
      .body("§fSelect a reward to see who claimed it:");
    for (const reward of pagedRewards) {
      selectForm.button(
        `§f${reward.name}\n§r§7(Level ${reward.levelRequired})`,
        reward.texture,
      );
    }
    if (totalRewardPages > 1) {
      if (rewardPage > 0)
        selectForm.button("§ePrevious Page", "textures/ui/arrow_left");
      if (rewardPage < totalRewardPages - 1)
        selectForm.button("§eNext Page", "textures/ui/arrow_right");
    }
    const selection = await selectForm.show(player);
    if (selection.canceled || selection.selection === undefined) return;
    if (totalRewardPages > 1) {
      const lastBtnIdx = pagedRewards.length;
      if (rewardPage > 0 && selection.selection === lastBtnIdx) {
        await viewRewardClaimedByPlayers(player, rewardPage - 1, 0, null, null);
        return;
      }
      if (
        rewardPage < totalRewardPages - 1 &&
        selection.selection === lastBtnIdx + (rewardPage > 0 ? 1 : 0)
      ) {
        await viewRewardClaimedByPlayers(player, rewardPage + 1, 0, null, null);
        return;
      }
    }
    const selectedReward = pagedRewards[selection.selection];
    const allPlayers = Array.from(world.getPlayers());
    const playersWithTag = allPlayers
      .filter((p) => p.hasTag(selectedReward.tag))
      .map((p) => p.name);
    await viewRewardClaimedByPlayers(
      player,
      rewardPage,
      0,
      playersWithTag,
      selectedReward,
    );
    return;
  }
  const playersWithTag = cachedPlayers || [];
  const PAGE_PLAYER = 20;
  const totalPlayerPages = Math.ceil(playersWithTag.length / PAGE_PLAYER) || 1;
  const pagedPlayers = playersWithTag.slice(
    playerPage * PAGE_PLAYER,
    (playerPage + 1) * PAGE_PLAYER,
  );
  const playersForm = new ActionFormData()
    .title(
      `§bPlayers Claimed ${selectedRewardCache.name} (Page ${playerPage + 1}/${totalPlayerPages})`,
    )
    .body(
      pagedPlayers.length > 0
        ? `§fPlayers who claimed this reward:\n§e${pagedPlayers.join("\n§e")}`
        : "§fNo players have claimed this reward yet.",
    )
    .button("§2Back to Rewards", "textures/ui/arrow_left");
  if (totalPlayerPages > 1) {
    if (playerPage > 0)
      playersForm.button("§ePrevious Page", "textures/ui/arrow_left");
    if (playerPage < totalPlayerPages - 1)
      playersForm.button("§eNext Page", "textures/ui/arrow_right");
  }
  const selection = await playersForm.show(player);
  if (selection.canceled || selection.selection === undefined) return;
  let idx = 1;
  if (totalPlayerPages > 1) {
    if (playerPage > 0 && selection.selection === idx) {
      await viewRewardClaimedByPlayers(
        player,
        rewardPage,
        playerPage - 1,
        playersWithTag,
        selectedRewardCache,
      );
      return;
    }
    idx++;
    if (playerPage < totalPlayerPages - 1 && selection.selection === idx) {
      await viewRewardClaimedByPlayers(
        player,
        rewardPage,
        playerPage + 1,
        playersWithTag,
        selectedRewardCache,
      );
      return;
    }
  }
  await viewRewardClaimedByPlayers(player, rewardPage, 0, null, null);
}
async function showCustomItemHelp(player) {
  const helpForm = new ActionFormData()
    .title("§bBattlepass Reward Help")
    .body(
      "§fHow to add rewards to Battlepass:\n\n" +
        "§e1. Item/Command Rewards:§r\n" +
        "  §7give @s custom:item_name amount§r\n" +
        "  §7give @s diamond_sword 1§r\n" +
        "  §7effect @s strength 300 1§r\n\n" +
        "§e2. Rank Rewards:§r\n" +
        "  §7Select 'Rank Reward' type§r\n" +
        "  §7Enter rank name: §fvip§r\n" +
        '  §7System will create: §ftag @s add "rank:vip"§r\n\n' +
        "§e3. Rank Examples:§r\n" +
        "  §7vip §f→ §7rank:vip§r\n" +
        "  §7premium §f→ §7rank:premium§r\n" +
        "  §7diamond §f→ §7rank:diamond§r\n\n" +
        "§e4. Texture Paths (Optional):§r\n" +
        "  §7Items: textures/items/item_name§r\n" +
        "  §7Ranks: textures/ui/rank_icon§r\n" +
        "  §7Default: paper icon for items, setting icon for ranks§r\n\n" +
        "§e5. Multiple Commands:§r\n" +
        "  §7Use '/execute @s ~ ~ ~ ' before each command§r\n" +
        "  §7Example: §f/execute @s ~ ~ ~ give @s diamond 5§r\n" +
        "  §7         §f/execute @s ~ ~ ~ effect @s strength 300 1§r\n\n" +
        "§fNote: Rank rewards automatically remove old ranks and add new ones.",
    )
    .button("§2Back to Admin Menu", "textures/ui/arrow_left");
  await helpForm.show(player);
}
export async function openBattlepassAdmin(player) {
  const adminMenu = new ActionFormData()
    .title("§bBATTLEPASS ADMIN MENU")
    .body("§fSelect an option:")
    .button(
      "§aAdd Reward\n§r§7Add a new reward",
      "textures/ui/Add-Ons_Nav_Icon36x36",
    )
    .button(
      "§eEdit Reward\n§r§7Modify existing reward",
      "textures/ui/icon_setting",
    )
    .button(
      "§cDelete Reward\n§r§7Remove existing reward",
      "textures/ui/icon_trash",
    )
    .button(
      "§bView Players\n§r§7See who claimed rewards",
      "textures/ui/icon_multiplayer",
    )
    .button(
      "§dReward Help\n§r§7How to add items & ranks",
      "textures/ui/blue_info_glyph",
    );
  const result = await adminMenu.show(player);
  if (result.canceled) return;
  switch (result.selection) {
    case 0:
      await addRewardUI(player);
      break;
    case 1:
      await editRewardUI(player);
      break;
    case 2:
      await deleteRewardUI(player);
      break;
    case 3:
      await viewRewardClaimedByPlayers(player);
      break;
    case 4:
      await showCustomItemHelp(player);
      break;
  }
  system.runTimeout(() => player.addTag("bpAdmin"), 10);
}
system.runInterval(() => {
  for (const player of world.getPlayers()) {
    if (player.hasTag("bpAdmin")) {
      player.runCommand(`playsound note.pling @s`);
      openBattlepassAdmin(player);
      player.removeTag("bpAdmin");
    }
  }
}, 20);
