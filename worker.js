// Critter Daily's one bit of server: how everyone did each day. The site is
// static files; only /api/ runs this (see wrangler.jsonc). Each finished
// daily game sends its score, and anyone can ask how a game's day went: how
// many finished, and how many got each score. One score counts per game, day
// and connection: the connection is kept only as a scrambled code made with a
// secret and the day, so it can't be turned back into an address or followed
// from one day to the next. Running totals per score keep each "how did
// the day go" a read of a few hundred rows at most, however many play, well
// inside D1's free reads.

const DAY_ONE = Date.UTC(2026, 9, 17); // the first games' #1
// The highest score each game can send (Burrow's: every word of its deepest
// day), and how many days after DAY_ONE its #1 was.
const GAMES = { "deep-cut": [250, 0], "mother-tongue": [20, 0], "ten-numbers": [1000, 0], burrow: [1000, 1] };

let ready; // the tables and the secret, made on first use

async function setUp(db) {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS scores (game TEXT NOT NULL, day INTEGER NOT NULL, who TEXT NOT NULL, score INTEGER NOT NULL, PRIMARY KEY (game, day, who))"),
    // How many got each score: counted as each new score goes in (a repeat is ignored, so it isn't counted).
    db.prepare("CREATE TABLE IF NOT EXISTS totals (game TEXT NOT NULL, day INTEGER NOT NULL, score INTEGER NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (game, day, score))"),
    db.prepare(
      "CREATE TRIGGER IF NOT EXISTS count_score AFTER INSERT ON scores BEGIN INSERT INTO totals (game, day, score, n) VALUES (NEW.game, NEW.day, NEW.score, 1) ON CONFLICT (game, day, score) DO UPDATE SET n = n + 1; END",
    ),
    db.prepare("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)"),
    db.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('salt', ?)").bind(crypto.randomUUID()),
  ]);
  // Scores kept before there were totals are counted, once.
  const first = await db.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('totals', 'counted')").run();
  if (first?.meta?.changes) {
    await db
      .prepare("INSERT INTO totals (game, day, score, n) SELECT game, day, score, COUNT(*) FROM scores WHERE true GROUP BY game, day, score ON CONFLICT (game, day, score) DO UPDATE SET n = excluded.n")
      .run();
  }
  return db.prepare("SELECT value FROM meta WHERE key = 'salt'").first("value");
}

const json = (body, status = 200, maxAge = 0) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": maxAge ? `public, max-age=${maxAge}` : "no-store" } });

async function scramble(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest).slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Today's day number in UTC; players' own days run a day either side. */
export const dayNow = (now = Date.now()) => Math.floor((now - DAY_ONE) / 86400000) + 1;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/scores") return env.ASSETS ? env.ASSETS.fetch(request) : json({ error: "not found" }, 404);
    let salt;
    try {
      salt = await (ready ??= setUp(env.DB));
    } catch (e) {
      ready = undefined; // try again next time
      return json({ error: "storage unavailable" }, 503);
    }

    if (request.method === "POST") {
      const { game, day, score } = await request.json().catch(() => ({}));
      const [best, late] = Object.hasOwn(GAMES, game) ? GAMES[game] : [];
      const fits = best !== undefined && Number.isInteger(day) && Math.abs(day + late - dayNow()) <= 1 && Number.isInteger(score) && score >= 0 && score <= best;
      if (!fits) return json({ error: "not a score" }, 400);
      const who = await scramble(`${salt}|${day}|${request.headers.get("cf-connecting-ip") ?? ""}`);
      await env.DB.prepare("INSERT OR IGNORE INTO scores (game, day, who, score) VALUES (?, ?, ?, ?)").bind(game, day, who, score).run();
      return json({ ok: true });
    }

    if (request.method === "GET") {
      const game = url.searchParams.get("game");
      const day = Number(url.searchParams.get("day") || NaN);
      if (!Object.hasOwn(GAMES, game) || !Number.isInteger(day) || day < 1) return json({ error: "which game and day?" }, 400);
      const { results } = await env.DB.prepare("SELECT score, n FROM totals WHERE game = ? AND day = ?").bind(game, day).all();
      return json({ players: results.reduce((total, r) => total + r.n, 0), counts: Object.fromEntries(results.map((r) => [r.score, r.n])) }, 200, 30);
    }

    return json({ error: "method not allowed" }, 405);
  },
};
