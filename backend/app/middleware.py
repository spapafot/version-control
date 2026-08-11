"""Proxy-secret gate.

The Lambda Function URL sits behind a Cloudflare Worker proxy. The Worker adds
an ``X-Proxy-Secret`` header; every request that reaches us must carry a value
matching ``PROXY_SECRET``, compared in constant time. Anything else is
rejected with 403 before routing. The variable is managed by hand in the
Lambda console; rotating it means updating it there and in the Worker's
dashboard variable (expect a brief 403 window between the two edits).
"""

from __future__ import annotations

import hmac

from starlette.responses import JSONResponse

from .config import get_settings

HEADER_NAME = b"x-proxy-secret"


def _matches(provided: str, expected: str) -> bool:
    if not expected:
        return False
    return hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8"))


class ProxySecretMiddleware:
    """Pure ASGI middleware — applies to every HTTP request, including 404s."""

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        provided = ""
        for name, value in scope.get("headers") or []:
            if name == HEADER_NAME:
                provided = value.decode("latin-1")
                break

        settings = get_settings()
        if not _matches(provided, settings.proxy_secret):
            response = JSONResponse({"code": "forbidden"}, status_code=403)
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)
