# Archived Export Pipeline

Python export pipeline and supporting code used to generate the static JSON files consumed by `website/frontend`.

## What This Folder Is Used For

- reading source CSV data from `data/`
- generating static JSON outputs for `../../frontend/public/data/`

## Setup

Recommended:

```bash
uv sync
```

Alternative:

```bash
pip install fastapi[standard] polars h3 httpx numpy scipy
```

## Source Data

Expected inputs live in `data/`, including files such as:

- `Capstone2025_nsi_lvl9_with_landcover_and_color.csv`
- `ca_county_neighbors.csv`
- `c2st_results_all_lc.csv`
- `bayesian_shrinkage_baseline_distributions.csv`
- `bayesian_shrinkage_stabilized_distributions.csv`
- `m01_neighbor_pool_county_lc_summary.csv`
- `m01_neighbor_pool_county_lc_color_detail.csv`
- `jsd_conditional_county_summary.csv`
- `jsd_conditional_divergence.csv`

## Main Export Commands

Run from this directory:

```bash
uv run python export_all.py
uv run python export_neighbor_divergence.py
uv run python export_neighbor_divergence_pooled.py
uv run python export_conditioning_options.py
```

These scripts write JSON files to:

```text
../../frontend/public/data/
```

## Output Files

The export pipeline produces frontend-ready files such as:

- `morans-freq.json`
- `ca-county-neighbors.json`
- `conditional-pooling-summary.json`
- `conditional-pooling-detail.json`
- `bayesian-baseline.json`
- `bayesian-stabilized.json`
- `c2st-results.json`
- `group-divergence.json`
- `county-colors.json`
- `county-pair-comparisons.json`
- `neighbor-divergence-map.json`
- `neighbor-divergence-map-pooled.json`
- `conditioning-options.json`

## Notes

- `main.py`, `routes.py`, and related files remain here for archival reference, but they are not required for the current static website workflow.