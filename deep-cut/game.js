// Deep Cut's rules, with no page or network code, so they're unit-tested in
// Node and shared by the data builder and the game.
//
// Each day has eight prompts ("Name a Roman emperor"; the first eleven days
// had five). Any answer on the list counts, and the less it's read on
// Wikipedia, the deeper Digby digs: an answer's rarity is its share of
// everyone reading the list's articles ("1 in 2,769"), and every ten times
// rarer digs 10 m deeper, down through the periods of Earth's history.

export const PROMPTS_PER_DAY = 8;
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

// Numbers in words, for the names that spell them out: normalize leaves a
// number that doesn't follow a word as it is ("7 falls" is Seven Falls, "100
// years war" the Hundred Years' War).
const NUMBER_WORDS = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty".split(" ");
const TENS = { 30: "thirty", 40: "forty", 50: "fifty", 60: "sixty", 70: "seventy", 80: "eighty", 90: "ninety", 100: "hundred", 1000: "thousand" };
const spelled = (g) => {
  const words = g.replace(/(?<=^| )\d+(?= |$)/g, (n) => NUMBER_WORDS[Number(n)] ?? TENS[Number(n)] ?? n);
  return words === g ? null : words;
};

/** A guess, and the guess without words the category leaves off ("pope gregory", "gregory"); each with its numbers in words too ("7 falls", "seven falls"). */
const formsOf = (g, strip) => {
  const forms = [g, ...strip.flatMap((w) => [g.startsWith(`${w} `) ? g.slice(w.length + 1) : null, g.endsWith(` ${w}`) ? g.slice(0, -w.length - 1) : null]).filter(Boolean)];
  return [...forms, ...forms.map(spelled).filter(Boolean)];
};

// Titles players put before a name ("King Louis XIV", "President Abraham
// Lincoln"): left off when what follows is a whole name of two words or more,
// so "Queen Victoria" never turns into Victoria, the Seychelles' capital.
const TITLES = new Set("king queen emperor empress pope saint sir lord lady dame president general admiral captain dr doctor prince princess tsar czar tsarina sultan pharaoh chief professor".split(" "));
const untitled = (g) => {
  const words = g.split(" ");
  return words.length >= 3 && TITLES.has(words[0]) ? words.slice(1).join(" ") : null;
};

/**
 * A word's plain form, for words said more than one way: plurals ("lilies",
 * "lily") and the -ism, -ist and -ic(al) of a movement ("neoclassical",
 * "neoclassicism"; "impressionists", "impressionism"). Short words stay as
 * they are.
 */
export function stem(word) {
  let w = word;
  for (let i = 0; i < 2 && w.length >= 5; i++) {
    const before = w;
    w = w.replace(/(isms|ists|ism|ist|ical|ic)$/, "") || before;
    if (w === before) w = w.replace(/ies$/, "y").replace(/(ch|sh|x|ss)es$/, "$1").replace(/(?<![su])s$/, "");
    if (w === before) break;
  }
  return w;
}
const stems = (text) => text.split(" ").map(stem).join(" ");
// Each answer's names in plain form (see stem).
const STEMS = new WeakMap();
const stemsOf = (a) => {
  let s = STEMS.get(a);
  if (!s) STEMS.set(a, (s = new Set(a.aliases.map(stems))));
  return s;
};

/**
 * Find the answer a guess means. Exact matches on any alias win (also without
 * a title before a name, "King Louis XIV"); then the same words in another
 * form ("Neoclassical" for Neoclassicism), if only one answer has them;
 * otherwise the closest alias within the typo allowance (word by word, two at
 * most), if only one answer is that close.
 * answers: [{ name, aliases: [normalized], ... }]. A category can also give
 * `strip`, words players add that the aliases leave off ("pope" in "Pope
 * Gregory"), and `not`, real names a typo away from an answer that must not
 * count as it ("rhone" isn't the Rhine). With `typos: false`, only exact
 * matches and other forms count (for a full list, where thousands of rarely
 * read names would make a typo too easy to count as one). An answer's `also`
 * names (Wikipedia's redirects to its article: "Beetlejuice", "Bombay") count
 * only typed as they are. Returns the answer or null.
 */
