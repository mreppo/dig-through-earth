/* main.js — entry point. Wires i18n and the view toggle. Map/globe land later. */

import { initI18n } from "./i18n.js";

function wireViewToggle() {
  const buttons = document.querySelectorAll("[data-view]");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const chosen = btn.getAttribute("data-view");
      buttons.forEach((b) => {
        b.setAttribute("aria-pressed", String(b.getAttribute("data-view") === chosen));
      });
    });
  });
}

async function boot() {
  try {
    await initI18n();
  } catch (err) {
    console.error("i18n init failed:", err);
  }
  wireViewToggle();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
