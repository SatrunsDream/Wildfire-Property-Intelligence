"""
Export all static JSON files needed to eliminate the backend.

Run from the backend/ directory:
    python export_all.py

Outputs to: ../frontend/public/data/
"""

import json
from pathlib import Path

import httpx
import numpy as np
import polars as pl
from scipy.spatial.distance import jensenshannon

from constants import (
    COUNTY_NAME_TO_FIPS, FIPS_TO_COUNTY_NAME, COUNTY_CENTROIDS,
    CA_COUNTIES_GEOJSON_URL,
)

DATA_DIR = Path(__file__).parent / "data"
OUT_DIR = Path(__file__).parent.parent / "frontend" / "public" / "data"
OUT_DIR.mkdir(parents=True, exist_ok=True)

LAPLACE = 1


def write(name: str, obj: object) -> None:
    path = OUT_DIR / name
    with open(path, "w") as f:
        json.dump(obj, f)
    size_kb = path.stat().st_size / 1000
    print(f"  wrote {name} ({size_kb:.1f} KB)")


def load_geojson() -> dict:
    print("Fetching CA county GeoJSON...")
    with httpx.Client(timeout=30.0) as client:
        resp = client.get(CA_COUNTIES_GEOJSON_URL)
        resp.raise_for_status()
        return resp.json()


def get_feature_distribution(df_a: pl.DataFrame, df_b: pl.DataFrame, col: str):
    total_a = len(df_a)
    total_b = len(df_b)

    counts_a = {r[col]: r["count"] for r in df_a.group_by(col).len().rename({"len": "count"}).iter_rows(named=True)}
    counts_b = {r[col]: r["count"] for r in df_b.group_by(col).len().rename({"len": "count"}).iter_rows(named=True)}

    all_values = sorted(set(counts_a) | set(counts_b))
    unique_a = set(counts_a) - set(counts_b)
    unique_b = set(counts_b) - set(counts_a)

    dist_a = [{"value": v, "count": counts_a.get(v, 0), "proportion": counts_a.get(v, 0) / total_a if total_a else 0, "unique": v in unique_a} for v in all_values]
    dist_b = [{"value": v, "count": counts_b.get(v, 0), "proportion": counts_b.get(v, 0) / total_b if total_b else 0, "unique": v in unique_b} for v in all_values]

    totals = {v: counts_a.get(v, 0) + counts_b.get(v, 0) for v in all_values}
    dist_a.sort(key=lambda x: totals[x["value"]], reverse=True)
    dist_b.sort(key=lambda x: totals[x["value"]], reverse=True)

    return dist_a, dist_b, len(set(counts_a)), len(set(counts_b))


def compute_jsd(dist_a: list, dist_b: list) -> float:
    all_values = sorted({d["value"] for d in dist_a} | {d["value"] for d in dist_b})
    ca = {d["value"]: d["count"] for d in dist_a}
    cb = {d["value"]: d["count"] for d in dist_b}
    va = np.array([ca.get(v, 0) + LAPLACE for v in all_values], dtype=float)
    vb = np.array([cb.get(v, 0) + LAPLACE for v in all_values], dtype=float)
    va /= va.sum()
    vb /= vb.sum()
    return float(jensenshannon(va, vb))


# ── 1. morans-freq.json ───────────────────────────────────────────────────────
def export_morans_freq():
    print("\n[1/10] morans-freq.json")
    df = pl.read_csv(DATA_DIR / "relative_frequencies_lc_type_bldgtype.csv")
    write("morans-freq.json", df.to_dicts())


# ── 2. ca-county-neighbors.json ──────────────────────────────────────────────
def export_neighbors():
    print("[2/10] ca-county-neighbors.json")
    df = pl.read_csv(DATA_DIR / "ca_county_neighbors.csv")
    write("ca-county-neighbors.json", df.to_dicts())


# ── 3. conditional-pooling-summary.json ──────────────────────────────────────
def export_conditional_pooling_summary():
    print("[3/10] conditional-pooling-summary.json")
    df = pl.read_csv(DATA_DIR / "m01_neighbor_pool_county_lc_summary.csv")
    write("conditional-pooling-summary.json", df.to_dicts())


# ── 4. conditional-pooling-detail.json ───────────────────────────────────────
def export_conditional_pooling_detail():
    print("[4/10] conditional-pooling-detail.json")
    df = pl.read_csv(DATA_DIR / "m01_neighbor_pool_county_lc_color_detail.csv")
    write("conditional-pooling-detail.json", df.to_dicts())


