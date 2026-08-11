"""Proxy-secret gate + Cognito ID-token validation."""

from __future__ import annotations

import time

from cryptography.hazmat.primitives.asymmetric import rsa

from conftest import PROXY_SECRET


def test_403_without_proxy_secret_on_private_route(bare_client):
    resp = bare_client.get("/v1/me")
    assert resp.status_code == 403


def test_403_without_proxy_secret_on_public_route(bare_client):
    resp = bare_client.get("/v1/verify/VC-GIT-F-00000000")
    assert resp.status_code == 403


def test_403_with_wrong_proxy_secret(bare_client):
    resp = bare_client.get(
        "/v1/verify/VC-GIT-F-00000000", headers={"X-Proxy-Secret": "nope"}
    )
    assert resp.status_code == 403


def test_correct_proxy_secret_passes_the_gate(bare_client):
    resp = bare_client.get(
        "/v1/verify/VC-GIT-F-00000000", headers={"X-Proxy-Secret": PROXY_SECRET}
    )
    assert resp.status_code == 404  # past the gate, id simply unknown


def test_401_missing_authorization(client):
    resp = client.get("/v1/me")
    assert resp.status_code == 401


def test_401_garbage_bearer(client):
    resp = client.get("/v1/me", headers={"Authorization": "Bearer not.a.jwt"})
    assert resp.status_code == 401


def test_401_expired_token(client, auth_headers):
    now = int(time.time())
    resp = client.get("/v1/me", headers=auth_headers(exp=now - 60, iat=now - 3660))
    assert resp.status_code == 401


def test_401_bad_signature(client, mint_token):
    other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    token = mint_token(_key=other_key)
    resp = client.get("/v1/me", headers={"Authorization": "Bearer " + token})
    assert resp.status_code == 401


def test_401_wrong_audience(client, auth_headers):
    resp = client.get("/v1/me", headers=auth_headers(aud="some-other-client"))
    assert resp.status_code == 401


def test_401_access_token_rejected(client, auth_headers):
    resp = client.get("/v1/me", headers=auth_headers(token_use="access"))
    assert resp.status_code == 401


def test_401_unverified_email(client, auth_headers):
    resp = client.get("/v1/me", headers=auth_headers(email_verified=False))
    assert resp.status_code == 401


def test_401_wrong_issuer(client, auth_headers):
    resp = client.get(
        "/v1/me",
        headers=auth_headers(iss="https://cognito-idp.eu-central-1.amazonaws.com/other"),
    )
    assert resp.status_code == 401


def test_happy_path(client, auth_headers):
    resp = client.get(
        "/v1/me", headers=auth_headers(sub="happy-user", email="happy@example.com")
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["profile"]["email"] == "happy@example.com"
    assert body["progress"] is None
    assert body["certificate"] is None
