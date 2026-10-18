// Ten Numbers in the browser: today's ten questions, guessing in metric or US
// units, Nutmeg's acorns and jar, the results, sharing, stats and practice
// rounds. The rules live in game.js.
import { MAX_POINTS, MAX_YEARS, QUESTIONS_PER_DAY, SIZES, TIERS, UNITS, dayNumber, formatAmount, formatNumber, hasEra, hasSize, howClose, parseGuess, points, questionsFor, ranges, shareText, sizeOf, stats, tierFor, verdict } from "./game.js";

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
const STORE = "tennumbers-v1";
const screens = ["loading", "intro", "question", "reveal", "results"];
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

let questions; // id -> question
let schedule;
let today;
let mode = "daily"; // or "practice"
let run; // { day?, ids, results: [{ id, guess, points }], index }
// For now anyone can play unlimited practice rounds, which is handy for testing.
// Later, practice can be the supporter unlock: set this to false to hide it.
const PRACTICE_FOR_ALL = true;
let deck = []; // practice questions still to come, shuffled, so rounds don't repeat
let units = "metric"; // or "us": how lengths and areas are typed and shown
let size = null; // a size picked under the box ("million"), if any
let era = "AD"; // for years: BC makes a plain number a year before Christ

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
// Nutmeg, her acorns and her jar

/** Nutmeg the squirrel, drawn around (0, 0) in a -44 -44 88 88 box. */
function nutmeg({ wave = false, cheer = false } = {}) {
  const eyes = cheer
    ? '<path d="M5 -10q3-3 6 0M14 -10q3-3 6 0" stroke="#2e2a3b" fill="none" stroke-width="2" stroke-linecap="round"/>'
    : '<circle cx="7" cy="-10" r="2.6" fill="#2e2a3b"/><circle cx="17" cy="-10" r="2.6" fill="#2e2a3b"/><circle cx="7.8" cy="-11" r=".9" fill="#fff"/><circle cx="17.8" cy="-11" r=".9" fill="#fff"/>';
  const paws = cheer
    ? '<ellipse class="wave" cx="-4" cy="2" rx="4" ry="3" fill="#c9772f"/><ellipse class="wave" cx="28" cy="2" rx="4" ry="3" fill="#c9772f" style="animation-delay:.25s"/>'
    : `<ellipse cx="3" cy="14" rx="4" ry="3" fill="#c9772f"/>${wave ? '<ellipse class="wave" cx="27" cy="2" rx="4" ry="3" fill="#c9772f"/>' : '<ellipse cx="17" cy="14" rx="4" ry="3" fill="#c9772f"/>'}`;
  return `<path class="tail" d="M-4 30C-38 34 -44 -6 -26 -22C-14 -32 4 -28 0 -16C-4 -6 -20 -8 -18 4C-16 14 -8 18 -4 30Z" fill="#c9772f"/>
    <path d="M-10 22C-30 20 -34 -4 -22 -14" stroke="#e9a35f" stroke-width="4" fill="none" stroke-linecap="round" opacity=".7"/>
    <g class="bob">
      <ellipse cx="10" cy="16" rx="16" ry="18" fill="#d98a3a"/>
      <ellipse cx="11" cy="20" rx="9" ry="11" fill="#f6d7a8"/>
      <path d="M2 -18L3 -32L11 -21Z" fill="#d98a3a"/><path d="M4 -20L5 -28L9 -21Z" fill="#f6b8a0"/>
      <path d="M15 -21L23 -32L23 -18Z" fill="#d98a3a"/><path d="M17 -21L21.5 -28L21.5 -20Z" fill="#f6b8a0"/>
      <circle cx="12" cy="-8" r="14" fill="#d98a3a"/>
      <ellipse cx="12" cy="-2" rx="8" ry="6" fill="#f6d7a8"/>
      ${eyes}
      <ellipse cx="12" cy="-4" rx="2.4" ry="1.8" fill="#6b3f2a"/>
      <path d="M9 -1q3 2.5 6 0" stroke="#6b3f2a" fill="none" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="3" cy="-3" r="2.6" fill="#ffb3c1"/><circle cx="21" cy="-3" r="2.6" fill="#ffb3c1"/>
      <g transform="translate(10 15)"><ellipse cx="0" cy="3" rx="6" ry="7" fill="#c98b5b"/><path d="M-6 0Q0 -6 6 0Q0 2 -6 0Z" fill="#7a4e2e"/></g>
      ${paws}
      <ellipse cx="2" cy="33" rx="6" ry="3" fill="#c9772f"/><ellipse cx="18" cy="33" rx="6" ry="3" fill="#c9772f"/>
    </g>`;
}

