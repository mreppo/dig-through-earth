/* i18n.js — minimal translation engine.
 *
 * Public API:
 *   await initI18n()        Load all locales, apply current language, wire toggles.
 *   t(key, params?)         Look up a translation by dot-path. Returns the key on miss.
 *                           If params is supplied, replaces {{name}} tokens.
 *   setLanguage(lang)       Switch language, persist to localStorage, re-apply DOM.
 *   getLanguage()           Current active language.
 *   onLanguageChange(fn)    Subscribe to language changes; returns unsubscribe.
 *
 * HTML usage:
 *   <h1 data-i18n="header.title">fallback</h1>
 *   <input data-i18n="form.placeholder" data-i18n-attr="placeholder">
 *   <meta data-i18n="meta.description" data-i18n-attr="content">
 */

const SUPPORTED = ["en", "lv"];
const DEFAULT_LANG = "en";
const STORAGE_KEY = "dte.lang";

const dictionaries = Object.create(null);
let currentLang = DEFAULT_LANG;
const listeners = new Set();

function resolve(dict, key) {
  if (!dict) return undefined;
  const parts = key.split(".");
  let node = dict;
  for (const part of parts) {
    if (node && typeof node === "object" && part in node) {
      node = node[part];
    } else {
      return undefined;
    }
  }
  return typeof node === "string" ? node : undefined;
}

function interpolate(template, params) {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name) => {
    return Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match;
  });
}

export function t(key, params) {
  const hit = resolve(dictionaries[currentLang], key);
  const value = hit !== undefined
    ? hit
    : resolve(dictionaries[DEFAULT_LANG], key);
  if (value === undefined) return key;
  return interpolate(value, params);
}

export function getLanguage() {
  return currentLang;
}

export function onLanguageChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function readStoredLang() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && SUPPORTED.includes(raw)) return raw;
  } catch {
    /* localStorage may be unavailable (file://, private mode) */
  }
  return null;
}

function detectBrowserLang() {
  const candidates = (navigator.languages && navigator.languages.length)
    ? navigator.languages
    : [navigator.language || ""];
  for (const c of candidates) {
    const base = (c || "").toLowerCase().split("-")[0];
    if (SUPPORTED.includes(base)) return base;
  }
  return DEFAULT_LANG;
}

function storeLang(lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
}

async function loadDictionary(lang) {
  if (dictionaries[lang]) return dictionaries[lang];
  const res = await fetch(`i18n/${lang}.json`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to load i18n/${lang}.json: ${res.status}`);
  const dict = await res.json();
  dictionaries[lang] = dict;
  return dict;
}

export function applyTranslations(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (!key) return;
    const value = t(key);
    const attr = el.getAttribute("data-i18n-attr");
    if (attr) {
      el.setAttribute(attr, value);
    } else {
      el.textContent = value;
    }
  });

  document.documentElement.setAttribute("lang", currentLang);
}

export async function setLanguage(lang) {
  if (!SUPPORTED.includes(lang)) return;
  await loadDictionary(lang);
  currentLang = lang;
  storeLang(lang);
  applyTranslations();
  listeners.forEach((fn) => {
    try { fn(lang); } catch (e) { console.error(e); }
  });
}

function wireToggle() {
  const buttons = document.querySelectorAll("[data-lang]");
  const sync = () => {
    buttons.forEach((btn) => {
      const isActive = btn.getAttribute("data-lang") === currentLang;
      btn.setAttribute("aria-pressed", String(isActive));
    });
  };

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const lang = btn.getAttribute("data-lang");
      if (lang && lang !== currentLang) setLanguage(lang);
    });
  });

  onLanguageChange(sync);
  sync();
}

export async function initI18n() {
  const initial = readStoredLang() || detectBrowserLang();
  await loadDictionary(DEFAULT_LANG); // ensure fallback is available
  if (initial !== DEFAULT_LANG) await loadDictionary(initial);
  currentLang = initial;
  applyTranslations();
  wireToggle();
}
