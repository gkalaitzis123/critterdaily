// Burrow in the browser: today's seven letters, two minutes of making words
// (tapped or typed), Clover's burrow getting deeper, the results, sharing,
// stats and practice rounds. The rules live in game.js.
import { SECONDS, TIERS, check, dayNumber, metersOf, missed, puzzleFor, rarestOf, sevens, shareText, stats, tierFor, totalOf } from "./game.js";
import { settingsButton } from "./settings.js";
import { calendar, habit, tierBars } from "./stats-view.js";
import { averageOf, beatShare, count, howEveryoneDid, sendScore } from "./everyone.js";

const $ = (sel) => document.querySelector(sel);

/**
 * Counts a moment of play in Critter Daily's stats: a Google Analytics event
 * (game_start, game_finish or game_share). analytics.js only runs it on
 * critterdaily.com, and in the EU, the UK and Switzerland it counts nothing
 * without a yes, so local copies and tests count nothing. (Umami counts
 * page views only.)
 */
const track = (event, data) => {
  try {
    window.gtag?.("event", `game_${event}`, data);
  } catch {
    // Stats are never worth breaking a game for.
  }
};
const STORE = "burrow-v1";
const screens = ["loading", "intro", "play", "results"];
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const SOIL = ["#b07a4f", "#8f5e3b", "#7a6a5d", "#4e4378", "#2f6f7e"]; // the tiers' layers, top to bottom
const SCALE = 180; // meters the burrow drawing shows

let puzzles;
let practicePuzzles = null;
let today;
let mode = "daily"; // or "practice"
let run; // { day?, puzzle, found: [], startedAt, done }
let order = []; // the tiles' order on screen (indices into the letters), shuffled at will
let typed = []; // tile indices in the word being made
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
// Clover the rabbit

/** Clover, drawn around (0, 0) in a -44 -44 88 88 box. */
function clover({ wave = false, cheer = false, dig = false } = {}) {
  const eyes = cheer
    ? '<path d="M-8 -8q3-3 6 0M2 -8q3-3 6 0" stroke="#2e2a3b" fill="none" stroke-width="2" stroke-linecap="round"/>'
    : '<circle cx="-5.5" cy="-8" r="2.6" fill="#2e2a3b"/><circle cx="5.5" cy="-8" r="2.6" fill="#2e2a3b"/><circle cx="-4.7" cy="-9" r=".9" fill="#fff"/><circle cx="6.3" cy="-9" r=".9" fill="#fff"/>';
  const paws = dig
    ? '<ellipse cx="-11" cy="12" rx="5" ry="3.4" fill="#a8968a" transform="rotate(-30 -11 12)"/><ellipse cx="11" cy="12" rx="5" ry="3.4" fill="#a8968a" transform="rotate(30 11 12)"/>'
    : cheer
      ? '<ellipse class="wave" cx="-17" cy="4" rx="4.4" ry="3.2" fill="#a8968a"/><ellipse class="wave" cx="17" cy="4" rx="4.4" ry="3.2" fill="#a8968a" style="animation-delay:.25s"/>'
      : `<ellipse cx="-6" cy="14" rx="4.4" ry="3.2" fill="#a8968a"/>${wave ? '<ellipse class="wave" cx="17" cy="2" rx="4.4" ry="3.2" fill="#a8968a"/>' : '<ellipse cx="6" cy="14" rx="4.4" ry="3.2" fill="#a8968a"/>'}`;
  return `<ellipse cx="-8" cy="-27" rx="5.6" ry="15" fill="#b9a798" transform="rotate(-14 -8 -27)"/>
    <ellipse cx="-8" cy="-26" rx="2.8" ry="10" fill="#ffb3c1" transform="rotate(-14 -8 -26)"/>
    <ellipse cx="8" cy="-27" rx="5.6" ry="15" fill="#b9a798" transform="rotate(14 8 -27)"/>
    <ellipse cx="8" cy="-26" rx="2.8" ry="10" fill="#ffb3c1" transform="rotate(14 8 -26)"/>
    <circle cx="17" cy="26" r="6.5" fill="#f6ecdf"/>
    <ellipse cx="0" cy="19" rx="17" ry="18" fill="#b9a798"/>
    <ellipse cx="0" cy="23" rx="10.5" ry="11.5" fill="#f6ecdf"/>
    <circle cx="0" cy="-5" r="14.5" fill="#b9a798"/>
    <ellipse cx="0" cy="1" rx="8" ry="6" fill="#f6ecdf"/>
    ${eyes}
    <ellipse cx="0" cy="-1.5" rx="2.4" ry="1.8" fill="#ff8fa3"/>
    <path d="M-3 2q3 2.5 6 0" stroke="#6b4e3d" fill="none" stroke-width="1.4" stroke-linecap="round"/>
    <circle cx="-9.5" cy="-1.5" r="2.6" fill="#ffb3c1"/><circle cx="9.5" cy="-1.5" r="2.6" fill="#ffb3c1"/>
    ${paws}
    <ellipse cx="-8" cy="36" rx="6.5" ry="3.2" fill="#a8968a"/><ellipse cx="8" cy="36" rx="6.5" ry="3.2" fill="#a8968a"/>`;
}

