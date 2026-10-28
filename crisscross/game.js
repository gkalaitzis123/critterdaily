// Crisscross's rules, with no page or network code, so they're unit-tested in
// Node and shared by the data builder and the game.
//
// A mini crossword a day: a 5x5 grid and about ten clues, across and down.
// Fill it in as fast as you can, and the time is your score. Two kinds of
// help each add HINT_SECONDS to it: checking the grid (wrong letters are
// marked) and revealing a square. Webster the spider spins her web while you
// solve, and the quicker the solve, the finer the web and the title.
//
// A puzzle is { rows: ["key##", "idea#", ...], across: [clue, ...], down: [clue, ...] }:
// lowercase letters, "#" for a black square, and the clues in number order.

export const LAUNCH = "2026-10-27"; // Crisscross #1
export const BLACK = "#";
export const HINT_SECONDS = 10;
export const MAX_SECONDS = 3600; // the slowest time sent to how-everyone-did

/**
 * The grid: every square ({ i, r, c, letter, number, across, down }, with
 * letter null for a black square), and the entries across and down
 * ({ dir, number, cells, answer, clue }), numbered as crosswords are: left to
 * right, top to bottom, wherever an entry starts.
 */
export function layout(puzzle) {
  const { rows } = puzzle;
  const height = rows.length;
  const width = rows[0].length;
  const white = (r, c) => r >= 0 && c >= 0 && r < height && c < width && rows[r][c] !== BLACK;
  const cells = [];
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) cells.push({ i: r * width + c, r, c, letter: white(r, c) ? rows[r][c] : null, number: null, across: null, down: null });
  const across = [];
  const down = [];
  let n = 0;
  for (const cell of cells) {
    if (!cell.letter) continue;
    const { r, c } = cell;
    const startsAcross = !white(r, c - 1) && white(r, c + 1);
    const startsDown = !white(r - 1, c) && white(r + 1, c);
    if (!startsAcross && !startsDown) continue;
    cell.number = ++n;
    if (startsAcross) {
      const run = [];
      for (let k = c; white(r, k); k++) run.push(r * width + k);
      across.push({ dir: "across", number: n, cells: run });
    }
    if (startsDown) {
      const run = [];
      for (let k = r; white(k, c); k++) run.push(k * width + c);
      down.push({ dir: "down", number: n, cells: run });
    }
  }
  for (const [list, clues] of [
    [across, puzzle.across],
    [down, puzzle.down],
  ]) {
    list.forEach((entry, k) => {
      entry.answer = entry.cells.map((i) => cells[i].letter).join("");
      entry.clue = clues?.[k] ?? "";
      for (const i of entry.cells) cells[i][entry.dir] = entry;
    });
  }
  return { width, height, cells, across, down, entries: [...across, ...down] };
}

export const other = (dir) => (dir === "across" ? "down" : "across");

/** The entry a square is in going `dir`, or the other way if it's only in one. */
export const entryAt = (grid, i, dir) => grid.cells[i][dir] ?? grid.cells[i][other(dir)];

const emptyIn = (entry, fills) => entry.cells.filter((i) => !fills[i]);

/** The next entry after `entry` (or before, step -1), wrapping, that still has an empty square; null if none does. */
export function nextOpen(grid, fills, entry, step = 1) {
  const all = grid.entries;
  const at = all.indexOf(entry);
  for (let k = 1; k <= all.length; k++) {
    const e = all[(((at + step * k) % all.length) + all.length) % all.length];
    if (emptyIn(e, fills).length) return e;
  }
  return null;
}

/** The next entry in clue order (or before, step -1), wrapping. */
export function stepEntry(grid, entry, step = 1) {
  const all = grid.entries;
  return all[(((all.indexOf(entry) + step) % all.length) + all.length) % all.length];
}

/**
 * Where the cursor goes after a letter is typed at square i: the next empty
 * square later in the entry, else an empty one earlier in it. With the entry
 * full: the next square along if the letter replaced one (so a word can be
 * fixed letter by letter), else the first empty square of the next entry
 * that has one. With the grid full, the next square of the entry (or this
 * one, at its end). Returns { i, dir }.
 */
export function afterTyping(grid, fills, i, dir, replaced = false) {
  const entry = entryAt(grid, i, dir);
  const k = entry.cells.indexOf(i);
  const empty = (j) => !fills[j];
  const later = entry.cells.slice(k + 1).find(empty);
  if (later !== undefined) return { i: later, dir: entry.dir };
  const earlier = entry.cells.slice(0, k).find(empty);
  if (earlier !== undefined) return { i: earlier, dir: entry.dir };
  if (replaced && k < entry.cells.length - 1) return { i: entry.cells[k + 1], dir: entry.dir };
  const next = nextOpen(grid, fills, entry);
  if (next) return { i: next.cells.find(empty), dir: next.dir };
  return { i: entry.cells[Math.min(k + 1, entry.cells.length - 1)], dir: entry.dir };
}

