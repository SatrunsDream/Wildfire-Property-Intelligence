# Wildfire Property Intelligence

Interactive dashboard for exploring anomaly detection results on California property data. The repo contains the main dashboard, a narrative case study, static public assets, and the archived backend export scripts used to generate the frontend JSON.

## Structure

```text
website/
├── frontend/        # React app (TypeScript + Vite) — dashboard and /viz case study
├── _archive/
│   └── backend/     # export scripts and source data
└── README.md
```

The frontend is a fully static app. Precomputed data is shipped in `frontend/public/data/`.

## Quick Start

```bash
cd frontend
npm install
npm run dev
```

App runs at `http://localhost:5173`.

---

## Regenerating Static JSON Data

The JSON files in `frontend/public/data/` are generated from source data in `_archive/backend/data/`.

```bash
cd _archive/backend

# Install dependencies (requires uv or pip)
uv sync
# or: pip install fastapi polars httpx numpy scipy h3

# If needed, decompress the checked-in dataset:
# gunzip data/Capstone2025_nsi_lvl9_with_landcover_and_color.csv.gz

# Or provide a raw CSV at:
# data/Capstone2025_nsi_lvl9_with_landcover_and_color.csv

# Run the export scripts
python export_all.py
python export_neighbor_divergence.py
python export_neighbor_divergence_pooled.py
```

Outputs are written directly to `frontend/public/data/`.

## Static Data Files

| File | Description |
|------|-------------|
| `bayesian-baseline.json` | Statewide baseline color distributions |
| `bayesian-stabilized.json` | Empirical Bayes stabilized distributions |
| `c2st-results.json` | C2ST classifier results with county centroids |
| `ca-county-neighbors.json` | County adjacency list |
| `case_study_sd_region.json` | San Diego regional case study data |
| `color-pool-merge-tree.json` | Color merge tree used for pooling visualization |
| `conditioning-options.json` | Available conditioning dimensions and values |
| `conditional-pooling-detail.json` | Per-color conditional probability detail |
| `conditional-pooling-summary.json` | Neighbor-pooled conditional probability summary |
| `county-colors.json` | Per-county color distributions vs. baseline |
| `county-pair-comparisons.json` | Adjacent county pair color distributions |
| `group-divergence.json` | Group-level JSD anomaly scores plus CA county GeoJSON |
| `h3-color-cells.json` | H3 color cell data for the distribution map |
| `morans-freq.json` | Relative frequencies by land cover × building type |
| `neighbor-divergence-map.json` | Neighbor JSD map data (raw colors) |
| `neighbor-divergence-map-pooled.json` | Neighbor JSD map data (grouped colors) |
| `neighbor-jsd-pooled-greedy.json` | Greedy-pooled neighbor JSD results used in the case study |

## Public Assets

Files in `frontend/public/images/`:

- `capstone_paper.pdf` - final report
- `capstone_poster.pdf` - project poster
- `groupings.png` - color grouping image

## Pages and Methods

| Page | Description |
|------|-------------|
| Home | Project overview, methods summary, results, references, and links to report/poster/repo |
| Case Study (`/viz`) | Narrative walkthrough of the San Diego regional example |
| Conditional Pooling | Surprisal scoring conditioned on land cover, with neighbor pooling |
| Empirical Bayes | Bayesian shrinkage between observed and baseline distributions |
| Neighbor Divergence | Jensen-Shannon divergence between adjacent county color distributions |
| Group Divergence | Per-county JSD relative to the statewide baseline |
| C2ST | Classifier two-sample test accuracy across neighboring county pairs |
| Moran's I | Local spatial autocorrelation of structural characteristics |
| Color Distribution Map | H3-level exploration of color distributions |
