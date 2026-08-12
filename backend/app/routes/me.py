"""Authenticated routes: profile, progress sync, certificate issuance."""

from __future__ import annotations

import json
import re
import unicodedata
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from .. import credential, db
from .. import merge as merge_mod
from ..auth import AuthedUser, require_user
from ..models import CertificateOut, MeOut, ProfileOut, ProgressBlob, ProfileUpdate
from ..skills import SKILLS

router = APIRouter(prefix="/v1")

SYNC_MAX_RETRIES = 5
CERT_ID_MAX_RETRIES = 5


def _now_iso() -> str:
    return (
        datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    )


def _ensure_profile(user: AuthedUser, now: str) -> None:
    if db.get_profile(user.sub) is None:
        db.put_profile(user.sub, email=user.email, now=now)


@router.get("/me", response_model=MeOut)
def get_me(user: AuthedUser = Depends(require_user)) -> MeOut:
    items = db.get_user_items(user.sub)
    by_sk = {item["SK"]: item for item in items}

    profile_item = by_sk.get("PROFILE") or {}
    profile = ProfileOut(
        email=profile_item.get("email") or user.email,
        displayName=profile_item.get("displayName"),
        nickname=profile_item.get("nickname"),
    )

    progress = None
    progress_item = by_sk.get("PROGRESS")
    if progress_item:
        progress = ProgressBlob(
            completed=progress_item["completed"],
            hintsUsed=progress_item["hintsUsed"],
            achievements=progress_item["achievements"],
        )

    certificate = None
    certref = by_sk.get(db.CERTREF_SK)
    if certref:
        cert_item = db.get_cert(certref["certId"])
        if cert_item:
            certificate = credential.certificate_out_from_item(cert_item)

    return MeOut(profile=profile, progress=progress, certificate=certificate)


def _clean_display_name(raw: str) -> str:
    without_control = "".join(
        ch for ch in raw if unicodedata.category(ch)[0] != "C"
    )
    return re.sub(r"\s+", " ", without_control).strip()


#: A nickname sits next to a score, so it is kept shorter than a certificate name.
NICKNAME_MIN = 2
NICKNAME_MAX = 24


@router.put("/me")
def put_me(body: ProfileUpdate, user: AuthedUser = Depends(require_user)) -> dict:
    """Update the certificate name, the leaderboard nickname, or both.

    Whichever field is absent from the body is left alone, so the two can be
    edited independently from different screens.
    """
    if body.displayName is None and body.nickname is None:
        raise HTTPException(status_code=400, detail={"code": "nothing_to_update"})

    name: Optional[str] = None
    if body.displayName is not None:
        name = _clean_display_name(body.displayName)
        if not (1 <= len(name) <= 60) or not any(ch.isalnum() for ch in name):
            raise HTTPException(status_code=400, detail={"code": "invalid_display_name"})

    nickname: Optional[str] = None
    if body.nickname is not None:
        nickname = _clean_display_name(body.nickname)
        if not (NICKNAME_MIN <= len(nickname) <= NICKNAME_MAX) or not any(
            ch.isalnum() for ch in nickname
        ):
            raise HTTPException(status_code=400, detail={"code": "invalid_nickname"})

    db.put_profile(
        user.sub,
        email=user.email,
        now=_now_iso(),
        display_name=name,
        nickname=nickname,
    )
    # Echo the stored profile, not just what changed, so the client never has to
    # guess what the other field is now.
    stored = db.get_profile(user.sub) or {}
    return {
        "profile": {
            "email": user.email,
            "displayName": stored.get("displayName"),
            "nickname": stored.get("nickname"),
        }
    }


@router.post("/sync")
def sync(body: ProgressBlob, user: AuthedUser = Depends(require_user)) -> dict:
    client_blob = body.model_dump()
    now = _now_iso()

    merged = None
    for _ in range(1 + SYNC_MAX_RETRIES):
        stored_item = db.get_progress(user.sub)
        if stored_item is not None:
            stored = {
                key: stored_item[key]
                for key in ("completed", "hintsUsed", "achievements")
            }
            read_v = stored_item["v"]
        else:
            stored, read_v = None, None

        merged = merge_mod.merge(stored, client_blob)
        if stored is not None and merged == merge_mod.sanitize(stored):
            break  # no-op: leave the stored item (and its version) untouched
        try:
            db.put_progress_conditional(user.sub, merged, read_v, now)
            break
        except db.ConditionalWriteFailed:
            merged = None
            continue
    if merged is None:
        raise HTTPException(status_code=409, detail={"code": "sync_conflict"})

    _ensure_profile(user, now)
    return {"progress": merged}


@router.post("/certificates", response_model=CertificateOut)
def issue_certificate(user: AuthedUser = Depends(require_user)) -> CertificateOut:
    # Idempotent: an existing certificate is simply returned.
    certref = db.get_certref(user.sub)
    if certref:
        cert_item = db.get_cert(certref["certId"])
        if cert_item:
            return credential.certificate_out_from_item(cert_item)

    profile = db.get_profile(user.sub) or {}
    display_name = profile.get("displayName")
    if not display_name:
        raise HTTPException(status_code=400, detail={"code": "display_name_required"})

    progress_item = db.get_progress(user.sub)
    completed = (progress_item or {}).get("completed") or {}
    missing = [slug for slug in merge_mod.ALL_SLUGS if slug not in completed]
    if missing:
        raise HTTPException(
            status_code=400, detail={"code": "incomplete", "missing": missing}
        )

    email = profile.get("email") or user.email
    issued_on = _now_iso()
    salt = credential.generate_salt()

    for _ in range(1 + CERT_ID_MAX_RETRIES):
        cred_id = credential.generate_credential_id()
        cred = credential.build_credential(cred_id, email, salt, issued_on)
        jws = credential.sign_credential(cred)

        cert_item = {
            "PK": f"CERT#{cred_id}",
            "SK": "CERT",
            "sub": user.sub,
            "recipientName": display_name,
            "issuedOn": issued_on,
            "skills": SKILLS,
            "credentialJson": json.dumps(cred, ensure_ascii=False),
            "jws": jws,
            "salt": salt,
            "revoked": False,
        }
        certref_item = {
            "PK": f"USER#{user.sub}",
            "SK": db.CERTREF_SK,
            "certId": cred_id,
            "issuedOn": issued_on,
        }
        try:
            db.issue_cert_transaction(cert_item, certref_item)
            return credential.certificate_out_from_item(cert_item)
        except db.CertIdCollision:
            continue  # extraordinarily unlikely; roll a fresh id
        except db.CertRefRace:
            existing = db.get_certref(user.sub)
            if existing:
                cert_item = db.get_cert(existing["certId"])
                if cert_item:
                    return credential.certificate_out_from_item(cert_item)
            continue  # reasons were ambiguous — treat as id collision

    raise HTTPException(status_code=500, detail={"code": "certificate_issue_failed"})
