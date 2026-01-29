from fastapi import APIRouter, HTTPException
import polars as pl
import numpy as np
from scipy.spatial.distance import jensenshannon

from constants import (
    COUNTY_NAME_TO_FIPS, FIPS_TO_COUNTY_NAME, COUNTY_CENTROIDS,
    COLUMN_META, H3_LEVELS
)
from models import ConditionalProbRequest, MapRequest, CountyCompareRequest
from utils import (
    estimate_alpha_eb, aggregate_hexes_to_resolution,
    build_hex_geojson, get_feature_distribution
)
from data import df, neighbors_df, c2st_df, ca_counties_geojson

router = APIRouter()


@router.get("/")
def read_root():
    return df.head(10).to_dicts()


@router.get("/columns")
def get_columns():
    return {
        "columns": list(COLUMN_META.keys()),
        "meta": COLUMN_META
    }


@router.post("/analyze/conditional-probability")
def analyze_conditional_probability(req: ConditionalProbRequest):
    context_cols = req.context_cols
    target = req.target
    min_support = req.min_support

    valid_cols = set(COLUMN_META.keys())
    for col in context_cols + [target]:
        if col not in valid_cols:
            raise HTTPException(400, f"Column '{col}' not valid. Choose from: {list(valid_cols)}")

    if target in context_cols:
        raise HTTPException(400, "Target cannot be in context_cols")

    if len(context_cols) == 0:
        raise HTTPException(400, "Must have at least one context column")

    counts = df.group_by(context_cols + [target]).agg(pl.len().alias("count"))
    context_totals = df.group_by(context_cols).agg(pl.len().alias("context_total"))
    global_prior = df.group_by(target).agg(pl.len().alias("global_count"))
    global_prior = global_prior.with_columns(
        (pl.col("global_count") / pl.col("global_count").sum()).alias("p_global")
    )

    alpha = estimate_alpha_eb(counts, context_totals, global_prior, context_cols, target)

    prob_table = (
        counts
        .join(context_totals, on=context_cols)
        .join(global_prior.select(target, "p_global"), on=target)
    )

    prob_table = prob_table.with_columns(
        ((pl.col("count") + alpha * pl.col("p_global")) / (pl.col("context_total") + alpha)).alias("prob")
    )

    prob_table = prob_table.with_columns(
        (-pl.col("prob").log()).alias("surprisal"),
        (pl.col("context_total") >= min_support).alias("reliable")
    )

    sample_h3 = df.select(context_cols + [target, "h3"]).group_by(context_cols + [target]).agg(
        pl.col("h3").first().alias("sample_h3")
    )

    prob_table = prob_table.join(sample_h3, on=context_cols + [target], how="left")
    prob_table = prob_table.sort("surprisal", descending=True)

    return {
        "alpha": alpha,
        "total_rows": len(prob_table),
        "data": prob_table.to_dicts()
    }


