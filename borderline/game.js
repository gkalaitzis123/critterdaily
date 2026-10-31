// Borderline's rules, with no page or network code, so they're unit-tested in
// Node.
//
// Each day has three mysteries, easiest first: a country, empire, kingdom or
// other state at one moment in history, shown as its land on a map of that
// year. Guess any place from any time: each guess shows how far away it is
// from the mystery (and which way), and whether it existed in the mystery's
// year, or how many years too early or too late it was. Hints unlock as
// guesses go by.
//
// A place (places.json): { id, name, aliases: [normalized], from, to, at: [lat, lon], fame }
// A mystery (puzzles/<id>.json): { id, place, name, year, at, k, view, shape, land, others, labels, today, since }

export const ROUNDS = 3; // mysteries a day
export const MAX_GUESSES = 6; // for each
export const LAUNCH = "2026-10-30"; // Borderline #1
export const HINTS = [
  { after: 2, kind: "today" }, // which of today's countries the land is in
  { after: 3, kind: "names" }, // the names of that year's other states, on the map
  { after: 4, kind: "letter" },
];

/** Lowercase, no accents or punctuation, "&" as "and". */
export function normalize(text) {
  return String(text ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * The suggestions under the guess box: places named exactly what's typed,
 * then those with a name starting with it, then those with a word starting
 * with it, best-known first in each.
 */
export function suggest(text, places, limit = 8) {
  const t = normalize(text);
  if (!t) return [];
  const exact = [];
  const starts = [];
  const words = [];
  const more = [];
  for (const place of places) {
    if (place.aliases.includes(t)) exact.push(place);
    else if (place.aliases.some((a) => a.startsWith(t))) starts.push(place);
    else if (place.aliases.some((a) => a.includes(` ${t}`))) words.push(place);
    else if (place.aliases.some((a) => a.includes(t))) more.push(place);
  }
  const byFame = (a, b) => (b.fame ?? 0) - (a.fame ?? 0);
  // A place whose own name is what's typed comes before one that's only also called that.
  const own = (p) => (normalize(p.name) === t ? 0 : 1);
  return [...exact.sort((a, b) => own(a) - own(b) || byFame(a, b)), ...starts.sort(byFame), ...words.sort(byFame), ...more.sort(byFame)].slice(0, limit);
}

/** The place a guess names exactly (by its own name first, then any other), or null. */
export function find(text, places) {
  const t = normalize(text);
  if (!t) return null;
  return places.find((p) => normalize(p.name) === t) ?? places.find((p) => p.aliases.includes(t)) ?? null;
}

const rad = (deg) => (deg * Math.PI) / 180;
const R = 6371;

/** Great-circle distance in km between two [lat, lon] points. */
export function distanceKm(a, b) {
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const DIRECTIONS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
const ARROWS = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];

/** The compass direction from a to b: 0 north, 1 northeast, ... 7 northwest. */
export function direction(a, b) {
  const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]));
  const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]));
  return Math.round((((Math.atan2(y, x) * 180) / Math.PI + 360) % 360) / 45) % 8;
}

/**
 * The map's projection, centered on the mystery: azimuthal equidistant, so
 * distances from the middle are true. [lon, lat] -> [x, y] in km, y down.
 */
export function project(lat0, lon0) {
  const sin0 = Math.sin(rad(lat0));
  const cos0 = Math.cos(rad(lat0));
  return ([lon, lat]) => {
    const sinf = Math.sin(rad(lat));
    const cosf = Math.cos(rad(lat));
    const dl = rad(lon - lon0);
    const cosc = Math.max(-1, Math.min(1, sin0 * sinf + cos0 * cosf * Math.cos(dl)));
    const c = Math.acos(cosc);
    const k = c < 1e-9 ? 1 : c / Math.sin(c);
    return [R * k * cosf * Math.sin(dl), -R * k * (cos0 * sinf - sin0 * cosf * Math.cos(dl))];
  };
}

const NEARBY_KM = 150;

/** How far, rounded: "1,200 km". */
const km = (n) => `${(n < 1000 ? Math.round(n / 10) * 10 : Math.round(n / 100) * 100).toLocaleString("en-US")} km`;

/** Where the mystery is from a guess, in words: "about 1,200 km southeast", or "nearby". */
export function whereText(where) {
  if (!where) return "";
  return where.km < NEARBY_KM ? "nearby" : `about ${km(where.km)} ${DIRECTIONS[where.dir]}`;
}

/** The same, short, for the list of guesses: "1,200 km ↘". */
export function whereShort(where) {
  if (!where) return "";
  return where.km < NEARBY_KM ? "nearby" : `${km(where.km)} ${ARROWS[where.dir]}`;
}

/** A year for people: "117 BCE", "45 CE", "1520". */
export function yearText(year) {
  if (year < 0) return `${-year} BCE`;
  return year < 1000 ? `${year} CE` : String(year);
}

/** How many years a place missed the mystery's year by: 0 if it existed then, negative if it was over by then, positive if it hadn't begun. */
export function yearsOff(place, year) {
  if (year < place.from) return place.from - year;
  if (year > place.to) return place.to - year;
  return 0;
}

