// Deep Cut in the browser: today's five prompts, the timer, saving progress
// on this device, Digby's dig back through Earth's history, the results and
// the stats. The rules live in game.js.
import { PERIODS, PROMPTS_PER_DAY, SECONDS_PER_PROMPT, compact, dayNumber, match, nearest, normalize, periodFor, promptsFor, shareText, stats } from "./game.js";

const $ = (sel) => document.querySelector(sel);
const STORE = "deepcut-v1";
const screens = ["loading", "intro", "prompt", "reveal", "results"];

let schedule;
let today;
let categories = new Map(); // id -> the category, loading (as needed)
let mode = "daily"; // or "practice"
let run; // { day?, ids, results: [{ id, prompt, guess, answer, depth, oneIn, perDay }], index, startedAt }
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
  return PERIODS.map((p, i) => {
    const range = i < PERIODS.length - 1 ? `${p.min}–${PERIODS[i + 1].min - 1}\u00a0m` : `${p.min}+\u00a0m`;
    const right = i === now ? `<svg viewBox="-34 -34 68 68" aria-hidden="true">${digby()}</svg>` : `<span>${now >= 0 && i === now + 1 ? `${p.min - total}\u00a0m to go` : range}</span>`;
    return `<div class="stratum${i === now ? " now" : ""}" style="--c:${LAYERS[i]}"><span>${p.name}${i === now ? " · you" : ""}</span>${right}</div>`;
  }).join("");
}

// The hillside on the reveal screen: one band per period, each the same
// height, so the thin deep periods aren't squeezed. Within a band, depth is
// linear; the last band shows 40 m.
const SCENE_TOP = 40;
const BAND = 72;
const SCENE_H = SCENE_TOP + PERIODS.length * BAND;
const SHAFT_X = 150;
const SIGN_X = SHAFT_X + 24;
const SIGN_CHARS = 30; // what fits on a signpost between the tunnel and the edge
const bandEnd = (i) => (i < PERIODS.length - 1 ? PERIODS[i + 1].min : PERIODS[i].min + 40);
function yAt(m) {
  const i = Math.max(0, PERIODS.findLastIndex((p) => m >= p.min));
  const share = Math.min(1, (m - PERIODS[i].min) / (bandEnd(i) - PERIODS[i].min));
  return SCENE_TOP + (i + share) * BAND;
}
const ridge = (y) => `M0 ${y}Q32 ${y - 7} 65 ${y}T130 ${y}T195 ${y}T260 ${y}T325 ${y}T390 ${y}L390 ${SCENE_H}L0 ${SCENE_H}Z`;
const shaft = (y1, y2) => `M${SHAFT_X} ${y1}C${SHAFT_X - 9} ${y1 + (y2 - y1) / 3} ${SHAFT_X + 9} ${y1 + (2 * (y2 - y1)) / 3} ${SHAFT_X} ${y2}`;

