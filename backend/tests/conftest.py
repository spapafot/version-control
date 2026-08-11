"""Shared fixtures: env settings, moto DynamoDB, fake Cognito, test clients.

No network, no real AWS: DynamoDB is moto's ``mock_aws``, Cognito is a local
RSA keypair injected into ``app.auth``'s JWKS mechanism.
"""

from __future__ import annotations

import base64
import time
from types import SimpleNamespace

import boto3
import jwt as pyjwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi.testclient import TestClient
from moto import mock_aws

TABLE_NAME = "vc-cert-test"
REGION = "eu-central-1"
POOL_ID = "eu-central-1_TestPool1"
CLIENT_ID = "test-cognito-client-id"
PROXY_SECRET = "proxy-secret-current"
COGNITO_ISSUER = f"https://cognito-idp.{REGION}.amazonaws.com/{POOL_ID}"


@pytest.fixture(scope="session")
def ed25519_key():
    return Ed25519PrivateKey.generate()


@pytest.fixture(scope="session")
def ed25519_seed_b64(ed25519_key):
    return base64.b64encode(ed25519_key.private_bytes_raw()).decode("ascii")


@pytest.fixture(scope="session")
def rsa_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture(autouse=True)
def settings_env(monkeypatch, ed25519_seed_b64):
    """Point settings (and boto3) at test values; reset all lazy singletons."""
    env = {
        "TABLE_NAME": TABLE_NAME,
        "AWS_REGION": REGION,
        "AWS_DEFAULT_REGION": REGION,
        "AWS_ACCESS_KEY_ID": "testing",
        "AWS_SECRET_ACCESS_KEY": "testing",
        "AWS_SESSION_TOKEN": "testing",
        "COGNITO_USER_POOL_ID": POOL_ID,
        "COGNITO_CLIENT_ID": CLIENT_ID,
        "PROXY_SECRET": PROXY_SECRET,
        "ISSUER_PRIVATE_KEY_B64": ed25519_seed_b64,
    }
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    for key in ("API_BASE", "SITE_BASE", "ISSUER_KID"):
        monkeypatch.delenv(key, raising=False)

    from app import auth, config, db

    config.get_settings.cache_clear()
    db.reset()
    auth.reset_jwks_client()
    yield
    config.get_settings.cache_clear()
    db.reset()
    auth.reset_jwks_client()


class FakeJWKSClient:
    """Stands in for PyJWKClient — always returns the test pool's public key."""

    def __init__(self, public_key):
        self._public_key = public_key

    def get_signing_key_from_jwt(self, token):
        return SimpleNamespace(key=self._public_key)


@pytest.fixture(autouse=True)
def fake_cognito(settings_env, rsa_key):
    from app import auth

    auth.reset_jwks_client(FakeJWKSClient(rsa_key.public_key()))
    yield
    auth.reset_jwks_client()


@pytest.fixture
def mint_token(rsa_key):
    """Mint a Cognito-shaped ID token. ``_key`` overrides the signing key;
    claim overrides with value ``None`` remove the claim entirely."""

    def _mint(sub="user-0000", email="learner@example.com", _key=None, **overrides):
        now = int(time.time())
        claims = {
            "sub": sub,
            "email": email,
            "email_verified": True,
            "token_use": "id",
            "aud": CLIENT_ID,
            "iss": COGNITO_ISSUER,
            "iat": now,
            "exp": now + 3600,
        }
        claims.update(overrides)
        claims = {k: v for k, v in claims.items() if v is not None}
        key = _key if _key is not None else rsa_key
        return pyjwt.encode(claims, key, algorithm="RS256", headers={"kid": "test-kid"})

    return _mint


@pytest.fixture
def auth_headers(mint_token):
    def _headers(sub="user-0000", email="learner@example.com", **overrides):
        return {"Authorization": "Bearer " + mint_token(sub=sub, email=email, **overrides)}

    return _headers


@pytest.fixture
def ddb_table(settings_env):
    with mock_aws():
        client = boto3.client("dynamodb", region_name=REGION)
        client.create_table(
            TableName=TABLE_NAME,
            KeySchema=[
                {"AttributeName": "PK", "KeyType": "HASH"},
                {"AttributeName": "SK", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "PK", "AttributeType": "S"},
                {"AttributeName": "SK", "AttributeType": "S"},
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        from app import db

        db.reset()
        yield
        db.reset()


@pytest.fixture
def app_instance(ddb_table):
    from app.main import create_app

    return create_app()


@pytest.fixture
def client(app_instance):
    """TestClient that already carries the current proxy secret."""
    c = TestClient(app_instance)
    c.headers.update({"X-Proxy-Secret": PROXY_SECRET})
    return c


@pytest.fixture
def bare_client(app_instance):
    """TestClient without any proxy secret."""
    return TestClient(app_instance)
