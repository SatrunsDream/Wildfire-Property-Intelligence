import os
import polars as pl
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"

DATA_PATH = os.environ.get("DATA_PATH", str(DATA_DIR / "Capstone2025_nsi_lvl9_with_landcover_and_color.csv"))
NEIGHBORS_PATH = os.environ.get("NEIGHBORS_PATH", str(DATA_DIR / "ca_county_neighbors.csv"))
C2ST_PATH = os.environ.get("C2ST_PATH", str(DATA_DIR / "c2st_results_all_lc.csv"))

df = pl.read_csv(DATA_PATH)
neighbors_df = pl.read_csv(NEIGHBORS_PATH)
c2st_df = pl.read_csv(C2ST_PATH)

ca_counties_geojson: dict | None = None
