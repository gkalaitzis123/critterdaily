// Deep Cut's rules, with no page or network code, so they're unit-tested in
// Node and shared by the data builder and the game.
//
// Each day has five prompts ("Name a Roman emperor"). Any answer on the list
// counts, and the less it's read on Wikipedia, the deeper Digby digs: an
// answer's rarity is its share of everyone reading the list's articles ("1 in
// 2,769"), and every ten times rarer digs 10 m deeper, down through the
// periods of Earth's history.

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
 * How deep an answer digs, from how rare it is: 10 m for every ten times
 * rarer. 1 in 10 readers is 10 m, 1 in 1,000 is 30 m, 1 in 100,000 is 50 m.
 * A right answer always digs at least 1 m.
 */
export const depthFor = (oneIn) => Math.max(1, Math.round(10 * Math.log10(oneIn)));

/**
 * How rare each of a list's answers is, from how often its Wikipedia article
 * is read (`views`, over the same span for all of them): of all the reads of
 * the list's articles, this one's share, as "1 in N". Returns
 * [{ oneIn, depth }], in the same order.
 */
export function rarity(views) {
  const total = views.reduce((n, v) => n + v, 0);
  return views.map((v) => {
    const oneIn = Math.max(1, Math.round(total / Math.max(v, 1)));
    return { oneIn, depth: depthFor(oneIn) };
  });
}

/** "1 in 2,769"-style numbers, short: 40, 610, 2.8k, 60k, 1.2M. */
export function compact(n) {
  if (n < 1000) return String(n);
  if (n < 1e6) return `${Number((n / 1e3).toPrecision(2)) >= 10 ? Math.round(n / 1e3) : Number((n / 1e3).toPrecision(2))}k`;
  return `${Number((n / 1e6).toPrecision(2))}M`;
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

/**
 * The periods of Earth's history Digby digs back through. A day's total
 * lands in one of them: famous answers all day stay in the Holocene, and
 * five deep cuts reach the Cambrian.
 */
export const PERIODS = [
  { name: "Holocene", min: 0, ago: "today" },
  { name: "Pleistocene", min: 60, ago: "the Ice Age" },
  { name: "Cretaceous", min: 80, ago: "70 million years ago" },
  { name: "Jurassic", min: 100, ago: "170 million years ago" },
  { name: "Permian", min: 125, ago: "270 million years ago" },
  { name: "Cambrian", min: 150, ago: "510 million years ago" },
];

/** The period for a total, with the next one and how far it is: { name, min, ago, index, next: { name, toGo } | null }. */
export function periodFor(total) {
  const index = Math.max(0, PERIODS.findLastIndex((p) => total >= p.min));
  const next = PERIODS[index + 1];
  return { ...PERIODS[index], index, next: next ? { name: next.name, toGo: next.min - total } : null };
}

/** The text players share: how deep, and how rare each answer was, never the answers. */
export function shareText(day, results, url) {
  const total = results.reduce((n, r) => n + (r.depth ?? 0), 0);
  const rare = results.map((r) => (r.depth ? (r.oneIn ? `1 in ${compact(r.oneIn)}` : `${r.depth} m`) : "✗")).join(" · ");
  return `Deep Cut #${day} ⛏️ ${total} m · ${periodFor(total).name}\n${rare}\n${url}`;
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