const ACORN = '<ellipse cx="10" cy="15" rx="7" ry="8" fill="#c98b5b"/><path d="M2 10Q10 1 18 10Q10 13 2 10Z" fill="#7a4e2e"/><rect x="9" y="1.5" width="2" height="5" rx="1" fill="#7a4e2e"/>';
const acorn = (cls = "", style = "") => `<svg class="${cls}" viewBox="0 0 20 24" aria-hidden="true"${style ? ` style="${style}"` : ""}>${ACORN}</svg>`;

const GLASS = "M22 34Q22 26 30 26H70Q78 26 78 34V104Q78 116 66 116H34Q22 116 22 104Z";
/** Nutmeg's jar, in a 0 0 100 124 box, filled to `share` (0 to 1). `id` keeps two jars on one page apart. */
function jar(id, share) {
  return `<defs><clipPath id="${id}-glass"><path d="${GLASS}"/></clipPath>
      <pattern id="${id}-nuts" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#e8b27a"/><ellipse cx="8" cy="10" rx="5" ry="5.5" fill="#c98b5b"/><path d="M3 7Q8 1 13 7Q8 9 3 7Z" fill="#7a4e2e"/></pattern></defs>
    <path d="${GLASS}" fill="#ffffff" fill-opacity=".55"/>
    <g clip-path="url(#${id}-glass)"><g class="jar-fill" style="transform:translateY(${(90 * (1 - share)).toFixed(1)}px)"><rect x="22" y="26" width="56" height="90" fill="url(#${id}-nuts)"/></g></g>
    <path d="${GLASS}" fill="none" stroke="#2e2a3b" stroke-width="3"/>
    <path d="M31 42V98" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity=".7"/>
    <rect x="25" y="14" width="50" height="12" rx="4" fill="#a8743f"/><rect x="25" y="22" width="50" height="4" fill="#7a4e2e"/>`;
}

const TIER_COLORS = ["#e8d6c2", "#d9b08a", "#c98b5b", "#a8743f", "#ffb938"];
/** The tiers, with `current` marked: an acorn each, bigger as they go. */
function tierList(current = -1, total = 0) {
  return TIERS.map((t, i) => {
    const range = i < TIERS.length - 1 ? `${t.min}–${TIERS[i + 1].min - 1}` : `${t.min}+`;
    const right = i === current ? "you" : current >= 0 && i === current + 1 ? `${t.min - total} to go` : `${range} acorns`;
    return `<div class="tier${i === current ? " now" : ""}"><svg viewBox="0 0 20 24" aria-hidden="true" style="transform:scale(${0.75 + i * 0.07})"><ellipse cx="10" cy="15" rx="7" ry="8" fill="${TIER_COLORS[i]}"/><path d="M2 10Q10 2 18 10Q10 13 2 10Z" fill="#7a4e2e"/></svg><b>${t.name}</b><span>${right}</span></div>`;
  }).join("");
}

// ---------------------------------------------------------------------------
// Units

