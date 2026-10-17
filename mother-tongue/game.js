// Mother Tongue's rules, with no page or network code, so they're unit-tested
// in Node.
//
// Each day has one mystery language. Every guess shows the deepest branch of
// the language family tree it shares with the mystery (guess Spanish when it's
// Portuguese and you learn they're both West Iberian), how much of the
// mystery's lineage that covers, and how far away and in which direction the
// mystery is spoken. Hints unlock as guesses go by.
//
// A language: { id, name, aliases: [normalized], path: [ancestor ids, root first],
//               speakers, countries: ["BR", ...], at: [lat, lon] or null, wiki }
// Names of tree branches: nodes = { [id]: "Romance" } for the ones worth showing.

export const MAX_GUESSES = 20;
export const LAUNCH = "2026-10-17"; // Mother Tongue #1
export const HINTS = [
  { after: 5, kind: "speakers" },
  { after: 10, kind: "countries" },
  { after: 15, kind: "letter" },
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

const branchCache = new WeakMap();
/** Normalized branch names, worked out once per tree. */
function branchNames(nodes) {
  if (!branchCache.has(nodes)) branchCache.set(nodes, new Map(Object.entries(nodes).map(([id, name]) => [id, name ? normalize(name) : null])));
  return branchCache.get(nodes);
}

/** Whether a word of the name starts with what's typed: "caucasian" finds "northwest caucasian". */
const wordStart = (name, t) => Boolean(name) && (name.startsWith(t) || name.includes(` ${t}`));

/** The branch of a language's lineage with a word starting with what's typed, or null. */
export function branchMatch(text, lang, nodes) {
  const t = normalize(text);
  if (!t || !nodes) return null;
  const names = branchNames(nodes);
  const id = lang.path.find((n) => wordStart(names.get(String(n)), t));
  return id === undefined ? null : nodes[id];
}

/**
 * The suggestions under the guess box: languages named exactly what's typed,
 * then those with a name starting with it, then those with a name containing
 * it or in a branch with that name ("Bantu"), best-known first in each.
 */
export function suggest(text, languages, limit = 8, nodes = null) {
  const t = normalize(text);
  if (!t) return [];
  const exact = [];
  const starts = [];
  const more = [];
  const branches = nodes ? new Set([...branchNames(nodes)].filter(([, name]) => wordStart(name, t)).map(([id]) => id)) : new Set();
  for (const lang of languages) {
    if (lang.aliases.includes(t)) exact.push(lang);
    else if (lang.aliases.some((a) => a.startsWith(t))) starts.push(lang);
    else if (lang.aliases.some((a) => a.includes(t)) || (branches.size && lang.path.some((id) => branches.has(String(id))))) more.push(lang);
  }
  const byFame = (a, b) => (b.fame ?? 0) - (a.fame ?? 0);
  return [...exact.sort(byFame), ...starts.sort(byFame), ...more.sort(byFame)].slice(0, limit);
}

/** The language a guess names exactly (by any of its names), or null. */
export function find(text, languages) {
  const t = normalize(text);
  return (t && languages.find((l) => l.aliases.includes(t))) || null;
}

const rad = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance in km between two [lat, lon] points. */
export function distanceKm(a, b) {
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export const DIRECTIONS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
const ARROWS = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];

/** The compass direction from a to b: 0 north, 1 northeast, ... 7 northwest. */
export function direction(a, b) {
  const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]));
  const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]));
  return Math.round((((Math.atan2(y, x) * 180) / Math.PI + 360) % 360) / 45) % 8;
}

const NEARBY_KM = 100;

/** Where the mystery is from a guess, in words: "about 1,200 km southeast", or "nearby". */
export function whereText(where) {
  if (!where) return "";
  if (where.km < NEARBY_KM) return "nearby";
  const km = where.km < 1000 ? Math.round(where.km / 10) * 10 : Math.round(where.km / 100) * 100;
  return `about ${km.toLocaleString("en-US")} km ${DIRECTIONS[where.dir]}`;
}

/** The same, short, for the list of guesses: "1,200 km ↘". */
export function whereShort(where) {
  if (!where) return "";
  if (where.km < NEARBY_KM) return "nearby";
  const km = where.km < 1000 ? Math.round(where.km / 10) * 10 : Math.round(where.km / 100) * 100;
  return `${km.toLocaleString("en-US")} km ${ARROWS[where.dir]}`;
}

/**
 * Compare a guess with the mystery. `shared` is how many levels of the family
 * tree they have in common; `closeness` is that as a share of the mystery's
 * whole lineage (1 when found). `branch` is the deepest shared branch with a
 * name worth showing, or null for different families. `where` is how far and
 * which way the mystery is spoken from the guess ({ km, dir }), when both are
 * on the map.
 */
