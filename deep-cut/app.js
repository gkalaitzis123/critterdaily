// Deep Cut in the browser: today's prompts, the timer, saving progress on
// this device, Digby's dig back through Earth's history, the results and the
// stats. The rules live in game.js.
import { PERIODS, PROMPTS_PER_DAY, SECONDS_PER_PROMPT, compact, dayNumber, fromFull, joinParts, match, nearest, normalize, partsFor, periodFor, periodsFor, promptsFor, shareText, stats } from "./game.js";
import { settingsButton } from "./settings.js";
import { calendar, habit, tierBars } from "./stats-view.js";
import { averageOf, beatShare, count, howEveryoneAnswered, howEveryoneDid, sendPlay, sendScore } from "./everyone.js";

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
const STORE = "deepcut-v1";
const screens = ["loading", "intro", "prompt", "reveal", "results"];

let schedule;
let today;
let categories = new Map(); // id -> the category, loading (as needed)
let mode = "daily"; // or "practice"
let run; // { day?, ids, results: [{ id, prompt, guess, answer, depth, oneIn, perDay }], index, startedAt }
// The periods for the round on screen: a day of eight prompts goes deeper than one of five.
let periods = periodsFor(PROMPTS_PER_DAY);
/** Start a round: the prompts it has set how deep each period is. */
function begin(round) {
  run = round;
  periods = periodsFor(run.ids.length);
}
/** The period a total reaches in the round on screen. */
const periodOf = (total) => periodFor(total, run?.ids.length ?? PROMPTS_PER_DAY);
let timer = null;
let offered = null; // after a near miss: { typed, answers } for "Did you mean ...?"
// For now anyone can play unlimited practice rounds, which is handy for testing.
// Later, practice can be the supporter unlock: set this to false to hide it.
const PRACTICE_FOR_ALL = true;
let deck = []; // practice categories still to come, shuffled, so rounds don't repeat

// ---------------------------------------------------------------------------
// Saved progress (this device only)

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
// Data

function category(id) {
  if (!categories.has(id)) {
    const loading = fetch(`data/categories/${id}.json`).then((res) => {
      if (!res.ok) throw new Error(`Deep Cut has no category "${id}"`);
      return res.json();
    });
    categories.set(id, loading);
    loading.catch(() => categories.delete(id)); // try again next time
  }
  return categories.get(id);
}

// Each list's full list: every other right answer, the less-read ones. It's
// split by first letter (data/more/<id>/<letter>.json; data/more/index.json
// says which letters a list has), and only the parts a guess could be in are
// loaded, as it's typed, so they're there in time. Without them the list
// still plays.
let index = null;
function fullIndex() {
  index ??= fetch("data/more/index.json")
    .then((res) => (res.ok ? res.json() : {}))
    .catch(() => {
      index = null; // try again next time
      return {};
    });
  return index;
}
const parts = new Map(); // "id/letter" -> its rows, loading
function fullPart(id, part) {
  const key = `${id}/${part}`;
  if (!parts.has(key)) {
    const loading = fetch(`data/more/${key}.json`)
      .then((res) => (res.ok ? res.json() : []))
      .catch(() => {
        parts.delete(key); // try again next time
        return [];
      });
    parts.set(key, loading);
  }
  return parts.get(key);
}
/** The parts of a list's full list a guess could be in, loading. */
async function partsLoading(id, text) {
  const [list, has] = await Promise.all([category(id), fullIndex()]);
  return { list, loading: partsFor(text, list).filter((p) => has[id]?.includes(p)).map((p) => fullPart(id, p)) };
}
/** The answers on a list's full list a guess could be. */
async function fullFor(id, text) {
  const { list, loading } = await partsLoading(id, text);
  return joinParts((await Promise.all(loading)).flat()).map((row) => fromFull(row, list));
}

// ---------------------------------------------------------------------------
// Digby and his hillside

// One color per period, from today's topsoil down to the Cambrian.
const LAYERS = ["#c98b5b", "#9fb7c4", "#dcc58f", "#a8694a", "#b9533c", "#5d5478"];
/** How rare an answer was, as a little label: "1 in 2.8k". A dash for no answer. */
const oneInTag = (a) => (a?.depth && a.oneIn ? `<span class="one-in">1 in ${compact(a.oneIn)}</span>` : '<span class="one-in none">–</span>');

/** Digby the mole, drawn around (0, 0), about 50 px across. */
function digby({ digging = false, wave = false } = {}) {
  const dirt = digging
    ? [
        [-14, 30, 3, -22, -16, 0],
        [14, 30, 2.5, 24, -12, 0.3],
        [-6, 32, 2, -12, -24, 0.55],
        [8, 32, 3, 16, -22, 0.15],
      ]
        .map(([x, y, r, dx, dy, delay], i) => `<circle class="dirt" cx="${x}" cy="${y}" r="${r}" fill="${i % 2 ? "#8a5a36" : "#6b4a33"}" style="--dx:${dx}px;--dy:${dy}px;animation-delay:${delay}s"/>`)
        .join("")
    : "";
  const right = wave
    ? '<g transform="rotate(-50 27 -2)"><ellipse class="wave" cx="27" cy="-2" rx="9" ry="6" fill="#ffb3c1"/></g>'
    : `<ellipse${digging ? ' class="claw claw-2"' : ""} cx="20" cy="24" rx="9" ry="6" fill="#ffb3c1"/>`;
  return `${dirt}
    <ellipse cx="0" cy="6" rx="25" ry="22" fill="#6b4e3d"/>
    <ellipse cx="0" cy="12" rx="15" ry="12" fill="#a07d66"/>
    <path d="M-21 -7Q0 -32 21 -7Z" fill="#ffc23d"/>
    <rect x="-24" y="-9" width="48" height="6" rx="3" fill="#f2a900"/>
    <circle cx="0" cy="-17" r="5" fill="#fff6c2" stroke="#f2a900" stroke-width="2"/>
    <path d="M-11 2q3-3.5 6 0M5 2q3-3.5 6 0" stroke="#2e2a3b" fill="none" stroke-width="2" stroke-linecap="round"/>
    <ellipse cx="0" cy="9" rx="5" ry="4" fill="#ff8fa3"/>
    <circle cx="-13" cy="10" r="3" fill="#ffb3c1"/>
    <circle cx="13" cy="10" r="3" fill="#ffb3c1"/>
    <ellipse${digging ? ' class="claw"' : ""} cx="-20" cy="24" rx="9" ry="6" fill="#ffb3c1"/>
    ${right}`;
}

