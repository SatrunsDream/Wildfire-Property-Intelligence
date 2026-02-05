import polars as pl
import numpy as np
import h3


def estimate_alpha_eb(counts_df, context_totals_df, global_prior_df, context_cols, target):
    merged = (
        counts_df
        .join(context_totals_df, on=context_cols)
        .join(global_prior_df.select(target, "p_global"), on=target)
        .with_columns((pl.col("count") / pl.col("context_total")).alias("p_obs"))
    )

    variance_df = (
        merged
        .group_by(target)
        .agg([
            pl.col("p_obs").var().alias("var_obs"),
            pl.col("p_global").first().alias("p_global"),
            pl.col("context_total").mean().alias("mean_n")
        ])
    )

    stats = variance_df.to_numpy()
    alphas = []
    for row in stats:
        var_obs, p_k, mean_n = row[1], row[2], row[3]
        if var_obs is None or var_obs == 0:
            continue
        binomial_var = p_k * (1 - p_k) / mean_n
        if var_obs > binomial_var:
            excess_var = var_obs - binomial_var
            alpha_k = p_k * (1 - p_k) / excess_var - 1
            if alpha_k > 0:
                alphas.append(alpha_k)

    return float(np.median(alphas)) if alphas else 100.0


def hex_to_polygon(h3_id: str) -> list:
    boundary = h3.cell_to_boundary(h3_id)
    coords = [[lng, lat] for lat, lng in boundary]
    coords.append(coords[0])
    return coords


def aggregate_hexes_to_resolution(hex_data: list[dict], target_res: int) -> list[dict]:
    if target_res >= 9:
        return hex_data

    groups: dict[str, list[dict]] = {}
    for hx in hex_data:
        parent = h3.cell_to_parent(hx["h3"], target_res)
        if parent not in groups:
            groups[parent] = []
        groups[parent].append(hx)

    aggregated = []
    for parent_h3, children in groups.items():
        total_count = sum(c.get("count", 1) for c in children)

        scores = [c["max_surprisal"] for c in children if c.get("max_surprisal") is not None]
        max_surprisal = max(scores) if scores else None
        mean_surprisal = sum(scores) / len(scores) if scores else None

        top_child = max(
            [c for c in children if c.get("max_surprisal") is not None],
            key=lambda c: c.get("max_surprisal", 0),
            default=None
        )

        def get_dominant(key):
            counts = {}
            for c in children:
                val = c.get(key)
                if val:
                    counts[val] = counts.get(val, 0) + c.get("count", 1)
            return max(counts.keys(), key=lambda k: counts[k]) if counts else None

        rec = {
            "h3": parent_h3,
            "count": total_count,
            "lc_type": get_dominant("lc_type"),
            "fips": get_dominant("fips"),
            "max_surprisal": max_surprisal,
            "mean_surprisal": mean_surprisal,
        }

        if top_child:
            rec["anomaly_value"] = top_child.get("anomaly_value")
            rec["anomaly_prob"] = top_child.get("anomaly_prob")
            rec["anomaly_context"] = top_child.get("anomaly_context")
            rec["expected"] = top_child.get("expected")

        aggregated.append(rec)
    return aggregated


def build_hex_geojson(hex_data: list[dict]) -> dict:
    features = []
    for hx in hex_data:
        h3_id = hx["h3"]
        props = {k: v for k, v in hx.items() if k != "h3"}
        try:
            coords = hex_to_polygon(h3_id)
            features.append({
                "type": "Feature",
                "properties": {"h3": h3_id, **props},
                "geometry": {"type": "Polygon", "coordinates": [coords]}
            })
        except:
            continue
    return {"type": "FeatureCollection", "features": features}


def get_feature_distribution(df_a, df_b, col_name, total_a, total_b):
    counts_a = df_a.group_by(col_name).len().rename({"len": "count"})
    counts_b = df_b.group_by(col_name).len().rename({"len": "count"})

    dist_a = {row[col_name]: row["count"] for row in counts_a.iter_rows(named=True)}
    dist_b = {row[col_name]: row["count"] for row in counts_b.iter_rows(named=True)}

    all_values = sorted(set(dist_a.keys()) | set(dist_b.keys()))
    vocab_a = set(dist_a.keys())
    vocab_b = set(dist_b.keys())
    unique_to_a = vocab_a - vocab_b
    unique_to_b = vocab_b - vocab_a

    distribution_a = []
    distribution_b = []
    for v in all_values:
        count_a = dist_a.get(v, 0)
        count_b = dist_b.get(v, 0)
        distribution_a.append({
            "value": v,
            "count": count_a,
            "proportion": count_a / total_a if total_a > 0 else 0,
            "unique": v in unique_to_a
        })
        distribution_b.append({
            "value": v,
            "count": count_b,
            "proportion": count_b / total_b if total_b > 0 else 0,
            "unique": v in unique_to_b
        })

    totals = {v: dist_a.get(v, 0) + dist_b.get(v, 0) for v in all_values}
    distribution_a = sorted(distribution_a, key=lambda x: totals[x["value"]], reverse=True)
    distribution_b = sorted(distribution_b, key=lambda x: totals[x["value"]], reverse=True)

    return distribution_a, distribution_b, len(vocab_a), len(vocab_b)


def apply_color_mapping(color_counts: dict, color_groups: list) -> dict:
    color_to_group = {}
    for group in color_groups:
        for color in group["colors"]:
            color_to_group[color] = group["name"]

    merged = {}
    for color, count in color_counts.items():
        key = color_to_group.get(color, color)
        merged[key] = merged.get(key, 0) + count

    return merged


def get_merged_feature_distribution(df_a, df_b, col_name, total_a, total_b, color_groups: list):

    counts_a = df_a.group_by(col_name).len().rename({"len": "count"})
    counts_b = df_b.group_by(col_name).len().rename({"len": "count"})

    dist_a = {row[col_name]: row["count"] for row in counts_a.iter_rows(named=True)}
    dist_b = {row[col_name]: row["count"] for row in counts_b.iter_rows(named=True)}

    merged_a = apply_color_mapping(dist_a, color_groups)
    merged_b = apply_color_mapping(dist_b, color_groups)

    all_values = sorted(set(merged_a.keys()) | set(merged_b.keys()))
    vocab_a = set(merged_a.keys())
    vocab_b = set(merged_b.keys())
    unique_to_a = vocab_a - vocab_b
    unique_to_b = vocab_b - vocab_a

    group_names = {g["name"] for g in color_groups}

    distribution_a = []
    distribution_b = []
    for v in all_values:
        count_a = merged_a.get(v, 0)
        count_b = merged_b.get(v, 0)
        distribution_a.append({
            "value": v,
            "count": count_a,
            "proportion": count_a / total_a if total_a > 0 else 0,
            "unique": v in unique_to_a,
            "is_group": v in group_names
        })
        distribution_b.append({
            "value": v,
            "count": count_b,
            "proportion": count_b / total_b if total_b > 0 else 0,
            "unique": v in unique_to_b,
            "is_group": v in group_names
        })

    totals = {v: merged_a.get(v, 0) + merged_b.get(v, 0) for v in all_values}
    distribution_a = sorted(distribution_a, key=lambda x: totals[x["value"]], reverse=True)
    distribution_b = sorted(distribution_b, key=lambda x: totals[x["value"]], reverse=True)

    return distribution_a, distribution_b, len(vocab_a), len(vocab_b)
