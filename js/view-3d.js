/* view-3d.js — interactive globe with origin/antipode points and a tunnel arc.
 *
 * globe.gl is loaded via <script> in index.html and exposes window.Globe (UMD,
 * Three.js bundled inside). Module is lazy — only invoked the first time the
 * user switches to the 3D pane, so 2D-only visitors never pay the load.
 *
 * Public API:
 *   initView3D({ containerEl })   → { invalidateSize, pause, resume }
 */

import { antipodeOf } from "./antipode.js";
import { setCoords, onCoordsChange, getCoords } from "./state.js";

const ORIGIN_COLOR = "#ef5350";    // magma red
const ANTIPODE_COLOR = "#2f7fc1";  // sky-deep blue
const ARC_COLORS = ["#ef5350", "#2f7fc1"]; // gradient along the tunnel arc

const POINT_ALT = 0.01;
const POINT_RADIUS = 0.55;
const ARC_DASH_LEN = 0.4;
const ARC_DASH_GAP = 0.1;
const ARC_DASH_ANIM_MS = 4000;
const ARC_STROKE = 1.2;
const CAMERA_ALT = 2.5;
const FLY_MS = 1200;
const TURN_MS = 1500;
const TURN_DELAY_MS = 1500;
const IDLE_AUTOROTATE_SPEED = 0.3;
// Blue Marble texture from three-globe's examples. Pinned to a known-good
// version that's compatible with globe.gl 2.46.1's bundled three-globe.
const TEXTURE_URL = "https://unpkg.com/three-globe@2.31.0/example/img/earth-blue-marble.jpg";

let globe = null;
let container = null;
let secondFlyTimer = null;

function pointsFor(coords) {
  if (!coords) return [];
  const anti = antipodeOf(coords.lat, coords.lng);
  return [
    { lat: coords.lat, lng: coords.lng, color: ORIGIN_COLOR, kind: "origin" },
    { lat: anti.lat, lng: anti.lng, color: ANTIPODE_COLOR, kind: "antipode" },
  ];
}

function arcsFor(coords) {
  if (!coords) return [];
  const anti = antipodeOf(coords.lat, coords.lng);
  return [{
    startLat: coords.lat,
    startLng: coords.lng,
    endLat: anti.lat,
    endLng: anti.lng,
    color: ARC_COLORS,
  }];
}

function flyToPair(coords) {
  if (!globe || !coords) return;
  clearTimeout(secondFlyTimer);
  globe.pointOfView({ lat: coords.lat, lng: coords.lng, altitude: CAMERA_ALT }, FLY_MS);
  const anti = antipodeOf(coords.lat, coords.lng);
  secondFlyTimer = setTimeout(() => {
    if (!globe) return;
    globe.pointOfView({ lat: anti.lat, lng: anti.lng, altitude: CAMERA_ALT }, TURN_MS);
  }, FLY_MS + TURN_DELAY_MS);
}

function render(coords) {
  if (!globe) return;
  globe.pointsData(pointsFor(coords));
  globe.arcsData(arcsFor(coords));
}

function onStateUpdate(coords) {
  render(coords);
  // Don't yank the camera back to the user's just-clicked spot — they're
  // already looking at it.
  if (coords && coords.source !== "view-3d") flyToPair(coords);
}

function disableAutoRotate() {
  if (!globe) return;
  globe.controls().autoRotate = false;
}

export function initView3D({ containerEl, onReady } = {}) {
  if (!window.Globe) {
    console.warn("globe.gl (window.Globe) not loaded; 3D view disabled.");
    return null;
  }
  container = containerEl;

  globe = window.Globe({ rendererConfig: { antialias: true, powerPreference: "low-power" } })(containerEl)
    .globeImageUrl(TEXTURE_URL)
    .backgroundColor("rgba(0,0,0,0)")
    .pointAltitude(POINT_ALT)
    .pointRadius(POINT_RADIUS)
    .pointColor("color")
    .pointResolution(8)
    .arcColor("color")
    .arcStroke(ARC_STROKE)
    .arcDashLength(ARC_DASH_LEN)
    .arcDashGap(ARC_DASH_GAP)
    .arcDashAnimateTime(ARC_DASH_ANIM_MS)
    .onGlobeClick(({ lat, lng }) => {
      setCoords(lat, lng, "view-3d");
    })
    .onGlobeReady(() => {
      if (typeof onReady === "function") onReady();
    });

  // Performance: cap pixel ratio on high-DPR / mobile screens.
  const renderer = globe.renderer();
  if (renderer && typeof renderer.setPixelRatio === "function") {
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  }

  // Slow auto-rotate when idle; first interaction kills it for the session.
  const ctrls = globe.controls();
  ctrls.autoRotate = true;
  ctrls.autoRotateSpeed = IDLE_AUTOROTATE_SPEED;
  ctrls.addEventListener("start", disableAutoRotate);

  // Size globe to its container.
  const rect = containerEl.getBoundingClientRect();
  globe.width(rect.width).height(Math.max(rect.height, 320));

  // If state was already set before the globe existed (locator submit or 2D
  // click), catch up.
  const seed = getCoords();
  if (seed) {
    render(seed);
    flyToPair(seed);
  }

  onCoordsChange(onStateUpdate);

  return {
    invalidateSize() {
      if (!globe || !container) return;
      const r = container.getBoundingClientRect();
      globe.width(r.width).height(Math.max(r.height, 320));
    },
    pause() {
      if (globe && typeof globe.pauseAnimation === "function") globe.pauseAnimation();
    },
    resume() {
      if (globe && typeof globe.resumeAnimation === "function") globe.resumeAnimation();
    },
  };
}
