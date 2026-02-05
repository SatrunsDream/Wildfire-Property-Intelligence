# AGENTS Guidelines for Backend

## File Structure

| File | Purpose |
|------|---------|
| `main.py` | FastAPI app entry point, CORS config, lifespan (loads GeoJSON) |
| `routes.py` | All API endpoints — **add new endpoints here** |
| `models.py` | Pydantic request models — **add new request schemas here** |
| `data.py` | Data loading (Polars DataFrames) — **add new data sources here** |
| `constants.py` | FIPS mappings, column metadata, H3 levels, URLs |
| `utils.py` | Helper functions (Bayesian smoothing, H3 aggregation, GeoJSON builders) |

## Data Files

All data files are located in `backend/data/` folder:

| File | Description | Location |
|------|-------------|----------|
| `Capstone2025_nsi_lvl9_with_landcover_and_color.csv` | Main dataset (~2.4M rows) | `backend/data/` |
| `ca_county_neighbors.csv` | County adjacency pairs | `backend/data/` |
| `c2st_results_all_lc.csv` | Precomputed C2ST results by land cover | `backend/data/` |
| `bayesian_shrinkage_baseline_distributions.csv` | Landcover-specific baseline distributions (421 rows) | `backend/data/` |
| `bayesian_shrinkage_stabilized_distributions.csv` | County-level stabilized distributions with shrinkage metrics (4,493 rows) | `backend/data/` |
| `bayesian_shrinkage_aggregated_counts.csv` | Aggregated counts by county × landcover × category | `backend/data/` |
| `morans_i_homogeneity.csv` | Moran's I local scores by county (FIPS, local, geometry) | `backend/data/` |

Data is loaded at startup in `data.py` as Polars DataFrames: `df`, `neighbors_df`, `c2st_df`, `bayesian_baseline_df`, `bayesian_stabilized_df`, `bayesian_counts_df`, `morans_i_df`.

**Note**: All Bayesian shrinkage data files must be present in `backend/data/` for M02 to work. The backend will fail to start if these files are missing.

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
| POST | `/conditional-probability/county/{fips}` | Detailed county surprisal data organized by landcover and color |
| GET | `/morans-i/map` | Moran's I spatial autocorrelation map data (GeoJSON) |
| GET | `/morans-i/test` | Debug endpoint to verify Moran's I data loading |

## M01: Conditional Probability

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
Backend support for Moran's I spatial autocorrelation visualization.

**Data files:**
- `morans_i_df`: Moran's I local scores by county (loaded from `morans_i_homogeneity.csv`)
  - Columns: `fips` (Int64), `local` (Float64)
  - **Note**: Geometry column is excluded during loading to avoid parsing issues with long WKT strings

**Endpoints:**
- `GET /morans-i/map`: Returns GeoJSON with Moran's I local scores merged into county features
- `GET /morans-i/test`: Debug endpoint to verify data loading

**Implementation details:**
- **Data loading** (`data.py`):
  - Uses `pl.read_csv(MORANS_I_PATH, infer_schema_length=1).select(["fips", "local"])` to explicitly exclude geometry column
  - Casts `fips` to `Int64` and `local` to `Float64`
  - Geometry column is not loaded (not needed, GeoJSON already has geometries)
- **FIPS matching** (`/morans-i/map`):
  - Converts integer FIPS from `morans_i_df` to zero-padded strings (`"06001"`) for lookup
  - Matches against GeoJSON features using `feature.properties.fips` or `feature.properties.FIPS`
  - Falls back to matching by county name via `COUNTY_NAME_TO_FIPS` mapping
  - Merges `local` scores into GeoJSON feature properties
- **Response structure**:
  - Returns GeoJSON with `local` property added to each county feature
  - Includes statistics: `total_counties`, `mean_local`, `max_local`, `min_local`, `std_local`

**Troubleshooting:**
- If map is empty: Check FIPS matching logic (ensure zero-padded strings match GeoJSON format)
- If data fails to load: Verify CSV file exists and has correct columns (`fips`, `local`)
- Use `/morans-i/test` endpoint to debug data loading and FIPS matching

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
- **Data loading fails**: Check that all CSV files exist in `backend/data/` folder
- **FIPS matching issues**: Ensure FIPS codes are in correct format (zero-padded strings for GeoJSON matching)
- **Landcover names with `+`**: Backend normalizes spaces to `+` for consistent matching

**Debug endpoints:**
- `GET /bayesian/test-data`: Verify Bayesian data loading
- `GET /morans-i/test`: Verify Moran's I data loading and FIPS matching

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
