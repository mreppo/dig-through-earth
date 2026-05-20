#!/usr/bin/env python3
"""Verify i18n/en.json and i18n/lv.json have identical key sets and no empty values.

Exit codes:
  0 - parity OK (or files don't exist yet - non-fatal in early dev)
  1 - parity broken (missing keys or empty values)
  2 - file read/parse error
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EN_PATH = ROOT / "i18n" / "en.json"
LV_PATH = ROOT / "i18n" / "lv.json"


def flatten(obj, prefix=""):
    """Recursively flatten nested dict/list into dot-path -> value pairs."""
    out = {}
    if isinstance(obj, dict):
        for k, v in obj.items():
            key = f"{prefix}.{k}" if prefix else k
            out.update(flatten(v, key))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            key = f"{prefix}.{i}"
            out.update(flatten(v, key))
    else:
        out[prefix] = obj
    return out


def load(path):
    try:
        return flatten(json.loads(path.read_text(encoding="utf-8")))
    except json.JSONDecodeError as e:
        print(f"ERROR: {path} is not valid JSON: {e}", file=sys.stderr)
        sys.exit(2)
    except OSError as e:
        print(f"ERROR: cannot read {path}: {e}", file=sys.stderr)
        sys.exit(2)


def main():
    if not EN_PATH.exists() or not LV_PATH.exists():
        print("i18n files not yet created - skipping check.")
        return 0

    en = load(EN_PATH)
    lv = load(LV_PATH)

    missing_in_lv = sorted(set(en) - set(lv))
    missing_in_en = sorted(set(lv) - set(en))
    empty_en = sorted(k for k, v in en.items() if v in ("", None))
    empty_lv = sorted(k for k, v in lv.items() if v in ("", None))

    errors = []
    if missing_in_lv:
        errors.append(f"Missing in LV ({len(missing_in_lv)}):\n  " + "\n  ".join(missing_in_lv))
    if missing_in_en:
        errors.append(f"Missing in EN ({len(missing_in_en)}):\n  " + "\n  ".join(missing_in_en))
    if empty_en:
        errors.append(f"Empty values in EN ({len(empty_en)}):\n  " + "\n  ".join(empty_en))
    if empty_lv:
        errors.append(f"Empty values in LV ({len(empty_lv)}):\n  " + "\n  ".join(empty_lv))

    if errors:
        print("\n\n".join(errors))
        print(f"\ni18n parity FAILED ({len(en)} EN keys, {len(lv)} LV keys)", file=sys.stderr)
        sys.exit(1)

    print(f"i18n parity OK ({len(en)} keys)")
    return 0


if __name__ == "__main__":
    main()
