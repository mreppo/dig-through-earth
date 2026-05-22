/* main.js - entry point. Wires i18n, theme, router, locator, result, view-2d, view-3d, quiz.
 *
 * Multi-screen shell: locator -> drilling overlay -> result -> map/globe/quiz.
 * Map and globe canvases stay in the DOM at all times; only their parent
 * screen toggles visible. The 3D globe stays lazy - only instantiates on
 * first switch to the globe screen.
 */

import { initI18n, t, onLanguageChange, getLanguage } from "./i18n.js";
import { antipodeOf, distanceThroughEarth, surfaceDistance } from "./antipode.js";
import {
  requestGeolocation,
  reverseGeocode,
  searchPlace,
  EU_CITIES,
} from "./location.js";
import { setCoords, onCoordsChange } from "./state.js";
import { initView2D } from "./view-2d.js";
import { initView3D } from "./view-3d.js";
import { initQuiz, ensureQuizStarted } from "./quiz.js";
import { initTheme } from "./theme.js";
import { initRouter, showScreen } from "./router.js";
import { initPwa } from "./pwa.js";
import { initAutocomplete } from "./autocomplete.js";

const els = {};
let lastComputation = null;
let view2D = null;
let view3D = null;

function cacheEls() {
  els.locatorError = document.getElementById("locator-error");
  els.searchForm = document.getElementById("locator-search");
  els.searchInput = document.getElementById("locator-search-input");
  els.drilling = document.getElementById("drilling-overlay");

  els.resultPlaceholder = document.getElementById("result-placeholder");
  els.resultBody = document.getElementById("result-body");
  els.originName = document.getElementById("result-origin-name");
  els.originCoords = document.getElementById("result-origin-coords");
  els.antipodeName = document.getElementById("result-antipode-name");
  els.antipodeCoords = document.getElementById("result-antipode-coords");
  els.statThrough = document.getElementById("result-stat-through");
  els.statSurface = document.getElementById("result-stat-surface");
  els.funFactAntipode = document.getElementById("result-fun-fact-antipode");
  els.funFactWater = document.getElementById("result-fun-fact-water");

  els.map = document.getElementById("map");
  els.mapPeek = document.getElementById("map-peek");
  els.mapPeekFrom = document.getElementById("map-peek-from");
  els.mapPeekTo = document.getElementById("map-peek-to");
  els.mapPeekKm = document.getElementById("map-peek-km");

  els.globe = document.getElementById("globe-3d");
  els.globeLoading = document.getElementById("globe-loading");
  els.globePeek = document.getElementById("globe-peek");
  els.globePeekKm = document.getElementById("globe-peek-km");

  els.quizSection = document.querySelector("[data-quiz-section]");
}

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext &&
      (c.getContext("webgl") || c.getContext("experimental-webgl")));
  } catch {
    return false;
  }
}

function ensureView3D() {
  if (view3D || !els.globe) return view3D;
  if (!hasWebGL() || !window.Globe) {
    if (els.globeLoading) {
      els.globeLoading.setAttribute("data-i18n", "view.globeUnsupported");
      els.globeLoading.textContent = t("view.globeUnsupported");
    }
    return null;
  }
  view3D = initView3D({
    containerEl: els.globe,
    onReady: () => {
      if (els.globeLoading) els.globeLoading.hidden = true;
    },
  });
  setTimeout(() => {
    if (els.globeLoading && !els.globeLoading.hidden) els.globeLoading.hidden = true;
  }, 4000);
  return view3D;
}

function formatNumber(value, fractionDigits) {
  const locale = getLanguage() === "lv" ? "lv-LV" : "en-US";
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(value);
}

function placeNameFor(geo) {
  if (!geo) return t("results.mysterious");
  if (geo.failed) return t("results.mysterious");
  if (geo.isWater) return t("results.openOcean");
  return geo.displayName || t("results.mysterious");
}

function shortName(name) {
  if (!name) return "";
  // Nominatim returns long comma-joined display names. Trim to first 2 parts.
  return name.split(",").slice(0, 2).join(",").trim();
}

function renderResult(comp) {
  const { origin, antipode } = comp;

  els.originName.textContent = placeNameFor(origin);
  els.originCoords.textContent = t("results.coords", {
    lat: formatNumber(origin.lat, 2),
    lng: formatNumber(origin.lng, 2),
  });

  els.antipodeName.textContent = placeNameFor(antipode);
  els.antipodeCoords.textContent = t("results.coords", {
    lat: formatNumber(antipode.lat, 2),
    lng: formatNumber(antipode.lng, 2),
  });

  const km = formatNumber(distanceThroughEarth(), 0);
  const surf = formatNumber(
    surfaceDistance(origin.lat, origin.lng, antipode.lat, antipode.lng),
    0
  );
  const unit = t("results.kmUnit");
  els.statThrough.textContent = `${km} ${unit}`;
  els.statSurface.textContent = `${surf} ${unit}`;

  els.funFactAntipode.textContent = t("results.funFactAntipode");
  if (antipode.isWater) {
    els.funFactWater.textContent = t("results.funFactWater");
    els.funFactWater.hidden = false;
  } else {
    els.funFactWater.textContent = "";
    els.funFactWater.hidden = true;
  }

  els.resultPlaceholder.hidden = true;
  els.resultBody.hidden = false;

  // Peeks
  const originShort = shortName(placeNameFor(origin));
  const antiShort = shortName(placeNameFor(antipode));
  if (els.mapPeek) {
    els.mapPeekFrom.textContent = originShort || t("results.youTag");
    els.mapPeekTo.textContent = antiShort || t("results.openOcean");
    els.mapPeekKm.textContent = `${km} ${unit}`;
    els.mapPeek.hidden = false;
  }
  if (els.globePeek) {
    els.globePeekKm.textContent = `${km} ${unit}`;
    els.globePeek.hidden = false;
  }
}

