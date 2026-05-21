/* quiz.js — bilingual 10-question geography quiz.
 *
 * Question text + options live in i18n/{en,lv}.json under `quiz.questions.<id>`.
 * The correct-answer index for each question lives here (structural data, not
 * language-dependent), so the i18n payload only carries translatable strings.
 *
 * Public API:
 *   initQuiz({ triggerEl, sectionEl })  — wire the trigger button and section.
 *                                          Returns void; module owns its state.
 *
 * Cross-page safety: bails out early if either element is missing, so loading
 * the same main.js on 404.html (which has no quiz markup) does not throw.
 */

import { t, onLanguageChange } from "./i18n.js";

const QUESTIONS = [
  { id: "latvia",           correctIndex: 0 }, // Pacific Ocean
  { id: "deepestOcean",     correctIndex: 1 }, // Pacific Ocean
  { id: "fallTime",         correctIndex: 0 }, // ~42 minutes
  { id: "europeAntipodes",  correctIndex: 2 }, // Pacific Ocean
  { id: "earthDiameter",    correctIndex: 1 }, // 12,742 km
  { id: "highestMountain",  correctIndex: 0 }, // Everest
  { id: "largestContinent", correctIndex: 0 }, // Asia
  { id: "earthCore",        correctIndex: 0 }, // iron + nickel ball
  { id: "waterCover",       correctIndex: 2 }, // ~71%
  { id: "earthRadius",      correctIndex: 2 }, // ~6,371 km
];

const TOTAL = QUESTIONS.length;

const state = {
  started: false,
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

function currentQuestion() {
  return QUESTIONS[state.idx];
}

function questionT(suffix, params) {
  const q = currentQuestion();
  return t(`quiz.questions.${q.id}.${suffix}`, params);
}

function optionStrings() {
  // The i18n layer flattens lists by index, so we resolve options[0..3]
  // individually rather than expecting an array return shape.
  return [0, 1, 2, 3].map((i) =>
    t(`quiz.questions.${currentQuestion().id}.options.${i}`)
  );
}

function tierKey() {
  // 10/10 perfect; 8-9 high; 5-7 mid; ≤4 low.
  const s = state.score;
  if (s === TOTAL) return "quiz.end.tierPerfect";
  if (s >= 8) return "quiz.end.tierHigh";
  if (s >= 5) return "quiz.end.tierMid";
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
  const isLast = state.idx === TOTAL - 1;
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
    total: TOTAL,
  });
  els.question.textContent = questionT("text");
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
    total: TOTAL,
  });
}

function onAnswer(idx) {
  if (state.revealed) return; // ignore double clicks
  state.picked = idx;
  state.revealed = true;
  if (idx === currentQuestion().correctIndex) state.score += 1;
  renderOptions();
  renderFeedback();
  // Move focus to the next button so keyboard users can advance with Enter.
  if (els.next && !els.next.hidden) {
    els.next.focus({ preventScroll: true });
  }
}

function onNext() {
  if (!state.revealed) return;
  if (state.idx === TOTAL - 1) {
    state.finished = true;
    renderEnd();
    // Focus the heading first so screen readers read the score + tier message
    // before the user lands on the Restart button.
    els.endHeading.focus({ preventScroll: true });
    return;
  }
  state.idx += 1;
  state.picked = null;
  state.revealed = false;
  renderCurrent();
  // Land focus on the question text so screen readers read the new question
  // before the user navigates through the options.
  els.question.focus({ preventScroll: true });
}

function start() {
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
  // Scroll to the quiz so it's visible.
  els.section.scrollIntoView({ behavior: "smooth", block: "start" });
  // After the scroll settles, land focus on the question text so screen
  // readers read the question before the user tabs into the options.
  setTimeout(() => {
    if (els.question) els.question.focus({ preventScroll: true });
  }, 250);
}

function restart() {
  start();
}

export function initQuiz({ triggerEl, sectionEl }) {
  // Cross-page safety: this same main.js loads on 404.html where neither
  // element exists. Bail out silently in that case.
  if (!triggerEl || !sectionEl) return;
  cache(triggerEl, sectionEl);
  triggerEl.addEventListener("click", start);
  els.next.addEventListener("click", onNext);
  els.restart.addEventListener("click", restart);
  // Re-render in the new language if the user toggles mid-quiz.
  onLanguageChange(() => {
    if (!state.started) return;
    if (state.finished) {
      // Re-render the end screen with the new tier text + score string.
      els.endHeading.textContent = t(tierKey());
      els.endScore.textContent = t("quiz.end.score", {
        correct: state.score,
        total: TOTAL,
      });
    } else {
      renderCurrent();
    }
  });
}
