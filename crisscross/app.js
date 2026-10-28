// Crisscross in the browser: today's grid, typing (on screen or a real
// keyboard) with a cursor that moves like a crossword's, the clock (paused
// while the page is away), Check and Reveal, Webster's web filling in, the
// results, sharing, stats and practice puzzles. The rules live in game.js.
import {
  HINT_SECONDS,
  LAUNCH,
  MAX_SECONDS,
  TIERS,
  afterBackspace,
  afterTyping,
  arrow,
  clock,
  dayNumber,
  entryAt,
  fasterThan,
  filled,
  hintNote,
  isFull,
  isSolved,
  layout,
  nextOpen,
  other,
  puzzleFor,
  shareText,
  stats,
  stepEntry,
  tierFor,
  tierRange,
  timeOf,
  wrongSquares,
} from "./game.js";
import { settingsButton } from "./settings.js";
import { calendar, habit, tierBars } from "./stats-view.js";
import { averageOf, count, howEveryoneDid, sendScore } from "./everyone.js";

const $ = (sel) => document.querySelector(sel);

/**
 * Counts a moment of play in Critter Daily's stats (Umami, which uses no
 * cookies and knows nothing about who you are). Umami only runs on
 * critterdaily.com, so local copies and tests count nothing.
 */
const track = (event, data) => {
  try {
    window.umami?.track(event, data);
  } catch {
    // Stats are never worth breaking a game for.
  }
};
const STORE = "crisscross-v1";
const screens = ["loading", "intro", "play", "results"];
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const TIER_COLORS = ["#c9c3d9", "#b3a4ec", "#8db4ee", "#5fcbb5", "#ffb938"]; // slowest to quickest
// Every game's day 1 is the site's (stats-view.js); Crisscross started this many days later.
const LATE = Math.round((Date.UTC(...LAUNCH.split("-").map((n, i) => Number(n) - (i === 1 ? 1 : 0))) - Date.UTC(2026, 9, 17)) / 86400000);
const KEYS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

let puzzles;
let practicePuzzles = null;
let today;
let mode = "daily"; // or "practice"
// { day?, puzzle, grid, fills, revealed, wrong, hints, elapsed, resumedAt, cursor: { i, dir }, done, time }
let run;
let timer = null;

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORE)) ?? {};
  } catch {
    return {};
  }
}

function save(fn) {
  const state = load();
  fn(state);
  try {
    localStorage.setItem(STORE, JSON.stringify(state));
  } catch {
    // Private windows can refuse storage; the game still plays.
  }
}

// ---------------------------------------------------------------------------
// Webster the spider, and her web

/** Webster, drawn around (0, 0) in a -44 -44 88 88 box. */
function webster({ wave = false, cheer = false, dangle = false } = {}) {
  const leg = (d, cls = "") => `<path${cls ? ` class="${cls}"` : ""} d="${d}" stroke="#5b47a8" stroke-width="3.4" fill="none" stroke-linecap="round"/>`;
  const side = (s) => {
    const up = cheer || (wave && s > 0);
    return [
      up ? leg(`M${13 * s} -6Q${22 * s} -27 ${31 * s} -33`, s > 0 ? "wave-r" : "wave-l") : leg(`M${13 * s} -6Q${27 * s} -20 ${35 * s} -10`),
      leg(`M${16 * s} 1Q${31 * s} -6 ${38 * s} 4`),
      leg(`M${16 * s} 9Q${30 * s} 11 ${35 * s} 21`),
      leg(`M${12 * s} 15Q${21 * s} 23 ${24 * s} 32`),
    ].join("");
  };
  const eyes = cheer
    ? '<path d="M-10 0q3.5-4 7 0M3 0q3.5-4 7 0" stroke="#2e2a3b" fill="none" stroke-width="2.2" stroke-linecap="round"/>'
    : '<circle cx="-6.5" cy="0" r="5.6" fill="#fff"/><circle cx="6.5" cy="0" r="5.6" fill="#fff"/><circle cx="-6" cy="0.8" r="3.2" fill="#2e2a3b"/><circle cx="7" cy="0.8" r="3.2" fill="#2e2a3b"/><circle cx="-5" cy="-0.6" r="1.1" fill="#fff"/><circle cx="8" cy="-0.6" r="1.1" fill="#fff"/>';
  return `${dangle ? '<path d="M0 -44V-12" stroke="#b9b2cf" stroke-width="1.6"/>' : ""}
    ${side(-1)}${side(1)}
    <circle cx="0" cy="4" r="18" fill="#8b6fe0"/>
    <ellipse cx="0" cy="12" rx="10" ry="7.5" fill="#b7a3f0"/>
    <path d="M0 -14L-8.5 -19.5V-8.5Z" fill="#ff8fa3"/><path d="M0 -14L8.5 -19.5V-8.5Z" fill="#ff8fa3"/><circle cx="0" cy="-14" r="2.6" fill="#ff6f8a"/>
    ${eyes}
    <circle cx="-11.5" cy="7" r="2.6" fill="#ffb3c1"/><circle cx="11.5" cy="7" r="2.6" fill="#ffb3c1"/>
    <path d="M-3 8.5q3 2.6 6 0" stroke="#2e2a3b" fill="none" stroke-width="1.5" stroke-linecap="round"/>`;
}

