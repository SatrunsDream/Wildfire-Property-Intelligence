from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import httpx

import data
from constants import CA_COUNTIES_GEOJSON_URL
from routes import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with httpx.AsyncClient() as client:
        resp = await client.get(CA_COUNTIES_GEOJSON_URL)
        data.ca_counties_geojson = resp.json()
    for feature in data.ca_counties_geojson["features"]:
        name = feature["properties"].get("name", "")
        feature["properties"]["county_name"] = name
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
