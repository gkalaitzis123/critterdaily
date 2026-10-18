// Mother Tongue in the browser: today's mystery language, guessing with
// suggestions, Pip climbing the family tree toward the mystery's egg, hints,
// the hatching, sharing and stats. The rules live in game.js.
import { MAX_GUESSES, HINTS, MISSED, TIERS, branchMatch, compare, cracks, dayNumber, find, hintsFor, lineage, mysteryFor, normalize, roughly, shareText, stats, suggest, tierFor, whereShort, whereText } from "./game.js";

const $ = (sel) => document.querySelector(sel);
const STORE = "mothertongue-v1";
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const regions = new Intl.DisplayNames(["en"], { type: "region" });
/** "BR" -> "Brazil"; null for a code the browser doesn't know. */
function countryName(code) {
  try {
    return regions.of(code);
  } catch {
    return null;
  }
}

let nodes; // branch names by index (null for unnamed branches)
let languages;
let byId;
let today;
let mystery;
let results = []; // { lang, found, shared, closeness, branch, where }
let finished = null; // null, "solved" or "lost"
let active = -1; // highlighted suggestion
let browse = []; // the languages to scroll through, A to Z
let schedule;
let mode = "daily"; // or "practice"
// For now anyone can practice with random languages as often as they like,
// which is handy for testing. Later, practice can be the supporter unlock:
// set this to false to hide it.
const PRACTICE_FOR_ALL = true;
let deck = []; // practice mysteries still to come, shuffled, so they don't repeat

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
// Pip, the egg and the chick

/** Pip the parrot, facing us, perched (or cheering), drawn around (0, 0) in a -30 -40 60 80 box with its feet at y = 26. */
function pip({ cheer = false } = {}) {
  const tail = '<path d="M-2 12Q-8 28 -4 39Q1 31 3 14Z" fill="#4fa3e0"/><path d="M3 13Q10 26 7 36Q3 29 0 16Z" fill="#ff6f61"/>';
  const body = '<ellipse cx="0" cy="7" rx="16" ry="18" fill="#5cc86b"/><ellipse cx="0" cy="11" rx="9.5" ry="11.5" fill="#ffd45e"/>';
  const feet = '<ellipse cx="-6" cy="26" rx="4.6" ry="2.6" fill="#ff8a3d"/><ellipse cx="6" cy="26" rx="4.6" ry="2.6" fill="#ff8a3d"/>';
  const head = '<circle cx="0" cy="-12" r="13" fill="#5cc86b"/><path d="M-1 -24Q-9 -31 -5 -36Q-1 -31 0 -25Q1 -35 7 -36Q8 -30 2 -24Z" fill="#ff6f61"/>';
  const cheeks = '<circle cx="-8.5" cy="-7" r="2.6" fill="#ffb3c1"/><circle cx="8.5" cy="-7" r="2.6" fill="#ffb3c1"/>';
  const beak = '<path d="M-3.6 -10Q0 -12.6 3.6 -10Q3.2 -5 0 -2.6Q-3.2 -5 -3.6 -10Z" fill="#ff8a3d"/>';
  if (cheer) {
    const wings = '<path class="flap-l" d="M-13 -2Q-29 -8 -29 -27Q-17 -20 -9 -8Z" fill="#3fa557"/><path class="flap-r" d="M13 -2Q29 -8 29 -27Q17 -20 9 -8Z" fill="#3fa557"/>';
    const eyes = '<path d="M-7.5 -13q2.6-3.2 5.2 0M2.3 -13q2.6-3.2 5.2 0" stroke="#2e2a3b" fill="none" stroke-width="2" stroke-linecap="round"/>';
    return `${wings}${tail}${body}${feet}${head}${eyes}${cheeks}${beak}`;
  }
  const wings = '<path d="M-14 -1Q-23 11 -13 23Q-8 11 -14 -1Z" fill="#3fa557"/><path d="M14 -1Q23 11 13 23Q8 11 14 -1Z" fill="#3fa557"/>';
  const eyes = '<circle cx="-5" cy="-13" r="2.7" fill="#2e2a3b"/><circle cx="5" cy="-13" r="2.7" fill="#2e2a3b"/><circle cx="-4.1" cy="-14" r="0.9" fill="#fff"/><circle cx="5.9" cy="-14" r="0.9" fill="#fff"/>';
  return `<g class="hop">${tail}${body}${wings}${feet}<g class="tilt">${head}${eyes}${cheeks}${beak}</g></g>`;
}

