# CLAUDE.md

> Project conventions for Claude Code working on `dig-through-earth`.
> Read this first, every session. Issues are the **what**; this file is the **how**.

## What this is

A static site that shows kids where they'd come out if they dug straight through the Earth. Bilingual (EN/LV), 2D + 3D views, plus a mini-quiz. Hosted on GitHub Pages.

- **Live:** https://mreppo.github.io/dig-through-earth/
- **Roadmap:** start at issue [#8 META](https://github.com/mreppo/dig-through-earth/issues/8)

## Hard rules

1. **No build step.** Plain HTML/CSS/JS with ES modules. No npm, no bundlers, no transpilation.
2. **CDN dependencies only.** Leaflet, globe.gl, etc. loaded from unpkg or jsdelivr. Lock to a major version.
3. **Both languages move together.** Every new UI string must land in `i18n/en.json` AND `i18n/lv.json` in the same commit. CI enforces this (`scripts/check-i18n.py`).
4. **Mobile-first.** Verify at 375px viewport before considering a task done.
5. **No tracking, no analytics, no third-party scripts** beyond the map/globe libraries. Kids' site - privacy matters.
6. **`main` must always be deployable.** GitHub Pages serves `main` root directly. Use feature branches and PRs.

## File layout

```
/
├── index.html              # Entry point
├── 404.html                # Custom not-found page
├── css/
│   ├── main.css            # Global styles + CSS variables
│   └── ...
├── js/
│   ├── main.js             # ES module entry, wires everything
│   ├── i18n.js             # Translation engine
│   ├── antipode.js         # Pure math, no DOM
│   ├── location.js         # Geolocation + Nominatim reverse-geocode
│   ├── view-2d.js          # Leaflet maps
│   ├── view-3d.js          # globe.gl
│   ├── quiz.js             # Mini-quiz logic
│   └── state.js            # Shared state across views
├── i18n/
│   ├── en.json             # English strings
│   └── lv.json             # Latvian strings (kid-friendly, informal "tu")
├── assets/                 # Icons, favicons, OG images
├── scripts/
│   └── check-i18n.py       # CI: verify EN/LV key parity
├── .github/workflows/
│   └── i18n-check.yml      # Runs the parity check on PRs
├── .claude/
│   ├── agents/             # Sub-agent definitions (e.g. LV translator)
│   └── commands/           # Slash commands (e.g. /i18n-check)
├── CLAUDE.md               # This file
└── README.md
```

## Workflow

1. Pick an issue from the roadmap (#8 lists them in dependency order).
2. Create a branch: `task/<issue-number>-<short-slug>` (e.g. `task/3-leaflet-2d`).
3. Read the issue's acceptance criteria. Tick them off in the PR description.
4. Test locally: `python3 -m http.server 8000`.
5. Verify mobile viewport (375px) before opening the PR.
6. Open PR against `main` with:
   - Title: `<type>: <description>` (e.g. `feat: add 2D Leaflet view`)
   - Body: link to issue, ticked acceptance criteria, screenshots for UI changes
   - Mention any new dependencies and their CDN version pin
7. PR must be deployable - Pages publishes from `main` root on merge.

## i18n convention

- Keys are hierarchical: `header.title`, `quiz.q1.options.0`, `results.surfaceLand`.
- All user-visible strings use `data-i18n="key"` (HTML) or `t('key')` (JS). No hardcoded strings anywhere.
- Latvian must be **kid-friendly and informal** (use "tu", not "Jūs"). Not literal English-to-Latvian.
- When writing or reviewing Latvian text, delegate to the `latvian-kids-translator` sub-agent.
- Run `/i18n-check` (or `python3 scripts/check-i18n.py`) before pushing.

## Tech defaults

- **Maps:** Leaflet 1.9.x from unpkg, OpenStreetMap tile layer (free, attribution required).
- **Globe:** globe.gl from unpkg (`https://unpkg.com/globe.gl`).
- **Reverse geocoding:** Nominatim public endpoint. Respect 1 req/sec, send `User-Agent: dig-through-earth/1.0 (https://github.com/mreppo/dig-through-earth)`. Cache results.
- **Browser targets:** latest Chrome, Safari, Firefox + iOS Safari + Android Chrome. No IE.
- **Accessibility target:** Lighthouse a11y ≥ 95.
- **Performance target:** Lighthouse mobile perf ≥ 85, total page weight < 2 MB excluding map tiles.

## Don'ts

- Don't add a `package.json` or `node_modules` unless the scope changes (open an issue first to discuss).
- Don't add server-side anything. Static only.
- Don't write user-visible strings directly in HTML or JS - always go through i18n.
- Don't break `main`. Use branches and PRs.
- Don't add analytics, trackers, or third-party fonts that phone home.
- Don't ship Latvian text without running it through `latvian-kids-translator`.

## Quick checks before merging

- [ ] `python3 -m http.server 8000` runs, no console errors
- [ ] Mobile viewport (375px) renders without horizontal scroll
- [ ] EN and LV both have all new keys (run `/i18n-check`)
- [ ] Lighthouse a11y ≥ 95 on affected pages
- [ ] No new third-party network calls beyond approved CDNs
- [ ] PR description ticks off the issue's acceptance criteria
