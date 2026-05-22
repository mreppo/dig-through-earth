#!/usr/bin/env python3
"""Validate data/questions.json structural integrity.

Checks:
  - Top-level shape: { version: int, questions: list }
  - Each question has: id, topic, correctIndex (0-3), en.text, en.options (4),
    lv.text, lv.options (4)
  - No duplicate ids
  - No empty strings in text or any option
  - Exactly 200 questions
  - correctIndex distribution reasonably balanced (each slot 40-60)

Exit codes:
  0 - all checks pass
  1 - validation failed
  2 - file read/parse error
"""
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
QUESTIONS_PATH = ROOT / "data" / "questions.json"

EXPECTED_TOTAL = 200
LANGS = ("en", "lv")
OPTIONS_PER_Q = 4


def fail(msg):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def main():
    if not QUESTIONS_PATH.exists():
        fail(f"{QUESTIONS_PATH} does not exist")

    try:
        data = json.loads(QUESTIONS_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        print(f"ERROR: {QUESTIONS_PATH} is not valid JSON: {e}", file=sys.stderr)
        sys.exit(2)

    if not isinstance(data, dict):
        fail("top level must be an object")
    if "questions" not in data or not isinstance(data["questions"], list):
        fail("top level must have a 'questions' array")
    questions = data["questions"]

    if len(questions) != EXPECTED_TOTAL:
        fail(f"expected {EXPECTED_TOTAL} questions, found {len(questions)}")

    errors = []
    ids = []
    correct_index_counter = Counter()

    for i, q in enumerate(questions):
        ctx = f"questions[{i}]"
        if not isinstance(q, dict):
            errors.append(f"{ctx}: must be an object")
            continue

        qid = q.get("id")
        if not isinstance(qid, str) or not qid:
            errors.append(f"{ctx}: missing or empty 'id'")
            continue
        ctx = f"questions[{i}] (id={qid})"
        ids.append(qid)

        if not isinstance(q.get("topic"), str) or not q["topic"]:
            errors.append(f"{ctx}: missing or empty 'topic'")

        ci = q.get("correctIndex")
        if not isinstance(ci, int) or ci < 0 or ci > 3:
            errors.append(f"{ctx}: correctIndex must be int 0-3, got {ci!r}")
        else:
            correct_index_counter[ci] += 1

        for lang in LANGS:
            block = q.get(lang)
            if not isinstance(block, dict):
                errors.append(f"{ctx}: missing '{lang}' object")
                continue
            text = block.get("text")
            if not isinstance(text, str) or not text.strip():
                errors.append(f"{ctx}: missing or empty {lang}.text")
            options = block.get("options")
            if not isinstance(options, list) or len(options) != OPTIONS_PER_Q:
                errors.append(
                    f"{ctx}: {lang}.options must be exactly {OPTIONS_PER_Q} items, "
                    f"got {len(options) if isinstance(options, list) else type(options).__name__}"
                )
                continue
            for j, opt in enumerate(options):
                if not isinstance(opt, str) or not opt.strip():
                    errors.append(f"{ctx}: {lang}.options[{j}] is empty or non-string")

    # Duplicate ids.
    dupes = [item for item, count in Counter(ids).items() if count > 1]
    if dupes:
        errors.append(f"duplicate ids: {dupes}")

    # correctIndex spread check (each slot should be 40-60 for 200 questions).
    for idx in range(4):
        c = correct_index_counter[idx]
        if c < 40 or c > 60:
            errors.append(
                f"correctIndex {idx} appears {c} times - distribution should be 40-60 per slot"
            )

    if errors:
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        print(
            f"\nquestions.json validation FAILED ({len(errors)} issue{'s' if len(errors) != 1 else ''})",
            file=sys.stderr,
        )
        sys.exit(1)

    print(
        f"questions.json OK ({len(questions)} questions, "
        f"correctIndex distribution: {dict(sorted(correct_index_counter.items()))})"
    )


if __name__ == "__main__":
    main()
