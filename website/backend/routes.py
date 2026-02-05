from fastapi import APIRouter, HTTPException
import polars as pl
import numpy as np
from scipy.spatial.distance import jensenshannon

from constants import (
    COUNTY_NAME_TO_FIPS, FIPS_TO_COUNTY_NAME, COUNTY_CENTROIDS,
    COLUMN_META, H3_LEVELS
)
from models import (
    ConditionalProbRequest, MapRequest, CountyCompareRequest, BayesianMapRequest,
    ColorGroupedCompareRequest, ColorGroupedDivergenceRequest
)
from utils import (
    estimate_alpha_eb, aggregate_hexes_to_resolution,
    build_hex_geojson, get_feature_distribution, apply_color_mapping,
    get_merged_feature_distribution
)
from data import (
    df, neighbors_df, c2st_df, ca_counties_geojson,
    bayesian_baseline_df, bayesian_stabilized_df, bayesian_counts_df, morans_i_df
)

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


@router.post("/conditional-probability/county/{fips}")
def get_county_surprisal_detail(fips: str, req: MapRequest):
    """Get detailed surprisal data for a specific county, organized by landcover type."""
    fips_int = int(fips.lstrip("0")) if fips.startswith("0") else int(fips)
    
    context_cols = req.context_cols
    target = req.target
    min_support = req.min_support
    
    if "fips" not in context_cols:
        context_cols = ["fips"] + context_cols
    
    valid_cols = set(COLUMN_META.keys())
    for col in context_cols + [target]:
        if col not in valid_cols:
            raise HTTPException(400, f"Column '{col}' not valid")
    
    county_df = df.filter(pl.col("fips") == fips_int)
    
    if len(county_df) == 0:
        raise HTTPException(404, f"No data found for county {fips}")
    
    counts = county_df.group_by(context_cols + [target]).agg(pl.len().alias("count"))
    context_totals = county_df.group_by(context_cols).agg(pl.len().alias("context_total"))
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
    
    county_name = FIPS_TO_COUNTY_NAME.get(fips, fips)
    
    if "lc_type" in context_cols:
        lc_types = prob_table["lc_type"].unique().to_list()
        by_landcover = []
        
        for lc in lc_types:
            lc_data = prob_table.filter(pl.col("lc_type") == lc).filter(pl.col("reliable"))
            
            if len(lc_data) == 0:
                continue
            
            color_distributions = []
            for row in lc_data.iter_rows(named=True):
                color_distributions.append({
                    "clr": row[target],
                    "surprisal": float(row["surprisal"]) if row["surprisal"] is not None else 0.0,
                    "prob": float(row["prob"]) if row["prob"] is not None else 0.0,
                    "count": int(row["count"]) if row["count"] is not None else 0,
                    "context_total": int(row["context_total"]) if row["context_total"] is not None else 0
                })
            
            color_distributions.sort(key=lambda x: x["surprisal"], reverse=True)
            
            by_landcover.append({
                "lc_type": lc,
                "total_rows": int(lc_data["context_total"].first()) if len(lc_data) > 0 else 0,
                "max_surprisal": float(lc_data["surprisal"].max()) if len(lc_data) > 0 else 0.0,
                "mean_surprisal": float(lc_data["surprisal"].mean()) if len(lc_data) > 0 else 0.0,
                "distributions": color_distributions
            })
        
        return {
            "fips": fips,
            "county_name": county_name,
            "alpha": alpha,
            "by_landcover": by_landcover,
            "total_landcover_types": len(by_landcover)
        }
    else:
        county_data = prob_table.filter(pl.col("reliable"))
        
        color_distributions = []
        for row in county_data.iter_rows(named=True):
            color_distributions.append({
                "clr": row[target],
                "surprisal": float(row["surprisal"]) if row["surprisal"] is not None else 0.0,
                "prob": float(row["prob"]) if row["prob"] is not None else 0.0,
                "count": int(row["count"]) if row["count"] is not None else 0,
                "context_total": int(row["context_total"]) if row["context_total"] is not None else 0
            })
        
        color_distributions.sort(key=lambda x: x["surprisal"], reverse=True)
        
        return {
            "fips": fips,
            "county_name": county_name,
            "alpha": alpha,
            "by_landcover": [{
                "lc_type": "all",
                "total_rows": int(county_data["context_total"].sum()) if len(county_data) > 0 else 0,
                "max_surprisal": float(county_data["surprisal"].max()) if len(county_data) > 0 else 0.0,
                "mean_surprisal": float(county_data["surprisal"].mean()) if len(county_data) > 0 else 0.0,
                "distributions": color_distributions
            }],
            "total_landcover_types": 1
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


def compute_jsd_from_distributions(dist_a: list, dist_b: list) -> float:
    """Compute JSD from distribution lists (with Laplace smoothing)."""
    LAPLACE = 1
    all_values = set(d["value"] for d in dist_a) | set(d["value"] for d in dist_b)

    counts_a = {d["value"]: d["count"] for d in dist_a}
    counts_b = {d["value"]: d["count"] for d in dist_b}

    vec_a = np.array([counts_a.get(v, 0) + LAPLACE for v in sorted(all_values)], dtype=float)
    vec_b = np.array([counts_b.get(v, 0) + LAPLACE for v in sorted(all_values)], dtype=float)

    vec_a /= vec_a.sum()
    vec_b /= vec_b.sum()

    return float(jensenshannon(vec_a, vec_b))


@router.post("/compare/counties")
def compare_counties(req: ColorGroupedCompareRequest):
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

    original_jsd = compute_jsd_from_distributions(clr_a, clr_b)

    merged_clr_a = None
    merged_clr_b = None
    merged_vocab_a = None
    merged_vocab_b = None
    merged_jsd = None

    if req.color_groups and len(req.color_groups) > 0:
        color_groups_dicts = [{"name": g.name, "colors": g.colors} for g in req.color_groups]
        merged_clr_a, merged_clr_b, merged_vocab_a, merged_vocab_b = get_merged_feature_distribution(
            df_a, df_b, "clr", total_a, total_b, color_groups_dicts
        )
        merged_jsd = compute_jsd_from_distributions(merged_clr_a, merged_clr_b)

    county_a_name = FIPS_TO_COUNTY_NAME.get(req.fips_a, req.fips_a)
    county_b_name = FIPS_TO_COUNTY_NAME.get(req.fips_b, req.fips_b)

    result = {
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
        },
        "jsd": {
            "original": original_jsd
        }
    }

    if merged_jsd is not None:
        result["jsd"]["merged"] = merged_jsd
        result["jsd"]["reduction"] = original_jsd - merged_jsd
        result["jsd"]["reduction_pct"] = ((original_jsd - merged_jsd) / original_jsd * 100) if original_jsd > 0 else 0
        result["county_a"]["clr_merged"] = {"distribution": merged_clr_a, "vocab_size": merged_vocab_a}
        result["county_b"]["clr_merged"] = {"distribution": merged_clr_b, "vocab_size": merged_vocab_b}

    return result


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



