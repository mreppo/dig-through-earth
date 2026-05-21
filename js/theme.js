/* theme.js - mode + scheme switcher.
 *
 * Two axes drive every visual token (see css/tokens.css):
 *   data-mode   = "kid" | "standard"   persisted in dte:mode
 *   data-scheme = "light" | "dark"     persisted in dte:scheme
 *
 * The initial attribute values are set by the inline no-FOUC boot script in
 * <head> BEFORE this module loads, so the first paint is already correct.
 * This module only handles user interaction + system-scheme following.
 *
 * Public API:
 *   initTheme()  - wire the mole + sun/moon buttons that exist on the page.
 *                  Safe to call when the buttons don't exist (e.g. 404 may
 *                  ship a different chrome someday) - exits silently.
 */

import { t, onLanguageChange } from "./i18n.js";

const MODE_KEY = "dte:mode";
const SCHEME_KEY = "dte:scheme";

const PUFF_COUNT = 8;
const PUFF_COLORS = [
  "var(--dte-accent)",
  "var(--dte-accent-2)",
  "var(--dte-accent-3)",
  "var(--dte-accent-4)",
];

function getMode() {
  return document.documentElement.getAttribute("data-mode") || "kid";
}

function getScheme() {
  return document.documentElement.getAttribute("data-scheme") || "light";
}

function systemScheme() {
  return window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
}

function userHasSchemeOverride() {
  try {
    return Boolean(localStorage.getItem(SCHEME_KEY));
  } catch {
    return false;
  }
}

function applyMode(mode, moleBtn, modePill) {
  document.documentElement.setAttribute("data-mode", mode);
  if (modePill) {
    modePill.textContent = t(mode === "kid" ? "theme.pill.kid" : "theme.pill.standard");
  }
  if (moleBtn) {
    const labelKey = mode === "kid" ? "theme.switchTo.standard" : "theme.switchTo.kid";
    moleBtn.setAttribute("aria-label", t(labelKey));
    moleBtn.setAttribute("aria-pressed", mode === "standard" ? "true" : "false");
  }
}

function applyScheme(scheme, schemeBtn) {
  const resolved = scheme === "system" ? systemScheme() : scheme;
  document.documentElement.setAttribute("data-scheme", resolved);
  if (schemeBtn) {
    const labelKey = resolved === "light" ? "theme.switchTo.dark" : "theme.switchTo.light";
    schemeBtn.setAttribute("aria-label", t(labelKey));
    schemeBtn.setAttribute("aria-pressed", resolved === "dark" ? "true" : "false");
  }
}

function spawnPuffs(moleBtn) {
  const puff = moleBtn.querySelector(".dirt-puff");
  if (!puff) return;
  puff.replaceChildren();
  for (let i = 0; i < PUFF_COUNT; i++) {
    const pt = document.createElement("span");
    pt.className = "pt";
    const angle = (Math.PI * 2 * i) / PUFF_COUNT;
    const r = 28 + Math.random() * 12;
    pt.style.setProperty("--dx", `${Math.cos(angle) * r}px`);
    pt.style.setProperty("--dy", `${Math.sin(angle) * r}px`);
    pt.style.background = PUFF_COLORS[i % PUFF_COLORS.length];
    const size = 4 + Math.random() * 6;
    pt.style.width = `${size}px`;
    pt.style.height = `${size}px`;
    puff.appendChild(pt);
  }
}

function wireMoleBtn(moleBtn, modePill) {
  moleBtn.addEventListener("click", () => {
    const next = getMode() === "kid" ? "standard" : "kid";
    spawnPuffs(moleBtn);
    moleBtn.classList.remove("flipping");
    // Force reflow so the animation restarts cleanly on rapid taps.
    void moleBtn.offsetWidth;
    moleBtn.classList.add("flipping");
    setTimeout(() => moleBtn.classList.remove("flipping"), 600);
    applyMode(next, moleBtn, modePill);
    try { localStorage.setItem(MODE_KEY, next); } catch { /* ignore */ }
    if (navigator.vibrate) navigator.vibrate(8);
  });
}

function wireSchemeBtn(schemeBtn) {
  schemeBtn.addEventListener("click", () => {
    const next = getScheme() === "light" ? "dark" : "light";
    schemeBtn.classList.remove("swapping");
    void schemeBtn.offsetWidth;
    schemeBtn.classList.add("swapping");
    setTimeout(() => schemeBtn.classList.remove("swapping"), 600);
    applyScheme(next, schemeBtn);
    try { localStorage.setItem(SCHEME_KEY, next); } catch { /* ignore */ }
    if (navigator.vibrate) navigator.vibrate(6);
  });
}

function followSystemScheme(schemeBtn) {
  if (!window.matchMedia) return;
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    // Only follow OS when the user hasn't manually overridden.
    if (!userHasSchemeOverride()) applyScheme("system", schemeBtn);
  };
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", onChange);
  } else if (typeof mq.addListener === "function") {
    // Safari < 14 fallback.
    mq.addListener(onChange);
  }
}

export function initTheme() {
  const moleBtn = document.getElementById("themeModeBtn");
  const modePill = document.getElementById("themeModePill");
  const schemeBtn = document.getElementById("themeSchemeBtn");

  // Apply (so aria-label is localised) using the attributes the boot script
  // already set on <html>. Don't overwrite the value, just re-derive labels.
  applyMode(getMode(), moleBtn, modePill);
  applyScheme(getScheme(), schemeBtn);

  if (moleBtn) wireMoleBtn(moleBtn, modePill);
  if (schemeBtn) {
    wireSchemeBtn(schemeBtn);
    followSystemScheme(schemeBtn);
  }

  // Refresh accessible labels + the visible mode pill when the user switches
  // language - same buttons, different copy.
  onLanguageChange(() => {
    applyMode(getMode(), moleBtn, modePill);
    applyScheme(getScheme(), schemeBtn);
  });
}