/** The periods as rows. `now` marks one, and `total` says how far the next is. */
function strata(now = -1, total = 0) {
  return periods.map((p, i) => {
    const range = i < periods.length - 1 ? `${p.min}–${periods[i + 1].min - 1}\u00a0m` : `${p.min}+\u00a0m`;
    const right = i === now ? `<svg viewBox="-34 -34 68 68" aria-hidden="true">${digby()}</svg>` : `<span>${now >= 0 && i === now + 1 ? `${p.min - total}\u00a0m to go` : range}</span>`;
    return `<div class="stratum${i === now ? " now" : ""}" style="--c:${LAYERS[i]}"><span>${p.name}${i === now ? " · you" : ""}</span>${right}</div>`;
  }).join("");
}

// The hillside on the reveal screen: one band per period, each the same
// height, so the thin deep periods aren't squeezed. Within a band, depth is
// linear; the last band shows a quarter more than the depth that reaches it
// (40 m on a day of five prompts).
const SCENE_TOP = 40;
const BAND = 72;
const SCENE_H = SCENE_TOP + PERIODS.length * BAND;
const SHAFT_X = 150;
const SIGN_X = SHAFT_X + 24;
const SIGN_CHARS = 30; // what fits on a signpost between the tunnel and the edge
const bandEnd = (i) => (i < periods.length - 1 ? periods[i + 1].min : Math.round((periods[i].min * 19) / 15));
function yAt(m) {
  const i = Math.max(0, periods.findLastIndex((p) => m >= p.min));
  const share = Math.min(1, (m - periods[i].min) / (bandEnd(i) - periods[i].min));
  return SCENE_TOP + (i + share) * BAND;
}
const ridge = (y) => `M0 ${y}Q32 ${y - 7} 65 ${y}T130 ${y}T195 ${y}T260 ${y}T325 ${y}T390 ${y}L390 ${SCENE_H}L0 ${SCENE_H}Z`;
const shaft = (y1, y2) => `M${SHAFT_X} ${y1}C${SHAFT_X - 9} ${y1 + (y2 - y1) / 3} ${SHAFT_X + 9} ${y1 + (2 * (y2 - y1)) / 3} ${SHAFT_X} ${y2}`;

