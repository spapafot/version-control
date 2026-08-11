"""Open Badges 3.0 PNG baking.

Per the OB 3.0 baking spec the compact JWS is embedded in an ``iTXt`` chunk
with keyword ``openbadgecredential``.
"""

from __future__ import annotations

from io import BytesIO

from PIL import Image
from PIL.PngImagePlugin import PngInfo

ITXT_KEYWORD = "openbadgecredential"


def bake_png(template_bytes: bytes, jws: str) -> bytes:
    image = Image.open(BytesIO(template_bytes))
    image.load()

    meta = PngInfo()
    meta.add_itxt(ITXT_KEYWORD, jws, lang="", tkey="")

    out = BytesIO()
    image.save(out, format="PNG", pnginfo=meta)
    return out.getvalue()
