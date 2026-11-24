// Small pure helpers shared by the engine and UI. No DOM access here.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days since the Unix epoch, in the viewer's local time zone. */
export function epochDay(ms = Date.now()) {
  const d = new Date(ms);
  return Math.floor((ms - d.getTimezoneOffset() * 60 * 1000) / DAY_MS);
}

/** Deterministic PRNG (mulberry32) so tests can pin shuffles. */
export function seededRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates shuffle that returns a new array. */
export function shuffle(items, rng = Math.random) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function leetcodeUrl(slug) {
  return `https://leetcode.com/problems/${slug}/`;
}