// A fossil for each period, drawn around (0, 0), about 40 px across.
const FOSSILS = [
  // Holocene: an earthworm in the topsoil, ringed, with its saddle near the head.
  '<g class="worm"><path d="M-20 2q10-10 20 0t20 0" stroke="#ff9aae" fill="none" stroke-width="9" stroke-linecap="round"/><path d="M-20 2q10-10 20 0t20 0" pathLength="100" stroke="#e8778f" fill="none" stroke-width="7" stroke-dasharray="1.6 5.4" stroke-dashoffset="-3"/><path d="M-20 2q10-10 20 0t20 0" pathLength="100" stroke="#f0768e" fill="none" stroke-width="10" stroke-dasharray="0 60 13 100"/><circle cx="21" cy="0" r="1.6" fill="#2e2a3b"/></g>',
  // Pleistocene: a mammoth's tusk, its root end cut flat.
  '<path d="M-7.3 13.9L-8 11.8L-8.5 9.6L-8.7 7.4L-8.6 5.1L-8.3 2.9L-7.8 0.7L-7-1.4L-5.9-3.5L-4.7-5.4L-3.2-7.1L-1.5-8.7L0.4-10L2.4-11.2L4.5-12.1L6.7-12.8L9.1-13.3L11.4-13.4L13.8-13.4L16.2-13L18.6-12.5L19-13.4L16.8-14.8L14.4-15.9L11.8-16.6L9-17.1L6.2-17.1L3.3-16.9L0.5-16.3L-2.3-15.3L-5.1-14L-7.6-12.4L-10.1-10.4L-12.3-8.1L-14.2-5.6L-15.9-2.8L-17.2 0.2L-18.2 3.4L-18.8 6.8L-19 10.2L-18.8 13.7L-18.2 17.1Z" fill="#fbf0d9" stroke="#b89d72" stroke-width="1.4" stroke-linejoin="round"/><path d="M-11.4 8.7L-11.4 6.1L-11.1 3.5L-10.4 0.9L-9.5-1.5L-8.3-3.8L-6.8-6L-5.1-7.9L-3.1-9.6L-1-11.1L1.3-12.3L3.6-13.3L6.1-13.9" stroke="#fffdf7" stroke-width="1.6" fill="none" stroke-linecap="round"/><ellipse cx="-12.7" cy="15.5" rx="5.7" ry="2.2" transform="rotate(-16.5-12.7 15.5)" fill="#e7d2a6" stroke="#b89d72" stroke-width="1.2"/>',
  // Cretaceous: an ammonite, its coiled shell ribbed.
  '<path d="M7.2 5.9C5.8 11.5-0.2 15.6-6.9 13.9C-13.5 12.2-18.3 5.1-16.3-2.7C-14.3-10.5-6-16.1 3.2-13.7C12.3-11.4 18.8-1.7 16.1 9.1Z" fill="#c3924f" stroke="#6e4a24" stroke-width="1.6" stroke-linejoin="round"/><path d="M8.6 4.6L15.7 6.1M8.5 1.4L15.5 0.8M7.5-1.6L13.9-4.1M5.7-4.1L11-8.2M3.4-6L7.2-11.2M0.7-7.1L2.9-13M-2.1-7.4L-1.7-13.5M-4.7-6.9L-6-12.7M-7.1-5.7L-9.9-10.7M-9-3.9L-13-7.9M-10.2-1.8L-15-4.4M-10.8 0.6L-16-0.5M-10.7 2.9L-15.9 3.3M-10 5.1L-14.7 6.9M-8.7 6.9L-12.6 9.8M-7.1 8.2L-9.8 12M-5.1 9L-6.7 13.3M-3.1 9.3L-3.4 13.7M-1.2 8.9L-0.2 13.1M0.5 8L2.6 11.7M1.9 6.8L4.8 9.6M2.8 5.2L6.3 7.1M3.3 3.2L7.1 3.8M3 0.9L6.5 0M1.8-1L4.7-3.1M0.1-2.3L1.9-5.2M-1.9-2.8L-1.4-6M-3.8-2.5L-4.6-5.5M-5.5-1.5L-7.2-4M-6.5-0.1L-9-1.6M-7 1.6L-9.7 1.2M-6.7 3.3L-9.3 3.9M-5.9 4.7L-8 6.2M-4.7 5.6L-5.9 7.7M-3.2 5.9L-3.6 8.3M-1.8 5.7L-1.3 7.9M-0.6 5L0.7 6.8M0.2 4L1.9 5.1" stroke="#8a5f30" stroke-width="1.3" stroke-linecap="round"/><path d="M-2.6-0.1C-1.2-0.2 0.1 0.8 0.2 2.4C0.3 3.9-0.9 5.5-2.8 5.6C-4.6 5.7-6.4 4.3-6.6 2.1C-6.7 0-5-2.1-2.5-2.3C0-2.5 2.5-0.5 2.7 2.5C2.9 5.4 0.6 8.3-2.9 8.6C-6.4 8.8-9.8 6.1-10.1 2C-10.3-2.1-7.2-6.1-2.4-6.4C2.4-6.7 7.1-3 7.5 2.6C7.9 8.3 3.5 13.8-3.1 14.2C-9.7 14.7-16.2 9.6-16.7 1.8C-17.2-6-11.2-13.6-2.1-14.2C7.1-14.8 16-7.8 16.7 2.9C16.8 5 16.6 7.1 16.1 9.1L7.2 5.9" fill="none" stroke="#6e4a24" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  // Jurassic: a dinosaur skull (an Allosaurus, horn over the eye), its jaw a little open.
  '<g transform="translate(-2 0.5)"><g transform="rotate(9-16 5)"><path d="M-5 3.4L-3.6 1L-2.2 3.3ZM-2.2 3.3L-0.9 0.9L0.5 3.2ZM0.5 3.2L1.9 0.8L3.3 3ZM3.3 3L4.6 0.7L6 2.9ZM6 2.9L7.4 0.5L8.8 2.8ZM8.8 2.8L10.1 0.4L11.5 2.7ZM11.5 2.7L12.9 0.3L14.3 2.5ZM14.3 2.5L15.6 0.2L17 2.4Z" fill="#fffaf0" stroke="#7c5b3c" stroke-width="0.6" stroke-linejoin="round"/><path d="M-17 4L19 2.2Q20.6 3.6 19 5C10 8.2-6 10.6-14 9.2Q-18 8.2-17 4Z" fill="#e8d1a6" stroke="#7c5b3c" stroke-width="1.4" stroke-linejoin="round"/><ellipse cx="-7.5" cy="6.6" rx="2.6" ry="1.2" fill="#5a3b27"/></g><path d="M-6 1.5L-4.6 4L-3.3 1.5ZM-3.3 1.5L-1.9 4L-0.6 1.5ZM-0.6 1.5L0.8 4L2.2 1.5ZM2.2 1.5L3.5 4L4.9 1.5ZM4.9 1.5L6.3 4L7.6 1.5ZM7.6 1.5L9 4L10.3 1.5ZM10.3 1.5L11.7 4L13.1 1.5ZM13.1 1.5L14.4 4L15.8 1.5ZM15.8 1.5L17.1 4L18.5 1.5Z" fill="#fffaf0" stroke="#7c5b3c" stroke-width="0.6" stroke-linejoin="round"/><path d="M-17-8C-13-11-10-11.6-7.4-11.2L-5.6-13.6L-3.4-10.6C3-9.6 12-6.2 19-3Q22.2-1.4 20.4 1.5L-9 1.5L-17 4.4Z" fill="#e8d1a6" stroke="#7c5b3c" stroke-width="1.4" stroke-linejoin="round"/><ellipse cx="-12.6" cy="-2.6" rx="2.3" ry="3.4" fill="#5a3b27"/><ellipse cx="-6" cy="-5.6" rx="3" ry="3.3" fill="#5a3b27"/><ellipse cx="3.6" cy="-3.4" rx="5" ry="2.6" transform="rotate(12 3.6-3.4)" fill="#5a3b27"/><ellipse cx="15.6" cy="-2" rx="1.8" ry="1.1" fill="#5a3b27"/></g>',
  // Permian: a fern frond.
  '<path d="M-8.4 15.7L-0.8 15.5Q1.2 13.6-1.2 12.3L-8.6 14.1ZM-8 14.3L-13.1 8.6Q-15.9 8.3-15.3 11L-9.1 15.5ZM-7 11.3L1.6 11.2Q3.7 9.4 1.3 8.1L-7.2 9.7ZM-6.5 10L-12.2 3.4Q-14.9 3-14.4 5.7L-7.7 11.1ZM-5.5 7.2L3.7 7.4Q5.8 5.6 3.5 4.2L-5.6 5.6ZM-5 5.8L-10.7-1.4Q-13.4-1.9-13.1 0.9L-6.1 6.9ZM-3.9 3.2L5.4 3.8Q7.6 2.1 5.3 0.6L-4 1.6ZM-3.3 1.9L-8.9-5.6Q-11.6-6.3-11.3-3.5L-4.5 2.9ZM-2.2-0.5L6.8 0.4Q9-1.1 6.8-2.8L-2.2-2.1ZM-1.6-1.8L-6.6-9.4Q-9.3-10.1-9.1-7.4L-2.8-0.8ZM-0.4-4.1L7.8-2.7Q10.2-4.2 8-5.9L-0.3-5.7ZM0.3-5.3L-4-12.5Q-6.6-13.4-6.6-10.6L-1-4.4ZM1.5-7.4L8.6-5.8Q11-7.1 8.9-8.9L1.7-9ZM2.2-8.6L-1.1-15.1Q-3.6-16.1-3.7-13.4L0.9-7.8ZM3.5-10.5L9-8.7Q11.5-9.9 9.6-11.9L3.7-12.1ZM4.3-11.7L2.1-17.1Q-0.4-18.2-0.7-15.5L2.9-10.9ZM5.5-13.4L9.3-11.7Q11.8-12.7 10-14.8L5.9-14.9ZM6.4-14.5L5.3-18.5Q2.9-19.8 2.5-17L5-13.8Z" fill="#93cf72" stroke="#3f6b3a" stroke-width="0.7" stroke-linejoin="round"/><path d="M-10 20Q-3-6 9.9-18.9" stroke="#2f5a2c" stroke-width="2" fill="none" stroke-linecap="round"/>',
  // Cambrian: a trilobite: head shield with eyes and spines, a three-lobed ridged body and a tail.
  '<path d="M0-20C9-20 15-15 15-8L17.5 5L13.2-6.6L11.6 9C11.6 15 6.5 18.5 0 18.5C-6.5 18.5-11.6 15-11.6 9L-13.2-6.6L-17.5 5L-15-8C-15-15-9-20 0-20Z" fill="#d6cbef" stroke="#6f62a0" stroke-width="1.2" stroke-linejoin="round"/><path d="M-4.2-7.6L4.2-7.6L2.9 14.6Q0 16.6-2.9 14.6Z" fill="#efeafb"/><path d="M-4.2-8C-5.6-13-4.6-17.6 0-17.6C4.6-17.6 5.6-13 4.2-8Z" fill="#efeafb" stroke="#6f62a0" stroke-width="1.1"/><path d="M-14.6-7.8Q0-9.6 14.6-7.8M4-4.8L12.7-3.2M-4-4.8L-12.7-3.2M-4-4.8Q0-6.1 4-4.8M3.9-2.1L12.4-0.5M-3.9-2.1L-12.4-0.5M-3.9-2.1Q0-3.4 3.9-2.1M3.7 0.7L12.2 2.3M-3.7 0.7L-12.2 2.3M-3.7 0.7Q0-0.6 3.7 0.7M3.6 3.5L11.9 5.1M-3.6 3.5L-11.9 5.1M-3.6 3.5Q0 2.2 3.6 3.5M3.4 6.2L11.6 7.8M-3.4 6.2L-11.6 7.8M-3.4 6.2Q0 4.9 3.4 6.2M3.2 9L11.3 10.6M-3.2 9L-11.3 10.6M-3.2 9Q0 7.7 3.2 9M3.1 11.6L8.6 14.2M-3.1 11.6L-8.6 14.2" stroke="#6f62a0" stroke-width="1.2" fill="none" stroke-linecap="round"/><ellipse cx="-8.6" cy="-12.2" rx="2.3" ry="1.6" fill="#6f62a0"/><ellipse cx="8.6" cy="-12.2" rx="2.3" ry="1.6" fill="#6f62a0"/>',
];
// Each period's fossil sits on the right, or under the period's name when a signpost is in the way.
function fossils(signs) {
  return FOSSILS.map((f, i) => {
    const top = SCENE_TOP + i * BAND;
    const right = [i % 2 ? 318 : 344, top + (i ? 40 : 58)];
    const [x, y] = signs.some((s) => Math.abs(s - right[1]) < 34) ? [62, top + 52] : right;
    return `<g transform="translate(${x} ${y})">${f}</g>`;
  }).join("");
}

