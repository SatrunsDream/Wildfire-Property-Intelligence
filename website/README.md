# Wildfire Property Intelligence

Interactive dashboard for visualizing anomaly detection results on California property data.

## Structure

```
website/
├── frontend/        # React app (TypeScript + Vite) — the entire application
├── _archive/
│   └── backend/
└── README.md
```

The frontend is a fully static app. All data is precomputed and shipped as JSON files in `frontend/public/data/`.

---

## Quick Start (local dev)

```bash
cd frontend
npm install
npm run dev
```

App runs at http://localhost:5173

---

## Regenerating the static JSON data

The JSON files in `frontend/public/data/` are precomputed from the raw CSVs. If you need to regenerate them:

```bash
cd _archive/backend

# Install dependencies (requires uv or pip)
uv sync
# or: pip install fastapi polars httpx numpy scipy h3

# Add the main dataset (gitignored, ~200 MB)
# Place Capstone2025_nsi_lvl9_with_landcover_and_color.csv in _archive/backend/data/

# Run the export scripts
python export_all.py
python export_neighbor_divergence.py
python export_neighbor_divergence_pooled.py
```

Outputs are written directly to `frontend/public/data/`.

---

## Static data files

| File | Description |
|------|-------------|
| `morans-freq.json` | Relative frequencies by land cover × building type |
| `ca-county-neighbors.json` | County adjacency list |
| `conditional-pooling-summary.json` | Neighbor-pooled conditional probability summary |
| `conditional-pooling-detail.json` | Per-color conditional probability detail |
| `bayesian-baseline.json` | Statewide baseline color distributions |
| `bayesian-stabilized.json` | Empirical Bayes stabilized distributions |
| `c2st-results.json` | C2ST classifier results with county centroids |
| `group-divergence.json` | Group-level JSD anomaly scores + CA county GeoJSON |
| `county-colors.json` | Per-county color distributions vs. baseline |
| `county-pair-comparisons.json` | Adjacent county pair color distributions |
| `neighbor-divergence-map.json` | Neighbor JSD map data (raw colors) |
| `neighbor-divergence-map-pooled.json` | Neighbor JSD map data (grouped colors) |

---

## Detection methods

| Page | Method |
|------|--------|
| Conditional Pooling | Surprisal scoring conditioned on land cover, with neighbor pooling |
| Empirical Bayes | Bayesian shrinkage — baseline vs. stabilized distributions |
| Neighbor Divergence | Jensen–Shannon divergence between adjacent county color distributions |
| C2ST | Classifier two-sample test accuracy across neighboring county pairs |
| Moran's I | Local spatial autocorrelation of structural characteristics |
| Group Divergence | Per-county JSD relative to statewide baseline |
