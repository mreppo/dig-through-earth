/* quiz.js - bilingual geography quiz.
 *
 * Question pool lives in data/questions.json (200+ questions, EN+LV inline).
 * Each session picks a fresh random 10 with no repeats per run.
 *
 * Public API:
 *   initQuiz({ triggerEl, sectionEl })  - wire the trigger button and section.
 *   ensureQuizStarted()                 - auto-start on first quiz tab visit.
 *
 * Cross-page safety: bails out early if either element is missing, so loading
 * the same main.js on 404.html (which has no quiz markup) does not throw.
 */

import { t, getLanguage, onLanguageChange } from "./i18n.js";

const QUESTIONS_URL = "data/questions.json";
const PER_SESSION = 10;

let pool = null;          // full question pool, lazy-loaded
let poolPromise = null;   // in-flight fetch promise (de-dupes concurrent loads)

const state = {
  started: false,
  session: [],     // the 10 picked for this session
  idx: 0,          // current question index
  score: 0,
  picked: null,    // option index the user just clicked, or null
  revealed: false, // has the feedback been shown for this question?
  finished: false,
};

const els = {};

function cache(triggerEl, sectionEl) {
  els.trigger = triggerEl;
  els.section = sectionEl;
  els.intro = sectionEl.querySelector("[data-quiz-intro]");
  els.body = sectionEl.querySelector("[data-quiz-body]");
  els.progress = sectionEl.querySelector("[data-quiz-progress]");
  els.question = sectionEl.querySelector("[data-quiz-question]");
  els.options = sectionEl.querySelector("[data-quiz-options]");
  els.feedback = sectionEl.querySelector("[data-quiz-feedback]");
  els.next = sectionEl.querySelector("[data-quiz-next]");
  els.nextLabel = sectionEl.querySelector("[data-quiz-next-label]");
  els.end = sectionEl.querySelector("[data-quiz-end]");
  els.endHeading = sectionEl.querySelector("[data-quiz-end-heading]");
  els.endScore = sectionEl.querySelector("[data-quiz-end-score]");
  els.restart = sectionEl.querySelector("[data-quiz-restart]");
}

