/* sw.js - Dig Through Earth service worker.
 *
 * Strategies:
 *   - Navigations (HTML)        -> network-first, fall back to cached index.
 *   - Same-origin static assets -> cache-first (precached at install).
 *   - Cross-origin (OSM tiles,
 *     unpkg CDNs, Nominatim,
 *     cartocdn basemaps)        -> network-only, never cached.
 *
 * The precache list is the full app shell - every file the SPA needs to render
 * its initial screen offline. Bump CACHE_VERSION on every change to invalidate
 * old caches. skipWaiting + clients.claim make a fresh worker active on the
 * next page load; the page listens for `controllerchange` to surface a reload
 * toast.
 *
 * The base path is intentionally derived from the SW's own URL via
 * registration.scope so the worker keeps working under /dig-through-earth/
 * on GitHub Pages as well as at the root on any other host.
 *
 * No tracking, no analytics, no telemetry. Kids' site.
 */

const CACHE_VERSION = "dte-v1-2026-05-21";
const PRECACHE = `${CACHE_VERSION}-precache`;
const RUNTIME = `${CACHE_VERSION}-runtime`;

// Paths are relative to the SW's scope. The browser resolves these against the
// SW URL when registered with `{ scope: './' }`.
const APP_SHELL = [
  "./",
  "./index.html",
  "./404.html",
  "./manifest.webmanifest",
  "./css/tokens.css",
  "./css/main.css",
  "./js/main.js",
  "./js/i18n.js",
  "./js/state.js",
  "./js/antipode.js",
  "./js/location.js",
  "./js/view-2d.js",
  "./js/view-3d.js",
  "./js/quiz.js",
  "./js/theme.js",
  "./js/router.js",
  "./js/pwa.js",
  "./i18n/en.json",
  "./i18n/lv.json",
  "./assets/favicon.svg",
  "./assets/favicon-32.png",
  "./assets/favicon-192.png",
  "./assets/apple-touch-icon.png",
  "./assets/icons/icon-192-any.png",
  "./assets/icons/icon-512-any.png",
  "./assets/icons/icon-512-maskable.png",
];

// Note on cross-origin: every cross-origin request (OSM tiles, Nominatim,
// unpkg, jsdelivr, Google Fonts, future Carto basemaps) passes straight
// through to the network. We do not cache them because the tile / response
// volume would dwarf the storage quota, and a stale tile cache would mislead
// kids about where they are. If offline, Leaflet tiles go blank and
// Nominatim throws - both already handled by the app.

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PRECACHE).then((cache) => cache.addAll(APP_SHELL))
  );
  // Do NOT call self.skipWaiting() here. The page listens for
  // `controllerchange` and unconditionally reloads, so any silent activation
  // would yank quiz / locator state from under an active user. The
  // "New version, reload?" toast is the only path to activation: when the
  // user clicks Reload, the page postMessages SKIP_WAITING (handled below),
  // the new worker takes control, `controllerchange` fires, and the page
  // reloads exactly once - intentionally.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== PRECACHE && k !== RUNTIME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  try {
    const fresh = await fetch(request);
    // Stash a copy of successful HTML responses in the runtime cache so a
    // subsequent offline reload of the same URL still renders.
    if (fresh && fresh.ok && fresh.type !== "opaque") {
      const cache = await caches.open(RUNTIME);
      cache.put(request, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Final fallback: serve the precached index so SPA routes still load.
    const indexFallback = await caches.match("./index.html");
    if (indexFallback) return indexFallback;
    throw err;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh && fresh.ok && fresh.type !== "opaque") {
    const cache = await caches.open(RUNTIME);
    cache.put(request, fresh.clone()).catch(() => {});
  }
  return fresh;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  // Cross-origin -> network-only. See the header comment for the rationale.
  if (url.origin !== self.location.origin) return;

  // Same-origin navigations -> network-first.
  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req));
    return;
  }

  // Same-origin static asset -> cache-first.
  event.respondWith(cacheFirst(req));
});

// Allow the page to ping the worker to activate a new version immediately
// (used by the reload toast). Accept both string and {type} object payloads
// so future call sites can pick whichever shape reads cleaner.
self.addEventListener("message", (event) => {
  const d = event.data;
  if (d === "SKIP_WAITING" || (d && d.type === "SKIP_WAITING")) {
    self.skipWaiting();
  }
});