@router.post("/map/counties")
def get_county_map(req: MapRequest):
    from data import ca_counties_geojson

    context_cols = req.context_cols
    target = req.target
    min_support = req.min_support

    if "fips" not in context_cols:
        context_cols = ["fips"] + context_cols

    valid_cols = set(COLUMN_META.keys())
    for col in context_cols + [target]:
        if col not in valid_cols:
            raise HTTPException(400, f"Column '{col}' not valid")

    counts = df.group_by(context_cols + [target]).agg(pl.len().alias("count"))
    context_totals = df.group_by(context_cols).agg(pl.len().alias("context_total"))
    global_prior = df.group_by(target).agg(pl.len().alias("global_count"))
    global_prior = global_prior.with_columns(
        (pl.col("global_count") / pl.col("global_count").sum()).alias("p_global")
    )

    alpha = estimate_alpha_eb(counts, context_totals, global_prior, context_cols, target)

    prob_table = (
        counts
        .join(context_totals, on=context_cols)
        .join(global_prior.select(target, "p_global"), on=target)
        .with_columns(
            ((pl.col("count") + alpha * pl.col("p_global")) / (pl.col("context_total") + alpha)).alias("prob")
        )
        .with_columns(
            (-pl.col("prob").log()).alias("surprisal"),
            (pl.col("context_total") >= min_support).alias("reliable")
        )
    )

    county_stats = (
        prob_table
        .filter(pl.col("reliable"))
        .group_by("fips")
        .agg([
            pl.col("surprisal").max().alias("max_surprisal"),
            pl.col("surprisal").mean().alias("mean_surprisal"),
            pl.col("context_total").sum().alias("total_rows"),
            pl.struct([target, "surprisal"]).sort_by("surprisal", descending=True).first().alias("top_anomaly")
        ])
        .with_columns(pl.col("fips").cast(pl.Utf8).str.zfill(5).alias("fips_str"))
    )

    stats_dict = {row["fips_str"]: row for row in county_stats.to_dicts()}

    features = []
    for feature in ca_counties_geojson["features"]:
        props = dict(feature["properties"])
        county_name = props.get("name", "")

        fips_str = COUNTY_NAME_TO_FIPS.get(county_name)

        if fips_str and fips_str in stats_dict:
            stats = stats_dict[fips_str]
            props["fips"] = fips_str
            props["max_surprisal"] = stats["max_surprisal"]
            props["mean_surprisal"] = stats["mean_surprisal"]
            props["total_rows"] = stats["total_rows"]
            top = stats["top_anomaly"]
            if top:
                props["top_anomaly_value"] = top.get(target)
                props["top_anomaly_surprisal"] = top.get("surprisal")
        else:
            props["fips"] = fips_str
            props["max_surprisal"] = None
            props["mean_surprisal"] = None
            props["total_rows"] = 0

        features.append({
            "type": "Feature",
            "properties": props,
            "geometry": feature["geometry"]
        })

    return {
        "type": "FeatureCollection",
        "features": features,
        "alpha": alpha
    }


