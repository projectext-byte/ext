export const QuestType = {
    DAILY: "DAILY",      
    WEEKLY: "WEEKLY",    
    MONTHLY: "MONTHLY",  
    SPECIAL: "SPECIAL"   
};
export const QuestCategory = {
    MINING: "MINING",          
    COMBAT: "COMBAT",          
    FARMING: "FARMING",        
    EXPLORATION: "EXPLORATION",
    CRAFTING: "CRAFTING"      
};
export function getQuestTypeName(type) {
    switch (type) {
        case QuestType.DAILY:
            return "Daily Quest";
        case QuestType.WEEKLY:
            return "Weekly Quest";
        case QuestType.MONTHLY:
            return "Monthly Quest";
        case QuestType.SPECIAL:
            return "Special Quest";
        default:
            return "Unknown Quest Type";
    }
}
export function getQuestCategoryName(category) {
    switch (category) {
        case QuestCategory.MINING:
            return "Mining Quest";
        case QuestCategory.COMBAT:
            return "Combat Quest";
        case QuestCategory.FARMING:
            return "Farming Quest";
        case QuestCategory.EXPLORATION:
            return "Exploration Quest";
        case QuestCategory.CRAFTING:
            return "Crafting Quest";
        default:
            return "Unknown Category";
    }
}
export function getQuestCategoryIcon(category) {
    switch (category) {
        case QuestCategory.MINING:
            return "textures/ui/diamond";
        case QuestCategory.COMBAT:
            return "textures/ui/sword";
        case QuestCategory.FARMING:
            return "textures/ui/seeds";
        case QuestCategory.EXPLORATION:
            return "textures/ui/map_blank";
        case QuestCategory.CRAFTING:
            return "textures/ui/crafting_table";
        default:
            return "textures/ui/question_mark";
    }
}
export function getDefaultQuestDescription(type) {
    switch (type) {
        case QuestType.DAILY:
            return "Complete this quest within 24 hours";
        case QuestType.WEEKLY:
            return "Complete this quest within 7 days";
        case QuestType.MONTHLY:
            return "Complete this quest within 30 days";
        case QuestType.SPECIAL:
            return "Limited time special quest";
        default:
            return "No description available";
    }
}
export function getQuestTypeCooldown(type) {
    switch (type) {
        case QuestType.DAILY:
            return 24 * 60 * 60 * 1000; 
        case QuestType.WEEKLY:
            return 7 * 24 * 60 * 60 * 1000; 
        case QuestType.MONTHLY:
            return 30 * 24 * 60 * 60 * 1000; 
        case QuestType.SPECIAL:
            return null; 
        default:
            return 24 * 60 * 60 * 1000; 
    }
}
export function getDefaultQuestReward(type) {
    switch (type) {
        case QuestType.DAILY:
            return {
                money: 1000,
                items: [
                    { id: "minecraft:diamond", count: 1 }
                ]
            };
        case QuestType.WEEKLY:
            return {
                money: 5000,
                items: [
                    { id: "minecraft:diamond", count: 5 },
                    { id: "minecraft:emerald", count: 10 }
                ]
            };
        case QuestType.MONTHLY:
            return {
                money: 20000,
                items: [
                    { id: "minecraft:diamond", count: 20 },
                    { id: "minecraft:emerald", count: 40 },
                    { id: "minecraft:netherite_ingot", count: 1 }
                ]
            };
        case QuestType.SPECIAL:
            return {
                money: 10000,
                items: [
                    { id: "minecraft:diamond", count: 10 },
                    { id: "minecraft:emerald", count: 20 }
                ]
            };
        default:
            return {
                money: 1000,
                items: [
                    { id: "minecraft:diamond", count: 1 }
                ]
            };
    }
} 