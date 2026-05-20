---
description: Run the code-reviewer sub-agent against the current branch diff or a specific PR.
---

Invoke the `code-reviewer` sub-agent with the appropriate input:

**Default (current branch):** Review `git diff main...HEAD` plus staged changes. Find the linked issue from the branch name (`task/<N>-...`).

**If a PR number is given as argument (e.g. `/review-pr 12`):**
1. `gh pr checkout 12` (or fetch the diff if you don't want to switch)
2. `gh pr view 12 --json body,headRefName,title` to get context
3. Find the linked issue from the PR body (look for `Closes #N` or `#N`)

The sub-agent will produce a structured verdict. Surface it verbatim - don't summarise away the details.

After the review:
- If verdict is **APPROVE**: tell Mareks the PR is ready for him to merge (don't merge yourself; merging is a separate human step on this project).
- If verdict is **REQUEST_CHANGES** or **BLOCK**: list the blockers and majors, and offer to fix them in the same branch.

If reviewing pre-PR (no PR yet), the verdict should also include a "ready to open PR?" line - APPROVE means yes, otherwise fix first.
