import { world } from "../../core.js"
import { ActionFormData, ModalFormData } from "../../core.js"
import { getAllRanks, getPlayerRank, openAdminPanel } from "./rank.js"
const BENEFITS_KEY = "rank_benefits"
function saveRankBenefits(benefits) {
  try {
    world.setDynamicProperty(BENEFITS_KEY, JSON.stringify(benefits))
  } catch (error) {
    console.warn("Error saving rank benefits:", error)
  }
}
function getRankBenefits() {
  try {
    const savedBenefits = world.getDynamicProperty(BENEFITS_KEY)
    return savedBenefits ? JSON.parse(savedBenefits) : {}
  } catch (error) {
    console.warn("Error loading rank benefits:", error)
    return {}
  }
}
export function showRankBenefitsMenu(player) {
  const form = new ActionFormData()
    .title("§6Rank Benefits Manager")
    .body("§7Select a rank to configure benefits\n\nif the logo doesn't appear, please go to the set rank menu first")
  const ranks = getAllRanks()
  const benefits = getRankBenefits()
  for (const rank of ranks) {
    const rankBenefits = benefits[rank] || {}
    const benefitCount = Object.keys(rankBenefits).length
    form.button(`${rank}\n§7${benefitCount} benefits configured`)
  }
  form.button("§aBack to Admin Panel", "textures/ui/arrow_left")
  form.show(player).then(response => {
    if (response.canceled) return
    if (response.selection === ranks.length) {
      openAdminPanel(player)
    } else {
      const selectedRank = ranks[response.selection]
      showRankBenefitDetails(player, selectedRank)
    }
  })
}
function showRankBenefitDetails(player, rank) {
  const benefits = getRankBenefits()
  const rankBenefits = benefits[rank] || {}
  const form = new ActionFormData()
    .title(`§6Benefits for ${rank}`)
    .body("§7Configure benefits for this rank")
  const landBenefits = rankBenefits.land || {}
  const maxClaims = landBenefits.maxClaims || "Default"
  const claimSize = landBenefits.maxClaimSize || "Default"
  form.button(`§aLand Benefits\n§7Max Claims: ${maxClaims} | Max Size: ${claimSize} `, "textures/ui/icon_best3")
  const economyBenefits = rankBenefits.economy || {}
  const dailyBonus = economyBenefits.dailyBonus || "None"
  const discount = economyBenefits.discount || "0%"
  form.button(`§6Economy Benefits\n§7Daily: ${dailyBonus} | Discount: ${discount} `, "textures/ui/free_download_symbol")
  const pwarpBenefits = rankBenefits.pwarps || {}
  const personalLimit = pwarpBenefits.personal_limit || "Default"
  const publicLimit = pwarpBenefits.public_limit || "Default"
  form.button(`§dPlayer Warps\n§7Personal: ${personalLimit} | Public: ${publicLimit} `, "textures/ui/icon_recipe_construction")
  const sethomeBenefits = rankBenefits.sethome || {}
  const maxHomes = sethomeBenefits.maxHomes || "Default"
  form.button(`§bSet Home Benefits\n§7Max Homes: ${maxHomes}`, "textures/ui/icon_recipe_item")
  form.button("§cBack", "textures/ui/arrow_left")
  form.show(player).then(response => {
    if (response.canceled) {
      showRankBenefitsMenu(player)
      return
    }
    switch (response.selection) {
      case 0:
        showLandBenefits(player, rank)
        break
      case 1:
        showEconomyBenefits(player, rank)
        break
      case 2:
        showPwarpBenefits(player, rank)
        break
      case 3:
        showSethomeBenefits(player, rank)
        break
      case 4:
        showRankBenefitsMenu(player)
        break
    }
  })
}
function showLandBenefits(player, rank) {
  const benefits = getRankBenefits()
  const rankBenefits = benefits[rank] || {}
  const landBenefits = rankBenefits.land || {}
  const form = new ModalFormData()
    .title(`§6Land Benefits for ${rank}`)
    .textField("Max Claims\n§7Number of land claims allowed (0 = default)", "Enter number...", {
      defaultValue: String(landBenefits.maxClaims || "0")
    })
    .textField("Max Claim Size\n§7Maximum blocks per claim (0 = default)", "Enter number...", {
      defaultValue: String(landBenefits.maxClaimSize || "0")
    })
    .toggle("Free Claims\n§7Allow free land claims", {
      defaultValue: landBenefits.freeClaims || false
    })
    .toggle("Extended Protection\n§7Allow protection in The End", {
      defaultValue: landBenefits.endProtection || false
    })
  form.show(player).then(response => {
    if (response.canceled) {
      showRankBenefitDetails(player, rank)
      return
    }
    const [maxClaims, maxClaimSize, freeClaims, endProtection] = response.formValues
    const benefits = getRankBenefits()
    if (!benefits[rank]) benefits[rank] = {}
    benefits[rank].land = {
      maxClaims: parseInt(maxClaims) || 0,
      maxClaimSize: parseInt(maxClaimSize) || 0,
      freeClaims: freeClaims,
      endProtection: endProtection
    }
    saveRankBenefits(benefits)
    player.sendMessage("§aLand benefits updated!")
    showRankBenefitDetails(player, rank)
  })
}
function showEconomyBenefits(player, rank) {
  const benefits = getRankBenefits()
  const rankBenefits = benefits[rank] || {}
  const economyBenefits = rankBenefits.economy || {}
  const form = new ModalFormData()
    .title(`§6Economy Benefits for ${rank}`)
    .textField("Daily Bonus\n§7Money given daily (0 = none)", "Enter amount...", {
      defaultValue: String(economyBenefits.dailyBonus || "0")
    })
    .slider("Shop Discount\n§7Percentage discount in shops", 0, 100, {
      defaultValue: economyBenefits.discount || 0,
      valueStep: 5
    })
    .toggle("Reduced Teleport Cost\n§7Lower warp teleport costs", {
      defaultValue: economyBenefits.reducedTeleportCost || false
    })
    .toggle("Increased Rewards\n§7Bonus money from activities", {
      defaultValue: economyBenefits.increasedRewards || false
    })
  form.show(player).then(response => {
    if (response.canceled) {
      showRankBenefitDetails(player, rank)
      return
    }
    const [dailyBonus, discount, reducedTeleportCost, increasedRewards] = response.formValues
    const benefits = getRankBenefits()
    if (!benefits[rank]) benefits[rank] = {}
    benefits[rank].economy = {
      dailyBonus: parseInt(dailyBonus) || 0,
      discount: discount,
      reducedTeleportCost: reducedTeleportCost,
      increasedRewards: increasedRewards
    }
    saveRankBenefits(benefits)
    player.sendMessage("§aEconomy benefits updated!")
    showRankBenefitDetails(player, rank)
  })
}
function showSethomeBenefits(player, rank) {
  const benefits = getRankBenefits()
  const rankBenefits = benefits[rank] || {}
  const sethomeBenefits = rankBenefits.sethome || {}
  const form = new ModalFormData()
    .title(`§6Set Home Benefits for ${rank}`)
    .textField("Max Homes\n§7Maximum number of homes (0 = default)", "Enter number...", {
      defaultValue: String(sethomeBenefits.maxHomes || "0")
    })
  form.show(player).then(response => {
    if (response.canceled) {
      showRankBenefitDetails(player, rank)
      return
    }
    const [maxHomes] = response.formValues
    const benefits = getRankBenefits()
    if (!benefits[rank]) benefits[rank] = {}
    benefits[rank].sethome = {
      maxHomes: parseInt(maxHomes) || 0
    }
    saveRankBenefits(benefits)
    player.sendMessage("§aSet Home benefits updated!")
    showRankBenefitDetails(player, rank)
  })
}
function showPwarpBenefits(player, rank) {
  const benefits = getRankBenefits()
  const rankBenefits = benefits[rank] || {}
  const pwarpBenefits = rankBenefits.pwarps || {}
  const form = new ModalFormData()
    .title(`§6PWarps for ${rank}`)
    .textField("Max Personal Warps\n§7(0 = default)", "Enter number...", {
      defaultValue: String(pwarpBenefits.personal_limit || "0")
    })
    .textField("Max Public Warps\n§7(0 = default)", "Enter number...", {
      defaultValue: String(pwarpBenefits.public_limit || "0")
    })
  form.show(player).then(response => {
    if (response.canceled) {
      showRankBenefitDetails(player, rank)
      return
    }
    const [personalLimit, publicLimit] = response.formValues
    const benefits = getRankBenefits()
    if (!benefits[rank]) benefits[rank] = {}
    benefits[rank].pwarps = {
      personal_limit: parseInt(personalLimit) || 0,
      public_limit: parseInt(publicLimit) || 0
    }
    saveRankBenefits(benefits)
    player.sendMessage("§aPWarp benefits updated!")
    showRankBenefitDetails(player, rank)
  })
}
export function getRankBenefit(rank, benefitType) {
  const benefits = getRankBenefits()
  const rankBenefits = benefits[rank] || {}
  return rankBenefits[benefitType]
}
export function hasWarpAccess(player, warpName) {
  return true
}
export function getLandBenefits(player) {
  const rank = getPlayerRank(player)
  return getRankBenefit(rank, "land") || {}
}
export function getEconomyBenefits(player) {
  const rank = getPlayerRank(player)
  return getRankBenefit(rank, "economy") || {}
}
export function hasPermission(player, permission) {
  const rank = getPlayerRank(player)
  const permissions = getRankBenefit(rank, "permissions") || []
  return permissions.includes(permission)
}
export function getPwarpBenefits(player) {
  const rank = getPlayerRank(player)
  return getRankBenefit(rank, "pwarps") || {}
}
export function getSethomeBenefits(player) {
  const rank = getPlayerRank(player)
  return getRankBenefit(rank, "sethome") || {}
}
