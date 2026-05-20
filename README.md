# 🌍 Dig Through The Earth

> Where will you come out if you dig straight through the Earth? An interactive antipode explorer for kids.

**Live:** https://mreppo.github.io/dig-through-earth/

## What it does

- Click anywhere on a map (2D or 3D globe) and see your antipode - the exact opposite point on Earth.
- Calculates distance through the planet (~12,742 km).
- Tells you whether you'd land on water or land, and the nearest named place.
- Bilingual: English and Latvian.
- Mini-quiz to teach kids about geography.

## Tech stack

- Plain HTML/CSS/JS - no build step
- [Leaflet](https://leafletjs.com/) for 2D maps + OpenStreetMap tiles
- [globe.gl](https://github.com/vasturiano/globe.gl) for 3D globe
- [Nominatim](https://nominatim.org/) for reverse geocoding (free, no key)
- Hosted on GitHub Pages

## Local development

```bash
python3 -m http.server 8000
# Then visit http://localhost:8000
```

## Deployment

Pushes to `main` auto-deploy to GitHub Pages.

## Status

🚧 In active development. See [Issues](https://github.com/mreppo/dig-through-earth/issues) for the roadmap.

## Licence

MIT
