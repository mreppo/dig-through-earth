/* antipode.js — pure math. No DOM. No side effects.
 *
 * Coordinate convention: latitude in [-90, 90], longitude in [-180, 180], degrees.
 */

const EARTH_MEAN_RADIUS_KM = 6371;
const EARTH_MEAN_DIAMETER_KM = 12742;

function assertFiniteNumber(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number, got ${value}`);
  }
}

function assertLat(lat) {
  assertFiniteNumber(lat, "latitude");
  if (lat < -90 || lat > 90) {
    throw new RangeError(`latitude must be between -90 and 90, got ${lat}`);
  }
}

function assertLng(lng) {
  assertFiniteNumber(lng, "longitude");
  if (lng < -180 || lng > 180) {
    throw new RangeError(`longitude must be between -180 and 180, got ${lng}`);
  }
}

/**
 * Return the antipodal point (the spot on the exact opposite side of Earth).
 *   antipodeOf(lat, lng) → { lat: -lat, lng: lng ± 180 normalised to (-180, 180] }
 */
export function antipodeOf(lat, lng) {
  assertLat(lat);
  assertLng(lng);

  const antiLat = -lat;
  let antiLng = lng + 180;
  // Normalise to (-180, 180]: keep 180 as-is, fold anything past it.
  if (antiLng > 180) antiLng -= 360;
  return { lat: antiLat, lng: antiLng };
}

/** Mean diameter of Earth in km — the straight-line distance to your antipode. */
export function distanceThroughEarth() {
  return EARTH_MEAN_DIAMETER_KM;
}

/** Great-circle distance in km between two coords via the haversine formula. */
export function surfaceDistance(latA, lngA, latB, lngB) {
  assertLat(latA);
  assertLng(lngA);
  assertLat(latB);
  assertLng(lngB);

  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(latB - latA);
  const dLng = toRad(lngB - lngA);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_MEAN_RADIUS_KM * c;
}
