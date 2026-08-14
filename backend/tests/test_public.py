"""Public routes: verify, credential (json/jwt), badge.png, card.png."""

from __future__ import annotations

import json
from io import BytesIO

from PIL import Image

from app.merge import ALL_SLUGS

VERIFY_CACHE = "public, max-age=300, s-maxage=3600"
NOT_FOUND_CACHE = "public, max-age=60"
IMMUTABLE_CACHE = "public, max-age=86400, s-maxage=31536000, immutable"


def _issue_cert(client, auth_headers, sub, email, name="Test Learner"):
    headers = auth_headers(sub=sub, email=email)
    resp = client.put("/v1/me", json={"displayName": name}, headers=headers)
    assert resp.status_code == 200
    resp = client.post(
        "/v1/sync",
        json={
            "completed": {slug: "2025-06-01T10:00:00Z" for slug in ALL_SLUGS},
            "hintsUsed": {},
            "achievements": [],
        },
        headers=headers,
    )
    assert resp.status_code == 200
    resp = client.post("/v1/certificates", headers=headers)
    assert resp.status_code == 200
    return resp.json()


def _revoke(cred_id):
    from app import db

    db.get_table().update_item(
        Key={"PK": f"CERT#{cred_id}", "SK": "CERT"},
        UpdateExpression="SET #r = :r",
        ExpressionAttributeNames={"#r": "revoked"},
        ExpressionAttributeValues={":r": True},
    )


def test_verify_valid(client, auth_headers):
    cert = _issue_cert(client, auth_headers, "pub-user-1", "p1@example.com", "Ada Lovelace")
    cred_id = cert["credentialId"]

    resp = client.get(f"/v1/verify/{cred_id}")
    assert resp.status_code == 200
    assert resp.headers["Cache-Control"] == VERIFY_CACHE
    body = resp.json()
    assert body["status"] == "valid"
    assert body["credentialId"] == cred_id
    assert body["recipientName"] == "Ada Lovelace"
    assert body["achievementName"] == "Git Foundations — VersionControl.gr"
    assert len(body["skills"]) == 11
    assert body["urls"]["verify"].endswith(f"/verify/{cred_id}/")


def test_verify_revoked(client, auth_headers):
    cert = _issue_cert(client, auth_headers, "pub-user-2", "p2@example.com")
    cred_id = cert["credentialId"]
    _revoke(cred_id)

    resp = client.get(f"/v1/verify/{cred_id}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "revoked"

    # credential endpoints still serve, flagged with the status header
    resp = client.get(f"/v1/credentials/{cred_id}")
    assert resp.status_code == 200
    assert resp.headers["X-Credential-Status"] == "revoked"


def test_verify_not_found_and_cache_headers(client):
    resp = client.get("/v1/verify/VC-GIT-F-00000000")
    assert resp.status_code == 404
    assert resp.json() == {"status": "not_found"}
    assert resp.headers["Cache-Control"] == NOT_FOUND_CACHE


def test_malformed_id_is_404_without_db(client):
    for bad in ("VC-GIT-F-aaaaaaaa", "VC-GIT-F-ILOU0000", "VC-GIT-F-SHORT", "X" * 40):
        resp = client.get(f"/v1/verify/{bad}")
        assert resp.status_code == 404, bad


def test_credential_json_and_jwt_format(client, auth_headers):
    cert = _issue_cert(client, auth_headers, "pub-user-3", "p3@example.com")
    cred_id = cert["credentialId"]

    from app import db

    stored = db.get_cert(cred_id)

    resp = client.get(f"/v1/credentials/{cred_id}")
    assert resp.status_code == 200
    assert resp.headers["Content-Type"].startswith("application/json")
    assert resp.headers["Cache-Control"] == IMMUTABLE_CACHE
    assert "X-Credential-Status" not in resp.headers
    assert resp.text == stored["credentialJson"]
    body = json.loads(resp.text)
    assert body["id"].endswith(cred_id)

    resp = client.get(f"/v1/credentials/{cred_id}", params={"format": "jwt"})
    assert resp.status_code == 200
    assert resp.headers["Content-Type"].startswith("text/plain")
    assert resp.headers["Cache-Control"] == IMMUTABLE_CACHE
    assert resp.text == stored["jws"]
    assert resp.text.count(".") == 2


def test_badge_png(client, auth_headers):
    cert = _issue_cert(client, auth_headers, "pub-user-4", "p4@example.com")
    cred_id = cert["credentialId"]

    resp = client.get(f"/v1/credentials/{cred_id}/badge.png")
    assert resp.status_code == 200
    assert resp.headers["Content-Type"] == "image/png"
    assert resp.headers["Cache-Control"] == IMMUTABLE_CACHE
    assert resp.headers["Content-Disposition"] == (
        f'attachment; filename="versioncontrol-badge-{cred_id}.png"'
    )

    from app import db

    image = Image.open(BytesIO(resp.content))
    assert image.format == "PNG"
    assert image.text["openbadgecredential"] == db.get_cert(cred_id)["jws"]


def test_card_png(client, auth_headers):
    cert = _issue_cert(client, auth_headers, "pub-user-5", "p5@example.com")
    cred_id = cert["credentialId"]

    resp = client.get(f"/v1/credentials/{cred_id}/card.png")
    assert resp.status_code == 200
    assert resp.headers["Content-Type"] == "image/png"
    assert resp.headers["Cache-Control"] == IMMUTABLE_CACHE
    assert resp.headers["Content-Disposition"] == (
        f'attachment; filename="versioncontrol-certificate-{cred_id}.png"'
    )
    image = Image.open(BytesIO(resp.content))
    assert image.format == "PNG"
    assert image.size == (1200, 630)

    # deterministic for identical inputs
    again = client.get(f"/v1/credentials/{cred_id}/card.png")
    assert again.content == resp.content


def test_card_png_greek_name(client, auth_headers):
    cert = _issue_cert(
        client, auth_headers, "pub-user-6", "p6@example.com", "Στράτος Παπαφωτίου"
    )
    cred_id = cert["credentialId"]
    assert cert["recipientName"] == "Στράτος Παπαφωτίου"

    resp = client.get(f"/v1/credentials/{cred_id}/card.png")
    assert resp.status_code == 200
    image = Image.open(BytesIO(resp.content))
    assert image.size == (1200, 630)


def test_credential_not_found(client):
    resp = client.get("/v1/credentials/VC-GIT-F-00000000")
    assert resp.status_code == 404
    assert resp.headers["Cache-Control"] == NOT_FOUND_CACHE


def test_health_behind_the_gate(client, bare_client):
    assert client.get("/v1/health").json() == {"status": "ok"}
    assert bare_client.get("/v1/health").status_code == 403
