// Ten Numbers' rules, with no page or network code, so they're unit-tested in
// Node and shared by the question builder and the game.
//
// Each day has ten questions whose answer is a number ("How many species of
// beetle are known?", "In what year was the Battle of Hastings fought?"). A guess earns up to 10 acorns, fewer the further off
// it is. How far off is too far depends on the question: a film's running
// time has to be within minutes, a country's population within a factor of a
// few, and a year within a few years if it's recent, more if it's centuries ago.

export const QUESTIONS_PER_DAY = 10;
export const MAX_YEARS = 5; // "In what year ..." questions in a day, at most
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
  years: { label: "years" },
  m: { label: "m", alt: { label: "ft", factor: 3.28084 } },
  km: { label: "km", alt: { label: "mi", factor: 0.621371 } },
  km2: { label: "km²", alt: { label: "sq mi", factor: 0.386102 } },
};

const SCALES = { k: 1e3, thousand: 1e3, m: 1e6, mn: 1e6, mil: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9, t: 1e12, tn: 1e12, trillion: 1e12, quadrillion: 1e15 };

/**
 * The sizes offered as buttons under the box, by unit, for phones whose
 * number pads have no letters: type 2.5, pick "million". The same for every
 * question in a unit, so they don't hint at the answer.
 */
export const SIZES = {
  people: ["thousand", "million", "billion"],
  count: ["thousand", "million", "billion", "trillion", "quadrillion"],
  km2: ["thousand", "million"],
};
export const sizeOf = (word) => SCALES[word];

/** A guess's text, lowercased, without thousands separators or a leading "about". */
function tidy(text) {
  return String(text ?? "")
    .trim()
    .toLowerCase()
    .replace(/^(about|around|roughly|approximately|approx\.?|circa|ca\.|c\.|~|≈)\s*/, "")
    .replace(/(\d)[,\s](?=\d{3}(\D|$))/g, "$1") // thousands separators
    .replace(/(\d)[,\s](?=\d{3}(\D|$))/g, "$1");
}

const QUANTITY = /^(-?\d*\.?\d+(?:e[+-]?\d+)?)\s*([a-z]+)?\b.*$/;

/** Whether a typed quantity names its own size ("2.5 million", "15k"), so a size button shouldn't apply. */
export function hasSize(text, unit = "count") {
  const word = tidy(text).match(QUANTITY)?.[2];
  return Boolean(word && SCALES[word] && !(word === "m" && unit === "m"));
}

/** Whether a typed year says its era ("500 BC", "AD 80", "-500"), so the BC button shouldn't apply. */
export const hasEra = (text) => /\b(bc|bce|b\.c\.|ad|ce|a\.d\.)(\s|$)|^\s*-/i.test(tidy(text));

/**
 * The number a player typed, or null. Understands "15,000,000", "15 million",
 * "1.5bn", "15k", "2e6", "about 300", and for years "500 BC", "AD 1066" and
 * "c. 1500". A trailing "m" means meters when the answer is in meters, and
 * millions otherwise.
 */
export function parseGuess(text, unit = "count") {
  const s = tidy(text);
  if (unit === "year") {
    const y = s.match(/^(?:ad\s*)?(-?\d{1,4})\s*(bc|bce|b\.c\.|ad|ce|a\.d\.)?$/);
    if (!y) return null;
    const year = Number(y[1]);
    return y[2] && y[2].startsWith("b") ? -Math.abs(year) : year;
  }
  const q = s.match(QUANTITY);
  if (!q) return null;
  let value = Number(q[1]);
  const word = q[2];
  if (word && SCALES[word] && !(word === "m" && unit === "m")) value *= SCALES[word];
  return Number.isFinite(value) ? value : null;
}

/**
 * How much room a quantity has: the factor at which a guess earns nothing.
 * 1.4 for a film's running time (100 minutes for a 140-minute film earns
 * nothing), 1.6 for record lifespans (most are 15 to 40 years), 2 for lengths,
 * and 4 for populations, areas and counts like how many species a group has,
 * which few people know to within double. Kinds whose answers sit close
 * together get less room, so a guess at the typical value doesn't score well
 * on its own: US cities (most have 200,000 to a million people) and states.
 * Death tolls and the human body (206 bones) are better known, so they get 3.
 * How old someone was when they died gets 1.5 (most lives run 50 to 90, so a
 * guess of 70 shouldn't score on its own); an animal's record lifespan gets 2.
 */
