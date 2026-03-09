"""
Export static JSON for /conditioning-options.

Run from the backend/ directory:
    python export_conditioning_options.py

Output: ../frontend/public/data/conditioning-options.json
"""

import json
from pathlib import Path

import polars as pl

DATA_DIR = Path(__file__).parent / "data"
OUT_PATH = Path(__file__).parent.parent / "frontend" / "public" / "data" / "conditioning-options.json"


def main():
    print("Loading data ...")
    df = pl.read_csv(DATA_DIR / "Capstone2025_nsi_lvl9_with_landcover_and_color.csv")

    output = {
        "options": [
            {"value": "", "label": "None (raw distribution)"},
            {"value": "lc_type", "label": "Land Cover Type"},
            {"value": "st_damcat", "label": "Occupancy Type (RES/COM/etc)"},
            {"value": "bldgtype", "label": "Building Type"},
        ],
        "values": {
            "lc_type": sorted(df["lc_type"].unique().to_list()),
            "st_damcat": sorted(df["st_damcat"].unique().to_list()),
            "bldgtype": sorted(df["bldgtype"].unique().to_list()),
        },
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(output, f)

    print(f"Written to {OUT_PATH}")


if __name__ == "__main__":
    main()
