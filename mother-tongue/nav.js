// Getting around Critter Daily: a bar at the top of every game with the way
// back to all the games, the Notes, a heart for tips and a button for each
// game (ticked once it's played today), and, under a finished game, a card
// for tips and today's other games to play next.
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
    // Ten Numbers days saved before its #5 were out of 100, and count ten times over (until the game converts them and marks `outOf`).
    { id: "ten-numbers", name: "Ten Numbers", key: "tennumbers-v1", done: (h, saved) => `${saved.outOf === 1000 ? h : h * 10} points` },
    { id: "burrow", name: "Burrow", key: "burrow-v1", done: (h) => `${h} m deep`, late: 1 }, // its #1 was a day after the others
    { id: "crisscross", name: "Crisscross", key: "crisscross-v1", done: (h) => `solved in ${Math.floor(h.time / 60)}:${String(h.time % 60).padStart(2, "0")}`, late: 10 }, // its #1 was ten days after the others'
    { id: "borderline", name: "Borderline", key: "borderline-v1", done: (h) => `${h.found} of 3 found`, late: 13 }, // its #1 was 13 days after the others'
  ];
  const script = document.currentScript;
  const here = script.dataset.game;
  // Links from a game's folder ("../"), or from the site's root on the pages outside them (data-root="/").
  const root = script.dataset.root ?? "../";
  const page = script.dataset.page; // "notes" on the Notes, to light up its button
  // Where players can leave a tip; the footers and the About page link there too.
  const TIP = "https://ko-fi.com/critterdaily";
  const LAUNCH = Date.UTC(2026, 9, 17); // day 1, as in stats-view.js
  const today = () => {
    const now = new Date();
    return Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - LAUNCH) / 86400000) + 1;
  };
  /** How today's game went ("92 m deep"), or null if it hasn't been played. */
  const result = (game) => {
    try {
      const saved = JSON.parse(localStorage.getItem(game.key));
      const h = saved?.history?.[today() - (game.late ?? 0)];
      return h === undefined ? null : game.done(h, saved);
    } catch {
      return null;
    }
  };
  // Each game's own icon; this one's is next to the page (the others' only resolve on the site).
  const icon = (game, size) => `<img src="${game.id === here ? "" : `${root}${game.id}/`}icon.svg" alt="" width="${size}" height="${size}" onerror="this.style.visibility='hidden'">`;

  document.head.insertAdjacentHTML(
    "beforeend",
    `<style>
      .cd-nav { display: flex; align-items: center; justify-content: space-between; gap: 10px; max-width: 760px; margin: 0 auto; padding: 10px 14px 2px; font-family: var(--display); }
      .cd-nav a { text-decoration: none; color: var(--ink); }
      .cd-home { display: inline-flex; align-items: center; gap: 8px; padding: 5px 16px 5px 6px; border-radius: 999px; background: var(--card); box-shadow: 0 3px 0 var(--card-edge); font-weight: 600; font-size: 16px; white-space: nowrap; }
      .cd-home img { border-radius: 9px; }
      .cd-left { display: flex; align-items: center; gap: 6px; }
      .cd-notes, .cd-tipnav { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 40px; padding: 0 14px 0 8px; border-radius: 999px; background: var(--card); box-shadow: 0 3px 0 var(--card-edge); font-weight: 600; font-size: 16px; white-space: nowrap; }
      .cd-notes svg, .cd-tipnav svg { flex: none; }
      .cd-notes[aria-current="page"] { background: var(--sun); box-shadow: 0 3px 0 var(--sun-edge); color: var(--on-sun); }
      .cd-games { display: flex; gap: 6px; }
      .cd-game { position: relative; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 13px; background: var(--card); box-shadow: 0 3px 0 var(--card-edge); }
      .cd-game img { border-radius: 9px; }
      .cd-game[aria-current="page"] { background: var(--sun); box-shadow: 0 3px 0 var(--sun-edge); }
      .cd-game .cd-tick { position: absolute; top: -5px; right: -5px; display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; background: var(--good); color: #fff; font: 700 11px/1 Nunito, sans-serif; }
      .cd-home:focus-visible, .cd-notes:focus-visible, .cd-tipnav:focus-visible, .cd-game:focus-visible, .cd-row:focus-visible, .cd-tipcard:focus-visible { outline: 3px solid var(--link); outline-offset: 2px; }
      /* Narrower screens: the Notes button is just the notebook, and the tip button just the heart. */
      @media (max-width: 600px) {
        .cd-notes, .cd-tipnav { width: 40px; padding: 0; border-radius: 13px; }
        .cd-notes-text, .cd-tipnav-text { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
      }
      .cd-next { margin: 22px 0 6px; text-align: left; }
      .cd-next h3 { margin: 0 0 10px; font: 600 19px var(--display); text-align: center; color: var(--ink); }
      .cd-row { display: flex; align-items: center; gap: 12px; margin-top: 8px; padding: 10px 12px; border-radius: 16px; background: var(--card); box-shadow: 0 3px 0 var(--card-edge); color: var(--ink); text-decoration: none; }
      .cd-row img { flex: none; border-radius: 11px; }
      .cd-row .cd-what, .cd-tipcard .cd-what { flex: 1; min-width: 0; display: flex; flex-direction: column; }
      .cd-row strong, .cd-tipcard strong { font: 600 18px var(--display); }
      .cd-row small { color: var(--muted); font-size: 14px; font-weight: 700; }
      .cd-go { flex: none; padding: 6px 16px 8px; border-radius: 999px; background: var(--sun); box-shadow: 0 3px 0 var(--sun-edge); color: var(--on-sun); font: 700 15px var(--display); }
      .cd-row.played .cd-go { background: var(--track); box-shadow: none; color: var(--ink-2); }
      /* Under a finished game, right below Share: a tip card with a coral edge and button, so it stands apart from the games. */
      .cd-tipcard { display: flex; align-items: center; gap: 12px; margin: 0 0 22px; padding: 10px 12px; border: 2px solid var(--coral, #ff6f61); border-radius: 16px; background: var(--card); box-shadow: 0 3px 0 var(--card-edge); color: var(--ink); text-decoration: none; }
      .cd-tipcard svg { flex: none; }
      .cd-tipgo { background: var(--coral, #ff6f61); box-shadow: 0 3px 0 #c9473c; }
      .cd-tipcard:hover .cd-tipgo { filter: brightness(1.05); }
      /* Six games' buttons and the way home, on one line on a phone. */
      @media (max-width: 440px) {
        .cd-nav { gap: 8px; padding: 10px 10px 2px; }
        .cd-home { gap: 6px; padding: 4px 12px 4px 4px; font-size: 15px; }
        .cd-home img { width: 26px; height: 26px; }
        .cd-games { gap: 4px; }
        .cd-game { width: 35px; height: 35px; border-radius: 11px; }
        .cd-game img { width: 27px; height: 27px; border-radius: 8px; }
      }
      @media (max-width: 370px) {
        .cd-games { gap: 3px; }
        .cd-game { width: 33px; height: 33px; }
        .cd-game img { width: 25px; height: 25px; }
      }
      @media (max-width: 350px) {
        .cd-home { padding-right: 4px; }
        .cd-home-text { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
      }
      /* Phones: the way home and the Notes as icons, so the bar keeps to one line. */
      @media (max-width: 520px) {
        .cd-left { gap: 4px; }
        .cd-home { padding: 4px; }
        .cd-home-text { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
      }
      @media (max-width: 440px) {
        .cd-notes, .cd-tipnav { width: 35px; height: 35px; border-radius: 11px; }
        .cd-notes svg, .cd-tipnav svg { width: 24px; height: 24px; }
      }
      @media (max-width: 370px) {
        .cd-notes, .cd-tipnav { width: 33px; height: 33px; }
      }
      /* The smallest phones: no room for the heart; the tip card and the footer still link there. */
      @media (max-width: 359px) {
        .cd-tipnav { display: none; }
      }
    </style>`,
  );

  // A little notebook, in the critters' colors.
  const NOTEBOOK = `<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><rect x="4" y="2" width="18" height="22" rx="4" fill="#f2a900"/><rect x="7" y="5" width="12" height="16" rx="2" fill="#fff8e6"/><path d="M10 10h6M10 13.5h6M10 17h4" stroke="#6b4e3d" stroke-width="2" stroke-linecap="round"/></svg>`;
  // A coral heart, for tips; in the results it sits on a soft tile, like the games' icons.
  const heart = (size, tile = false) => `<svg width="${size}" height="${size}" viewBox="0 0 26 26" aria-hidden="true">${tile ? '<rect width="26" height="26" rx="6.5" fill="#ffe1dc"/><g transform="translate(3.4 3.1) scale(.74)">' : "<g>"}<path d="M13 22S3.5 16.2 3.5 9.8c0-2.9 2.3-5 5-5 2 0 3.5 1.1 4.5 2.7 1-1.6 2.5-2.7 4.5-2.7 2.7 0 5 2.1 5 5 0 6.4-9.5 12.2-9.5 12.2z" fill="#ff6f61"/><path d="M6.6 9.4c.2-1.4 1.2-2.3 2.4-2.5" stroke="#fff" stroke-width="1.6" stroke-linecap="round" fill="none" opacity=".8"/></g></svg>`;
  const bar = () => `<nav class="cd-nav" aria-label="Critter Daily games">
      <span class="cd-left"><a class="cd-home" href="${root}"><img src="${root}icon.svg" alt="" width="30" height="30" onerror="this.style.visibility='hidden'"><span class="cd-home-text">All games</span></a><a class="cd-notes" href="${root}notes/"${page === "notes" ? ' aria-current="page"' : ""} aria-label="Notes" title="Notes: how the games work, and what players do">${NOTEBOOK}<span class="cd-notes-text">Notes</span></a><a class="cd-tipnav" href="${TIP}" target="_blank" rel="noopener" aria-label="Tip the critters on Ko-fi" title="Tip the critters on Ko-fi" data-umami-event="tip" data-umami-event-where="bar">${heart(26)}<span class="cd-tipnav-text">Tip</span></a></span>
      <span class="cd-games">${GAMES.map((g) => {
        const done = result(g) !== null;
        return `<a class="cd-game" href="${root}${g.id}/"${g.id === here ? ' aria-current="page"' : ""} aria-label="${g.name}${done ? ", played today" : ""}" title="${g.name}">${icon(g, 30)}${done ? '<span class="cd-tick" aria-hidden="true">✓</span>' : ""}</a>`;
      }).join("")}</span>
    </nav>`;
  script.insertAdjacentHTML("afterend", bar());

  /** Today's other games, the ones not played yet first. */
  const next = () => {
    const others = GAMES.filter((g) => g.id !== here).map((g) => ({ ...g, result: result(g) }));
    others.sort((a, b) => (a.result !== null) - (b.result !== null));
    const left = others.filter((g) => g.result === null).length;
    return `<a class="cd-tipcard" href="${TIP}" target="_blank" rel="noopener" data-umami-event="tip" data-umami-event-where="results">${heart(44, true)}<span class="cd-what"><strong>Enjoying Critter Daily?</strong></span><span class="cd-go cd-tipgo">Tip</span></a><h3>${left ? "Today's other games" : "You've played everything today. See you tomorrow!"}</h3>${others
      .map((g) => `<a class="cd-row${g.result !== null ? " played" : ""}" href="${root}${g.id}/">${icon(g, 44)}<span class="cd-what"><strong>${g.name}</strong><small>${g.result !== null ? `Today: ${g.result}` : "Not played yet"}</small></span><span class="cd-go">${g.result !== null ? "See" : "Play"}</span></a>`)
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
