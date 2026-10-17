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

/** Pip the parrot, perched (or cheering), drawn around (0, 0) in a -30 -40 60 80 box. */
function pip({ cheer = false } = {}) {
  const tail = '<path d="M-4 14L-14 34L-6 32L-2 38L2 30Z" fill="#4fa3e0"/><path d="M2 14L8 36L12 28Z" fill="#ff6f61"/>';
  const body = '<ellipse cx="0" cy="4" rx="16" ry="19" fill="#5cc86b"/><ellipse cx="1" cy="9" rx="10" ry="12" fill="#ffd45e"/>';
  const feet = '<path d="M-4 22l-2 6M4 22l2 6" stroke="#ff8a3d" stroke-width="2.5" stroke-linecap="round"/>';
  if (cheer) {
    return `<path class="flap-l" d="M-14 -2Q-34 -16 -30 -34Q-16 -18 -10 -8Z" fill="#3fa557"/><path class="flap-r" d="M14 -2Q34 -16 30 -34Q16 -18 10 -8Z" fill="#3fa557"/>${tail}${body}
      <circle cx="0" cy="-14" r="12" fill="#5cc86b"/><path d="M-4 -25Q0 -34 4 -25" stroke="#ff6f61" fill="none" stroke-width="3" stroke-linecap="round"/>
      <path d="M-7 -17q3-3 6 0M2 -17q3-3 6 0" stroke="#2e2a3b" fill="none" stroke-width="2" stroke-linecap="round"/><path d="M-4 -10Q0 -2 4 -10Z" fill="#ff8a3d"/>${feet}`;
  }
  return `<g class="hop">${tail}${body}<path d="M-14 0Q-21 14 -8 22Q-6 10 -14 0Z" fill="#3fa557"/>
    <g class="tilt"><circle cx="2" cy="-14" r="12" fill="#5cc86b"/><path d="M-2 -25Q2 -34 6 -25" stroke="#ff6f61" fill="none" stroke-width="3" stroke-linecap="round"/>
    <circle cx="6" cy="-16" r="4.5" fill="#fff"/><circle cx="7" cy="-16" r="2.2" fill="#2e2a3b"/><path d="M12 -13Q22 -11 14 -3Q13 -8 10 -9Z" fill="#ff8a3d"/><circle cx="-3" cy="-9" r="2.6" fill="#ffb3c1"/></g>${feet}</g>`;
}

const CRACKS = ["M-12 -6l4 3l3-4l4 4", "M3 -16l3 3l4-3", "M-5 8l3-3l3 3l3-2", "M6 -3l3 4l4-3"];

/** The mystery's nest, in a -60 -50 120 92 box: an egg with 0–4 cracks, glowing as you get close, or an empty shell once it's found. */
function nestArt(crackCount, hatched) {
  const glow = crackCount ? `<circle class="glow" cx="0" cy="-2" r="${30 + crackCount * 4}" fill="#ffe07a" fill-opacity="${(0.15 + crackCount * 0.17).toFixed(2)}"/>` : "";
  const egg = hatched
    ? '<path d="M-18 8L-12 0L-6 8L0 0L6 8L12 0L18 8L18 16Q0 28 -18 16Z" fill="#fff4e0" stroke="#e8cba8" stroke-width="1.5"/>'
    : `<g class="egg-wobble${crackCount >= 3 ? " fast" : ""}"><ellipse cx="0" cy="0" rx="18" ry="23" fill="#fff4e0" stroke="#e8cba8" stroke-width="2"/><circle cx="-6" cy="-10" r="3" fill="#ffc9a3"/><circle cx="7" cy="7" r="2.5" fill="#ffc9a3"/>${CRACKS.slice(0, crackCount)
        .map((d) => `<path d="${d}" stroke="#9c6a3e" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`)
        .join("")}</g>`;
  return `${glow}<path d="M-36 14Q0 38 36 14" stroke="#a8743f" stroke-width="13" fill="none" stroke-linecap="round"/>${egg}<path d="M-34 18Q0 32 34 18" stroke="#c98b5b" stroke-width="4" fill="none" stroke-linecap="round"/>`;
}