/** The hillside: the periods, Digby's tunnel so far, and a signpost at each answer's running total. */
function hillside(results, before, after) {
  const now = periodOf(after).index;
  // On a phone the hillside stops a period below Digby (three at least), so the
  // answer, the dig and Next fit on one screen.
  const bands = matchMedia("(max-width: 600px)").matches ? Math.min(PERIODS.length, Math.max(3, now + 2)) : PERIODS.length;
  const height = SCENE_TOP + bands * BAND;
  const layers = LAYERS.map((c, i) => `<path d="${ridge(SCENE_TOP + i * BAND)}" fill="${c}"/>`).join("");
  const labels = PERIODS.map((p, i) => {
    const y = SCENE_TOP + i * BAND + 8;
    const w = Math.round(p.name.length * 6.9 + 20);
    return `<rect x="8" y="${y}" width="${w}" height="22" rx="11" fill="${i === now ? "#ffb938" : "#ffffff"}" opacity="${i === now ? 1 : 0.92}"/><text class="scene-label" x="${8 + w / 2}" y="${y + 15}" text-anchor="middle">${p.name}</text>`;
  }).join("");
  let sum = 0;
  let lastY = -Infinity;
  const signYs = [];
  const signs = results
    .map((r, i) => {
      sum += r.depth;
      if (!r.depth) return "";
      const at = yAt(sum);
      const y = Math.min(height - 14, Math.max(at, lastY + 24)); // nudged apart when they'd overlap
      lastY = y;
      signYs.push(y);
      const tail = ` · ${r.depth}\u00a0m`;
      const room = SIGN_CHARS - tail.length;
      const label = `${r.answer.length > room ? `${r.answer.slice(0, room - 1).trimEnd()}…` : r.answer}${tail}`;
      const w = Math.round(label.length * 6.3 + 18);
      return `<g${i === results.length - 1 ? ' class="sign-new"' : ""}><path d="M${SHAFT_X + 12} ${at}L${SIGN_X} ${y}" stroke="#7a4e2e" stroke-width="2"/><rect x="${SIGN_X}" y="${y - 11}" width="${w}" height="22" rx="7" fill="#ffe7b8" stroke="#7a4e2e" stroke-width="1.5"/><text class="scene-sign" x="${SIGN_X + w / 2}" y="${y + 4}" text-anchor="middle">${esc(label)}</text></g>`;
    })
    .join("");
  const from = yAt(before);
  const to = yAt(after);
  return `<svg viewBox="0 0 390 ${height}" role="img" aria-label="Digby has dug ${after} metres down, into the ${PERIODS[now].name}.">
    <path d="M0 30Q20 22 40 30T80 30T120 30T160 30T200 30T240 30T280 30T320 30T360 30T400 30L400 44L0 44Z" fill="#7bc96f"/>
    <path d="M${SHAFT_X + 34} 30V6" stroke="#7a4e2e" stroke-width="3" stroke-linecap="round"/><path d="M${SHAFT_X + 35} 7l20 6l-20 6Z" fill="#ff6f61"/>
    ${layers}
    <path d="M352 44Q348 66 356 84" stroke="#8a5a36" fill="none" stroke-width="2" stroke-linecap="round"/>
    ${fossils(signYs)}${labels}
    <path d="${shaft(32, Math.max(from, 44))}" stroke="#3b2a20" stroke-width="22" fill="none" stroke-linecap="round"/>
    ${to > from ? `<path class="tunnel-new" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100" d="${shaft(from, to)}" stroke="#3b2a20" stroke-width="22" fill="none" stroke-linecap="round"/>` : ""}
    ${signs}
    <g class="digby-move" style="transform:translate(${SHAFT_X}px,${from}px)"><g class="digby-bob">${digby({ digging: true })}</g></g>
  </svg>`;
}

// The medal on the results: the fossil of the period reached.
function medal(index) {
  const confetti = [
    [22, 8, "#ff6f61", 0],
    [168, 4, "#4fa3e0", 0.8],
    [44, 0, "#7bc96f", 1.7],
    [150, 2, "#b79cff", 2.3],
  ]
    .map(([x, y, fill, delay]) => `<rect class="confetti" x="${x}" y="${y}" width="7" height="11" rx="2" fill="${fill}" style="animation-delay:${delay}s"/>`)
    .join("");
  return `<svg viewBox="0 0 200 122" aria-hidden="true">${confetti}
    <g class="medal-swing">
      <path d="M82 0L72 34L92 30Z" fill="#ff6f61"/><path d="M118 0L128 34L108 30Z" fill="#4fa3e0"/>
      <circle cx="100" cy="68" r="46" fill="#ffb938"/><circle cx="100" cy="68" r="38" fill="#ffd47a"/><circle cx="100" cy="68" r="28" fill="${LAYERS[index]}"/>
      <g transform="translate(100 68) scale(1.05)">${FOSSILS[index]}</g>
    </g>
  </svg>`;
}

/** Where Digby is between prompts. */
function digbyStatus(total) {
  const p = periodOf(total);
  const where = total ? `Digby is <strong>${total}\u00a0m</strong> down, in the <strong>${p.name}</strong>.` : "Digby is at the surface, ready to dig.";
  return `<svg viewBox="-36 -36 72 72" aria-hidden="true">${digby({ wave: !total })}</svg><p>${where}${p.next ? ` ${p.next.toGo}\u00a0m to the ${p.next.name}.` : ""}</p>`;
}

// ---------------------------------------------------------------------------
// Screens

function show(name) {
  for (const s of screens) $(`#${s}`).hidden = s !== name;
  window.scrollTo(0, 0);
}