// A fossil for each period, drawn around (0, 0), about 40 px across.
const FOSSILS = [
  // Holocene: a worm in the topsoil.
  '<g class="worm"><path d="M-20 2q10-10 20 0t20 0" stroke="#ff9aae" fill="none" stroke-width="9" stroke-linecap="round"/><circle cx="21" cy="0" r="1.6" fill="#2e2a3b"/></g>',
  // Pleistocene: a mammoth's tusk.
  '<path d="M-22 10C-20 -14 8 -20 22 -6C10 -12 -6 -8 -12 12Z" fill="#fff8ec" stroke="#cdbb9f" stroke-width="1.5"/>',
  // Cretaceous: an ammonite.
  '<circle r="17" fill="#c9a76b"/><path d="M0 0m0-3a3 3 0 1 1-3 3a6 6 0 1 1 6 6a10 10 0 1 1-10-10a14 14 0 1 1 14 14" stroke="#8a6a3a" fill="none" stroke-width="2.4" stroke-linecap="round"/>',
  // Jurassic: a dinosaur bone.
  '<g transform="rotate(-18)"><rect x="-22" y="-4" width="44" height="8" rx="4" fill="#efe6d8"/><circle cx="-22" cy="-5" r="5" fill="#efe6d8"/><circle cx="-22" cy="5" r="5" fill="#efe6d8"/><circle cx="22" cy="-5" r="5" fill="#efe6d8"/><circle cx="22" cy="5" r="5" fill="#efe6d8"/></g>',
  // Permian: a fern.
  '<path d="M-14 18Q0 0 14 -18" stroke="#3f6b3a" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M-9 12l-8 -3M-4 6l-8 -4M1 0l-7 -5M6 -6l-6 -5M10 -12l-5 -4M-9 12l3 8M-4 6l5 7M1 0l7 5M6 -6l7 3M10 -12l6 1" stroke="#5b8f4a" stroke-width="2.5" stroke-linecap="round"/>',
  // Cambrian: a trilobite.
  '<ellipse rx="13" ry="18" fill="#cfc4e8"/><path d="M-13 -6h26M-13 0h26M-12 6h24M-10 12h20" stroke="#8e80b8" stroke-width="2"/><path d="M-4 -18v36M4 -18v36" stroke="#8e80b8" stroke-width="1.6"/><path d="M-12 -12Q0 -26 12 -12" fill="#b9acd9"/>',
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
  const now = periodFor(after).index;
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
      const y = Math.min(SCENE_H - 14, Math.max(at, lastY + 24)); // nudged apart when they'd overlap
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
  return `<svg viewBox="0 0 390 ${SCENE_H}" role="img" aria-label="Digby has dug ${after} metres down, into the ${PERIODS[now].name}.">
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
  const p = periodFor(total);
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
    run = { day: today, ids: answered.map((r) => r.id), results: answered, index: PROMPTS_PER_DAY };
    showResults();
  } else if (answered.length || saved?.startedAt) {
    // Back mid-game, even mid-prompt: pick up where it was, with the clock still running.
    run = { day: today, ids: [...answered.map((r) => r.id), ...ids.slice(answered.length)], results: answered, index: answered.length, startedAt: saved.startedAt };
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
  $("#strata-key").innerHTML = strata();
  $("#start").textContent = `Start Deep Cut #${today}`;
  $("#practice-start").hidden = !PRACTICE_FOR_ALL;
  show("intro");
}

