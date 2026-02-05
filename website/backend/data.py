import os
import polars as pl
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"

DATA_PATH = os.environ.get("DATA_PATH", str(DATA_DIR / "Capstone2025_nsi_lvl9_with_landcover_and_color.csv"))
NEIGHBORS_PATH = os.environ.get("NEIGHBORS_PATH", str(DATA_DIR / "ca_county_neighbors.csv"))
C2ST_PATH = os.environ.get("C2ST_PATH", str(DATA_DIR / "c2st_results_all_lc.csv"))
BAYESIAN_BASELINE_PATH = os.environ.get("BAYESIAN_BASELINE_PATH", str(DATA_DIR / "bayesian_shrinkage_baseline_distributions.csv"))
BAYESIAN_STABILIZED_PATH = os.environ.get("BAYESIAN_STABILIZED_PATH", str(DATA_DIR / "bayesian_shrinkage_stabilized_distributions.csv"))
BAYESIAN_COUNTS_PATH = os.environ.get("BAYESIAN_COUNTS_PATH", str(DATA_DIR / "bayesian_shrinkage_aggregated_counts.csv"))
MORANS_I_PATH = os.environ.get("MORANS_I_PATH", str(DATA_DIR / "morans_i_homogeneity.csv"))

df = pl.read_csv(DATA_PATH)
neighbors_df = pl.read_csv(NEIGHBORS_PATH)
c2st_df = pl.read_csv(C2ST_PATH)
bayesian_baseline_df = pl.read_csv(BAYESIAN_BASELINE_PATH)
bayesian_stabilized_df = pl.read_csv(BAYESIAN_STABILIZED_PATH)
bayesian_counts_df = pl.read_csv(BAYESIAN_COUNTS_PATH)

try:
    morans_i_df = pl.read_csv(MORANS_I_PATH, infer_schema_length=1).select(["fips", "local"])
    
    if morans_i_df is not None and len(morans_i_df) > 0:
        if morans_i_df["fips"].dtype != pl.Int64:
            morans_i_df = morans_i_df.with_columns(pl.col("fips").cast(pl.Int64))
        if morans_i_df["local"].dtype != pl.Float64:
            morans_i_df = morans_i_df.with_columns(pl.col("local").cast(pl.Float64))
except Exception as e:
    print(f"Warning: Could not load Moran's I data: {e}")
    morans_i_df = None

ca_counties_geojson: dict | None = None
