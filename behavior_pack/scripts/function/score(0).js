import { world } from '../core.js';
export class Score {
	static set(entity, objective, value) {
		try {
			const obj = world.scoreboard.getObjective(objective) ?? world.scoreboard.addObjective(objective)
			return obj.setScore(entity, value)
		} catch {
			return false
		}
	}
	static get(entity, objective) {
		try {
			const obj = world.scoreboard.getObjective(objective) ?? world.scoreboard.addObjective(objective)
			return obj.getScore(entity.scoreboardIdentity) ?? 0
		} catch {
			return 0
		}
	}
}