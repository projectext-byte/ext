import { ModalFormData, world, ActionFormData, ItemStack, system } from '../../core.js';
import { GlobalConfig } from '../../function/GlobalConfig.js';
let bannedItems = []
let bannedItemsSet = new Set()
let autoClearEnabled = false
let isInitialized = false

function saveBannedItems() {
    try {
        GlobalConfig.set('bannedItems', Array.from(bannedItemsSet))
    } catch (e) {
        console.warn("[BanItem] Error saving banned items:", e)
    }
}
function loadBannedItems() {
    try {
        const data = GlobalConfig.get('bannedItems')
        if (data) {
            const parsed = typeof data === 'string' && data.length ? JSON.parse(data) : data
            bannedItems = parsed || []
            bannedItemsSet = new Set(bannedItems)
        } else {
            bannedItems = []
            bannedItemsSet = new Set()
        }
    } catch (e) {
        console.warn("[BanItem] Error loading banned items:", e)
    }
}
function syncBannedItems() {
    loadBannedItems()
    saveBannedItems()
}

function loadAutoClearStatus() {
    try {
        const val = GlobalConfig.get('banItemAutoClearEnabled')
        if (val !== undefined && val !== null) {
            autoClearEnabled = Boolean(val)
        }
    } catch (e) {
        console.warn("[BanItem] Error loading autoClearStatus:", e)
    }
}
function saveAutoClearStatus() {
    try {
        GlobalConfig.set('banItemAutoClearEnabled', autoClearEnabled)
    } catch (e) {
        console.warn("[BanItem] Error saving autoClearStatus:", e)
    }
}

function initializeBanItem() {
    loadBannedItems()
    loadAutoClearStatus()
    isInitialized = true
    console.warn(`[BanItem] Initialized - autoClear: ${autoClearEnabled}, items: ${bannedItems.length}`)
}
function toggleAutoClear(player) {
    loadAutoClearStatus()
    autoClearEnabled = !autoClearEnabled
    saveAutoClearStatus()
    player.sendMessage(`§eAuto Clear Banned Item is now ${autoClearEnabled ? '§aENABLED' : '§cDISABLED'}`)
}
function openBanItemMenu(player) {
    loadBannedItems()
    loadAutoClearStatus()
    new ActionFormData()
        .title('§cBan Item System')
        .body('Choose an action:')
        .button('§aBan Item')
        .button('§eUnban Item')
        .button('§cShow Banned Items')
        .button(`${autoClearEnabled ? '§cDisable' : '§aEnable'} Auto Clear`)
        .show(player)
        .then(res => {
            if (!res || res.canceled || res.selection === undefined) return
            if (res.selection === 0) {
                showBanItemModal(player)
            } else if (res.selection === 1) {
                openUnbanMenu(player)
            } else if (res.selection === 2) {
                showBannedItemsList(player)
            } else if (res.selection === 3) {
                toggleAutoClear(player)
            }
        })
}
function showBannedItemsList(player) {
    loadBannedItems()
    if (!bannedItems.length) {
        player.sendMessage('§7No banned items yet.')
        return
    }
    player.sendMessage('§eBanned Items:')
    bannedItems.forEach((id, i) => player.sendMessage(`§f${i + 1}. §c${id}`))
}
function showBanItemModal(player) {
    loadBannedItems()
    if (bannedItems.length) {
        player.sendMessage('§eBanned Items:')
        bannedItems.forEach((id, i) => player.sendMessage(`§f${i + 1}. §c${id}`))
    } else {
        player.sendMessage('§7No banned items yet.')
    }
    new ModalFormData()
        .title('§cBan Item')
        .textField(
            '§eItem ID\n§7Enter the item ID to ban',
            'minecraft:diamond_sword',
            { defaultValue: '', placeholder: 'minecraft:diamond_sword' }
        )
        .show(player)
        .then(res => {
            if (!res || res.canceled || !res.formValues) return
            const itemId = res.formValues[0]?.trim()
            if (!itemId) {
                player.sendMessage('§c⚠ Item ID cannot be empty!')
                return
            }
            if (!itemId.includes(':')) {
                player.sendMessage('§c⚠ Invalid item ID format! Example: minecraft:diamond_sword')
                return
            }
            loadBannedItems()
            if (bannedItemsSet.has(itemId)) {
                player.sendMessage(`§cItem §e${itemId} §cis already banned!`)
                return
            }
            bannedItemsSet.add(itemId)
            saveBannedItems()
            player.sendMessage(`§aItem §e${itemId} §chas been banned!`)
            checkAndRemoveBannedItems(player)
        })
}
function openUnbanMenu(player) {
    loadBannedItems()
    if (!bannedItems.length) {
        player.sendMessage('§7No banned items to unban.')
        return
    }
    const form = new ModalFormData()
        .title('§eUnban Item')
        .dropdown('Select item to unban', bannedItems, { defaultValue: 0 })
    form.show(player).then(res => {
        if (!res || res.canceled || !res.formValues) return
        const idx = res.formValues[0]
        loadBannedItems()
        const itemId = bannedItems[idx]
        if (!itemId) return
        bannedItemsSet.delete(itemId)
        saveBannedItems()
        player.sendMessage(`§aItem §e${itemId} §chas been unbanned!`)
        checkAndRemoveBannedItems(player)
    })
}
function checkAndRemoveBannedItems(player) {
    loadBannedItems()
    const inv = player.getComponent('minecraft:inventory')?.container
    if (!inv) return
    for (const itemId of bannedItemsSet) {
        let found = false
        for (let i = 0; i < inv.size; i++) {
            const item = inv.getItem(i)
            if (item && item.typeId === itemId) {
                found = true
                break
            }
        }
        if (found) {
            player.runCommand(`clear @s ${itemId}`)
            player.sendMessage(`§cItem §e${itemId} §chas been banned and removed from your inventory!`)
        }
    }
}
let intervalId = system.runInterval(() => {
    if (!isInitialized) return
    if (!autoClearEnabled) return
    for (const player of world.getPlayers()) {
        checkAndRemoveBannedItems(player)
    }
}, 50)

world.afterEvents.worldLoad.subscribe(() => {
    isInitialized = false
    system.runTimeout(() => {
        initializeBanItem()
    }, 60)
})

system.runTimeout(() => {
    if (!isInitialized) {
        initializeBanItem()
    }
}, 80)

export { openBanItemMenu, bannedItems, checkAndRemoveBannedItems, loadBannedItems, saveBannedItems, syncBannedItems }
