# Backend Setup

## 1. Install dependencies

**If you're using uv:**
```bash
uv sync
```

**If you're using pip:**
```bash
pip install fastapi[standard] polars h3 httpx numpy scipy
```

## 2. Add data files

Create a `data/` folder and add:
- `Capstone2025_nsi_lvl9_with_landcover_and_color.csv`
- `ca_county_neighbors.csv`
- `c2st_results_all_lc.csv`

```
backend/
├── data/
│   ├── Capstone2025_nsi_lvl9_with_landcover_and_color.csv
│   ├── ca_county_neighbors.csv
│   └── c2st_results_all_lc.csv
├── main.py
└── ...
```

Or set custom paths via environment variables:
```bash
export DATA_PATH="/path/to/your/data.csv"
export NEIGHBORS_PATH="/path/to/your/neighbors.csv"
export C2ST_PATH="/path/to/your/c2st_results.csv"
```

## 3. Run

**Using uv:**
```bash
uv run python main.py
```

**Using pip:**
```bash
python main.py
```

Server runs at http://localhost:8000
