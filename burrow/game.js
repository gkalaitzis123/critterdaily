// Burrow's rules, with no page or network code, so they're unit-tested in
// Node and shared by the data builder and the game.
//
// Each day has seven letters. In one minute, make as many words as you can
// from them (4 to 7 letters, each letter once per word). Every word digs
// Clover the rabbit's burrow deeper, and the rarer the word, the deeper it
// digs: how rare comes from how often it turns up in English (wordfreq's
// Zipf frequency), so "note" digs 4 m and "tenon" 15 m.

export const LAUNCH = "2026-10-18"; // Burrow #1
export const SECONDS = 60; // two minutes made the deepest tier too easy to reach
export const MIN_LETTERS = 4;

/**
 * How deep a word digs, in meters: 3 m for every step of rarity below the
 * most common words (a Zipf frequency of 6.5), no rarer than 2 (about once
 * in ten million words: below that are mostly Scrabble oddities), plus 2 m a
 * letter past four, and 10 m more for a word using all seven letters.
 */
export function depthFor(word, zipf) {
  return Math.max(1, Math.round((6.5 - Math.max(zipf, 2)) * 3)) + 2 * (word.length - 4) + (word.length === 7 ? 10 : 0);
}

/** Letters only, lowercase: "Ten-on!" is "tenon". */
export const normalize = (text) => String(text ?? "").toLowerCase().replace(/[^a-z]/g, "");

/** Whether a word can be made from the letters, each used once. */
export function canMake(word, letters) {
  const left = [...letters];
  for (const ch of word) {
    const i = left.indexOf(ch);
    if (i < 0) return false;
    left.splice(i, 1);
  }
  return true;
}

/**
 * What a guess does: { ok: true, word, meters } or { ok: false, why } with why
 * "short", "letters" (not from today's), "found" (already) or "unknown".
 * puzzle: { letters: "trnoect", words: [[word, meters, shown], ...] }.
 */
export function check(guess, puzzle, found) {
  const word = normalize(guess);
  if (word.length < MIN_LETTERS) return { ok: false, why: "short" };
  if (!canMake(word, puzzle.letters)) return { ok: false, why: "letters" };
  if (found.includes(word)) return { ok: false, why: "found" };
  const entry = puzzle.words.find(([w]) => w === word);
  return entry ? { ok: true, word, meters: entry[1] } : { ok: false, why: "unknown" };
}

/** How deep a word in the puzzle digs. */
export const metersOf = (word, puzzle) => puzzle.words.find(([w]) => w === word)?.[1] ?? 0;

/** The day's depth: every word found, added up. */
export const totalOf = (found, puzzle) => found.reduce((n, w) => n + metersOf(w, puzzle), 0);

/** The deepest word found, or null. */
export const rarestOf = (found, puzzle) => found.reduce((best, w) => (!best || metersOf(w, puzzle) > metersOf(best, puzzle) ? w : best), null);

/** Words using all seven letters. */
export const sevens = (puzzle) => puzzle.words.filter(([w]) => w.length === 7).map(([w]) => w);

/** The rarest words left unfound that most people would know, deepest first. */
export function missed(found, puzzle, limit = 5) {
  return puzzle.words
    .filter(([w, , shown]) => shown && !found.includes(w))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([w, meters]) => ({ word: w, meters }));
}

/** How far down Clover got, by the day's depth. */
export const TIERS = [
  { name: "Topsoil", min: 0, blurb: "where the worms live" },
  { name: "Root Cellar", min: 30, blurb: "down among the carrots" },
  { name: "Clay Seam", min: 60, blurb: "cool, damp and quiet" },
  { name: "Bedrock", min: 100, blurb: "where the digging gets hard" },
  { name: "Glowworm Cave", min: 150, blurb: "the deepest burrow there is" },
];
export function tierFor(total) {
  let index = 0;
  TIERS.forEach((t, i) => {
    if (total >= t.min) index = i;
  });
  return { ...TIERS[index], index };
}

/** Days since Burrow #1, counting it as 1, in the player's own time zone. */
export function dayNumber(date = new Date()) {
  const [y, m, d] = LAUNCH.split("-").map(Number);
  return Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(y, m - 1, d)) / 86400000) + 1;
}

/** The day's puzzle. The puzzles repeat after a year. */
export const puzzleFor = (day, puzzles) => puzzles[(((day - 1) % puzzles.length) + puzzles.length) % puzzles.length];

/** A square for each word found, by how deep it dug: no spoilers, just the shape of the dig. */
export const square = (meters, word) => (word.length === 7 ? "💎" : meters >= 15 ? "🟪" : meters >= 10 ? "🟥" : meters >= 6 ? "🟧" : "🟨");

export function shareText(day, found, puzzle, url) {
  const total = totalOf(found, puzzle);
  const squares = found.map((w) => square(metersOf(w, puzzle), w));
  const shown = squares.length > 24 ? `${squares.slice(0, 24).join("")}+${squares.length - 24}` : squares.join("");
  return `Burrow #${day} 🐇 ${total} m · ${tierFor(total).name}\n${found.length} word${found.length === 1 ? "" : "s"} ${shown}\n${url}`;
}

/** Played, average and deepest day, the streak and the best streak, from { day: meters }. */
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