function drawClovers() {
  for (const el of document.querySelectorAll("[data-clover]")) {
    const how = el.dataset.clover;
    el.innerHTML = clover({ wave: how === "wave", cheer: how === "cheer", dig: how === "dig" });
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
  drawClovers();
  settingsButton($("#settings-button"));
  $("#help-button").addEventListener("click", () => $("#help").showModal());
  $("#stats-button").addEventListener("click", showStats);
  $("#start").addEventListener("click", startDaily);
  $("#practice-start").addEventListener("click", startPractice);
  $("#practice").addEventListener("click", startPractice);
  $("#back-today").addEventListener("click", () => resumeToday());
  $("#share").addEventListener("click", share);
  $("#delete").addEventListener("click", () => {
    typed.pop();
    drawWord();
  });
  $("#shuffle").addEventListener("click", shuffleTiles);
  $("#enter").addEventListener("click", submit);
  document.addEventListener("keydown", onKey);

  today = dayNumber();
  try {
    puzzles = await (await fetch("data/puzzles.json")).json();
  } catch {
    $("#loading").innerHTML = '<p class="muted">Clover couldn\'t find today\'s letters. Check your connection and reload.</p>';
    return;
  }
  resumeToday();
}

/** Today's game where it was left: not started, still digging, or done. */
function resumeToday() {
  mode = "daily";
  $("#day-label").textContent = `#${today} · ${dateLabel(today)}`;
  const saved = load().days?.[today];
  const puzzle = puzzleFor(today, puzzles);
  if (!saved) {
    show("intro");
    return;
  }
  run = { day: today, puzzle, found: saved.found ?? [], startedAt: saved.startedAt, done: saved.done };
  if (run.done || timeLeft() <= 0) finish();
  else play();
}

// ---------------------------------------------------------------------------
// Digging

function startDaily() {
  mode = "daily";
  track("start", { game: "burrow", mode, day: today });
  run = { day: today, puzzle: puzzleFor(today, puzzles), found: [], startedAt: Date.now(), done: false };
  save((s) => {
    (s.days ??= {})[today] = { found: [], startedAt: run.startedAt };
  });
  play();
}

async function startPractice() {
  mode = "practice";
  track("start", { game: "burrow", mode });
  if (!practicePuzzles) {
    try {
      practicePuzzles = await (await fetch("data/practice.json")).json();
    } catch {
      return;
    }
  }
  const puzzle = practicePuzzles.splice(Math.floor(Math.random() * practicePuzzles.length), 1)[0];
  run = { puzzle, found: [], startedAt: Date.now(), done: false };
  $("#day-label").textContent = "Practice · doesn't count";
  play();
}

const timeLeft = () => SECONDS - (Date.now() - run.startedAt) / 1000;

function play() {
  show("play");
  order = [...run.puzzle.letters].map((_, i) => i);
  typed = [];
  drawTiles();
  drawWord();
  drawFound();
  $("#feedback").textContent = "";
  clearInterval(timer);
  const tick = () => {
    const left = Math.max(0, timeLeft());
    $("#timer span").style.width = `${(100 * left) / SECONDS}%`;
    $("#timer").classList.toggle("low", left <= 15);
    $("#time-left").textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}`;
    if (left <= 0) finish();
  };
  tick();
  timer = setInterval(tick, 250);
}

function drawTiles() {
  const letters = run.puzzle.letters;
  // A used tile stays tappable: tapping it again puts its letter back.
  $("#tiles").innerHTML = order
    .map((i) => `<button class="tile${typed.includes(i) ? " used" : ""}" type="button" data-i="${i}" aria-label="${letters[i].toUpperCase()}" aria-pressed="${typed.includes(i)}">${letters[i]}</button>`)
    .join("");
  for (const b of $("#tiles").querySelectorAll(".tile")) b.addEventListener("click", () => toggle(Number(b.dataset.i)));
}

function drawWord() {
  const letters = run.puzzle.letters;
  // Each letter of the word can be tapped to put it back, too.
  $("#word").innerHTML = typed.length
    ? typed.map((i) => `<button class="slot" type="button" data-i="${i}" aria-label="${letters[i].toUpperCase()}: put it back">${letters[i]}</button>`).join("")
    : '<span class="hint">Tap letters to make a word</span>';
  for (const b of $("#word").querySelectorAll(".slot")) b.addEventListener("click", () => toggle(Number(b.dataset.i)));
  drawTiles();
}

function add(i) {
  if (run.done || typed.includes(i)) return;
  typed.push(i);
  drawWord();
}

/** A tile's letter into the word, or back out of it if it's already there. */
function toggle(i) {
  if (run.done) return;
  if (typed.includes(i)) {
    typed = typed.filter((k) => k !== i);
    drawWord();
  } else add(i);
}

function shuffleTiles() {
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  drawTiles();
}

function onKey(e) {
  if ($("#play").hidden || e.metaKey || e.ctrlKey || e.altKey || document.querySelector("dialog[open]")) return;
  const letters = run.puzzle.letters;
  if (e.key === "Enter") submit();
  else if (e.key === "Backspace") {
    typed.pop();
    drawWord();
  } else if (e.key === " ") shuffleTiles();
  else if (/^[a-z]$/i.test(e.key)) {
    // The first unused tile with that letter, as they're laid out.
    const i = order.find((k) => letters[k] === e.key.toLowerCase() && !typed.includes(k));
    if (i !== undefined) add(i);
    else nope("That letter isn't left.");
  } else return;
  e.preventDefault();
}

function nope(text) {
  $("#feedback").textContent = text;
  $("#feedback").classList.remove("ok");
  $("#word").classList.remove("shake");
  void $("#word").offsetWidth; // restart the animation
  $("#word").classList.add("shake");
}

function submit() {
  if (run.done || !typed.length) return;
  const guess = typed.map((i) => run.puzzle.letters[i]).join("");
  const result = check(guess, run.puzzle, run.found);
  if (!result.ok) {
    nope({ short: "Words need 4 letters or more.", found: "Already found!", unknown: `“${guess.toUpperCase()}” isn't in our word list.`, letters: "That uses letters you don't have." }[result.why]);
    if (result.why !== "short") typed = [];
    drawWord();
    return;
  }
  run.found.push(result.word);
  if (mode === "daily") save((s) => (s.days[run.day].found = run.found));
  typed = [];
  const seven = result.word.length === 7;
  $("#feedback").textContent = seven ? `All seven letters! ${result.word.toUpperCase()} digs ${result.meters} m.` : `${result.word.toUpperCase()} digs ${result.meters} m${result.meters >= 12 ? ". A rare one!" : "."}`;
  $("#feedback").classList.add("ok");
  drawWord();
  drawFound(result.word);
}