async function loadPool() {
  if (pool) return pool;
  if (poolPromise) return poolPromise;
  poolPromise = (async () => {
    const res = await fetch(QUESTIONS_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Failed to load ${QUESTIONS_URL}: ${res.status}`);
    const data = await res.json();
    if (!data || !Array.isArray(data.questions)) {
      throw new Error("questions.json: missing 'questions' array");
    }
    pool = data.questions;
    return pool;
  })();
  return poolPromise;
}

function pickSession(all) {
  // Fisher-Yates shuffle on a copy, then take the first PER_SESSION.
  const copy = all.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(PER_SESSION, copy.length));
}

function currentQuestion() {
  return state.session[state.idx];
}

function localised(q) {
  const lang = getLanguage();
  return q[lang] || q.en;
}

function optionStrings() {
  return localised(currentQuestion()).options;
}

function tierKey() {
  const total = state.session.length;
  const s = state.score;
  if (s === total) return "quiz.end.tierPerfect";
  if (s >= Math.ceil(total * 0.8)) return "quiz.end.tierHigh";
  if (s >= Math.ceil(total * 0.5)) return "quiz.end.tierMid";
  return "quiz.end.tierLow";
}

function clearOptions() {
  els.options.replaceChildren();
}

function renderOptions() {
  clearOptions();
  const opts = optionStrings();
  const correctIdx = currentQuestion().correctIndex;
  opts.forEach((label, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "quiz__option";
    btn.textContent = label;
    btn.dataset.optionIndex = String(i);
    if (state.revealed) {
      btn.disabled = true;
      if (i === correctIdx) btn.classList.add("quiz__option--correct");
      if (i === state.picked && state.picked !== correctIdx) {
        btn.classList.add("quiz__option--wrong");
      }
    } else {
      btn.addEventListener("click", () => onAnswer(i));
    }
    els.options.appendChild(btn);
  });
}

function renderFeedback() {
  if (!state.revealed) {
    els.feedback.textContent = "";
    els.feedback.classList.remove("quiz__feedback--correct", "quiz__feedback--wrong");
    return;
  }
  const correctIdx = currentQuestion().correctIndex;
  const total = state.session.length;
  const isLast = state.idx === total - 1;
  if (state.picked === correctIdx) {
    els.feedback.textContent = t("quiz.feedback.correct");
    els.feedback.classList.add("quiz__feedback--correct");
    els.feedback.classList.remove("quiz__feedback--wrong");
  } else {
    const answer = optionStrings()[correctIdx];
    els.feedback.textContent = t("quiz.feedback.wrong", { answer });
    els.feedback.classList.add("quiz__feedback--wrong");
    els.feedback.classList.remove("quiz__feedback--correct");
  }
  els.nextLabel.textContent = isLast
    ? t("quiz.feedback.finish")
    : t("quiz.feedback.next");
  els.next.hidden = false;
}

function renderCurrent() {
  if (!state.started || state.finished) return;
  els.progress.textContent = t("quiz.progress", {
    current: state.idx + 1,
    total: state.session.length,
  });
  els.question.textContent = localised(currentQuestion()).text;
  renderOptions();
  if (!state.revealed) {
    els.feedback.textContent = "";
    els.feedback.classList.remove("quiz__feedback--correct", "quiz__feedback--wrong");
    els.next.hidden = true;
  } else {
    renderFeedback();
  }
}

function renderEnd() {
  els.body.hidden = true;
  els.intro.hidden = true;
  els.end.hidden = false;
  els.endHeading.textContent = t(tierKey());
  els.endScore.textContent = t("quiz.end.score", {
    correct: state.score,
    total: state.session.length,
  });
}

function onAnswer(idx) {
  if (state.revealed) return;
  state.picked = idx;
  state.revealed = true;
  if (idx === currentQuestion().correctIndex) state.score += 1;
  renderOptions();
  renderFeedback();
  if (els.next && !els.next.hidden) {
    els.next.focus({ preventScroll: true });
  }
}

function onNext() {
  if (!state.revealed) return;
  const total = state.session.length;
  if (state.idx === total - 1) {
    state.finished = true;
    renderEnd();
    els.endHeading.focus({ preventScroll: true });
    return;
  }
  state.idx += 1;
  state.picked = null;
  state.revealed = false;
  renderCurrent();
  els.question.focus({ preventScroll: true });
}

async function start() {
  let all;
  try {
    all = await loadPool();
  } catch (err) {
    console.error("[quiz] failed to load questions:", err);
    return;
  }
  state.session = pickSession(all);
  state.started = true;
  state.idx = 0;
  state.score = 0;
  state.picked = null;
  state.revealed = false;
  state.finished = false;
  els.section.hidden = false;
  els.intro.hidden = false;
  els.body.hidden = false;
  els.end.hidden = true;
  els.next.hidden = true;
  els.feedback.textContent = "";
  renderCurrent();
  els.section.scrollIntoView({ behavior: "smooth", block: "start" });
  setTimeout(() => {
    if (els.question) els.question.focus({ preventScroll: true });
  }, 250);
}

function restart() {
  start();
}

export function initQuiz({ triggerEl, sectionEl }) {
  if (!sectionEl) return;
  cache(triggerEl, sectionEl);
  if (triggerEl) triggerEl.addEventListener("click", start);
  els.next.addEventListener("click", onNext);
  els.restart.addEventListener("click", restart);
  onLanguageChange(() => {
    if (!state.started) return;
    if (state.finished) {
      els.endHeading.textContent = t(tierKey());
      els.endScore.textContent = t("quiz.end.score", {
        correct: state.score,
        total: state.session.length,
      });
    } else {
      renderCurrent();
    }
  });
}

/**
 * Auto-start the quiz the first time the user opens the Quiz tab.
 * Called by main.js on screen change. Safe to call repeatedly; no-op once
 * the quiz has already started.
 */
export function ensureQuizStarted() {
  if (state.started) return;
  if (!els.section) return;
  start();
}