export function match(guess, answers, { strip = [], not = [], typos: typosToo = true } = {}) {
  const g = normalize(guess);
  if (!g || not.includes(g)) return null;
  const forms = formsOf(g, strip);
  const exact = [...forms, ...forms.map(untitled).filter(Boolean)];
  for (const form of exact) for (const a of answers) if (a.aliases.includes(form) || a.also?.includes(form)) return a;
  // The same letters with the words run together or split apart ("golden doodle", "Goldendoodle").
  const joined = new Set(exact.map((f) => f.replace(/ /g, "")));
  const together = answers.filter((a) => namesOf(a).some((n) => joined.has(n.letters)));
  if (together.length === 1) return together[0];
  const plain = new Set(exact.map(stems));
  const same = answers.filter((a) => [...plain].some((p) => stemsOf(a).has(p)));
  if (same.length === 1) return same[0];
  if (!typosToo) return null;
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

/**
 * Which part of a full list a name is in: its first letter, or "0" for a
 * digit. A full list can run to thousands of answers, so it's split this way
 * and a guess loads only the parts it could be in (partsFor).
 */
export const partOf = (name) => (/^[a-z]/.test(name) ? name[0] : "0");

/**
 * The parts of a full list a guess could be found in: where its forms start.
 * match's other forms (run together, plural) start with the same letter, and
 * nearest offers a full list's answers only for a typo or a name cut short
 * (mostly the same first letter too), so each answer is in its names' parts.
 */
export function partsFor(guess, { strip = [] } = {}) {
  const g = normalize(guess);
  if (!g) return [];
  const forms = formsOf(g, strip);
  return [...new Set([...forms, ...forms.map(untitled).filter(Boolean)].map(partOf))];
}

/**
 * A full list ([[name, wiki, views, [names]]]) split into its parts: each
 * answer in the part of each of its names, with the names that start there.
 * Map of part to rows, in the list's order.
 */
export function splitParts(rows) {
  const parts = new Map();
  for (const [name, wiki, views, names] of rows) {
    const into = new Map();
    for (const n of names) into.set(partOf(n), [...(into.get(partOf(n)) ?? []), n]);
    for (const [part, own] of into) parts.set(part, [...(parts.get(part) ?? []), [name, wiki, views, own]]);
  }
  return parts;
}

/** Rows from parts of a full list, each answer once: one in several parts has the names that start there in each. */
export function joinParts(rows) {
  const byWiki = new Map();
  for (const [name, wiki, views, names] of rows) {
    if (byWiki.has(wiki)) byWiki.get(wiki)[3].push(...names);
    else byWiki.set(wiki, [name, wiki, views, [...names]]);
  }
  return [...byWiki.values()];
}

// Little words a name can do without ("Ivan Terrible" is close to Ivan the Terrible).
const LITTLE = new Set(["the", "of", "and", "a", "an"]);

/** A name's first and last words, but for little ones (Impression, Sunrise: "impression", "sunrise"). */
export function endsOf(name) {
  const own = normalize(name).split(" ").filter((w) => w && !LITTLE.has(w));
  return [own[0], own.at(-1)].filter(Boolean);
}

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
    const fits = words.map((w, i) => (x) => x === w || (w.length >= 5 && distance(w, x, 1) <= 1) || (i === words.length - 1 && w.length >= 3 && x.startsWith(w)) || (w.length >= 4 && stem(x) === stem(w)));
    const byWords = words.some((w) => w.length >= 4);
    const covers = (name) => {
      if (name.placed || !fits.every((fit) => name.words.some(fit))) return false;
      const covered = name.words.filter((x) => fits.some((fit) => fit(x))).join("");
      return covered.length >= 0.5 * name.letters.length;
    };
    // One telling word can be enough to ask about, if it starts or ends the
    // answer's own name ("Sunrise" for Impression, Sunrise; "Buzz" for Buzz
    // Aldrin): never a word in the middle of some other name it goes by, or
    // "John" would bring up everyone christened John.
    const telling = words.length === 1 && words[0].length >= 4 ? fits[0] : null;
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
      hit ||= Boolean(telling && form.keys === "" && endsOf(a.name).some(telling));
      // Not an answer from a full list: thousands of rarely read names share
      // too many words ("raphael" would bring up Antonietta Raphaël).
      if (hit && !a.full) hits.push(a);
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

/**
 * How deep an answer from a list's full list digs (see more.mjs), on the
 * list's own scale: a list's depths fall on a straight line against how rare
 * its answers are (rarity: ten times rarer, the same distance deeper), so the
 * line through its answers places another, and it stops at 1 and MAX_DEPTH
 * as theirs do. answers: the list's [{ oneIn, depth }].
 */
export function depthFor(oneIn, answers) {
  if (oneIn <= Math.min(...answers.map((a) => a.oneIn))) return 1; // read as much as the most read
  const points = answers.filter((a) => a.depth > 1 && a.depth < MAX_DEPTH).map((a) => [Math.log10(a.oneIn), a.depth]);
  let slope;
  let at;
  if (points.length >= 2) {
    // The best straight line through them (least squares).
    const n = points.length;
    const mx = points.reduce((s, [x]) => s + x, 0) / n;
    const my = points.reduce((s, [, y]) => s + y, 0) / n;
    const sxy = points.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0);
    const sxx = points.reduce((s, [x]) => s + (x - mx) ** 2, 0);
    slope = sxx ? sxy / sxx : 0;
    at = my - slope * mx;
  } else {
    // Too few in between: from the most read (1 m) to the rarest (MAX_DEPTH).
    const logs = answers.map((a) => Math.log10(a.oneIn));
    const low = Math.min(...logs);
    const deep = answers.filter((a) => a.depth >= MAX_DEPTH).map((a) => Math.log10(a.oneIn));
    const high = deep.length ? Math.min(...deep) : Math.max(...logs);
    slope = high > low ? (MAX_DEPTH - 1) / (high - low) : 0;
    at = 1 - slope * low;
  }
  return slope > 0 ? Math.max(1, Math.min(MAX_DEPTH, Math.round(at + slope * Math.log10(Math.max(1, oneIn))))) : MAX_DEPTH;
}