/** "around in 1520", "gone 300 years before", "300 years too soon". */
export function whenText(off, year) {
  if (off === 0) return `it existed in ${yearText(year)}`;
  const n = Math.abs(off).toLocaleString("en-US");
  return off < 0 ? `it was gone ${n} year${Math.abs(off) === 1 ? "" : "s"} before ${yearText(year)}` : `it began ${n} year${Math.abs(off) === 1 ? "" : "s"} after ${yearText(year)}`;
}

/** The same, short: "✓ then", "300 yrs early", "300 yrs late". */
export function whenShort(off) {
  if (off === 0) return "✓ then";
  const n = Math.abs(off).toLocaleString("en-US");
  return off < 0 ? `${n} yr${Math.abs(off) === 1 ? "" : "s"} early` : `${n} yr${Math.abs(off) === 1 ? "" : "s"} late`;
}

/**
 * Compare a guess with the mystery: whether it's the one, how far away the
 * mystery is from it and which way, how many years off it is, and how close
 * that all is, from 0 to 1: 60% for place and 40% for time (it's a map
 * game), each fading smoothly with distance (1,000 km away keeps two thirds
 * of the place part, 5,000 km about an eighth; a century off keeps two
 * thirds of the time part, 500 years about an eighth).
 */
export function compare(guess, mystery) {
  // The place, or another name that held all of its land that year (`also`).
  if (guess.id === (mystery.place ?? mystery.id) || mystery.also?.includes(guess.id)) return { found: true, closeness: 1, where: null, off: 0 };
  const where = { km: Math.round(distanceKm(guess.at, mystery.at)), dir: direction(guess.at, mystery.at) };
  const off = yearsOff(guess, mystery.year);
  const place = Math.exp(-where.km / 2500);
  const time = Math.exp(-Math.abs(off) / 250);
  return { found: false, closeness: Math.round((0.6 * place + 0.4 * time) * 100) / 100, where, off };
}

/** The hints unlocked after this many wrong guesses. */
export function hintsFor(wrong) {
  return HINTS.filter((h) => wrong >= h.after).map((h) => h.kind);
}

export function square(result) {
  if (result.found) return "🎯";
  if (result.closeness >= 0.8) return "🟩";
  if (result.closeness >= 0.6) return "🟨";
  if (result.closeness >= 0.4) return "🟧";
  return "⬛";
}

/** How far Homer has flown toward the mystery, 0 to 1: the closest guess so far. */
export function progress(results) {
  if (results.some((r) => r.found)) return 1;
  return Math.max(0, ...results.map((r) => r.closeness));
}

/** Days since launch, counting from 1, by the player's own calendar. */
export function dayNumber(date = new Date()) {
  const [y, m, d] = LAUNCH.split("-").map(Number);
  return Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(y, m - 1, d)) / 86400000) + 1;
}

export function mysteryFor(day, schedule) {
  return schedule[(((day - 1) % schedule.length) + schedule.length) % schedule.length];
}

/** The day's tiers, by how many of the three were found and in how many guesses in all. */
export const TIERS = [
  { name: "Master Cartographer", range: "all 3 in 6 guesses or fewer", test: (found, guesses) => found === ROUNDS && guesses <= 6 },
  { name: "Navigator", range: "all 3 in 10 or fewer", test: (found, guesses) => found === ROUNDS && guesses <= 10 },
  { name: "Explorer", range: "all 3", test: (found) => found === ROUNDS },
  { name: "Wanderer", range: "2 of 3", test: (found) => found === ROUNDS - 1 },
];
export const MISSED = "Off the map"; // one or none

/** The tier for a finished day: { name, index } (index TIERS.length for one found or none). */
export function tierFor(found, guesses) {
  const index = TIERS.findIndex((t) => t.test(found, guesses));
  return index < 0 ? { name: MISSED, index: TIERS.length } : { name: TIERS[index].name, index };
}

/** How a finished day went: { found, guesses } from its rounds ({ results, finished }). */
export function tally(rounds) {
  return { found: rounds.filter((r) => r.finished === "solved").length, guesses: rounds.reduce((n, r) => n + r.results.length, 0) };
}

/** The shared result: a row of squares for each mystery, never the places. */
export function shareText(day, rounds, url) {
  const { found, guesses } = tally(rounds);
  const head = `Borderline #${day} 🗺️ ${found}/${ROUNDS} · ${guesses} guess${guesses === 1 ? "" : "es"} · ${tierFor(found, guesses).name}`;
  return [head, ...rounds.map((r) => r.results.map(square).join("") || "·"), url].join("\n");
}

/** Days played, perfect days (all three found), how many found on average, and days in a row played, from { [day]: { found, guesses } }. */
export function stats(history, today) {
  const days = Object.keys(history).map(Number).sort((a, b) => a - b);
  let streak = 0;
  for (let d = history[today] ? today : today - 1; history[d]; d--) streak++;
  let best = 0;
  let run = 0;
  days.forEach((d, i) => {
    run = i > 0 && days[i - 1] === d - 1 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return {
    played: days.length,
    perfect: days.filter((d) => history[d].found === ROUNDS).length,
    average: days.length ? Math.round((days.reduce((n, d) => n + history[d].found, 0) / days.length) * 10) / 10 : 0,
    streak,
    bestStreak: best,
  };
}
