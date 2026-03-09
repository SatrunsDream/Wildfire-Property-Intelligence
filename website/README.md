# Wildfire Property Intelligence

Interactive dashboard for exploring anomaly detection results on California property data. The repo contains the main dashboard, a narrative case study, static public assets, and the archived backend export scripts used to generate the frontend JSON.

## Problem Description

Wildfires are a major source of property loss in California, and inaccurate large-scale property inventories can distort the risk models used by insurers, planners, and policymakers. This project studies how to detect inconsistent or erroneous county-level property characteristics in aggregated NSI data, with a focus on distinguishing true structural variation from sparsity, heterogeneity, and reporting differences.

## Structure

```text
website/
├── frontend/        # React app (TypeScript + Vite) — dashboard and /viz case study
├── _archive/
│   └── backend/     # export scripts and source data
└── README.md
```

The frontend is a fully static app. Precomputed data is shipped in `frontend/public/data/`.

## Environment and Dependencies

Recommended local environment:

- Node.js 20+ with npm for the frontend
- Python 3.12+ for the archived backend export scripts
- `uv` recommended for Python dependency management

Primary frontend dependencies are defined in `frontend/package.json` and `frontend/package-lock.json`.
Key frontend packages currently include:

- `react` `^19.2.0`
- `vite` `^7.2.4`
- `typescript` `~5.9.3`
- `maplibre-gl` `^5.16.0`
- `d3` `^7.9.0`
- `recharts` `^2.15.4`

Archived backend dependencies are defined in `_archive/backend/pyproject.toml`.
Key backend packages currently include:

- `fastapi[standard] >=0.128.0`
- `polars >=1.37.1`
- `numpy >=2.4.1`
- `scipy >=1.14.0`
- `h3 >=3.7.0`

## Quick Start

```bash
cd frontend
npm install
npm run dev
```

App runs at `http://localhost:5173`.

Production commands:

```bash
cd frontend
npm run build
npm run preview
```

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

Expected outputs from regeneration include refreshed copies of:

- `conditional-pooling-summary.json`
- `conditional-pooling-detail.json`
- `bayesian-baseline.json`
- `bayesian-stabilized.json`
- `c2st-results.json`
- `group-divergence.json`
- `neighbor-divergence-map.json`
- `neighbor-divergence-map-pooled.json`

These JSON artifacts are what the frontend loads for the interactive maps and charts.

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

## Validation and Reproducibility

Frontend checks:

```bash
cd frontend
npm run build
npm run lint
```

Backend/data regeneration:

```bash
cd _archive/backend
python export_all.py
python export_neighbor_divergence.py
python export_neighbor_divergence_pooled.py
```

Reproducibility artifacts available in the repo:

- precomputed JSON outputs in `frontend/public/data/`
- final report in `frontend/public/images/capstone_paper.pdf`
- poster in `frontend/public/images/capstone_poster.pdf`

## Future Work

- Extend the analysis beyond California to a broader geographic scope
- Refine the greedy color-pooling procedure, since early merges are currently irreversible and may block better later groupings
- Study hyperparameter sensitivity more formally instead of relying on manual inspection
- Test grouping strategies separately within structural contexts such as damage category, building type, and land cover
- Incorporate evidence from non-neighboring counties that share similar structural patterns, not just adjacent counties
