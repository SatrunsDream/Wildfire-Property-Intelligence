#!/usr/bin/env python3
"""Build D3-ready merge tree JSON from color_pool greedy merge sequence."""
import json
from pathlib import Path

# Merge sequence from color_pool.ipynb (merged -> canonical, votes)
MERGE_LIST = [
    ("brown", "cocoa", 371.5),
    ("terracotta", "orange", 94.0),
    ("sage", "green", 48.5),
    ("blue", "azure", 46.0),
    ("coffee", "cocoa", 212.0),
    ("green", "olive", 94.5),
    ("lavender", "navy", 88.0),
    ("indigo", "azure", 50.5),
    ("foo", "red", 31.5),
    ("azure", "purple", 162.5),
    ("beige", "cocoa", 93.0),
    ("gray", "alabaster", 53.5),
    ("verde", "olive", 51.0),
    ("sienna", "orange", 36.5),
    ("lilac", "navy", 36.0),
    ("grey", "alabaster", 78.5),
    ("lemon", "amber", 41.5),
    ("aqua", "navy", 36.5),
    ("purple", "red", 31.0),
    ("ivory", "alabaster", 152.0),
    ("yellow", "amber", 70.5),
    ("crimson", "red", 62.0),
    ("aquamarine", "navy", 44.0),
    ("gold", "amber", 65.0),
    ("scarlet", "red", 40.0),
]

def make_leaf(name):
    return {"name": name, "value": 0}

def get_leaves(node, out=None):
    if out is None:
        out = []
    if "children" not in node:
        out.append(node.get("name", ""))
    else:
        for c in node["children"]:
            get_leaves(c, out)
    return out

def build_tree():
    # cluster_root[color] = the root node of that color's cluster
    roots = {}

    for merged, canonical, votes in MERGE_LIST:
        if merged not in roots:
            roots[merged] = {"name": merged}
        if canonical not in roots:
            roots[canonical] = {"name": canonical}

        ra = roots[merged]
        rb = roots[canonical]
        if ra is rb:
            continue

        new_node = {
            "name": canonical,
            "value": round(votes, 1),
            "children": [ra, rb]
        }
        for c in get_leaves(ra) + get_leaves(rb):
            roots[c] = new_node

    # Unique top roots
    group_order = ["red", "navy", "cocoa", "olive", "alabaster", "amber", "orange"]
    seen = set()
    top_by_canon = {}
    for color, node in roots.items():
        if id(node) in seen:
            continue
        seen.add(id(node))
        leaves = get_leaves(node)
        canon = max(leaves, key=lambda x: (x in group_order, group_order.index(x) if x in group_order else 99, x))
        top_by_canon[canon] = node
        node["name"] = canon.upper()

    top_list = [top_by_canon[c] for c in group_order if c in top_by_canon]
    return {"name": "root", "children": top_list}

def main():
    tree = build_tree()
    out_path = Path(__file__).parent.parent / "website" / "frontend" / "public" / "data" / "color-pool-merge-tree.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(tree, f, indent=2)
    print(f"Wrote {out_path}")

if __name__ == "__main__":
    main()