const CRACKS = ["M-12 -8l4 3l3-4l4 4", "M3 -18l3 3l4-3", "M-5 6l3-3l3 3l3-2", "M6 -5l3 4l4-3"];

/** A woven nest's back rim and its front, around an egg at (0, 0): the bowl spans x -40..40 and ends at y = 36. */
const NEST_BACK = '<path d="M-38 8Q0 -6 38 8" stroke="#7a4e2e" stroke-width="7" fill="none" stroke-linecap="round"/>';
const NEST_FRONT = `<path d="M-39 7Q-38 36 0 36Q38 36 39 7Q20 19 0 19Q-20 19 -39 7Z" fill="#a8743f"/>
  <path d="M-37 8Q0 25 37 8" stroke="#c98b5b" stroke-width="5" fill="none" stroke-linecap="round"/>
  <path d="M-29 22q9 5 18 4M-6 29q10 2 19-1M15 25q9-2 15-8M-33 15q4 4 9 6" stroke="#8a5a36" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  <path d="M-39 7l-7-3M39 7l7-4M-36 21l-7 1M36 20l7 2" stroke="#a8743f" stroke-width="3" stroke-linecap="round"/>`;

/** The mystery's nest, in a -60 -50 120 92 box: an egg with 0–4 cracks, glowing as you get close, or an empty shell once it's found. */
function nestArt(crackCount, hatched) {
  const glow = crackCount ? `<circle class="glow" cx="0" cy="-4" r="${30 + crackCount * 4}" fill="#ffe07a" fill-opacity="${(0.15 + crackCount * 0.17).toFixed(2)}"/>` : "";
  const egg = hatched
    ? '<path d="M-17 4L-11 -4L-5 4L1 -4L7 4L13 -4L17 4L17 14Q0 24 -17 14Z" fill="#fff4e0" stroke="#e8cba8" stroke-width="1.5"/>'
    : `<g class="egg-wobble${crackCount >= 3 ? " fast" : ""}"><ellipse cx="0" cy="-2" rx="18" ry="23" fill="#fff4e0" stroke="#e8cba8" stroke-width="2"/><circle cx="-6" cy="-12" r="3" fill="#ffc9a3"/><circle cx="7" cy="5" r="2.5" fill="#ffc9a3"/>${CRACKS.slice(0, crackCount)
        .map((d) => `<path d="${d}" stroke="#9c6a3e" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`)
        .join("")}</g>`;
  return `${glow}${NEST_BACK}${egg}${NEST_FRONT}`;
}

/** A leaf, pointing along `angle` from (x, y). */
const leaf = (x, y, angle, fill = "#5cc86b") => `<path transform="translate(${x} ${y}) rotate(${angle})" d="M0 0Q8 -7 18 0Q8 7 0 0Z" fill="${fill}"/>`;