function drawFound(latest = null) {
  const { puzzle, found } = run;
  $("#found").innerHTML = [...found]
    .reverse()
    .map((w) => `<li class="${w.length === 7 ? "seven" : ""}${w === latest ? " new" : ""}">${esc(w.toUpperCase())}<b>${metersOf(w, puzzle)} m</b></li>`)
    .join("");
  const total = totalOf(found, puzzle);
  $("#depth").textContent = total;
  $("#count").textContent = found.length;
  // The burrow: Clover goes down with the meters, on a 180 m scale.
  const gauge = $("#gauge");
  const down = Math.min(1, total / SCALE) * (gauge.clientHeight - 30) + 26;
  gauge.querySelector(".tunnel").style.height = `${down - 8}px`;
  gauge.querySelector(".digger").style.top = `${down}px`;
  gauge.querySelector(".meters").textContent = `${total} m`;
}

// ---------------------------------------------------------------------------
// Done

function finish() {
  clearInterval(timer);
  const first = !run.done;
  run.done = true;
  const total = totalOf(run.found, run.puzzle);
  if (mode === "daily" && first) {
    save((s) => {
      s.days[run.day].done = true;
      (s.history ??= {})[run.day] = total;
    });
    track("finish", { game: "burrow", mode, day: run.day, ...habit(load().history, run.day), meters: total, words: run.found.length, tier: tierFor(total).name });
    window.critterNav?.refresh(); // tick it in the bar
  } else if (first) track("finish", { game: "burrow", mode, meters: total, words: run.found.length });
  showResults(first);
}

