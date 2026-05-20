---
description: Verify i18n/en.json and i18n/lv.json have identical key sets and no empty values.
---

Run the i18n parity check.

1. Execute: `python3 scripts/check-i18n.py`
2. Read the output.
3. If parity is OK, report "i18n parity ✓" and stop.
4. If there are missing or empty keys, list them grouped by file. Then offer:
   - **Option A:** Add empty placeholders in the missing file so the structure matches, then queue them for translation.
   - **Option B:** Delegate the missing/empty Latvian strings to the `latvian-kids-translator` sub-agent now.
   - **Option C:** Just show me the diff and let me decide.

Default to asking Mareks which option before making changes.