const fmt = (n) => n.toLocaleString("en-US");
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const totalOf = (results) => results.reduce((n, r) => n + r.depth, 0);

async function init() {
  wire();
  for (const svg of document.querySelectorAll("[data-digby]")) svg.innerHTML = digby({ wave: svg.dataset.digby === "wave" });
  today = dayNumber();
  try {
    schedule = await (await fetch("data/schedule.json")).json();
  } catch {
    $("#loading").innerHTML = "<p>Deep Cut couldn't load today's prompts. Try refreshing the page.</p>";
    return;
  }
  $("#day-label").textContent = `#${today} · ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;
  const ids = promptsFor(today, schedule);
  ids.forEach((id) => category(id).catch(() => {})); // start loading today's categories
  const saved = load().days?.[today];
  // Answers already given keep their own prompts, even if the lists were
  // rebuilt since (and one of them retired): the rest come from the schedule.
  const answered = saved?.results ?? [];
  if (saved?.done) {
    begin({ day: today, ids: answered.map((r) => r.id), results: answered, index: answered.length });
    showResults();
    everyoneToday(today, totalOf(answered));
  } else if (answered.length || saved?.startedAt) {
    // Back mid-game, even mid-prompt: pick up where it was, with the clock still running.
    begin({ day: today, ids: [...answered.map((r) => r.id), ...ids.slice(answered.length)], results: answered, index: answered.length, startedAt: saved.startedAt });
    await showPrompt();
  } else {
    await showIntro();
  }
}

async function showIntro() {
  // A real example, so the numbers are honest: a famous, a middling and a deep Roman emperor.
  const box = $("#example");
  try {
    const emperors = await category("roman-emperors");
    const named = ["Augustus", "Hadrian", "Trebonianus Gallus"].map((n) => emperors.answers.find((a) => a.name === n));
    const near = (d) => emperors.answers.reduce((best, a) => (Math.abs(a.depth - d) < Math.abs(best.depth - d) ? a : best));
    const picks = named.every(Boolean) ? named : [near(10), near(18), near(30)];
    box.innerHTML = `<p class="muted small">For example: name a Roman emperor</p>${picks
      .map((a) => `<div class="example-row"><span>${esc(a.name)}</span>${oneInTag(a)}<strong>${a.depth}\u00a0m</strong><div class="example-bar"><span style="--d:${a.depth * 1.6}"></span></div></div>`)
      .join("")}<p class="example-key">${esc(picks[0].name)}'s page gets ${fmt(picks[0].perDay)} readers a day; ${esc(picks[2].name)}'s gets ${fmt(picks[2].perDay)}. The most-read emperor digs 1 m; the rarest dig 50 m.</p>`;
    box.hidden = false;
  } catch {
    box.hidden = true;
  }
  const prompts = promptsFor(today, schedule).length;
  periods = periodsFor(prompts); // today's depths, before a round begins
  $("#strata-key").innerHTML = strata();
  // Someone who has played before gets straight to it; How to play has the rest.
  const returning = Object.keys(load().history ?? {}).length > 0;
  $("#intro").classList.toggle("returning", returning);
  $("#intro .bubble").textContent = returning ? "Welcome back! Ready to dig?" : "Hi, I'm Digby! Help me dig.";
  $("#intro-short").textContent = `${prompts} prompts today, 30 seconds each. The rarer your answers, the deeper Digby digs.`;
  $("#intro-count").textContent = ["Five", "Six", "Seven", "Eight"][prompts - 5] ?? String(prompts);
  $("#start").textContent = `Start Deep Cut #${today}`;
  $("#practice-start").hidden = !PRACTICE_FOR_ALL;
  show("intro");
}

