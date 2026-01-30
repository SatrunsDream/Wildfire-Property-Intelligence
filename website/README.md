# California Property Anomaly Detection

Web application for visualizing anomaly detection results on California property data.

## Structure

```
website/
├── backend/     # FastAPI server (Python)
└── frontend/    # React app (TypeScript)
```

## Quick Start

### 1. Start Backend

```bash
cd backend

# If you're using uv
uv sync && source .venv/bin/activate

# If you're using pip
python -m venv .venv && source .venv/bin/activate
pip install fastapi uvicorn polars httpx scipy h3

# Run
python main.py
# or
uv run main.py
```

Backend runs at http://localhost:8000

### 2. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at http://localhost:5173

## Detection Methods

| Page | Description |
|------|-------------|
| M01: Conditional Probability | Surprisal scoring for property attributes |
| M02: Empirical Bayes Pooling | Bayesian shrinkage visualization: baseline vs stabilized distributions |
| M03: Neighbor Divergence | Jensen-Shannon divergence between adjacent counties |
| M04: C2ST | Classifier two-sample test results |

## Tech Stack

**Backend**: FastAPI, Polars, H3, SciPy
**Frontend**: React 19, TypeScript, Vite, MapLibre GL, D3.js

## Data

The backend expects data files in `backend/data/`:
- `Capstone2025_nsi_lvl9_with_landcover_and_color.csv` (main dataset)
- `ca_county_neighbors.csv` (county adjacency)
- `c2st_results_all_lc.csv` (C2ST results)
- `bayesian_shrinkage_baseline_distributions.csv` (baseline distributions)
- `bayesian_shrinkage_stabilized_distributions.csv` (stabilized distributions)
- `bayesian_shrinkage_aggregated_counts.csv` (aggregated counts)

Set custom paths via environment variables `DATA_PATH`, `NEIGHBORS_PATH`, `C2ST_PATH`, `BAYESIAN_BASELINE_PATH`, `BAYESIAN_STABILIZED_PATH`, and `BAYESIAN_COUNTS_PATH`.