/**
 * An orb web in a -50 -50 100 100 box: its eight spokes from the start, and
 * up to five rings, spun as far as `progress` (0 to 1) goes, with dewdrops on
 * a finished one if `dew`.
 */
function web(progress, { dew = false } = {}) {
  const SPOKES = 8;
  const RINGS = 5;
  const point = (r, k) => [r * Math.cos((k * 2 * Math.PI) / SPOKES - Math.PI / 2), r * Math.sin((k * 2 * Math.PI) / SPOKES - Math.PI / 2)];
  const f = (n) => n.toFixed(1);
  const spokes = Array.from({ length: SPOKES }, (_, k) => {
    const [x, y] = point(46, k);
    return `M0 0L${f(x)} ${f(y)}`;
  }).join("");
  const rings = Math.ceil(Math.max(0, progress) * RINGS);
  let thread = "";
  for (let n = 1; n <= rings; n++) {
    const r = (n * 44) / RINGS;
    for (let k = 0; k < SPOKES; k++) {
      const [x1, y1] = point(r, k);
      const [x2, y2] = point(r, k + 1);
      const [cx, cy] = point(r * 0.84, k + 0.5); // the threads sag a little toward the middle
      thread += `${k ? "" : `M${f(x1)} ${f(y1)}`}Q${f(cx)} ${f(cy)} ${f(x2)} ${f(y2)}`;
    }
  }
  const drops = dew
    ? [
        [44, 1],
        [35, 3],
        [26, 6],
        [44, 5],
        [17, 2],
      ]
        .map(([r, k]) => {
          const [x, y] = point(r, k);
          return `<circle cx="${f(x)}" cy="${f(y)}" r="2.6" class="dew"/>`;
        })
        .join("")
    : "";
  return `<path class="silk" d="${spokes}${thread}"/>${drops}`;
}

function drawCritters() {
  for (const el of document.querySelectorAll("[data-webster]")) {
    const how = el.dataset.webster;
    el.innerHTML = webster({ wave: how === "wave", cheer: how === "cheer", dangle: how === "dangle" });
  }
}

// ---------------------------------------------------------------------------
// Screens

function show(name) {
  for (const s of screens) $(`#${s}`).hidden = s !== name;
  window.scrollTo(0, 0);
}