const hasAlt = (q) => Boolean(UNITS[q.unit].alt);
const shownUnitLabel = (q) => (units === "us" && hasAlt(q) ? UNITS[q.unit].alt.label : UNITS[q.unit].label);
/** A value in the player's units. */
const show = (value, q) => formatAmount(value, q.unit, { alt: units === "us" && hasAlt(q) });
/** The same value in the other units, if there are any: "(29,032 ft)". */
const showOther = (value, q) => (hasAlt(q) ? `(${formatAmount(value, q.unit, { alt: units !== "us" })})` : "");

// ---------------------------------------------------------------------------
// The number line on the reveal: where the guess landed, and the answer

function numberLine(q, guess) {
  const L = 22;
  const W = 296;
  // The line runs out where guesses stop earning acorns; the green band earns 7 or more.
  const { zero, good } = ranges(q);
  const [lo, hi] = zero;
  const year = q.unit === "year";
  const pos = year ? (v) => L + (W * (v - lo)) / (hi - lo) : (v) => L + (W * (Math.log10(v) - Math.log10(lo))) / (Math.log10(hi) - Math.log10(lo));
  const band = good;
  const ends = year ? [formatAmount(Math.ceil(lo), "year"), formatAmount(Math.floor(hi), "year")] : [show(lo, q), show(hi, q)];
  const clamp = (x) => Math.min(L + W, Math.max(L, x));
  const ax = pos(q.answer);
  const [b1, b2] = band.map((v) => clamp(pos(Math.max(v, 1e-9))));
  let marker = "";
  if (guess !== null) {
    const raw = guess > 0 || q.unit === "year" ? pos(guess) : -Infinity;
    const gx = clamp(raw);
    const off = raw < L ? "◀ " : raw > L + W ? " ▶" : "";
    const label = `${raw < L ? off : ""}You: ${show(guess, q)}${raw > L + W ? off : ""}`;
    marker = `<g transform="translate(${gx.toFixed(1)} 0)"><g class="nl-acorn" style="--from:${(-gx).toFixed(0)}px"><g transform="translate(-10 58)">${ACORN}</g></g></g>
      <text class="nl-mark" x="${Math.min(L + W - 40, Math.max(L + 40, gx)).toFixed(1)}" y="122" text-anchor="middle">${esc(label)}</text>`;
  }
  return `<svg viewBox="0 0 340 132" role="img" aria-label="The answer is ${esc(show(q.answer, q))}${guess !== null ? `; you guessed ${esc(show(guess, q))}` : ""}.">
    <rect x="${b1.toFixed(1)}" y="64" width="${(b2 - b1).toFixed(1)}" height="28" rx="8" fill="#dff3d9"/>
    <text class="nl-label" x="${((b1 + b2) / 2).toFixed(1)}" y="101" text-anchor="middle">7+ acorns</text>
    <path d="M${L} 82H${L + W}" stroke="#2e2a3b" stroke-width="3" stroke-linecap="round"/>
    <text class="nl-label" x="${L}" y="101" text-anchor="start">${esc(ends[0])}</text>
    <text class="nl-label" x="${L + W}" y="101" text-anchor="end">${esc(ends[1])}</text>
    <g class="nl-flag"><path d="M${ax.toFixed(1)} 82V30" stroke="#7a4e2e" stroke-width="3" stroke-linecap="round"/><path d="M${(ax + 1).toFixed(1)} 31l22 7l-22 7Z" fill="#ff6f61"/></g>
    <text class="nl-mark" x="${Math.min(L + W - 44, Math.max(L + 44, ax)).toFixed(1)}" y="20" text-anchor="middle">${esc(show(q.answer, q))}</text>
    ${marker}
  </svg>`;
}

// ---------------------------------------------------------------------------
// Screens

function showScreen(name) {
  for (const s of screens) $(`#${s}`).hidden = s !== name;
  window.scrollTo(0, 0);
}

const totalOf = (results) => results.reduce((n, r) => n + r.points, 0);

