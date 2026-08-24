import { world } from '../core.js';
import { math } from "./math.js"
export class Xyz {
	constructor(x, y, z) {
		this.x = Math.floor(x)
		this.y = Math.floor(y)
		this.z = Math.floor(z)
	}
	add(x, y, z) {
		return new Xyz(this.x + x, this.y + y, this.z + z)
	}
	sub(x, y, z) {
		return new Xyz(this.x - x, this.y - y, this.z - z)
	}
	mul(x, y, z) {
		return new Xyz(this.x * x, this.y * y, this.z * z)
	}
	div(x, y, z) {
		return new Xyz(this.x / x, this.y / y, this.z / z)
	}
	floor() {
		return new Xyz(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z))
	}
	ceil() {
		return new Xyz(Math.ceil(this.x), Math.ceil(this.y), Math.ceil(this.z))
	}
	round() {
		return new Xyz(Math.round(this.x), Math.round(this.y), Math.round(this.z))
	}
	abs() {
		return new Xyz(Math.abs(this.x), Math.abs(this.y), Math.abs(this.z))
	}
	toString() {
		return `${this.x} ${this.y} ${this.z}`
	}
	equals(other) {
		return this.x === other.x && this.y === other.y && this.z === other.z
	}
	clone() {
		return new Xyz(this.x, this.y, this.z)
	}
	static fromLocation(location) {
		return new Xyz(location.x, location.y, location.z)
	}
	static fromBlockLocation(blockLocation) {
		return new Xyz(blockLocation.x, blockLocation.y, blockLocation.z)
	}
	randomize(str, v1, v2) {
		const matches = str.match(/[xyz]/g) || []
		return new Xyz(
			matches.includes("x") ? math.random(v1, v2) + this.x : this.x,
			matches.includes("y") ? math.random(v1, v2) + this.y : this.y,
			matches.includes("z") ? math.random(v1, v2) + this.z : this.z
		)
	}
	map(callback) {
		return callback({
			x: this.x,
			y: this.y,
			z: this.z
		})
	}
	toArray() {
		return [this.x, this.y, this.z]
	}
}