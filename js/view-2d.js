/* view-2d.js — twin Leaflet maps: origin (clickable) + antipode (read-only).
 *
 * Leaflet is loaded via <script> in index.html and exposes window.L (UMD build).
 * This module is only imported by code paths that have already verified the
 * map containers exist (main.js boot guard), so we do not re-check here.
 *
 * Public API:
 *   initView2D({ originEl, antipodeEl })   Create both maps, subscribe to state.
 */

import { antipodeOf } from "./antipode.js";
import { setCoords, onCoordsChange, getCoords } from "./state.js";
import { t, onLanguageChange } from "./i18n.js";

const ORIGIN_EMOJI = "🕳️";
const ANTIPODE_EMOJI = "🌊";
const DEFAULT_VIEW = { center: [20, 0], zoom: 2 };
const FOCUS_ZOOM = 4;
const DRILL_MS = 1500;

let originMap = null;
let antipodeMap = null;
let originMarker = null;
let antipodeMarker = null;
let currentAttribution = null;
let drillingOverlay = null;
let drillTimer = null;

function makeBubbleIcon(emoji) {
  return window.L.divIcon({
    className: "marker-icon",
    html: `<div class="marker-bubble" aria-hidden="true">${emoji}</div>`,
    iconSize: null,
  });
}

function setMarker(map, current, lat, lng, emoji) {
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

function showDrillingOverlay() {
  if (!drillingOverlay) return;
  clearTimeout(drillTimer);
  // Toggle hidden off + force reflow so the keyframes restart on rapid clicks.
  drillingOverlay.hidden = true;
  void drillingOverlay.offsetWidth;
  drillingOverlay.hidden = false;
  drillTimer = setTimeout(() => {
    drillingOverlay.hidden = true;
  }, DRILL_MS);
}

function refreshAttribution() {
  const next = t("view.mapAttribution");
  // The same string is registered on both maps; remove the old, add the new.
  [originMap, antipodeMap].forEach((m) => {
    if (!m) return;
    if (currentAttribution) m.attributionControl.removeAttribution(currentAttribution);
    m.attributionControl.addAttribution(next);
  });
  currentAttribution = next;
}

function createTileLayer() {
  return window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    crossOrigin: "anonymous",
    // We add attribution via map.attributionControl.addAttribution so it can
    // be re-localized on language change. Pass empty here to avoid duplicates.
    attribution: "",
  });
}

function onState({ lat, lng, source }) {
  // Always update the antipode marker.
  const anti = antipodeOf(lat, lng);
  originMarker = setMarker(originMap, originMarker, lat, lng, ORIGIN_EMOJI);
  antipodeMarker = setMarker(antipodeMap, antipodeMarker, anti.lat, anti.lng, ANTIPODE_EMOJI);

  // Don't yank the camera if the user is dragging the same map we'd be flying.
  if (source !== "view-2d-origin") {
    originMap.flyTo([lat, lng], FOCUS_ZOOM, { duration: 1.0 });
  }
  antipodeMap.flyTo([anti.lat, anti.lng], FOCUS_ZOOM, { duration: 1.0 });

  showDrillingOverlay();
}

export function initView2D({ originEl, antipodeEl, drillingEl }) {
  if (!window.L) {
    console.warn("Leaflet (window.L) not loaded; 2D view disabled.");
    return;
  }
  drillingOverlay = drillingEl || null;

  originMap = window.L.map(originEl, {
    center: DEFAULT_VIEW.center,
    zoom: DEFAULT_VIEW.zoom,
    worldCopyJump: true,
    zoomControl: true,
  });
  antipodeMap = window.L.map(antipodeEl, {
    center: DEFAULT_VIEW.center,
    zoom: DEFAULT_VIEW.zoom,
    zoomControl: false,
    dragging: false,
    doubleClickZoom: false,
    scrollWheelZoom: false,
    boxZoom: false,
    keyboard: false,
    tap: false,
    touchZoom: false,
  });

  createTileLayer().addTo(originMap);
  createTileLayer().addTo(antipodeMap);

  // Drop Leaflet's "Leaflet" branding prefix; we'll manage attribution ourselves.
  originMap.attributionControl.setPrefix(false);
  antipodeMap.attributionControl.setPrefix(false);
  refreshAttribution();

  // Click on origin map → set state. State subscriber updates both maps.
  originMap.on("click", (e) => {
    setCoords(e.latlng.lat, e.latlng.lng, "view-2d-origin");
  });

  // Subscribe to state changes (locator, map clicks, future 3D view).
  onCoordsChange(onState);

  // Live-update the attribution text when the language toggles.
  onLanguageChange(refreshAttribution);

  // If state was set before the map existed (e.g. locator submitted first),
  // catch up.
  const seed = getCoords();
  if (seed) onState(seed);

  // Leaflet measures container size at create time. If the view is hidden
  // (display: none) when init runs, tiles render blank until invalidated.
  // Expose a helper so main.js can call this after un-hiding.
  return {
    invalidateSize() {
      originMap.invalidateSize();
      antipodeMap.invalidateSize();
    },
  };
}
