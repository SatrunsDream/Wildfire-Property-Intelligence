# Wildfire Property Intelligence

Exploratory analysis and comparative evaluation of statistical, spatial, and machine learning methods for identifying reporting inconsistencies in aggregated NSI property data for wildfire risk applications.

## Problem Description

Wildfires are a major source of property loss in California, and inaccurate large-scale property inventories can distort the risk models used by insurers, planners, and policymakers. This project studies how to detect inconsistent or erroneous county-level property characteristics in aggregated NSI data, with a focus on distinguishing true structural variation from sparsity, heterogeneity, and reporting differences.

## Environment Setup

Recommended local environment:

- Python 3.10+ for notebooks and analysis
- Node.js 18+ for the website frontend
- Jupyter for notebook execution
- optional: `uv` for the archived website backend in `website/_archive/backend`

Create and activate a virtual environment:

```bash
python -m venv .venv
source .venv/bin/activate      # macOS / Linux
.venv\Scripts\activate         # Windows
```

## Dependencies

### Python

Install notebook and analysis dependencies from `requirements.txt`:

```bash
pip install -r requirements.txt
```

Key packages and versions:

- `pandas >= 2.0`
- `numpy >= 2.0`
- `scipy >= 1.14`
- `matplotlib >= 3.10`
- `geopandas >= 1.0`
- `h3 >= 3.7`
- `shapely >= 2.0`
- `jupyter >= 1.0`
- `ipykernel >= 7.2`

### Website

Website dependencies are defined in `website/frontend/package.json`.
The archived website export/backend dependencies are defined in `website/_archive/backend/pyproject.toml`.

## Dataset Access

The primary dataset is available in the repo `dataset/` directory:

- `dataset/Capstone2025_nsi_lvl9_with_landcover_and_color.csv.gz`
- `dataset/ca_county_neighbors.csv`
- `dataset/ca-county-neighbors.json`

`ca_county_neighbors.csv` is used for neighbor-pooling and spatial methods.

## Commands to Run Experiments

### Run all notebooks (EDA and Methods)

From the project root, open and execute notebooks in order. Paths in notebooks assume execution from the project root or `notebooks/`:

```text
notebooks/eda/01_dataset_anatomy.ipynb
notebooks/eda/02_exposure_density_sparsity.ipynb
notebooks/eda/03_color.ipynb
notebooks/eda/04_conditional_distributions.ipynb
notebooks/eda/05_spatial_coherence.ipynb
notebooks/eda/06_mode_homogeneity_relative_freq.ipynb
notebooks/eda/in_depth_analysis.ipynb
```

### Methods notebooks

```text
notebooks/methods/bayesian_shrinkage_pooling/bayesian_shrinkage_pooling.ipynb
notebooks/methods/bayesian_shrinkage_pooling/conditional_probability.ipynb
notebooks/methods/color_groupings/color_pool.ipynb
notebooks/methods/color_groupings/hierarchical_clustering.ipynb
notebooks/methods/chi_test/chi_square_residuals.ipynb
notebooks/methods/c2st/classifier_two_sample.ipynb
notebooks/methods/group_level_distribution_analysis/group_level_anomaly_detection.ipynb
```

To execute a notebook from the command line:

```bash
jupyter nbconvert --to notebook --execute notebooks/eda/in_depth_analysis.ipynb
```

### Website

Development:

```bash
cd website/frontend
npm install
npm run dev
```

Production checks:

```bash
cd website/frontend
npm run build
npm run preview
```

## Expected Outputs

Tables written to `results/tables/` include:

- `02_exposure_density_sparsity/` exposure and sparsity summaries
- `03_color/` color similarity and landcover combination summaries
- `bayesian_shrinkage/` baseline, aggregated, and stabilized distributions
- `conditional_probability/` neighbor-pooled summaries and per-color detail
- `grouplevel_divergence/` county-level JSD outputs
- `morans_i/` Moran's I summary tables
- clustering comparison tables under `clustering/`, `hierarchical_clustering/`, `leiden_clustering/`, and `color_pool_improved/`

Figures are written under `figures/`, including EDA plots and method-comparison visualizations.

The repo also contains:

- `results.md` with a summarized narrative of findings
- the website assets and precomputed JSON files under `website/frontend/public/`
- the final report and poster under `website/frontend/public/images/`

The JSON files used by the website are generated from the backend export pipeline in `website/_archive/backend/`, primarily through `export_all.py`, `export_neighbor_divergence.py`, and `export_neighbor_divergence_pooled.py`.

## Directory Structure

```text
Wildfire-Property-Intelligence/
├── dataset/                    # Main source data and county-neighbor files
├── notebooks/
│   ├── eda/                    # Exploratory analysis notebooks
│   └── methods/                # Method notebooks by approach
├── results/
│   └── tables/                 # CSV outputs by analysis stage
├── figures/                    # Generated figures and plots
├── report/                     # Paper/report source files
├── scripts/                    # Helper scripts
├── website/
│   ├── frontend/               # React + Vite website
│   └── _archive/backend/       # Archived website export/backend code
├── requirements.txt
├── results.md
└── README.md
```

## Future Work

- Extend the analysis beyond California to a broader geographic scope
- Refine the greedy color-pooling procedure, since early merges are irreversible and may block better later groupings
- Study hyperparameter sensitivity more formally instead of relying on manual inspection
- Test grouping strategies separately within structural contexts such as damage category, building type, and land cover
- Incorporate evidence from non-neighboring counties that share similar structural patterns, not just adjacent counties
