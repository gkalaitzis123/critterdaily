// Borderline in the browser: three mysteries a day, easiest first, each a
// place's land on a map of its time, guessed with suggestions; Homer flying
// toward each one, hints, each answer shown on its map, the day's result,
// sharing and stats. The rules live in game.js.
import { HINTS, MAX_GUESSES, MISSED, ROUNDS, TIERS, compare, dayNumber, find, hintsFor, mysteryFor, normalize, progress, project, shareText, square, stats, suggest, tally, tierFor, whenShort, whenText, whereShort, whereText, yearText } from "./game.js";
import { settingsButton } from "./settings.js";
import { calendar, dayToday, habit, tierBars } from "./stats-view.js";
import { beatShare, count, howEveryoneDid, sendScore } from "./everyone.js";

const $ = (sel) => document.querySelector(sel);

/**
 * Counts a moment of play in Critter Daily's stats: a Google Analytics event
 * (game_start, game_finish or game_share). analytics.js only runs it on
 * critterdaily.com, and in the EU, the UK and Switzerland it counts nothing
 * without a yes, so local copies and tests count nothing.
 */
const track = (event, data) => {
  try {
    window.gtag?.("event", `game_${event}`, data);
  } catch {
    // Stats are never worth breaking a game for.
  }
};
const STORE = "borderline-v1";
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// Borderline's #1 came 13 days after the other games' #1: the shared calendar counts from theirs.
const LATE = dayToday() - dayNumber();

let places;
let byId;
let schedule; // each day's three mysteries, easiest first
let today;
let puzzles = []; // the three being played: { id, place, name, year, at, k, view, shape, others, land, labels, today, since, wiki, area }
let rounds = []; // for each: { results, finished }
let round = 0; // which of the three is being played
let mystery; // puzzles[round]
let results = []; // rounds[round].results: { place, found, closeness, where, off }
let finished = null; // rounds[round].finished: null, "solved" or "lost"
let active = -1; // highlighted suggestion
let blurTimer = null; // closing the list after the box loses focus
let browse = []; // the places to scroll through, A to Z
let mode = "daily"; // or "practice"
// Anyone can practice with random places as often as they like (as in the other games).
const PRACTICE_FOR_ALL = true;
let decks = [[]]; // practice mysteries still to come, an easy, a middle and a hard pile, shuffled so they don't repeat
let todays = []; // today's three, which practice leaves out

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

/** Today's guesses so far, so a reload picks up where it left off. */
function saveDay() {
  if (mode !== "daily") return;
  save((s) => ((s.days ??= {})[today] = { ids: puzzles.map((p) => p.id), rounds: rounds.map((r) => ({ guesses: r.results.map((x) => x.place.id), finished: r.finished })) }));
}

// ---------------------------------------------------------------------------
// Homer the homing pigeon

/**
 * Homer, side on and facing right, in a -44 -44 88 88 box with his feet at
 * y = 26, dressed as an aviator (a leather flying helmet with its goggles
 * pushed up, a scarf whose end streams out behind his neck): standing,
 * flying (his wings lifted at the shoulder, at 9, 0, flapping on the trail),
 * cheering with his wings up, or napping.
 */
