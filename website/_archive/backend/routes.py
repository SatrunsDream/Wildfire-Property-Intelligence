from fastapi import APIRouter, HTTPException
import polars as pl
import numpy as np
from scipy.spatial.distance import jensenshannon

from constants import (
    COUNTY_NAME_TO_FIPS, FIPS_TO_COUNTY_NAME, COUNTY_CENTROIDS
)
from models import (
    BayesianMapRequest,
    ColorGroupedCompareRequest, ColorGroupedDivergenceRequest, MoransIMapRequest
)
from utils import (
    get_feature_distribution, apply_color_mapping,
    get_merged_feature_distribution, calculate_local_morans_i
)
from data import (
    df, neighbors_df, c2st_df,
    bayesian_baseline_df, bayesian_stabilized_df, morans_i_freq_df,
    m01_summary_df, m01_detail_df
)

router = APIRouter()


@router.get("/conditional-pooling/landcover-types")
def get_conditional_pooling_landcover_types():
    if m01_summary_df is None:
        raise HTTPException(500, "Conditional pooling data not loaded")
    return {"landcover_types": m01_summary_df["lc_type"].unique().sort().to_list()}


@router.post("/conditional-pooling/map/counties")
def get_conditional_pooling_map_counties(req: BayesianMapRequest):
    from data import ca_counties_geojson
    
    if m01_summary_df is None:
        raise HTTPException(500, "Conditional pooling data not loaded")
    if not ca_counties_geojson:
        raise HTTPException(500, "County GeoJSON not loaded")
    
    metric = req.metric if req.metric in ["kl_div", "l1_distance"] else "kl_div"
    filtered_df = m01_summary_df.filter(pl.col("lc_type") == req.lc_type) if req.lc_type else m01_summary_df
    
    if len(filtered_df) == 0:
        return {
            "type": "FeatureCollection",
            "features": [],
            "metric": metric,
            "lc_type": req.lc_type,
            "stats": {"total_counties": 0, "mean_value": 0.0, "max_value": 0.0}
        }
    
    county_agg = filtered_df.group_by("fips").agg([
        pl.col(metric).mean().alias("mean_value"),
        pl.col(metric).max().alias("max_value"),
        pl.col("n_county").sum().alias("total_exposure"),
        pl.col("num_neighbors").first().alias("num_neighbors")
    ])
    
    features = []
    values = []
    
    for feature in ca_counties_geojson["features"]:
        props = feature.get("properties", {})
        fips_str = props.get("fips") or props.get("FIPS") or COUNTY_NAME_TO_FIPS.get(props.get("name") or props.get("county_name", ""))
        
        if not fips_str:
            continue
        
        try:
            fips_int = int(fips_str.lstrip("0")) if fips_str.startswith("0") else int(fips_str)
        except (ValueError, AttributeError):
            continue
        
        county_data = county_agg.filter(pl.col("fips") == fips_int)
        if len(county_data) > 0:
            row = county_data.row(0, named=True)
            fips_str_padded = str(fips_int).zfill(5)
            feature["properties"].update({
                **props,
                "fips": fips_str_padded,
                "mean_value": float(row["mean_value"]),
                "max_value": float(row["max_value"]),
                "total_exposure": int(row["total_exposure"]),
                "num_neighbors": int(row["num_neighbors"]),
                "county_name": FIPS_TO_COUNTY_NAME.get(fips_str_padded, props.get("name", f"County {fips_int}"))
            })
            features.append(feature)
            values.append(float(row["mean_value"]))
    
    return {
        "type": "FeatureCollection",
        "features": features,
        "metric": metric,
        "lc_type": req.lc_type,
        "stats": {
            "total_counties": len(features),
            "mean_value": float(np.mean(values)) if values else 0.0,
            "max_value": float(np.max(values)) if values else 0.0
        }
    }


