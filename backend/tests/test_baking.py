"""OB 3.0 PNG baking: iTXt keyword roundtrip."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path

from PIL import Image

from app.baking import ITXT_KEYWORD, bake_png

TEMPLATE_PATH = (
    Path(__file__).resolve().parent.parent / "app" / "assets" / "badge-template.png"
)


def test_bake_and_read_back():
    template = TEMPLATE_PATH.read_bytes()
    jws = "eyJhbGciOiJFZERTQSJ9.eyJmYWtlIjoicGF5bG9hZCJ9.c2lnbmF0dXJl"
    baked = bake_png(template, jws)

    image = Image.open(BytesIO(baked))
    assert image.format == "PNG"
    assert image.text[ITXT_KEYWORD] == jws
    assert ITXT_KEYWORD == "openbadgecredential"


def test_template_is_valid_600x600_png():
    image = Image.open(BytesIO(TEMPLATE_PATH.read_bytes()))
    assert image.format == "PNG"
    assert image.size == (600, 600)


def test_baked_output_is_valid_png_and_preserves_size():
    template = TEMPLATE_PATH.read_bytes()
    baked = bake_png(template, "a.b.c")
    image = Image.open(BytesIO(baked))
    image.verify()  # raises on a corrupt file
    image = Image.open(BytesIO(baked))
    assert image.size == (600, 600)
