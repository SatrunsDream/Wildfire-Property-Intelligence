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

| File | Description |
|------|-------------|
| `data/Capstone2025_nsi_lvl9_with_landcover_and_color.csv` | Main dataset (~2.4M rows) |
| `data/ca_county_neighbors.csv` | County adjacency pairs |
| `data/c2st_results_all_lc.csv` | Precomputed C2ST results by land cover |

Data is loaded at startup in `data.py` as Polars DataFrames: `df`, `neighbors_df`, `c2st_df`.

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
| POST | `/compare/counties` | Compare two counties |
| GET | `/neighbors/{fips}` | Get county neighbors |
| GET | `/c2st/results` | C2ST classifier results |
| GET | `/c2st/pair/{fips_a}/{fips_b}` | C2ST detail for county pair |

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
