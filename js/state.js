/* state.js — tiny pub/sub for the user's selected coordinate.
 *
 * Multiple views (locator form, 2D map, future 3D globe) need to agree on
 * "the spot the kid picked." Anyone can call setCoords; anyone can subscribe.
 *
 * Public API:
 *   setCoords(lat, lng, source?)   Set the active coordinate. source is a free-form
 *                                   tag (e.g. "locator", "view-2d") so subscribers
 *                                   can ignore events they themselves emitted.
 *   getCoords()                     Current { lat, lng, source } or null.
 *   onCoordsChange(fn)              Subscribe; returns an unsubscribe function.
 */

let current = null;
const listeners = new Set();

export function setCoords(lat, lng, source = "unknown") {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new TypeError("setCoords: lat/lng must be finite numbers");
  }
  current = { lat, lng, source };
  for (const fn of listeners) {
    try { fn(current); } catch (e) { console.error("state listener failed:", e); }
  }
}

export function getCoords() {
  return current;
}

export function onCoordsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
