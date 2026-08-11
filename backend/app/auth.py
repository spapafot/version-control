"""Cognito ID-token authentication.

``require_user`` is a FastAPI dependency: it validates the ``Authorization:
Bearer <jwt>`` header against the Cognito user pool's JWKS and returns an
``AuthedUser``. Every failure mode maps to 401.

The JWKS client is a lazily-initialised module-level singleton so that Lambda
reuses the key cache across invocations. Tests inject a fake via
``reset_jwks_client(fake)`` (or by monkeypatching ``_jwks_client``).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Optional

import jwt
from fastapi import Header, HTTPException
from jwt import PyJWKClient

from .config import get_settings

_jwks_client: Optional[object] = None


def get_jwks_client():
    global _jwks_client
    if _jwks_client is None:
        settings = get_settings()
        url = (
            f"https://cognito-idp.{settings.aws_region}.amazonaws.com/"
            f"{settings.cognito_user_pool_id}/.well-known/jwks.json"
        )
        _jwks_client = PyJWKClient(url, cache_keys=True)
    return _jwks_client


def reset_jwks_client(client=None) -> None:
    """Replace (or clear) the JWKS client — used by tests and key rotation."""
    global _jwks_client
    _jwks_client = client


@dataclass(frozen=True)
class AuthedUser:
    sub: str
    email: str


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=401,
        detail={"code": "unauthorized"},
        headers={"WWW-Authenticate": "Bearer"},
    )


def require_user(
    authorization: Annotated[Optional[str], Header()] = None,
) -> AuthedUser:
    if not authorization:
        raise _unauthorized()
    scheme, _, token = authorization.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        raise _unauthorized()

    settings = get_settings()
    issuer = (
        f"https://cognito-idp.{settings.aws_region}.amazonaws.com/"
        f"{settings.cognito_user_pool_id}"
    )
    try:
        signing_key = get_jwks_client().get_signing_key_from_jwt(token).key
        claims = jwt.decode(
            token,
            signing_key,
            algorithms=["RS256"],
            audience=settings.cognito_client_id,
            issuer=issuer,
            options={"require": ["exp", "sub", "aud", "iss"]},
        )
    except Exception:
        raise _unauthorized() from None

    if claims.get("token_use") != "id":
        raise _unauthorized()
    email_verified = claims.get("email_verified")
    if email_verified not in (True, "true", "True", 1, "1"):
        raise _unauthorized()
    email = claims.get("email")
    if not email:
        raise _unauthorized()

    return AuthedUser(sub=claims["sub"], email=email)
