from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import httpx

import data
from constants import CA_COUNTIES_GEOJSON_URL
from routes import router


def load_county_geojson():
    import httpx
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
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
