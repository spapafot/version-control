"""POST /v1/certificates: gates, issuance, idempotency, id-collision retry."""

from __future__ import annotations

import re

from app.merge import ALL_SLUGS
from app.skills import SKILLS

CRED_ID_RE = re.compile(r"^VC-GIT-F-[0-9A-HJKMNP-TV-Z]{8}$")


def _sync_completed(client, headers, slugs):
    resp = client.post(
        "/v1/sync",
        json={
            "completed": {slug: "2025-06-01T10:00:00Z" for slug in slugs},
            "hintsUsed": {},
            "achievements": [],
        },
        headers=headers,
    )
    assert resp.status_code == 200


def _set_name(client, headers, name="Test Learner"):
    resp = client.put("/v1/me", json={"displayName": name}, headers=headers)
    assert resp.status_code == 200
    return resp


def test_display_name_required(client, auth_headers):
    headers = auth_headers(sub="cert-user-1", email="c1@example.com")
    _sync_completed(client, headers, ALL_SLUGS)
    resp = client.post("/v1/certificates", headers=headers)
    assert resp.status_code == 400
    assert resp.json()["code"] == "display_name_required"


def test_incomplete_lists_missing_slugs(client, auth_headers):
    headers = auth_headers(sub="cert-user-2", email="c2@example.com")
    _set_name(client, headers)
    held_back = {"conflict-hell", "grand-opening"}
    _sync_completed(client, headers, [s for s in ALL_SLUGS if s not in held_back])
    resp = client.post("/v1/certificates", headers=headers)
    assert resp.status_code == 400
    body = resp.json()
    assert body["code"] == "incomplete"
    assert set(body["missing"]) == held_back


def test_invalid_display_name_rejected(client, auth_headers):
    headers = auth_headers(sub="cert-user-3", email="c3@example.com")
    for bad in ["   ", "!!! ---", "x" * 61, ""]:
        resp = client.put("/v1/me", json={"displayName": bad}, headers=headers)
        assert resp.status_code == 400, bad
        assert resp.json()["code"] == "invalid_display_name"
    # whitespace collapse + trim
    resp = _set_name(client, headers, "  Ada   Lovelace  ")
    assert resp.json()["profile"]["displayName"] == "Ada Lovelace"


def test_happy_path(client, auth_headers):
    headers = auth_headers(sub="cert-user-4", email="c4@example.com")
    _set_name(client, headers, "Ada Lovelace")
    _sync_completed(client, headers, ALL_SLUGS)

    resp = client.post("/v1/certificates", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    cred_id = body["credentialId"]
    assert CRED_ID_RE.fullmatch(cred_id)
    assert body["recipientName"] == "Ada Lovelace"
    assert body["issuedOn"].endswith("Z")
    assert body["skills"] == SKILLS
    urls = body["urls"]
    assert urls["verify"] == f"https://versioncontrol.gr/verify/{cred_id}/"
    assert urls["credential"] == f"https://api.versioncontrol.gr/v1/credentials/{cred_id}"
    assert urls["jwt"] == urls["credential"] + "?format=jwt"
    assert urls["badge"] == urls["credential"] + "/badge.png"
    assert urls["card"] == urls["credential"] + "/card.png"

    from app import db

    cert = db.get_cert(cred_id)
    assert cert is not None
    assert cert["sub"] == "cert-user-4"
    assert cert["revoked"] is False
    assert cert["jws"].count(".") == 2
    assert len(cert["salt"]) == 32  # 16 bytes hex
    certref = db.get_certref("cert-user-4")
    assert certref is not None and certref["certId"] == cred_id

    # certificate also shows up in GET /v1/me
    me = client.get("/v1/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["certificate"]["credentialId"] == cred_id


def test_idempotent_second_post(client, auth_headers):
    headers = auth_headers(sub="cert-user-5", email="c5@example.com")
    _set_name(client, headers)
    _sync_completed(client, headers, ALL_SLUGS)

    first = client.post("/v1/certificates", headers=headers)
    second = client.post("/v1/certificates", headers=headers)
    assert first.status_code == 200 and second.status_code == 200
    assert first.json()["credentialId"] == second.json()["credentialId"]


def test_forced_id_collision_retries_to_new_id(client, auth_headers, monkeypatch):
    from app import credential as credential_mod

    # First user claims the fixed id.
    headers_a = auth_headers(sub="cert-user-6", email="c6@example.com")
    _set_name(client, headers_a)
    _sync_completed(client, headers_a, ALL_SLUGS)
    monkeypatch.setattr(
        credential_mod, "generate_credential_id", lambda: "VC-GIT-F-AAAAAAAA"
    )
    resp_a = client.post("/v1/certificates", headers=headers_a)
    assert resp_a.status_code == 200
    assert resp_a.json()["credentialId"] == "VC-GIT-F-AAAAAAAA"

    # Second user first draws the same id, then a fresh one.
    ids = iter(["VC-GIT-F-AAAAAAAA", "VC-GIT-F-BBBBBBBB"])
    monkeypatch.setattr(credential_mod, "generate_credential_id", lambda: next(ids))
    headers_b = auth_headers(sub="cert-user-7", email="c7@example.com")
    _set_name(client, headers_b)
    _sync_completed(client, headers_b, ALL_SLUGS)
    resp_b = client.post("/v1/certificates", headers=headers_b)
    assert resp_b.status_code == 200
    assert resp_b.json()["credentialId"] == "VC-GIT-F-BBBBBBBB"

    from app import db

    assert db.get_cert("VC-GIT-F-AAAAAAAA")["sub"] == "cert-user-6"
    assert db.get_cert("VC-GIT-F-BBBBBBBB")["sub"] == "cert-user-7"
