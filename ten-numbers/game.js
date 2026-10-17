// Ten Numbers' rules, with no page or network code, so they're unit-tested in
// Node and shared by the question builder and the game.
//
// Each day has ten questions whose answer is a number ("How tall is Mount
// Everest, in meters?"). A guess earns up to 10 acorns: a quantity by how many
// times too big or too small it is, a year by how far off it is for how long
// ago it was (a decade off matters more for 1969 than for 1066).

export const QUESTIONS_PER_DAY = 10;
export const MAX_POINTS = 10;
export const LAUNCH = "2026-10-17"; // Ten Numbers #1
export const REFERENCE_YEAR = 2026; // "how long ago", for year questions

// What an answer is measured in. Lengths and areas can also be typed in US
// units (`alt`): the game converts.
export const UNITS = {
  people: { label: "people" },
  count: { label: "" },
  year: { label: "" },
  minutes: { label: "minutes" },
  m: { label: "m", alt: { label: "ft", factor: 3.28084 } },
  km: { label: "km", alt: { label: "mi", factor: 0.621371 } },
  km2: { label: "km²", alt: { label: "sq mi", factor: 0.386102 } },
};

const SCALES = { k: 1e3, thousand: 1e3, m: 1e6, mn: 1e6, mil: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9, t: 1e12, tn: 1e12, trillion: 1e12 };

/**
 * The number a player typed, or null. Understands "15,000,000", "15 million",
 * "1.5bn", "15k", "2e6", and for years "500 BC" and "AD 1066". A trailing "m"
 * means meters when the answer is in meters, and millions otherwise.
 */
export function parseGuess(text, unit = "count") {
  const s = String(text ?? "")
    .trim()
    .toLowerCase()
    .replace(/(\d)[,\s](?=\d{3}(\D|$))/g, "$1") // thousands separators
    .replace(/(\d)[,\s](?=\d{3}(\D|$))/g, "$1");
  if (unit === "year") {
    const y = s.match(/^(?:ad\s*)?(-?\d{1,4})\s*(bc|bce|b\.c\.|ad|ce|a\.d\.)?$/);
    if (!y) return null;
    const year = Number(y[1]);
    return y[2] && y[2].startsWith("b") ? -Math.abs(year) : year;
  }
  const q = s.match(/^(-?\d*\.?\d+(?:e[+-]?\d+)?)\s*([a-z]+)?\b.*$/);
  if (!q) return null;
  let value = Number(q[1]);
  const word = q[2];
  if (word && SCALES[word] && !(word === "m" && unit === "m")) value *= SCALES[word];
  return Number.isFinite(value) ? value : null;
}

/** Acorns for a guess, 0 to 10. `q` is { unit, answer } in the answer's own unit. */
export function points(guess, q) {
  if (guess === null || guess === undefined || !Number.isFinite(guess)) return 0;
  if (q.unit === "year") {
    const span = Math.max(10, REFERENCE_YEAR - q.answer);
    return Math.round(MAX_POINTS * Math.max(0, 1 - (2 * Math.abs(guess - q.answer)) / span));
  }
  if (guess <= 0) return 0;
  // 10 for spot on, 7 for twice (or half) the answer, 0 at eight times off.
  const timesOff = Math.abs(Math.log10(guess / q.answer));
  return Math.round(MAX_POINTS * Math.max(0, 1 - timesOff / Math.log10(8)));
}

const times = (r) => (r < 10 ? r.toFixed(1).replace(/\.0$/, "") : Math.round(r).toLocaleString("en-US"));

/** How far off a guess was, in words: "2.5× too high", "4% too low", "12 years too early". */
export function howClose(guess, q) {
  if (q.unit === "year") {
    const off = guess - q.answer;
    if (off === 0) return "Exactly right!";
    return `${Math.abs(off)} year${Math.abs(off) === 1 ? "" : "s"} too ${off > 0 ? "late" : "early"}`;
  }
  if (!(guess > 0)) return "Way off";
  const ratio = guess / q.answer;
  if (Math.abs(ratio - 1) < 0.005) return "Exactly right!";
  if (ratio > 1) return ratio < 1.1 ? `${Math.max(1, Math.round((ratio - 1) * 100))}% too high` : `${times(ratio)}× too high`;
  return 1 / ratio < 1.1 ? `${Math.max(1, Math.round((1 - ratio) * 100))}% too low` : `${times(1 / ratio)}× too low`;
}