@router.get("/bayesian/baseline-distributions")
def get_baseline_distributions(lc_type: str | None = None):
    """Get baseline distributions by landcover type."""
    try:
        data = bayesian_baseline_df
        if len(data) == 0:
            raise HTTPException(500, "Baseline data is empty")
        
        if lc_type:
            data = data.filter(pl.col("lc_type") == lc_type)
        
        return {
            "distributions": data.to_dicts(),
            "landcover_types": sorted(bayesian_baseline_df["lc_type"].unique().to_list())
        }
    except Exception as e:
        raise HTTPException(500, f"Error loading baseline distributions: {str(e)}")


@router.get("/bayesian/test-data")
def test_bayesian_data():
    """Test endpoint to check if Bayesian data is loaded correctly."""
    try:
        return {
            "baseline_rows": len(bayesian_baseline_df),
            "stabilized_rows": len(bayesian_stabilized_df),
            "counts_rows": len(bayesian_counts_df),
            "baseline_columns": bayesian_baseline_df.columns,
            "stabilized_columns": bayesian_stabilized_df.columns,
            "stabilized_sample": bayesian_stabilized_df.head(3).to_dicts() if len(bayesian_stabilized_df) > 0 else [],
            "unique_fips": sorted(bayesian_stabilized_df["fips"].unique().to_list()) if len(bayesian_stabilized_df) > 0 else []
        }
    except Exception as e:
        return {"error": str(e), "traceback": str(e.__traceback__)}


@router.get("/bayesian/stabilized-distributions")
def get_stabilized_distributions(fips: str | None = None, lc_type: str | None = None):
    """Get stabilized distributions, optionally filtered by county and/or landcover."""
    data = bayesian_stabilized_df
    
    if fips:
        fips_int = int(fips.lstrip("0")) if fips.startswith("0") else int(fips)
        data = data.filter(pl.col("fips") == fips_int)
    
    if lc_type:
        data = data.filter(pl.col("lc_type") == lc_type)
    
    return {
        "distributions": data.to_dicts(),
        "total_records": len(data)
    }