/** The end of the game: the chick hatches (or the egg sleeps on), with Pip beside it. */
function hatchScene(solved) {
  const chick = `<g class="bounce">
      <circle cx="-20" cy="18" r="30" fill="#ffe066"/>
      <path d="M-48 14Q-58 28 -44 34" stroke="#f5c518" stroke-width="6" fill="none" stroke-linecap="round"/>
      <circle cx="-30" cy="10" r="3.5" fill="#2e2a3b"/><circle cx="-10" cy="10" r="3.5" fill="#2e2a3b"/>
      <circle cx="-29" cy="8.5" r="1.2" fill="#fff"/><circle cx="-9" cy="8.5" r="1.2" fill="#fff"/>
      <path d="M-25 17L-15 17L-20 25Z" fill="#ff8a3d"/>
      <circle cx="-38" cy="21" r="3.5" fill="#ffb3c1"/><circle cx="-2" cy="21" r="3.5" fill="#ffb3c1"/>
      <path d="M-44 -6L-39 -15L-34 -7L-28 -17L-22 -7L-16 -16L-10 -7L-4 -13L-2 -2Q-20 -10 -44 0Z" fill="#fff4e0" stroke="#e8cba8" stroke-width="1.5"/>
      <path d="M-52 30L-45 22L-38 30L-31 22L-24 30L-17 22L-10 30L-3 22L4 30L10 25L10 46Q-21 62 -52 46Z" fill="#fff4e0" stroke="#e8cba8" stroke-width="1.5"/>
    </g>`;
  const sleeping = `<g class="egg-wobble"><ellipse cx="-20" cy="20" rx="24" ry="31" fill="#fff4e0" stroke="#e8cba8" stroke-width="2"/>
      <path d="M-31 16q3 3 6 0M-15 16q3 3 6 0" stroke="#9c6a3e" fill="none" stroke-width="2" stroke-linecap="round"/></g>
    <text class="zzz" x="8" y="-6" fill="#3e3a52" font-family="Fredoka, sans-serif" font-weight="700" font-size="16">z</text>
    <text class="zzz" x="16" y="-16" fill="#3e3a52" font-family="Fredoka, sans-serif" font-weight="700" font-size="12" style="animation-delay:.8s">z</text>`;
  return `<svg viewBox="-150 -40 300 150" aria-hidden="true">
    <path d="M-150 94C-60 82 40 86 150 74" stroke="#8a5a36" stroke-width="14" fill="none" stroke-linecap="round"/>
    <g transform="translate(34 0)">
      <ellipse cx="-20" cy="66" rx="56" ry="18" fill="#a8743f"/>
      ${solved ? chick : sleeping}
      <path d="M-72 60Q-20 82 32 60" stroke="#7a4e2e" stroke-width="4" fill="none" stroke-linecap="round"/>
    </g>
    <g transform="translate(118 44)">${pip({ cheer: solved })}</g>
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
  input.addEventListener("keydown", (e) => {
    const items = [...document.querySelectorAll("#suggestions li")];
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!items.length) return;
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items.forEach((li, i) => li.setAttribute("aria-selected", String(i === active)));
    } else if (e.key === "Escape") hideSuggestions();
  });
  input.addEventListener("blur", () => setTimeout(hideSuggestions, 150));
  $("#guess-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const items = [...document.querySelectorAll("#suggestions li")];
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

function showSuggestions() {
  const list = $("#suggestions");
  const found = suggest($("#guess").value, languages, 8, nodes);
  const typed = normalize($("#guess").value);
  active = found.length ? 0 : -1;
  list.innerHTML = found
    .map((l, i) => {
      // Why it's suggested, when the name doesn't say: another name, or the branch it's in.
      const other = l.aliases.find((a) => a.includes(typed));
      const branch = branchMatch(typed, l, nodes);
      const via = normalize(l.name).includes(typed) ? "" : other ? other.replace(/\b\w/g, (c) => c.toUpperCase()) : branch ? `in ${branch}` : "";
      return `<li role="option" data-id="${l.id}" aria-selected="${i === 0}"><span>${esc(l.name)}</span>${via ? `<span class="also">${esc(via)}</span>` : ""}</li>`;
    })
    .join("");
  for (const li of list.querySelectorAll("li")) li.addEventListener("mousedown", () => guess(byId.get(li.dataset.id)));
  list.hidden = !found.length;
  $("#guess").setAttribute("aria-expanded", String(!!found.length));
}

function hideSuggestions() {
  $("#suggestions").hidden = true;
  $("#guess").setAttribute("aria-expanded", "false");
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
  $("#counter").textContent = done ? "" : `${results.length} of ${MAX_GUESSES} guesses`;

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
