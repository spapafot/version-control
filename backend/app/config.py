"""Application settings, read lazily from environment variables.

Settings are cached with ``lru_cache`` so production reads the environment
once, while tests can call ``get_settings.cache_clear()`` after monkeypatching
the environment to pick up new values.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


@dataclass(frozen=True)
class Settings:
    table_name: str
    quiz_table_name: str
    aws_region: str
    cognito_user_pool_id: str
    cognito_client_id: str
    proxy_secret: str
    issuer_private_key_b64: str
    issuer_kid: str
    api_base: str
    site_base: str


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        table_name=os.environ.get("TABLE_NAME", ""),
        quiz_table_name=os.environ.get("QUIZ_TABLE_NAME", ""),
        aws_region=os.environ.get("AWS_REGION", "eu-central-1"),
        cognito_user_pool_id=os.environ.get("COGNITO_USER_POOL_ID", ""),
        cognito_client_id=os.environ.get("COGNITO_CLIENT_ID", ""),
        proxy_secret=os.environ.get("PROXY_SECRET", ""),
        issuer_private_key_b64=os.environ.get("ISSUER_PRIVATE_KEY_B64", ""),
        issuer_kid=os.environ.get("ISSUER_KID", "did:web:versioncontrol.gr#key-0"),
        api_base=os.environ.get("API_BASE", "https://api.versioncontrol.gr").rstrip("/"),
        site_base=os.environ.get("SITE_BASE", "https://versioncontrol.gr").rstrip("/"),
    )
