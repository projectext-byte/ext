import { system } from "../../core.js";
let lastTick = NaN;
const callbacks = [];
system.runInterval(() => {
  const { currentTick } = system;
  const deltaTime = (Date.now() - lastTick) / 1000;
  lastTick = Date.now();
  for (const callback of callbacks) {
    callback({ deltaTime, currentTick });
  }
}, 20);
export class TickEventSignal {
  subscribe(callback) {
    callbacks.push(callback);
    return callback;
  }
  unsubscribe(callback) {
    const index = callbacks.indexOf(callback);
    callbacks.splice(index, 1);
  }
}
export const tick = new TickEventSignal();