async function init() {
  wire();
  for (const svg of document.querySelectorAll("[data-nutmeg]")) svg.innerHTML = nutmeg({ wave: svg.dataset.nutmeg === "wave", cheer: svg.dataset.nutmeg === "cheer" });
  units = load().units ?? (navigator.language === "en-US" ? "us" : "metric");
  today = dayNumber();
  try {
    const [list, days] = await Promise.all([fetch("data/questions.json").then((r) => r.json()), fetch("data/schedule.json").then((r) => r.json())]);
    questions = new Map(list.map((q) => [q.id, q]));
    schedule = days;
  } catch {
    $("#loading").innerHTML = "<p>Ten Numbers couldn't load today's questions. Try refreshing the page.</p>";
    return;
  }
  $("#day-label").textContent = `#${today} · ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;
  // A game already started keeps its questions, even if the schedule was rebuilt since.
  const saved = load().days?.[today];
  const ids = saved?.ids?.length === QUESTIONS_PER_DAY && saved.ids.every((id) => questions.has(id)) ? saved.ids : null;
  if (ids && saved.done) {
    run = { day: today, ids, results: saved.results, index: QUESTIONS_PER_DAY };
    showResults();
  } else if (ids && saved.results?.length) {
    run = { day: today, ids, results: saved.results, index: saved.results.length };
    showQuestion();
  } else {
    showIntro();
  }
}

function showIntro() {
  // A worked example from today's data, scored by the real rules.
  const q = questions.get("country-people-Q142") ?? [...questions.values()].find((x) => x.kind === "country-people");
  const round = (v) => Number(v.toPrecision(2));
  const tries = [round(q.answer * 0.97), round(q.answer * 0.72), round(q.answer * 2.4)].map((g) => ({ g, p: points(g, q) }));
  $("#example").innerHTML = `<p class="muted small">For example: ${esc(q.text.charAt(0).toLowerCase() + q.text.slice(1))}</p><p class="example-answer">${esc(show(q.answer, q))}</p>${tries
    .map(({ g, p }) => `<div class="example-row"><span>${esc(show(g, q))} <span class="muted">${esc(howClose(g, q))}</span></span><b>${p}</b>${acorn("", "width:18px;height:22px")}</div>`)
    .join("")}`;
  $("#tier-key").innerHTML = tierList();
  $("#start").textContent = `Start Ten Numbers #${today}`;
  $("#practice-start").hidden = !PRACTICE_FOR_ALL;
  showScreen("intro");
}

function wire() {
  $("#start").addEventListener("click", () => {
    mode = "daily";
    run = { day: today, ids: questionsFor(today, schedule), results: [], index: 0 };
    track("start", { game: "ten-numbers", mode, day: today });
    showQuestion();
  });
  $("#guess-form").addEventListener("submit", (e) => {
    e.preventDefault();
    submitGuess();
  });
  $("#skip").addEventListener("click", () => finishQuestion(null));
  $("#next").addEventListener("click", next);
  $("#share").addEventListener("click", share);
  $("#practice").addEventListener("click", startPractice);
  $("#practice-start").addEventListener("click", startPractice);
  $("#back-today").addEventListener("click", () => location.reload()); // today's game is saved
  $("#help-button").addEventListener("click", () => $("#help").showModal());
  $("#stats-button").addEventListener("click", showStats);
  $("#unit-metric").addEventListener("click", () => setUnits("metric"));
  $("#unit-us").addEventListener("click", () => setUnits("us"));
  $("#guess").addEventListener("input", showReading);
  // The size and BC buttons keep the box focused, so a phone's keyboard stays up.
  for (const id of ["#sizes", "#era"]) $(id).addEventListener("pointerdown", (e) => e.target.closest("button") && e.preventDefault());
  $("#sizes").addEventListener("click", (e) => {
    const button = e.target.closest("button");
    if (!button) return;
    size = size === button.dataset.size ? null : button.dataset.size;
    for (const b of $("#sizes").children) b.setAttribute("aria-pressed", String(b.dataset.size === size));
    showReading();
  });
  $("#era").addEventListener("click", (e) => {
    const button = e.target.closest("button");
    if (!button) return;
    era = button.dataset.era;
    for (const b of $("#era").children) b.setAttribute("aria-pressed", String(b.dataset.era === era));
    showReading();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !$("#reveal").hidden && document.activeElement?.tagName !== "BUTTON") next();
  });
}

