#!/usr/bin/env python3
"""One-shot: render the PWA icon SVGs to PNGs.

Inputs (committed):
  assets/icons/icon-any.svg          - mole + orb at ~50% of canvas (any)
  assets/icons/icon-maskable.svg     - mole + orb at ~40% of canvas (maskable safe zone)

Outputs (committed):
  assets/icons/icon-192-any.png
  assets/icons/icon-512-any.png
  assets/icons/icon-512-maskable.png

Usage (run once on macOS / Linux, requires cairosvg + Pillow):

    python3 -m venv /tmp/dte-pwa-venv
    /tmp/dte-pwa-venv/bin/pip install Pillow cairosvg
    /tmp/dte-pwa-venv/bin/python scripts/generate-icons.py

Not run in CI - the rendered PNGs are committed so the live site does not need
Python to build. Re-run only when the source SVGs change.
"""
from pathlib import Path

import cairosvg
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "assets" / "icons"
SOURCES = {
    "icon-any.svg": [(192, "icon-192-any.png"), (512, "icon-512-any.png")],
    "icon-maskable.svg": [(512, "icon-512-maskable.png")],
}


def render(svg_path: Path, size: int, out_path: Path) -> None:
    """Render an SVG to a square PNG via cairosvg, then Pillow-optimise."""
    png_bytes = cairosvg.svg2png(
        url=str(svg_path),
        output_width=size,
        output_height=size,
    )
    # Reopen with Pillow to strip ancillary chunks + apply lossless optimise.
    tmp = out_path.with_suffix(".tmp.png")
    tmp.write_bytes(png_bytes)
    with Image.open(tmp) as im:
        im = im.convert("RGBA")
        im.save(out_path, format="PNG", optimize=True)
    tmp.unlink()
    print(f"  -> {out_path.relative_to(ROOT)}  ({size}x{size}, {out_path.stat().st_size:,} B)")


def main() -> int:
    if not ICONS.is_dir():
        print(f"missing {ICONS.relative_to(ROOT)}", flush=True)
        return 2
    for svg_name, targets in SOURCES.items():
        svg_path = ICONS / svg_name
        if not svg_path.is_file():
            print(f"missing source {svg_path.relative_to(ROOT)}")
            return 2
        print(f"{svg_path.relative_to(ROOT)}:")
        for size, out_name in targets:
            render(svg_path, size, ICONS / out_name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
