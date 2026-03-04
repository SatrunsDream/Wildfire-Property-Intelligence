# Wildfire Property Intelligence

Exploratory analysis and comparative evaluation of statistical and spatial methods to detect and correct reporting inconsistencies in aggregated NSI property data for wildfire risk applications.

---

## Problem Description

California county property data exhibits systematic reporting differences: error tokens (e.g., "foo", "bar"), duplicate color names (grey/gray, green/verde), and county-specific color vocabularies. Raw frequency-based anomaly detection over-flags rural and low-exposure areas due to sparsity. This project identifies whether apparent anomalies are genuine data quality issues or systematic county-level reporting differences. Methods include empirical Bayes shrinkage, conditional probability with neighbor pooling, Jensen-Shannon divergence, and clustering of color categories.

---

## Environment Setup

**Python 3.10 or later** is required. Create and activate a virtual environment:

```
python -m venv .venv
.venv\Scripts\activate          # Windows
source .venv/bin/activate      # macOS / Linux
```

---

## Dependencies

### Python (for notebooks and analysis)

Install from `requirements.txt`:

```
pip install -r requirements.txt
```

Key packages and tested versions:
- pandas >= 2.0
- numpy >= 2.0
- scipy >= 1.14
- matplotlib >= 3.10
- geopandas >= 1.0
- h3 >= 3.7
- shapely >= 2.0
- jupyter >= 1.0

Optional for backend: `polars>=1.37`, `fastapi>=0.128`

### Node.js (for website frontend)

Node.js 18+ is required for the frontend. Dependencies are in `website/frontend/package.json`.

---

## Dataset Access

The primary dataset is **not** included in this repository.

**Required file:**
- `Capstone2025_nsi_lvl9_with_landcover_and_color.csv` or `.csv.gz`

**Placement:** Put the file in the `dataset/` directory at the project root:

```
dataset/
  Capstone2025_nsi_lvl9_with_landcover_and_color.csv.gz
  ca_county_neighbors.csv
```

`ca_county_neighbors.csv` is used for neighbor-pooling and spatial methods. Obtain both from your data provider or project lead.

---

## Commands to Run Experiments

### Run all notebooks (EDA and methods)

From the project root, open and execute notebooks in order. Paths in notebooks assume execution from the project root or `notebooks/`:

**EDA notebooks (run first):**
```
notebooks/eda/01_dataset_anatomy.ipynb
notebooks/eda/02_exposure_density_sparsity.ipynb
notebooks/eda/03_color.ipynb
notebooks/eda/04_conditional_distributins.ipynb
notebooks/eda/05_spatial_coherence.ipynb
notebooks/eda/in_depth_analysis.ipynb
```

**Methods notebooks (run after EDA tables exist):**
```
notebooks/methods/bayesian_shrinkage_pooling/bayesian_shrinkage_pooling.ipynb
notebooks/methods/bayesian_shrinkage_pooling/conditional_probability.ipynb
notebooks/methods/color_groupings/hierarchical_clustering.ipynb
notebooks/methods/chi_test/chi_square_residuals.ipynb
notebooks/methods/c2st/classifier_two_sample.ipynb
notebooks/methods/group_level_distribution_analysis/group_level_anomaly_detection.ipynb
```

### Run in-depth analysis (single execution)

```
jupyter nbconvert --to notebook --execute notebooks/eda/in_depth_analysis.ipynb
```

Or open `notebooks/eda/in_depth_analysis.ipynb` in Jupyter and run all cells.

### Deploy the website

**Frontend (development):**
```
cd website/frontend
npm install
npm run dev
```

Serves at `http://localhost:5173`.

**Backend (if used):** Start the FastAPI backend separately. The frontend expects the backend at `http://localhost:8000`.

---

## Expected Outputs

**Tables** (written to `results/tables/`):
- `02_exposure_density_sparsity/` — `eda_exposure_per_h3.csv`, `eda_exposure_by_county.csv`, `eda_exposure_by_landcover.csv`, `eda_exposure_diversity.csv`, `eda_sparsity_regimes.csv`
- `03_color/` — `color_similarity_matrix.csv`, `landcover_color_combinations.csv`
- `bayesian_shrinkage/` — `bayesian_shrinkage_aggregated_counts.csv`, `bayesian_shrinkage_baseline_distributions.csv`, `bayesian_shrinkage_stabilized_distributions.csv`
- `conditional_probability/` — `m01_neighbor_pool_county_lc_summary.csv`, `m01_neighbor_pool_county_lc_color_detail.csv`

**Figures** (written to `figures/`):
- `figures/eda/` — exposure distribution, landcover heatmaps, county maps
- `figures/in_depth_analysis/` — `eda_county_reliability_map.png`, `county_mean_neighbor_jsd_map.png`, `county_mean_surprisal_map.png`, exposure vs diversity, divergence vs exposure, etc.
- `figures/method_comparison/` — pooling comparisons, dendrograms, JSD vs K

**In-depth analysis** produces `results.md` with a summarized narrative of findings.

---

## Directory Structure

```
Wildfire-Property-Intelligence/
  dataset/                    # Main data (user-provided)
  notebooks/
    eda/                      # 01_dataset_anatomy through 05_spatial_coherence, in_depth_analysis
    methods/
      bayesian_shrinkage_pooling/
      color_groupings/
      chi_test/
      c2st/
      group_level_distribution_analysis/
  results/
    tables/                   # CSV outputs by notebook (02_exposure, 03_color, bayesian_shrinkage, etc.)
  figures/
    eda/                      # EDA plots
    in_depth_analysis/        # In-depth analysis plots
    method_comparison/        # Method comparison plots
  website/
    frontend/                 # React + Vite app
    backend/                  # FastAPI (if used)
    _archive/backend/         # Legacy backend
```

For detailed paths and notebook data sources, see `results.md`.
