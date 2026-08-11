"""Generate app/assets/badge-template.png — the 600x600 Open Badge artwork.

Retro CRT pixel-art: a phosphor-green shield containing a monitor motif with a
git commit-graph on screen, on the site's ink background, with amber accents.
Run from anywhere:  python backend/scripts/make_badge_template.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

INK = "#050807"
PANEL = "#0a120c"
LINE = "#1c3322"
PHOS = "#3dff74"
PHOS_DIM = "#23b24e"
AMBER = "#ffb000"

SIZE = 600
CELL = 14  # pixel-art cell size

# 24x26 pixel-art grid. Legend: . empty, # shield outline (phos),
# s shield fill (panel), m monitor frame (phos_dim), d screen (ink),
# g commit graph (phos), a accent (amber)
SHIELD = [
    "........########........",
    "......##--------##......",
    "....##------------##....",
    "..##----------------##..",
    ".#--------------------#.",
    ".#--------------------#.",
    ".#---mmmmmmmmmmmmmm---#.",
    ".#---m------------m---#.",
    ".#---m--g---------m---#.",
    ".#---m--g--a------m---#.",
    ".#---m--gg--------m---#.",
    ".#---m---g--------m---#.",
    ".#---m---g----g---m---#.",
    ".#---m---gg--gg---m---#.",
    ".#---m----ggg-----m---#.",
    ".#---m-----g------m---#.",
    ".#---m-----g------m---#.",
    ".#---mmmmmmmmmmmmmm---#.",
    ".#-------mmmm---------#.",
    ".#------mmmmmm--------#.",
    "..##----------------##..",
    "...##--------------##...",
    ".....##----------##.....",
    ".......##------##.......",
    ".........##--##.........",
    "...........##...........",
]

COLORS = {
    "#": PHOS,
    "-": PANEL,
    "m": PHOS_DIM,
    "g": PHOS,
    "a": AMBER,
}


def main() -> None:
    assets = Path(__file__).resolve().parent.parent / "app" / "assets"
    fonts = assets / "fonts"

    img = Image.new("RGB", (SIZE, SIZE), INK)
    draw = ImageDraw.Draw(img)

    # thin frame
    draw.rectangle([8, 8, SIZE - 9, SIZE - 9], outline=LINE, width=4)

    # centered pixel-art shield
    grid_w = len(SHIELD[0]) * CELL
    x0 = (SIZE - grid_w) // 2
    y0 = 64
    for row, line in enumerate(SHIELD):
        for col, ch in enumerate(line):
            color = COLORS.get(ch)
            if color is None:
                continue
            x = x0 + col * CELL
            y = y0 + row * CELL
            draw.rectangle([x, y, x + CELL - 1, y + CELL - 1], fill=color)

    bold = ImageFont.truetype(str(fonts / "JetBrainsMono-Bold.ttf"), 40)
    regular = ImageFont.truetype(str(fonts / "JetBrainsMono-Regular.ttf"), 22)

    title = "GIT FOUNDATIONS"
    tw = draw.textlength(title, font=bold)
    draw.text(((SIZE - tw) / 2, 470), title, font=bold, fill=PHOS)

    site = "VERSIONCONTROL.GR"
    sw = draw.textlength(site, font=regular)
    draw.text(((SIZE - sw) / 2, 530), site, font=regular, fill=AMBER)

    out = assets / "badge-template.png"
    img.save(out, format="PNG")
    print(f"wrote {out} ({out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