function homer({ pose = "stand" } = {}) {
  const tail = `<path d="M-17 4L-35 2Q-39 9 -35 15.5L-17 13Z" fill="#7f8caf"/><path d="M-31 2.4L-35 2Q-39 9 -35 15.5L-31 15Q-34 9 -31 2.4Z" fill="#3e4762"/>`;
  const legs = `<path d="M-5 17V24M5 17.5V24.5" stroke="#ff7b8a" stroke-width="3.2" stroke-linecap="round"/><ellipse cx="-3.5" cy="26" rx="5" ry="2.3" fill="#ff7b8a"/><ellipse cx="6.5" cy="26" rx="5" ry="2.3" fill="#ff7b8a"/>`;
  const body = `<ellipse cx="-2" cy="6" rx="19.5" ry="16.5" transform="rotate(-8 -2 6)" fill="#a9b7d5"/><ellipse cx="8" cy="9.5" rx="10" ry="9.5" fill="#c6d0e7"/>`;
  const neck = `<path d="M2 -8Q15 -1 28 -7Q27 3 17 5.5Q6 6 1 -1Z" fill="#3cc6a8"/><path d="M1.5 -2Q15 4 27 -1Q24 5.5 16 6.5Q7 6.5 1.5 2Z" fill="#a57bdc"/>`;
  // His scarf, tied round his neck; its end streams back over his back, behind his wing.
  const scarf = `<path d="M2.6 -5.6Q15 1 27.4 -4.4L27 0.4Q15 6.4 2.6 -0.4Z" fill="#ff6f61"/><path d="M4 -3Q15 2.6 26.6 -2" stroke="#e5534a" stroke-width="1.1" fill="none"/>`;
  const scarfEnd = `<path d="M4 -6C-1 -9 -5 -13.4 -10.4 -13.6C-14.6 -13.8 -16.6 -16.6 -20.6 -18.2L-19 -13.8L-22.6 -11.4C-18.4 -10.6 -15.6 -8.4 -11.2 -8.4C-6 -8.4 -1 -3.6 3 -1.6Z" fill="#ff6f61"/>
    <path d="M-1 -6.4C-5 -9.6 -8 -11 -11.4 -11.2" stroke="#e5534a" stroke-width="1.2" fill="none" stroke-linecap="round"/>`;
  // His leather flying helmet over the back of his head (a fleece edge, a seam, an ear piece and its chin
  // strap), and its goggles pushed up onto his crown: the near lens, the far one just behind it.
  const helmet = `<path d="M23 -28.4A15.6 15.6 0 0 0 3 -4.8C6.4 -7.2 9.6 -10.4 11.2 -15C12.8 -19.8 16.6 -25.4 23 -28.4Z" fill="#9c6538"/>
    <path d="M3 -4.8C6.4 -7.2 9.6 -10.4 11.2 -15C12.8 -19.8 16.6 -25.4 23 -28.4" stroke="#f6ead6" stroke-width="2.8" fill="none" stroke-linecap="round"/>
    <path d="M20.4 -27.8Q7.6 -27.6 1.6 -15.4" stroke="#7a4e2e" stroke-width="1" stroke-dasharray="1.6 1.8" fill="none"/>
    <ellipse cx="6" cy="-13.4" rx="3.6" ry="4.8" fill="#8a5a36" stroke="#7a4e2e" stroke-width="1"/>
    <path d="M8.2 -9.6Q11.6 -4.6 16.8 -3.6" stroke="#7a4e2e" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <path d="M20.8 -29.2Q10 -30.6 0.2 -19.6" stroke="#5c3a22" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <circle cx="11.8" cy="-30.4" r="3.6" fill="#a9d8f2" stroke="#b8901f" stroke-width="1.8"/>
    <circle cx="19.4" cy="-29.4" r="4.3" fill="#bfe6fb" stroke="#c9a227" stroke-width="2"/><path d="M17.6 -30.6L19.6 -32" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/>`;
  // His wing, folded along his side; lifted, it turns up at the shoulder (the far one darker, behind him).
  const wing = (fill = "#8f9cc0", tips = "#6c79a0", bars = "#4a5474") => `<path d="M11 -2C3 -9 -13 -7 -22 1C-28 6 -30 11 -29 14C-18 15 -5 13 4 9C10 6 12 2 11 -2Z" fill="${fill}"/>
    <path d="M-22 1C-28 6 -30 11 -29 14C-26 14.2 -23 13.9 -20.2 13.4C-22 9.4 -22.5 5.3 -22 1Z" fill="${tips}"/>
    <path d="M-4 -4C-2 1 -3 6.5 -6 11M-12 -2.5C-10 2.2 -11 7.5 -14 12" stroke="${bars}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
  const lifted = (angle, { far = false, flaps = false } = {}) =>
    `<g transform="rotate(${angle} 9 0)"><g${flaps ? ' class="wing"' : ""}>${far ? wing("#7a87ab", "#5d6a90", "#3f4866") : wing()}</g></g>`;
  const head = ({ up = 0, open = false, asleep = false } = {}) => `<g transform="translate(0 ${up})">
    <circle cx="15" cy="-15" r="14.5" fill="#9daacb"/>${helmet}
    <path d="M28.6 -16.4Q34.6 -15.4 37.6 -12.6Q33.4 -11 28.6 -10.4Z" fill="#5a6480"/>${open ? `<path d="M29 -10.4Q33.4 -9.4 36 -6.8Q31.6 -6.8 29 -8.4Z" fill="#5a6480"/>` : ""}
    <ellipse cx="29.4" cy="-16.2" rx="2.8" ry="1.8" fill="#f7f2e8"/>
    ${asleep ? `<path d="M17.2 -16q2.8 2.8 5.6 0" stroke="#2e2a3b" stroke-width="2" fill="none" stroke-linecap="round"/>` : `<circle cx="19.6" cy="-17" r="4.7" fill="#ffb45c"/><circle cx="19.9" cy="-17" r="3.5" fill="#2e2a3b"/><circle cx="21.1" cy="-18.4" r="1.2" fill="#fff"/>`}
    <circle cx="13.6" cy="-8.4" r="3" fill="#ffb3c1"/></g>`;
  if (pose === "nap") {
    // Settled on his belly, head sunk into his shoulders (no wind for his scarf).
    return `<g transform="translate(0 7)">${tail}${body}${neck}${scarf}${wing()}</g>${head({ up: 9, asleep: true })}
      <text class="zzz" x="28" y="-20" fill="#3e3a52" font-family="Fredoka, sans-serif" font-weight="700" font-size="14">z</text>
      <text class="zzz" x="37" y="-29" fill="#3e3a52" font-family="Fredoka, sans-serif" font-weight="700" font-size="10" style="animation-delay:.8s">z</text>`;
  }
  if (pose === "fly") {
    return `<g transform="translate(-3 -3)">${lifted(62, { far: true, flaps: true })}</g>${tail}
      <ellipse cx="-6" cy="19" rx="4.4" ry="2.2" fill="#ff7b8a"/><ellipse cx="2" cy="20" rx="4.4" ry="2.2" fill="#ff7b8a"/>
      ${body}${neck}${scarfEnd}${scarf}${lifted(48, { flaps: true })}${head()}`;
  }
  if (pose === "cheer") {
    return `<g transform="translate(-4 -2)">${lifted(50, { far: true })}</g>${tail}${legs}${body}${neck}${scarfEnd}${scarf}${lifted(34)}${head({ up: -3, open: true })}`;
  }
  return `${tail}${legs}${body}${neck}${scarfEnd}${scarf}${wing()}${head()}`;
}

/** The trail along the bottom of the map: Homer flies toward the flag as guesses get closer, and lands by it when it's found. */
function renderTrail() {
  const done = finished === "solved";
  const x = 24 + progress(results) * 250;
  const y = done ? 27 : 10; // on the path, or above it
  $("#trail").innerHTML = `
    <path d="M10 38Q80 33 160 37T310 36" stroke="var(--card-edge)" stroke-width="3" stroke-dasharray="2 7" stroke-linecap="round" fill="none"/>
    <g transform="translate(298 37)"><path d="M0 0V-30" stroke="#8a5a36" stroke-width="2.6" stroke-linecap="round"/><path d="M1 -30L18 -24L1 -18Z" fill="${done ? "#5cc86b" : "#ff6f61"}"/></g>
    <g class="walker" style="transform:translate(${x}px, ${y}px)"><g transform="scale(0.36)">${homer({ pose: done ? "cheer" : "fly" })}</g></g>`;
}

/** The end of the day: Homer beside a planted flag, or napping when most of them got away. */
function endScene(good) {
  // Planted in the grass, which is at y = 78 there.
  const flag = `<g transform="translate(70 78)"><path d="M0 0V-62" stroke="#8a5a36" stroke-width="4" stroke-linecap="round"/><path class="wave" d="M2 -62L34 -51L2 -40Z" fill="#5cc86b"/><ellipse cx="0" cy="1" rx="14" ry="3.4" fill="#5daf55"/></g>`;
  return `<svg viewBox="-150 -40 300 130" aria-hidden="true">
    <path d="M-150 78Q-60 70 0 76T150 72V90H-150Z" fill="#7bc96f"/>
    ${good ? flag : ""}
    <g transform="translate(${good ? -10 : 0} 46) scale(1.1)">${homer({ pose: good ? "cheer" : "nap" })}</g>
  </svg>`;
}

const TIER_COLORS = ["#ffb938", "#5cc86b", "#4fa3e0", "#ff9aae"];
const compassIcon = (color) => `<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="#fff" stroke="#2e2a3b" stroke-width="1.4"/><path d="M10 3.5L12.2 10H7.8Z" fill="${color}"/><path d="M10 16.5L12.2 10H7.8Z" fill="#9aa6b2"/></svg>`;

/** The day's tiers, with the one earned marked. */
function tierList(current) {
  const rows = TIERS.map((t, i) => ({ name: t.name, range: t.range, icon: compassIcon(TIER_COLORS[i]) }));
  rows.push({ name: MISSED, range: "1 or none", icon: compassIcon("#c9b8a6") });
  return rows.map((r, i) => `<div class="tier${i === current ? " now" : ""}">${r.icon}<b>${r.name}${i === current ? " · you" : ""}</b><span>${r.range}</span></div>`).join("");
}

const HINT_ICONS = {
  map: '<svg viewBox="0 0 26 26" aria-hidden="true"><path d="M3 6L9 3L17 6L23 3V20L17 23L9 20L3 23Z" fill="#ffe7b8" stroke="#2e2a3b" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 3V20M17 6V23" stroke="#2e2a3b" stroke-width="1.4"/></svg>',
  today: '<svg viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="10" fill="#4fa3e0" stroke="#2e2a3b" stroke-width="1.6"/><path d="M7 9Q11 7 12 11Q10 15 13 17Q11 21 9 20M16 5Q15 9 19 10Q21 13 19 16" stroke="#7bc96f" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
  letter: '<svg viewBox="0 0 26 26" aria-hidden="true"><rect x="3" y="3" width="20" height="20" rx="5" fill="#ffe7b8" stroke="#2e2a3b" stroke-width="1.6"/><path d="M9 18L13 8L17 18M10.5 15H15.5" stroke="#2e2a3b" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

// ---------------------------------------------------------------------------
// The map

/** Where a place sits on a mystery's map, in map units. */
function onMap(p, at) {
  const [x, y] = project(p.at[0], p.at[1])([at[1], at[0]]);
  return [x * p.k, y * p.k];
}

/**
 * The map of a mystery's year: the land, that year's other states (named
 * once the hint says so), the mystery's land, pins for the guesses, and its
 * name once it's done.
 */
function mapSVG(p, { pins = [], names = false, answer = false, scale = true }) {
  const [x, y, w, h] = p.view;
  const sw = (w / 420).toFixed(2);
  const r = w / 120;
  const font = w / 34;
  const inView = ([px, py], m = 0) => px > x - m && px < x + w + m && py > y - m && py < y + h + m;
  // A pin's name goes on the side with room for it, and steps down a line
  // rather than sit on another's (a letter is about half the font size wide).
  const placed = [];
  const marks = pins
    .map((g) => ({ g, xy: onMap(p, g.place.at) }))
    .filter(({ xy }) => inView(xy, r))
    .sort((a, b) => a.xy[1] - b.xy[1])
    .map(({ g, xy }) => {
      const left = xy[0] > x + w * 0.62;
      const tx = xy[0] + (left ? -1 : 1) * r * 1.4;
      const width = g.place.name.length * font * 0.55;
      const x1 = left ? tx - width : tx;
      let ty = xy[1] + font * 0.35;
      for (let n = 0; n < 4 && placed.some((b) => Math.abs(b.y - ty) < font * 1.05 && x1 < b.x2 && x1 + width > b.x1); n++) ty += font * 1.1;
      placed.push({ x1, x2: x1 + width, y: ty });
      return `<g class="pin"><circle cx="${xy[0].toFixed(1)}" cy="${xy[1].toFixed(1)}" r="${r.toFixed(1)}" stroke-width="${(r / 3).toFixed(1)}"/><text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="${left ? "end" : "start"}" font-size="${font.toFixed(1)}" stroke-width="${(font / 5).toFixed(1)}">${esc(g.place.name)}</text></g>`;
    })
    .join("");
  // The answer's name, once it's done, in the middle of its land.
  const center = onMap(p, p.at);
  const big = font * 1.25;
  const label = answer ? `<text class="answer-label" x="${center[0].toFixed(1)}" y="${center[1].toFixed(1)}" font-size="${big.toFixed(1)}" stroke-width="${(font / 3).toFixed(1)}">${esc(p.name)}</text>` : "";
  const taken = placed.map((b) => ({ x1: b.x1, x2: b.x2, y1: b.y - font * 0.8, y2: b.y + font * 0.25 }));
  if (scale) taken.push({ x1: x, x2: x + w * 0.32, y1: y + h * 0.86, y2: y + h }); // the scale bar, bottom left
  if (answer) taken.push({ x1: center[0] - p.name.length * big * 0.28, x2: center[0] + p.name.length * big * 0.28, y1: center[1] - big * 0.8, y2: center[1] + big * 0.25 });
  // That year's other states, biggest first, their names kept inside the map
  // and off the others (a letter is about half the font size wide).
  const small = font * 0.82;
  const pinned = new Set(pins.map((g) => g.place.name)); // a guess's pin already names it
  const states = names
    ? p.labels
        .filter(([n]) => !pinned.has(n))
        .map(([n, lx, ly]) => {
          const half = Math.min(n.length * small * 0.28, w / 2 - small);
          const cx = Math.max(x + half + small * 0.3, Math.min(x + w - half - small * 0.3, lx));
          const box = { x1: cx - half, x2: cx + half, y1: ly - small * 0.6, y2: ly + small * 0.6 };
          if (taken.some((b) => box.x1 < b.x2 && box.x2 > b.x1 && box.y1 < b.y2 && box.y2 > b.y1)) return "";
          taken.push(box);
          return `<text class="state-label" x="${cx.toFixed(1)}" y="${ly}" font-size="${small.toFixed(1)}" stroke-width="${(font / 4.5).toFixed(1)}">${esc(n)}</text>`;
        })
        .join("")
    : "";
  return `<svg viewBox="${p.view.join(" ")}" preserveAspectRatio="xMidYMid meet">
    <path class="land" d="${p.land}"/><path class="others" d="${p.others}" stroke-width="${sw}"/>
    <path class="shape" d="${p.shape}" stroke-width="${(sw * 1.6).toFixed(2)}"/>
    <g class="names">${states}</g><g class="pins">${marks}</g>${label}
  </svg>${scale ? '<div class="scale"><span class="bar"></span><span class="label"></span></div>' : ""}`;
}

const NICE = [1, 2, 5];
/** The scale bar: about a quarter of the map's width, in a round number of km. */
function updateScale(el, p = mystery) {
  const svg = el.querySelector("svg");
  const bar = el.querySelector(".scale .bar");
  const px = svg?.getBoundingClientRect().width;
  if (!px || !bar) return;
  const pxPerKm = (px / svg.viewBox.baseVal.width) * p.k;
  const want = (px * 0.26) / pxPerKm;
  const pow = 10 ** Math.floor(Math.log10(want));
  const km = NICE.map((n) => n * pow).reduce((best, n) => (Math.abs(n - want) < Math.abs(best - want) ? n : best), pow);
  bar.style.width = `${Math.round(km * pxPerKm)}px`;
  el.querySelector(".scale .label").textContent = `${km.toLocaleString("en-US")} km`;
}

function renderMap() {
  const el = $("#map");
  const names = Boolean(finished) || hintsFor(results.filter((r) => !r.found).length).includes("names");
  el.innerHTML = mapSVG(mystery, { pins: results.filter((r) => !r.found), names, answer: Boolean(finished) });
  el.setAttribute("aria-label", finished ? `A map of ${yearText(mystery.year)}, with ${mystery.name} shaded` : `A map of ${yearText(mystery.year)}, with the mystery's land shaded`);
  updateScale(el);
}

