/* location.js — geolocation, manual input validation, and Nominatim reverse-geocode.
 *
 * Public API:
 *   requestGeolocation()                → Promise<{lat, lng}> or rejects with { code }
 *   validateCoords(latStr, lngStr)      → { ok, lat?, lng?, error? }   (error is an i18n key)
 *   reverseGeocode(lat, lng)            → Promise<{lat, lng, displayName, isWater}>
 *
 * Nominatim usage policy compliance:
 *   - Rate limited to <= 1 request per second (project-wide queue below).
 *   - Browsers forbid overriding User-Agent from fetch(), so we identify via the
 *     automatic Referer header plus an `email` query param when available.
 *   - Results cached in memory, keyed by coords rounded to ~10 km (0.1°).
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";
const RATE_LIMIT_MS = 1100; // small margin over Nominatim's 1 req/sec
const GEO_TIMEOUT_MS = 8000;

const cache = new Map();
let lastRequestAt = 0;
let queue = Promise.resolve();

function roundedKey(lat, lng) {
  return `${lat.toFixed(1)},${lng.toFixed(1)}`;
}

export function requestGeolocation() {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject({ code: "unsupported" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) reject({ code: "denied" });
        else if (err.code === err.TIMEOUT) reject({ code: "timeout" });
        else reject({ code: "unavailable" });
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: GEO_TIMEOUT_MS }
    );
  });
}

export function validateCoords(latStr, lngStr) {
  const rawLat = (latStr ?? "").toString().trim();
  const rawLng = (lngStr ?? "").toString().trim();
  if (rawLat === "" || rawLng === "") {
    return { ok: false, error: "locator.errors.missing" };
  }
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return { ok: false, error: "locator.errors.invalidLat" };
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    return { ok: false, error: "locator.errors.invalidLng" };
  }
  return { ok: true, lat, lng };
}

function waitForSlot() {
  const now = Date.now();
  const wait = Math.max(0, lastRequestAt + RATE_LIMIT_MS - now);
  return new Promise((res) => setTimeout(res, wait));
}

async function fetchNominatim(lat, lng) {
  await waitForSlot();
  lastRequestAt = Date.now();
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", lat.toString());
  url.searchParams.set("lon", lng.toString());
  url.searchParams.set("zoom", "10");
  url.searchParams.set("addressdetails", "0");
  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "Accept-Language": document.documentElement.lang || "en",
    },
  });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  return res.json();
}

function shapeNominatimResult(lat, lng, json) {
  if (!json || json.error || !json.display_name) {
    return { lat, lng, displayName: null, isWater: true };
  }
  const isWater = json.type === "water" || json.category === "water";
  return {
    lat,
    lng,
    displayName: json.display_name,
    isWater: Boolean(isWater),
  };
}

export function reverseGeocode(lat, lng) {
  const key = roundedKey(lat, lng);
  if (cache.has(key)) return cache.get(key);

  // Serialize through the queue so requests stay >= RATE_LIMIT_MS apart even
  // when called concurrently (origin + antipode in the same submission).
  const inFlight = queue.then(() => fetchNominatim(lat, lng))
    .then((json) => shapeNominatimResult(lat, lng, json));
  // Keep the queue going even if one request errors.
  queue = inFlight.catch(() => {});

  // Cache the in-flight promise so concurrent callers share one request.
  // On failure, evict so the next call can retry — we never want a transient
  // network error to become permanent for the session.
  const shared = inFlight.catch(() => {
    cache.delete(key);
    return { lat, lng, displayName: null, isWater: false, failed: true };
  });
  cache.set(key, shared);
  return shared;
}