# ── 5. bayesian-baseline.json ────────────────────────────────────────────────
def export_bayesian_baseline():
    print("[5/10] bayesian-baseline.json")
    df = pl.read_csv(DATA_DIR / "bayesian_shrinkage_baseline_distributions.csv")
    write("bayesian-baseline.json", df.to_dicts())


# ── 6. bayesian-stabilized.json ──────────────────────────────────────────────
def export_bayesian_stabilized():
    print("[6/10] bayesian-stabilized.json")
    df = pl.read_csv(DATA_DIR / "bayesian_shrinkage_stabilized_distributions.csv")
    write("bayesian-stabilized.json", df.to_dicts())


# ── 7. c2st-results.json ─────────────────────────────────────────────────────
def export_c2st(geojson: dict):
    print("[7/10] c2st-results.json")
    df = pl.read_csv(DATA_DIR / "c2st_results_all_lc.csv")

    rows = []
    for r in df.iter_rows(named=True):
        fips_a = str(r["fips_a"]).zfill(5)
        fips_b = str(r["fips_b"]).zfill(5)
        coord_a = COUNTY_CENTROIDS.get(fips_a)
        coord_b = COUNTY_CENTROIDS.get(fips_b)
        rows.append({
            **r,
            "fips_a": fips_a,
            "fips_b": fips_b,
            "county_a": FIPS_TO_COUNTY_NAME.get(fips_a, fips_a),
            "county_b": FIPS_TO_COUNTY_NAME.get(fips_b, fips_b),
            "coord_a": coord_a,
            "coord_b": coord_b,
        })

    lc_types = sorted(df["lc_type"].unique().to_list())
    write("c2st-results.json", {"rows": rows, "lc_types": lc_types})


# ── 8. group-divergence.json ─────────────────────────────────────────────────
def export_group_divergence(geojson: dict):
    print("[8/10] group-divergence.json")
    summary_df = pl.read_csv(DATA_DIR / "jsd_conditional_county_summary.csv")
    detail_df = pl.read_csv(DATA_DIR / "jsd_conditional_divergence.csv")

    summary_dict = {
        str(r["fips"]).zfill(5): {"num_anomalies": r["num_anomalies"], "avg_divergence": r["avg_divergence"]}
        for r in summary_df.iter_rows(named=True)
    }

    # per-county divergence detail indexed by fips
    detail_by_fips: dict[str, list] = {}
    for r in detail_df.iter_rows(named=True):
        fips_str = str(r["fips"]).zfill(5)
        detail_by_fips.setdefault(fips_str, []).append({
            "lc_type": r["lc_type"],
            "divergence": r["divergence"],
            "anomalous": bool(r["anomalous"]),
        })

    # build GeoJSON features
    features = []
    for feature in geojson["features"]:
        props = dict(feature["properties"])
        name = props.get("name", "")
        fips_str = COUNTY_NAME_TO_FIPS.get(name)
        if fips_str and fips_str in summary_dict:
            props["fips"] = fips_str
            props["county_name"] = FIPS_TO_COUNTY_NAME.get(fips_str, name)
            props["num_anomalies"] = summary_dict[fips_str]["num_anomalies"]
            props["avg_divergence"] = summary_dict[fips_str]["avg_divergence"]
            features.append({"type": "Feature", "properties": props, "geometry": feature["geometry"]})

    stats = {
        "total_counties": len(features),
        "mean_anomalies": float(summary_df["num_anomalies"].mean()),
        "max_anomalies": float(summary_df["num_anomalies"].max()),
        "mean_divergence": float(summary_df["avg_divergence"].mean()),
        "max_divergence": float(summary_df["avg_divergence"].max()),
    }

    write("group-divergence.json", {
        "map": {"type": "FeatureCollection", "features": features, "stats": stats},
        "by_county": detail_by_fips,
    })


