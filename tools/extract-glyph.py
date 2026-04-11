#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["fonttools"]
# ///
"""
ABOUTME: Extract a single Unicode glyph from a TTF font as a standalone SVG.
ABOUTME: Used to pull U+1FAB6 (feather) from Noto Sans Symbols 2 for the Quoth icon.
"""

from __future__ import annotations

import argparse
import sys
import urllib.request
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

# Google Fonts canonical mirror for Noto Sans Symbols 2 (SIL OFL 1.1).
DEFAULT_FONT_URL = (
    "https://github.com/google/fonts/raw/main/ofl/"
    "notosanssymbols2/NotoSansSymbols2-Regular.ttf"
)


def download_font(url: str, dest: Path) -> Path:
    if dest.exists():
        return dest
    print(f"downloading {url} -> {dest}", file=sys.stderr)
    dest.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(url, dest)
    return dest


def extract_glyph_svg(font_path: Path, codepoint: int) -> str:
    font = TTFont(font_path)
    glyph_set = font.getGlyphSet()
    cmap = font.getBestCmap()
    if codepoint not in cmap:
        raise SystemExit(f"U+{codepoint:04X} not found in {font_path.name}")
    glyph_name = cmap[codepoint]
    glyph = glyph_set[glyph_name]

    # Measure the glyph's bounding box in font coordinates (baseline-origin, Y up).
    bounds_pen = BoundsPen(glyph_set)
    glyph.draw(bounds_pen)
    if bounds_pen.bounds is None:
        raise SystemExit(f"U+{codepoint:04X} has no visible outline")
    x_min, y_min, x_max, y_max = bounds_pen.bounds
    width = x_max - x_min
    height = y_max - y_min

    # Emit path commands with: (1) Y-axis flipped (SVG has Y down), and
    # (2) translated so the top-left of the tight bbox sits at (0, 0).
    #
    # Affine matrix (xx, xy, yx, yy, dx, dy) applied as:
    #   x' = x*xx + y*yx + dx =  x - x_min
    #   y' = x*xy + y*yy + dy = -y + y_max
    svg_pen = SVGPathPen(glyph_set)
    transform_pen = TransformPen(svg_pen, (1, 0, 0, -1, -x_min, y_max))
    glyph.draw(transform_pen)
    d = svg_pen.getCommands()

    # Explicit #000000 fill: ImageMagick's MSVG renderer doesn't resolve
    # `currentColor`. Consumers that want to recolor can override with CSS
    # (e.g. `svg path { fill: ... }`) or sed the output.
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {width:.0f} {height:.0f}">\n'
        f'  <path d="{d}" fill="#000000"/>\n'
        "</svg>\n"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--codepoint",
        default="1FAB6",
        help="hex codepoint to extract (default: 1FAB6 / 🪶 FEATHER)",
    )
    parser.add_argument(
        "--font",
        default=None,
        help="path to TTF file (downloads Noto Sans Symbols 2 to ~/.cache/quoth if omitted)",
    )
    parser.add_argument(
        "--out",
        default="-",
        help="output SVG path (default: stdout)",
    )
    args = parser.parse_args()

    cp = int(args.codepoint, 16)
    if args.font:
        font_path = Path(args.font).expanduser()
    else:
        cache_dir = Path.home() / ".cache" / "quoth"
        font_path = download_font(
            DEFAULT_FONT_URL, cache_dir / "NotoSansSymbols2-Regular.ttf"
        )

    svg = extract_glyph_svg(font_path, cp)

    if args.out == "-":
        sys.stdout.write(svg)
    else:
        out_path = Path(args.out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(svg)
        print(f"wrote {out_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