const dateLabel = (day) => {
  const d = new Date();
  d.setDate(d.getDate() + (day - today));
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

async function init() {
  drawCritters();
  settingsButton($("#settings-button"));
  $("#help-button").addEventListener("click", () => $("#help").showModal());
  $("#stats-button").addEventListener("click", showStats);
  $("#start").addEventListener("click", startDaily);
  $("#practice-start").addEventListener("click", startPractice);
  $("#practice").addEventListener("click", startPractice);
  $("#back-today").addEventListener("click", () => resumeToday());
  $("#share").addEventListener("click", share);
  $("#check").addEventListener("click", check);
  $("#reveal").addEventListener("click", reveal);
  $("#prev-clue").addEventListener("click", () => jump(-1));
  $("#next-clue").addEventListener("click", () => jump(1));
  $("#clue-now").addEventListener("click", turn);
  $("#grid").addEventListener("click", (e) => {
    const cell = e.target.closest("[data-i]");
    if (cell) tapSquare(Number(cell.dataset.i));
  });
  for (const dir of ["across", "down"]) {
    $(`#list-${dir}`).addEventListener("click", (e) => {
      const b = e.target.closest("[data-n]");
      if (b) goTo(run.grid[dir].find((entry) => entry.number === Number(b.dataset.n)));
    });
  }
  $("#keyboard").innerHTML = KEYS.map(
    (row, k) => `<div class="key-row">${[...row].map((ch) => `<button type="button" class="key" data-key="${ch}">${ch}</button>`).join("")}${k === 2 ? '<button type="button" class="key wide" data-key="Backspace" aria-label="Delete">⌫</button>' : ""}</div>`,
  ).join("");
  $("#keyboard").addEventListener("click", (e) => {
    const key = e.target.closest("[data-key]")?.dataset.key;
    if (!key || !run || run.done) return;
    if (key === "Backspace") backspace();
    else type(key);
  });
  // The game's buttons don't keep the focus when tapped, so a key pressed next (Space, Enter) goes to the grid, not to the button again.
  $("#play").addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) e.preventDefault();
  });
  document.addEventListener("keydown", onKey);
  document.addEventListener("visibilitychange", () => (document.hidden ? pause() : resume()));
  window.addEventListener("pagehide", pause);
  window.addEventListener("pageshow", resume);

  today = dayNumber();
  try {
    puzzles = await (await fetch("data/puzzles.json")).json();
  } catch {
    $("#loading").innerHTML = '<p class="muted">Webster couldn\'t find today\'s grid. Check your connection and reload.</p>';
    return;
  }
  resumeToday();
}

/** Today's game where it was left: not started, half done, or solved. */
function resumeToday() {
  mode = "daily";
  $("#day-label").textContent = `#${today} · ${dateLabel(today)}`;
  const puzzle = puzzleFor(today, puzzles);
  const saved = load().days?.[today];
  // Progress saved for another grid (only if today's puzzle were ever changed) is set aside, not laid over this one.
  if (!saved || saved.grid !== puzzle.rows.join("")) {
    run = null;
    show("intro");
    return;
  }
  run = newRun(puzzle, { ...saved, day: today });
  if (run.done) showResults(false);
  else play();
}

/** A game of a puzzle, fresh or as saved. */
function newRun(puzzle, saved = {}) {
  const grid = layout(puzzle);
  const fills = grid.cells.map((c) => (c.letter && saved.fills?.[c.i]) || "");
  const first = grid.across[0];
  return {
    day: saved.day,
    puzzle,
    grid,
    fills,
    revealed: new Set(saved.revealed ?? []),
    wrong: new Set(),
    hints: saved.hints ?? 0,
    elapsed: saved.elapsed ?? 0,
    resumedAt: null,
    cursor: { i: first.cells.find((i) => !fills[i]) ?? first.cells[0], dir: "across" },
    done: Boolean(saved.done),
    time: saved.time ?? null,
  };
}

/** Today's progress, kept so that leaving and coming back carries on where it was. */
function keep() {
  if (mode !== "daily" || !run) return;
  save((s) => {
    (s.days ??= {})[run.day] = { grid: run.puzzle.rows.join(""), fills: run.fills, revealed: [...run.revealed], hints: run.hints, elapsed: elapsedNow(), done: run.done, time: run.time };
  });
}

// ---------------------------------------------------------------------------
// Playing

function startDaily() {
  mode = "daily";
  track("start", { game: "crisscross", mode, day: today });
  run = newRun(puzzleFor(today, puzzles), { day: today });
  keep();
  play();
}

async function startPractice() {
  mode = "practice";
  track("start", { game: "crisscross", mode });
  if (!practicePuzzles?.length) {
    try {
      practicePuzzles = await (await fetch("data/practice.json")).json();
    } catch {
      return;
    }
  }
  const puzzle = practicePuzzles.splice(Math.floor(Math.random() * practicePuzzles.length), 1)[0];
  run = newRun(puzzle);
  $("#day-label").textContent = "Practice · doesn't count";
  play();
}

const elapsedNow = () => (run ? run.elapsed + (run.resumedAt ? Date.now() - run.resumedAt : 0) : 0);

function play() {
  show("play");
  $("#grid").classList.remove("solved");
  feedback("");
  draw();
  resume();
}

/** The clock runs while the game is on screen. */
function resume() {
  if (!run || run.done || $("#play").hidden || document.hidden) return;
  run.resumedAt ??= Date.now();
  clearInterval(timer);
  timer = setInterval(tick, 250);
  tick();
}

function pause() {
  if (!run || run.done) return;
  if (run.resumedAt) {
    run.elapsed += Date.now() - run.resumedAt;
    run.resumedAt = null;
  }
  clearInterval(timer);
  keep();
}

