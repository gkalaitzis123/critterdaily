// A player's history, drawn: how their finished days spread over a game's
// tiers, a calendar of the last few weeks, and the home page's line under
// each game (today's result and the streak). Every game's day 1 is the same
// date, so day numbers line up across them. Published next to each page (see
// ../scripts/publish-site.mjs).

const LAUNCH = [2026, 9, 17]; // day 1, local time, in every game
const dateOf = (day) => new Date(LAUNCH[0], LAUNCH[1], LAUNCH[2] + day - 1);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Whether a "#rrggbb" color is dark enough to need light text on it. */
const isDark = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.45;
};

/** Today's day number, by the player's own calendar. */
export function dayToday(date = new Date()) {
  const start = Date.UTC(...LAUNCH);
  return Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - start) / 86400000) + 1;
}

/** One bar per tier for how many days landed there: rows are { label, count, color }; `now` marks today's. */
export function tierBars(rows, now = -1) {
  const most = Math.max(1, ...rows.map((r) => r.count));
  const bars = rows
    .map(
      (r, i) => `<div class="tier-bar${i === now ? " now" : ""}">
        <span class="tier-bar-label">${esc(r.label)}${i === now ? " · today" : ""}</span>
        <span class="tier-bar-track"><span class="tier-bar-fill" style="width:${r.count ? Math.max(4, (r.count / most) * 100) : 0}%;background:${r.color}"></span></span>
        <span class="tier-bar-count">${r.count}</span>
      </div>`,
    )
    .join("");
  return `<div class="tier-bars">${bars}</div>`;
}

/**
 * The last `weeks` weeks, Monday to Sunday, with each finished day colored by
 * `colorOf(day)` (null for days not played) and today outlined.
 */
export function calendar(colorOf, today, weeks = 5) {
  const sinceMonday = (dateOf(today).getDay() + 6) % 7;
  const first = today - sinceMonday - 7 * (weeks - 1);
  let played = 0;
  const cells = [];
  for (let d = first; d < first + 7 * weeks; d++) {
    const color = d >= 1 && d <= today ? colorOf(d) : null;
    if (color) played++;
    const when = dateOf(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    cells.push(`<span class="cal-day${color ? " played" : ""}${color && isDark(color) ? " deep" : ""}${d === today ? " today" : ""}${d < 1 || d > today ? " out" : ""}"${color ? ` style="--c:${color}"` : ""} title="${when}">${dateOf(d).getDate()}</span>`);
  }
  const head = ["M", "T", "W", "T", "F", "S", "S"].map((w) => `<span>${w}</span>`).join("");
  return `<div class="calendar" role="img" aria-label="Played ${played} of the days in the last ${weeks} weeks"><div class="cal-head" aria-hidden="true">${head}</div><div class="cal-grid" aria-hidden="true">${cells.join("")}</div></div>`;
}

/** Days in a row up to today (or yesterday, if today isn't played yet) for which `counts(day)` holds. */
export function streakOf(counts, today) {
  let streak = 0;
  for (let d = counts(today) ? today : today - 1; d >= 1 && counts(d); d--) streak++;
  return streak;
}

/**
 * For the finish event of a day's game: on how many days this device has
 * played it (today included), and how many in a row up to today. Just two
 * numbers, counted here, so the site's stats can say how many players come
 * back without knowing who anyone is.
 */
export function habit(history, today) {
  const days = new Set([...Object.keys(history ?? {}).map(Number), today]);
  return { played: days.size, streak: streakOf((d) => days.has(d), today) };
}

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? {};
  } catch {
    return {};
  }
}

/**
 * For the home page: each game the player has finished at least once, with
 * today's result (or null) and the streak as that game counts it.
 */
export function homeSummary(today = dayToday()) {
  const games = {
    "deep-cut": { key: "deepcut-v1", result: (h) => `${h} m`, counts: (h) => h !== undefined },
    "mother-tongue": { key: "mothertongue-v1", result: (h) => (h.solved ? `hatched in ${h.guesses}` : "not found"), counts: (h) => h?.solved },
    // Days saved before its #5 were out of 100, and count ten times over (until the game converts them and marks `outOf`).
    "ten-numbers": { key: "tennumbers-v1", result: (h, saved) => `${saved.outOf === 1000 ? h : h * 10} points`, counts: (h) => h !== undefined },
    burrow: { key: "burrow-v1", result: (h) => `${h} m`, counts: (h) => h !== undefined, late: 1 }, // its #1 was a day after the others
    crisscross: { key: "crisscross-v1", result: (h) => `solved in ${Math.floor(h.time / 60)}:${String(h.time % 60).padStart(2, "0")}`, counts: (h) => h !== undefined, late: 10 }, // its #1 was ten days after the others'
    borderline: { key: "borderline-v1", result: (h) => `${h.found} of 3 found`, counts: (h) => h !== undefined, late: 13 }, // its #1 was 13 days after the others'
  };
  const out = {};
  for (const [id, g] of Object.entries(games)) {
    const saved = read(g.key);
    const history = saved.history ?? {};
    if (!Object.keys(history).length) continue;
    const day = today - (g.late ?? 0); // the game's own day number
    out[id] = { today: history[day] !== undefined ? g.result(history[day], saved) : null, streak: streakOf((d) => g.counts(history[d]), day) };
  }
  return out;
}
