// Deep Cut's rules, with no page or network code, so they're unit-tested in
// Node and shared by the data builder and the game.
//
// Each day has five prompts ("Name a cheese"). Any answer on the list counts,
// and rarer answers dig deeper: each answer is Common, Uncommon, Rare, Very
// rare or a Deep cut, from its place on the list ranked by how often its
// Wikipedia article is read, and each rarity digs a set number of meters.

export const PROMPTS_PER_DAY = 5;
export const SECONDS_PER_PROMPT = 30;
export const LAUNCH = "2026-10-17"; // Deep Cut #1

/** Lowercase, no accents or punctuation ("D.C." is "dc"), "&" as "and", no leading "the". */
export function normalize(text) {
  return String(text ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the /, "");
}

/** Damerau-Levenshtein (optimal string alignment) distance, stopping early past `max`. */
export function distance(a, b, max = 3) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let best = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      best = Math.min(best, d[i][j]);
    }
    if (best > max) return max + 1;
  }
  return d[a.length][b.length];
}

/** How many typos a guess of this length may have. */
export const typosAllowed = (length) => (length >= 9 ? 2 : length >= 5 ? 1 : 0);

/**
 * Find the answer a guess means. Exact matches on any alias win; otherwise the
 * closest alias within the typo allowance, if only one answer is that close.
 * answers: [{ name, aliases: [normalized], ... }]. Returns the answer or null.
 */
export function match(guess, answers) {
  const g = normalize(guess);
  if (!g) return null;
  for (const a of answers) if (a.aliases.includes(g)) return a;
  const allowed = typosAllowed(g.length);
  if (!allowed) return null;
  let best = null;
  let bestDistance = allowed + 1;
  let tied = false;
  for (const a of answers) {
    for (const alias of a.aliases) {
      const dist = distance(g, alias, allowed);
      if (dist < bestDistance) {
        [best, bestDistance, tied] = [a, dist, false];
      } else if (dist === bestDistance && best && best !== a) {
        tied = true;
      }
    }
  }
  return best && !tied ? best : null;
}

/**
 * The rarities, and how deep each digs. `from` is where a rarity starts on the
 * list, measured on a log scale (0 is the most famous answer, 1 the least), so
 * the first steps down the list count the most: what most people think of is
 * near the top. In a list of 500, the 8 most famous answers are Common, then
 * Uncommon to about the 30th, Rare to the 90th, Very rare to the 220th, and the
 * rest are Deep cuts. In a list of 50, the top 3 are Common and the last 20
 * are Deep cuts.
 */
export const RARITIES = [
  { name: "Common", depth: 10, from: 0 },
  { name: "Uncommon", depth: 25, from: 0.35 },
  { name: "Rare", depth: 45, from: 0.55 },
  { name: "Very rare", depth: 70, from: 0.72 },
  { name: "Deep cut", depth: 100, from: 0.87 },
];

/** The rarity of a depth, as { name, depth, from, index }, or null for no answer. */
export function rarityFor(depth) {
  if (!depth) return null;
  const index = Math.max(0, RARITIES.findLastIndex((r) => depth >= r.depth));
  return { ...RARITIES[index], index };
}

/**
 * Depths for a category's answers, from their page views: the answers are
 * ranked by how often they're read, and each one's place on that list sets
 * its rarity. Answers read equally often share the middle of their ranks.
 */
export function depths(views) {
  const n = views.length;
  if (n === 1) return [RARITIES.at(-1).depth];
  const order = views.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
  const rank = new Array(n);
  for (let i = 0; i < n; ) {
    let j = i;
    while (j + 1 < n && order[j + 1][0] === order[i][0]) j++;
    for (let k = i; k <= j; k++) rank[order[k][1]] = (i + j) / 2;
    i = j + 1;
  }
  return rank.map((r) => {
    const place = Math.log(r + 1) / Math.log(n); // 0 for the most read, 1 for the least
    return RARITIES.findLast((rarity) => place >= rarity.from - 1e-9).depth;
  });
}

/** Days since launch, counting from 1, by the player's own calendar. */
export function dayNumber(date = new Date()) {
  const [y, m, d] = LAUNCH.split("-").map(Number);
  const start = Date.UTC(y, m - 1, d);
  const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((today - start) / 86400000) + 1;
}

/** The five category ids for a day. The schedule repeats once it runs out. */
export function promptsFor(day, schedule) {
  return schedule[(((day - 1) % schedule.length) + schedule.length) % schedule.length];
}

// One square a prompt in the shared result, colored like loot: gray, green, blue, purple, gold.
const SQUARES = ["⬜", "🟩", "🟦", "🟪", "🟨"];
export const square = (depth) => (depth ? SQUARES[rarityFor(depth).index] : "⬛");

/**
 * The tiers: the layers Digby digs through, 100 m each. A day's total (up to
 * 500 m) lands in one of them.
 */
export const TIERS = [
  { name: "Topsoil Tourist", min: 0 },
  { name: "Worm Wrangler", min: 100 },
  { name: "Fossil Finder", min: 200 },
  { name: "Crystal Collector", min: 300 },
  { name: "Core Explorer", min: 400 },
];

/** The tier for a total, with the next one and how far it is: { name, min, index, next: { name, toGo } | null }. */
export function tierFor(total) {
  const index = Math.max(0, TIERS.findLastIndex((t) => total >= t.min));
  const next = TIERS[index + 1];
  return { ...TIERS[index], index, next: next ? { name: next.name, toGo: next.min - total } : null };
}

/** The text players share: no answers, just how deep they dug. */
export function shareText(day, results, url) {
  const total = results.reduce((n, r) => n + (r.depth ?? 0), 0);
  return `Deep Cut #${day} ⛏️ ${total} m · ${tierFor(total).name}\n${results.map((r) => square(r.depth)).join("")}\n${url}`;
}

/** Streaks and totals from a record of finished days: { [day]: totalDepth }. */
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
    deepest: days.length ? Math.max(...totals) : 0,
    streak,
    bestStreak: best,
  };
}
