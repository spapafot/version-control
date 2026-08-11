"""Public (unauthenticated) routes: verification and credential artifacts.

The credential id is validated against the Crockford-base32 pattern before any
database access. ``/verify`` is the revocation oracle; the credential/badge/
card endpoints serve immutable content (revoked credentials still resolve,
flagged with ``X-Credential-Status: revoked``).
"""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path
from typing import Optional

from fastapi import APIRouter
from fastapi.responses import JSONResponse, PlainTextResponse, Response

from .. import baking, db
from .. import card as card_mod
from ..credential import ACHIEVEMENT_NAME, build_urls
from ..models import VerifyOut

router = APIRouter(prefix="/v1")

CRED_ID_RE = re.compile(r"^VC-GIT-F-[0-9A-HJKMNP-TV-Z]{8}$")


@router.get("/health")
def health() -> dict:
    """Liveness probe. Sits behind the proxy-secret gate like everything else,
    so a 200 here proves the Worker → Lambda secret wiring end to end."""
    return {"status": "ok"}

VERIFY_CACHE = "public, max-age=300, s-maxage=3600"
NOT_FOUND_CACHE = "public, max-age=60"
IMMUTABLE_CACHE = "public, max-age=86400, s-maxage=31536000, immutable"

_TEMPLATE_PATH = (
    Path(__file__).resolve().parent.parent / "assets" / "badge-template.png"
)


@lru_cache(maxsize=1)
def _badge_template() -> bytes:
    return _TEMPLATE_PATH.read_bytes()


def _load_cert(cred_id: str) -> Optional[dict]:
    if not CRED_ID_RE.fullmatch(cred_id):
        return None
    return db.get_cert(cred_id)


def _not_found(body: dict) -> JSONResponse:
    return JSONResponse(
        body, status_code=404, headers={"Cache-Control": NOT_FOUND_CACHE}
    )


def _immutable_headers(item: dict) -> dict:
    headers = {"Cache-Control": IMMUTABLE_CACHE}
    if item.get("revoked"):
        headers["X-Credential-Status"] = "revoked"
    return headers


@router.get("/verify/{cred_id}")
def verify(cred_id: str) -> Response:
    item = _load_cert(cred_id)
    if item is None:
        return _not_found({"status": "not_found"})
    out = VerifyOut(
        status="revoked" if item.get("revoked") else "valid",
        credentialId=cred_id,
        recipientName=item["recipientName"],
        issuedOn=item["issuedOn"],
        achievementName=ACHIEVEMENT_NAME,
        skills=list(item["skills"]),
        urls=build_urls(cred_id),
    )
    return JSONResponse(out.model_dump(), headers={"Cache-Control": VERIFY_CACHE})


@router.get("/credentials/{cred_id}")
def get_credential(cred_id: str, format: Optional[str] = None) -> Response:
    item = _load_cert(cred_id)
    if item is None:
        return _not_found({"code": "not_found"})
    headers = _immutable_headers(item)
    if format == "jwt":
        return PlainTextResponse(item["jws"], headers=headers)
    return Response(
        content=item["credentialJson"], media_type="application/json", headers=headers
    )


@router.get("/credentials/{cred_id}/badge.png")
def badge_png(cred_id: str) -> Response:
    item = _load_cert(cred_id)
    if item is None:
        return _not_found({"code": "not_found"})
    png = baking.bake_png(_badge_template(), item["jws"])
    headers = _immutable_headers(item)
    headers["Content-Disposition"] = (
        f'attachment; filename="versioncontrol-badge-{cred_id}.png"'
    )
    return Response(content=png, media_type="image/png", headers=headers)


@router.get("/credentials/{cred_id}/card.png")
def card_png(cred_id: str) -> Response:
    item = _load_cert(cred_id)
    if item is None:
        return _not_found({"code": "not_found"})
    png = card_mod.render_card(
        item["recipientName"], list(item["skills"]), item["issuedOn"], cred_id
    )
    headers = _immutable_headers(item)
    headers["Content-Disposition"] = (
        f'attachment; filename="versioncontrol-certificate-{cred_id}.png"'
    )
    return Response(content=png, media_type="image/png", headers=headers)