const FACTORS = { minutes: 1.4, years: 1.6, m: 2, km: 2, km2: 4, people: 4, count: 4 };
const KIND_FACTORS = { "city-people": 2.5, "state-people": 2.5, deaths: 3, body: 3, age: 1.5, lifespan: 2 };
export const factorFor = (q) => KIND_FACTORS[q.kind] ?? FACTORS[q.unit] ?? 4;

/** How much room a year has: 10 years for something recent, a year more for every 8 years ago (31 for 1856, 60 for 1626), and at most 80, even for ancient history. */
export const yearRoom = (answer) => Math.min(80, 10 + Math.max(0, REFERENCE_YEAR - answer) / 8);

/** How far off a guess is, as a share of its room: 0 is spot on, 1 or more earns nothing. */
export function offBy(guess, q) {
  if (q.unit === "year") return Math.abs(guess - q.answer) / yearRoom(q.answer);
  if (!(guess > 0)) return Infinity;
  return Math.abs(Math.log(guess / q.answer)) / Math.log(factorFor(q));
}

/** Acorns for a guess, 0 to 10, falling evenly to 0 at the edge of its room. `q` is { kind, unit, answer }. */
export function points(guess, q) {
  if (guess === null || guess === undefined || !Number.isFinite(guess)) return 0;
  return Math.round(MAX_POINTS * Math.max(0, 1 - offBy(guess, q)));
}

/**
 * Where guesses earn something, for the number line: `zero` is the range past
 * which they earn nothing, `good` where they earn 7 acorns or more.
 */
export function ranges(q) {
  const at = (share) => {
    if (q.unit === "year") {
      const room = yearRoom(q.answer) * share;
      return [q.answer - room, q.answer + room];
    }
    const f = factorFor(q) ** share;
    return [q.answer / f, q.answer * f];
  };
  return { zero: at(1), good: at(0.35) };
}

const times = (r) => (r < 10 ? r.toFixed(1).replace(/\.0$/, "") : Math.round(r).toLocaleString("en-US"));
const plural = (n, word) => `${n.toLocaleString("en-US")} ${word}${n === 1 ? "" : "s"}`;

/** How far off a guess was, in words: "12 years too early", "9 minutes too long", "25% too high", "3× too low". */
export function howClose(guess, q) {
  if (q.unit === "year") {
    const off = guess - q.answer;
    if (off === 0) return "Exactly right!";
    return `${plural(Math.abs(off), "year")} too ${off > 0 ? "late" : "early"}`;
  }
  if (!(guess > 0)) return "Way off";
  if (q.unit === "minutes") {
    const off = Math.round(guess - q.answer);
    return off === 0 ? "Exactly right!" : `${plural(Math.abs(off), "minute")} too ${off > 0 ? "long" : "short"}`;
  }
  const ratio = guess / q.answer;
  if (Math.abs(ratio - 1) < 0.005) return "Exactly right!";
  if (ratio >= 2) return `${times(ratio)}× too high`;
  if (ratio > 1) return `${Math.max(1, Math.round((ratio - 1) * 100))}% too high`;
  if (ratio > 0.5) return `${Math.max(1, Math.round((1 - ratio) * 100))}% too low`;
  return `${times(1 / ratio)}× too low`;
}

/** A word for a score. */
export function verdict(pts) {
  return pts >= 10 ? "Spot on!" : pts >= 8 ? "So close!" : pts >= 5 ? "Not bad!" : pts >= 2 ? "A bit off" : "Way off";
}

/** "15.4 million", "8,849", "1.4 billion". */
export function formatNumber(n) {
  const a = Math.abs(n);
  const short = (v, word) => `${(v >= 100 ? Math.round(v) : Number(v.toPrecision(3))).toLocaleString("en-US")} ${word}`;
  if (a >= 1e15) return short(n / 1e15, "quadrillion");
  if (a >= 1e12) return short(n / 1e12, "trillion");
  if (a >= 1e9) return short(n / 1e9, "billion");
  if (a >= 1e6) return short(n / 1e6, "million");
  return (a < 10 ? Number(n.toFixed(1)) : Math.round(n)).toLocaleString("en-US");
}

/** A value with its unit: "8,849 m", "29,032 ft" (alt), "44 BC", "AD 80", "1.4 billion people". */
export function formatAmount(value, unit, { alt = false } = {}) {
  if (unit === "year") return value < 0 ? `${-value} BC` : value < 1000 ? `AD ${value}` : String(value);
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
