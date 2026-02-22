# AGENTS Guidelines for Backend

## File Structure

**Project Root**: `Wildfire-Property-Intelligence/`  
**Backend Root**: `Wildfire-Property-Intelligence/website/backend/`

| File | Full Path | Purpose |
|------|-----------|---------|
| `main.py` | `website/backend/main.py` | FastAPI app entry point, CORS config, lifespan (loads county GeoJSON), registers router |
| `routes.py` | `website/backend/routes.py` | All active API endpoints |
| `models.py` | `website/backend/models.py` | Pydantic request models |
| `data.py` | `website/backend/data.py` | CSV loading into Polars DataFrames at startup |
| `constants.py` | `website/backend/constants.py` | FIPS mappings, centroids, metadata/constants |
| `utils.py` | `website/backend/utils.py` | Helper functions (distribution handling, color grouping, Moran's I helper) |
| `data/` | `website/backend/data/` | CSV data files |

## Data Loading

All data is loaded in `data.py` at startup as module-level Polars DataFrames.

Primary loaded variables:
- `df`
- `neighbors_df`
- `c2st_df`
- `bayesian_baseline_df`
- `bayesian_stabilized_df`
- `bayesian_counts_df`
- `morans_i_freq_df`
- `m01_summary_df`
- `m01_detail_df`
- `group_divergence_df`
- `group_county_summary_df`
- `color_similarity_df`
- `color_pairs_df`
- `ca_counties_geojson` (loaded in `main.py` lifespan)

If a CSV fails to load for optional datasets, the DataFrame is set to `None` and related endpoints return 500.

## Active Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/conditional-pooling/landcover-types` | Available M01 landcover types |
| POST | `/conditional-pooling/map/counties` | County map for conditional pooling (`kl_div` / `l1_distance`) |
| GET | `/conditional-pooling/county/{fips}` | County conditional pooling detail |
| GET | `/map/neighbor-divergence` | Neighbor divergence map (counties + edges) |
| GET | `/conditioning-options` | Conditioning filter options |
| POST | `/compare/counties` | County comparison with optional color grouping |
| GET | `/c2st/results` | C2ST edge results (optional `lc_type`) |
| GET | `/c2st/pair/{fips_a}/{fips_b}` | C2ST detail for county pair |
| GET | `/bayesian/baseline-distributions` | Baseline Bayesian distributions |
| POST | `/bayesian/map/counties` | Bayesian county map |
| GET | `/bayesian/county/{fips}` | Bayesian county detail |
| POST | `/map/neighbor-divergence-merged` | Neighbor divergence with merged color groups |
| GET | `/morans-i/filters` | Moran's I filter values |
| POST | `/morans-i/map` | Moran's I county map |
| GET | `/morans-i/county/{fips}` | Moran's I county detail |
| GET | `/group-divergence/map` | Group divergence county map |
| GET | `/group-divergence/county/{fips}` | Group divergence county detail |
| GET | `/group-divergence/county/{fips}/colors` | County vs statewide color frequencies |

## API Change Workflow

1. Add/update request schemas in `models.py` if needed.
2. Add endpoint in `routes.py`.
3. Ensure required DataFrames are loaded in `data.py`.
4. If endpoint needs county geometry overlays, use `ca_counties_geojson` loaded in `main.py` lifespan.

## Key Dataset Columns

- `fips`: County FIPS (integer; format to 5-char string for display)
- `lc_type`: Landcover type
- `clr`: Color category
- `st_damcat`: Occupancy type
- `bldgtype`: Building type
- `h3`: H3 cell id (present in main dataset)