// ---------------------------------------------------------------------------
// The game

async function init() {
  wire();
  for (const svg of document.querySelectorAll("[data-homer]")) svg.innerHTML = homer();
  try {
    [places, schedule] = await Promise.all([fetch("data/places.json").then((r) => r.json()), fetch("data/schedule.json").then((r) => r.json())]);
    byId = new Map(places.map((p) => [p.id, p]));
    browse = places.slice(0, 400).sort((a, b) => a.name.localeCompare(b.name));
    today = dayNumber();
    todays = mysteryFor(today, schedule);
    puzzles = await Promise.all(todays.map(loadPuzzle));
  } catch {
    $("#loading").textContent = "Borderline couldn't load today's maps. Try refreshing the page.";
    return;
  }
  $("#day-label").textContent = `#${today} · ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;
  // A saved day counts only if it was for these mysteries (the data can be rebuilt).
  const saved = load().days?.[today];
  const same = saved?.ids?.join() === puzzles.map((p) => p.id).join();
  rounds = puzzles.map((p, i) => {
    const s = same ? saved.rounds?.[i] : null;
    return { results: (s?.guesses ?? []).map((id) => byId.get(id)).filter(Boolean).map((place) => ({ place, ...compare(place, p) })), finished: s?.finished ?? null };
  });
  $("#loading").hidden = true;
  $("#game").hidden = false;
  $("#practice-start").hidden = !PRACTICE_FOR_ALL;
  // Pick up at the first mystery not yet done; a finished day shows how it went.
  const next = rounds.findIndex((r) => !r.finished);
  setRound(next < 0 ? ROUNDS - 1 : next);
  if (next < 0) {
    showDone();
    everyoneToday();
  }
}

async function loadPuzzle(id) {
  const p = await fetch(`data/puzzles/${id}.json`).then((r) => r.json());
  // The place's years, for its answer.
  return { ...p, from: byId.get(p.place)?.from, to: byId.get(p.place)?.to };
}

/** Play (or look back at) one of the three. */
function setRound(i) {
  round = i;
  mystery = puzzles[i];
  results = rounds[i].results;
  finished = rounds[i].finished;
  tell("");
  playing(!finished);
  render();
}

/** While a mystery is being guessed: the guess box, hints and giving up; once it's done, its answer and the way on. */
function playing(on) {
  for (const el of ["#guess-form", "#give-up", "#hints"]) $(el).hidden = !on;
  $("#give-up-confirm").hidden = true;
  $("#round-end").hidden = on;
  if (!on) showRoundEnd();
}

function wire() {
  const input = $("#guess");
  input.addEventListener("input", showSuggestions);
  // Tapping the empty box, or the arrow in it, opens the list to scroll through.
  input.addEventListener("pointerdown", () => {
    if (!input.value.trim() && $("#suggestions").hidden) showSuggestions();
  });
  $("#browse").addEventListener("pointerdown", (e) => {
    e.preventDefault(); // keep the box focused
    if ($("#suggestions").hidden) {
      input.focus();
      showSuggestions();
    } else hideSuggestions();
  });
  input.addEventListener("keydown", (e) => {
    const items = [...document.querySelectorAll("#suggestions [role=option]")];
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if ($("#suggestions").hidden) return showSuggestions();
      if (!items.length) return;
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items.forEach((li, i) => li.setAttribute("aria-selected", String(i === active)));
      items[active].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Escape") hideSuggestions();
  });
  // Leaving the box closes the list, a moment later (so a tap on it still counts); coming back cancels that.
  input.addEventListener("blur", () => (blurTimer = setTimeout(hideSuggestions, 150)));
  input.addEventListener("focus", () => clearTimeout(blurTimer));
  // A tap picks a place, but a finger scrolling the list doesn't: phones
  // send pointerdown as soon as a finger lands, and click only for a tap.
  $("#suggestions").addEventListener("mousedown", (e) => e.preventDefault()); // keep the box focused
  $("#suggestions").addEventListener("click", (e) => {
    const li = e.target.closest("[role=option]");
    if (li) guess(byId.get(li.dataset.id));
  });
  $("#guess-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const items = [...document.querySelectorAll("#suggestions [role=option]")];
    const picked = items[active]?.dataset.id ?? null;
    guess(picked ? byId.get(picked) : find(input.value, places) ?? suggest(input.value, places, 1)[0] ?? null, input.value);
  });
  // Giving up asks first, in the page: browsers can silently block confirm() pop-ups.
  $("#give-up").addEventListener("click", () => askGiveUp(true));
  $("#give-up-no").addEventListener("click", () => askGiveUp(false));
  $("#give-up-yes").addEventListener("click", () => {
    askGiveUp(false);
    endRound("lost");
  });
  $("#next-round").addEventListener("click", () => {
    if (rounds.every((r) => r.finished)) showDone();
    else {
      setRound(round + 1);
      $("#game").scrollIntoView({ block: "start" });
    }
  });
  $("#share").addEventListener("click", share);
  $("#practice").addEventListener("click", startPractice);
  $("#practice-start").addEventListener("click", startPractice);
  for (const id of ["#back-today", "#back-today-game"]) $(id).addEventListener("click", () => location.reload()); // today's game is saved
  $("#help-button").addEventListener("click", () => $("#help").showModal());
  $("#stats-button").addEventListener("click", showStats);
  settingsButton($("#settings-button"));
  // The keyboard opening or closing changes the room for the list (not scrolling: that moved the list as it scrolled into view).
  window.visualViewport?.addEventListener("resize", fitList);
  addEventListener("resize", () => {
    if (mystery && $("#map svg")) updateScale($("#map"));
  });
}

/** "1428–1521", or "since 1776", for the list. */
function span(p) {
  if (p.to >= 2024) return `since ${yearText(p.from)}`;
  return `${yearText(p.from)}–${yearText(p.to)}`;
}

/**
 * The list under the box: with nothing typed, the best-known places A to Z
 * to scroll through; while typing, every match, the best known first.
 */
function showSuggestions() {
  if (finished) return;
  clearTimeout(blurTimer);
  const list = $("#suggestions");
  const typed = normalize($("#guess").value);
  const found = typed ? suggest($("#guess").value, places, 60) : browse;
  const guessed = new Set(results.map((r) => r.place.id));
  active = typed && found.length ? 0 : -1;
  const head = typed ? "" : `<li class="list-head" role="presentation">${browse.length} well-known places, A to Z. Or type any of ${places.length.toLocaleString("en-US")}.</li>`;
  list.innerHTML =
    head +
    found
      .map((p, i) => {
        // Why it's suggested, when the name doesn't say: another name it goes by.
        const other = typed && !normalize(p.name).includes(typed) ? p.aliases.find((a) => a.includes(typed)) : null;
        const note = guessed.has(p.id) ? "guessed" : other ? `${other.replace(/\b\w/g, (c) => c.toUpperCase())} · ${span(p)}` : span(p);
        return `<li role="option" data-id="${p.id}" aria-selected="${i === active}"${guessed.has(p.id) ? ' class="guessed"' : ""}><span>${esc(p.name)}</span><span class="also">${esc(note)}</span></li>`;
      })
      .join("");
  list.hidden = !found.length;
  list.scrollTop = 0;
  fitList();
  $("#guess").setAttribute("aria-expanded", String(!!found.length));
  $("#browse").classList.toggle("open", !list.hidden);
}

/** The list fits between the box and the bottom of what's on screen (above the keyboard, on a phone). */
function fitList() {
  const list = $("#suggestions");
  if (list.hidden) return;
  const view = window.visualViewport;
  const bottom = view ? view.offsetTop + view.height : innerHeight;
  const top = $("#guess").getBoundingClientRect().bottom + 6;
  const height = Math.round(Math.max(150, Math.min(380, bottom - top - 12)));
  if (Math.abs(height - (parseFloat(list.style.maxHeight) || 0)) > 4) list.style.maxHeight = `${height}px`;
}

function hideSuggestions() {
  $("#suggestions").hidden = true;
  $("#guess").setAttribute("aria-expanded", "false");
  $("#browse").classList.remove("open");
  active = -1;
}

/** Show or hide the "reveal the answer?" question in place of the give-up link. */
function askGiveUp(asking) {
  $("#give-up-question").textContent = "Reveal this one? You'll go on to the next.";
  if (round === ROUNDS - 1) $("#give-up-question").textContent = "Reveal this one? It's the last of the three.";
  $("#give-up").hidden = asking;
  $("#give-up-confirm").hidden = !asking;
  if (asking) $("#give-up-yes").focus();
}

/** What the last guess told you, with the compass pointing toward the mystery. */
function tell(text, { info = false, where = null } = {}) {
  const feedback = $("#feedback");
  feedback.textContent = text;
  feedback.classList.toggle("info", info);
  $("#feedback-card").hidden = !text;
  const pointing = Boolean(where && where.km >= 150);
  $("#compass").hidden = !pointing;
  if (pointing) $("#needle").style.transform = `rotate(${where.dir * 45}deg)`;
}

/** Whether a guess is the country that holds most of the mystery's land today. */
const rightLand = (place) => place.to >= 2024 && mystery.today?.[0]?.[0] === place.name && mystery.today[0][1] >= 50;

function guess(place, typed = "") {
  if (finished) return;
  if (!place) {
    tell(typed.trim() ? `We don't know a place called “${typed.trim()}”. Pick one from the list.` : "");
    return;
  }
  if (results.some((r) => r.place.id === place.id)) {
    tell(`You already guessed ${place.name}.`);
    return;
  }
  const result = { place, ...compare(place, mystery) };
  results.push(result);
  if (round === 0 && results.length === 1) track("start", { game: "borderline", mode, ...(mode === "daily" ? { day: today } : {}) });
  $("#guess").value = "";
  hideSuggestions();
  if (rightLand(place)) tell(`Right land, wrong time! In ${yearText(mystery.year)}, the state here had another name.`, { info: true });
  else if (!result.found) {
    const where = whereText(result.where);
    tell(`${place.name}: ${whenText(result.off, mystery.year)}. ${where === "nearby" ? "The mystery is nearby." : `The mystery is ${where} of it.`}`, { info: true, where: result.where });
  } else tell("");
  saveDay();
  if (result.found) endRound("solved");
  else if (results.length >= MAX_GUESSES) endRound("lost");
  else render(place.id);
}