function setUnits(choice) {
  units = choice;
  save((s) => (s.units = choice));
  const q = current();
  if (q) labelUnits(q);
  showReading();
  $("#guess").focus();
}

/** The buttons under the box for this question: units, sizes or the era. */
function showHelpers(q) {
  size = null;
  era = "AD";
  const sizes = SIZES[q.unit] ?? [];
  $("#sizes").innerHTML = sizes.map((w) => `<button type="button" data-size="${w}" aria-pressed="false">${w}</button>`).join("");
  $("#sizes").hidden = !sizes.length;
  $("#era").hidden = q.unit !== "year";
  for (const b of $("#era").children) b.setAttribute("aria-pressed", String(b.dataset.era === era));
  $(".helpers").hidden = $("#unit-toggle").hidden && $("#sizes").hidden && $("#era").hidden;
}

/** What the box says, as a number in the answer's own unit (meters even if typed in feet), or null. */
function reading() {
  const q = current();
  const typed = $("#guess").value;
  if (!q || !typed.trim()) return null;
  if (q.unit === "year") {
    const year = parseGuess(typed, "year");
    return year !== null && era === "BC" && !hasEra(typed) ? -Math.abs(year) : year;
  }
  const alt = units === "us" && hasAlt(q);
  const unit = alt ? "count" : q.unit;
  let value = parseGuess(typed, unit);
  if (value === null) return null;
  if (size && !hasSize(typed, unit)) value *= sizeOf(size);
  return alt ? value / UNITS[q.unit].alt.factor : value;
}

const hintFor = (q) =>
  q.unit === "year" ? "Type a year, like 1969. Before Christ? Pick BC." : SIZES[q.unit] ? "Type it however you like: 15,000, 15k, 2.5 million. Or type 2.5 and pick million." : "Type a number.";

/** Under the box: how to type it, or what's typed so far, read back ("That's 2.5 million people"). */
function showReading() {
  const q = current();
  if (!q) return;
  const typed = $("#guess").value.trim();
  const value = reading();
  const readable = value !== null && (q.unit === "year" || value > 0);
  $("#unit-note").classList.toggle("reading", Boolean(typed && readable));
  $("#unit-note").textContent = !typed ? hintFor(q) : readable ? `That's ${show(value, q)}` : "That isn't a number we can read yet.";
}

const current = () => (run && run.index < run.ids.length ? questions.get(run.ids[run.index]) : null);

function labelUnits(q) {
  const label = shownUnitLabel(q);
  $("#unit-label").textContent = label;
  $(".answer-box").classList.toggle("with-unit", Boolean(label));
  $("#unit-toggle").hidden = !hasAlt(q);
  if (hasAlt(q)) {
    $("#unit-metric").textContent = UNITS[q.unit].label;
    $("#unit-us").textContent = UNITS[q.unit].alt.label;
    $("#unit-metric").setAttribute("aria-pressed", String(units !== "us"));
    $("#unit-us").setAttribute("aria-pressed", String(units === "us"));
  }
}

