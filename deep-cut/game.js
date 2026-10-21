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

// Letters that don't come apart into a plain letter and an accent, and Greek
// letters by name, so "Höðr" is "hodr", "Ægir" is "aegir" and "Ω baryon" is
// "omega baryon".
const LETTERS = { æ: "ae", œ: "oe", ø: "o", ł: "l", ß: "ss", ð: "d", þ: "th", đ: "d", ı: "i", ħ: "h" };
const GREEK = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma sigma tau upsilon phi chi psi omega".split(" ");
const ROMAN = (n) => "x".repeat(Math.floor(n / 10)) + ["", "i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix"][n % 10];

/**
 * Lowercase, no accents or punctuation ("D.C." is "dc"), "&" as "and", no
 * leading "the", "St" as "saint", and a number after a name as a Roman
 * numeral, the way monarchs and missions are named ("John Paul 2" is "john
 * paul ii").
 */
export function normalize(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[æœøłßðþđıħ]/g, (c) => LETTERS[c])
    .replace(/[α-ω]/g, (c) => ` ${GREEK[c.charCodeAt(0) - 0x3b1]} `)
    .replace(/&/g, " and ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the /, "")
    .replace(/(?<=^| )st(?= |$)/g, "saint") // "St Nicholas" is Saint Nicholas, "St. Louis" Saint Louis
    .replace(/(?<=^| )(vs|versus)(?= |$)/g, "v") // "Roe vs. Wade" is Roe v. Wade
    .replace(/(?<=[a-z] )([1-9]|[1-3][0-9])(?= |$)/g, (n) => ROMAN(Number(n)));
}

let rows = [new Int32Array(64), new Int32Array(64), new Int32Array(64)];

// Letters easily typed for one another: a vowel for a vowel, a key next to
// the right one, or a letter that sounds alike ("Iguazu" for Iguaçu,
// "Kristofer"). Any other swap is more often another name than a slip
// ("Cronus" isn't Crotus, "Winchester" isn't Manchester), so it counts as two.
const SLIPS = new Set();
{
  const pair = (x, y) => SLIPS.add(x + y).add(y + x);
  const VOWELS = "aeiouy";
  for (const x of VOWELS) for (const y of VOWELS) pair(x, y);
  const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
  ROWS.forEach((row, r) => {
    for (let i = 0; i < row.length; i++) {
      if (i > 0) pair(row[i], row[i - 1]);
      // Each key sits between two of the row above ("s" under "w" and "e").
      if (r > 0) for (const j of [i, i + 1]) if (ROWS[r - 1][j]) pair(row[i], ROWS[r - 1][j]);
    }
  });
  for (const [x, y] of ["ck", "cs", "cz", "kq", "cq", "sz", "gj", "gk", "fv", "bp", "dt", "mn", "vw", "ij", "jy"]) pair(x, y);
}

/**
 * Damerau-Levenshtein (optimal string alignment) distance, stopping early
 * past `max`. `slips`: an unlikely letter swap (see SLIPS) counts as two.
 */
export function distance(a, b, max = 3, slips = false) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (a === b) return 0;
  const n = b.length;
  if (rows[0].length <= n) rows = rows.map(() => new Int32Array(2 * n + 2));
  let [before, prev, row] = rows; // the rows two back, one back, and this one
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    row[0] = i;
    let best = i;
    for (let j = 1; j <= n; j++) {
      const swap = a[i - 1] === b[j - 1] ? 0 : !slips || SLIPS.has(a[i - 1] + b[j - 1]) ? 1 : 2;
      let d = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + swap);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1] && before[j - 2] + 1 < d) d = before[j - 2] + 1;
      row[j] = d;
      if (d < best) best = d;
    }
    if (best > max) return max + 1;
    [before, prev, row] = [prev, row, before];
  }
  return prev[n];
}

// Words a typo mustn't change, since they make it a different answer:
// numerals ("Elizabeth II" isn't Elizabeth I), directions ("Northern Song")
// and numbers ("Revolution of 1830" isn't the Revolutions of 1820).
const KEY_WORD = /^(?:[ivx]+|north|northern|south|southern|east|eastern|west|western|upper|lower)$|\d/;
const keyWords = (words) => words.filter((w) => KEY_WORD.test(w)).join(" ");