/** One of the three is done: show its answer on the map; after the third, the day counts. */
function endRound(outcome) {
  finished = outcome;
  rounds[round].finished = outcome;
  tell("");
  saveDay();
  if (rounds.every((r) => r.finished)) recordDay();
  playing(false);
  render();
}

/** How long a place lasted, for its answer: " It lasted from 1428 to 1521." */
function lifeText(p) {
  if (p.from === undefined) return "";
  return p.to >= 2024 ? ` It dates from ${yearText(p.from)}.` : ` It lasted from ${yearText(p.from)} to ${yearText(p.to)}.`;
}

function showRoundEnd() {
  const solved = finished === "solved";
  const n = results.length;
  $("#round-end-label").textContent = solved ? (n === 1 ? "First try!" : `Found in ${n} guesses`) : "It got away. It was";
  $("#round-end-title").textContent = mystery.name;
  $("#round-end-note").textContent = `${mystery.year >= 2024 ? "Today" : `In ${yearText(mystery.year)}`}.${lifeText(mystery)}`;
  $("#round-end-wiki").hidden = !mystery.wiki;
  if (mystery.wiki) {
    $("#round-end-wiki").href = `https://en.wikipedia.org/wiki/${encodeURIComponent(mystery.wiki.replace(/ /g, "_"))}`;
    $("#round-end-wiki").textContent = `Read about ${mystery.name} on Wikipedia`;
  }
  $("#next-round").textContent = round < ROUNDS - 1 ? `Next mystery: ${round + 2} of ${ROUNDS}` : rounds.every((r) => r.finished) ? "See how you did" : "Next mystery";
}