function showResults(justFinished) {
  const daily = mode === "daily";
  const { puzzle, found } = run;
  const total = totalOf(found, puzzle);
  const tier = tierFor(total);
  $("#results-label").textContent = daily ? `Burrow #${run.day}` : "Practice";
  $("#tier-name").textContent = tier.name;
  $("#tier-blurb").textContent = tier.blurb;
  $("#total").textContent = total;
  $("#total-note").textContent = `${found.length} word${found.length === 1 ? "" : "s"} of the ${puzzle.words.length} in ${puzzle.letters.toUpperCase().split("").sort().join(" ")}`;
  const all = sevens(puzzle);
  const gotSeven = all.filter((w) => found.includes(w));
  const rarest = rarestOf(found.filter((f) => f.length < 7), puzzle); // the seven-letter word has its own line
  const lost = missed(found, puzzle);
  const w = (word) => `<span class="w">${esc(word)}</span>`;
  $("#finds").innerHTML = [
    gotSeven.length
      ? `<p>You found the seven-letter word: ${gotSeven.map((s) => `${w(s)} (${metersOf(s, puzzle)} m)`).join(", ")}!</p>`
      : `<p>The seven-letter word${all.length > 1 ? "s were" : " was"} ${all.map(w).join(" or ")}.</p>`,
    rarest ? `<p>Your rarest ${gotSeven.length ? "other " : ""}find: ${w(rarest)}, ${metersOf(rarest, puzzle)} m.</p>` : found.length ? "" : "<p>No words this time. The letters will be different tomorrow.</p>",
    lost.length ? `<p class="muted small">Deep ones you missed: ${lost.map((m) => `${w(m.word)} ${m.meters} m`).join(" · ")}</p>` : "",
  ].join("");
  $("#tier-ladder").innerHTML = TIERS.map((t, i) => {
    const next = TIERS[i + 1];
    return `<span class="${i === tier.index ? "now" : ""}" style="background:${SOIL[i]}"><b>${t.name}${i === tier.index ? " · you" : ""}</b><span>${next ? `${t.min}–${next.min - 1} m` : `${t.min}+ m`}</span></span>`;
  }).join("");
  $("#share").hidden = !daily;
  $("#share-note").textContent = "";
  $("#everyone").hidden = true;
  $("#back-today").hidden = daily;
  $(".cd-next").hidden = !daily;
  show("results");
  if (daily) {
    countdown();
    everyoneToday(run.day, total, { send: justFinished });
  }
}

/** How everyone did today, under the result; a game just finished is sent first. */
async function everyoneToday(day, total, { send = false } = {}) {
  if (send) await sendScore("burrow", day, total);
  const all = await howEveryoneDid("burrow", day);
  if (!all?.players || mode !== "daily") return;
  $("#everyone").textContent =
    all.players === 1
      ? "You're the first to dig today."
      : `${count(all.players)} players have dug today. ${beatShare(all, total) ? `You went deeper than ${beatShare(all, total)}% of them; the` : "The"} average dig is ${Math.round(averageOf(all).average)} m.`;
  $("#everyone").hidden = false;
}

let clock = null;
function countdown() {
  clearInterval(clock);
  const tick = () => {
    const now = new Date();
    const ms = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;
    const pad = (n) => String(n).padStart(2, "0");
    $("#countdown").textContent = `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor((ms / 60000) % 60))}:${pad(Math.floor((ms / 1000) % 60))}`;
  };
  tick();
  clock = setInterval(tick, 1000);
}

async function share() {
  track("share", { game: "burrow", day: run.day });
  const text = shareText(run.day, run.found, run.puzzle, location.href.split(/[?#]/)[0]);
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
  const state = load();
  const history = state.history ?? {};
  const s = stats(history, today);
  const words = Object.values(state.days ?? {}).reduce((n, d) => n + (d.done ? (d.found?.length ?? 0) : 0), 0);
  const stat = (n, label) => `<div class="stat"><strong>${n}</strong><span>${label}</span></div>`;
  $("#stats-grid").innerHTML = [
    stat(s.played, "Played"),
    stat(s.average ? `${s.average} m` : "–", "Average"),
    stat(s.deepest ? `${s.deepest} m` : "–", "Deepest"),
    stat(s.streak, "Streak"),
    stat(s.bestStreak, "Best streak"),
    stat(words.toLocaleString("en-US"), "Words ever"),
  ].join("");
  const days = Object.keys(history).map(Number);
  const tierOf = (d) => tierFor(history[d]).index;
  $("#stats-tiers").innerHTML = tierBars(
    TIERS.map((t, i) => ({ label: t.name, count: days.filter((d) => tierOf(d) === i).length, color: SOIL[i] })),
    history[today] !== undefined ? tierOf(today) : -1,
  );
  // The calendar counts the site's days, and Burrow's run one behind (its #1 was the site's day 2).
  $("#stats-calendar").innerHTML = calendar((d) => (history[d - 1] !== undefined ? SOIL[tierOf(d - 1)] : null), today + 1);
  $("#stats").showModal();
}

init();
