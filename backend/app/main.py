"""FastAPI application factory + Lambda handler."""

from __future__ import annotations

from fastapi import FastAPI
from mangum import Mangum
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.requests import Request
from starlette.responses import JSONResponse

from .middleware import ProxySecretMiddleware
from .routes import me, public


def create_app() -> FastAPI:
    app = FastAPI(
        title="VersionControl.gr Certification API",
        version="1.0.0",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.add_middleware(ProxySecretMiddleware)
    app.include_router(me.router)
    app.include_router(public.router)

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(
        request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        # dict details (our error contract, e.g. {"code": "incomplete", ...})
        # become the response body verbatim; everything else is wrapped.
        body = exc.detail if isinstance(exc.detail, dict) else {"detail": exc.detail}
        return JSONResponse(
            body, status_code=exc.status_code, headers=getattr(exc, "headers", None)
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        return JSONResponse({"code": "internal_error"}, status_code=500)

    return app


app = create_app()
handler = Mangum(app, lifespan="off")