/** The end of the game: the chick hatches (or the egg sleeps on) in its nest on a branch, with Pip beside it. */
function hatchScene(solved) {
  const chick = `<g class="bounce">
      <circle cx="0" cy="-2" r="25" fill="#ffe066"/>
      <path class="flap-r" d="M22 2Q36 -6 34 -18Q26 -8 18 -6Z" fill="#f5c518"/>
      <path d="M-22 2Q-32 6 -30 16Q-24 10 -18 8Z" fill="#f5c518"/>
      <circle cx="-9" cy="-6" r="3.6" fill="#2e2a3b"/><circle cx="9" cy="-6" r="3.6" fill="#2e2a3b"/>
      <circle cx="-8" cy="-7.5" r="1.2" fill="#fff"/><circle cx="10" cy="-7.5" r="1.2" fill="#fff"/>
      <path d="M-5 1L5 1L0 8Z" fill="#ff8a3d"/>
      <circle cx="-16" cy="3" r="3.6" fill="#ffb3c1"/><circle cx="16" cy="3" r="3.6" fill="#ffb3c1"/>
      <g transform="rotate(-14 0 -24)"><path d="M-17 -20Q-17 -40 0 -40Q17 -40 17 -20L11 -25L6 -19L0 -26L-6 -19L-11 -25Z" fill="#fff4e0" stroke="#e8cba8" stroke-width="1.5" stroke-linejoin="round"/></g>
    </g>
    <path d="M-24 10L-17 2L-10 10L-3 2L4 10L11 2L18 10L24 4L24 20Q0 32 -24 20Z" fill="#fff4e0" stroke="#e8cba8" stroke-width="1.5" stroke-linejoin="round"/>`;
  const sleeping = `<g class="egg-wobble"><ellipse cx="0" cy="-4" rx="22" ry="28" fill="#fff4e0" stroke="#e8cba8" stroke-width="2"/>
      <path d="M-11 -7q3 3 6 0M5 -7q3 3 6 0" stroke="#9c6a3e" fill="none" stroke-width="2" stroke-linecap="round"/></g>
    <text class="zzz" x="26" y="-26" fill="#3e3a52" font-family="Fredoka, sans-serif" font-weight="700" font-size="16">z</text>
    <text class="zzz" x="36" y="-38" fill="#3e3a52" font-family="Fredoka, sans-serif" font-weight="700" font-size="12" style="animation-delay:.8s">z</text>`;
  // The branch grows in from off the left edge, so it fades in there.
  return `<svg viewBox="-150 -50 300 160" aria-hidden="true">
    <defs><linearGradient id="branch-in" gradientUnits="userSpaceOnUse" x1="-150" x2="-96"><stop offset="0" stop-color="#8a5a36" stop-opacity="0"/><stop offset="1" stop-color="#8a5a36"/></linearGradient></defs>
    <path d="M-150 90C-80 87 -10 83 60 77C92 74 118 70 140 64Q146 66 140 71C118 77 92 82 60 86C-10 94 -80 100 -150 106Z" fill="url(#branch-in)"/>
    <path d="M-96 92C-60 90 -30 88 10 86" stroke="#a8743f" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M50 80Q60 66 74 58" stroke="#8a5a36" stroke-width="5" fill="none" stroke-linecap="round"/>
    ${leaf(74, 58, -40)}${leaf(62, 70, -110, "#3fa557")}${leaf(-70, 95, 130, "#3fa557")}${leaf(-48, 92, 100)}${leaf(140, 67, -25, "#3fa557")}
    <g transform="translate(-14 52) scale(1.25)">
      ${NEST_BACK}
      <g transform="translate(0 -4)">${solved ? chick : sleeping}</g>
      ${NEST_FRONT}
    </g>
    <g transform="translate(106 47.5)">${pip({ cheer: solved })}</g>
  </svg>`;
}

const feather = (color) => `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 18Q6 6 17 2Q14 12 4 18ZM4 18L12 8" fill="${color}" stroke="#2e2a3b" stroke-width="1.4" stroke-linecap="round"/></svg>`;
const TIER_COLORS = ["#ffb938", "#5cc86b", "#4fa3e0", "#ff9aae"];

/** The tiers, with the one this game earned marked. */
function tierList(current) {
  const rows = TIERS.map((t, i) => ({ name: t.name, range: `${i ? TIERS[i - 1].max + 1 : 1}–${t.max} guesses`, icon: feather(TIER_COLORS[i]) }));
  rows.push({ name: MISSED, range: "not found", icon: '<svg viewBox="0 0 20 20" aria-hidden="true"><ellipse cx="10" cy="11" rx="6" ry="8" fill="#fff4e0" stroke="#b08a6a" stroke-width="1.5"/></svg>' });
  return rows.map((r, i) => `<div class="tier${i === current ? " now" : ""}">${r.icon}<b>${r.name}${i === current ? " · you" : ""}</b><span>${r.range}</span></div>`).join("");
}

