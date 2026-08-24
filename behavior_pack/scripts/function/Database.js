import { system, world } from "../core.js";
function parseStored(raw) {
  return JSON.parse(raw.replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
}
class Database extends Map {
  static instances = new Map();
  static getDatabase(name) {
    if (!Database.instances.has(name)) {
      Database.instances.set(name, new Database(name));
    }
    return Database.instances.get(name);
  }
  static resetAllMigrations() {
    world.setDynamicProperty("isDbMigrated", false);
  }
  constructor(name) {
    super();
    this.id = `${name}\uE812`;
    this.isInitialized = false;
    this._pendingWrites = new Map();
    system.runTimeout(() => this._initialize(), 40);
    system.runInterval(() => this._flushWrites(), 40);
  }
  _initialize() {
    if (!world.getDynamicProperty("isDbMigrated")) {
      this._migrateFromScoreboard();
      world.setDynamicProperty("isDbMigrated", true);
    }
    for (const propId of world.getDynamicPropertyIds()) {
      if (!propId.startsWith(this.id)) continue;
      const key = propId.slice(this.id.length);
      super.set(key, parseStored(world.getDynamicProperty(propId)));
    }
    this.isInitialized = true;
  }
  _migrateFromScoreboard() {
    const objName = `DB_${this.id}`;
    const obj = world.scoreboard.getObjective(objName);
    if (!obj) return;
    for (const p of obj.getParticipants()) {
      const dn = p.displayName;
      const idx = dn.indexOf("_");
      if (idx < 0) continue;
      const key = dn.slice(0, idx);
      super.set(key, parseStored(dn.slice(idx + 1)));
      this._pendingWrites.set(key, super.get(key));
    }
    world.getDimension("overworld").runCommand(`scoreboard objectives remove "${objName}"`);
  }
  _flushWrites() {
    if (!this._pendingWrites.size) return;
    for (const [k, v] of this._pendingWrites) {
      world.setDynamicProperty(this.id + k, JSON.stringify(v).replace(/[\\"]/g, "\\$&"));
    }
    this._pendingWrites.clear();
  }
  async ready() {
    if (this.isInitialized) return;
    return new Promise(res => {
      const h = system.runInterval(() => {
        if (this.isInitialized) {
          system.clearRun(h);
          res();
        }
      }, 1);
    });
  }
  set(key, value) {
    super.set(key, value);
    this._pendingWrites.set(key, value);
    return this;
  }
  get(key, defaultValue) {
    return super.has(key) ? super.get(key) : defaultValue;
  }
  delete(key) {
    const existed = super.delete(key);
    world.setDynamicProperty(this.id + key, null);
    return existed;
  }
  clear() {
    for (const k of super.keys()) {
      world.setDynamicProperty(this.id + k, null);
    }
    super.clear();
  }
}
export { Database };
