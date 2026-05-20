/* main.js — entry point. Wires i18n, view toggle, locator, and the 2D map view.
 *
 * Shared coord state lives in js/state.js. Any source (locator submit, map
 * click, future 3D globe) calls setCoords; subscribers handle the rest.
 */

import { initI18n, t, onLanguageChange, getLanguage } from "./i18n.js";
import { antipodeOf, distanceThroughEarth, surfaceDistance } from "./antipode.js";
import { requestGeolocation, validateCoords, reverseGeocode } from "./location.js";
import { setCoords, onCoordsChange } from "./state.js";
import { initView2D } from "./view-2d.js";

const els = {};
let lastComputation = null; // remember the inputs so we can re-render on language change
let view2D = null;

function cacheEls() {
  els.geoBtn = document.getElementById("locator-geo");
  els.geoLabel = document.getElementById("locator-geo-label");
  els.form = document.getElementById("locator-form");
  els.latInput = document.getElementById("locator-lat");
  els.lngInput = document.getElementById("locator-lng");
  els.error = document.getElementById("locator-error");
  els.placeholder = document.getElementById("results-placeholder");
  els.body = document.getElementById("results-body");
  els.originName = document.getElementById("results-origin-name");
  els.originCoords = document.getElementById("results-origin-coords");
  els.antipodeName = document.getElementById("results-antipode-name");
  els.antipodeCoords = document.getElementById("results-antipode-coords");
  els.distanceThrough = document.getElementById("results-distance-through");
  els.distanceSurface = document.getElementById("results-distance-surface");
  els.funFactAntipode = document.getElementById("results-fun-fact-antipode");
  els.funFactWater = document.getElementById("results-fun-fact-water");
  els.mapOrigin = document.getElementById("map-origin");
  els.mapAntipode = document.getElementById("map-antipode");
  els.drilling = document.getElementById("drilling-overlay");
  els.viewPanes = document.querySelectorAll("[data-view-pane]");
}

function wireViewToggle() {
  const buttons = document.querySelectorAll("[data-view]");
  if (!buttons.length) return;
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const chosen = btn.getAttribute("data-view");
      buttons.forEach((b) => {
        b.setAttribute("aria-pressed", String(b.getAttribute("data-view") === chosen));
      });
      els.viewPanes.forEach((pane) => {
        pane.hidden = pane.getAttribute("data-view-pane") !== chosen;
      });
      // Leaflet measures its container at create time; if it was hidden when
      // initialised it renders blank tiles. Recompute size whenever 2D shows.
      if (chosen === "2d" && view2D) view2D.invalidateSize();
    });
  });
}

function clearError() {
  els.error.hidden = true;
  els.error.textContent = "";
}

function showError(i18nKey) {
  els.error.textContent = t(i18nKey);
  els.error.hidden = false;
}

function formatNumber(value, fractionDigits) {
  const locale = getLanguage() === "lv" ? "lv-LV" : "en-US";
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(value);
}

function placeNameFor(geo) {
  if (geo.failed) return t("results.mysterious");
  if (geo.isWater) return t("results.openOcean");
  return geo.displayName || t("results.mysterious");
}

function render(comp) {
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

  els.distanceThrough.textContent = t("results.distanceThrough", {
    km: formatNumber(distanceThroughEarth(), 0),
  });
  const surfaceKm = surfaceDistance(origin.lat, origin.lng, antipode.lat, antipode.lng);
  els.distanceSurface.textContent = t("results.distanceSurface", {
    km: formatNumber(surfaceKm, 0),
  });

  // Always introduce the scientific term; add the water stat after it when relevant.
  els.funFactAntipode.textContent = t("results.funFactAntipode");
  if (antipode.isWater) {
    els.funFactWater.textContent = t("results.funFactWater");
    els.funFactWater.hidden = false;
  } else {
    els.funFactWater.textContent = "";
    els.funFactWater.hidden = true;
  }

  els.placeholder.hidden = true;
  els.body.hidden = false;
}

async function reverseGeocodeAndRender(lat, lng) {
  const anti = antipodeOf(lat, lng);
  const [origin, antipode] = await Promise.all([
    reverseGeocode(lat, lng),
    reverseGeocode(anti.lat, anti.lng),
  ]);
  lastComputation = { origin, antipode };
  render(lastComputation);
}

function onStateChange({ lat, lng, source }) {
  // Keep manual inputs in sync (e.g., the user clicked a map).
  if (source !== "locator" && els.latInput) {
    els.latInput.value = lat.toFixed(4);
    els.lngInput.value = lng.toFixed(4);
  }
  reverseGeocodeAndRender(lat, lng).catch((err) => {
    console.error("reverse-geocode failed:", err);
    if (els.error) showError("locator.errors.timeout");
  });
}

async function onSubmit(e) {
  e.preventDefault();
  clearError();
  const v = validateCoords(els.latInput.value, els.lngInput.value);
  if (!v.ok) {
    showError(v.error);
    return;
  }
  setCoords(v.lat, v.lng, "locator");
}

async function onUseLocation() {
  clearError();
  els.geoLabel.textContent = t("locator.locating");
  els.geoBtn.disabled = true;
  try {
    const { lat, lng } = await requestGeolocation();
    setCoords(lat, lng, "locator");
  } catch (err) {
    const key = err && err.code === "denied"
      ? "locator.errors.denied"
      : err && err.code === "timeout"
        ? "locator.errors.timeout"
        : "locator.errors.unsupported";
    showError(key);
  } finally {
    els.geoBtn.disabled = false;
    els.geoLabel.textContent = t("locator.useMyLocation");
  }
}

function wireLocator() {
  // main.js is loaded by 404.html too — guard so missing elements don't throw.
  if (!els.geoBtn || !els.form) return;
  els.geoBtn.addEventListener("click", onUseLocation);
  els.form.addEventListener("submit", onSubmit);
}

function bootViewToggleAndMap() {
  if (!els.mapOrigin || !els.mapAntipode) return; // 404.html path
  wireViewToggle();
  view2D = initView2D({
    originEl: els.mapOrigin,
    antipodeEl: els.mapAntipode,
    drillingEl: els.drilling,
  });
}

async function boot() {
  cacheEls();
  try {
    await initI18n();
  } catch (err) {
    console.error("i18n init failed:", err);
  }
  bootViewToggleAndMap();
  wireLocator();
  // Re-render results on language change.
  onLanguageChange(() => {
    if (lastComputation) render(lastComputation);
  });
  // Subscribe AFTER view-2d so map markers and result panel both update.
  onCoordsChange(onStateChange);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