@router.post("/bayesian/map/counties")
def get_bayesian_county_map(req: BayesianMapRequest):
    """Get county-level map data for Bayesian shrinkage visualization."""
    from data import ca_counties_geojson
    
    if not ca_counties_geojson:
        raise HTTPException(500, "County GeoJSON not loaded")
    
    try:
        data = bayesian_stabilized_df
        
        if len(data) == 0:
            raise HTTPException(500, "Bayesian stabilized data is empty")
        
        if req.lc_type:
            # Handle potential space/plus sign mismatch (URL decoding converts + to space)
            lc_type_clean = req.lc_type.replace(" ", "+")
            data = data.filter(pl.col("lc_type") == lc_type_clean)
        
        if req.color_category:
            data = data.filter(pl.col("clr") == req.color_category)
        
        if len(data) == 0:
            return {
                "type": "FeatureCollection",
                "features": [],
                "metric": req.metric,
                "lc_type": req.lc_type,
                "stats": {
                    "total_counties": 0,
                    "mean_value": 0.0,
                    "max_value": 0.0
                }
            }
        
        agg_col = req.metric if req.metric in ["movement", "abs_movement", "shrinkage_weight"] else "movement"
        
        if agg_col not in data.columns:
            raise HTTPException(400, f"Metric column '{agg_col}' not found in data")
        
        county_stats = (
            data
            .group_by("fips")
            .agg([
                pl.col(agg_col).mean().alias("mean_value"),
                pl.col(agg_col).max().alias("max_value"),
                pl.col("exposure").sum().alias("total_exposure"),
                pl.col("shrinkage_weight").mean().alias("mean_shrinkage_weight"),
                pl.struct(["clr", "movement", "observed_prop", "stabilized_prop"])
                  .sort_by("abs_movement", descending=True)
                  .first()
                  .alias("top_change")
            ])
        )
    except Exception as e:
        raise HTTPException(500, f"Error processing data: {str(e)}")
    
    stats_by_fips = {}
    for row in county_stats.to_dicts():
        try:
            fips_str = str(row["fips"]).zfill(5)
            top_change = row.get("top_change")
            
            top_color = None
            top_movement = None
            top_observed_prop = None
            top_stabilized_prop = None
            
            if top_change and isinstance(top_change, dict):
                top_color = top_change.get("clr")
                if top_change.get("movement") is not None:
                    top_movement = float(top_change.get("movement"))
                if top_change.get("observed_prop") is not None:
                    top_observed_prop = float(top_change.get("observed_prop"))
                if top_change.get("stabilized_prop") is not None:
                    top_stabilized_prop = float(top_change.get("stabilized_prop"))
            
            stats_by_fips[fips_str] = {
                "mean_value": float(row["mean_value"]) if row["mean_value"] is not None else 0.0,
                "max_value": float(row["max_value"]) if row["max_value"] is not None else 0.0,
                "total_exposure": int(row["total_exposure"]) if row["total_exposure"] is not None else 0,
                "mean_shrinkage_weight": float(row["mean_shrinkage_weight"]) if row["mean_shrinkage_weight"] is not None else 0.0,
                "top_color": top_color,
                "top_movement": top_movement,
                "top_observed_prop": top_observed_prop,
                "top_stabilized_prop": top_stabilized_prop,
            }
        except Exception as e:
            continue
    
    features = []
    for feature in ca_counties_geojson["features"]:
        props = feature.get("properties", {})
        fips_str = props.get("fips") or props.get("FIPS")
        
        if not fips_str:
            county_name = props.get("name") or props.get("county_name", "")
            fips_str = COUNTY_NAME_TO_FIPS.get(county_name)
        
        if fips_str and fips_str in stats_by_fips:
            stats = stats_by_fips[fips_str]
            new_props = {
                **props,
                "fips": fips_str,
                "county_name": FIPS_TO_COUNTY_NAME.get(fips_str, props.get("name", fips_str)),
                "mean_value": stats["mean_value"],
                "max_value": stats["max_value"],
                "total_exposure": stats["total_exposure"],
                "mean_shrinkage_weight": stats["mean_shrinkage_weight"],
                "metric": req.metric
            }
            
            if stats["top_color"]:
                new_props["top_color"] = stats["top_color"]
                if stats["top_movement"] is not None:
                    new_props["top_movement"] = stats["top_movement"]
                if stats["top_observed_prop"] is not None:
                    new_props["top_observed_prop"] = stats["top_observed_prop"]
                if stats["top_stabilized_prop"] is not None:
                    new_props["top_stabilized_prop"] = stats["top_stabilized_prop"]
            
            features.append({
                "type": "Feature",
                "properties": new_props,
                "geometry": feature["geometry"]
            })
    
    try:
        mean_val = sum(f["properties"]["mean_value"] for f in features) / len(features) if features else 0.0
        max_val = max((f["properties"]["max_value"] for f in features), default=0.0)
        
        return {
            "type": "FeatureCollection",
            "features": features,
            "metric": req.metric,
            "lc_type": req.lc_type,
            "stats": {
                "total_counties": len(features),
                "mean_value": mean_val,
                "max_value": max_val
            }
        }
    except Exception as e:
        raise HTTPException(500, f"Error building GeoJSON response: {str(e)}")


