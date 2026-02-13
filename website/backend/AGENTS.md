# AGENTS Guidelines for Backend

## File Structure

**Project Root**: `Wildfire-Property-Intelligence/`
**Backend Root**: `Wildfire-Property-Intelligence/website/backend/`

| File | Full Path | Purpose |
|------|-----------|---------|
| `main.py` | `website/backend/main.py` | FastAPI app entry point, CORS config, lifespan (loads GeoJSON), registers router |
| `routes.py` | `website/backend/routes.py` | All API endpoints — **add new endpoints here** (currently ~1440 lines) |
| `models.py` | `website/backend/models.py` | Pydantic request models — **add new request schemas here** |
| `data.py` | `website/backend/data.py` | Data loading (Polars DataFrames) — **add new data sources here** (loads at startup) |
| `constants.py` | `website/backend/constants.py` | FIPS mappings (`FIPS_TO_COUNTY_NAME`, `COUNTY_NAME_TO_FIPS`), column metadata, H3 levels, URLs |
| `utils.py` | `website/backend/utils.py` | Helper functions (Bayesian smoothing, H3 aggregation, GeoJSON builders) |
| `data/` | `website/backend/data/` | **Directory** containing all CSV data files (see Data Files section) |

**Key Imports in `routes.py`:**
- Line 19-22: Imports all DataFrames from `data.py` including `m01_summary_df`, `m01_detail_df`, `ca_counties_geojson`
- Line 6-18: Imports from `constants.py`, `models.py`, `utils.py`
- All endpoints access DataFrames directly (they're module-level variables)

## Data Files

All data files are located in `website/backend/data/` folder (relative to project root):

| File | Description | Full Path | Rows | Loaded As |
|------|-------------|-----------|------|-----------|
| `Capstone2025_nsi_lvl9_with_landcover_and_color.csv` | Main dataset (~2.4M rows) | `website/backend/data/Capstone2025_nsi_lvl9_with_landcover_and_color.csv` | ~2.4M | `df` |
| `ca_county_neighbors.csv` | County adjacency pairs | `website/backend/data/ca_county_neighbors.csv` | Varies | `neighbors_df` |
| `c2st_results_all_lc.csv` | Precomputed C2ST results by land cover | `website/backend/data/c2st_results_all_lc.csv` | Varies | `c2st_df` |
| `bayesian_shrinkage_baseline_distributions.csv` | Landcover-specific baseline distributions | `website/backend/data/bayesian_shrinkage_baseline_distributions.csv` | 421 | `bayesian_baseline_df` |
| `bayesian_shrinkage_stabilized_distributions.csv` | County-level stabilized distributions with shrinkage metrics | `website/backend/data/bayesian_shrinkage_stabilized_distributions.csv` | 4,493 | `bayesian_stabilized_df` |
| `bayesian_shrinkage_aggregated_counts.csv` | Aggregated counts by county × landcover × category | `website/backend/data/bayesian_shrinkage_aggregated_counts.csv` | Varies | `bayesian_counts_df` |
| `relative_frequencies_lc_type_bldgtype.csv` | Relative frequencies by county, landcover type, and building type | `website/backend/data/relative_frequencies_lc_type_bldgtype.csv` | 2036 | `morans_i_freq_df` |
| `m01_neighbor_pool_county_lc_summary.csv` | Neighbor-pooled conditional probability summary (county × landcover) | `website/backend/data/m01_neighbor_pool_county_lc_summary.csv` | ~470 | `m01_summary_df` |
| `m01_neighbor_pool_county_lc_color_detail.csv` | Neighbor-pooled conditional probability detail (county × landcover × color) | `website/backend/data/m01_neighbor_pool_county_lc_color_detail.csv` | ~10K+ | `m01_detail_df` |

**Data Loading Process (`data.py`):**
- All data files are loaded at **server startup** (when `main.py` runs)
- Data is loaded as Polars DataFrames in `data.py` (lines 17-50)
- Loading happens **synchronously** during module import
- If a file fails to load, the DataFrame is set to `None` and a warning is printed
- **Server must be restarted** after adding new data files or modifying `data.py`

**DataFrame Variables (all in `data.py`):**
- `df`: Main dataset (always loaded, required)
- `neighbors_df`: County adjacency pairs (always loaded)
- `c2st_df`: C2ST results (always loaded)
- `bayesian_baseline_df`: M02 baseline distributions (loaded with error handling)
- `bayesian_stabilized_df`: M02 stabilized distributions (loaded with error handling)
- `bayesian_counts_df`: M02 aggregated counts (loaded with error handling)
- `morans_i_freq_df`: M05 relative frequencies by county, landcover type, and building type (loaded from `relative_frequencies_lc_type_bldgtype.csv`)
- `m01_summary_df`: M01 neighbor-pooled summary (loaded with error handling, FIPS cast to Int64)
- `m01_detail_df`: M01 neighbor-pooled detail (loaded with error handling, FIPS cast to Int64)
- `ca_counties_geojson`: County geometries (loaded lazily in `main.py` lifespan, can be `None`)

**Note**: All data files must be present in `backend/data/` for their respective methods to work. If a file is missing or fails to load, the corresponding DataFrame will be `None` and endpoints will return 500 errors.

## Adding New APIs

1. Define request model in `models.py` (if needed)
2. Add route in `routes.py` using `@router.get()` or `@router.post()`
3. Import data from `data.py` and constants from `constants.py`

## Key Columns (from main dataset)

- `h3` — H3 level 9 hex ID (15 chars)
- `fips` — County FIPS (int, pad to 5 chars for display)
- `st_damcat` — Occupancy type (RES, COM, IND, PUB)
- `bldgtype` — Building material (W, M, C, S, H)
- `lc_type` — Land cover (13 classes, some with `+` like "urban + crop")
- `clr` — Property color (38 values, includes errors: `foo`, `bar`)
- `clr_cc` — Color count per cell

## Existing Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Sample data (10 rows) |
| GET | `/columns` | Column metadata |
| POST | `/analyze/conditional-probability` | Surprisal scoring |
| POST | `/map/counties` | County-level anomaly GeoJSON |
| POST | `/map/hexes` | H3 hex-level anomaly GeoJSON |
| GET | `/map/neighbor-divergence` | JSD between adjacent counties |
| GET | `/counties` | List all CA counties |
| GET | `/conditioning-options` | Filter options for UI |
| POST | `/compare/counties` | Compare two counties (accepts optional `color_groups` for merged JSD) |
| GET | `/neighbors/{fips}` | Get county neighbors |
| GET | `/c2st/results` | C2ST classifier results |
| GET | `/c2st/pair/{fips_a}/{fips_b}` | C2ST detail for county pair |
| GET | `/bayesian/baseline-distributions` | Baseline distributions by landcover type |
| GET | `/bayesian/stabilized-distributions` | Stabilized distributions (filterable) |
| POST | `/bayesian/map/counties` | County-level map data for Bayesian shrinkage |
| GET | `/bayesian/county/{fips}` | Detailed county shrinkage data with baseline comparison |
| GET | `/bayesian/test-data` | Test endpoint to verify data loading |
| POST | `/map/neighbor-divergence-merged` | Recalculate all pair JSDs with merged colors |
| POST | `/conditional-probability/county/{fips}` | Detailed county surprisal data organized by landcover and color (legacy county-only method) |
| GET | `/conditional-pooling/landcover-types` | Get available landcover types from conditional pooling data |
| POST | `/conditional-pooling/map/counties` | County-level map data for conditional pooling |
| GET | `/conditional-pooling/county/{fips}` | Detailed conditional pooling data for a county |
| GET | `/morans-i/filters` | Get available landcover types and building types |
| POST | `/morans-i/map` | Moran's I spatial autocorrelation map data (GeoJSON, accepts filters) |
| GET | `/morans-i/county/{fips}` | Detailed county statistics with neighbor comparisons |

## M01: Conditional Probability

**Two implementations:**

### Legacy: County-Only Conditional Probability

**Endpoints:**
- `POST /map/counties`: Returns GeoJSON with surprisal metrics by county
- `POST /conditional-probability/county/{fips}`: Returns detailed surprisal data for a specific county

**Request model:**
- `MapRequest`: Contains `context_cols`, `target`, `min_support`

**Response structure (`/conditional-probability/county/{fips}`):**
- Returns data organized by landcover type (if `lc_type` is in context_cols)
- Each landcover includes:
  - `distributions`: Array of color distributions with individual surprisal values per color
  - `total_rows`: Total structures in that landcover
  - `max_surprisal`: Maximum surprisal value
  - `mean_surprisal`: Mean surprisal value
- Colors sorted by surprisal (highest first)
- Returns alpha parameter used in calculation

**Implementation notes:**
- Calculates surprisal using empirical Bayes estimation
- Filters to specific county before computing probabilities
- Uses same alpha estimation and probability calculation logic as `/map/counties`
- Handles cases where landcover is or isn't in context columns
- Supports filtering by landcover type via query parameter

### Conditional Pooling (Neighbor-Pooled)

**Purpose:**
Implements conditional probability analysis with spatial neighbor pooling. Pools data from neighboring counties (K=1: counties that share a border) to stabilize estimates and account for spatial autocorrelation. Compares county-level color distributions to regional (neighbor-pooled) distributions to identify anomalies relative to spatial context.

**Data files (in `website/backend/data/`):**
- `m01_neighbor_pool_county_lc_summary.csv`: Summary table with one row per county × landcover combination
  - Columns: `fips`, `lc_type`, `n_county`, `n_pool`, `num_neighbors`, `kl_div`, `l1_distance`, `top_color`, `top_contrib`
- `m01_neighbor_pool_county_lc_color_detail.csv`: Detail table with one row per county × landcover × color combination
  - Columns: `fips`, `lc_type`, `clr`, `y_county`, `y_pool`, `p_county`, `p_pool`, `contrib`, `abs_diff`

**Endpoints:**
- `GET /conditional-pooling/landcover-types`: Returns available landcover types from conditional pooling data
- `POST /conditional-pooling/map/counties`: Returns GeoJSON with KL divergence or L1 distance metrics by county
- `GET /conditional-pooling/county/{fips}`: Returns detailed conditional pooling data for a specific county

**Request model:**
- `BayesianMapRequest`: Model for map requests with optional `lc_type` and `metric` (`kl_div` or `l1_distance`)

**Response structure (`/conditional-pooling/map/counties`):**
- Returns GeoJSON FeatureCollection with county features
- Each feature includes:
  - `mean_value`: Mean KL divergence or L1 distance (aggregated across landcover types if multiple)
  - `max_value`: Maximum KL divergence or L1 distance
  - `total_exposure`: Total structures in county
  - `num_neighbors`: Number of neighboring counties used in pooling
  - `county_name`: County name
- Statistics: `total_counties`, `mean_value`, `max_value`

**Response structure (`/conditional-pooling/county/{fips}`):**
- Returns data organized by landcover type
- Each landcover includes:
  - `n_county`: County exposure (total structures)
  - `n_pool`: Pooled exposure (county + neighbors)
  - `num_neighbors`: Number of neighbors used
  - `kl_div`: KL divergence (information-theoretic difference)
  - `l1_distance`: L1 distance (intuitive absolute difference)
  - `top_color`: Color contributing most to anomaly
  - `top_contrib`: Top color's KL contribution value
  - `distributions`: Array of color distributions with:
    - `clr`: Color name
    - `y_county`: County count for this color
    - `y_pool`: Pooled count for this color
    - `p_county`: County probability (smoothed)
    - `p_pool`: Pooled probability (smoothed)
    - `contrib`: KL contribution term (p_county * log(p_county / p_pool))
    - `abs_diff`: Absolute difference (|p_county - p_pool|)
- Colors sorted by absolute contribution (highest first)
- Supports filtering by landcover type via query parameter (`?lc_type=...`)**

**Data Loading (`data.py` lines 36-50):**
- `M01_SUMMARY_PATH`: Path to `m01_neighbor_pool_county_lc_summary.csv`
- `M01_DETAIL_PATH`: Path to `m01_neighbor_pool_county_lc_color_detail.csv`
- Both loaded with `try/except` blocks
- FIPS column cast to `Int64` if not already
- Prints success message with row count on successful load
- Prints full traceback on error for debugging
- Sets DataFrame to `None` if loading fails

**Endpoint: `/m01-neighbor-pool/landcover-types` (lines 300-306):**
- Returns unique landcover types from `m01_summary_df`
- Sorted alphabetically
- Returns 500 error if `m01_summary_df` is None

**Endpoint: `/m01-neighbor-pool/map/counties` (lines 309-374):**

**Request:**
- **Method**: POST
- **Path**: `/m01-neighbor-pool/map/counties`
- **Body**: `{ "lc_type": string | null, "metric": "kl_div" | "l1_distance" }`
- **Model**: `BayesianMapRequest` (defined in `models.py`)

**Response:**
- **Success (200)**: GeoJSON FeatureCollection with county features
- **Error (500)**: `{"detail": "M01 data or county geometries not loaded"}` if DataFrames are None
- **Empty (200)**: Empty FeatureCollection if filters return no data

**Process Flow:**
1. **Validation** (line 312):
   - Checks `m01_summary_df is None` → returns 500 error
   - Checks `ca_counties_geojson is None` → returns 500 error
2. **Metric Selection** (line 315):
   - Validates `req.metric` is `"kl_div"` or `"l1_distance"` (defaults to `"kl_div"`)
3. **Data Filtering** (lines 318-320):
   - Starts with full `m01_summary_df`
   - If `lc_filter` provided, filters: `filtered_df.filter(pl.col("lc_type") == lc_filter)`
   - If no rows match, returns empty FeatureCollection
4. **County Aggregation** (lines 336-343):
   - Groups by `fips`: `filtered_df.group_by("fips").agg([...])`
   - Computes per-county metrics:
     - `mean_value`: `pl.col(metric).mean()` - average metric across landcover types
     - `max_value`: `pl.col(metric).max()` - maximum metric value
     - `total_exposure`: `pl.col("n_county").sum()` - total structures
     - `num_neighbors`: `pl.col("num_neighbors").first()` - number of neighbors
5. **GeoJSON Merging** (lines 346-362):
   - Iterates through `ca_counties_geojson["features"]`
   - For each feature:
     - Extracts FIPS: `props.get("fips") or props.get("FIPS")`
     - Falls back to county name: `COUNTY_NAME_TO_FIPS.get(county_name)`
     - Converts to integer: `int(fips_str.lstrip("0"))` or `int(fips_str)`
     - Looks up in `county_agg`: `county_agg.filter(pl.col("fips") == fips_int)`
     - If match found: Updates feature properties with metrics
     - Adds to `features` array and `values` array
6. **Response Building** (lines 364-374):
   - Returns GeoJSON with updated features
   - Includes statistics: `total_counties`, `mean_value`, `max_value`

**FIPS Matching Logic** (lines 346-362):
- Uses `feature.get("properties", {})` for safe access
- Checks both `props.get("fips")` and `props.get("FIPS")` (case-insensitive)
- Falls back to `COUNTY_NAME_TO_FIPS` mapping if FIPS missing
- Converts to integer: `int(fips_str.lstrip("0"))` if zero-padded, else `int(fips_str)`
- Skips features with invalid/missing FIPS (continues loop)
- Only includes features that have matching data in `county_agg`

**Error Handling**: 
- Returns empty FeatureCollection if no data matches filters (line 324-335)
- Returns 500 error if DataFrames not loaded (line 312-313)
- Skips features with invalid FIPS (no error, just continues)

**Endpoint: `/m01-neighbor-pool/county/{fips}` (lines 377-441):**
- **Location**: `routes.py` lines 377-441
- **Request**: GET with optional `?lc_type=...` query parameter
- **Process**:
  1. Checks if `m01_summary_df` and `m01_detail_df` are loaded (returns 500 if not)
  2. Converts FIPS string to integer (handles zero-padding)
  3. Filters both DataFrames by FIPS and optional `lc_type`
  4. Groups data by landcover type
  5. For each landcover:
     - Gets summary row (one row per county×landcover)
     - Gets detail rows (multiple rows per county×landcover×color)
     - Builds distributions array with all color details
     - Sorts distributions by absolute contribution (highest first)
  6. Returns structured response with county name and by_landcover array
- **Response Structure**: See endpoint documentation above

**Key Implementation Notes:**
- **Neighbor pooling**: Each county's pool includes itself plus counties that share a border (K=1 neighbors)
- **Smoothing**: Uses Dirichlet prior with α = 1.0 to avoid infinite surprisal
- **Metrics**:
  - KL divergence: Information-theoretic difference between county and pooled distributions
  - L1 distance: More intuitive measure of absolute difference (0.5 * sum(|p_county - p_pool|))
- **Map aggregation**: When multiple landcover types exist, aggregates by averaging KL divergence or L1 distance
- **FIPS handling**: Converts integer FIPS to zero-padded strings for GeoJSON matching
- **Data loading**: Loads CSVs at startup, casts FIPS to Int64 for consistency
- **Error handling**: All endpoints check for None DataFrames and return appropriate HTTP errors
- **Code organization**: Clean, minimal error handling and logging

## M02: Empirical Bayes Pooling

**Purpose:**
Backend support for Bayesian shrinkage analysis visualization.

**Data files (in `backend/data/`):**
- `bayesian_baseline_df`: Landcover-specific baseline distributions (421 rows)
- `bayesian_stabilized_df`: County-level stabilized distributions with shrinkage metrics (4,493 rows)
- `bayesian_counts_df`: Aggregated counts by county × landcover × category

**Endpoints:**
- `GET /bayesian/baseline-distributions`: Returns baseline distributions by landcover type
- `GET /bayesian/stabilized-distributions`: Returns stabilized distributions (filterable)
- `POST /bayesian/map/counties`: Returns GeoJSON with shrinkage statistics merged into county features
- `GET /bayesian/county/{fips}`: Returns detailed county shrinkage data organized by landcover

**Request model:**
- `BayesianMapRequest`: Model for map requests with optional `lc_type`, `metric`, and `color_category` filters

**Key metrics available:**
- `movement`: Signed change from observed to stabilized (Δ = stabilized - observed)
- `abs_movement`: Absolute movement (|Δ|) - shows magnitude of shrinkage
- `shrinkage_weight`: Weight given to observed data (w = N/(N+α))
- `exposure`: Total structures per county × landcover combination
- `observed_prop`: Original observed proportion
- `stabilized_prop`: Shrunken proportion after Bayesian shrinkage
- `baseline_prop`: Landcover-specific baseline proportion

**Implementation details:**
- **Landcover name normalization**: Handles `+` characters in landcover names (e.g., "urban + crop")
  - Frontend sends URL-encoded values (spaces become `+`)
  - Backend normalizes by replacing spaces with `+` for consistent matching
  - Applied in both GET (query param) and POST (JSON body) endpoints
- **Map endpoint** (`/bayesian/map/counties`):
  - Merges shrinkage statistics with existing county GeoJSON
  - Aggregates by county (mean/max values, total exposure, top color change)
  - Always filters by `lc_type` if provided
  - Returns GeoJSON with `mean_value`, `max_value`, `total_exposure`, `mean_shrinkage_weight`, `top_color`, `top_movement` in feature properties
- **County detail endpoint** (`/bayesian/county/{fips}`):
  - Aggregates data by landcover type for easy comparison
  - Returns baseline distributions for comparison
  - Filters by `lc_type` if provided in query parameter
  - Returns distributions sorted by movement (signed) for each color

**Visualization guidance:**
- **Exposure bins**: < 5, 5-10, 10-20, 20-50, 50-100, 100+ structures
- **Key patterns**:
  - Low exposure (< 20): High absolute movement (0.05-0.31), low shrinkage weight (0.24-0.61)
  - High exposure (100+): Low absolute movement (~0.001), high shrinkage weight (~0.99)

## M03: Neighbor Divergence

**Purpose:**
Backend support for interactive color grouping that lets users pool similar colors and recalculate JSD between counties.

**Endpoints:**
- `GET /map/neighbor-divergence`: Returns GeoJSON with JSD values for adjacent county pairs
- `POST /compare/counties`: Compares two counties with optional color grouping
- `POST /map/neighbor-divergence-merged`: Recalculates all pair JSDs with merged colors

**Models in `models.py`:**
```python
class ColorGroupMapping(BaseModel):
    name: str
    colors: list[str]

class ColorGroupedCompareRequest(BaseModel):
    fips_a: str
    fips_b: str
    conditions: list[ConditionFilter] | None = None
    color_groups: list[ColorGroupMapping] | None = None

class ColorGroupedDivergenceRequest(BaseModel):
    color_groups: list[ColorGroupMapping]
```

**Utility in `utils.py`:**
```python
def apply_color_mapping(color_counts: dict, color_groups: list) -> dict:
    """Merge color counts according to groupings."""
```

**Response additions for `/compare/counties`:**
- `jsd.original`: Original JSD value
- `jsd.merged`: JSD after merging colors (if `color_groups` provided)
- `jsd.reduction`: Absolute reduction in JSD
- `jsd.reduction_pct`: Percentage reduction
- `county_a.clr_merged` / `county_b.clr_merged`: Merged color distributions

**`/map/neighbor-divergence-merged` response:**
Same structure as `/map/neighbor-divergence` but with JSD values recalculated using merged color groups.

## M04: C2ST (Classifier Two-Sample Test)

**Purpose:**
Backend support for C2ST classifier results visualization.

**Data files:**
- `c2st_df`: Precomputed C2ST results by land cover (loaded from `c2st_results_all_lc.csv`)

**Endpoints:**
- `GET /c2st/results`: Returns C2ST results for all county pairs
- `GET /c2st/pair/{fips_a}/{fips_b}`: Returns detailed C2ST comparison for a specific pair

**Response structure (`/c2st/results`):**
- Returns GeoJSON with C2ST accuracy scores for adjacent county pairs
- Each feature represents an edge/path between two counties
- Properties include: `fips_a`, `fips_b`, `accuracy`, `landcover_type`

**Response structure (`/c2st/pair/{fips_a}/{fips_b}`):**
- Returns detailed comparison including:
  - Both counties' color distributions
  - C2ST accuracy score
  - Classification result (which county was predicted)
  - Landcover type filter (if applicable)

**Implementation notes:**
- Data is precomputed, so endpoints are read-only
- Supports filtering by landcover type
- Accuracy scores range from 0.5 (random) to 1.0 (perfect separation)

## M05: Moran's I

**Purpose:**
Backend support for Moran's I spatial autocorrelation visualization using relative frequency data.

**Data files:**
- `morans_i_freq_df`: Relative frequencies by county, landcover type, and building type (loaded from `relative_frequencies_lc_type_bldgtype.csv`)
  - Columns: `fips` (Int64), `lc_type` (str), `bldgtype` (str), `freq` (Float64)
  - Location: `website/backend/data/relative_frequencies_lc_type_bldgtype.csv`

**Endpoints:**
- `GET /morans-i/filters`: Returns available landcover types and building types for filtering
- `POST /morans-i/map`: Returns GeoJSON with calculated Local Moran's I scores (accepts `lc_type` and `bldgtype` filters)
- `GET /morans-i/county/{fips}`: Returns detailed county statistics with neighbor comparisons (accepts optional `lc_type` and `bldgtype` query parameters)

**Implementation details:**
- **Data loading** (`data.py`):
  - Loads `relative_frequencies_lc_type_bldgtype.csv` into `morans_i_freq_df`
  - Casts `fips` to `Int64` and `freq` to `Float64`
- **Moran's I calculation** (`utils.py::calculate_local_morans_i`):
  - Calculates Local Moran's I from frequency values using neighbor relationships
  - Formula: `I_i = (x_i - x̄) / s² * Σ(w_ij * (x_j - x̄))`
  - Uses `neighbors_df` to identify county neighbors
  - Aggregates frequencies by county when filters are applied
- **Map endpoint** (`POST /morans-i/map`):
  - Accepts `MoransIMapRequest` with optional `lc_type` and `bldgtype` filters
  - Filters frequency data by selected criteria
  - Aggregates frequencies per county (mean if multiple categories match)
  - Calculates Local Moran's I scores for each county
  - Returns GeoJSON with `local` property and statistics
- **County detail endpoint** (`GET /morans-i/county/{fips}`):
  - Returns frequency breakdown by `lc_type` × `bldgtype` combinations
  - For each category, includes:
    - County frequency
    - Neighbor mean, min, max frequencies
    - Neighbor count
  - Filters neighbor data by same `lc_type`/`bldgtype` if provided
- **FIPS matching**:
  - Converts integer FIPS to zero-padded strings (`"06001"`) for lookup
  - Matches against GeoJSON features using `feature.properties.fips` or `feature.properties.FIPS`
  - Falls back to matching by county name via `COUNTY_NAME_TO_FIPS` mapping

**Response structures:**
- `/morans-i/filters`: `{ "landcover_types": [...], "building_types": [...] }`
- `/morans-i/map`: GeoJSON with `local` property and `stats` object
- `/morans-i/county/{fips}`: `{ "fips": str, "county_name": str, "num_neighbors": int, "by_category": [...], "total_categories": int }`

**File locations:**
- Data loading: `website/backend/data.py` (lines 13, 28-38)
- Calculation function: `website/backend/utils.py` (lines 214-270)
- Endpoints: `website/backend/routes.py` (lines 1356-1500)
- Request model: `website/backend/models.py` (lines 49-51)

## Running

**With uv (recommended):**
```bash
cd backend
uv sync
source .venv/bin/activate
uv run main.py # runs on port 8000
```

**With pip:**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install fastapi uvicorn polars httpx scipy h3
python main.py  # runs on port 8000
```

**Important**: After adding new routes or data files, restart the backend server for changes to take effect. If you see 404 errors for new endpoints, the server likely needs to be restarted.

## Troubleshooting

**Common issues:**

- **404 errors**: Restart the backend server after adding new routes
- **500 errors "M01 data or county geometries not loaded"**:
  - **Cause**: `m01_summary_df` is `None` or `ca_counties_geojson` is `None`
  - **Check**: Look at server startup logs for M01 data loading messages
  - **Solution**: 
    1. Verify files exist: `website/backend/data/m01_neighbor_pool_county_lc_summary.csv` and `m01_neighbor_pool_county_lc_color_detail.csv`
    2. Check file permissions (readable)
    3. Restart backend server (data loads at startup)
    4. Check for error messages in console during startup (should show traceback if loading fails)
- **Data loading fails**: 
  - Check that all CSV files exist in `website/backend/data/` folder
  - Verify file paths in `data.py` are correct
  - Check server startup logs for loading errors
  - Ensure Polars can read the CSV files (check encoding, delimiters)
- **FIPS matching issues**: 
  - Ensure FIPS codes are in correct format (zero-padded strings for GeoJSON matching)
  - Check that `ca_counties_geojson` is loaded (check `main.py` lifespan function)
  - Verify FIPS conversion logic in endpoints matches GeoJSON format
- **Landcover names with `+`**: Backend normalizes spaces to `+` for consistent matching
- **Empty map results**: 
  - Check if filters are too restrictive (no data matches)
  - Verify FIPS matching is working (check endpoint logs)
  - Ensure `m01_summary_df` has data for selected landcover type

**Debug endpoints:**
- `GET /bayesian/test-data`: Verify Bayesian data loading
- `GET /morans-i/test`: Verify Moran's I data loading and FIPS matching
- Check server startup logs for M01 data loading status (should print row counts)

**M01-Specific Troubleshooting:**

**Error: "M01 data or county geometries not loaded" (500 error)**
- **Location**: `routes.py` line 312 in `get_m01_map_counties()`
- **Check**: 
  1. Server startup logs should show: `M01 summary data loaded: 470 rows` and `M01 detail data loaded: [number] rows`
  2. If you see warnings instead, check the error message and traceback
  3. Verify files exist: `website/backend/data/m01_neighbor_pool_county_lc_summary.csv` and `m01_neighbor_pool_county_lc_color_detail.csv`
- **Common causes**:
  - Server not restarted after adding M01 data loading code
  - CSV files missing or in wrong location
  - CSV parsing errors (check file encoding, delimiters)
  - File permissions (must be readable)
- **Solution**: 
  1. Verify files exist and are readable
  2. Restart backend server (data loads at startup)
  3. Check console output for loading messages or errors
  4. If errors persist, check `data.py` lines 36-50 for the exact error message

**Error: Empty map or no features returned**
- **Location**: `routes.py` line 346-362 (FIPS matching loop)
- **Check**: 
  1. Verify `ca_counties_geojson` is loaded (check `main.py` lifespan function)
  2. Check if FIPS matching is working (features might be skipped if FIPS don't match)
  3. Verify `m01_summary_df` has data for the selected filters
- **Common causes**:
  - FIPS format mismatch between CSV (integer) and GeoJSON (string)
  - Landcover filter too restrictive (no matching data)
  - County aggregation returns empty results
- **Solution**:
  1. Check FIPS conversion logic (lines 348-349)
  2. Try without landcover filter first
  3. Verify data exists in `m01_summary_df` for test counties

**Data File Verification:**
To verify M01 data files are correct, check:
- File exists: `website/backend/data/m01_neighbor_pool_county_lc_summary.csv`
- File exists: `website/backend/data/m01_neighbor_pool_county_lc_color_detail.csv`
- Summary CSV columns: `fips`, `lc_type`, `n_county`, `n_pool`, `num_neighbors`, `kl_div`, `l1_distance`, `top_color`, `top_contrib`
- Detail CSV columns: `fips`, `lc_type`, `clr`, `y_county`, `y_pool`, `p_county`, `p_pool`, `contrib`, `abs_diff`
- FIPS column should be integer (will be cast to Int64 on load)

**Data Loading Verification:**
When server starts, you should see console output like:
```
M01 summary data loaded: 470 rows
M01 detail data loaded: [number] rows
```
If you see warnings or errors, check the traceback for details.

## Data Loading Patterns

**Standard pattern:**
```python
# In data.py
try:
    df = pl.read_csv(PATH)
    # Type casting if needed
    if df["column"].dtype != pl.Int64:
        df = df.with_columns(pl.col("column").cast(pl.Int64))
except Exception as e:
    print(f"Warning: Could not load data: {e}")
    df = None
```

**For large/complex CSVs:**
- Use `infer_schema_length=1` to speed up initial parsing
- Use `.select()` to load only needed columns
- Exclude problematic columns (e.g., long WKT geometry strings) if not needed

**FIPS code handling:**
- Main dataset: Integer FIPS (e.g., `6001`)
- GeoJSON: String FIPS, often zero-padded (e.g., `"06001"`)
- Conversion pattern: `str(fips).zfill(5)` to match GeoJSON format

**M01 Data Loading Process:**

**Startup Sequence:**
1. `main.py` starts FastAPI app
2. `data.py` module is imported (triggers data loading)
3. `M01_SUMMARY_PATH` and `M01_DETAIL_PATH` are set (lines 14-15)
4. Try/except blocks attempt to load CSVs (lines 36-50)
5. If successful: DataFrames are created, FIPS cast to Int64, success message printed
6. If failed: DataFrame set to `None`, error message and traceback printed
7. Server continues startup (doesn't fail if M01 data missing)
8. Endpoints check for `None` and return 500 errors if data not loaded

**Expected Console Output (on successful load):**
```
M01 summary data loaded: 470 rows
M01 detail data loaded: [number] rows
```

**If Loading Fails:**
- Console will show: `Error: Could not load M01 summary data from [path]: [error message]`
- Full traceback will be printed
- `m01_summary_df` or `m01_detail_df` will be `None`
- Endpoints will return 500 errors with message "M01 data or county geometries not loaded"

**Verification Steps:**
1. Check server startup console for M01 loading messages
2. Verify file paths in `data.py` lines 14-15 match actual file locations
3. Test CSV reading manually: `python -c "import polars as pl; df = pl.read_csv('website/backend/data/m01_neighbor_pool_county_lc_summary.csv'); print(df.shape)"`
4. Check file permissions (must be readable)
5. Verify CSV format (should have expected columns, proper encoding)