@router.post("/map/hexes")
def get_hex_map(req: MapRequest):
    context_cols = req.context_cols
    target = req.target
    min_support = req.min_support

    valid_cols = set(COLUMN_META.keys())
    for col in context_cols + [target]:
        if col not in valid_cols:
            raise HTTPException(400, f"Column '{col}' not valid")

    counts = df.group_by(context_cols + [target]).agg(pl.len().alias("count"))
    context_totals = df.group_by(context_cols).agg(pl.len().alias("context_total"))
    global_prior = df.group_by(target).agg(pl.len().alias("global_count"))
    global_prior = global_prior.with_columns(
        (pl.col("global_count") / pl.col("global_count").sum()).alias("p_global")
    )

    alpha = estimate_alpha_eb(counts, context_totals, global_prior, context_cols, target)

    prob_table = (
        counts
        .join(context_totals, on=context_cols)
        .join(global_prior.select(target, "p_global"), on=target)
        .with_columns(
            ((pl.col("count") + alpha * pl.col("p_global")) / (pl.col("context_total") + alpha)).alias("prob")
        )
        .with_columns(
            (-pl.col("prob").log()).alias("surprisal"),
            (pl.col("context_total") >= min_support).alias("reliable")
        )
    )

    expected_by_context = (
        prob_table
        .filter(pl.col("reliable"))
        .sort(["surprisal"], descending=False)
        .group_by(context_cols)
        .agg([
            pl.col(target).head(3).alias("expected_values"),
            pl.col("prob").head(3).alias("expected_probs"),
        ])
    )

    base_cols = ["h3", "lc_type", "fips"]
    extra_cols = [c for c in context_cols + [target] if c not in base_cols]
    select_cols = base_cols + extra_cols

    h3_with_context = df.select(select_cols).unique()

    scored = h3_with_context.join(
        prob_table.filter(pl.col("reliable")).select(context_cols + [target, "surprisal", "prob", "count", "context_total"]),
        on=context_cols + [target],
        how="inner"
    )

    scored = scored.join(expected_by_context, on=context_cols, how="left")

    context_str_cols = [c for c in context_cols if c != "fips"]
    context_expr = pl.concat_str([pl.col(c).cast(pl.Utf8) for c in context_str_cols], separator=", ") if context_str_cols else pl.lit("")

    scored = scored.with_columns([
        context_expr.alias("context_str"),
        pl.col("fips").cast(pl.Utf8).str.zfill(5).alias("fips_str"),
    ])

    h3_data = scored.group_by("h3").agg([
        pl.len().alias("count"),
        pl.col("lc_type").first().alias("lc_type"),
        pl.col("fips").first().cast(pl.Utf8).str.zfill(5).alias("fips"),
        pl.col("surprisal").max().alias("max_surprisal"),
        pl.col("surprisal").mean().alias("mean_surprisal"),
        pl.struct([target, "surprisal", "prob", "context_str", "expected_values", "expected_probs"])
          .sort_by("surprisal", descending=True)
          .first()
          .alias("top_anomaly"),
    ])

    hex_records = []
    for row in h3_data.to_dicts():
        rec = {
            "h3": row["h3"],
            "count": row["count"],
            "lc_type": row["lc_type"],
            "fips": row["fips"],
            "max_surprisal": row["max_surprisal"],
            "mean_surprisal": row["mean_surprisal"],
        }
        top = row.get("top_anomaly")
        if top:
            rec["anomaly_value"] = top.get(target)
            rec["anomaly_prob"] = top.get("prob")
            rec["anomaly_context"] = top.get("context_str")
            exp_vals = top.get("expected_values") or []
            exp_probs = top.get("expected_probs") or []
            expected_parts = [f"{v} ({p*100:.0f}%)" for v, p in zip(exp_vals[:3], exp_probs[:3])]
            rec["expected"] = ", ".join(expected_parts) if expected_parts else None
        hex_records.append(rec)

    hex_list = hex_records

    geojson_by_res = {}
    for level in H3_LEVELS:
        res = level["res"]
        if res == 9:
            agg_data = hex_list
        else:
            agg_data = aggregate_hexes_to_resolution(hex_list, res)
        geojson_by_res[str(res)] = build_hex_geojson(agg_data)

    return {
        "by_resolution": geojson_by_res,
        "alpha": alpha,
        "total_hexes": len(hex_list),
        "levels": H3_LEVELS
    }