function render(latest = null) {
  $("#year").textContent = mystery.year >= 2024 ? "Today" : `It's ${yearText(mystery.year)}`;
  $("#when-ask").textContent = finished ? `${mystery.name}'s land` : "Whose land was this?";
  renderMap();
  renderTrail();
  $("#map-note").textContent = `Around it, ${mystery.year >= 2024 ? "today's other countries" : `the other states of ${yearText(mystery.year)}`}.${results.some((r) => !r.found) ? " The pins are your guesses." : ""}`;

  // Which of the three, and guesses used, as seeds.
  $("#seeds").innerHTML = Array.from({ length: MAX_GUESSES }, (_, i) => `<span class="${i < results.length ? "used" : ""}"></span>`).join("");
  $("#seeds").setAttribute("aria-label", `${results.length} of ${MAX_GUESSES} guesses used`);
  $("#counter").textContent = `Mystery ${round + 1} of ${ROUNDS} · ${results.length} of ${MAX_GUESSES} guesses`;

  // Guesses, closest first.
  $("#guesses-section").hidden = !results.length;
  const color = (r) => (r.found ? "#5cc86b" : r.closeness >= 0.8 ? "#7bc96f" : r.closeness >= 0.6 ? "#ffb938" : r.closeness >= 0.4 ? "#ff9a5a" : "#9aa6b2");
  $("#guesses").innerHTML = [...results]
    .sort((a, b) => b.closeness - a.closeness)
    .map((r) => {
      const line = r.found ? "That's it!" : `${esc(whereShort(r.where))} · <span class="g-when">${esc(whenShort(r.off))}</span>`;
      return `<li class="${r.place.id === latest ? "latest" : ""}"><span class="g-name">${esc(r.place.name)}</span><span class="g-branch">${line}</span><span class="g-meter" aria-label="${Math.round(r.closeness * 100)}% of the way"><span style="width:${Math.max(4, r.closeness * 100)}%;--c:${color(r)}"></span></span></li>`;
    })
    .join("");

  // Hints.
  const wrong = results.filter((r) => !r.found).length;
  const hints = hintsFor(wrong).map((kind) => {
    if (kind === "names") {
      if (!mystery.labels.length) return `<p>${HINT_ICONS.map}<span>No other states nearby are on record for ${yearText(mystery.year)}.</span></p>`;
      return `<p>${HINT_ICONS.map}<span>The map now names ${mystery.year >= 2024 ? "the countries around it" : `the other states of ${yearText(mystery.year)}`}.</span></p>`;
    }
    if (kind === "today") {
      if (mystery.since !== null && mystery.since !== undefined) return `<p class="hint-today">${HINT_ICONS.today}<span>Its modern state dates from <b>${esc(yearText(mystery.since))}</b>.</span></p>`;
      const t = mystery.today ?? [];
      if (!t.length) return `<p class="hint-today">${HINT_ICONS.today}<span>Today, this land is mostly sea or unclaimed.</span></p>`;
      const names = t.map(([n]) => `<b>${esc(n)}</b>`);
      const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
      const rest = t.reduce((s, [, v]) => s + v, 0) < 90 ? ", among others" : "";
      return `<p class="hint-today">${HINT_ICONS.today}<span>Today, this land is in ${list}${rest}.</span></p>`;
    }
    return `<p>${HINT_ICONS.letter}<span>Its name starts with “${esc(mystery.name[0])}”.</span></p>`;
  });
  const next = HINTS.find((h) => h.after > wrong);
  if (next && !finished) hints.push(`<p class="next-hint">Next hint after ${next.after - wrong} more guess${next.after - wrong === 1 ? "" : "es"}.</p>`);
  $("#hints").innerHTML = hints.join("");
}

