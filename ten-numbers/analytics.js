// Google Analytics on critterdaily.com, with a yes or no first where the law
// asks for one. Ad networks like Mediavine judge a site's visits by Google
// Analytics, so the games can count on ads to stay free. It counts visits
// with cookies: in the EU (and the rest of the EEA), the UK and Switzerland
// it sets none until the visitor says yes; elsewhere it counts without
// asking. Ad cookies stay off everywhere. Anyone can change their answer in
// Settings (settings.js uses window.critterAnalytics).
//
// Where a yes comes first it's asked once, not twice: Google's consent
// message (AdSense's, which asks about ads there) asks about counting visits
// too, as the site's own purposes, and its answer, read through the IAB's
// TCF API (__tcfapi), decides. The little banner this shows asks only when
// Google's message doesn't come: before AdSense shows ads, or when an ad
// blocker stops it.
// Only on critterdaily.com, so local copies and tests count nothing.
//
// A plain script in every page's <head>:   <script defer src="analytics.js"></script>
// Published next to each page with the other shared files.
(() => {
  if (!/(^|\.)critterdaily\.com$/.test(location.hostname)) return;
  const ID = "G-EGE267DHHX";
  const KEY = "critter-daily-analytics"; // "yes" or "no", once someone's said
  // Where cookies need a yes first (the Worker's /api/where says the same).
  const ASK = "AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO GB CH".split(" ");

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = gtag; // the games' stats (game_start, game_finish, game_share) and the home page's home_visit
  const ads = { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" };
  gtag("consent", "default", { ...ads, analytics_storage: "denied", region: ASK });
  gtag("consent", "default", { ...ads, analytics_storage: "granted" });
  const read = () => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  };
  let answer = read();
  if (answer) gtag("consent", "update", { analytics_storage: answer === "yes" ? "granted" : "denied" });
  gtag("js", new Date());
  gtag("config", ID);
  const tag = document.createElement("script");
  tag.async = true;
  tag.src = `https://www.googletagmanager.com/gtag/js?id=${ID}`;
  document.head.append(tag);

  let mustAsk = null; // whether this visitor is where a yes comes first, once the Worker has said
  let google = null; // what Google's consent message last said (its TCF data), where it asks
  const set = (yes) => {
    answer = yes ? "yes" : "no";
    try {
      localStorage.setItem(KEY, answer);
    } catch {
      // Private windows can refuse storage; the answer still holds for this page.
    }
    gtag("consent", "update", { analytics_storage: yes ? "granted" : "denied" });
    document.querySelector(".cd-consent")?.remove();
  };

  // Google's answer for the site's own purposes (1, keep information on the
  // device; 8, measure content; 9, audience statistics), or, if its message
  // doesn't list them, for the same purposes in general.
  const counted = (tc) => {
    const own = Object.keys(tc.publisher?.consents ?? {}).length ? tc.publisher.consents : (tc.purpose?.consents ?? {});
    return Boolean(own[1] && (own[8] || own[9]));
  };
  const listen = () => {
    if (typeof window.__tcfapi !== "function") return false;
    window.__tcfapi("addEventListener", 2, (tc, ok) => {
      if (!ok || !tc?.gdprApplies) return;
      google = tc;
      document.querySelector(".cd-consent")?.remove(); // one question: Google's
      if (tc.eventStatus === "tcloaded" || tc.eventStatus === "useractioncomplete") {
        gtag("consent", "update", { analytics_storage: counted(tc) ? "granted" : "denied" });
      }
    });
    return true;
  };
  // Google's message comes with the ads script, a moment after the page: the
  // banner waits WAIT for it, and gives way if it comes later still.
  const WAIT = 2500;
  const since = Date.now();
  if (!listen()) {
    const poll = setInterval(() => {
      if (listen() || Date.now() - since > 15000) clearInterval(poll);
    }, 250);
  }

  /** For the Settings sheet: whether visits are counted now, and ways to change it. */
  window.critterAnalytics = {
    counting: () => (google ? counted(google) : answer ? answer === "yes" : mustAsk === false),
    set,
    // Where Google's message asks, a change goes through it too.
    google: () => Boolean(google && window.googlefc?.showRevocationMessage),
    choices: () => window.googlefc?.showRevocationMessage?.(),
  };

  const banner = () => {
    document.head.insertAdjacentHTML(
      "beforeend",
      `<style>
        .cd-consent { position: fixed; left: 50%; bottom: max(12px, env(safe-area-inset-bottom)); z-index: 50; width: min(520px, calc(100% - 24px)); transform: translateX(-50%); display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; padding: 12px 14px; border-radius: 18px; background: var(--card, #fff); color: var(--ink, #2e2a3b); box-shadow: 0 4px 0 var(--card-edge, #9cc8ea), 0 8px 24px rgba(46, 42, 59, 0.18); font: 600 14px/1.4 Nunito, system-ui, sans-serif; }
        .cd-consent p { flex: 1 1 220px; margin: 0; }
        .cd-consent a { color: var(--link, #1f5f99); }
        .cd-consent .cd-choices { display: flex; gap: 8px; margin-left: auto; }
        .cd-consent button { min-height: 40px; padding: 6px 16px; border-radius: 14px; font: 600 16px var(--display, Fredoka, sans-serif); cursor: pointer; }
        .cd-consent .cd-yes { border: 0; background: var(--sun, #ffb938); box-shadow: 0 3px 0 var(--sun-edge, #d68a00); color: var(--on-sun, #2e2a3b); }
        .cd-consent .cd-no { border: 2px solid var(--ink, #2e2a3b); background: transparent; color: inherit; }
      </style>`,
    );
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div class="cd-consent" role="region" aria-label="Counting visits">
        <p>Can we count your visit with Google Analytics? It uses cookies. <a href="/privacy">More</a></p>
        <span class="cd-choices"><button type="button" class="cd-no">No thanks</button><button type="button" class="cd-yes">Yes</button></span>
      </div>`,
    );
    document.querySelector(".cd-consent .cd-yes").addEventListener("click", () => set(true));
    document.querySelector(".cd-consent .cd-no").addEventListener("click", () => set(false));
  };

  // Ask only where the law wants a yes first, only once, and only if Google's message doesn't.
  fetch("/api/where", { cache: "no-store" })
    .then((res) => res.json())
    .then(({ ask }) => {
      mustAsk = Boolean(ask);
      if (mustAsk && !answer) {
        setTimeout(() => {
          if (!google && !answer) banner();
        }, Math.max(0, WAIT - (Date.now() - since)));
      }
    })
    .catch(() => {
      // No answer: Google's own default for the region stands, and no banner.
    });
})();
