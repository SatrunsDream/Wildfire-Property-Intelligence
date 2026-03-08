from __future__ import annotations

from typing import Any, Mapping

import numpy as np
import polars as pl
from scipy.spatial.distance import jensenshannon


def compute_neighbor_jsd(
    df: pl.DataFrame,
    neighbors: pl.DataFrame,
    final_map: Mapping[str, str] | None = None,
    *,
    laplace_pseudocount: float = 1.0,
    min_support: int = 30,
) -> tuple[pl.DataFrame, dict[str, Any]]:
    if final_map is None:
        final_map = {}

    required_df_cols = {"fips", "lc_type", "clr", "clr_cc"}
    required_nb_cols = {"county_fips", "neighbor_fips"}
    missing_df = sorted(required_df_cols - set(df.columns))
    missing_nb = sorted(required_nb_cols - set(neighbors.columns))
    if missing_df:
        raise ValueError(f"df is missing required columns: {missing_df}")
    if missing_nb:
        raise ValueError(f"neighbors is missing required columns: {missing_nb}")

    df_local = df.with_columns(pl.col("fips").cast(pl.String).str.zfill(5))
    neighbors_local = neighbors.with_columns(
        pl.col("county_fips").cast(pl.String).str.zfill(5),
        pl.col("neighbor_fips").cast(pl.String).str.zfill(5),
    )

    neighbors_pairs = (
        neighbors_local.rename({"county_fips": "fips_a", "neighbor_fips": "fips_b"})
        .filter(pl.col("fips_a") < pl.col("fips_b"))
        .unique()
    )
    adjacency_list = [(r["fips_a"], r["fips_b"]) for r in neighbors_pairs.iter_rows(named=True)]

    all_colors_raw = df_local["clr"].unique().sort().to_list()
    all_colors = sorted({final_map.get(c, c) for c in all_colors_raw})
    all_lc_types = df_local["lc_type"].unique().sort().to_list()

    county_lc_clr_counts = df_local.group_by(["fips", "lc_type", "clr"]).agg(
        pl.col("clr_cc").sum().alias("count")
    )
    county_lc_support = county_lc_clr_counts.group_by(["fips", "lc_type"]).agg(
        pl.col("count").sum().alias("support")
    )
    support_dict = {
        (r["fips"], r["lc_type"]): int(r["support"])
        for r in county_lc_support.iter_rows(named=True)
    }

    merged_counts_by_key: dict[tuple[str, str], dict[str, float]] = {}
    for row in county_lc_clr_counts.iter_rows(named=True):
        key = (row["fips"], row["lc_type"])
        merged_color = final_map.get(row["clr"], row["clr"])
        if key not in merged_counts_by_key:
            merged_counts_by_key[key] = {}
        merged_counts_by_key[key][merged_color] = (
            merged_counts_by_key[key].get(merged_color, 0.0) + float(row["count"])
        )

    distribution_dict: dict[tuple[str, str], np.ndarray] = {}
    for key, merged_counts in merged_counts_by_key.items():
        smoothed = np.array(
            [merged_counts.get(color, 0.0) + laplace_pseudocount for color in all_colors],
            dtype=float,
        )
        distribution_dict[key] = smoothed / smoothed.sum()

    results: list[dict[str, Any]] = []
    for fips_a, fips_b in adjacency_list:
        pair_jsds: list[float] = []
        pair_supports: list[int] = []

        for lc in all_lc_types:
            support_a = support_dict.get((fips_a, lc), 0)
            support_b = support_dict.get((fips_b, lc), 0)
            if support_a < min_support or support_b < min_support:
                continue

            dist_a = distribution_dict[(fips_a, lc)]
            dist_b = distribution_dict[(fips_b, lc)]
            jsd = float(jensenshannon(dist_a, dist_b))

            pair_jsds.append(jsd)
            pair_supports.append(min(support_a, support_b))

        if pair_jsds:
            weighted_jsd = float(
                sum(j * s for j, s in zip(pair_jsds, pair_supports)) / sum(pair_supports)
            )
            results.append(
                {
                    "fips_a": fips_a,
                    "fips_b": fips_b,
                    "weighted_jsd": weighted_jsd,
                    "mean_jsd": float(sum(pair_jsds) / len(pair_jsds)),
                    "n_shared_lc": len(pair_jsds),
                    "total_support": int(sum(pair_supports)),
                }
            )

    jsd_results_df = pl.DataFrame(results).sort("weighted_jsd", descending=True)
    jsd_stats = {
        "total_pairs": len(results),
        "n_raw_colors": len(all_colors_raw),
        "n_merged_colors": len(all_colors),
        "mean_jsd": float(np.mean([r["weighted_jsd"] for r in results])) if results else 0.0,
        "max_jsd": float(np.max([r["weighted_jsd"] for r in results])) if results else 0.0,
        "min_jsd": float(np.min([r["weighted_jsd"] for r in results])) if results else 0.0,
    }
    return jsd_results_df, jsd_stats