function wire() {
  $("#start").addEventListener("click", async () => {
    mode = "daily";
    run = { day: today, ids: promptsFor(today, schedule), results: [], index: 0 };
    await showPrompt();
  });
  const input = $("#guess");
  // A near miss asks "Did you mean ...?": tap an answer, or press Enter again
  // to take the first. Typing something else drops the question.
  input.addEventListener("input", () => {
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
  $("#prompt-count").textContent = `Any of ${fmt(c.answers.length)} answers counts`;
  $("#feedback").textContent = "";
  $("#guess").value = "";
  $("#digby-status").innerHTML = digbyStatus(totalOf(run.results));
  run.locked = false;
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
  const c = await category(run.ids[run.index]);
  const found = match(text, c.answers, c);
  if (!found) {
    // Close but not close enough to count on its own: ask.
    const near = nearest(text, c.answers, c);
    offered = near.length ? { typed: normalize(text), answers: near } : null;
    const fixes = near.map((a, i) => `<button type="button" class="fix" data-i="${i}">${esc(a.name)}</button>`);
    const list = fixes.length > 1 ? `${fixes.slice(0, -1).join(", ")} or ${fixes.at(-1)}` : fixes[0];
    $("#feedback").innerHTML = near.length
      ? `Did you mean ${list}?<span class="fix-hint">${near.length > 1 ? "Tap one, or press Enter for the first." : "Tap it, or press Enter."}</span>`
      : `“${esc(text.trim())}” isn't on our list. Keep digging.`;
    $("#feedback").classList.toggle("ask", near.length > 0);
    $("#feedback").classList.remove("ok");
    if (near.length) return; // not wrong, just not sure: no shake, and the spelling stays to fix
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
  run.startedAt = null;
  run.index++;
  if (mode === "daily") {
    const done = run.index >= PROMPTS_PER_DAY;
    const total = totalOf(run.results);
    save((s) => {
      (s.days ??= {})[run.day] = { results: run.results, done };
      if (done) (s.history ??= {})[run.day] = total;
    });
  }
  await showReveal(await category(id), run.results.at(-1));
}

async function showReveal(c, result) {
  $("#reveal-prompt").textContent = c.prompt;
  $("#reveal-answer").textContent = result.answer ?? "Nothing this time";
  $("#reveal-answer").classList.toggle("missed", !result.answer);
  const top = c.answers[0];
  if (result.answer) {
    $("#reveal-one-in").innerHTML = `1 in <strong>${fmt(result.oneIn)}</strong>`;
    $("#reveal-note").innerHTML =
      `About <strong>${fmt(result.perDay)}</strong> ${result.perDay === 1 ? "person reads" : "people read"} its Wikipedia page a day, out of ${fmt(c.readers)} reading all ${fmt(c.answers.length)} answers' pages.` +
      (top.name === result.answer ? " It's the most read of them all." : ` The most read, ${esc(top.name)}, gets ${fmt(top.perDay)}.`);
  } else {
    $("#reveal-one-in").innerHTML = "";
    $("#reveal-note").textContent = `${fmt(c.answers.length)} answers would have counted. Here are a few.`;
  }
  $("#reveal-one-in").hidden = !result.answer;
  const row = (a) => `<li><span>${esc(a.name)}</span>${oneInTag(a)}</li>`;
  $("#surface").innerHTML = c.answers.slice(0, 3).map(row).join("");
  $("#deepest").innerHTML = c.answers.slice(-3).reverse().map(row).join("");
  $("#next").textContent = run.index >= run.ids.length ? "See how deep we went" : "Next prompt";

  const after = totalOf(run.results);
  const before = after - result.depth;
  const p = periodFor(after);
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
  $("#next").focus();
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
  if (run.index >= run.ids.length) return showResults();
  await showPrompt();
}

// ---------------------------------------------------------------------------
// Results, sharing and stats

const shareUrl = () => location.href.split(/[?#]/)[0];

async function showResults() {
  const total = totalOf(run.results);
  const daily = mode === "daily";
  const p = periodFor(total);
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
  const s = stats(load().history ?? {}, today);
  const stat = (n, label, wide = false) => `<div class="stat${wide ? " wide" : ""}"><strong>${n}</strong><span>${label}</span></div>`;
  $("#stats-grid").innerHTML = [
    stat(s.played, "Played"),
    stat(s.streak, "Streak"),
    stat(s.bestStreak, "Best streak"),
    stat(`${s.average}\u00a0m`, "Average", true),
    stat(`${s.deepest}\u00a0m`, s.played ? `Deepest, in the ${periodFor(s.deepest).name}` : "Deepest", true),
  ].join("");
  $("#stats").showModal();
}

// ---------------------------------------------------------------------------
// Practice: random prompts, nothing saved

async function startPractice() {
  mode = "practice";
  if (deck.length < PROMPTS_PER_DAY) {
    const index = await (await fetch("data/index.json")).json();
    const fresh = index.map((c) => c.id).filter((id) => !deck.includes(id));
    for (let i = fresh.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [fresh[i], fresh[j]] = [fresh[j], fresh[i]];
    }
    deck = [...deck, ...fresh];
  }
  run = { ids: deck.splice(0, PROMPTS_PER_DAY), results: [], index: 0 };
  $("#day-label").textContent = "Practice round · doesn't count";
  await showPrompt();
}

init();
