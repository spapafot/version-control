"""OB 3.0 credential shape + VC-JWT signing/verification."""

from __future__ import annotations

import base64
import hashlib
import json

import jwt as pyjwt
import pytest

from app.credential import (
    CREDENTIAL_JWT_TYP,
    build_credential,
    generate_credential_id,
    generate_salt,
    sign_credential,
)
from app.skills import SKILLS

CRED_ID = "VC-GIT-F-TESTTEST"
EMAIL = "Learner@Example.com"
ISSUED_ON = "2026-08-11T09:00:00Z"


@pytest.fixture
def credential_and_salt():
    salt = generate_salt()
    return build_credential(CRED_ID, EMAIL, salt, ISSUED_ON), salt


def test_credential_shape(credential_and_salt):
    cred, salt = credential_and_salt
    assert cred["@context"] == [
        "https://www.w3.org/ns/credentials/v2",
        "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
    ]
    assert cred["type"] == ["VerifiableCredential", "OpenBadgeCredential"]
    assert cred["id"] == f"https://api.versioncontrol.gr/v1/credentials/{CRED_ID}"
    assert cred["name"] == "Git Foundations Certificate"
    assert cred["validFrom"] == ISSUED_ON
    assert "validUntil" not in cred

    issuer = cred["issuer"]
    assert issuer["id"] == "did:web:versioncontrol.gr"
    assert issuer["type"] == ["Profile"]
    assert issuer["name"] == "VersionControl.gr"
    assert issuer["url"] == "https://versioncontrol.gr"

    subject = cred["credentialSubject"]
    assert subject["type"] == ["AchievementSubject"]

    achievement = subject["achievement"]
    assert achievement["id"] == "https://versioncontrol.gr/achievements/git-foundations"
    assert achievement["type"] == ["Achievement"]
    assert achievement["name"] == "Git Foundations - VersionControl.gr"
    assert "76" in achievement["description"]
    assert "76/76" in achievement["criteria"]["narrative"]
    assert achievement["image"]["id"] == "https://versioncontrol.gr/badge-git-foundations.png"

    tags = achievement["tags"]
    assert len(tags) == 13
    assert tags[:2] == ["Git", "Version Control"]
    assert tags[2:] == SKILLS


def test_email_hash_recomputes(credential_and_salt):
    cred, salt = credential_and_salt
    identifier = cred["credentialSubject"]["identifier"][0]
    assert identifier["type"] == "IdentityObject"
    assert identifier["hashed"] is True
    assert identifier["identityType"] == "emailAddress"
    assert identifier["salt"] == salt
    expected = hashlib.sha256((EMAIL.lower() + salt).encode("utf-8")).hexdigest()
    assert identifier["identityHash"] == "sha256$" + expected


def test_jws_header(credential_and_salt):
    cred, _ = credential_and_salt
    jws = sign_credential(cred)
    header = pyjwt.get_unverified_header(jws)
    assert header["alg"] == "EdDSA"
    assert header["kid"] == "did:web:versioncontrol.gr#key-0"
    assert header["typ"] == CREDENTIAL_JWT_TYP == "vc+jwt"


def test_verify_roundtrip(credential_and_salt, ed25519_key):
    cred, _ = credential_and_salt
    jws = sign_credential(cred)
    claims = pyjwt.decode(jws, ed25519_key.public_key(), algorithms=["EdDSA"])
    assert claims["iss"] == "did:web:versioncontrol.gr"
    assert claims["jti"] == cred["id"]
    from datetime import datetime, timezone

    expected_epoch = int(
        datetime(2026, 8, 11, 9, 0, 0, tzinfo=timezone.utc).timestamp()
    )
    assert claims["nbf"] == claims["iat"] == expected_epoch
    assert claims["validFrom"] == ISSUED_ON
    assert claims["credentialSubject"]["achievement"]["name"] == (
        "Git Foundations - VersionControl.gr"
    )


def test_tampered_jws_fails(credential_and_salt, ed25519_key):
    cred, _ = credential_and_salt
    jws = sign_credential(cred)
    header_b64, payload_b64, sig_b64 = jws.split(".")

    padded = payload_b64 + "=" * (-len(payload_b64) % 4)
    payload = json.loads(base64.urlsafe_b64decode(padded))
    payload["credentialSubject"]["achievement"]["name"] = "Totally Legit Doctorate"
    tampered_payload = (
        base64.urlsafe_b64encode(json.dumps(payload).encode("utf-8"))
        .decode("ascii")
        .rstrip("=")
    )
    tampered = ".".join([header_b64, tampered_payload, sig_b64])

    with pytest.raises(pyjwt.InvalidSignatureError):
        pyjwt.decode(tampered, ed25519_key.public_key(), algorithms=["EdDSA"])


def test_generated_ids_match_pattern():
    import re

    pattern = re.compile(r"^VC-GIT-F-[0-9A-HJKMNP-TV-Z]{8}$")
    ids = {generate_credential_id() for _ in range(200)}
    assert all(pattern.fullmatch(i) for i in ids)
    assert len(ids) > 190  # effectively no collisions in 200 draws