/** All three done: the day counts in stats, and for how everyone did. */
function recordDay() {
  const { found, guesses } = tally(rounds);
  track("finish", { game: "borderline", mode, ...(mode === "daily" ? { day: today, ...habit(load().history, today) } : {}), found, guesses, tier: tierFor(found, guesses).name });
  if (mode !== "daily") return;
  save((s) => ((s.history ??= {})[today] = { found, guesses }));
  window.critterNav?.refresh(); // tick it in the bar
  everyoneToday(true);
}

/**
 * How everyone did today, under the result; a day just finished is sent
 * first, scored so that more is better: for each mystery found, 7 less the
 * guesses it took (6 for a first try), so 18 at best.
 */
async function everyoneToday(send = false) {
  const el = $("#everyone");
  el.hidden = true;
  const score = rounds.reduce((s, r) => s + (r.finished === "solved" ? MAX_GUESSES + 1 - r.results.length : 0), 0);
  if (send) await sendScore("borderline", today, score);
  const all = await howEveryoneDid("borderline", today);
  if (!all?.players || mode !== "daily") return;
  const better = beatShare(all, score);
  el.textContent = all.players === 1 ? "You're the first to finish today's. Come back later to see how everyone did." : `${count(all.players)} players have played today.${better ? ` You did better than ${better}% of them.` : ""}`;
  el.hidden = false;
}

