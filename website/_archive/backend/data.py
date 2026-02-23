import os
import polars as pl
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
MAIN_DATASET_FILENAME = "Capstone2025_nsi_lvl9_with_landcover_and_color.csv"

DATA_PATH = os.environ.get("DATA_PATH", str(DATA_DIR / MAIN_DATASET_FILENAME))
NEIGHBORS_PATH = os.environ.get("NEIGHBORS_PATH", str(DATA_DIR / "ca_county_neighbors.csv"))
C2ST_PATH = os.environ.get("C2ST_PATH", str(DATA_DIR / "c2st_results_all_lc.csv"))
BAYESIAN_BASELINE_PATH = os.environ.get("BAYESIAN_BASELINE_PATH", str(DATA_DIR / "bayesian_shrinkage_baseline_distributions.csv"))
BAYESIAN_STABILIZED_PATH = os.environ.get("BAYESIAN_STABILIZED_PATH", str(DATA_DIR / "bayesian_shrinkage_stabilized_distributions.csv"))
BAYESIAN_COUNTS_PATH = os.environ.get("BAYESIAN_COUNTS_PATH", str(DATA_DIR / "bayesian_shrinkage_aggregated_counts.csv"))
MORANS_I_FREQ_PATH = os.environ.get("MORANS_I_FREQ_PATH", str(DATA_DIR / "relative_frequencies_lc_type_bldgtype.csv"))
M01_SUMMARY_PATH = os.environ.get("M01_SUMMARY_PATH", str(DATA_DIR / "m01_neighbor_pool_county_lc_summary.csv"))
M01_DETAIL_PATH = os.environ.get("M01_DETAIL_PATH", str(DATA_DIR / "m01_neighbor_pool_county_lc_color_detail.csv"))
GROUP_DIVERGENCE_PATH = os.environ.get("GROUP_DIVERGENCE_PATH", str(DATA_DIR / "jsd_conditional_divergence.csv"))
GROUP_COUNTY_SUMMARY_PATH = os.environ.get("GROUP_COUNTY_SUMMARY_PATH", str(DATA_DIR / "jsd_conditional_county_summary.csv"))
COLOR_SIMILARITY_PATH = os.environ.get("COLOR_SIMILARITY_PATH", str(DATA_DIR / "color_similarity_matrix.csv"))
COLOR_PAIRS_PATH = os.environ.get("COLOR_PAIRS_PATH", str(DATA_DIR / "color_pairs_analysis.csv"))


def resolve_dataset_path(raw_path: str, required: bool = True) -> str | None:
    target = Path(raw_path)
    fallback = DATA_DIR / target.name

    if target.exists():
        return str(target)

    if fallback.exists():
        return str(fallback)

    if not required:
        return None

    raise FileNotFoundError(
        f"Dataset not found at '{target}'. "
        f"Set the corresponding *_PATH env var to a valid file "
        f"or provide bundled file '{fallback}'."
    )


df = pl.read_csv(resolve_dataset_path(DATA_PATH))
neighbors_df = pl.read_csv(resolve_dataset_path(NEIGHBORS_PATH))
c2st_df = pl.read_csv(resolve_dataset_path(C2ST_PATH))
bayesian_baseline_df = pl.read_csv(resolve_dataset_path(BAYESIAN_BASELINE_PATH))
bayesian_stabilized_df = pl.read_csv(resolve_dataset_path(BAYESIAN_STABILIZED_PATH))
bayesian_counts_df = pl.read_csv(resolve_dataset_path(BAYESIAN_COUNTS_PATH))

try:
    morans_i_freq_path = resolve_dataset_path(MORANS_I_FREQ_PATH, required=False)
    morans_i_freq_df = pl.read_csv(morans_i_freq_path) if morans_i_freq_path else None
    if morans_i_freq_df is None:
        raise FileNotFoundError("Moran's I frequency CSV not found")
    if morans_i_freq_df["fips"].dtype != pl.Int64:
        morans_i_freq_df = morans_i_freq_df.with_columns(pl.col("fips").cast(pl.Int64))
    if morans_i_freq_df["freq"].dtype != pl.Float64:
        morans_i_freq_df = morans_i_freq_df.with_columns(pl.col("freq").cast(pl.Float64))
except Exception:
    morans_i_freq_df = None

try:
    m01_summary_path = resolve_dataset_path(M01_SUMMARY_PATH, required=False)
    m01_summary_df = pl.read_csv(m01_summary_path) if m01_summary_path else None
    if m01_summary_df is None:
        raise FileNotFoundError("M01 summary CSV not found")
    if m01_summary_df["fips"].dtype != pl.Int64:
        m01_summary_df = m01_summary_df.with_columns(pl.col("fips").cast(pl.Int64))
except Exception:
    m01_summary_df = None

try:
    m01_detail_path = resolve_dataset_path(M01_DETAIL_PATH, required=False)
    m01_detail_df = pl.read_csv(m01_detail_path) if m01_detail_path else None
    if m01_detail_df is None:
        raise FileNotFoundError("M01 detail CSV not found")
    if m01_detail_df["fips"].dtype != pl.Int64:
        m01_detail_df = m01_detail_df.with_columns(pl.col("fips").cast(pl.Int64))
except Exception:
    m01_detail_df = None

# Group-Level Divergence data
try:
    group_divergence_path = resolve_dataset_path(GROUP_DIVERGENCE_PATH, required=False)
    group_divergence_df = pl.read_csv(group_divergence_path) if group_divergence_path else None
    if group_divergence_df is None:
        raise FileNotFoundError("Group divergence CSV not found")
    if group_divergence_df["fips"].dtype != pl.Int64:
        group_divergence_df = group_divergence_df.with_columns(pl.col("fips").cast(pl.Int64))
except Exception as e:
    print(f"Warning: Could not load group divergence data: {e}")
    group_divergence_df = None

try:
    group_county_summary_path = resolve_dataset_path(GROUP_COUNTY_SUMMARY_PATH, required=False)
    group_county_summary_df = pl.read_csv(group_county_summary_path) if group_county_summary_path else None
    if group_county_summary_df is None:
        raise FileNotFoundError("Group county summary CSV not found")
    if group_county_summary_df["fips"].dtype != pl.Int64:
        group_county_summary_df = group_county_summary_df.with_columns(pl.col("fips").cast(pl.Int64))
except Exception as e:
    print(f"Warning: Could not load group county summary data: {e}")
    group_county_summary_df = None

try:
    color_similarity_path = resolve_dataset_path(COLOR_SIMILARITY_PATH, required=False)
    color_similarity_df = pl.read_csv(color_similarity_path) if color_similarity_path else None
    if color_similarity_df is None:
        raise FileNotFoundError("Color similarity CSV not found")
except Exception as e:
    print(f"Warning: Could not load color similarity data: {e}")
    color_similarity_df = None

try:
    color_pairs_path = resolve_dataset_path(COLOR_PAIRS_PATH, required=False)
    color_pairs_df = pl.read_csv(color_pairs_path) if color_pairs_path else None
    if color_pairs_df is None:
        raise FileNotFoundError("Color pairs CSV not found")
except Exception as e:
    print(f"Warning: Could not load color pairs data: {e}")
    color_pairs_df = None

ca_counties_geojson: dict | None = None