function tick() {
  $("#clock").textContent = clock(timeOf(elapsedNow(), run.hints));
}

const current = () => entryAt(run.grid, run.cursor.i, run.cursor.dir);

function draw() {
  const { grid, fills, cursor } = run;
  const entry = current();
  $("#grid").innerHTML = grid.cells
    .map((c) => {
      if (!c.letter) return '<span class="cell black" role="presentation"></span>';
      const cls = ["cell", c.i === cursor.i && "here", entry.cells.includes(c.i) && "word", run.wrong.has(c.i) && "wrong", run.revealed.has(c.i) && "revealed"].filter(Boolean).join(" ");
      const letter = fills[c.i].toUpperCase();
      const name = `${c.number ? `${c.number}, ` : ""}row ${c.r + 1}, column ${c.c + 1}: ${letter || "empty"}`;
      return `<button type="button" class="${cls}" data-i="${c.i}" style="--d:${(c.r + c.c) * 70}ms" role="gridcell" aria-label="${name}"${c.i === cursor.i ? ' aria-current="true"' : ""}>${c.number ? `<span class="num">${c.number}</span>` : ""}<span class="ch">${letter}</span></button>`;
    })
    .join("");
  const crossing = grid.cells[cursor.i][other(entry.dir)];
  $("#clue-tag").textContent = `${entry.number} ${entry.dir === "across" ? "Across" : "Down"}`;
  $("#clue-text").textContent = entry.clue;
  fitClue();
  if ($("#sr-clue").dataset.at !== `${entry.number}${entry.dir}`) {
    $("#sr-clue").dataset.at = `${entry.number}${entry.dir}`;
    $("#sr-clue").textContent = `${entry.number} ${entry.dir}: ${entry.clue}`;
  }
  for (const dir of ["across", "down"]) {
    $(`#list-${dir}`).innerHTML = grid[dir]
      .map((e) => `<li><button type="button" class="clue${e === entry ? " here" : e === crossing ? " crossing" : ""}${filled(e, fills) ? " done" : ""}" data-n="${e.number}"><b>${e.number}</b><span>${esc(e.clue)}</span></button></li>`)
      .join("");
  }
  const white = grid.cells.filter((c) => c.letter);
  $("#mini-web").innerHTML = web(white.filter((c) => fills[c.i]).length / white.length);
}

/** The clue in its bar at the biggest type that fits, so the bar keeps one height. */
function fitClue() {
  const line = $("#clue-line");
  const room = $("#clue-now").clientHeight;
  let size = 17;
  line.style.fontSize = `${size}px`;
  while (line.offsetHeight > room && size > 11) line.style.fontSize = `${--size}px`;
}

function feedback(text, ok = false) {
  $("#feedback").textContent = text;
  $("#feedback").classList.toggle("ok", ok);
}

function tapSquare(i) {
  if (run.done) return;
  if (i === run.cursor.i) turn();
  else {
    run.cursor = { i, dir: run.grid.cells[i][run.cursor.dir] ? run.cursor.dir : other(run.cursor.dir) };
    draw();
  }
}

/** Across to down, or back. */
function turn() {
  if (run.done) return;
  const dir = other(run.cursor.dir);
  if (run.grid.cells[run.cursor.i][dir]) run.cursor.dir = dir;
  draw();
}

/** To an entry: its first empty square, or its first. */
function goTo(entry) {
  if (!entry || run.done) return;
  run.cursor = { i: entry.cells.find((i) => !run.fills[i]) ?? entry.cells[0], dir: entry.dir };
  draw();
}

/** To the next clue with a square left to fill (or the one before, step -1); with none left, simply the next. */
function jump(step) {
  if (run.done) return;
  goTo(nextOpen(run.grid, run.fills, current(), step) ?? stepEntry(run.grid, current(), step));
}

function type(letter) {
  if (run.done) return;
  const { i, dir } = run.cursor;
  const replaced = Boolean(run.fills[i]);
  if (!run.revealed.has(i)) {
    run.fills[i] = letter;
    run.wrong.delete(i);
  }
  run.cursor = afterTyping(run.grid, run.fills, i, dir, replaced);
  changed();
}

