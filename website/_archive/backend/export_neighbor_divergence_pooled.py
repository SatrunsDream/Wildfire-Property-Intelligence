"""
Export static JSON for /map/neighbor-divergence-merged with preset color groups.

Run from the backend/ directory:
    python export_neighbor_divergence_pooled.py

Output: ../frontend/public/data/neighbor-divergence-map-pooled.json
"""

import json
from pathlib import Path

import httpx
import numpy as np
import polars as pl
from scipy.spatial.distance import jensenshannon

from constants import COUNTY_NAME_TO_FIPS, FIPS_TO_COUNTY_NAME, COUNTY_CENTROIDS, CA_COUNTIES_GEOJSON_URL

DATA_DIR = Path(__file__).parent / "data"
OUT_PATH = Path(__file__).parent.parent / "frontend" / "public" / "data" / "neighbor-divergence-map-pooled.json"

LAPLACE_PSEUDOCOUNT = 1
MIN_SUPPORT = 30

COLOR_GROUPS = [
    {"name": "browns", "colors": ["brown", "sienna", "cocoa", "coffee", "tan", "terracotta", "auburn"]},
    {"name": "reds", "colors": ["red", "scarlet", "crimson", "maroon"]},
    {"name": "greens", "colors": ["green", "sage", "verde", "emerald", "olive"]},
    {"name": "blues_purples", "colors": ["blue", "indigo", "navy", "purple", "lavender", "lilac"]},
    {"name": "grays", "colors": ["gray", "grey"]},
]


def apply_color_mapping(color_counts: dict) -> dict:
    color_to_group = {}
    for group in COLOR_GROUPS:
        for color in group["colors"]:
            color_to_group[color] = group["name"]
    merged = {}
    for color, count in color_counts.items():
        key = color_to_group.get(color, color)
        merged[key] = merged.get(key, 0) + count
    return merged


def load_geojson() -> dict:
    print(f"Fetching GeoJSON from {CA_COUNTIES_GEOJSON_URL} ...")
    with httpx.Client(timeout=30.0) as client:
        resp = client.get(CA_COUNTIES_GEOJSON_URL)
        resp.raise_for_status()
        return resp.json()


