/* router.js - screen switching for the multi-screen app shell.
 *
 * The app has one body with several `<section class="screen" id="screen-X">`
 * children. Exactly one is active at a time (data-active="true"). The bottom
 * tab bar plus CTA buttons elsewhere drive transitions.
 *
 * Public API:
 *   initRouter({ onScreenChange })
 *     onScreenChange(id) called every time the active screen changes.
 *   showScreen(id)
 *     Imperative switch from JS (e.g. after the drilling overlay).
 *   getActiveScreen()
 *
 * URL handling: respects ?view=globe on first load (back-compat with the
 * pre-redesign deep link). Does not push history on tab clicks (this keeps
 * the back button predictable - browser back exits the app, not just the
 * screen).
 */

const SCREENS = ["locator", "result", "map", "globe", "quiz"];

let onChange = null;

export function getActiveScreen() {
  const el = document.querySelector(".screen[data-active='true']");
  return el ? el.id.replace(/^screen-/, "") : null;
}

export function showScreen(id) {
  if (!SCREENS.includes(id)) return;
  document.querySelectorAll(".screen").forEach((s) => {
    s.setAttribute("data-active", s.id === `screen-${id}` ? "true" : "false");
  });
  document.querySelectorAll(".tab").forEach((t) => {
    const isActive = t.dataset.tab === id;
    t.setAttribute("aria-current", isActive ? "page" : "false");
  });
  // Reset internal scroll on the activated screen so the user lands at the top.
  const active = document.getElementById(`screen-${id}`);
  const scroll = active && active.querySelector(".screen-scroll");
  if (scroll) scroll.scrollTop = 0;
  if (typeof onChange === "function") onChange(id);
}

function initialScreenFromURL() {
  try {
    const url = new URL(window.location.href);
    const v = url.searchParams.get("view");
    if (v === "globe" || v === "3d") return "globe";
    if (v === "2d" || v === "map") return "map";
    if (v === "quiz") return "quiz";
  } catch {
    /* ignore - opaque origin or malformed URL */
  }
  return "locator";
}

export function initRouter({ onScreenChange } = {}) {
  onChange = onScreenChange || null;

  document.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => showScreen(btn.dataset.tab));
  });
  document.querySelectorAll("[data-go-screen]").forEach((btn) => {
    btn.addEventListener("click", () => showScreen(btn.dataset.goScreen));
  });
  document.querySelectorAll("[data-screen-back]").forEach((btn) => {
    btn.addEventListener("click", () => showScreen("locator"));
  });

  showScreen(initialScreenFromURL());
}