@router.get("/bayesian/county/{fips}")
def get_bayesian_county_detail(fips: str, lc_type: str | None = None):
    """Get detailed Bayesian shrinkage data for a specific county."""
    fips_int = int(fips.lstrip("0")) if fips.startswith("0") else int(fips)
    
    county_data = bayesian_stabilized_df.filter(pl.col("fips") == fips_int)
    
    if lc_type:
        lc_type_clean = lc_type.replace(" ", "+")
        county_data = county_data.filter(pl.col("lc_type") == lc_type_clean)
    
    lc_types_in_county = county_data["lc_type"].unique().to_list()
    baseline_data = bayesian_baseline_df.filter(pl.col("lc_type").is_in(lc_types_in_county))
    
    county_name = FIPS_TO_COUNTY_NAME.get(fips, fips)
    
    by_landcover = []
    for lc in lc_types_in_county:
        lc_data = county_data.filter(pl.col("lc_type") == lc)
        lc_baseline = baseline_data.filter(pl.col("lc_type") == lc)
        
        total_exposure = lc_data["exposure"].first()
        mean_shrinkage = lc_data["shrinkage_weight"].mean()
        max_movement = lc_data["abs_movement"].max()
        
        by_landcover.append({
            "lc_type": lc,
            "total_exposure": total_exposure,
            "mean_shrinkage_weight": mean_shrinkage,
            "max_abs_movement": max_movement,
            "num_categories": len(lc_data),
            "distributions": lc_data.select([
                "clr", "count", "exposure", "observed_prop", 
                "baseline_prop", "stabilized_prop", "movement", 
                "abs_movement", "shrinkage_weight"
            ]).to_dicts(),
            "baseline": lc_baseline.select(["clr", "baseline_prop"]).to_dicts()
        })
    
    return {
        "fips": fips,
        "county_name": county_name,
        "by_landcover": by_landcover,
        "total_landcover_types": len(by_landcover)
    }


@router.post("/map/neighbor-divergence-merged")
def get_neighbor_divergence_merged(req: ColorGroupedDivergenceRequest):
    """
    Recalculate neighbor divergence with merged color groups.
    Returns GeoJSON with updated JSD values.
    """
    from data import ca_counties_geojson

    LAPLACE_PSEUDOCOUNT = 1
    MIN_SUPPORT = 30

    color_groups = [{"name": g.name, "colors": g.colors} for g in req.color_groups]

    neighbors = neighbors_df.rename({"county_fips": "fips_a", "neighbor_fips": "fips_b"})
    neighbors = neighbors.filter(pl.col("fips_a") < pl.col("fips_b"))
    adjacency_list = [(row["fips_a"], row["fips_b"]) for row in neighbors.iter_rows(named=True)]

    all_colors_raw = df["clr"].unique().sort().to_list()
    merged_colors = set()
    for c in all_colors_raw:
        mapped = c
        for g in color_groups:
            if c in g["colors"]:
                mapped = g["name"]
                break
        merged_colors.add(mapped)
    all_colors = sorted(merged_colors)

    all_lc_types = df["lc_type"].unique().sort().to_list()

    county_lc_clr_counts = df.group_by(["fips", "lc_type", "clr"]).len().rename({"len": "count"})
    county_lc_support = county_lc_clr_counts.group_by(["fips", "lc_type"]).agg(pl.col("count").sum().alias("support"))
    support_dict = {(row["fips"], row["lc_type"]): row["support"] for row in county_lc_support.iter_rows(named=True)}

    def get_merged_color_distribution(fips_val, lc_type_val):
        subset = county_lc_clr_counts.filter((pl.col("fips") == fips_val) & (pl.col("lc_type") == lc_type_val))
        raw_counts = dict(zip(subset["clr"].to_list(), subset["count"].to_list()))

        # Merge counts based on color groups
        merged_counts = apply_color_mapping(raw_counts, color_groups)

        smoothed = np.array([merged_counts.get(c, 0) + LAPLACE_PSEUDOCOUNT for c in all_colors], dtype=float)
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
        },
        "color_groups_applied": len(req.color_groups)
    }


