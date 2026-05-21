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
import { initView3D } from "./view-3d.js";

const els = {};
let lastComputation = null; // remember the inputs so we can re-render on language change
let view2D = null;
let view3D = null; // lazy: only initialised when the user first opens the 3D pane

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
  els.globe = document.getElementById("globe-3d");
  els.globeLoading = document.getElementById("globe-loading");
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
  // Lazy: only build the globe the first time the user opens the 3D pane.
  // Saves ~1.8 MB of JS + WebGL context for 2D-only visitors.
  if (view3D || !els.globe) return view3D;
  if (!hasWebGL() || !window.Globe) {
    if (els.globeLoading) {
      // Re-target the i18n key too, otherwise the next applyTranslations()
      // (any language toggle) would revert this back to the loading caption.
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
  // Fallback if onGlobeReady never fires (older globe.gl, headless tests, etc.).
  setTimeout(() => {
    if (els.globeLoading && !els.globeLoading.hidden) els.globeLoading.hidden = true;
  }, 4000);
  return view3D;
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
      // Lazy-init globe on first 3D switch; pause/resume to save CPU + battery.
      if (chosen === "3d") {
        ensureView3D();
        if (view3D) {
          view3D.invalidateSize();
          view3D.resume();
        }
      } else if (view3D) {
        view3D.pause();
      }
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
    // Populate the input fields here. onStateChange skips input-sync when
    // source === "locator" to preserve what the user typed; geolocation is
    // a "locator" source that DOES need to fill the inputs, so we do it
    // explicitly at this call site.
    els.latInput.value = lat.toFixed(4);
    els.lngInput.value = lng.toFixed(4);
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
