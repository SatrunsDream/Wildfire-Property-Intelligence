COUNTY_NAME_TO_FIPS = {
    "Alameda": "06001", "Alpine": "06003", "Amador": "06005", "Butte": "06007",
    "Calaveras": "06009", "Colusa": "06011", "Contra Costa": "06013", "Del Norte": "06015",
    "El Dorado": "06017", "Fresno": "06019", "Glenn": "06021", "Humboldt": "06023",
    "Imperial": "06025", "Inyo": "06027", "Kern": "06029", "Kings": "06031",
    "Lake": "06033", "Lassen": "06035", "Los Angeles": "06037", "Madera": "06039",
    "Marin": "06041", "Mariposa": "06043", "Mendocino": "06045", "Merced": "06047",
    "Modoc": "06049", "Mono": "06051", "Monterey": "06053", "Napa": "06055",
    "Nevada": "06057", "Orange": "06059", "Placer": "06061", "Plumas": "06063",
    "Riverside": "06065", "Sacramento": "06067", "San Benito": "06069", "San Bernardino": "06071",
    "San Diego": "06073", "San Francisco": "06075", "San Joaquin": "06077", "San Luis Obispo": "06079",
    "San Mateo": "06081", "Santa Barbara": "06083", "Santa Clara": "06085", "Santa Cruz": "06087",
    "Shasta": "06089", "Sierra": "06091", "Siskiyou": "06093", "Solano": "06095",
    "Sonoma": "06097", "Stanislaus": "06099", "Sutter": "06101", "Tehama": "06103",
    "Trinity": "06105", "Tulare": "06107", "Tuolumne": "06109", "Ventura": "06111",
    "Yolo": "06113", "Yuba": "06115",
}

FIPS_TO_COUNTY_NAME = {v: k for k, v in COUNTY_NAME_TO_FIPS.items()}

COUNTY_CENTROIDS = {
    "06001": [-121.9, 37.65], "06003": [-119.82, 38.6], "06005": [-120.65, 38.45], "06007": [-121.6, 39.67],
    "06009": [-120.55, 38.2], "06011": [-122.23, 39.18], "06013": [-122.0, 37.92], "06015": [-123.98, 41.75],
    "06017": [-120.53, 38.78], "06019": [-119.77, 36.76], "06021": [-122.39, 39.6], "06023": [-123.87, 40.7],
    "06025": [-115.36, 33.04], "06027": [-117.4, 36.51], "06029": [-118.73, 35.34], "06031": [-119.82, 36.08],
    "06033": [-122.75, 39.1], "06035": [-120.53, 40.66], "06037": [-118.23, 34.32], "06039": [-119.76, 37.22],
    "06041": [-122.58, 38.05], "06043": [-119.97, 37.58], "06045": [-123.44, 39.44], "06047": [-120.72, 37.19],
    "06049": [-120.73, 41.59], "06051": [-118.89, 37.94], "06053": [-121.24, 36.22], "06055": [-122.33, 38.5],
    "06057": [-120.77, 39.3], "06059": [-117.76, 33.68], "06061": [-120.71, 39.06], "06063": [-120.84, 40.0],
    "06065": [-116.47, 33.74], "06067": [-121.35, 38.45], "06069": [-121.08, 36.6], "06071": [-116.18, 34.84],
    "06073": [-116.74, 33.03], "06075": [-122.44, 37.76], "06077": [-121.27, 37.93], "06079": [-120.44, 35.38],
    "06081": [-122.33, 37.43], "06083": [-119.97, 34.54], "06085": [-121.7, 37.23], "06087": [-122.01, 37.03],
    "06089": [-122.04, 40.76], "06091": [-120.52, 39.58], "06093": [-122.54, 41.59], "06095": [-121.95, 38.27],
    "06097": [-122.84, 38.53], "06099": [-120.99, 37.56], "06101": [-121.69, 39.03], "06103": [-122.24, 40.13],
    "06105": [-123.07, 40.65], "06107": [-118.8, 36.21], "06109": [-120.23, 38.03], "06111": [-119.03, 34.36],
    "06113": [-121.9, 38.73], "06115": [-121.44, 39.14],
}

COLUMN_META = {
    "clr": {
        "label": "Color (clr)",
        "as_target": "yes",
        "as_context": "no",
        "reason": "Known dirty tokens (foo, bar), near-duplicates (gray/grey), likely data entry errors"
    },
    "bldgtype": {
        "label": "Building Type",
        "as_target": "yes",
        "as_context": "yes",
        "reason": "Should correlate with occupancy — e.g., COM + H (manufactured housing) only 10 times"
    },
    "st_damcat": {
        "label": "Occupancy Type",
        "as_target": "yes",
        "as_context": "yes",
        "reason": "Industrial in residential forest? Could flag upstream coding issues"
    },
    "lc_type": {
        "label": "Land Cover",
        "as_target": "no",
        "as_context": "yes",
        "reason": "Comes from spatial joins to authoritative sources — treat as ground truth"
    },
    "fips": {
        "label": "County (FIPS)",
        "as_target": "no",
        "as_context": "yes",
        "reason": "Geographic fact from authoritative source — can't be 'wrong'"
    }
}

H3_LEVELS = [
    {"res": 5, "minZoom": 0, "maxZoom": 7},
    {"res": 6, "minZoom": 6, "maxZoom": 9},
    {"res": 7, "minZoom": 8, "maxZoom": 11},
    {"res": 8, "minZoom": 10, "maxZoom": 13},
    {"res": 9, "minZoom": 12, "maxZoom": 20},
]

CA_COUNTIES_GEOJSON_URL = "https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/california-counties.geojson"