/** A word for a score. */
export function verdict(pts) {
  return pts >= 10 ? "Spot on!" : pts >= 8 ? "So close!" : pts >= 5 ? "Not bad!" : pts >= 2 ? "A bit off" : "Way off";
}

/** "15.4 million", "8,849", "1.4 billion". */
export function formatNumber(n) {
  const a = Math.abs(n);
  const short = (v, word) => `${(v >= 100 ? Math.round(v) : Number(v.toPrecision(3))).toLocaleString("en-US")} ${word}`;
  if (a >= 1e12) return short(n / 1e12, "trillion");
  if (a >= 1e9) return short(n / 1e9, "billion");
  if (a >= 1e6) return short(n / 1e6, "million");
  return (a < 10 ? Number(n.toFixed(1)) : Math.round(n)).toLocaleString("en-US");
}

/** A value with its unit: "8,849 m", "29,032 ft" (alt), "44 BC", "1.4 billion people". */
export function formatAmount(value, unit, { alt = false } = {}) {
  if (unit === "year") return value < 0 ? `${-value} BC` : String(value);
  const u = UNITS[unit];
  const shown = alt && u.alt ? value * u.alt.factor : value;
  const label = alt && u.alt ? u.alt.label : u.label;
  return label ? `${formatNumber(shown)} ${label}` : formatNumber(shown);
}

/** The tiers, by the day's total out of 100 acorns. */
export const TIERS = [
  { name: "Nut Nibbler", min: 0 },
  { name: "Acorn Gatherer", min: 40 },
  { name: "Stash Keeper", min: 60 },
  { name: "Hoard Master", min: 75 },
  { name: "Squirrel Sage", min: 90 },
];

/** The tier for a total, with the next one and how far it is: { name, min, index, next: { name, toGo } | null }. */
export function tierFor(total) {
  const index = Math.max(0, TIERS.findLastIndex((t) => total >= t.min));
  const next = TIERS[index + 1];
  return { ...TIERS[index], index, next: next ? { name: next.name, toGo: next.min - total } : null };
}

/** Days since launch, counting from 1, by the player's own calendar. */
export function dayNumber(date = new Date()) {
  const [y, m, d] = LAUNCH.split("-").map(Number);
  return Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(y, m - 1, d)) / 86400000) + 1;
}

/** The ten question ids for a day. The schedule repeats once it runs out. */
export function questionsFor(day, schedule) {
  return schedule[(((day - 1) % schedule.length) + schedule.length) % schedule.length];
}

export const square = (pts) => (pts >= 10 ? "🎯" : pts >= 8 ? "🟩" : pts >= 5 ? "🟨" : pts >= 2 ? "🟧" : "🟥");

/** The text players share: how close each guess was, never the questions or answers. */
export function shareText(day, results, url) {
  const total = results.reduce((n, r) => n + r.points, 0);
  return `Ten Numbers #${day} 🌰 ${total}/${QUESTIONS_PER_DAY * MAX_POINTS} · ${tierFor(total).name}\n${results.map((r) => square(r.points)).join("")}\n${url}`;
}

/** Totals and streaks from a record of finished days: { [day]: total }. */
export function stats(history, today) {
  const days = Object.keys(history).map(Number).sort((a, b) => a - b);
  const totals = days.map((d) => history[d]);
  let streak = 0;
  for (let d = history[today] !== undefined ? today : today - 1; history[d] !== undefined; d--) streak++;
  let best = 0;
  let run = 0;
  days.forEach((d, i) => {
    run = i > 0 && days[i - 1] === d - 1 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return {
    played: days.length,
    average: days.length ? Math.round(totals.reduce((a, b) => a + b, 0) / days.length) : 0,
    best: days.length ? Math.max(...totals) : 0,
    streak,
    bestStreak: best,
  };
}