/** One of the day's three, for the end: its map, its name and year, and how it went. */
function dayRow(p, r, i) {
  const solved = r.finished === "solved";
  const wiki = p.wiki ? `<a href="https://en.wikipedia.org/wiki/${encodeURIComponent(p.wiki.replace(/ /g, "_"))}" target="_blank" rel="noopener">Read about it</a>` : "";
  return `<li class="day-row">
    <div class="map mini">${mapSVG(p, { scale: false })}</div>
    <div class="day-what"><b>${i + 1}. ${esc(p.name)}</b><span>${p.year >= 2024 ? "Today" : esc(yearText(p.year))} · ${solved ? `found in ${r.results.length}` : "not found"}</span><span class="squares" aria-hidden="true">${r.results.map(square).join("")}</span>${wiki}</div>
  </li>`;
}

function showDone() {
  $("#game").hidden = true;
  $("#done").hidden = false;
  const daily = mode === "daily";
  const { found, guesses } = tally(rounds);
  $("#scene").innerHTML = endScene(found >= ROUNDS - 1) + (found === ROUNDS ? '<p class="say">All three!</p>' : "");
  $("#done-label").textContent = daily ? "Today's three" : "Practice";
  $("#done-title").textContent = `${found} of ${ROUNDS} found`;
  $("#done-note").textContent = `in ${guesses} guess${guesses === 1 ? "" : "es"} in all`;
  $("#day-list").innerHTML = puzzles.map((p, i) => dayRow(p, rounds[i], i)).join("");
  $("#tier").innerHTML = tierList(tierFor(found, guesses).index);
  $("#share").hidden = !daily;
  $("#share-note").textContent = "";
  $(".next-in").hidden = !daily;
  $("#practice").hidden = !PRACTICE_FOR_ALL;
  $("#practice").textContent = daily ? "Practice with three random places" : "Another practice round";
  $("#back-today").hidden = daily;
  window.scrollTo(0, 0);
  if (daily) countdown();
}

