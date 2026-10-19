// Getting around Critter Daily: a bar at the top of every game with the way
// back to all the games and a button for each one (ticked once it's played
// today), and, under a finished game, today's other games to play next.
//
// A plain script, the first thing in <body>, so the bar is there before the
// page draws:   <script src="nav.js" data-game="deep-cut"></script>
// A finished game's card gets the list wherever it has <div class="cd-next">.
// Games call window.critterNav.refresh() when they finish, to tick theirs.
// Published next to each page with the other shared files.
(() => {
  // Each game's saved results (as stats-view.js's homeSummary reads them for the home page).
  const GAMES = [
    { id: "deep-cut", name: "Deep Cut", key: "deepcut-v1", done: (h) => `${h} m deep` },
    { id: "mother-tongue", name: "Mother Tongue", key: "mothertongue-v1", done: (h) => (h.solved ? `hatched in ${h.guesses}` : "not found") },
    { id: "ten-numbers", name: "Ten Numbers", key: "tennumbers-v1", done: (h) => `${h} acorns` },
  ];
  const script = document.currentScript;
  const here = script.dataset.game;
  const LAUNCH = Date.UTC(2026, 9, 17); // day 1, as in stats-view.js
  const today = () => {
    const now = new Date();
    return Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - LAUNCH) / 86400000) + 1;
  };
  /** How today's game went ("92 m deep"), or null if it hasn't been played. */
  const result = (game) => {
    try {
      const h = JSON.parse(localStorage.getItem(game.key))?.history?.[today()];
      return h === undefined ? null : game.done(h);
    } catch {
      return null;
    }
  };
  // Each game's own icon; this one's is next to the page (the others' only resolve on the site).
  const icon = (game, size) => `<img src="${game.id === here ? "" : `../${game.id}/`}icon.svg" alt="" width="${size}" height="${size}" onerror="this.style.visibility='hidden'">`;

  document.head.insertAdjacentHTML(
    "beforeend",
    `<style>
      .cd-nav { display: flex; align-items: center; justify-content: space-between; gap: 10px; max-width: 760px; margin: 0 auto; padding: 10px 14px 2px; font-family: var(--display); }
      .cd-nav a { text-decoration: none; color: var(--ink); }
      .cd-home { display: inline-flex; align-items: center; gap: 8px; padding: 5px 16px 5px 6px; border-radius: 999px; background: var(--card); box-shadow: 0 3px 0 var(--card-edge); font-weight: 600; font-size: 16px; white-space: nowrap; }
      .cd-home img { border-radius: 9px; }
      .cd-games { display: flex; gap: 6px; }
      .cd-game { position: relative; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 13px; background: var(--card); box-shadow: 0 3px 0 var(--card-edge); }
      .cd-game img { border-radius: 9px; }
      .cd-game[aria-current="page"] { background: var(--sun); box-shadow: 0 3px 0 var(--sun-edge); }
      .cd-game .cd-tick { position: absolute; top: -5px; right: -5px; display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; background: var(--good); color: #fff; font: 700 11px/1 Nunito, sans-serif; }
      .cd-home:focus-visible, .cd-game:focus-visible, .cd-row:focus-visible { outline: 3px solid var(--link); outline-offset: 2px; }
      .cd-next { margin: 22px 0 6px; text-align: left; }
      .cd-next h3 { margin: 0 0 10px; font: 600 19px var(--display); text-align: center; color: var(--ink); }
      .cd-row { display: flex; align-items: center; gap: 12px; margin-top: 8px; padding: 10px 12px; border-radius: 16px; background: var(--card); box-shadow: 0 3px 0 var(--card-edge); color: var(--ink); text-decoration: none; }
      .cd-row img { flex: none; border-radius: 11px; }
      .cd-row .cd-what { flex: 1; min-width: 0; display: flex; flex-direction: column; }
      .cd-row strong { font: 600 18px var(--display); }
      .cd-row small { color: var(--muted); font-size: 14px; font-weight: 700; }
      .cd-row .cd-go { flex: none; padding: 6px 16px 8px; border-radius: 999px; background: var(--sun); box-shadow: 0 3px 0 var(--sun-edge); color: var(--on-sun); font: 700 15px var(--display); }
      .cd-row.played .cd-go { background: var(--track); box-shadow: none; color: var(--ink-2); }
    </style>`,
  );

  const bar = () => `<nav class="cd-nav" aria-label="Critter Daily games">
      <a class="cd-home" href="../"><img src="../icon.svg" alt="" width="30" height="30" onerror="this.style.visibility='hidden'">All games</a>
      <span class="cd-games">${GAMES.map((g) => {
        const done = result(g) !== null;
        return `<a class="cd-game" href="../${g.id}/"${g.id === here ? ' aria-current="page"' : ""} aria-label="${g.name}${done ? ", played today" : ""}" title="${g.name}">${icon(g, 30)}${done ? '<span class="cd-tick" aria-hidden="true">✓</span>' : ""}</a>`;
      }).join("")}</span>
    </nav>`;
  script.insertAdjacentHTML("afterend", bar());

  /** Today's other games, the ones not played yet first. */
  const next = () => {
    const others = GAMES.filter((g) => g.id !== here).map((g) => ({ ...g, result: result(g) }));
    others.sort((a, b) => (a.result !== null) - (b.result !== null));
    const left = others.filter((g) => g.result === null).length;
    return `<h3>${left ? "Today's other games" : "You've played everything today. See you tomorrow!"}</h3>${others
      .map((g) => `<a class="cd-row${g.result !== null ? " played" : ""}" href="../${g.id}/">${icon(g, 44)}<span class="cd-what"><strong>${g.name}</strong><small>${g.result !== null ? `Today: ${g.result}` : "Not played yet"}</small></span><span class="cd-go">${g.result !== null ? "See" : "Play"}</span></a>`)
      .join("")}`;
  };
  const refresh = () => {
    document.querySelector(".cd-nav")?.insertAdjacentHTML("beforebegin", bar());
    document.querySelectorAll(".cd-nav")[1]?.remove();
    document.querySelectorAll(".cd-next").forEach((box) => (box.innerHTML = next()));
  };
  window.critterNav = { refresh };
  document.addEventListener("DOMContentLoaded", () => document.querySelectorAll(".cd-next").forEach((box) => (box.innerHTML = next())));
})();
