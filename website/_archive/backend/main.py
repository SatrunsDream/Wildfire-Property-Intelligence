import os
import time
from pathlib import Path
from contextlib import asynccontextmanager
from collections import defaultdict, deque
from threading import Lock

import httpx
from fastapi import FastAPI, HTTPException
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.responses import JSONResponse

import data
from constants import CA_COUNTIES_GEOJSON_URL
from routes import router


def get_allowed_origins() -> list[str]:
    raw = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:5174")
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


RATE_LIMIT_MAX_REQUESTS = int(os.getenv("RATE_LIMIT_MAX_REQUESTS", "50"))
RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "600"))
RATE_LIMIT_PATH_PREFIXES = (
    "/conditional-pooling",
    "/map",
    "/conditioning-options",
    "/compare",
    "/c2st",
    "/bayesian",
    "/morans-i",
    "/group-divergence",
)
_rate_limit_store: dict[str, deque[float]] = defaultdict(deque)
_rate_limit_lock = Lock()


def _client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _is_rate_limited_path(path: str) -> bool:
    return any(path == prefix or path.startswith(f"{prefix}/") for prefix in RATE_LIMIT_PATH_PREFIXES)


def load_county_geojson():
    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.get(CA_COUNTIES_GEOJSON_URL)
            resp.raise_for_status()
            return resp.json()
    except Exception:
        return None


@asynccontextmanager
async def lifespan(app: FastAPI):
    data.ca_counties_geojson = load_county_geojson()
    if data.ca_counties_geojson:
        for feature in data.ca_counties_geojson["features"]:
            feature["properties"]["county_name"] = feature["properties"].get("name", "")
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    if request.method == "OPTIONS" or not _is_rate_limited_path(request.url.path):
        return await call_next(request)

    now = time.time()
    window_start = now - RATE_LIMIT_WINDOW_SECONDS
    ip = _client_ip(request)

    with _rate_limit_lock:
        hits = _rate_limit_store[ip]
        while hits and hits[0] < window_start:
            hits.popleft()

        if len(hits) >= RATE_LIMIT_MAX_REQUESTS:
            retry_after = int(max(1, hits[0] + RATE_LIMIT_WINDOW_SECONDS - now))
            return JSONResponse(
                status_code=429,
                content={
                    "detail": f"Rate limit exceeded: max {RATE_LIMIT_MAX_REQUESTS} requests per {RATE_LIMIT_WINDOW_SECONDS} seconds."
                },
                headers={"Retry-After": str(retry_after)},
            )

        hits.append(now)

    return await call_next(request)


@app.get("/healthz")
def healthz():
    return {"ok": True}


STATIC_DIR = Path(__file__).parent / "static"
SPA_INDEX = STATIC_DIR / "index.html"
API_PREFIXES = (
    "conditional-pooling",
    "map",
    "conditioning-options",
    "compare",
    "c2st",
    "bayesian",
    "morans-i",
    "group-divergence",
    "docs",
    "redoc",
    "openapi.json",
    "healthz",
)


if SPA_INDEX.exists():
    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        if full_path:
            candidate = STATIC_DIR / full_path
            if candidate.is_file():
                return FileResponse(candidate)
            if any(full_path == prefix or full_path.startswith(f"{prefix}/") for prefix in API_PREFIXES):
                raise HTTPException(status_code=404, detail="Not Found")

        return FileResponse(SPA_INDEX)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