/** A practice day: three random mysteries, an easy, a middle and a hard one, not saved or counted. */
async function startPractice() {
  mode = "practice";
  if (decks.some((d) => !d.length)) {
    decks = [0, 1, 2].map((t) => {
      const deck = schedule.map((day) => day[t]).filter((id) => !todays.includes(id));
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      return deck;
    });
  }
  puzzles = await Promise.all(decks.map((d) => d.pop()).map(loadPuzzle));
  rounds = puzzles.map(() => ({ results: [], finished: null }));
  $("#day-label").textContent = "Practice · doesn't count";
  $("#done").hidden = true;
  $("#game").hidden = false;
  $("#practice-start").hidden = !PRACTICE_FOR_ALL;
  $("#practice-start").textContent = "Skip to three other random places";
  $("#back-today-game").hidden = false;
  setRound(0);
  window.scrollTo(0, 0);
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
  track("share", { game: "borderline", day: today });
  const text = shareText(today, rounds, location.href.split(/[?#]/)[0]);
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
  const day = today ?? dayNumber();
  const s = stats(history, day);
  const stat = (n, label) => `<div class="stat"><strong>${n}</strong><span>${label}</span></div>`;
  $("#stats-grid").innerHTML = [stat(s.played, "Played"), stat(s.perfect, "All 3 found"), stat(s.average || "–", "Found a day"), stat(s.streak, "Streak"), stat(s.bestStreak, "Best streak"), stat(s.played ? `${Math.round((s.perfect / s.played) * 100)}%` : "0%", "All 3, of days")].join("");
  // Each day's tier, and the last five weeks in those colors.
  const colors = [...TIER_COLORS, "#c9b8a6"];
  const tierOf = (d) => tierFor(history[d].found, history[d].guesses).index;
  const days = Object.keys(history).map(Number);
  $("#stats-tiers").innerHTML = tierBars(
    [...TIERS.map((t) => t.name), MISSED].map((label, i) => ({ label, count: days.filter((d) => tierOf(d) === i).length, color: colors[i] })),
    history[day] ? tierOf(day) : -1,
  );
  // The calendar counts days as the other games do; Borderline's day d is their d + LATE.
  $("#stats-calendar").innerHTML = calendar((d) => (history[d - LATE] ? colors[tierOf(d - LATE)] : null), day + LATE);
  $("#stats").showModal();
}

init();
