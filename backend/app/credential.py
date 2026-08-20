"""Open Badges 3.0 credential construction and VC-JWT signing."""

from __future__ import annotations

import base64
import hashlib
import secrets
from datetime import datetime, timezone
from typing import Optional

import jwt
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from .config import Settings, get_settings
from .models import CertificateOut
from .skills import SKILLS

CREDENTIAL_ID_PREFIX = "VC-GIT-F-"
CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
CREDENTIAL_ID_RANDOM_CHARS = 8

CREDENTIAL_NAME = "Git Foundations Certificate"
ACHIEVEMENT_NAME = "Git Foundations - VersionControl.gr"
ACHIEVEMENT_DESCRIPTION = (
    "Awarded for having completed all 78 hands-on challenges of the "
    "VersionControl.gr Git course - from the command line and `git init` to "
    "reflog recovery - solved against a real Git engine running in the browser."
)
CRITERIA_NARRATIVE = (
    "The recipient completed every challenge across all 11 course sections of "
    "VersionControl.gr (78/78): command-line basics, repository basics, "
    "staging & commits, branching, merging, conflict resolution, remote "
    "collaboration, undoing mistakes, stashing, applied workflows, and "
    "disaster recovery."
)

# Per OB 3.0 / VC-JOSE the JWS typ should be "vc+jwt"; some validators still
# expect plain "JWT" - kept as a module constant so it can be flipped after a
# 1EdTech validator run (see README).
CREDENTIAL_JWT_TYP = "vc+jwt"


def build_urls(cred_id: str, settings: Optional[Settings] = None) -> dict:
    s = settings or get_settings()
    credential_url = f"{s.api_base}/v1/credentials/{cred_id}"
    return {
        "verify": f"{s.site_base}/verify/{cred_id}/",
        "credential": credential_url,
        "jwt": credential_url + "?format=jwt",
        "badge": credential_url + "/badge.png",
        "card": credential_url + "/card.png",
    }


def certificate_out_from_item(item: dict) -> CertificateOut:
    """Build the API response model from a stored CERT item."""
    cred_id = item["PK"].split("#", 1)[1]
    return CertificateOut(
        credentialId=cred_id,
        recipientName=item["recipientName"],
        issuedOn=item["issuedOn"],
        skills=list(item["skills"]),
        urls=build_urls(cred_id),
    )


def generate_credential_id() -> str:
    suffix = "".join(
        secrets.choice(CROCKFORD_ALPHABET) for _ in range(CREDENTIAL_ID_RANDOM_CHARS)
    )
    return CREDENTIAL_ID_PREFIX + suffix


def generate_salt() -> str:
    return secrets.token_hex(16)  # 16 random bytes as 32 hex chars


def hash_email_identity(email: str, salt: str) -> dict:
    digest = hashlib.sha256((email.lower() + salt).encode("utf-8")).hexdigest()
    return {
        "type": "IdentityObject",
        "hashed": True,
        "identityType": "emailAddress",
        "identityHash": "sha256$" + digest,
        "salt": salt,
    }


def build_credential(
    cred_id: str,
    email: str,
    salt: str,
    issued_on: str,
    settings: Optional[Settings] = None,
) -> dict:
    s = settings or get_settings()
    return {
        "@context": [
            "https://www.w3.org/ns/credentials/v2",
            "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
        ],
        "id": f"{s.api_base}/v1/credentials/{cred_id}",
        "type": ["VerifiableCredential", "OpenBadgeCredential"],
        "name": CREDENTIAL_NAME,
        "validFrom": issued_on,
        "issuer": {
            "id": "did:web:versioncontrol.gr",
            "type": ["Profile"],
            "name": "VersionControl.gr",
            "url": s.site_base,
            "description": "Interactive, browser-based Git course.",
        },
        "credentialSubject": {
            "type": ["AchievementSubject"],
            "identifier": [hash_email_identity(email, salt)],
            "achievement": {
                "id": f"{s.site_base}/achievements/git-foundations",
                "type": ["Achievement"],
                "name": ACHIEVEMENT_NAME,
                "description": ACHIEVEMENT_DESCRIPTION,
                "criteria": {"narrative": CRITERIA_NARRATIVE},
                "image": {
                    "id": f"{s.site_base}/badge-git-foundations.png",
                    "type": "Image",
                },
                "tags": ["Git", "Version Control"] + SKILLS,
            },
        },
    }


def load_private_key(settings: Optional[Settings] = None) -> Ed25519PrivateKey:
    s = settings or get_settings()
    seed = base64.b64decode(s.issuer_private_key_b64)
    if len(seed) != 32:
        raise ValueError("ISSUER_PRIVATE_KEY_B64 must decode to a 32-byte Ed25519 seed")
    return Ed25519PrivateKey.from_private_bytes(seed)


def sign_credential(credential: dict, settings: Optional[Settings] = None) -> str:
    """Sign the credential as a VC-JWT (EdDSA compact JWS)."""
    s = settings or get_settings()
    valid_from = datetime.fromisoformat(
        credential["validFrom"].replace("Z", "+00:00")
    ).astimezone(timezone.utc)
    epoch = int(valid_from.timestamp())

    payload = dict(credential)
    payload["iss"] = credential["issuer"]["id"]
    payload["jti"] = credential["id"]
    payload["nbf"] = epoch
    payload["iat"] = epoch

    return jwt.encode(
        payload,
        load_private_key(s),
        algorithm="EdDSA",
        headers={"kid": s.issuer_kid, "typ": CREDENTIAL_JWT_TYP},
    )