function wire() {
  $("#start").addEventListener("click", async () => {
    mode = "daily";
    begin({ day: today, ids: promptsFor(today, schedule), results: [], index: 0 });
    track("start", { game: "deep-cut", mode, day: today });
    await showPrompt();
  });
  const input = $("#guess");
  // A near miss asks "Did you mean ...?": tap an answer, or press Enter again
  // to take the first. Typing something else drops the question.
  input.addEventListener("input", () => {
    if (run?.ids && !run.locked) partsLoading(run.ids[run.index], input.value).catch(() => {}); // the full list's parts, ready by the time the guess is in
    if (offered && normalize(input.value) !== offered.typed) {
      offered = null;
      $("#feedback").textContent = "";
      $("#feedback").classList.remove("ask");
    }
  });
  $("#feedback").addEventListener("pointerdown", (e) => e.target.closest(".fix") && e.preventDefault()); // keep the box focused
  $("#feedback").addEventListener("click", (e) => {
    const fix = e.target.closest(".fix");
    if (fix && offered) take(offered.answers[Number(fix.dataset.i)]);
  });
  $("#guess-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (offered && normalize(input.value) === offered.typed) take(offered.answers[0]);
    else guess(input.value);
  });
  $("#give-up").addEventListener("click", () => finishPrompt(null));
  $("#next").addEventListener("click", next);
  $("#share").addEventListener("click", share);
  $("#practice").addEventListener("click", startPractice);
  $("#practice-start").addEventListener("click", startPractice);
  $("#back-today").addEventListener("click", () => location.reload()); // today's game is saved
  $("#help-button").addEventListener("click", () => $("#help").showModal());
  $("#stats-button").addEventListener("click", showStats);
  settingsButton($("#settings-button"));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !$("#reveal").hidden && document.activeElement?.tagName !== "BUTTON") next();
  });
}

// ---------------------------------------------------------------------------
// One prompt

async function showPrompt() {
  const c = await category(run.ids[run.index]);
  offered = null;
  $("#progress").innerHTML = run.ids.map((_, i) => `<li class="${i < run.index ? "done" : i === run.index ? "now" : ""}"></li>`).join("");
  $("#prompt-text").textContent = c.prompt.replace(/^Name /, "");
  $("#prompt-count").textContent = "Any right answer counts; the rarer, the deeper.";
  $("#feedback").textContent = "";
  $("#guess").value = "";
  $("#digby-status").innerHTML = digbyStatus(totalOf(run.results));
  run.locked = false;
  run.missed = []; // guesses that weren't on the list, sent with the answer
  show("prompt");
  $("#guess").focus();
  // A refresh doesn't reset the clock: the start time is saved.
  run.startedAt ??= Date.now();
  if (mode === "daily") save((s) => ((s.days ??= {})[run.day] = { results: run.results, startedAt: run.startedAt }));
  tick();
}

function tick() {
  clearInterval(timer);
  const update = () => {
    const left = Math.max(0, SECONDS_PER_PROMPT * 1000 - (Date.now() - run.startedAt));
    $("#timer-fill").style.transform = `scaleX(${left / (SECONDS_PER_PROMPT * 1000)})`;
    $("#timer-fill").classList.toggle("low", left < 6000);
    $("#timer-text").textContent = `${Math.ceil(left / 1000)} s`;
    if (left <= 0) finishPrompt(null);
  };
  update();
  timer = setInterval(update, 100);
}

/** Take the answer a near miss was offered. */
function take(answer) {
  const typed = $("#guess").value;
  offered = null;
  $("#feedback").textContent = "";
  $("#feedback").classList.remove("ask");
  finishPrompt(answer, typed);
}

async function guess(text) {
  if (!text.trim() || run.locked) return;
  const id = run.ids[run.index];
  const c = await category(id);
  // The list first, as written; then the full list (an exact name there beats
  // a typo of one on the list); then the list with typos forgiven.
  let found = match(text, c.answers, { ...c, typos: false });
  let full = [];
  if (!found) {
    full = await fullFor(id, text);
    if (run.locked || run.ids[run.index] !== id) return; // the time ran out meanwhile
    found = match(text, full, { ...c, typos: false }) ?? match(text, c.answers, c);
  }
  if (!found) {
    // Close but not close enough to count on its own: ask (a typo of a name on the full list too).
    const near = nearest(text, [...c.answers, ...full], c);
    offered = near.length ? { typed: normalize(text), answers: near } : null;
    const fixes = near.map((a, i) => `<button type="button" class="fix" data-i="${i}">${esc(a.name)}</button>`);
    const list = fixes.length > 1 ? `${fixes.slice(0, -1).join(", ")} or ${fixes.at(-1)}` : fixes[0];
    $("#feedback").innerHTML = near.length
      ? `Did you mean ${list}?<span class="fix-hint">${near.length > 1 ? "Tap one, or press Enter for the first." : "Tap it, or press Enter."}</span>`
      : `“${esc(text.trim())}” isn't on our list. Keep digging.`;
    $("#feedback").classList.toggle("ask", near.length > 0);
    $("#feedback").classList.remove("ok");
    if (near.length) return; // not wrong, just not sure: no shake, and the spelling stays to fix
    if (run.missed && run.missed.length < 12) run.missed.push(normalize(text).slice(0, 60));
    $("#guess-form").classList.remove("shake");
    void $("#guess-form").offsetWidth; // restart the animation
    $("#guess-form").classList.add("shake");
    $("#guess").select();
    return;
  }
  finishPrompt(found, text);
}

