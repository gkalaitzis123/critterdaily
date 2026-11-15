// Critter Daily as an app on the home screen. Registers sw.js (what lets the
// site install, and opens the last version of a page offline) and runs every
// "Add to home screen" button: any element with data-install, hidden until
// there's a way to install. Chrome and Edge (Android, desktop) install with
// one tap; iPhones and iPads won't let a site ask, so there the button shows
// how: Share, then Add to Home Screen. Gone once it's installed, or open as
// the app. Installs, launches and the iPhone help count in Google Analytics.
//
// A plain script in every page's <head>, after analytics.js:
//   <script defer src="install.js"></script>
// Published next to each page with the other shared files.
(() => {
  if ("serviceWorker" in navigator && (location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname))) {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // No sw.js here (a single game's local server): the site works the same without it.
    });
  }
  const asApp = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const apple = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const count = (name, data) => window.gtag?.("event", name, data);
  let offer = null; // Chrome's or Edge's install prompt, kept for the button
  let installed = false;

  document.head.insertAdjacentHTML(
    "beforeend",
    `<style>
      .cd-install { display: inline-flex; align-items: center; gap: 8px; margin-top: 12px; padding: 8px 16px; border: 0; border-radius: 999px; background: var(--card, #fff); color: var(--ink, #2e2a3b); box-shadow: 0 3px 0 var(--card-edge, #9cc8ea); font: 600 16px var(--display, Fredoka, sans-serif); cursor: pointer; }
      .cd-install svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
      .cd-install[hidden] { display: none; }
      .cd-install-wide { display: flex; width: 100%; justify-content: center; margin: 0 0 18px; }
      .cd-install-help ol { margin: 0 0 18px; padding-left: 22px; line-height: 1.5; }
      .cd-install-help li + li { margin-top: 8px; }
      .cd-install-help .share { display: inline-block; width: 18px; height: 18px; vertical-align: -3px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    </style>`,
  );

  const refresh = () => {
    const show = !asApp() && !installed && Boolean(offer || apple);
    for (const el of document.querySelectorAll("[data-install]")) el.hidden = !show;
  };

  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // the button asks instead, when someone wants it
    offer = e;
    refresh();
  });
  addEventListener("appinstalled", () => {
    installed = true;
    offer = null;
    refresh();
    count("app_installed");
  });

  /** iPhones and iPads: how to add it, since a site can't ask. */
  function howOnApple() {
    let help = document.querySelector(".cd-install-help");
    if (!help) {
      document.body.insertAdjacentHTML(
        "beforeend",
        `<dialog class="sheet cd-install-help" aria-labelledby="cd-install-title">
          <h2 id="cd-install-title" tabindex="-1">Add Critter Daily to your home screen</h2>
          <ol>
            <li>Tap <strong>Share</strong> <svg class="share" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M5 11v9h14v-9" /></svg> in the browser's toolbar.</li>
            <li>Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
          </ol>
          <form method="dialog"><button class="primary">Got it</button></form>
        </dialog>`,
      );
      help = document.querySelector(".cd-install-help");
    }
    help.showModal();
  }

  async function install() {
    if (offer) {
      const prompt = offer;
      offer = null; // a prompt can be shown once
      prompt.prompt();
      const { outcome } = await prompt.userChoice;
      count("app_install_prompt", { outcome });
      refresh();
    } else if (apple) {
      howOnApple();
      count("app_install_help");
    }
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest?.("[data-install]")) install();
  });
  /** For pages that add a button later (the Settings sheet): refresh() shows or hides it. */
  window.critterInstall = { refresh, install };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", refresh);
  else refresh();
  if (asApp()) count("app_open");
})();