function backspace() {
  if (run.done) return;
  // A revealed square can't be cleared, so going back passes over it.
  const open = run.fills.map((f, j) => (run.revealed.has(j) ? "" : f));
  const step = afterBackspace(run.grid, open, run.cursor.i, run.cursor.dir);
  if (!run.revealed.has(step.clear)) {
    run.fills[step.clear] = "";
    run.wrong.delete(step.clear);
  }
  run.cursor = { i: step.i, dir: step.dir };
  changed();
}

function changed() {
  keep();
  draw();
  if (!isFull(run.grid, run.fills)) feedback("");
  else if (isSolved(run.grid, run.fills)) finish();
  else feedback("Not quite: a letter or more is wrong. Check if you're stuck.");
}

/** Marks the wrong letters, for HINT_SECONDS. */
function check() {
  if (!run || run.done) return;
  const wrong = wrongSquares(run.grid, run.fills);
  run.hints++;
  for (const i of wrong) run.wrong.add(i);
  feedback(wrong.length ? `${wrong.length} wrong letter${wrong.length === 1 ? "" : "s"} marked (+${HINT_SECONDS} s)` : `All your letters are right (+${HINT_SECONDS} s)`, !wrong.length);
  keep();
  draw();
  tick();
}

/** Fills in the square the cursor is on, for HINT_SECONDS. */
function reveal() {
  if (!run || run.done) return;
  const { i, dir } = run.cursor;
  if (run.revealed.has(i)) return;
  run.hints++;
  const replaced = Boolean(run.fills[i]);
  run.fills[i] = run.grid.cells[i].letter;
  run.revealed.add(i);
  run.wrong.delete(i);
  run.cursor = afterTyping(run.grid, run.fills, i, dir, replaced);
  feedback(`Revealed (+${HINT_SECONDS} s)`, true);
  tick();
  changed();
}

function onKey(e) {
  if (!run || run.done || $("#play").hidden || e.metaKey || e.ctrlKey || e.altKey || document.querySelector("dialog[open]")) return;
  const { key } = e;
  // A key the grid takes isn't for a button that has the focus (Space would press it again).
  if (/^([a-z]|Backspace|Delete|Arrow\w+|Tab|Enter| )$/i.test(key) && e.target.closest?.("#play button")) e.target.blur();
  if (/^[a-z]$/i.test(key)) type(key.toLowerCase());
  else if (key === "Backspace") backspace();
  else if (key === "Delete") {
    if (!run.revealed.has(run.cursor.i)) {
      run.fills[run.cursor.i] = "";
      run.wrong.delete(run.cursor.i);
    }
    changed();
  } else if (key === "ArrowLeft") move(0, -1);
  else if (key === "ArrowRight") move(0, 1);
  else if (key === "ArrowUp") move(-1, 0);
  else if (key === "ArrowDown") move(1, 0);
  else if (key === "Tab" || key === "Enter") jump(e.shiftKey ? -1 : 1);
  else if (key === " ") turn();
  else return;
  e.preventDefault();
}

/** An arrow key: across the other way first turns the cursor, then moves it. */
function move(dr, dc) {
  const dir = dr ? "down" : "across";
  if (run.cursor.dir !== dir && run.grid.cells[run.cursor.i][dir]) run.cursor.dir = dir;
  else run.cursor = { i: arrow(run.grid, run.cursor.i, dr, dc), dir };
  draw();
}

// ---------------------------------------------------------------------------
// Solved

function finish() {
  if (run.resumedAt) {
    run.elapsed += Date.now() - run.resumedAt;
    run.resumedAt = null;
  }
  clearInterval(timer);
  const first = !run.done;
  run.done = true;
  run.time = timeOf(run.elapsed, run.hints);
  tick();
  if (mode === "daily" && first) {
    save((s) => {
      s.days[run.day] = { ...s.days[run.day], fills: run.fills, revealed: [...run.revealed], hints: run.hints, elapsed: run.elapsed, done: true, time: run.time };
      (s.history ??= {})[run.day] = { time: run.time, hints: run.hints };
    });
    track("finish", { game: "crisscross", mode, day: run.day, ...habit(load().history, run.day), seconds: run.time, hints: run.hints, tier: tierFor(run.time).name });
    window.critterNav?.refresh(); // tick it in the bar
  } else if (first) track("finish", { game: "crisscross", mode, seconds: run.time, hints: run.hints });
  // The grid lights up, square by square, then the results.
  feedback(`Solved in ${clock(run.time)}!`, true);
  draw();
  $("#grid").classList.add("solved");
  setTimeout(() => showResults(first), 1300);
}