@router.get("/map/neighbor-divergence")
def get_neighbor_divergence_map():
    from data import ca_counties_geojson

    LAPLACE_PSEUDOCOUNT = 1
    MIN_SUPPORT = 30

    neighbors = neighbors_df.rename({"county_fips": "fips_a", "neighbor_fips": "fips_b"})
    neighbors = neighbors.filter(pl.col("fips_a") < pl.col("fips_b"))
    adjacency_list = [(row["fips_a"], row["fips_b"]) for row in neighbors.iter_rows(named=True)]

    all_colors = df["clr"].unique().sort().to_list()
    all_lc_types = df["lc_type"].unique().sort().to_list()

    county_lc_clr_counts = df.group_by(["fips", "lc_type", "clr"]).len().rename({"len": "count"})
    county_lc_support = county_lc_clr_counts.group_by(["fips", "lc_type"]).agg(pl.col("count").sum().alias("support"))
    support_dict = {(row["fips"], row["lc_type"]): row["support"] for row in county_lc_support.iter_rows(named=True)}

    def get_color_distribution(fips_val, lc_type_val):
        subset = county_lc_clr_counts.filter((pl.col("fips") == fips_val) & (pl.col("lc_type") == lc_type_val))
        color_counts = dict(zip(subset["clr"].to_list(), subset["count"].to_list()))
        smoothed = np.array([color_counts.get(c, 0) + LAPLACE_PSEUDOCOUNT for c in all_colors], dtype=float)
        return smoothed / smoothed.sum()

    results = []
    for fips_a, fips_b in adjacency_list:
        pair_jsds = []
        pair_supports = []
        for lc in all_lc_types:
            support_a = support_dict.get((fips_a, lc), 0)
            support_b = support_dict.get((fips_b, lc), 0)
            if support_a < MIN_SUPPORT or support_b < MIN_SUPPORT:
                continue
            dist_a = get_color_distribution(fips_a, lc)
            dist_b = get_color_distribution(fips_b, lc)
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
                "total_support": sum(pair_supports)
            })

    county_max_jsd = {}
    for r in results:
        fips_a_str = str(r["fips_a"]).zfill(5)
        fips_b_str = str(r["fips_b"]).zfill(5)
        jsd = r["weighted_jsd"]
        county_max_jsd[fips_a_str] = max(county_max_jsd.get(fips_a_str, 0), jsd)
        county_max_jsd[fips_b_str] = max(county_max_jsd.get(fips_b_str, 0), jsd)

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
            "geometry": feature["geometry"]
        })

    edge_features = []
    for r in results:
        fips_a_str = str(r["fips_a"]).zfill(5)
        fips_b_str = str(r["fips_b"]).zfill(5)
        coord_a = COUNTY_CENTROIDS.get(fips_a_str)
        coord_b = COUNTY_CENTROIDS.get(fips_b_str)
        if coord_a and coord_b:
            county_a_name = FIPS_TO_COUNTY_NAME.get(fips_a_str, fips_a_str)
            county_b_name = FIPS_TO_COUNTY_NAME.get(fips_b_str, fips_b_str)
            edge_features.append({
                "type": "Feature",
                "properties": {
                    "fips_a": fips_a_str,
                    "fips_b": fips_b_str,
                    "county_a": county_a_name,
                    "county_b": county_b_name,
                    "weighted_jsd": r["weighted_jsd"],
                    "mean_jsd": r["mean_jsd"],
                    "n_shared_lc": r["n_shared_lc"],
                    "total_support": r["total_support"]
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": [coord_a, coord_b]
                }
            })

    return {
        "counties": {"type": "FeatureCollection", "features": county_features},
        "edges": {"type": "FeatureCollection", "features": edge_features},
        "stats": {
            "total_pairs": len(results),
            "total_counties": len(county_max_jsd),
            "mean_jsd": sum(r["weighted_jsd"] for r in results) / len(results) if results else 0,
            "max_jsd": max(r["weighted_jsd"] for r in results) if results else 0,
            "min_jsd": min(r["weighted_jsd"] for r in results) if results else 0
        }
    }


@router.get("/counties")
def get_counties():
    counties = []
    for name, fips in sorted(COUNTY_NAME_TO_FIPS.items()):
        counties.append({"name": name, "fips": fips})
    return {"counties": counties}


@router.get("/conditioning-options")
def get_conditioning_options():
    return {
        "options": [
            {"value": "", "label": "None (raw distribution)"},
            {"value": "lc_type", "label": "Land Cover Type"},
            {"value": "st_damcat", "label": "Occupancy Type (RES/COM/etc)"},
            {"value": "bldgtype", "label": "Building Type"},
        ],
        "values": {
            "lc_type": sorted(df["lc_type"].unique().to_list()),
            "st_damcat": sorted(df["st_damcat"].unique().to_list()),
            "bldgtype": sorted(df["bldgtype"].unique().to_list()),
        }
    }