# ── 9. county-colors.json ────────────────────────────────────────────────────
def export_county_colors(main_df: pl.DataFrame):
    print("[9/10] county-colors.json")
    result: dict[str, object] = {}

    all_fips = main_df["fips"].unique().to_list()
    state_lc_color_counts = (
        main_df.group_by(["lc_type", "clr"]).len().rename({"len": "n"})
    )
    state_lc_totals = state_lc_color_counts.group_by("lc_type").agg(pl.col("n").sum().alias("total"))
    state_lc_total_dict = {r["lc_type"]: r["total"] for r in state_lc_totals.iter_rows(named=True)}
    state_freqs: dict[tuple, float] = {}
    for r in state_lc_color_counts.iter_rows(named=True):
        total = state_lc_total_dict.get(r["lc_type"], 1)
        state_freqs[(r["lc_type"], r["clr"])] = r["n"] / total

    for fips_int in all_fips:
        fips_str = str(fips_int).zfill(5)
        county_df = main_df.filter(pl.col("fips") == fips_int)
        lc_types = county_df["lc_type"].unique().to_list()
        by_landcover = []

        for lc in lc_types:
            lc_county = county_df.filter(pl.col("lc_type") == lc)
            county_counts = lc_county.group_by("clr").len().rename({"len": "n"})
            county_total = county_counts["n"].sum()
            county_freqs = {r["clr"]: r["n"] / county_total for r in county_counts.iter_rows(named=True)}

            all_colors = sorted(set(county_freqs) | {k[1] for k in state_freqs if k[0] == lc})
            by_landcover.append({
                "lc_type": lc,
                "county_total": int(county_total),
                "colors": [
                    {
                        "color": c,
                        "county_freq": round(county_freqs.get(c, 0), 4),
                        "baseline_freq": round(state_freqs.get((lc, c), 0), 4),
                    }
                    for c in all_colors
                ],
            })

        result[fips_str] = {"fips": fips_str, "by_landcover": by_landcover}

    write("county-colors.json", result)


# ── 10. county-pair-comparisons.json ─────────────────────────────────────────
def export_county_pair_comparisons(main_df: pl.DataFrame):
    print("[10/10] county-pair-comparisons.json")
    neighbors_df = pl.read_csv(DATA_DIR / "ca_county_neighbors.csv")
    neighbors = neighbors_df.rename({"county_fips": "fips_a", "neighbor_fips": "fips_b"})
    neighbors = neighbors.filter(pl.col("fips_a") < pl.col("fips_b"))
    pairs = [(r["fips_a"], r["fips_b"]) for r in neighbors.iter_rows(named=True)]

    result: dict[str, object] = {}

    for fips_a_int, fips_b_int in pairs:
        fips_a = str(fips_a_int).zfill(5)
        fips_b = str(fips_b_int).zfill(5)
        key = f"{fips_a}-{fips_b}"

        df_a = main_df.filter(pl.col("fips") == fips_a_int)
        df_b = main_df.filter(pl.col("fips") == fips_b_int)

        if len(df_a) == 0 or len(df_b) == 0:
            continue

        clr_a, clr_b, va, vb = get_feature_distribution(df_a, df_b, "clr")
        bldg_a, bldg_b, _, _ = get_feature_distribution(df_a, df_b, "bldgtype")
        occ_a, occ_b, _, _ = get_feature_distribution(df_a, df_b, "st_damcat")
        jsd = compute_jsd(clr_a, clr_b)

        result[key] = {
            "county_a": {
                "fips": fips_a,
                "name": FIPS_TO_COUNTY_NAME.get(fips_a, fips_a),
                "total_count": len(df_a),
                "clr": {"distribution": clr_a, "vocab_size": va},
                "bldgtype": {"distribution": bldg_a, "vocab_size": len({d["value"] for d in bldg_a if d["count"] > 0})},
                "st_damcat": {"distribution": occ_a, "vocab_size": len({d["value"] for d in occ_a if d["count"] > 0})},
            },
            "county_b": {
                "fips": fips_b,
                "name": FIPS_TO_COUNTY_NAME.get(fips_b, fips_b),
                "total_count": len(df_b),
                "clr": {"distribution": clr_b, "vocab_size": vb},
                "bldgtype": {"distribution": bldg_b, "vocab_size": len({d["value"] for d in bldg_b if d["count"] > 0})},
                "st_damcat": {"distribution": occ_b, "vocab_size": len({d["value"] for d in occ_b if d["count"] > 0})},
            },
            "jsd": {"original": jsd},
        }

    write("county-pair-comparisons.json", result)


# ─────────────────────────────────────────────────────────────────────────────

def main():
    print("=== Exporting all static JSON files ===\n")

    export_morans_freq()
    export_neighbors()
    export_conditional_pooling_summary()
    export_conditional_pooling_detail()
    export_bayesian_baseline()
    export_bayesian_stabilized()

    geojson = load_geojson()
    export_c2st(geojson)
    export_group_divergence(geojson)

    print("\nLoading main dataset (200MB, may take a moment)...")
    main_df = pl.read_csv(DATA_DIR / "Capstone2025_nsi_lvl9_with_landcover_and_color.csv")
    print(f"  loaded {len(main_df):,} rows")

    export_county_colors(main_df)
    export_county_pair_comparisons(main_df)

    print("\n=== Done ===")
    total = sum((OUT_DIR / f).stat().st_size for f in OUT_DIR.iterdir()) / 1_000_000
    print(f"Total size of all exports: {total:.1f} MB")


if __name__ == "__main__":
    main()