@router.get("/morans-i/test")
def test_morans_i_data():
    """Test endpoint to debug Moran's I data loading."""
    if morans_i_df is None:
        return {"error": "Moran's I data not loaded", "loaded": False}
    
    sample_data = morans_i_df.head(10).to_dicts()
    fips_values = morans_i_df["fips"].unique().to_list()
    
    # Check GeoJSON FIPS format
    geo_fips_samples = []
    if ca_counties_geojson:
        for i, feature in enumerate(ca_counties_geojson.get("features", [])[:10]):
            props = feature.get("properties", {})
            geo_fips_samples.append({
                "index": i,
                "fips": props.get("fips"),
                "FIPS": props.get("FIPS"),
                "name": props.get("name"),
                "county_name": props.get("county_name"),
                "all_props_keys": list(props.keys())
            })
    
    return {
        "loaded": True,
        "total_rows": len(morans_i_df),
        "columns": morans_i_df.columns,
        "fips_dtype": str(morans_i_df["fips"].dtype),
        "local_dtype": str(morans_i_df["local"].dtype),
        "sample_fips": fips_values[:10],
        "sample_data": sample_data,
        "geojson_samples": geo_fips_samples,
        "geojson_total_features": len(ca_counties_geojson.get("features", [])) if ca_counties_geojson else 0
    }


@router.get("/morans-i/map")
def get_morans_i_map():
    """Get Moran's I spatial autocorrelation data for counties."""
    if morans_i_df is None:
        raise HTTPException(500, "Moran's I data not loaded")
    
    if ca_counties_geojson is None:
        raise HTTPException(500, "County geometries not loaded")
    
    # Create a lookup dictionary for Moran's I scores by FIPS (as string "06001" format)
    # This matches the pattern used by other working maps
    morans_lookup = {}
    for row in morans_i_df.iter_rows(named=True):
        fips_val = row.get("fips")
        local_val = row.get("local")
        if fips_val is not None and local_val is not None:
            try:
                # Convert to int then to string format "06001"
                fips_int = int(fips_val) if not isinstance(fips_val, int) else fips_val
                fips_str = str(fips_int).zfill(5)  # Convert 6001 -> "06001"
                morans_lookup[fips_str] = float(local_val)
            except (ValueError, TypeError):
                continue
    
    if not morans_lookup:
        raise HTTPException(500, f"No valid Moran's I data found. Loaded {len(morans_i_df)} rows but none had valid fips/local values")
    
    # Merge Moran's I scores with county geometries (same pattern as Bayesian map)
    features = []
    for feature in ca_counties_geojson.get("features", []):
        props = feature.get("properties", {})
        fips_str = props.get("fips") or props.get("FIPS")
        
        # Try to match by county name if FIPS not found (same as other maps)
        if not fips_str:
            county_name = props.get("name") or props.get("county_name", "")
            fips_str = COUNTY_NAME_TO_FIPS.get(county_name)
        
        if fips_str and fips_str in morans_lookup:
            local_score = morans_lookup[fips_str]
            new_props = {
                **props,
                "fips": fips_str,
                "county_name": FIPS_TO_COUNTY_NAME.get(fips_str, props.get("name", fips_str)),
                "local": local_score
            }
            features.append({
                "type": "Feature",
                "properties": new_props,
                "geometry": feature["geometry"]
            })
    
    # Calculate statistics
    local_scores = [f["properties"]["local"] for f in features if f["properties"]["local"] is not None]
    
    if not local_scores:
        raise HTTPException(500, f"No matching counties found. Moran's I has {len(morans_lookup)} counties, GeoJSON has {len(ca_counties_geojson.get('features', []))} counties, matched {len(features)}")
    
    return {
        "type": "FeatureCollection",
        "features": features,
        "stats": {
            "total_counties": len(features),
            "mean_local": float(np.mean(local_scores)),
            "max_local": float(np.max(local_scores)),
            "min_local": float(np.min(local_scores)),
            "std_local": float(np.std(local_scores))
        }
    }
