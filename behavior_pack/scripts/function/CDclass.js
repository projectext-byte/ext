import { system } from '../core.js';
class CooldownClass {
    endTime = null;
    start(duration) {
        if (this.isActive()) return;
        this.endTime = Date.now() + duration * 1000;
        system.runTimeout(() => {
            this.endTime = null;
        }, duration * 20);
    }
    isActive() {
        return this.endTime !== null && this.endTime > Date.now();
    }
    getCooldown() {
        if (!this.isActive()) return 0;
        const remainingTime = Math.max(0, this.endTime - Date.now());
        return Math.round(remainingTime / 1000);
    }
}
export { CooldownClass };