/** How many typos a guess of this many letters may have: none under 5, one up to 8, two from 9. */
export const typosAllowed = (length) => (length >= 9 ? 2 : length >= 5 ? 1 : 0);
// ...in any one of its words: one, or two in a word of 9 letters or more.
const typoRoom = (word) => (word >= 9 ? 2 : word >= 2 ? 1 : 0);
// To be asked about ("Did you mean ...?"): another in long words, not so many
// that "Apatosaurus" brings up Allosaurus.
const nearRoom = (word) => (word >= 12 ? 3 : word >= 8 ? 2 : word >= 2 ? 1 : 0);

/** A name, ready to compare: its words, its letters, and its numerals and directions. */
function partsOf(text) {
  const words = text.split(" ");
  return { text, words, letters: words.join(""), keys: keyWords(words) };
}

// Each answer's names, split once (a category's answers are used again and again).
const NAMES = new WeakMap();
function namesOf(a) {
  let names = NAMES.get(a);
  if (!names) {
    names = a.aliases.map((alias) => ({
      ...partsOf(alias),
      placed: a.aliases.some((other) => alias.startsWith(`${other} `)), // a name with a place after it ("amman jordan")
    }));
    NAMES.set(a, names);
  }
  return names;
}

/**
 * How many typos turn a guess into a name, counted word by word: each word
 * may have as many as `room` gives a word its length, and the guess no more
 * than `most` in all. So "Thomas Gold" isn't Thomas Cole: two typos in one
 * short word make it another word, however long the whole name is. Words run
 * together or split apart ("spider man") are compared letter by letter, with
 * one typo fewer. Infinity when there are too many.
 */
function typos(guess, name, room, most) {
  if (Math.abs(guess.letters.length - name.letters.length) > most) return Infinity;
  if (guess.words.length !== name.words.length) {
    const allowed = Math.min(most - 1, room(guess.letters.length));
    const d = distance(guess.letters, name.letters, allowed, true);
    return d <= allowed ? d : Infinity;
  }
  let total = 0;
  for (let i = 0; i < guess.words.length; i++) {
    const g = guess.words[i];
    const n = name.words[i];
    if (g === n) continue;
    const allowed = room(Math.max(g.length, n.length));
    const d = distance(g, n, allowed, true);
    if (d > allowed || (total += d) > most) return Infinity;
  }
  return total;
}

/** A guess, and the guess without words the category leaves off ("pope gregory", "gregory"). */
const formsOf = (g, strip) => [g, ...strip.flatMap((w) => [g.startsWith(`${w} `) ? g.slice(w.length + 1) : null, g.endsWith(` ${w}`) ? g.slice(0, -w.length - 1) : null]).filter(Boolean)];

/**
 * Find the answer a guess means. Exact matches on any alias win; otherwise the
 * closest alias within the typo allowance (word by word, two at most), if only
 * one answer is that close.
 * answers: [{ name, aliases: [normalized], ... }]. A category can also give
 * `strip`, words players add that the aliases leave off ("pope" in "Pope
 * Gregory"), and `not`, real names a typo away from an answer that must not
 * count as it ("rhone" isn't the Rhine). Returns the answer or null.
 */
export function match(guess, answers, { strip = [], not = [] } = {}) {
  const g = normalize(guess);
  if (!g || not.includes(g)) return null;
  const forms = formsOf(g, strip);
  for (const form of forms) for (const a of answers) if (a.aliases.includes(form)) return a;
  let best = null;
  let bestDistance = Infinity;
  let tied = false;
  for (const form of forms.map(partsOf)) {
    const most = typosAllowed(form.letters.length);
    if (!most) continue;
    for (const a of answers) {
      for (const name of namesOf(a)) {
        if (name.keys !== form.keys) continue;
        const dist = typos(form, name, typoRoom, most);
        if (dist === Infinity) continue;
        if (dist < bestDistance) {
          [best, bestDistance, tied] = [a, dist, false];
        } else if (dist === bestDistance && best && best !== a) {
          tied = true;
        }
      }
    }
  }
  return best && !tied ? best : null;
}

// Little words a name can do without ("Ivan Terrible" is close to Ivan the Terrible).
const LITTLE = new Set(["the", "of", "and", "a", "an"]);

/**
 * The answers a guess was probably reaching for, when it's too far off to
 * count on its own, for "Did you mean ...?": a typo more than match()
 * forgives in longer words, a name cut short ("Trebonianus Gal"), or most of
 * a name's words, if few answers share them ("Trebonianus"; but not
 * "Hungary" for "Budapest, Hungary"). Never across a numeral or a direction
 * ("Elizabeth II" doesn't offer Elizabeth I), and never for a name ruled out
 * with `not`. Returns up to `limit` answers, the closest first, then the
 * most read.
 */
