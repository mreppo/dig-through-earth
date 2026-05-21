/* pwa.js - service-worker registration + install UX.
 *
 * Responsibilities:
 *   - Register the service worker (./sw.js with scope './') so the app shell
 *     becomes installable and works offline.
 *   - Capture the `beforeinstallprompt` event and expose an in-app Install
 *     button (Chromium / Android / Edge). Hide the button on `appinstalled`
 *     or when the app is already running standalone.
 *   - On iOS Safari (no beforeinstallprompt support), show an inline modal
 *     with "Tap Share -> Add to Home Screen -> Add" instead.
 *   - Show a one-time bottom banner nudging install on first visit, gated
 *     by the `dte:install-nudge-dismissed` localStorage key.
 *   - When a new SW takes control, surface a reload toast.
 *
 * No tracking. No remote logging. Everything stays on-device.
 */

import { t, onLanguageChange } from "./i18n.js";

const NUDGE_KEY = "dte:install-nudge-dismissed";

let deferredPrompt = null;

const els = {};

function cacheEls() {
  els.installBtn = document.getElementById("install-btn");
  els.installBanner = document.getElementById("install-banner");
  els.installBannerCta = document.getElementById("install-banner-cta");
  els.installBannerDismiss = document.getElementById("install-banner-dismiss");
  els.iosModal = document.getElementById("install-ios-modal");
  els.iosModalClose = document.getElementById("install-ios-modal-close");
  els.iosModalBackdrop = document.getElementById("install-ios-modal-backdrop");
  els.updateToast = document.getElementById("update-toast");
  els.updateToastReload = document.getElementById("update-toast-reload");
  els.installedToast = document.getElementById("installed-toast");
}

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

function isStandalone() {
  // iOS uses navigator.standalone; everyone else uses the media query.
  return (
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true
  );
}

/**
 * Detect iOS / iPadOS Safari.
 *
 * The /iPad|iPhone|iPod/ UA branch catches iPhone, iPod, and (older) iPads.
 * Since iPadOS 13, Safari on iPad has shipped a desktop-shaped UA by default
 * ("Macintosh; Intel Mac OS X ..."), so a pure-UA check misses every modern
 * iPad. Without the touch-points fallback below, every iPad user falls
 * through to the no-op path: no Install button, no Add-to-Home-Screen modal,
 * which kills install for one of the biggest target devices for a kids' app.
 *
 * The desktop-spoofing iPad branch is identified by the combination:
 *   - UA mentions "Macintosh" (the spoof target)
 *   - maxTouchPoints > 1 (real Macs have 0; iPads report >1)
 *   - 'ontouchend' in document (extra belt-and-braces; the Macintosh-spoof
 *     iPad still exposes the touch event interface)
 *
 * Sample UAs we accept as iOS Safari (subject to the Safari-vs-CriOS check):
 *   - iPhone iOS 17 Safari:
 *       "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15
 *        (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
 *   - iPad pre-13 Safari:
 *       "Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15
 *        (KHTML, like Gecko) Version/12.1.2 Mobile/15E148 Safari/604.1"
 *   - iPadOS 16+ Safari (desktop UA):
 *       "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15
 *        (KHTML, like Gecko) Version/16.4 Safari/605.1.15"
 *     -> caught by the Macintosh + touch-points + ontouchend branch.
 *
 * Sample UAs we DO NOT match:
 *   - Chrome on iPhone (CriOS in UA): in-app browser, no SW + no AtH
 *   - Firefox on iPhone (FxiOS): same reason
 *   - Real macOS Safari: no touch points, no ontouchend
 */
function isIosSafari() {
  const ua = window.navigator.userAgent || "";
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  if (!isSafari) return false;
  // Classic branch: iPhone / iPod / pre-13 iPad still ships an iPad-tagged UA.
  if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) return true;
  // iPadOS 13+ desktop-UA branch.
  if (/Macintosh/.test(ua) &&
      typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1 &&
      "ontouchend" in document) {
    return true;
  }
  return false;
}