@router.get("/conditional-pooling/county/{fips}")
def get_conditional_pooling_county_detail(fips: str, lc_type: str | None = None):
    if m01_summary_df is None or m01_detail_df is None:
        raise HTTPException(500, "Conditional pooling data not loaded")
    
    fips_int = int(fips.lstrip("0")) if fips.startswith("0") else int(fips)
    summary_filtered = m01_summary_df.filter(pl.col("fips") == fips_int)
    if lc_type:
        summary_filtered = summary_filtered.filter(pl.col("lc_type") == lc_type)
    
    if len(summary_filtered) == 0:
        raise HTTPException(404, f"No data found for county {fips}")
    
    detail_filtered = m01_detail_df.filter(pl.col("fips") == fips_int)
    if lc_type:
        detail_filtered = detail_filtered.filter(pl.col("lc_type") == lc_type)
    
    by_landcover = []
    for lc in summary_filtered["lc_type"].unique().to_list():
        lc_summary = summary_filtered.filter(pl.col("lc_type") == lc).row(0, named=True)
        lc_detail = detail_filtered.filter(pl.col("lc_type") == lc)
        
        distributions = [
            {
                "clr": row["clr"],
                "y_county": int(row["y_county"]),
                "y_pool": int(row["y_pool"]),
                "p_county": float(row["p_county"]),
                "p_pool": float(row["p_pool"]),
                "contrib": float(row["contrib"]),
                "abs_diff": float(row["abs_diff"])
            }
            for row in lc_detail.iter_rows(named=True)
        ]
        distributions.sort(key=lambda x: abs(x["contrib"]), reverse=True)
        
        by_landcover.append({
            "lc_type": lc,
            "n_county": int(lc_summary["n_county"]),
            "n_pool": int(lc_summary["n_pool"]),
            "num_neighbors": int(lc_summary["num_neighbors"]),
            "kl_div": float(lc_summary["kl_div"]),
            "l1_distance": float(lc_summary["l1_distance"]),
            "top_color": lc_summary["top_color"],
            "top_contrib": float(lc_summary["top_contrib"]),
            "distributions": distributions
        })
    
    return {
        "fips": fips,
        "county_name": FIPS_TO_COUNTY_NAME.get(fips_int, f"County {fips_int}"),
        "by_landcover": by_landcover,
        "total_landcover_types": len(by_landcover)
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

    county_lc_clr_counts = df.group_by(["fips", "lc_type", "clr"]).agg(pl.col("clr_cc").sum().alias("count"))
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

    county_lc_clr_counts = df.group_by(["fips", "lc_type", "clr"]).agg(pl.col("clr_cc").sum().alias("count"))
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


@router.get("/morans-i/filters")
def get_morans_i_filters():
    """Get available landcover types and building types for filtering."""
    if morans_i_freq_df is None:
        raise HTTPException(500, "Moran's I frequency data not loaded")
    
    return {
        "landcover_types": morans_i_freq_df["lc_type"].unique().sort().to_list(),
        "building_types": morans_i_freq_df["bldgtype"].unique().sort().to_list()
    }


@router.post("/morans-i/map")
def get_morans_i_map(req: MoransIMapRequest):
    """Get Moran's I spatial autocorrelation data for counties with filtering."""
    from data import ca_counties_geojson
    
    if morans_i_freq_df is None:
        raise HTTPException(500, "Moran's I frequency data not loaded")
    if not ca_counties_geojson:
        raise HTTPException(500, "County geometries not loaded")
    
    filtered_df = morans_i_freq_df
    if req.lc_type:
        filtered_df = filtered_df.filter(pl.col("lc_type") == req.lc_type)
    if req.bldgtype:
        filtered_df = filtered_df.filter(pl.col("bldgtype") == req.bldgtype)
    
    if len(filtered_df) == 0:
        return {
            "type": "FeatureCollection",
            "features": [],
            "stats": {"total_counties": 0, "mean_local": 0.0, "max_local": 0.0, "min_local": 0.0, "std_local": 0.0}
        }
    
    county_freqs = filtered_df.group_by("fips").agg([
        pl.col("freq").mean().alias("freq")
    ])
    
    morans_scores = calculate_local_morans_i(county_freqs, neighbors_df)
    
    morans_lookup = {}
    for row in morans_scores.iter_rows(named=True):
        fips_int = row["fips"]
        fips_str = str(fips_int).zfill(5)
        morans_lookup[fips_str] = float(row["local"])
    
    features = []
    for feature in ca_counties_geojson["features"]:
        props = feature.get("properties", {})
        fips_str = props.get("fips") or props.get("FIPS") or COUNTY_NAME_TO_FIPS.get(props.get("name") or props.get("county_name", ""))
        
        if not fips_str or fips_str not in morans_lookup:
            continue
        
        local_score = morans_lookup[fips_str]
        features.append({
            "type": "Feature",
            "properties": {
                **props,
                "fips": fips_str,
                "county_name": FIPS_TO_COUNTY_NAME.get(fips_str, props.get("name", fips_str)),
                "local": local_score
            },
            "geometry": feature["geometry"]
        })
    
    local_scores = [f["properties"]["local"] for f in features if f["properties"]["local"] is not None]
    
    return {
        "type": "FeatureCollection",
        "features": features,
        "stats": {
            "total_counties": len(features),
            "mean_local": float(np.mean(local_scores)) if local_scores else 0.0,
            "max_local": float(np.max(local_scores)) if local_scores else 0.0,
            "min_local": float(np.min(local_scores)) if local_scores else 0.0,
            "std_local": float(np.std(local_scores)) if local_scores else 0.0
        }
    }


@router.get("/morans-i/county/{fips}")
def get_morans_i_county_detail(fips: str, lc_type: str | None = None, bldgtype: str | None = None):
    """Get detailed Moran's I statistics for a specific county."""
    if morans_i_freq_df is None:
        raise HTTPException(500, "Moran's I frequency data not loaded")
    
    fips_int = int(fips.lstrip("0")) if fips.startswith("0") else int(fips)
    filtered_df = morans_i_freq_df.filter(pl.col("fips") == fips_int)
    
    if lc_type:
        filtered_df = filtered_df.filter(pl.col("lc_type") == lc_type)
    if bldgtype:
        filtered_df = filtered_df.filter(pl.col("bldgtype") == bldgtype)
    
    if len(filtered_df) == 0:
        raise HTTPException(404, f"No data found for county {fips}")
    
    county_freqs = filtered_df.group_by(["lc_type", "bldgtype"]).agg([
        pl.col("freq").first().alias("freq")
    ])
    
    neighbor_rows = neighbors_df.filter(
        (pl.col("county_fips") == fips_int) | (pl.col("neighbor_fips") == fips_int)
    )
    neighbor_fips_set = {fips_int}
    for row in neighbor_rows.iter_rows(named=True):
        if row["county_fips"] == fips_int:
            neighbor_fips_set.add(row["neighbor_fips"])
        else:
            neighbor_fips_set.add(row["county_fips"])
    
    neighbor_data = morans_i_freq_df.filter(pl.col("fips").is_in(list(neighbor_fips_set)))
    if lc_type:
        neighbor_data = neighbor_data.filter(pl.col("lc_type") == lc_type)
    if bldgtype:
        neighbor_data = neighbor_data.filter(pl.col("bldgtype") == bldgtype)
    
    by_category = []
    for row in county_freqs.iter_rows(named=True):
        lc = row["lc_type"]
        bldg = row["bldgtype"]
        freq = row["freq"]
        
        neighbor_freqs = neighbor_data.filter(
            (pl.col("lc_type") == lc) & (pl.col("bldgtype") == bldg)
        )["freq"].to_list()
        
        by_category.append({
            "lc_type": lc,
            "bldgtype": bldg,
            "frequency": float(freq),
            "neighbor_mean": float(np.mean(neighbor_freqs)) if neighbor_freqs else 0.0,
            "neighbor_min": float(np.min(neighbor_freqs)) if neighbor_freqs else 0.0,
            "neighbor_max": float(np.max(neighbor_freqs)) if neighbor_freqs else 0.0,
            "neighbor_count": len(neighbor_freqs)
        })
    
    fips_str = str(fips_int).zfill(5)
    return {
        "fips": fips_str,
        "county_name": FIPS_TO_COUNTY_NAME.get(fips_str, f"County {fips_str}"),
        "num_neighbors": len(neighbor_fips_set) - 1,
        "by_category": by_category,
        "total_categories": len(by_category)
    }


# ============================================================================
# Group-Level Divergence
# ============================================================================

@router.get("/group-divergence/map")
def get_group_divergence_map():
    """Get group-level divergence map with county-level anomaly scores."""
    from data import group_county_summary_df, ca_counties_geojson

    if group_county_summary_df is None:
        raise HTTPException(500, "Group county summary data not loaded")

    if ca_counties_geojson is None:
        raise HTTPException(500, "County geometries not loaded")

    # Create lookup dict
    summary_dict = {
        row["fips"]: {
            "num_anomalies": row["num_anomalies"],
            "avg_divergence": row["avg_divergence"]
        }
        for row in group_county_summary_df.iter_rows(named=True)
    }

    # Merge into GeoJSON
    features = []
    for feature in ca_counties_geojson["features"]:
        fips_str = feature.get("properties", {}).get("fips") or feature.get("properties", {}).get("FIPS")

        if not fips_str:
            name = feature.get("properties", {}).get("name") or feature.get("properties", {}).get("NAME")
            fips_str = COUNTY_NAME_TO_FIPS.get(name)

        if fips_str:
            fips_int = int(fips_str)
            if fips_int in summary_dict:
                feature["properties"]["fips"] = str(fips_int).zfill(5)
                feature["properties"]["num_anomalies"] = summary_dict[fips_int]["num_anomalies"]
                feature["properties"]["avg_divergence"] = summary_dict[fips_int]["avg_divergence"]
                features.append(feature)

    return {
        "type": "FeatureCollection",
        "features": features,
        "stats": {
            "total_counties": len(features),
            "mean_anomalies": float(group_county_summary_df["num_anomalies"].mean()),
            "max_anomalies": float(group_county_summary_df["num_anomalies"].max()),
            "mean_divergence": float(group_county_summary_df["avg_divergence"].mean()),
            "max_divergence": float(group_county_summary_df["avg_divergence"].max())
        }
    }


@router.get("/group-divergence/county/{fips}")
def get_group_divergence_county(fips: int):
    """Get detailed divergence scores for a specific county."""
    from data import group_divergence_df

    if group_divergence_df is None:
        raise HTTPException(500, "Group divergence data not loaded")

    county_data = group_divergence_df.filter(pl.col("fips") == fips)

    if len(county_data) == 0:
        raise HTTPException(404, f"No data found for county {fips}")

    return {
        "fips": fips,
        "landcover_divergences": [
            {
                "lc_type": row["lc_type"],
                "divergence": row["divergence"],
                "anomalous": bool(row["anomalous"])
            }
            for row in county_data.iter_rows(named=True)
        ]
    }


@router.get("/group-divergence/county/{fips}/colors")
def get_group_divergence_county_colors(fips: int):
    """Get county vs statewide color distributions per landcover type."""
    county_df = df.filter(pl.col("fips") == fips)

    if len(county_df) == 0:
        raise HTTPException(404, f"No data found for county {fips}")

    lc_types = county_df["lc_type"].unique().to_list()
    by_landcover = []

    for lc in lc_types:
        lc_county = county_df.filter(pl.col("lc_type") == lc)
        lc_state = df.filter(pl.col("lc_type") == lc)

        county_counts = lc_county.group_by("clr").agg(pl.col("clr_cc").sum().alias("n"))
        county_total = county_counts["n"].sum()
        county_freqs = {row["clr"]: row["n"] / county_total for row in county_counts.iter_rows(named=True)}

        state_counts = lc_state.group_by("clr").agg(pl.col("clr_cc").sum().alias("n"))
        state_total = state_counts["n"].sum()
        state_freqs = {row["clr"]: row["n"] / state_total for row in state_counts.iter_rows(named=True)}

        all_colors = sorted(set(county_freqs) | set(state_freqs))

        by_landcover.append({
            "lc_type": lc,
            "county_total": int(county_total),
            "colors": [
                {
                    "color": c,
                    "county_freq": round(county_freqs.get(c, 0), 4),
                    "baseline_freq": round(state_freqs.get(c, 0), 4),
                }
                for c in all_colors
            ]
        })

    return {"fips": fips, "by_landcover": by_landcover}
