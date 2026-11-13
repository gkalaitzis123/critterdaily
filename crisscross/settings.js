// Critter Daily's settings, shared by every page (one site, so one storage):
// light or dark colors, and less motion. Each page's <head> applies them
// before it draws, so a dark page never flashes white; this keeps them up to
// date and offers the settings sheet. Published next to each page as
// settings.js (see ../scripts/publish-site.mjs).

const KEY = "critter-daily-settings";
const systemDark = matchMedia("(prefers-color-scheme: dark)");
const THEMES = { system: "Like my device", light: "Light", dark: "Dark" };

export function readSettings() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
}

function writeSettings(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Private windows can refuse storage; the setting still holds for this visit.
  }
}

/** Sets the page's data-theme ("light" or "dark"), data-motion, and the color of the browser's bar. */
export function applySettings(settings = readSettings()) {
  const root = document.documentElement;
  root.dataset.theme = settings.theme === "light" || settings.theme === "dark" ? settings.theme : systemDark.matches ? "dark" : "light";
  if (settings.motion === "less") root.dataset.motion = "less";
  else delete root.dataset.motion;
  const bar = document.querySelector('meta[name="theme-color"]');
  const sky = getComputedStyle(root).getPropertyValue("--sky").trim();
  if (bar && sky) bar.content = sky;
}

systemDark.addEventListener("change", () => applySettings());
addEventListener("storage", (e) => e.key === KEY && applySettings()); // changed in another tab

/** A settings sheet, opened by `button`. Uses the page's .sheet and .primary styles. */
export function settingsButton(button) {
  const analytics = window.critterAnalytics; // only on critterdaily.com (analytics.js)
  const sheet = document.createElement("dialog");
  sheet.className = "sheet settings-sheet";
  sheet.setAttribute("aria-labelledby", "settings-title");
  sheet.innerHTML = `<h2 id="settings-title" tabindex="-1" autofocus>Settings</h2>
    <fieldset class="setting">
      <legend>Colors</legend>
      <div class="segmented">${Object.entries(THEMES)
        .map(([value, label]) => `<label><input type="radio" name="theme" value="${value}" /><span>${label}</span></label>`)
        .join("")}</div>
    </fieldset>
    <label class="setting toggle"><input type="checkbox" name="motion" /><span>Less motion</span><span class="toggle-note">Fewer bounces and wiggles</span></label>
    ${analytics ? '<label class="setting toggle analytics-toggle"><input type="checkbox" name="analytics" /><span>Count my visits</span><span class="toggle-note">With Google Analytics, which uses cookies. <a href="/privacy">More</a></span></label>' : ""}
    ${analytics ? `<p class="setting-note analytics-choices" style="display: none">Counting visits and ads: <a href="#" class="choices-link">change your choices</a> in Google's message.</p>` : ""}
    <p class="setting-note">These apply to all the games on this device.</p>
    <form method="dialog"><button class="primary">Done</button></form>`;
  document.body.append(sheet);
  // Where Google's consent message asks (the EU, the UK, Switzerland), it's where the answer changes.
  sheet.querySelector(".choices-link")?.addEventListener("click", (e) => {
    e.preventDefault();
    sheet.close();
    analytics.choices();
  });
  sheet.addEventListener("change", (e) => {
    if (e.target.name === "analytics") {
      analytics.set(e.target.checked);
      return;
    }
    const theme = sheet.querySelector('[name="theme"]:checked')?.value ?? "system";
    const settings = { ...readSettings(), theme, motion: sheet.querySelector('[name="motion"]').checked ? "less" : undefined };
    writeSettings(settings);
    applySettings(settings);
  });
  button.addEventListener("click", () => {
    const settings = readSettings();
    for (const radio of sheet.querySelectorAll('[name="theme"]')) radio.checked = radio.value === (settings.theme ?? "system");
    sheet.querySelector('[name="motion"]').checked = settings.motion === "less";
    if (analytics) {
      const google = analytics.google?.() ?? false;
      sheet.querySelector(".analytics-toggle").style.display = google ? "none" : "";
      sheet.querySelector(".analytics-choices").style.display = google ? "" : "none";
      sheet.querySelector('[name="analytics"]').checked = analytics.counting();
    }
    sheet.showModal();
  });
}

applySettings();
