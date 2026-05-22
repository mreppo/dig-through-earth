/* autocomplete.js — Photon-powered city autocomplete for the locator search.
 *
 * Public API:
 *   initAutocomplete({ formEl, inputEl, onPick, getLang })
 *     formEl  — the <form> wrapping the search input. Becomes the positioning
 *               context for the dropdown.
 *     inputEl — the search <input>. Gets ARIA combobox attributes.
 *     onPick  — called as onPick({ lat, lng, displayName }) when a suggestion
 *               is chosen. Caller is expected to trigger the dig action.
 *     getLang — () => "en" | "lv". Used to localise Photon responses when
 *               the language is supported; falls back to "en" otherwise
 *               (Photon currently supports en/de/fr only, per its API).
 *
 * UX:
 *   - 250 ms debounce, min 2 chars, max 6 results.
 *   - ARIA 1.2 combobox-with-listbox pattern.
 *   - ArrowUp/Down navigate, Enter selects (or submits if no active item),
 *     Escape closes, click-outside closes.
 *   - Network errors close the dropdown silently so plain Enter still submits.
 */

import { t, onLanguageChange } from "./i18n.js";

const PHOTON_URL = "https://photon.komoot.io/api";
const DEBOUNCE_MS = 250;
const MIN_CHARS = 2;
const MAX_RESULTS = 6;
const PHOTON_SUPPORTED_LANGS = new Set(["en", "de", "fr"]);