export function nearest(guess, answers, { strip = [], not = [] } = {}, limit = 3) {
  const g = normalize(guess);
  if (!g || not.includes(g)) return [];
  const score = new Map(); // answer -> how far off (lower is closer)
  const offer = (a, s) => score.set(a, Math.min(s, score.get(a) ?? Infinity));
  for (const form of formsOf(g, strip).map(partsOf)) {
    const letters = form.letters.length;
    const most = letters < 5 ? 1 : letters < 9 ? 2 : 3;
    // Words of a name ("Trebonianus", "Ivan Terrible"): at least half its
    // letters, if few answers have them all. Not from a name with a place
    // after it ("Amman, Jordan"), or a country would find its capital.
    const words = form.words.filter((w) => !LITTLE.has(w));
    const fits = words.map((w, i) => (x) => x === w || (w.length >= 5 && distance(w, x, 1) <= 1) || (i === words.length - 1 && w.length >= 3 && x.startsWith(w)));
    const byWords = words.some((w) => w.length >= 4);
    const covers = (name) => {
      if (name.placed || !fits.every((fit) => name.words.some(fit))) return false;
      const covered = name.words.filter((x) => fits.some((fit) => fit(x))).join("");
      return covered.length >= 0.5 * name.letters.length;
    };
    const hits = [];
    for (const a of answers) {
      let hit = false;
      for (const name of namesOf(a)) {
        if (name.keys !== form.keys) continue;
        const d = typos(form, name, nearRoom, most);
        if (d !== Infinity) offer(a, d);
        // Stopped typing partway: most of the name, nearly right.
        else if (form.text.length >= 4 && form.text.length < name.text.length && form.text.length >= 0.6 * name.text.length && distance(form.text, name.text.slice(0, form.text.length), 1) <= 1) offer(a, 4);
        hit ||= byWords && covers(name);
      }
      if (hit) hits.push(a);
    }
    if (hits.length <= limit) for (const a of hits) offer(a, 5);
  }
  return [...score]
    .sort(([a, x], [b, y]) => x - y || (b.perDay ?? 0) - (a.perDay ?? 0))
    .slice(0, limit)
    .map(([a]) => a);
}

/** How deep a prompt's rarest answers dig. */
export const MAX_DEPTH = 50;

/**
 * How rare each of a list's answers is, from how often its Wikipedia article
 * is read (`views`, over the same span for all of them): of all the reads of
 * the list's articles, this one's share, as "1 in N". Returns
 * [{ oneIn, depth }], in the same order.
 *
 * Depth is measured within the list, so every prompt can go as deep: its
 * most-read answer digs 1 m and its rarest dig MAX_DEPTH, with each ten times
 * rarer in between digging the same distance further. "Rarest" is the rarest
 * 3% (at least one), or, if more, the answers that together get just the last
 * 1% of the list's reads: a list padded with pages nobody reads (Latin names
 * of beetles) would otherwise leave the answers people do know shallow.
 * Some lists are all famous pages (the countries bordering Germany) and some
 * run to thousands of unread ones (dog breeds); either way, the rarest
 * answers are the deep ones.
 */
export function rarity(views) {
  const total = views.reduce((n, v) => n + v, 0);
  const share = views.map((v) => Math.max(1, total / Math.max(v, 1)));
  const oneIn = share.map((n) => Math.round(n));
  const logs = share.map((n) => Math.log10(n));
  const sorted = [...logs].sort((a, b) => a - b);
  const low = sorted[0];
  // The most read of the answers that together get the last 1% of the reads.
  const byReads = [...views].sort((a, b) => a - b);
  let tail = 0;
  let deepest = byReads[0];
  for (const v of byReads) {
    if ((tail += v) > 0.01 * total) break;
    deepest = v;
  }
  const high = Math.min(sorted[sorted.length - Math.max(1, Math.ceil(sorted.length * 0.03))], Math.log10(Math.max(1, total / Math.max(deepest, 1))));
  return oneIn.map((n, i) => ({
    oneIn: n,
    depth: high > low ? Math.max(1, Math.min(MAX_DEPTH, Math.round(1 + ((MAX_DEPTH - 1) * (logs[i] - low)) / (high - low)))) : 1,
  }));
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