async function finishPrompt(answer, typed = null) {
  clearInterval(timer);
  timer = null;
  if (run.locked) return;
  run.locked = true;
  const id = run.ids[run.index];
  const { prompt } = await category(id);
  run.results.push({ id, prompt, guess: typed, answer: answer?.name ?? null, depth: answer?.depth ?? 0, oneIn: answer?.oneIn ?? null, perDay: answer?.perDay ?? null });
  // Today's answers (and misses) go to everyone's counts; practice rounds don't.
  const sent = mode === "daily" ? sendPlay("deep-cut", run.day, id, answer?.name ?? null, [...new Set(run.missed ?? [])].filter(Boolean)) : null;
  run.startedAt = null;
  run.index++;
  if (mode === "daily") {
    const done = run.index >= run.ids.length;
    const total = totalOf(run.results);
    save((s) => {
      (s.days ??= {})[run.day] = { results: run.results, done };
      if (done) (s.history ??= {})[run.day] = total;
    });
  }
  await showReveal(await category(id), run.results.at(-1));
  crowd(id, run.results.at(-1).answer, sent);
}

/** Under the answer: how many of today's players named it too, once enough have played that prompt. */
async function crowd(id, answer, sent) {
  const el = $("#reveal-crowd");
  el.hidden = true;
  if (mode !== "daily" || !answer) return;
  await sent; // so the count includes this answer
  const all = await howEveryoneAnswered("deep-cut", run.day, id);
  if (!all || all.players < 10 || $("#reveal").hidden || $("#reveal-answer").textContent !== answer) return;
  const n = all.counts[answer] ?? 0;
  const share = (100 * n) / all.players;
  el.innerHTML =
    n <= 1
      ? `You're the only one of today's ${count(all.players)} diggers to name it so far.`
      : `<strong>${share < 1 ? "Under 1" : Math.round(share)}%</strong> of today's ${count(all.players)} diggers named it.`;
  el.hidden = false;
}

async function showReveal(c, result) {
  $("#reveal-prompt").textContent = c.prompt;
  $("#reveal-answer").textContent = result.answer ?? "Nothing this time";
  $("#reveal-answer").classList.toggle("missed", !result.answer);
  const top = c.answers[0];
  if (result.answer) {
    $("#reveal-one-in").innerHTML = `1 in <strong>${fmt(result.oneIn)}</strong>`;
    $("#reveal-note").innerHTML =
      `About <strong>${fmt(result.perDay)}</strong> ${result.perDay === 1 ? "person reads" : "people read"} its Wikipedia page a day, out of ${fmt(c.readers)} reading the pages of all its answers.` +
      (top.name === result.answer ? " It's the most read of them all." : ` The most read, ${esc(top.name)}, gets ${fmt(top.perDay)}.`);
  } else {
    $("#reveal-one-in").innerHTML = "";
    $("#reveal-note").textContent = "Here are a few that would have counted.";
  }
  $("#reveal-one-in").hidden = !result.answer;
  const row = (a) => `<li><span>${esc(a.name)}</span>${oneInTag(a)}</li>`;
  $("#surface").innerHTML = c.answers.slice(0, 3).map(row).join("");
  $("#deepest").innerHTML = c.answers.slice(-3).reverse().map(row).join("");
  $("#next").textContent = run.index >= run.ids.length ? "See how deep we went" : "Next prompt";

  const after = totalOf(run.results);
  const before = after - result.depth;
  const p = periodOf(after);
  $("#scene").innerHTML = hillside(run.results, before, after);
  $("#dig-tier").innerHTML = `In the <strong>${p.name}</strong><br>${p.next ? `${p.next.toGo}\u00a0m to the ${p.next.name}` : "The deepest period there is!"}`;
  show("reveal");
  // Dig: Digby and the new stretch of tunnel go down together while the meters count up.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const mover = $("#scene .digby-move");
      if (mover) mover.style.transform = `translate(${SHAFT_X}px,${yAt(after)}px)`;
      const tunnel = $("#scene .tunnel-new");
      if (tunnel) tunnel.style.strokeDashoffset = "0";
    }),
  );
  countUp($("#reveal-depth"), result.depth);
  countUp($("#dig-total"), after, 1600, before);
  $("#next").focus({ preventScroll: true }); // Enter goes on, and the answer stays in view
}

