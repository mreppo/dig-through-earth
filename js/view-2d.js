/* view-2d.js - single Leaflet map with origin + antipode markers and an arc.
 *
 * Leaflet is loaded via <script> in index.html and exposes window.L (UMD).
 *
 * The map fills its own screen in the multi-screen shell. Click on the map
 * sets coords via state.js; the state subscriber updates both markers, the
 * arc, and the bottom peek card. Camera flies to the new origin (the
 * antipode would be on the far side of the projection).
 *
 * Public API:
 *   initView2D({ containerEl, peekEls, drillingEl })
 *     containerEl: <div id="map">
 *     peekEls: { peek, fromEl, toEl, kmEl } - the floating bottom card
 *     drillingEl: <div id="drilling-overlay">
 *     Returns { invalidateSize }.
 */

import { antipodeOf, distanceThroughEarth } from "./antipode.js";
import { setCoords, onCoordsChange, getCoords } from "./state.js";
import { t, onLanguageChange } from "./i18n.js";

const ORIGIN_EMOJI = "🕳️";
const ANTIPODE_EMOJI = "🌊";
const DEFAULT_VIEW = { center: [30, 10], zoom: 2 };
const FOCUS_ZOOM = 4;
const DRILL_MS = 1500;

let map = null;
let originMarker = null;
let antipodeMarker = null;
let arcLine = null;
let currentAttribution = null;
let drillingOverlay = null;
let drillTimer = null;
let peekState = null;

function makeBubbleIcon(emoji) {
  return window.L.divIcon({
    className: "marker-icon",
    html: `<div class="marker-bubble" aria-hidden="true">${emoji}</div>`,
    iconSize: null,
  });
}

function setMarker(current, lat, lng, emoji) {
  if (current) {
    current.setLatLng([lat, lng]);
    return current;
  }
  return window.L.marker([lat, lng], {
    icon: makeBubbleIcon(emoji),
    keyboard: false,
    interactive: false,
  }).addTo(map);
}

function drawArc(lat, lng) {
  const anti = antipodeOf(lat, lng);
  // Leaflet polylines render straight in the Mercator projection. Through
  // the antipode the line wraps the globe horizontally; segment it across
  // the dateline so the path renders left + right of the visible map.
  const segments = [
    [[lat, lng], [anti.lat, anti.lng]],
  ];
  if (arcLine) {
    arcLine.setLatLngs(segments);
    return;
  }
  arcLine = window.L.polyline(segments, {
    color: "#FFB627",
    weight: 2.5,
    opacity: 0.8,
    dashArray: "2 6",
    interactive: false,
  }).addTo(map);
}

function showDrillingOverlay() {
  if (!drillingOverlay) return;
  clearTimeout(drillTimer);
  drillingOverlay.hidden = true;
  void drillingOverlay.offsetWidth;
  drillingOverlay.hidden = false;
  drillTimer = setTimeout(() => {
    drillingOverlay.hidden = true;
  }, DRILL_MS);
}

function formatKm(km) {
  return new Intl.NumberFormat(document.documentElement.lang === "lv" ? "lv-LV" : "en-US", {
    maximumFractionDigits: 0,
  }).format(km);
}

function refreshPeek(origin, antipode) {
  if (!peekState) return;
  peekState.fromEl.textContent = origin || t("results.youTag");
  peekState.toEl.textContent = antipode || t("results.openOcean");
  peekState.kmEl.textContent = `${formatKm(distanceThroughEarth())} ${t("results.kmUnit")}`;
  peekState.peek.hidden = false;
}

function refreshAttribution() {
  if (!map) return;
  const next = t("view.mapAttribution");
  if (currentAttribution) map.attributionControl.removeAttribution(currentAttribution);
  map.attributionControl.addAttribution(next);
  currentAttribution = next;
}

function createTileLayer() {
  return window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    crossOrigin: "anonymous",
    attribution: "",
  });
}

function onState({ lat, lng, source }) {
  const anti = antipodeOf(lat, lng);
  originMarker = setMarker(originMarker, lat, lng, ORIGIN_EMOJI);
  antipodeMarker = setMarker(antipodeMarker, anti.lat, anti.lng, ANTIPODE_EMOJI);
  drawArc(lat, lng);

  // Don't yank the camera if the user is dragging the same map.
  if (source !== "view-2d-origin") {
    map.flyTo([lat, lng], FOCUS_ZOOM, { duration: 1.0 });
  }
  showDrillingOverlay();
}

export function initView2D({ containerEl, peekEls, drillingEl }) {
  if (!window.L) {
    console.warn("Leaflet (window.L) not loaded; 2D view disabled.");
    return null;
  }
  drillingOverlay = drillingEl || null;
  peekState = peekEls || null;

  map = window.L.map(containerEl, {
    center: DEFAULT_VIEW.center,
    zoom: DEFAULT_VIEW.zoom,
    worldCopyJump: true,
    zoomControl: true,
  });

  createTileLayer().addTo(map);

  // We manage attribution ourselves so it can be re-localised.
  map.attributionControl.setPrefix(false);
  refreshAttribution();

  map.on("click", (e) => {
    setCoords(e.latlng.lat, e.latlng.lng, "view-2d-origin");
  });

  onCoordsChange(onState);
  onLanguageChange(() => {
    refreshAttribution();
    // Re-render peek with the new language.
    const seed = getCoords();
    if (seed) {
      const a = antipodeOf(seed.lat, seed.lng);
      refreshPeek(null, null);
      void a;
    }
  });

  const seed = getCoords();
  if (seed) onState(seed);

  return {
    invalidateSize() {
      map.invalidateSize();
    },
    setPeek(origin, antipode) {
      refreshPeek(origin, antipode);
    },
  };
}
