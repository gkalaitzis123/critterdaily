// Google Analytics on critterdaily.com, with a yes or no first where the law
// asks for one. Ad networks like Mediavine judge a site's visits by Google
// Analytics, so the games can count on ads to stay free. It counts visits
// with cookies: in the EU (and the rest of the EEA), the UK and Switzerland
// it sets none until the visitor says yes in the little banner this shows;
// elsewhere it counts without asking. Ad cookies stay off everywhere. Anyone
// can change their answer in Settings (settings.js uses window.critterAnalytics).
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
  /** For the Settings sheet: whether visits are counted now, and a way to change it. */
  window.critterAnalytics = { counting: () => (answer ? answer === "yes" : mustAsk === false), set };

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

  // Ask only where the law wants a yes first, and only once.
  fetch("/api/where", { cache: "no-store" })
    .then((res) => res.json())
    .then(({ ask }) => {
      mustAsk = Boolean(ask);
      if (mustAsk && !answer) banner();
    })
    .catch(() => {
      // No answer: Google's own default for the region stands, and no banner.
    });
})();
