"""1200x630 certificate share card, mirroring the site's OG card design.

Palette matches src/lib/og.tsx of the frontend. Output is deterministic for a
given (name, skills, issued_on, cred_id) tuple: no timestamps, no randomness.
"""

from __future__ import annotations

from functools import lru_cache
from io import BytesIO
from pathlib import Path
from typing import List, Sequence, Tuple

from PIL import Image, ImageDraw, ImageFont

INK = "#050807"
PANEL = "#0a120c"
LINE = "#1c3322"
PHOS = "#3dff74"
PHOS_DIM = "#23b24e"
AMBER = "#ffb000"
MUTED = "#7ea98a"
FG = "#d7f5e1"

WIDTH, HEIGHT = 1200, 630
MARGIN = 72

_FONT_DIR = Path(__file__).resolve().parent / "assets" / "fonts"


@lru_cache(maxsize=32)
def _font(filename: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(_FONT_DIR / filename), size)


def _inter(size: int) -> ImageFont.FreeTypeFont:
    return _font("Inter-SemiBold.ttf", size)


def _mono(size: int) -> ImageFont.FreeTypeFont:
    return _font("JetBrainsMono-Regular.ttf", size)


def _fit_name(
    draw: ImageDraw.ImageDraw, name: str, max_width: int
) -> Tuple[str, ImageFont.FreeTypeFont]:
    """Shrink from 72px to fit; ellipsize if the floor size still overflows."""
    size = 72
    while size > 40:
        font = _inter(size)
        if draw.textlength(name, font=font) <= max_width:
            return name, font
        size -= 4
    font = _inter(size)
    text = name
    while text and draw.textlength(text + "…", font=font) > max_width:
        text = text[:-1]
    return (text + "…") if text != name else name, font


def _wrap_skills(
    draw: ImageDraw.ImageDraw,
    skills: Sequence[str],
    font: ImageFont.FreeTypeFont,
    max_width: int,
) -> List[str]:
    """Greedy wrap onto max 2 lines, appending "+N more" when items overflow."""
    sep = " · "
    lines: List[List[str]] = [[], []]
    idx = 0
    for li in range(2):
        while idx < len(skills):
            candidate = lines[li] + [skills[idx]]
            if draw.textlength(sep.join(candidate), font=font) > max_width:
                break
            lines[li] = candidate
            idx += 1
    leftover = len(skills) - idx
    if leftover > 0:
        while lines[1]:
            suffix = f"+{leftover} more"
            text = sep.join(lines[1] + [suffix])
            if draw.textlength(text, font=font) <= max_width:
                break
            lines[1].pop()
            leftover += 1
        lines[1] = lines[1] + [f"+{leftover} more"]
    return [sep.join(line) for line in lines if line]


def render_card(name: str, skills: Sequence[str], issued_on: str, cred_id: str) -> bytes:
    img = Image.new("RGB", (WIDTH, HEIGHT), INK)
    draw = ImageDraw.Draw(img)

    # 8px LINE border, inset from the edge
    draw.rectangle([16, 16, WIDTH - 17, HEIGHT - 17], outline=LINE, width=8)

    # top-left site mark: phosphor square + wordmark
    mark_y = 64
    draw.rectangle([MARGIN, mark_y, MARGIN + 24, mark_y + 24], fill=PHOS)
    draw.text((MARGIN + 40, mark_y - 6), "VersionControl.gr", font=_inter(30), fill=PHOS)

    # amber-bordered chip
    chip_text = "CERTIFIED · GIT FOUNDATIONS"
    chip_font = _mono(24)
    chip_y = 150
    chip_w = draw.textlength(chip_text, font=chip_font)
    draw.rectangle(
        [MARGIN, chip_y, MARGIN + chip_w + 40, chip_y + 48], outline=AMBER, width=2
    )
    draw.text((MARGIN + 20, chip_y + 10), chip_text, font=chip_font, fill=AMBER)

    # recipient name
    max_width = WIDTH - 2 * MARGIN
    name_text, name_font = _fit_name(draw, name, max_width)
    draw.text((MARGIN, 264), name_text, font=name_font, fill=PHOS)

    # skills, max 2 lines
    skills_font = _mono(26)
    skills_y = 396
    for i, line in enumerate(_wrap_skills(draw, skills, skills_font, max_width)):
        draw.text((MARGIN, skills_y + i * 40), line, font=skills_font, fill=FG)

    # bottom row: issued date, credential id, verify URL (right-aligned)
    bottom_font = _mono(20)
    bottom_y = 540
    issued_text = f"ISSUED {issued_on[:10]}"
    draw.text((MARGIN, bottom_y), issued_text, font=bottom_font, fill=MUTED)
    issued_w = draw.textlength(issued_text, font=bottom_font)
    draw.text(
        (MARGIN + issued_w + 56, bottom_y), cred_id, font=bottom_font, fill=AMBER
    )
    verify_text = f"versioncontrol.gr/verify/{cred_id}"
    verify_w = draw.textlength(verify_text, font=bottom_font)
    draw.text(
        (WIDTH - MARGIN - verify_w, bottom_y), verify_text, font=bottom_font, fill=MUTED
    )

    # subtle CRT scanlines: every 3rd row darkened
    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)
    for y in range(0, HEIGHT, 3):
        overlay_draw.line([(0, y), (WIDTH, y)], fill=(0, 0, 0, 8))
    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")

    out = BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()