export function initAutocomplete({ formEl, inputEl, onPick, getLang }) {
  if (!formEl || !inputEl || typeof onPick !== "function") return null;

  const listboxId = `${inputEl.id || "ac"}-listbox`;

  const listbox = document.createElement("ul");
  listbox.className = "autocomplete__listbox";
  listbox.id = listboxId;
  listbox.setAttribute("role", "listbox");
  listbox.setAttribute("aria-label", t("locator.search.label"));
  listbox.hidden = true;
  formEl.appendChild(listbox);

  inputEl.setAttribute("role", "combobox");
  inputEl.setAttribute("aria-autocomplete", "list");
  inputEl.setAttribute("aria-expanded", "false");
  inputEl.setAttribute("aria-controls", listboxId);
  inputEl.setAttribute("aria-haspopup", "listbox");

  let activeIndex = -1;
  let currentResults = [];
  let debounceTimer = null;
  let inflightController = null;
  let lastQuery = "";
  // Tracks an open status message ("loading" | "empty") so the visible text
  // can be re-rendered if the user toggles language while it's showing.
  let currentStatus = null;

  function setExpanded(open) {
    inputEl.setAttribute("aria-expanded", open ? "true" : "false");
    listbox.hidden = !open;
  }

  function setActive(index) {
    activeIndex = index;
    const options = listbox.querySelectorAll('[role="option"]');
    options.forEach((opt, i) => {
      const selected = i === index;
      opt.setAttribute("aria-selected", selected ? "true" : "false");
      opt.classList.toggle("is-active", selected);
    });
    if (index >= 0 && options[index]) {
      inputEl.setAttribute("aria-activedescendant", options[index].id);
      options[index].scrollIntoView({ block: "nearest" });
    } else {
      inputEl.removeAttribute("aria-activedescendant");
    }
  }

  function close() {
    // Cancel any pending debounce + inflight fetch so a late response can't
    // re-render and reopen the listbox after the user dismissed it.
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (inflightController) {
      inflightController.abort();
      inflightController = null;
    }
    lastQuery = "";
    setExpanded(false);
    setActive(-1);
    listbox.innerHTML = "";
    currentResults = [];
    currentStatus = null;
  }

  function renderStatusItem(kind) {
    currentStatus = kind;
    const i18nKey = kind === "loading"
      ? "locator.autocomplete.loading"
      : "locator.autocomplete.noResults";
    listbox.innerHTML = "";
    const li = document.createElement("li");
    li.className = `autocomplete__status autocomplete__status--${kind}`;
    li.textContent = t(i18nKey);
    listbox.appendChild(li);
    setExpanded(true);
  }

  function formatLabel(feature, others) {
    const p = feature.properties;
    const parts = [p.name];
    // Add state/region only when another result shares the same name+country.
    const dup = others.some((other) => {
      if (other === feature) return false;
      return other.properties.name === p.name &&
        other.properties.country === p.country;
    });
    if (dup) {
      const region = p.state || p.county || p.city;
      if (region) parts.push(region);
    }
    if (p.country) parts.push(p.country);
    return parts.join(", ");
  }

  function renderResults(features) {
    currentStatus = null;
    listbox.innerHTML = "";
    currentResults = features.map((feature) => {
      const [lng, lat] = feature.geometry.coordinates;
      return {
        lat,
        lng,
        displayName: formatLabel(feature, features),
      };
    });
    currentResults.forEach((result, i) => {
      const li = document.createElement("li");
      li.className = "autocomplete__option";
      li.id = `${listboxId}-opt-${i}`;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", "false");
      li.textContent = result.displayName;
      // mousedown fires before the input's blur — pick before focus leaves.
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        pick(i);
      });
      li.addEventListener("touchstart", (e) => {
        e.preventDefault();
        pick(i);
      }, { passive: false });
      listbox.appendChild(li);
    });
    setExpanded(true);
    setActive(-1);
  }

  function pick(index) {
    const r = currentResults[index];
    if (!r) return;
    inputEl.value = r.displayName;
    close();
    onPick(r);
  }

  async function fetchSuggestions(query) {
    if (inflightController) inflightController.abort();
    inflightController = new AbortController();
    const lang = (typeof getLang === "function" && getLang()) || "en";
    const effectiveLang = PHOTON_SUPPORTED_LANGS.has(lang) ? lang : "en";

    const url = new URL(PHOTON_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(MAX_RESULTS));
    url.searchParams.set("lang", effectiveLang);
    url.searchParams.append("osm_tag", "place:city");
    url.searchParams.append("osm_tag", "place:town");
    url.searchParams.append("osm_tag", "place:village");

    try {
      const res = await fetch(url.toString(), {
        signal: inflightController.signal,
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (query !== lastQuery) return;
      const features = Array.isArray(data.features)
        ? data.features.slice(0, MAX_RESULTS)
        : [];
      if (features.length === 0) {
        renderStatusItem("empty");
      } else {
        renderResults(features);
      }
    } catch (err) {
      if (err && err.name === "AbortError") return;
      // Plain input still works — close so submit-button path remains usable.
      close();
    }
  }

  function onInput() {
    const query = inputEl.value.trim();
    lastQuery = query;
    if (debounceTimer) clearTimeout(debounceTimer);
    if (query.length < MIN_CHARS) {
      close();
      return;
    }
    renderStatusItem("loading");
    debounceTimer = setTimeout(() => fetchSuggestions(query), DEBOUNCE_MS);
  }

  function onKeydown(e) {
    const isOpen = inputEl.getAttribute("aria-expanded") === "true";
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen && inputEl.value.trim().length >= MIN_CHARS) {
        onInput();
        return;
      }
      if (currentResults.length === 0) return;
      const next = (activeIndex + 1) % currentResults.length;
      setActive(next);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (currentResults.length === 0) return;
      const prev = activeIndex <= 0 ? currentResults.length - 1 : activeIndex - 1;
      setActive(prev);
    } else if (e.key === "Enter") {
      if (isOpen && activeIndex >= 0) {
        e.preventDefault();
        pick(activeIndex);
      }
    } else if (e.key === "Escape") {
      if (isOpen) {
        e.preventDefault();
        close();
      }
    }
  }

  function onDocPointerDown(e) {
    if (!formEl.contains(e.target)) close();
  }

  inputEl.addEventListener("input", onInput);
  inputEl.addEventListener("keydown", onKeydown);
  inputEl.addEventListener("focus", () => {
    if (currentResults.length > 0) setExpanded(true);
  });
  document.addEventListener("pointerdown", onDocPointerDown);

  // Keep the listbox aria-label and any open status message in sync when the
  // user switches language while the dropdown is showing. (Suggestion text
  // itself comes from Photon and is not re-fetched - it will refresh on the
  // next keystroke.)
  const unsubscribeLang = onLanguageChange(() => {
    listbox.setAttribute("aria-label", t("locator.search.label"));
    if (currentStatus) renderStatusItem(currentStatus);
  });

  return {
    close,
    destroy() {
      inputEl.removeEventListener("input", onInput);
      inputEl.removeEventListener("keydown", onKeydown);
      document.removeEventListener("pointerdown", onDocPointerDown);
      if (typeof unsubscribeLang === "function") unsubscribeLang();
      listbox.remove();
    },
  };
}
