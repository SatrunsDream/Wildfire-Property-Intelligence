with dataset AS (
  SELECT h.fips, h.count 
  FROM `week-8-assignment-478604.winter2026.homogeneity` AS h
),
m2 AS (
  # hard coding mean: 6.10345
  # SELECT AVG(dataset.count) FROM dataset
  SELECT fips, POWER((dataset.count - 6.10345), 2) AS constant FROM dataset
  # sum is 467.3793
)

,local_morans AS (SELECT CAST(adj.county_code AS INT64) AS fips, SUM(58 * (xi.count - 6.10345) * (xj.count - 6.10345) / 467.3793) AS local
FROM `week-8-assignment-478604.winter2026.adjacent_counties` AS adj
JOIN dataset AS xi
ON CAST(adj.county_code AS INT64) = xi.fips
JOIN dataset AS xj
ON CAST(adj.neighbors_code AS INT64) = xj.fips
GROUP BY adj.county_code)

#SELECT SUM(local)/58 FROM local_morans
, county_geom AS (select CAST(county_fips_code AS INT64) AS fips, county_geom as geometry
from `bigquery-public-data.geo_us_boundaries.counties`
WHERE state_fips_code = '06')

SELECT county_geom.fips, local_morans.local, county_geom.geometry 
FROM local_morans
JOIN county_geom
ON county_geom.fips = local_morans.fips