@router.post("/compare/counties")
def compare_counties(req: CountyCompareRequest):
    fips_a = int(req.fips_a.lstrip("0")) if req.fips_a.startswith("0") else int(req.fips_a)
    fips_b = int(req.fips_b.lstrip("0")) if req.fips_b.startswith("0") else int(req.fips_b)

    df_a = df.filter(pl.col("fips") == fips_a)
    df_b = df.filter(pl.col("fips") == fips_b)

    applied_conditions = []
    if req.conditions:
        for cond in req.conditions:
            if cond.column and cond.value:
                df_a = df_a.filter(pl.col(cond.column) == cond.value)
                df_b = df_b.filter(pl.col(cond.column) == cond.value)
                applied_conditions.append({"column": cond.column, "value": cond.value})

    if len(df_a) == 0 or len(df_b) == 0:
        return {
            "error": "No data for one or both counties with the selected filter",
            "count_a": len(df_a),
            "count_b": len(df_b)
        }

    total_a = len(df_a)
    total_b = len(df_b)

    clr_a, clr_b, clr_vocab_a, clr_vocab_b = get_feature_distribution(df_a, df_b, "clr", total_a, total_b)
    bldg_a, bldg_b, bldg_vocab_a, bldg_vocab_b = get_feature_distribution(df_a, df_b, "bldgtype", total_a, total_b)
    occ_a, occ_b, occ_vocab_a, occ_vocab_b = get_feature_distribution(df_a, df_b, "st_damcat", total_a, total_b)

    county_a_name = FIPS_TO_COUNTY_NAME.get(req.fips_a, req.fips_a)
    county_b_name = FIPS_TO_COUNTY_NAME.get(req.fips_b, req.fips_b)

    return {
        "county_a": {
            "fips": req.fips_a,
            "name": county_a_name,
            "total_count": total_a,
            "clr": {"distribution": clr_a, "vocab_size": clr_vocab_a},
            "bldgtype": {"distribution": bldg_a, "vocab_size": bldg_vocab_a},
            "st_damcat": {"distribution": occ_a, "vocab_size": occ_vocab_a}
        },
        "county_b": {
            "fips": req.fips_b,
            "name": county_b_name,
            "total_count": total_b,
            "clr": {"distribution": clr_b, "vocab_size": clr_vocab_b},
            "bldgtype": {"distribution": bldg_b, "vocab_size": bldg_vocab_b},
            "st_damcat": {"distribution": occ_b, "vocab_size": occ_vocab_b}
        },
        "conditioning": {
            "conditions": applied_conditions,
            "total_conditions": len(applied_conditions)
        }
    }


@router.get("/neighbors/{fips}")
def get_county_neighbors(fips: str):
    fips_int = int(fips.lstrip("0")) if fips.startswith("0") else int(fips)

    neighbor_rows = neighbors_df.filter(
        (pl.col("county_fips") == fips_int) | (pl.col("neighbor_fips") == fips_int)
    )

    neighbor_fips_set = set()
    for row in neighbor_rows.iter_rows(named=True):
        if row["county_fips"] == fips_int:
            neighbor_fips_set.add(row["neighbor_fips"])
        else:
            neighbor_fips_set.add(row["county_fips"])

    neighbors = []
    for nfips in sorted(neighbor_fips_set):
        fips_str = str(nfips).zfill(5)
        name = FIPS_TO_COUNTY_NAME.get(fips_str, fips_str)
        neighbors.append({"fips": fips_str, "name": name})

    return {"neighbors": neighbors}


