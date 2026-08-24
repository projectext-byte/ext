export class math {
	static pi = Math.PI
	static π = Math.PI
	static sin(v) {
		return Math.sin(v * Math.PI / 180)
	}
	static cos(v) {
		return Math.cos(v * Math.PI / 180)
	}
	static random(min, max) {
		return Math.random() * (max - min) + min
	}
	static randomInt(min, max) {
		return Math.floor(Math.random() * (max - min + 1)) + min
	}
	static clamp(number, min, max) {
		return Math.max(min, Math.min(number, max))
	}
}