/**
 * Backspace at square i: clears it if it has a letter; otherwise moves back a
 * square (to the end of the entry before, from an entry's first square) and
 * clears that. Returns { i, dir, clear } with clear the square to empty.
 */
export function afterBackspace(grid, fills, i, dir) {
  const entry = entryAt(grid, i, dir);
  if (fills[i]) return { i, dir: entry.dir, clear: i };
  const k = entry.cells.indexOf(i);
  if (k > 0) return { i: entry.cells[k - 1], dir: entry.dir, clear: entry.cells[k - 1] };
  const before = stepEntry(grid, entry, -1);
  const last = before.cells.at(-1);
  return { i: last, dir: before.dir, clear: last };
}

/** The square an arrow key moves to from i (dr, dc of -1, 0 or 1): the next white one that way, past black ones, or i at the edge. */
export function arrow(grid, i, dr, dc) {
  let { r, c } = grid.cells[i];
  for (;;) {
    r += dr;
    c += dc;
    if (r < 0 || c < 0 || r >= grid.height || c >= grid.width) return i;
    const cell = grid.cells[r * grid.width + c];
    if (cell.letter) return cell.i;
  }
}

export const isFull = (grid, fills) => grid.cells.every((c) => !c.letter || fills[c.i]);
export const isSolved = (grid, fills) => grid.cells.every((c) => !c.letter || fills[c.i] === c.letter);
/** Squares with a letter that isn't the answer's. */
export const wrongSquares = (grid, fills) => grid.cells.filter((c) => c.letter && fills[c.i] && fills[c.i] !== c.letter).map((c) => c.i);
/** Whether an entry is filled in (right or not). */
export const filled = (entry, fills) => entry.cells.every((i) => fills[i]);

/** The time a solve counts for: whole seconds on the clock, plus the hints. */
export const timeOf = (ms, hints = 0) => Math.floor(ms / 1000) + HINT_SECONDS * hints;

/** "0:47", "1:05", "12:00". */
export const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

/** What a solve makes you, by its time: the slowest first. `max` is the slowest time a tier takes, in seconds. */
export const TIERS = [
  { name: "Hatchling", max: Infinity, blurb: "every spider starts small" },
  { name: "Thread Spinner", max: 180, blurb: "the silk is flowing" },
  { name: "Web Weaver", max: 120, blurb: "a tidy little web" },
  { name: "Master Weaver", max: 75, blurb: "a web to be proud of" },
  { name: "Silk Sprinter", max: 45, blurb: "spun before the dew dried" },
];
export function tierFor(seconds) {
  let index = 0;
  TIERS.forEach((t, i) => {
    if (seconds <= t.max) index = i;
  });
  return { ...TIERS[index], index };
}

/** A tier's times, for the ladder: "0:45 or less", "0:46–1:15", "over 3:00". */
export function tierRange(index) {
  const t = TIERS[index];
  const faster = TIERS[index + 1];
  if (t.max === Infinity) return `over ${clock(faster.max)}`;
  if (!faster) return `${clock(t.max)} or less`;
  return `${clock(faster.max + 1)}–${clock(t.max)}`;
}

/** Days since Crisscross #1, counting it as 1, in the player's own time zone. */
export function dayNumber(date = new Date()) {
  const [y, m, d] = LAUNCH.split("-").map(Number);
  return Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(y, m - 1, d)) / 86400000) + 1;
}

/** The day's puzzle. The puzzles repeat once they run out. */
export const puzzleFor = (day, puzzles) => puzzles[(((day - 1) % puzzles.length) + puzzles.length) % puzzles.length];

export const hintNote = (hints) => (hints ? `${hints} hint${hints === 1 ? "" : "s"} (+${hints * HINT_SECONDS} s)` : "No hints");

export function shareText(day, time, hints, url) {
  return `Crisscross #${day} 🕸️ ${clock(time)} · ${tierFor(time).name}\n${hints ? hintNote(hints) : "No hints ✨"}\n${url}`;
}

/** Of everyone who finished, the percentage who took longer than `time`. */
export function fasterThan({ players, counts }, time) {
  const slower = Object.entries(counts).reduce((n, [s, c]) => n + (Number(s) > time ? c : 0), 0);
  return players ? Math.round((100 * slower) / players) : 0;
}

/** Solved, the average and best times, solves with no hints, the streak and the best streak, from { day: { time, hints } }. */
export function stats(history, today) {
  const days = Object.keys(history).map(Number).sort((a, b) => a - b);
  const times = days.map((d) => history[d].time);
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
    average: days.length ? Math.round(times.reduce((a, b) => a + b, 0) / days.length) : 0,
    best: days.length ? Math.min(...times) : 0,
    clean: days.filter((d) => !history[d].hints).length,
    streak,
    bestStreak: best,
  };
}