function showResults(justFinished) {
  const daily = mode === "daily";
  const tier = tierFor(run.time);
  $("#results-label").textContent = daily ? `Crisscross #${run.day}` : "Practice";
  $("#tier-name").textContent = tier.name;
  $("#tier-blurb").textContent = tier.blurb;
  $("#total").textContent = clock(run.time);
  $("#total-note").textContent = hintNote(run.hints);
  $("#results-art").innerHTML = `<g class="web-back">${web(0.4 + 0.15 * tier.index, { dew: tier.index === TIERS.length - 1 })}</g><g transform="scale(0.8)">${webster({ cheer: true })}</g>`;
  $("#solved").innerHTML = run.grid.cells
    .map((c) => (c.letter ? `<span${run.revealed.has(c.i) ? ' class="revealed"' : ""}>${c.number ? `<i>${c.number}</i>` : ""}${c.letter.toUpperCase()}</span>` : '<span class="black"></span>'))
    .join("");
  $("#tier-ladder").innerHTML = TIERS.map((t, i) => `<span class="${i === tier.index ? "now" : ""}" style="background:${TIER_COLORS[i]}"><b>${t.name}${i === tier.index ? " · you" : ""}</b><span>${tierRange(i)}</span></span>`).join("");
  $("#share").hidden = !daily;
  $("#share-note").textContent = "";
  $("#everyone").hidden = true;
  $("#back-today").hidden = daily;
  $(".cd-next").hidden = !daily;
  show("results");
  if (daily) {
    countdown();
    everyoneToday(run.day, run.time, { send: justFinished });
  }
}

/** How everyone did today, under the result; a game just finished is sent first. */
async function everyoneToday(day, time, { send = false } = {}) {
  if (send) await sendScore("crisscross", day, Math.min(time, MAX_SECONDS));
  const all = await howEveryoneDid("crisscross", day);
  if (!all?.players || mode !== "daily") return;
  const faster = fasterThan(all, time);
  $("#everyone").textContent =
    all.players === 1
      ? "You're the first to solve it today."
      : `${count(all.players)} players have solved it today. ${faster ? `You were quicker than ${faster}% of them; the` : "The"} average time is ${clock(Math.round(averageOf(all).average))}.`;
  $("#everyone").hidden = false;
}

let countdownClock = null;
function countdown() {
  clearInterval(countdownClock);
  const tickDown = () => {
    const now = new Date();
    const ms = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;
    const pad = (n) => String(n).padStart(2, "0");
    $("#countdown").textContent = `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor((ms / 60000) % 60))}:${pad(Math.floor((ms / 1000) % 60))}`;
  };
  tickDown();
  countdownClock = setInterval(tickDown, 1000);
}

async function share() {
  track("share", { game: "crisscross", day: run.day });
  const text = shareText(run.day, run.time, run.hints, location.href.split(/[?#]/)[0]);
  try {
    if (navigator.share && matchMedia("(pointer: coarse)").matches) await navigator.share({ text });
    else {
      await navigator.clipboard.writeText(text);
      $("#share-note").textContent = "Copied. Paste it anywhere.";
    }
  } catch {
    // The person closed the share sheet.
  }
}

function showStats() {
  const history = load().history ?? {};
  const s = stats(history, today);
  const stat = (n, label) => `<div class="stat"><strong>${n}</strong><span>${label}</span></div>`;
  $("#stats-grid").innerHTML = [
    stat(s.played, "Solved"),
    stat(s.played ? clock(s.average) : "–", "Average"),
    stat(s.played ? clock(s.best) : "–", "Quickest"),
    stat(s.streak, "Streak"),
    stat(s.bestStreak, "Best streak"),
    stat(s.clean, "No hints"),
  ].join("");
  const days = Object.keys(history).map(Number);
  const tierOf = (d) => tierFor(history[d].time).index;
  $("#stats-tiers").innerHTML = tierBars(
    TIERS.map((t, i) => ({ label: t.name, count: days.filter((d) => tierOf(d) === i).length, color: TIER_COLORS[i] })),
    history[today] !== undefined ? tierOf(today) : -1,
  );
  // The calendar counts the site's days; Crisscross's are LATE behind.
  $("#stats-calendar").innerHTML = calendar((d) => (history[d - LATE] !== undefined ? TIER_COLORS[tierOf(d - LATE)] : null), today + LATE);
  $("#stats").showModal();
}

init();