export function compare(guess, mystery, nodes) {
  if (guess.id === mystery.id) return { found: true, shared: mystery.path.length + 1, closeness: 1, branch: mystery.id, where: null };
  const where = guess.at && mystery.at ? { km: Math.round(distanceKm(guess.at, mystery.at)), dir: direction(guess.at, mystery.at) } : null;
  let shared = 0;
  while (shared < guess.path.length && shared < mystery.path.length && guess.path[shared] === mystery.path[shared]) shared++;
  // A guess can sit on the mystery's own line (an ancestor that's also a language).
  if (shared === guess.path.length && mystery.path[shared] === guess.id) shared++;
  let branch = null;
  for (let i = shared - 1; i >= 0; i--) {
    if (nodes[mystery.path[i]]) {
      branch = mystery.path[i];
      break;
    }
  }
  return { found: false, shared, closeness: shared / (mystery.path.length + 1), branch, where };
}

/** The mystery's named branches, showing those every guess so far has uncovered. */
export function lineage(mystery, guesses, nodes) {
  const deepest = Math.max(0, ...guesses.map((g) => g.shared));
  return mystery.path
    .map((id, depth) => ({ id, depth, name: nodes[id] ?? null }))
    .filter((n) => n.name)
    .map((n) => ({ ...n, revealed: n.depth < deepest }));
}

/** The hints unlocked after this many wrong guesses. */
export function hintsFor(wrong, mystery) {
  return HINTS.filter((h) => wrong >= h.after).map((h) => ({ kind: h.kind, value: h.kind === "speakers" ? mystery.speakers : h.kind === "countries" ? mystery.countries : mystery.name[0] }));
}

/** "about 230 million" */
export function roughly(n) {
  if (!n) return "an unknown number of";
  if (n >= 1e9) return `about ${(n / 1e9).toFixed(1).replace(/\.0$/, "")} billion`;
  if (n >= 1e6) return `about ${Math.round(n / 1e6)} million`;
  if (n >= 1e3) return `about ${Math.round(n / 1e3)} thousand`;
  return `about ${n}`;
}

export function square(result) {
  if (result.found) return "🎯";
  if (result.shared === 0) return "⬛";
  if (result.closeness >= 0.75) return "🟩";
  if (result.closeness >= 0.5) return "🟨";
  if (result.closeness >= 0.25) return "🟧";
  return "🟫";
}

/** Days since launch, counting from 1, by the player's own calendar. */
export function dayNumber(date = new Date()) {
  const [y, m, d] = LAUNCH.split("-").map(Number);
  return Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(y, m - 1, d)) / 86400000) + 1;
}

export function mysteryFor(day, schedule) {
  return schedule[(((day - 1) % schedule.length) + schedule.length) % schedule.length];
}

/** Tiers by how many guesses it took. */
export const TIERS = [
  { name: "Golden Feather", max: 4 },
  { name: "Songbird", max: 8 },
  { name: "Chatterbox", max: 12 },
  { name: "Fledgling", max: MAX_GUESSES },
];
export const MISSED = "Still in the egg";

/** The tier for a finished game: { name, index } (index TIERS.length when not found). */
export function tierFor(guesses, solved) {
  if (!solved) return { name: MISSED, index: TIERS.length };
  const index = Math.max(0, TIERS.findIndex((t) => guesses <= t.max));
  return { name: TIERS[index].name, index };
}

/** How cracked the mystery's egg is, 0 to 4, from the closest guess so far. */
export function cracks(results) {
  const best = Math.max(0, ...results.filter((r) => !r.found).map((r) => r.closeness));
  return best === 0 ? 0 : best < 0.25 ? 1 : best < 0.5 ? 2 : best < 0.75 ? 3 : 4;
}

/** The shared result: how close each guess came, never the languages. */
export function shareText(day, results, solved, url) {
  const head = `Mother Tongue #${day} 🥚 ${solved ? `${results.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`} · ${tierFor(results.length, solved).name}`;
  const rows = [];
  for (let i = 0; i < results.length; i += 10) rows.push(results.slice(i, i + 10).map(square).join(""));
  return [head, ...rows, url].join("\n");
}

/** Wins, streaks and average guesses from { [day]: { solved, guesses } }. */
export function stats(history, today) {
  const days = Object.keys(history).map(Number).sort((a, b) => a - b);
  const wins = days.filter((d) => history[d].solved);
  let streak = 0;
  for (let d = history[today] ? today : today - 1; history[d]?.solved; d--) streak++;
  let best = 0;
  let run = 0;
  days.forEach((d, i) => {
    run = history[d].solved ? (i > 0 && days[i - 1] === d - 1 && history[days[i - 1]].solved ? run + 1 : 1) : 0;
    best = Math.max(best, run);
  });
  return {
    played: days.length,
    won: wins.length,
    average: wins.length ? Math.round((wins.reduce((n, d) => n + history[d].guesses, 0) / wins.length) * 10) / 10 : 0,
    streak,
    bestStreak: best,
  };
}
