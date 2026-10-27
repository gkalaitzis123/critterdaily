// How everyone did today: each finished daily game sends its score to
// Critter Daily's small server (../worker/worker.js), and the results screen
// asks how the day went. Only on critterdaily.com; elsewhere (local copies,
// tests) it quietly does nothing. Published next to each page (see
// ../scripts/publish-site.mjs).

const ON_SITE = /(^|\.)critterdaily\.com$/.test(location.hostname);
const API = ON_SITE ? "/api/scores" : null;
const PLAYS = ON_SITE ? "/api/plays" : null;

/** Sends a finished daily game's score; resolves once it's in, or has failed. */
export async function sendScore(game, day, score) {
  if (!API) return;
  try {
    await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ game, day, score }), keepalive: true });
  } catch {
    // Offline: the day's numbers just won't include this game.
  }
}

/** How a game's day went: { players, counts: { [score]: players } }, or null when it can't be had. */
export async function howEveryoneDid(game, day) {
  if (!API) return null;
  try {
    const res = await fetch(`${API}?game=${game}&day=${day}`, { cache: "no-store" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/**
 * Sends one prompt of a daily game: the answer that counted (or null) and the
 * guesses that weren't on the list. Resolves once it's in, or has failed.
 */
export async function sendPlay(game, day, prompt, answer, misses = []) {
  if (!PLAYS) return;
  try {
    await fetch(PLAYS, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ game, day, prompt, answer, misses }), keepalive: true });
  } catch {
    // Offline: today's counts just won't include this answer.
  }
}

/** How everyone answered a prompt today: { players, counts: { [answer]: players } }, or null when it can't be had. */
export async function howEveryoneAnswered(game, day, prompt) {
  if (!PLAYS) return null;
  try {
    const res = await fetch(`${PLAYS}?game=${game}&day=${day}&prompt=${prompt}`, { cache: "no-store" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** Of everyone who finished, the percentage who scored lower than `score`. */
export function beatShare({ players, counts }, score) {
  const below = Object.entries(counts).reduce((n, [s, c]) => n + (Number(s) < score ? c : 0), 0);
  return players ? Math.round((100 * below) / players) : 0;
}

/** The average score, of the scores `keep` keeps; and how many it kept. */
export function averageOf({ counts }, keep = () => true) {
  let n = 0;
  let sum = 0;
  for (const [s, c] of Object.entries(counts)) {
    if (!keep(Number(s))) continue;
    n += c;
    sum += Number(s) * c;
  }
  return { average: n ? sum / n : 0, n };
}

/** "1,234". */
export const count = (n) => n.toLocaleString("en-US");