function clearError() {
  if (!els.locatorError) return;
  els.locatorError.hidden = true;
  els.locatorError.textContent = "";
}

function showError(i18nKey) {
  if (!els.locatorError) return;
  els.locatorError.textContent = t(i18nKey);
  els.locatorError.hidden = false;
}

async function reverseGeocodeAndRender(lat, lng) {
  const anti = antipodeOf(lat, lng);
  const [origin, antipode] = await Promise.all([
    reverseGeocode(lat, lng),
    reverseGeocode(anti.lat, anti.lng),
  ]);
  lastComputation = { origin, antipode };
  renderResult(lastComputation);
}

function onStateChange({ lat, lng }) {
  reverseGeocodeAndRender(lat, lng).catch((err) => {
    console.error("reverse-geocode failed:", err);
    showError("locator.errors.timeout");
  });
}

function runDrillThenGoToResult() {
  if (!els.drilling) {
    showScreen("result");
    return;
  }
  // Clone the existing CSS animation by toggling hidden off and forcing reflow.
  els.drilling.hidden = false;
  // Drilling overlay has its own 1.5s fade animation; route after 1.3s.
  setTimeout(() => {
    els.drilling.hidden = true;
    showScreen("result");
  }, 1300);
}

async function onGpsClick() {
  clearError();
  try {
    const { lat, lng } = await requestGeolocation();
    setCoords(lat, lng, "locator-gps");
    runDrillThenGoToResult();
  } catch (err) {
    const key = err && err.code === "denied"
      ? "locator.errors.denied"
      : err && err.code === "timeout"
        ? "locator.errors.timeout"
        : "locator.errors.unsupported";
    showError(key);
  }
}

function onMapMethodClick() {
  // "Tap a map" routes to the map screen and lets the user pick.
  showScreen("map");
}

function onCityChipClick(key) {
  const c = EU_CITIES[key];
  if (!c) return;
  clearError();
  setCoords(c.lat, c.lng, "locator-city");
  runDrillThenGoToResult();
}

async function onSearchSubmit(e) {
  e.preventDefault();
  clearError();
  const q = els.searchInput.value;
  const hit = await searchPlace(q);
  if (!hit) {
    showError("locator.errors.noMatch");
    return;
  }
  setCoords(hit.lat, hit.lng, "locator-search");
  runDrillThenGoToResult();
}

function wireLocator() {
  document.querySelectorAll("[data-method]").forEach((btn) => {
    const m = btn.dataset.method;
    if (m === "gps") btn.addEventListener("click", onGpsClick);
    if (m === "map") btn.addEventListener("click", onMapMethodClick);
  });
  document.querySelectorAll("[data-city]").forEach((chip) => {
    chip.addEventListener("click", () => onCityChipClick(chip.dataset.city));
  });
  if (els.searchForm) els.searchForm.addEventListener("submit", onSearchSubmit);
  if (els.searchForm && els.searchInput) {
    initAutocomplete({
      formEl: els.searchForm,
      inputEl: els.searchInput,
      getLang: getLanguage,
      onPick: ({ lat, lng }) => {
        clearError();
        setCoords(lat, lng, "locator-autocomplete");
        runDrillThenGoToResult();
      },
    });
  }
}

function bootView2D() {
  if (!els.map || !window.L) return;
  view2D = initView2D({
    containerEl: els.map,
    peekEls: {
      peek: els.mapPeek,
      fromEl: els.mapPeekFrom,
      toEl: els.mapPeekTo,
      kmEl: els.mapPeekKm,
    },
    drillingEl: els.drilling,
  });
}

function onScreenChange(id) {
  // Leaflet measures container at create time; invalidate when its screen
  // becomes visible so blank tiles don't appear.
  if (id === "map" && view2D) view2D.invalidateSize();
  if (id === "globe") {
    ensureView3D();
    if (view3D) {
      view3D.invalidateSize();
      view3D.resume();
    }
  } else if (view3D) {
    view3D.pause();
  }
  if (id === "quiz") ensureQuizStarted();
}

async function boot() {
  cacheEls();
  try {
    await initI18n();
  } catch (err) {
    console.error("i18n init failed:", err);
  }
  initTheme();
  bootView2D();
  wireLocator();
  initQuiz({ triggerEl: null, sectionEl: els.quizSection });
  // PWA install handlers + service worker registration. Runs after i18n so
  // toast / aria-label strings resolve in the active language.
  initPwa();

  initRouter({ onScreenChange });

  onLanguageChange(() => {
    if (lastComputation) renderResult(lastComputation);
  });
  onCoordsChange(onStateChange);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
