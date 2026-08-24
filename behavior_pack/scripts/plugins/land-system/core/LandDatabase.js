import { system, world } from '../../../core.js';
import { getProtectedRegions, isInProtectedRegion } from '../../../admin_menu/lobby_protect/config.js';
const claimCache = new Map();
const playerNameCache = new Map();
const CACHE_LIFETIME = 60000;
export class LandDatabase {
    static CLAIMS_PREFIX = "land_claims_";
    static PLAYER_NAMES_KEY = "land_player_names";
    static CLAIM_COUNTER_KEY = "land_claim_counter";
    static OLD_CLAIMS_KEY = "land_claims";
    static init() {
        system.run(async () => {
            if (!world.getDynamicProperty(this.PLAYER_NAMES_KEY)) {
                world.setDynamicProperty(this.PLAYER_NAMES_KEY, "{}");
            }
            if (!world.getDynamicProperty(this.CLAIM_COUNTER_KEY)) {
                world.setDynamicProperty(this.CLAIM_COUNTER_KEY, "0");
            }
            await this.migrateOldData();
        });
    }
    static async migrateOldData() {
        try {
            const oldClaimsData = world.getDynamicProperty(this.OLD_CLAIMS_KEY);
            if (!oldClaimsData) return;
            const oldClaims = JSON.parse(oldClaimsData);
            if (!oldClaims || Object.keys(oldClaims).length === 0) return;
            console.warn("[Land System] Starting data migration...");
            const claimsByOwner = {};
            for (const [claimId, claim] of Object.entries(oldClaims)) {
                if (!claim.owner) continue;
                if (!claimsByOwner[claim.owner]) {
                    claimsByOwner[claim.owner] = [];
                }
                claimsByOwner[claim.owner].push({
                    ...claim,
                    claimId
                });
            }
            for (const [ownerId, claims] of Object.entries(claimsByOwner)) {
                const claimKey = this.getPlayerClaimKey(ownerId);
                world.setDynamicProperty(claimKey, JSON.stringify(claims));
            }
            const backupKey = `${this.OLD_CLAIMS_KEY}_backup_${Date.now()}`;
            world.setDynamicProperty(backupKey, oldClaimsData);
            world.setDynamicProperty(this.OLD_CLAIMS_KEY, null);
            console.warn("[Land System] Data migration completed successfully!");
            console.warn(`[Land System] Backup saved as: ${backupKey}`);
        } catch (e) {
            console.warn("[Land System] Migration error:", e);
        }
    }
    static getPlayerClaimKey(playerId) {
        return `${this.CLAIMS_PREFIX}${playerId}`;
    }
    static generateClaimId(playerId) {
        const counter = parseInt(world.getDynamicProperty(this.CLAIM_COUNTER_KEY) || "0");
        const newCounter = counter + 1;
        world.setDynamicProperty(this.CLAIM_COUNTER_KEY, newCounter.toString());
        return `claim_${playerId}_${Date.now()}_${newCounter}`;
    }
    static cleanupCache() {
        const now = Date.now();
        for (const [key, data] of claimCache.entries()) {
            if (now - data.timestamp > CACHE_LIFETIME) {
                claimCache.delete(key);
            }
        }
        for (const [key, data] of playerNameCache.entries()) {
            if (now - data.timestamp > CACHE_LIFETIME) {
                playerNameCache.delete(key);
            }
        }
    }
    static getPlayerName(playerId) {
        const cachedName = playerNameCache.get(playerId);
        if (cachedName && Date.now() - cachedName.timestamp < CACHE_LIFETIME) {
            return cachedName.name;
        }
        try {
            const namesData = JSON.parse(world.getDynamicProperty(this.PLAYER_NAMES_KEY) || "{}");
            const name = namesData[playerId] || playerId;
            playerNameCache.set(playerId, {
                name,
                timestamp: Date.now()
            });
            return name;
        } catch {
            return playerId;
        }
    }
    static updatePlayerName(playerId, playerName) {
        try {
            const namesData = JSON.parse(world.getDynamicProperty(this.PLAYER_NAMES_KEY) || "{}");
            namesData[playerId] = playerName;
            world.setDynamicProperty(this.PLAYER_NAMES_KEY, JSON.stringify(namesData));
            playerNameCache.set(playerId, {
                name: playerName,
                timestamp: Date.now()
            });
            return true;
        } catch {
            return false;
        }
    }
    static async getAllClaims() {
        try {
            const allClaims = [];
            const processedPlayerIds = new Set();
            const allPlayers = world.getAllPlayers();
            for (const player of allPlayers) {
                processedPlayerIds.add(player.id);
                const claims = await this.getPlayerClaims(player.id);
                allClaims.push(...claims);
            }
            try {
                const allDynamicProps = world.getDynamicPropertyIds();
                if (allDynamicProps) {
                    for (const propId of allDynamicProps) {
                        if (propId?.startsWith(this.CLAIMS_PREFIX)) {
                            const playerId = propId.substring(this.CLAIMS_PREFIX.length);
                            if (!processedPlayerIds.has(playerId)) {
                                processedPlayerIds.add(playerId);
                                const claims = await this.getPlayerClaims(playerId);
                                allClaims.push(...claims);
                            }
                        }
                    }
                }
            } catch (dynamicPropsError) {
                console.warn("Error accessing dynamic properties:", dynamicPropsError);
            }
            return allClaims;
        } catch (e) {
            console.warn("Error getting all claims:", e);
            return [];
        }
    }
    static async getPlayerClaims(playerId) {
        try {
            const claimKey = this.getPlayerClaimKey(playerId);
            const claimsData = world.getDynamicProperty(claimKey);
            return claimsData ? JSON.parse(claimsData) : [];
        } catch (e) {
            console.warn("Error getting player claims:", e);
            return [];
        }
    }
    static async getClaimAtPosition(location) {
        if (!location || typeof location.x !== 'number' || typeof location.z !== 'number') {
            return null;
        }
        const claims = await this.getAllClaims();
        if (!claims || claims.length === 0) {
            return null;
        }
        for (const claim of claims) {
            if (this.isPositionInClaim(location, claim)) {
                return claim;
            }
        }
        return null;
    }
    static isPositionInClaim(pos, claim) {
        if (!claim?.pos1 || !claim?.pos2) return false;
        const pos1 = {
            x: Math.floor(claim.pos1.x),
            z: Math.floor(claim.pos1.z)
        };
        const pos2 = {
            x: Math.floor(claim.pos2.x),
            z: Math.floor(claim.pos2.z)
        };
        const minX = Math.min(pos1.x, pos2.x);
        const maxX = Math.max(pos1.x, pos2.x);
        const minZ = Math.min(pos1.z, pos2.z);
        const maxZ = Math.max(pos1.z, pos2.z);
        const x = Math.floor(pos.x);
        const z = Math.floor(pos.z);
        return x >= minX && x <= maxX && z >= minZ && z <= maxZ;
    }
    static async checkClaimOverlap(pos1, pos2, excludeClaimId = null) {
        const claims = await this.getAllClaims();
        const minX = Math.min(pos1.x, pos2.x);
        const maxX = Math.max(pos1.x, pos2.x);
        const minZ = Math.min(pos1.z, pos2.z);
        const maxZ = Math.max(pos1.z, pos2.z);
        for (const claim of claims) {
            if (excludeClaimId && claim.claimId === excludeClaimId) continue;
            const claimMinX = Math.min(claim.pos1.x, claim.pos2.x);
            const claimMaxX = Math.max(claim.pos1.x, claim.pos2.x);
            const claimMinZ = Math.min(claim.pos1.z, claim.pos2.z);
            const claimMaxZ = Math.max(claim.pos1.z, claim.pos2.z);
            if (!(maxX < claimMinX || minX > claimMaxX || maxZ < claimMinZ || minZ > claimMaxZ)) {
                return {
                    overlaps: true,
                    withClaim: claim,
                    overlapType: 'land_claim'
                };
            }
        }
        const lobbyRegions = getProtectedRegions();
        for (const region of lobbyRegions) {
            const regionMinX = Math.min(region.pos1.x, region.pos2.x);
            const regionMaxX = Math.max(region.pos1.x, region.pos2.x);
            const regionMinZ = Math.min(region.pos1.z, region.pos2.z);
            const regionMaxZ = Math.max(region.pos1.z, region.pos2.z);
            if (!(maxX < regionMinX || minX > regionMaxX || maxZ < regionMinZ || minZ > regionMaxZ)) {
                return {
                    overlaps: true,
                    withClaim: region,
                    overlapType: 'lobby_protection'
                };
            }
        }
        return {
            overlaps: false,
            withClaim: null,
            overlapType: null
        };
    }
    static async saveLandClaim(playerId, claimData) {
        try {
            const claims = await this.getPlayerClaims(playerId);
            const claimId = this.generateClaimId(playerId);
            const allClaims = await this.getAllClaims();
            if (this.checkOverlap(claimData, allClaims)) {
                throw new Error("overlaps");
            }
            const newClaim = {
                ...claimData,
                claimId,
                owner: playerId,
                createdAt: Date.now()
            };
            claims.push(newClaim);
            const claimKey = this.getPlayerClaimKey(playerId);
            world.setDynamicProperty(claimKey, JSON.stringify(claims));
            return claimId;
        } catch (e) {
            console.warn("Error saving land claim:", e);
            throw e;
        }
    }
    static async updateClaim(claimId, updatedData) {
        try {
            const processedPlayerIds = new Set();
            const allPlayers = world.getAllPlayers();
            for (const player of allPlayers) {
                processedPlayerIds.add(player.id);
                const claims = await this.getPlayerClaims(player.id);
                const claimIndex = claims.findIndex(c => c.claimId === claimId);
                if (claimIndex !== -1) {
                    claims[claimIndex] = {
                        ...claims[claimIndex],
                        ...updatedData,
                        lastModified: Date.now()
                    };
                    const claimKey = this.getPlayerClaimKey(player.id);
                    world.setDynamicProperty(claimKey, JSON.stringify(claims));
                    return true;
                }
            }
            try {
                const allDynamicProps = world.getDynamicPropertyIds();
                if (allDynamicProps) {
                    for (const propId of allDynamicProps) {
                        if (propId?.startsWith(this.CLAIMS_PREFIX)) {
                            const playerId = propId.substring(this.CLAIMS_PREFIX.length);
                            if (!processedPlayerIds.has(playerId)) {
                                processedPlayerIds.add(playerId);
                                const claims = await this.getPlayerClaims(playerId);
                                const claimIndex = claims.findIndex(c => c.claimId === claimId);
                                if (claimIndex !== -1) {
                                    claims[claimIndex] = {
                                        ...claims[claimIndex],
                                        ...updatedData,
                                        lastModified: Date.now()
                                    };
                                    const claimKey = this.getPlayerClaimKey(playerId);
                                    world.setDynamicProperty(claimKey, JSON.stringify(claims));
                                    return true;
                                }
                            }
                        }
                    }
                }
            } catch (dynamicPropsError) {
                console.warn("Error accessing dynamic properties:", dynamicPropsError);
            }
            return false;
        } catch (e) {
            console.warn("Error updating claim:", e);
            return false;
        }
    }
    static async removeClaim(claimId) {
        try {
            const processedPlayerIds = new Set();
            const allPlayers = world.getAllPlayers();
            for (const player of allPlayers) {
                processedPlayerIds.add(player.id);
                const claims = await this.getPlayerClaims(player.id);
                const claimIndex = claims.findIndex(c => c.claimId === claimId);
                if (claimIndex !== -1) {
                    claims.splice(claimIndex, 1);
                    const claimKey = this.getPlayerClaimKey(player.id);
                    world.setDynamicProperty(claimKey, JSON.stringify(claims));
                    return true;
                }
            }
            try {
                const allDynamicProps = world.getDynamicPropertyIds();
                if (allDynamicProps) {
                    for (const propId of allDynamicProps) {
                        if (propId?.startsWith(this.CLAIMS_PREFIX)) {
                            const playerId = propId.substring(this.CLAIMS_PREFIX.length);
                            if (!processedPlayerIds.has(playerId)) {
                                processedPlayerIds.add(playerId);
                                const claims = await this.getPlayerClaims(playerId);
                                const claimIndex = claims.findIndex(c => c.claimId === claimId);
                                if (claimIndex !== -1) {
                                    claims.splice(claimIndex, 1);
                                    const claimKey = this.getPlayerClaimKey(playerId);
                                    world.setDynamicProperty(claimKey, JSON.stringify(claims));
                                    return true;
                                }
                            }
                        }
                    }
                }
            } catch (dynamicPropsError) {
                console.warn("Error accessing dynamic properties:", dynamicPropsError);
            }
            return false;
        } catch (e) {
            console.warn("Error removing claim:", e);
            return false;
        }
    }
    static async removeMember(claimId, memberId) {
        try {
            const processedPlayerIds = new Set();
            const allPlayers = world.getAllPlayers();
            for (const player of allPlayers) {
                processedPlayerIds.add(player.id);
                const claims = await this.getPlayerClaims(player.id);
                const claimIndex = claims.findIndex(c => c.claimId === claimId);
                if (claimIndex !== -1) {
                    claims[claimIndex].members = claims[claimIndex].members.filter(m => m.id !== memberId);
                    const claimKey = this.getPlayerClaimKey(player.id);
                    world.setDynamicProperty(claimKey, JSON.stringify(claims));
                    return true;
                }
            }
            try {
                const allDynamicProps = world.getDynamicPropertyIds();
                if (allDynamicProps) {
                    for (const propId of allDynamicProps) {
                        if (propId?.startsWith(this.CLAIMS_PREFIX)) {
                            const playerId = propId.substring(this.CLAIMS_PREFIX.length);
                            if (!processedPlayerIds.has(playerId)) {
                                processedPlayerIds.add(playerId);
                                const claims = await this.getPlayerClaims(playerId);
                                const claimIndex = claims.findIndex(c => c.claimId === claimId);
                                if (claimIndex !== -1) {
                                    claims[claimIndex].members = claims[claimIndex].members.filter(m => m.id !== memberId);
                                    const claimKey = this.getPlayerClaimKey(playerId);
                                    world.setDynamicProperty(claimKey, JSON.stringify(claims));
                                    return true;
                                }
                            }
                        }
                    }
                }
            } catch (dynamicPropsError) {
                console.warn("Error accessing dynamic properties:", dynamicPropsError);
            }
            return false;
        } catch (error) {
            console.warn("Error removing member:", error);
            return false;
        }
    }
    static checkOverlap(newClaim, existingClaims) {
        for (const claim of existingClaims) {
            if (this.doClaimsOverlap(newClaim, claim)) {
                return true;
            }
        }
        return false;
    }
    static doClaimsOverlap(claim1, claim2) {
        if (claim1.pos1.dimension !== claim2.pos1.dimension) {
            return false;
        }
        const aLeft = Math.min(claim1.pos1.x, claim1.pos2.x);
        const aRight = Math.max(claim1.pos1.x, claim1.pos2.x);
        const aTop = Math.min(claim1.pos1.z, claim1.pos2.z);
        const aBottom = Math.max(claim1.pos1.z, claim1.pos2.z);
        const bLeft = Math.min(claim2.pos1.x, claim2.pos2.x);
        const bRight = Math.max(claim2.pos1.x, claim2.pos2.x);
        const bTop = Math.min(claim2.pos1.z, claim2.pos2.z);
        const bBottom = Math.max(claim2.pos1.z, claim2.pos2.z);
        return !(aLeft > bRight || aRight < bLeft || aTop > bBottom || aBottom < bTop);
    }
}
