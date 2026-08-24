import { system } from '../core.js';
import { en, id } from "./locales.js";
const D = { en, id };
const cache = new Map();
export const Lang = {
  t: (p, k, ...a) => {
    let lang = "en";
    if (p?.id) {
      lang = cache.get(p.id) || "en";
    }
    let s = D[lang]?.[k] ?? D.en[k] ?? k;
    a.forEach((x, i) => {
      s = s.replace("%s", x);
      s = s.replace(new RegExp(`\\{${i}\\}`, "g"), x);
    });
    return s;
  },
  set: (p, l) => {
    if (!D[l]) return false;
    cache.set(p.id, l);
    system.run(() => {
      try {
        const tags = p.getTags();
        for (const t of tags) {
          if (t.startsWith("lang:")) {
            p.removeTag(t);
          }
        }
        p.addTag(`lang:${l}`);
      } catch (e) {
        console.warn("Failed to set language tag:", e);
      }
    });
    return true;
  },
  load: (p) => {
    if (!p?.id || cache.has(p.id)) return;
    const tag = p.getTags?.().find((t) => t.startsWith("lang:"))?.split(":")[1] || "en";
    cache.set(p.id, tag);
  },
};
