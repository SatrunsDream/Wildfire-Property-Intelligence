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

Data is loaded at startup in `data.py` as Polars DataFrames: `df`, `neighbors_df`, `c2st_df`, `bayesian_baseline_df`, `bayesian_stabilized_df`, `bayesian_counts_df`.

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
- `lc_type` — Land cover (13 classes)
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

## M02: Empirical Bayes Pooling

**Purpose:**
Backend support for Bayesian shrinkage analysis visualization.

**Data files (in `backend/data/`):**
- `bayesian_baseline_df`: Landcover-specific baseline distributions (421 rows)
- `bayesian_stabilized_df`: County-level stabilized distributions with shrinkage metrics (4,493 rows)
- `bayesian_counts_df`: Aggregated counts by county × landcover × category

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

**Visualization guidance (from Bayesian shrinkage methodology):**
- **Exposure bins**: < 5, 5-10, 10-20, 20-50, 50-100, 100+ structures
- **Key patterns to visualize**:
  - Low exposure (< 20): High absolute movement (0.05-0.31), low shrinkage weight (0.24-0.61)
  - High exposure (100+): Low absolute movement (~0.001), high shrinkage weight (~0.99)
- **Comparison plots**: Baseline vs Observed vs Stabilized distributions side-by-side
- **Map visualization**: Color counties by mean absolute movement or shrinkage weight to show where shrinkage had most impact

**Implementation notes:**
- Map endpoint merges shrinkage statistics with existing county GeoJSON
- County detail endpoint aggregates data by landcover type for easy comparison
- All endpoints handle missing data gracefully
- Error handling added throughout for better debugging

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

**Important**: After adding new routes or data files, restart the backend server for changes to take effect. If you see 404 errors for `/bayesian/*` endpoints, the server likely needs to be restarted.

**Troubleshooting**:
- If endpoints return 404: Restart the backend server
- If data loading fails: Check that all CSV files exist in `backend/data/` folder
- Test data loading: Visit `http://localhost:8000/bayesian/test-data` to verify data files are loaded

## M03: Interactive Color Pooling for Neighbor Divergence

**Purpose:**
Backend support for interactive color grouping that lets users pool similar colors and recalculate JSD between counties.

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