const HINT_ICONS = {
  speakers: '<svg viewBox="0 0 26 26" aria-hidden="true"><path d="M4 6Q4 3 7 3H19Q22 3 22 6V14Q22 17 19 17H11L6 22V17Q4 17 4 14Z" fill="#ffb938" stroke="#2e2a3b" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  countries: '<svg viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="10" fill="#4fa3e0" stroke="#2e2a3b" stroke-width="1.6"/><path d="M7 9Q11 7 12 11Q10 15 13 17Q11 21 9 20M16 5Q15 9 19 10Q21 13 19 16" stroke="#7bc96f" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
  letter: '<svg viewBox="0 0 26 26" aria-hidden="true"><rect x="3" y="3" width="20" height="20" rx="5" fill="#ffe7b8" stroke="#2e2a3b" stroke-width="1.6"/><path d="M9 18L13 8L17 18M10.5 15H15.5" stroke="#2e2a3b" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

// ---------------------------------------------------------------------------
// The game

async function init() {
  wire();
  for (const svg of document.querySelectorAll("[data-pip]")) svg.innerHTML = pip();
  try {
    let data;
    [data, schedule] = await Promise.all([fetch("data/languages.json").then((r) => r.json()), fetch("data/schedule.json").then((r) => r.json())]);
    nodes = data.nodes;
    languages = data.languages;
    byId = new Map(languages.map((l) => [l.id, l]));
    // The list to scroll through: every language that can be a mystery, plus
    // the rest of the 600 best known, A to Z (all 7,000 would bury them).
    const known = new Set([...languages].sort((a, b) => (b.fame ?? 0) - (a.fame ?? 0)).slice(0, 600).map((l) => l.id));
    for (const id of schedule) known.add(id);
    browse = languages.filter((l) => known.has(l.id)).sort((a, b) => a.name.localeCompare(b.name));
    today = dayNumber();
    mystery = byId.get(mysteryFor(today, schedule));
  } catch {
    $("#loading").textContent = "Mother Tongue couldn't load today's language. Try refreshing the page.";
    return;
  }
  $("#day-label").textContent = `#${today} · ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;
  // A saved game counts only if it was for this mystery (the data can be rebuilt).
  const saved = load().days?.[today]?.mystery === mystery.id ? load().days[today] : null;
  results = (saved?.guesses ?? []).map((id) => byId.get(id)).filter(Boolean).map((lang) => ({ lang, ...compare(lang, mystery, nodes) }));
  finished = saved?.finished ?? null;
  $("#loading").hidden = true;
  $("#game").hidden = false;
  $("#practice-start").hidden = !PRACTICE_FOR_ALL;
  render();
  if (finished) showDone();
  else $("#guess").focus();
}

function wire() {
  const input = $("#guess");
  input.addEventListener("input", showSuggestions);
  // Tapping the empty box, or the arrow in it, opens the whole list to scroll through.
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
  input.addEventListener("blur", () => setTimeout(hideSuggestions, 150));
  $("#suggestions").addEventListener("pointerdown", (e) => {
    const li = e.target.closest("[role=option]");
    if (!li) return;
    e.preventDefault();
    guess(byId.get(li.dataset.id));
  });
  $("#guess-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const items = [...document.querySelectorAll("#suggestions [role=option]")];
    const picked = items[active]?.dataset.id ?? null;
    guess(picked ? byId.get(picked) : find(input.value, languages) ?? suggest(input.value, languages, 1, nodes)[0] ?? null, input.value);
  });
  // Giving up asks first, in the page: browsers can silently block confirm()
  // pop-ups (after "don't let this site prompt again"), and then it did nothing.
  $("#give-up").addEventListener("click", () => askGiveUp(true));
  $("#give-up-no").addEventListener("click", () => askGiveUp(false));
  $("#give-up-yes").addEventListener("click", () => {
    askGiveUp(false);
    finish("lost");
  });
  $("#share").addEventListener("click", share);
  $("#practice").addEventListener("click", startPractice);
  $("#practice-start").addEventListener("click", startPractice);
  for (const id of ["#back-today", "#back-today-game"]) $(id).addEventListener("click", () => location.reload()); // today's game is saved
  $("#help-button").addEventListener("click", () => $("#help").showModal());
  $("#stats-button").addEventListener("click", showStats);
}

/**
 * The list under the box: with nothing typed, the well-known languages A to
 * Z to scroll through; while typing, every match (by name, other name or
 * branch), the best known first.
 */
function showSuggestions() {
  if (finished) return;
  const list = $("#suggestions");
  const typed = normalize($("#guess").value);
  const found = typed ? suggest($("#guess").value, languages, 100, nodes) : browse;
  const guessed = new Set(results.map((r) => r.lang.id));
  active = typed && found.length ? 0 : -1;
  const head = typed ? "" : `<li class="list-head" role="presentation">${browse.length} well-known languages, A to Z. Or type any of 7,000.</li>`;
  list.innerHTML =
    head +
    found
      .map((l, i) => {
        // Why it's suggested, when the name doesn't say: another name, or the branch it's in.
        const other = typed && l.aliases.find((a) => a.includes(typed));
        const branch = typed && branchMatch(typed, l, nodes);
        const via = !typed ? speakers(l) : normalize(l.name).includes(typed) ? "" : other ? other.replace(/\b\w/g, (c) => c.toUpperCase()) : branch ? `in ${branch}` : "";
        const note = guessed.has(l.id) ? "guessed" : via;
        return `<li role="option" data-id="${l.id}" aria-selected="${i === active}"${guessed.has(l.id) ? ' class="guessed"' : ""}><span>${esc(l.name)}</span>${note ? `<span class="also">${esc(note)}</span>` : ""}</li>`;
      })
      .join("");
  list.hidden = !found.length;
  list.scrollTop = 0;
  $("#guess").setAttribute("aria-expanded", String(!!found.length));
  $("#browse").classList.toggle("open", !list.hidden);
}

/** "12M speakers", short, for the list. */
function speakers(l) {
  if (!l.speakers) return "";
  const n = l.speakers;
  const short = n >= 1e9 ? `${+(n / 1e9).toPrecision(2)}B` : n >= 1e6 ? `${+(n / 1e6).toPrecision(n >= 1e7 ? 3 : 2)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n);
  return `${short} speakers`;
}

function hideSuggestions() {
  $("#suggestions").hidden = true;
  $("#guess").setAttribute("aria-expanded", "false");
  $("#browse").classList.remove("open");
  active = -1;
}

/** Show or hide the "reveal the answer?" question in place of the give-up link. */
function askGiveUp(asking) {
  $("#give-up-question").textContent = mode === "daily" ? "Reveal today's language? That ends today's game." : "Reveal the language? That ends this practice game.";
  $("#give-up").hidden = asking;
  $("#give-up-confirm").hidden = !asking;
  if (asking) $("#give-up-yes").focus();
}

/** What the last guess told you, with the compass pointing where the mystery is spoken. */
function tell(text, { info = false, where = null } = {}) {
  const feedback = $("#feedback");
  feedback.textContent = text;
  feedback.classList.toggle("info", info);
  $("#feedback-card").hidden = !text;
  const pointing = Boolean(where && where.km >= 100);
  $("#compass").hidden = !pointing;
  if (pointing) $("#needle").style.transform = `rotate(${where.dir * 45}deg)`;
}

function guess(lang, typed = "") {
  if (finished) return;
  if (!lang) {
    tell(typed.trim() ? `We don't know a language called “${typed.trim()}”. Pick one from the list.` : "");
    return;
  }
  if (results.some((r) => r.lang.id === lang.id)) {
    tell(`You already guessed ${lang.name}.`);
    return;
  }
  const result = { lang, ...compare(lang, mystery, nodes) };
  results.push(result);
  $("#guess").value = "";
  hideSuggestions();
  const where = whereText(result.where);
  const map = !where ? "" : where === "nearby" ? " The mystery is spoken nearby." : ` The mystery is spoken ${where} of it.`;
  tell(result.found ? "" : (result.branch === null ? `${lang.name} isn't related.` : `${lang.name} shares the ${nodes[result.branch]} branch.`) + map, { info: true, where: result.where });
  if (mode === "daily") save((s) => ((s.days ??= {})[today] = { mystery: mystery.id, guesses: results.map((r) => r.lang.id), finished: null }));
  render(lang.id);
  if (result.found) finish("solved");
  else if (results.length >= MAX_GUESSES) finish("lost");
}

/** The tree: the mystery's named branches from the trunk up, Pip on the deepest one found, and the egg on top. */
function renderTree(latest) {
  const done = Boolean(finished);
  const shown = lineage(mystery, results, nodes); // root first
  const open = (n) => n.revealed || done;
  const deepest = done ? null : [...shown].reverse().find(open) ?? null;
  const rows = shown
    .map((n, k) => {
      const here = open(n) ? results.filter((r) => !r.found && r.branch === mystery.path[n.depth]) : [];
      const fruits = here.length ? `<span class="fruits">${here.map((r) => `<span class="fruit${r.lang.id === latest ? " new" : ""}">${esc(r.lang.name)}</span>`).join("")}</span>` : "";
      const perch = n === deepest ? `<svg class="pip" viewBox="-30 -40 60 80" aria-hidden="true">${pip()}</svg>` : "";
      return `<div class="branch ${k % 2 ? "left" : "right"} ${open(n) ? "found" : "hidden"}${n === deepest ? " deepest" : ""}"><div class="side"><span class="plaque">${open(n) ? esc(n.name) : "• • •"}</span>${fruits}</div>${perch}</div>`;
    })
    .reverse()
    .join("");
  const waiting = !done && !deepest ? `<svg class="roots-pip" viewBox="-30 -40 60 80" aria-hidden="true">${pip()}</svg>` : "";
  const unrelated = results.filter((r) => !r.found && r.branch === null);
  const cloud = unrelated.length ? `<p class="cloud"><strong>Not related:</strong> ${unrelated.map((r) => esc(r.lang.name)).join(" · ")}</p>` : "";
  const label = done ? esc(mystery.name) : "The mystery language";
  $("#tree").innerHTML = `${cloud}<div class="nest"><svg viewBox="-60 -50 120 92" aria-hidden="true">${nestArt(done ? 0 : cracks(results), done && finished === "solved")}</svg><p class="nest-label">${label}</p></div><div class="limbs">${rows}${waiting}</div>`;
}

function render(latest = null) {
  const done = Boolean(finished);
  renderTree(latest);

  // Guesses used, as seeds.
  $("#seeds").innerHTML = Array.from({ length: MAX_GUESSES }, (_, i) => `<span class="${i < results.length ? "used" : ""}"></span>`).join("");
  $("#seeds").setAttribute("aria-label", `${results.length} of ${MAX_GUESSES} guesses used`);
  $("#counter").textContent = `${results.length} of ${MAX_GUESSES} guesses`;
  $(".seeds-row").hidden = done; // the finished card says how many it took

  // Guesses, closest first.
  $("#guesses-section").hidden = !results.length;
  const color = (r) => (r.found ? "#5cc86b" : r.shared === 0 ? "#9aa6b2" : r.closeness >= 0.75 ? "#7bc96f" : r.closeness >= 0.5 ? "#ffb938" : r.closeness >= 0.25 ? "#ff9a5a" : "#c98b5b");
  $("#guesses").innerHTML = [...results]
    .sort((a, b) => b.closeness - a.closeness || (a.where?.km ?? Infinity) - (b.where?.km ?? Infinity))
    .map((r) => {
      const where = whereShort(r.where);
      const branch = (r.found ? "That's it!" : r.branch === null ? "Not related" : `Shares: ${esc(nodes[r.branch])}`) + (where ? ` · ${esc(where)}` : "");
      return `<li class="${r.lang.id === latest ? "latest" : ""}"><span class="g-name">${esc(r.lang.name)}</span><span class="g-branch">${branch}</span><span class="g-meter" aria-label="${Math.round(r.closeness * 100)}% of the way"><span style="width:${Math.max(4, r.closeness * 100)}%;--c:${color(r)}"></span></span></li>`;
    })
    .join("");

  // Hints.
  const wrong = results.filter((r) => !r.found).length;
  const hints = hintsFor(wrong, mystery).map((h) => {
    if (h.kind === "speakers") return `<p>${HINT_ICONS.speakers}<span>Spoken by ${roughly(h.value)} people.</span></p>`;
    if (h.kind === "countries") {
      const names = h.value.map(countryName).filter(Boolean);
      return `<p>${HINT_ICONS.countries}<span>Spoken in ${names.length ? esc(names.slice(0, 3).join(", ")) + (names.length > 3 ? ` and ${names.length - 3} more` : "") : "an unrecorded place"}.</span></p>`;
    }
    return `<p>${HINT_ICONS.letter}<span>Its name starts with “${esc(h.value)}”.</span></p>`;
  });
  const next = HINTS.find((h) => h.after > wrong);
  if (next && !done) hints.push(`<p class="next-hint">Next hint after ${next.after - wrong} more guess${next.after - wrong === 1 ? "" : "es"}.</p>`);
  $("#hints").innerHTML = hints.join("");
}

function finish(outcome) {
  finished = outcome;
  if (mode === "daily")
    save((s) => {
      (s.days ??= {})[today] = { mystery: mystery.id, guesses: results.map((r) => r.lang.id), finished: outcome };
      (s.history ??= {})[today] = { solved: outcome === "solved", guesses: results.length };
    });
  render();
  showDone();
}

function showDone() {
  for (const el of ["#guess-form", "#give-up", "#give-up-confirm", ".lede", ".tip", "#feedback-card", "#practice-start", "#back-today-game"]) $(el).hidden = true;
  $("#done").hidden = false;
  const daily = mode === "daily";
  const solved = finished === "solved";
  $("#hatch").innerHTML = hatchScene(solved) + (solved ? `<p class="say">${esc(mystery.native ? `${mystery.native}!` : "Found me!")}</p>` : "");
  $("#done-label").textContent = solved ? `Found in ${results.length} guess${results.length === 1 ? "" : "es"}` : daily ? "Today's language was" : "The language was";
  $("#done-title").textContent = mystery.name;
  $("#done-note").textContent = `${mystery.native ? `${mystery.name} calls itself “${mystery.native}”. ` : ""}Spoken by ${roughly(mystery.speakers)} people.`;
  $("#tier").innerHTML = tierList(tierFor(results.length, solved).index);
  $("#done-family").innerHTML = [...mystery.path.map((i) => nodes[i]).filter(Boolean).map(esc), `<strong>${esc(mystery.name)}</strong>`].join(" › ");
  $("#done-wiki").href = `https://en.wikipedia.org/wiki/${encodeURIComponent(mystery.wiki)}`;
  $("#done-wiki").textContent = `Read about ${mystery.name} on Wikipedia`;
  $("#share").hidden = !daily;
  $("#share-note").textContent = "";
  $(".next-in").hidden = !daily;
  $("#practice").hidden = !PRACTICE_FOR_ALL;
  $("#practice").textContent = daily ? "Practice with a random language" : "Another practice round";
  $("#back-today").hidden = daily;
  window.scrollTo(0, 0);
  if (daily) countdown();
}

/** A practice game: a random mystery from the year's list, not saved or counted. */
function startPractice() {
  mode = "practice";
  if (!deck.length) {
    deck = [...new Set(schedule)].filter((id) => byId.has(id) && id !== mystery?.id);
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }
  mystery = byId.get(deck.pop());
  results = [];
  finished = null;
  $("#day-label").textContent = "Practice · doesn't count";
  $("#done").hidden = true;
  for (const el of ["#guess-form", "#give-up", ".lede", ".tip"]) $(el).hidden = false;
  $("#give-up-confirm").hidden = true;
  tell("");
  $("#practice-start").hidden = !PRACTICE_FOR_ALL;
  $("#practice-start").textContent = "Skip to another random language";
  $("#back-today-game").hidden = false;
  render();
  window.scrollTo(0, 0);
  $("#guess").focus();
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
  const text = shareText(today, results, finished === "solved", location.href.split(/[?#]/)[0]);
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
  const s = stats(load().history ?? {}, today ?? dayNumber());
  const stat = (n, label) => `<div class="stat"><strong>${n}</strong><span>${label}</span></div>`;
  $("#stats-grid").innerHTML = [
    stat(s.played, "Played"),
    stat(s.played ? `${Math.round((s.won / s.played) * 100)}%` : "0%", "Hatched"),
    stat(s.average || "–", "Avg. guesses"),
    stat(s.streak, "Streak"),
    stat(s.bestStreak, "Best streak"),
    stat(s.won, "Hatched total"),
  ].join("");
  $("#stats").showModal();
}

init();