function countUp(el, to, ms = 900, from = 0) {
  const start = performance.now();
  el.textContent = from;
  const step = (t) => {
    const p = Math.min(1, (t - start) / ms);
    el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

async function next() {
  if (run.index >= run.ids.length) {
    const total = totalOf(run.results);
    track("finish", { game: "deep-cut", mode, ...(mode === "daily" ? { day: run.day, ...habit(load().history, run.day) } : {}), depth: total, period: periodOf(total).name, answered: run.results.filter((r) => r.answer).length });
    await showResults();
    if (mode === "daily") {
      window.critterNav?.refresh(); // tick it in the bar
      everyoneToday(run.day, total, { send: true });
    }
    return;
  }
  await showPrompt();
}

// ---------------------------------------------------------------------------
// Results, sharing and stats

const shareUrl = () => location.href.split(/[?#]/)[0];

/** How everyone did today, under the results; a dig just finished is sent first. */
async function everyoneToday(day, depth, { send = false } = {}) {
  const el = $("#everyone");
  el.hidden = true;
  if (send) await sendScore("deep-cut", day, depth);
  const all = await howEveryoneDid("deep-cut", day);
  if (!all?.players || mode !== "daily") return;
  el.textContent =
    all.players === 1
      ? "You're the first to finish today's dig. Come back later to see how everyone did."
      : `${count(all.players)} players have dug today. ${beatShare(all, depth) ? `You went deeper than ${beatShare(all, depth)}% of them; the` : "The"} average dig is ${Math.round(averageOf(all).average)}\u00a0m.`;
  el.hidden = false;
}

async function showResults() {
  const total = totalOf(run.results);
  const daily = mode === "daily";
  const p = periodOf(total);
  $("#results-label").textContent = daily ? `Deep Cut #${run.day}` : "Practice round";
  $("#medal").innerHTML = medal(p.index);
  $("#tier-name").textContent = p.name;
  $("#tier-ago").textContent = p.ago === "today" ? "the present day" : p.ago;
  $("#total").textContent = "0";
  countUp($("#total"), total, 1200);
  const s = stats(load().history ?? {}, today);
  $("#total-note").textContent = !daily ? "Practice rounds don't count toward your stats." : s.played > 1 ? `Your average is ${s.average} m. Streak: ${s.streak} day${s.streak === 1 ? "" : "s"}.` : "";
  $("#tier-ladder").innerHTML = strata(p.index, total);
  $("#share").hidden = !daily;
  $(".next-in").hidden = !daily;
  $("#practice").textContent = daily ? "Keep digging (practice)" : "Another practice round";
  $("#practice").hidden = !PRACTICE_FOR_ALL;
  $("#back-today").hidden = daily;
  const items = await Promise.all(
    run.results.map(async (r) => {
      const prompt = r.prompt ?? (await category(r.id).catch(() => null))?.prompt ?? "Name a past prompt";
      const what = prompt.replace(/^Name (a |an )?/, "");
      return `<li><span><span class="s-prompt">${esc(what.charAt(0).toUpperCase() + what.slice(1))}</span><span class="s-answer${r.answer ? "" : " missed"}">${esc(r.answer ?? "Nothing")}</span></span>${oneInTag(r)}<span class="s-depth">${r.depth} m</span></li>`;
    }),
  );
  $("#summary").innerHTML = items.join("");
  // How rarely read the day's answers are, all together.
  // (Answers saved before readership was kept have no numbers to show.)
  const found = run.results.filter((r) => r.answer && r.perDay && r.oneIn);
  const rarest = found.reduce((best, r) => (!best || r.oneIn > best.oneIn ? r : best), null);
  const note = found.length
    ? `Your ${found.length === 1 ? "answer's page gets" : `${found.length} answers' pages get`} about <strong>${fmt(found.reduce((n, r) => n + r.perDay, 0))}</strong> Wikipedia readers a day${found.length > 1 ? " between them" : ""}. Rarest find: <strong>${esc(rarest.answer)}</strong>, 1 in ${fmt(rarest.oneIn)}.`
    : run.results.some((r) => r.answer)
      ? ""
      : "No answers this time. Tomorrow's another dig.";
  $("#readers-note").innerHTML = note;
  $("#readers-note").hidden = !note;
  $("#share-note").textContent = "";
  show("results");
  if (daily) countdown();
}

let clock = null;
function countdown() {
  clearInterval(clock);
  const tickClock = () => {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const ms = midnight - now;
    const pad = (n) => String(n).padStart(2, "0");
    $("#countdown").textContent = `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor((ms / 60000) % 60))}:${pad(Math.floor((ms / 1000) % 60))}`;
  };
  tickClock();
  clock = setInterval(tickClock, 1000);
}

async function share() {
  track("share", { game: "deep-cut", day: run.day });
  const text = shareText(run.day, run.results, shareUrl());
  try {
    if (navigator.share && matchMedia("(pointer: coarse)").matches) await navigator.share({ text });
    else {
      await navigator.clipboard.writeText(text);
      $("#share-note").textContent = "Copied. Paste it anywhere.";
      $("#share-note").classList.add("ok");
    }
  } catch {
    // The person closed the share sheet.
  }
}

function showStats() {
  const history = load().history ?? {};
  const s = stats(history, today);
  // Each day by its own count of prompts: five at first, eight since.
  const periodOn = (d) => periodFor(history[d], promptsFor(d, schedule).length).index;
  const deepestDay = Object.keys(history).map(Number).reduce((best, d) => (best === null || history[d] > history[best] ? d : best), null);
  const stat = (n, label, wide = false) => `<div class="stat${wide ? " wide" : ""}"><strong>${n}</strong><span>${label}</span></div>`;
  $("#stats-grid").innerHTML = [
    stat(s.played, "Played"),
    stat(s.streak, "Streak"),
    stat(s.bestStreak, "Best streak"),
    stat(`${s.average}\u00a0m`, "Average", true),
    stat(`${s.deepest}\u00a0m`, s.played ? `Deepest, in the ${PERIODS[periodOn(deepestDay)].name}` : "Deepest", true),
  ].join("");
  // Which period each day ended in, and the last five weeks in those colors.
  const days = Object.keys(history).map(Number);
  $("#stats-tiers").innerHTML = tierBars(
    PERIODS.map((p, i) => ({ label: p.name, count: days.filter((d) => periodOn(d) === i).length, color: LAYERS[i] })),
    history[today] !== undefined ? periodOn(today) : -1,
  );
  $("#stats-calendar").innerHTML = calendar((d) => (history[d] !== undefined ? LAYERS[periodOn(d)] : null), today);
  $("#stats").showModal();
}

// ---------------------------------------------------------------------------
// Practice: random prompts, nothing saved

async function startPractice() {
  mode = "practice";
  track("start", { game: "deep-cut", mode });
  if (deck.length < PROMPTS_PER_DAY) {
    const index = await (await fetch("data/index.json")).json();
    const fresh = index.map((c) => c.id).filter((id) => !deck.includes(id));
    for (let i = fresh.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [fresh[i], fresh[j]] = [fresh[j], fresh[i]];
    }
    deck = [...deck, ...fresh];
  }
  begin({ ids: deck.splice(0, PROMPTS_PER_DAY), results: [], index: 0 });
  $("#day-label").textContent = "Practice round · doesn't count";
  await showPrompt();
}

init();