function nudgeWasDismissed() {
  try {
    return localStorage.getItem(NUDGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markNudgeDismissed() {
  try {
    localStorage.setItem(NUDGE_KEY, "1");
  } catch {
    /* private mode / quota - keep showing this session, fine */
  }
}

// ---------------------------------------------------------------------------
// Install button + banner show / hide
// ---------------------------------------------------------------------------

function showInstallButton() {
  if (!els.installBtn) return;
  els.installBtn.hidden = false;
}

function hideInstallButton() {
  if (!els.installBtn) return;
  els.installBtn.hidden = true;
}

function showBanner() {
  if (!els.installBanner) return;
  els.installBanner.hidden = false;
}

function hideBanner() {
  if (!els.installBanner) return;
  els.installBanner.hidden = true;
}

function flashInstalledToast() {
  if (!els.installedToast) return;
  els.installedToast.textContent = t("install.installed.toast");
  els.installedToast.hidden = false;
  setTimeout(() => {
    if (els.installedToast) els.installedToast.hidden = true;
  }, 3500);
}

// ---------------------------------------------------------------------------
// iOS modal
// ---------------------------------------------------------------------------

function openIosModal() {
  if (!els.iosModal) return;
  els.iosModal.hidden = false;
  // Move focus to the close button so screen readers + keyboard users land
  // somewhere sensible.
  if (els.iosModalClose) els.iosModalClose.focus({ preventScroll: true });
  document.addEventListener("keydown", onIosModalKey);
}

function closeIosModal() {
  if (!els.iosModal) return;
  els.iosModal.hidden = true;
  document.removeEventListener("keydown", onIosModalKey);
}

function onIosModalKey(e) {
  if (e.key === "Escape") closeIosModal();
}

// ---------------------------------------------------------------------------
// Install button click
// ---------------------------------------------------------------------------

async function onInstallClick() {
  if (deferredPrompt) {
    // Chromium / Android / Edge path. The prompt() call must happen inside
    // the click handler's task to satisfy the user-gesture requirement.
    deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } catch {
      /* user dismissed or other - either way the prompt is consumed */
    }
    deferredPrompt = null;
    hideInstallButton();
    hideBanner();
    return;
  }
  if (isIosSafari()) {
    openIosModal();
    return;
  }
  // Fallback (desktop browser without prompt support): nudge the user with
  // the iOS instructions, since the wording for "use your browser's install
  // menu" is the only honest thing we can say.
  openIosModal();
}

// ---------------------------------------------------------------------------
// Service-worker registration + update toast
// ---------------------------------------------------------------------------

// Set to true ONLY when the user explicitly clicks the "Reload" button on
// the update toast. The controllerchange listener uses this flag to decide
// whether a reload is warranted. Without this guard the first-install
// `clients.claim()` -> controllerchange would silently reload the page,
// which is jarring mid-quiz and was the bug Codex flagged on PR #23.
let userRequestedReload = false;

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  // SW only works on secure contexts (HTTPS or localhost). Skip silently
  // on file:// or insecure http.
  if (!window.isSecureContext && window.location.protocol !== "http:") return;

  // Note: registration is the function that needs an explicit scope option.
  // Path is relative so it works under /dig-through-earth/ on GitHub Pages.
  navigator.serviceWorker
    .register("./sw.js", { scope: "./" })
    .then((reg) => {
      // If a new SW is found, wait until it's installed then surface the toast.
      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            showUpdateToast(installing);
          }
        });
      });
    })
    .catch((err) => {
      console.warn("sw register failed:", err);
    });

  // Fired when the active SW changes. Two cases:
  //   1. First-time install: clients.claim() in the worker's activate
  //      handler takes control of the existing page. No reload needed -
  //      everything the user sees already matches the new SW.
  //   2. User-driven update: the page has just postMessaged SKIP_WAITING
  //      because the user clicked Reload on the update toast. Reload so
  //      they get the fresh app shell.
  // The userRequestedReload flag distinguishes the two.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!userRequestedReload) return;
    window.location.reload();
  });
}

function showUpdateToast(waitingWorker) {
  if (!els.updateToast || !els.updateToastReload) return;
  els.updateToast.hidden = false;
  const onReload = () => {
    els.updateToastReload.removeEventListener("click", onReload);
    userRequestedReload = true;
    if (waitingWorker) waitingWorker.postMessage({ type: "SKIP_WAITING" });
  };
  els.updateToastReload.addEventListener("click", onReload);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

export function initPwa() {
  cacheEls();
  if (isStandalone()) {
    // Already installed -> nothing to show.
    hideInstallButton();
    hideBanner();
  }

  // Header install button.
  if (els.installBtn) {
    els.installBtn.addEventListener("click", onInstallClick);
  }

  // First-visit banner buttons.
  if (els.installBannerDismiss) {
    els.installBannerDismiss.addEventListener("click", () => {
      hideBanner();
      markNudgeDismissed();
    });
  }
  if (els.installBannerCta) {
    els.installBannerCta.addEventListener("click", () => {
      onInstallClick();
      // Whatever path the user took, don't pester them again on this device.
      markNudgeDismissed();
      hideBanner();
    });
  }

  // iOS modal close handlers.
  if (els.iosModalClose) els.iosModalClose.addEventListener("click", closeIosModal);
  if (els.iosModalBackdrop) els.iosModalBackdrop.addEventListener("click", closeIosModal);

  // Re-localise the toast text on language change so it never sits in a
  // stale language.
  onLanguageChange(() => {
    if (els.installedToast && !els.installedToast.hidden) {
      els.installedToast.textContent = t("install.installed.toast");
    }
  });

  // Chromium / Android / Edge: capture the prompt and reveal the button.
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (!isStandalone()) {
      showInstallButton();
      // Banner only on first visit and only when an install path exists.
      if (!nudgeWasDismissed()) showBanner();
    }
  });

  // iOS Safari: no beforeinstallprompt - reveal the button anyway so kids on
  // iOS get the AtH modal.
  if (isIosSafari() && !isStandalone()) {
    showInstallButton();
    if (!nudgeWasDismissed()) showBanner();
  }

  // Both platforms: stop showing UI once installed.
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    hideInstallButton();
    hideBanner();
    markNudgeDismissed();
    flashInstalledToast();
  });

  registerServiceWorker();
}

// Internal export for tests, if we add any.
export const _internals = {
  isIosSafari,
  isStandalone,
  nudgeWasDismissed,
};
