import json
import re
from pathlib import Path

import polars as pl

DATA_DIR = Path(__file__).parent.parent.parent.parent / "dataset"
OUT_DIR = Path(__file__).parent.parent.parent / "frontend" / "public" / "data"
OUT_DIR.mkdir(parents=True, exist_ok=True)

DATASET = DATA_DIR / "Capstone2025_nsi_lvl9_with_landcover_and_color.csv"


def parse_lon_lat(loc: str) -> tuple[float, float]:
    """Parse 'POINT(-120.8 37.0)' -> (lon, lat)."""
    m = re.match(r"POINT\(([^ ]+) ([^ )]+)\)", loc)
    return float(m.group(1)), float(m.group(2))


def main():
    print(f"Loading {DATASET.name}...")
    df = pl.read_csv(DATASET)
    print(f"  {len(df):,} rows loaded")
    clr_labels = sorted(df["clr"].unique().to_list())
    lc_labels = sorted(df["lc_type"].unique().to_list())
    clr_idx = {c: i for i, c in enumerate(clr_labels)}
    lc_idx = {l: i for i, l in enumerate(lc_labels)}
    loc_by_h3 = (
        df.group_by("h3")
        .agg(pl.col("loc").first(), pl.col("lc_type").first())
    )

    color_agg = (
        df.group_by(["h3", "clr"])
        .agg(pl.col("clr_cc").sum().alias("n"))
    )

    totals = color_agg.group_by("h3").agg(pl.col("n").sum().alias("total"))

    dominant = (
        color_agg.sort("n", descending=True)
        .group_by("h3")
        .agg(pl.col("clr").first().alias("dominant_clr"))
    )

    top3 = (
        color_agg.sort(["h3", "n"], descending=[False, True])
        .group_by("h3")
        .agg(
            pl.col("clr").head(3).alias("top_clrs"),
            pl.col("n").head(3).alias("top_ns"),
        )
    )

    combined = (
        loc_by_h3
        .join(totals, on="h3")
        .join(dominant, on="h3")
        .join(top3, on="h3")
    )

    print(f"  {len(combined):,} unique H3 cells")

    cells = []
    for row in combined.iter_rows(named=True):
        lon, lat = parse_lon_lat(row["loc"])
        top_colors = [
            [clr_idx[c], int(n)]
            for c, n in zip(row["top_clrs"], row["top_ns"])
        ]
        cells.append([
            row["h3"],
            clr_idx[row["dominant_clr"]],
            lc_idx[row["lc_type"]],
            int(row["total"]),
            round(lon, 6),
            round(lat, 6),
            top_colors,
        ])

    output = {
        "clr_labels": clr_labels,
        "lc_labels": lc_labels,
        "cells": cells,
    }

    out_path = OUT_DIR / "h3-color-cells.json"
    with open(out_path, "w") as f:
        json.dump(output, f, separators=(",", ":"))

    size_mb = out_path.stat().st_size / 1_000_000
    print(f"  Wrote {out_path} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