function showQuestion() {
  const q = current();
  $("#progress").innerHTML = run.ids
    .map((_, i) => {
      const r = run.results[i];
      return `<li class="${i === run.index ? "now" : ""}">${r ? acorn("", r.points >= 5 ? "" : "opacity:.35;filter:grayscale(1)") : ""}</li>`;
    })
    .join("");
  const total = totalOf(run.results);
  $("#mini-jar").innerHTML = jar("mini", total / (QUESTIONS_PER_DAY * MAX_POINTS));
  $("#running-total").textContent = total;
  $("#question-topic").textContent = `${q.topic} · ${run.index + 1} of ${run.ids.length}`;
  $("#question-text").textContent = q.text;
  labelUnits(q);
  showHelpers(q);
  $("#guess").value = "";
  showReading();
  $("#guess").inputMode = q.unit === "year" ? "numeric" : "decimal";
  $("#feedback").textContent = "";
  run.locked = false;
  showScreen("question");
  $("#guess").focus();
}

function submitGuess() {
  const q = current();
  if (!q || run.locked) return;
  const typed = $("#guess").value;
  const value = reading();
  if (value === null || (q.unit !== "year" && value <= 0)) {
    $("#feedback").textContent = typed.trim() ? `“${typed.trim()}” isn't a number we can read. Try 1500, 1.5k or 2.5 million.` : "Type a number first.";
    $("#guess-form").classList.remove("shake");
    void $("#guess-form").offsetWidth; // restart the animation
    $("#guess-form").classList.add("shake");
    return;
  }
  finishQuestion(value);
}

function finishQuestion(guess) {
  const q = current();
  if (!q || run.locked) return;
  run.locked = true;
  const result = { id: q.id, guess, points: guess === null ? 0 : points(guess, q) };
  run.results.push(result);
  run.index++;
  if (mode === "daily") {
    const done = run.index >= QUESTIONS_PER_DAY;
    save((s) => {
      (s.days ??= {})[run.day] = { ids: run.ids, results: run.results, done };
      if (done) (s.history ??= {})[run.day] = totalOf(run.results);
    });
  }
  showReveal(q, result);
}

function showReveal(q, r) {
  $("#reveal-question").textContent = q.text;
  $("#reveal-answer").textContent = show(q.answer, q);
  $("#reveal-alt").textContent = showOther(q.answer, q);
  $("#reveal-guess").innerHTML = r.guess === null ? "You skipped this one." : `You guessed <strong>${esc(show(r.guess, q))}</strong>: ${esc(howClose(r.guess, q))}.`;
  $("#number-line").innerHTML = numberLine(q, r.guess);
  $("#reveal-verdict").textContent = r.guess === null ? "Skipped" : verdict(r.points);
  $("#reveal-points").textContent = "0";
  $("#acorns").innerHTML = Array.from({ length: MAX_POINTS }, (_, i) => (i < r.points ? acorn("won", `animation-delay:${0.7 + i * 0.08}s`) : acorn("empty"))).join("");
  $("#reveal-source").innerHTML = `${esc(q.subject)}: ${esc(show(q.answer, q))}${q.asOf ? ` (${q.asOf})` : ""}, from ${q.source ?? "Wikidata"}. <a href="https://en.wikipedia.org/wiki/${encodeURIComponent(q.wiki)}" target="_blank" rel="noopener">Read about it on Wikipedia</a>`;
  $("#next").textContent = run.index >= run.ids.length ? "See your acorns" : "Next question";
  showScreen("reveal");
  countUp($("#reveal-points"), r.points, 900, 0, 700);
  $("#next").focus();
}