/**
 * An answer from a list's full list ([name, wiki, views, aliases], views
 * being 60 days' reads), made like the list's own: how many read it a day,
 * its share of the list's readers ("1 in N") and its depth.
 */
export function fromFull([name, wiki, views, aliases], list) {
  const oneIn = Math.max(1, Math.round((list.readers * 60) / Math.max(views, 1)));
  return { name, wiki, perDay: Math.max(1, Math.round(views / 60)), oneIn, depth: depthFor(oneIn, list.answers), aliases, full: true };
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

/** The category ids for a day (five a day at first, eight since #12). The schedule repeats once it runs out. */
export function promptsFor(day, schedule) {
  return schedule[(((day - 1) % schedule.length) + schedule.length) % schedule.length];
}

/**
 * The periods of Earth's history Digby digs back through, for a day of five
 * prompts. A day's total lands in one of them: famous answers all day stay
 * in the Holocene, and five deep cuts reach the Cambrian. A day with more
 * prompts goes deeper in proportion (periodsFor).
 */
export const PERIODS = [
  { name: "Holocene", min: 0, ago: "today" },
  { name: "Pleistocene", min: 60, ago: "the Ice Age" },
  { name: "Cretaceous", min: 80, ago: "70 million years ago" },
  { name: "Jurassic", min: 100, ago: "170 million years ago" },
  { name: "Permian", min: 125, ago: "270 million years ago" },
  { name: "Cambrian", min: 150, ago: "510 million years ago" },
];
const PERIOD_PROMPTS = 5; // the day PERIODS is measured for

/** The periods for a day of `prompts` prompts: each is reached by the same depth per prompt. */
export function periodsFor(prompts = PERIOD_PROMPTS) {
  return PERIODS.map((p) => ({ ...p, min: Math.round((p.min * prompts) / PERIOD_PROMPTS) }));
}

/** The period for a day's total out of `prompts` prompts, with the next one and how far it is: { name, min, ago, index, next: { name, toGo } | null }. */
export function periodFor(total, prompts = PERIOD_PROMPTS) {
  const periods = periodsFor(prompts);
  const index = Math.max(0, periods.findLastIndex((p) => total >= p.min));
  const next = periods[index + 1];
  return { ...periods[index], index, next: next ? { name: next.name, toGo: next.min - total } : null };
}

// One square per answer in the color of the period it would reach if every
// answer that day were as deep, from the Holocene's brown to the Cambrian's
// purple; black for no answer.
const SQUARES = ["🟫", "🟦", "🟨", "🟧", "🟥", "🟪"];

/** The text players share: how deep, a square for each answer and the rarest, never the answers. */
export function shareText(day, results, url) {
  const total = results.reduce((n, r) => n + (r.depth ?? 0), 0);
  const squares = results.map((r) => (r.depth ? SQUARES[periodFor(r.depth, 1).index] : "⬛")).join("");
  const rarest = results.filter((r) => r.depth && r.oneIn).reduce((best, r) => (!best || r.oneIn > best.oneIn ? r : best), null);
  return `Deep Cut #${day} ⛏️ ${total} m · ${periodFor(total, results.length).name}\n${squares}${rarest ? `\nRarest find: 1 in ${compact(rarest.oneIn)}` : ""}\n${url}`;
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