@router.get("/c2st/results")
def get_c2st_results(lc_type: str | None = None):
    data = c2st_df.filter(pl.col("accuracy").is_not_null())

    edge_features = []

    if lc_type:
        data = data.filter(pl.col("lc_type") == lc_type)
        for row in data.iter_rows(named=True):
            fips_a_str = str(row["fips_a"]).zfill(5)
            fips_b_str = str(row["fips_b"]).zfill(5)
            coord_a = COUNTY_CENTROIDS.get(fips_a_str)
            coord_b = COUNTY_CENTROIDS.get(fips_b_str)
            if coord_a and coord_b:
                county_a_name = FIPS_TO_COUNTY_NAME.get(fips_a_str, fips_a_str)
                county_b_name = FIPS_TO_COUNTY_NAME.get(fips_b_str, fips_b_str)
                edge_features.append({
                    "type": "Feature",
                    "properties": {
                        "fips_a": fips_a_str,
                        "fips_b": fips_b_str,
                        "county_a": county_a_name,
                        "county_b": county_b_name,
                        "accuracy": row["accuracy"],
                        "n_a": row["n_a"],
                        "n_b": row["n_b"],
                        "lc_type": row["lc_type"]
                    },
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [coord_a, coord_b]
                    }
                })
    else:
        aggregated = (
            data
            .with_columns((pl.col("n_a") + pl.col("n_b")).alias("total_n"))
            .with_columns((pl.col("accuracy") * pl.col("total_n")).alias("weighted_acc"))
            .group_by(["fips_a", "fips_b"])
            .agg([
                pl.col("weighted_acc").sum().alias("sum_weighted_acc"),
                pl.col("total_n").sum().alias("sum_n"),
                pl.col("n_a").sum().alias("total_n_a"),
                pl.col("n_b").sum().alias("total_n_b"),
            ])
            .with_columns((pl.col("sum_weighted_acc") / pl.col("sum_n")).alias("avg_accuracy"))
        )
        for row in aggregated.iter_rows(named=True):
            fips_a_str = str(row["fips_a"]).zfill(5)
            fips_b_str = str(row["fips_b"]).zfill(5)
            coord_a = COUNTY_CENTROIDS.get(fips_a_str)
            coord_b = COUNTY_CENTROIDS.get(fips_b_str)
            if coord_a and coord_b:
                county_a_name = FIPS_TO_COUNTY_NAME.get(fips_a_str, fips_a_str)
                county_b_name = FIPS_TO_COUNTY_NAME.get(fips_b_str, fips_b_str)
                edge_features.append({
                    "type": "Feature",
                    "properties": {
                        "fips_a": fips_a_str,
                        "fips_b": fips_b_str,
                        "county_a": county_a_name,
                        "county_b": county_b_name,
                        "accuracy": row["avg_accuracy"],
                        "n_a": row["total_n_a"],
                        "n_b": row["total_n_b"],
                        "lc_type": "all (weighted avg)"
                    },
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [coord_a, coord_b]
                    }
                })

    lc_types = c2st_df["lc_type"].unique().sort().to_list()

    accuracies = [f["properties"]["accuracy"] for f in edge_features]

    return {
        "edges": {"type": "FeatureCollection", "features": edge_features},
        "lc_types": lc_types,
        "stats": {
            "total_pairs": len(edge_features),
            "mean_accuracy": sum(accuracies) / len(accuracies) if accuracies else 0,
            "min_accuracy": min(accuracies) if accuracies else 0,
            "max_accuracy": max(accuracies) if accuracies else 0
        }
    }


@router.get("/c2st/pair/{fips_a}/{fips_b}")
def get_c2st_pair(fips_a: str, fips_b: str):
    fips_a_int = int(fips_a.lstrip("0")) if fips_a.startswith("0") else int(fips_a)
    fips_b_int = int(fips_b.lstrip("0")) if fips_b.startswith("0") else int(fips_b)

    pair_data = c2st_df.filter(
        ((pl.col("fips_a") == fips_a_int) & (pl.col("fips_b") == fips_b_int)) |
        ((pl.col("fips_a") == fips_b_int) & (pl.col("fips_b") == fips_a_int))
    )

    by_lc = []
    insufficient_data = []
    for row in pair_data.iter_rows(named=True):
        item = {
            "lc_type": row["lc_type"],
            "accuracy": row["accuracy"],
            "n_a": row["n_a"],
            "n_b": row["n_b"],
            "imp_st_damcat": row.get("imp_st_damcat"),
            "imp_bldgtype": row.get("imp_bldgtype"),
            "imp_clr": row.get("imp_clr")
        }
        if row["accuracy"] is not None:
            by_lc.append(item)
        else:
            insufficient_data.append(item)

    by_lc = sorted(by_lc, key=lambda x: x["accuracy"], reverse=True)
    insufficient_data = sorted(insufficient_data, key=lambda x: x["lc_type"])

    county_a_name = FIPS_TO_COUNTY_NAME.get(fips_a, fips_a)
    county_b_name = FIPS_TO_COUNTY_NAME.get(fips_b, fips_b)

    return {
        "fips_a": fips_a,
        "fips_b": fips_b,
        "county_a": county_a_name,
        "county_b": county_b_name,
        "by_landcover": by_lc,
        "insufficient_data": insufficient_data
    }
