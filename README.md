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

**Tables** (written to `results/tables/`):
- `02_exposure_density_sparsity/` — `eda_exposure_per_h3.csv`, `eda_exposure_by_county.csv`, `eda_exposure_by_landcover.csv`, `eda_exposure_diversity.csv`, `eda_sparsity_regimes.csv`
- `03_color/` — `color_similarity_matrix.csv`, `landcover_color_combinations.csv`
- `bayesian_shrinkage/` — `bayesian_shrinkage_aggregated_counts.csv`, `bayesian_shrinkage_baseline_distributions.csv`, `bayesian_shrinkage_stabilized_distributions.csv`
- `conditional_probability/` — `m01_neighbor_pool_county_lc_summary.csv`, `m01_neighbor_pool_county_lc_color_detail.csv`
- `morans_i/` — `relative_frequencies_lc_type_bldgtype.csv`
- `grouplevel_divergence/` — `jsd_conditional_divergence.csv`, `jsd_conditional_county_summary.csv`, `color_pairs_analysis.csv`
- `hierarchical_clustering/` — `hierarchical__color_groups__*.csv`, `hierarchical__color_groups_best_jsd__*.csv`, `hierarchical__color_groups_best_surprisal__*.csv`, `hierarchical__jsd_by_k__*.csv`
- `leiden_clustering/` — `leiden__color_groups__*.csv`, `leiden__comparison__*.csv`
- `clustering/` — `clustering__all_methods__*.csv`
- `color_pool_improved/` — `color_pool_improved__variants__*.csv`

**Figures** (written to `figures/`):
- `figures/eda/` — exposure distribution, landcover heatmaps, county maps
- `figures/in_depth_analysis/` — `eda_county_reliability_map.png`, `county_mean_neighbor_jsd_map.png`, `county_mean_surprisal_map.png`, exposure vs diversity, divergence vs exposure, etc.
- `figures/method_comparison/` — pooling comparisons, dendrograms, JSD vs K

**In-depth analysis** produces `results.md` with a summarized narrative of findings.

---

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