def main():
    print("Loading data ...")
    df = pl.read_csv(DATA_DIR / "Capstone2025_nsi_lvl9_with_landcover_and_color.csv")
    neighbors_df = pl.read_csv(DATA_DIR / "ca_county_neighbors.csv")

    neighbors = neighbors_df.rename({"county_fips": "fips_a", "neighbor_fips": "fips_b"})
    neighbors = neighbors.filter(pl.col("fips_a") < pl.col("fips_b"))
    adjacency_list = [(row["fips_a"], row["fips_b"]) for row in neighbors.iter_rows(named=True)]

    all_colors_raw = df["clr"].unique().sort().to_list()
    merged_color_set: set[str] = set()
    color_to_group: dict[str, str] = {}
    for group in COLOR_GROUPS:
        for color in group["colors"]:
            color_to_group[color] = group["name"]
    for c in all_colors_raw:
        merged_color_set.add(color_to_group.get(c, c))
    all_colors = sorted(merged_color_set)

    all_lc_types = df["lc_type"].unique().sort().to_list()

    county_lc_clr_counts = df.group_by(["fips", "lc_type", "clr"]).len().rename({"len": "count"})
    county_lc_support = county_lc_clr_counts.group_by(["fips", "lc_type"]).agg(
        pl.col("count").sum().alias("support")
    )
    support_dict = {
        (row["fips"], row["lc_type"]): row["support"]
        for row in county_lc_support.iter_rows(named=True)
    }

    def get_merged_color_distribution(fips_val, lc_type_val):
        subset = county_lc_clr_counts.filter(
            (pl.col("fips") == fips_val) & (pl.col("lc_type") == lc_type_val)
        )
        raw_counts = dict(zip(subset["clr"].to_list(), subset["count"].to_list()))
        merged_counts = apply_color_mapping(raw_counts)
        smoothed = np.array(
            [merged_counts.get(c, 0) + LAPLACE_PSEUDOCOUNT for c in all_colors], dtype=float
        )
        return smoothed / smoothed.sum()

    print(f"Computing pooled JSD for {len(adjacency_list)} county pairs ...")
    results = []
    for fips_a, fips_b in adjacency_list:
        pair_jsds = []
        pair_supports = []
        for lc in all_lc_types:
            support_a = support_dict.get((fips_a, lc), 0)
            support_b = support_dict.get((fips_b, lc), 0)
            if support_a < MIN_SUPPORT or support_b < MIN_SUPPORT:
                continue
            dist_a = get_merged_color_distribution(fips_a, lc)
            dist_b = get_merged_color_distribution(fips_b, lc)
            jsd = jensenshannon(dist_a, dist_b)
            pair_jsds.append(jsd)
            pair_supports.append(min(support_a, support_b))

        if pair_jsds:
            weighted_jsd = sum(j * s for j, s in zip(pair_jsds, pair_supports)) / sum(pair_supports)
            results.append({
                "fips_a": fips_a,
                "fips_b": fips_b,
                "weighted_jsd": weighted_jsd,
                "mean_jsd": sum(pair_jsds) / len(pair_jsds),
                "n_shared_lc": len(pair_jsds),
                "total_support": sum(pair_supports),
            })

    county_max_jsd: dict[str, float] = {}
    for r in results:
        fips_a_str = str(r["fips_a"]).zfill(5)
        fips_b_str = str(r["fips_b"]).zfill(5)
        jsd = r["weighted_jsd"]
        county_max_jsd[fips_a_str] = max(county_max_jsd.get(fips_a_str, 0), jsd)
        county_max_jsd[fips_b_str] = max(county_max_jsd.get(fips_b_str, 0), jsd)

    ca_counties_geojson = load_geojson()

    county_features = []
    for feature in ca_counties_geojson["features"]:
        props = dict(feature["properties"])
        county_name = props.get("name", "")
        fips_str = COUNTY_NAME_TO_FIPS.get(county_name)
        if fips_str:
            props["fips"] = fips_str
            props["max_divergence"] = county_max_jsd.get(fips_str, 0)
        else:
            props["max_divergence"] = None
        county_features.append({
            "type": "Feature",
            "properties": props,
            "geometry": feature["geometry"],
        })

    edge_features = []
    for r in results:
        fips_a_str = str(r["fips_a"]).zfill(5)
        fips_b_str = str(r["fips_b"]).zfill(5)
        coord_a = COUNTY_CENTROIDS.get(fips_a_str)
        coord_b = COUNTY_CENTROIDS.get(fips_b_str)
        if coord_a and coord_b:
            edge_features.append({
                "type": "Feature",
                "properties": {
                    "fips_a": fips_a_str,
                    "fips_b": fips_b_str,
                    "county_a": FIPS_TO_COUNTY_NAME.get(fips_a_str, fips_a_str),
                    "county_b": FIPS_TO_COUNTY_NAME.get(fips_b_str, fips_b_str),
                    "weighted_jsd": r["weighted_jsd"],
                    "mean_jsd": r["mean_jsd"],
                    "n_shared_lc": r["n_shared_lc"],
                    "total_support": r["total_support"],
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": [coord_a, coord_b],
                },
            })

    output = {
        "counties": {"type": "FeatureCollection", "features": county_features},
        "edges": {"type": "FeatureCollection", "features": edge_features},
        "stats": {
            "total_pairs": len(results),
            "total_counties": len(county_max_jsd),
            "mean_jsd": sum(r["weighted_jsd"] for r in results) / len(results) if results else 0,
            "max_jsd": max(r["weighted_jsd"] for r in results) if results else 0,
            "min_jsd": min(r["weighted_jsd"] for r in results) if results else 0,
        },
        "color_groups_applied": len(COLOR_GROUPS),
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(output, f)

    size_mb = OUT_PATH.stat().st_size / 1_000_000
    print(f"Written to {OUT_PATH} ({size_mb:.2f} MB)")
    print(f"  {len(edge_features)} edges, {len(county_features)} counties, {len(COLOR_GROUPS)} color groups applied")


if __name__ == "__main__":
    main()