function countUp(el, to, ms = 900, from = 0, delay = 0) {
  el.textContent = from;
  const begin = performance.now() + delay;
  const step = (t) => {
    const p = Math.min(1, Math.max(0, (t - begin) / ms));
    el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function next() {
  if (run.index >= run.ids.length) {
    const total = totalOf(run.results);
    track("finish", { game: "ten-numbers", mode, ...(mode === "daily" ? { day: run.day } : {}), acorns: total, tier: tierFor(total).name });
    return showResults();
  }
  showQuestion();
}

// ---------------------------------------------------------------------------
// Results, sharing and stats

function showResults() {
  const total = totalOf(run.results);
  const daily = mode === "daily";
  const t = tierFor(total);
  $("#results-label").textContent = daily ? `Ten Numbers #${run.day}` : "Practice round";
  $("#big-jar").innerHTML = jar("big", 0);
  $("#tier-name").textContent = t.name;
  countUp($("#total"), total, 1200);
  const s = stats(load().history ?? {}, today);
  $("#total-note").textContent = !daily ? "Practice rounds don't count toward your stats." : s.played > 1 ? `Your average is ${s.average}. Streak: ${s.streak} day${s.streak === 1 ? "" : "s"}.` : "";
  $("#tier-ladder").innerHTML = tierList(t.index, total);
  $("#summary").innerHTML = run.results
    .map((r) => {
      const q = questions.get(r.id);
      const detail = r.guess === null ? `Skipped · answer ${show(q.answer, q)}` : `You: ${show(r.guess, q)} · answer ${show(q.answer, q)}`;
      return `<li><span class="s-question">${esc(q.text)}</span><span class="s-detail">${esc(detail)}</span><span class="s-points${r.points >= 8 ? " great" : ""}">${r.points}</span></li>`;
    })
    .join("");
  $("#share").hidden = !daily;
  $("#share-note").textContent = "";
  $(".next-in").hidden = !daily;
  $("#practice").textContent = daily ? "Keep guessing (practice)" : "Another practice round";
  $("#practice").hidden = !PRACTICE_FOR_ALL;
  $("#back-today").hidden = daily;
  showScreen("results");
  // Fill the jar.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const fill = $("#big-jar .jar-fill");
      if (fill) fill.style.transform = `translateY(${(90 * (1 - total / (QUESTIONS_PER_DAY * MAX_POINTS))).toFixed(1)}px)`;
    }),
  );
  if (daily) countdown();
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
  track("share", { game: "ten-numbers", day: run.day });
  const text = shareText(run.day, run.results, location.href.split(/[?#]/)[0]);
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
  const s = stats(load().history ?? {}, today);
  const stat = (n, label) => `<div class="stat"><strong>${n}</strong><span>${label}</span></div>`;
  $("#stats-grid").innerHTML = [
    stat(s.played, "Played"),
    stat(s.average || "–", "Average"),
    stat(s.best || "–", "Best day"),
    stat(s.streak, "Streak"),
    stat(s.bestStreak, "Best streak"),
    stat(formatNumber(Object.values(load().history ?? {}).reduce((n, t) => n + t, 0)), "Acorns ever"),
  ].join("");
  $("#stats").showModal();
}

// ---------------------------------------------------------------------------
// Practice: random questions, nothing saved

function startPractice() {
  mode = "practice";
  track("start", { game: "ten-numbers", mode });
  // Mixed like a day: ten kinds, at most five of them years. The deck is
  // shuffled once and dealt from, so rounds don't repeat questions.
  const pick = () => {
    const ids = [];
    const kinds = new Set();
    let years = 0;
    for (const id of deck) {
      const q = questions.get(id);
      if (kinds.has(q.kind) || (q.unit === "year" && years >= MAX_YEARS)) continue;
      ids.push(id);
      kinds.add(q.kind);
      if (q.unit === "year") years++;
      if (ids.length === QUESTIONS_PER_DAY) break;
    }
    return ids.length === QUESTIONS_PER_DAY ? ids : null;
  };
  let ids = pick();
  if (!ids) {
    const fresh = [...questions.keys()].filter((id) => !deck.includes(id));
    for (let i = fresh.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [fresh[i], fresh[j]] = [fresh[j], fresh[i]];
    }
    deck = [...deck, ...fresh];
    ids = pick();
  }
  deck = deck.filter((id) => !ids.includes(id));
  run = { ids, results: [], index: 0 };
  $("#day-label").textContent = "Practice round · doesn't count";
  showQuestion();
}

init();
