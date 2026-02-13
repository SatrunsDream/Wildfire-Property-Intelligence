## 05.py

Used for generating tables for EDA that measure modes, relative frequencies, and homogeneity. 

Usage:
05.py -i <input filename> -o <output filename> -t <what type of measurement to use, specifically 'mode', 'relative', or 'homogeneity'`> -f <features to group by>

-i: string representing the input data (specifically the modified nsi dataset we are using)
-o: string representing where the aggregated data should be output
-t: 'mode' for data about modes, 'relative' for relative frequency measurements, 'homogeneity' for homogeneity counts
-f: features to bin by, if you intend to bin by multiple features, format it like a python list WITHOUT SPACES, i.e. ['lc_type','bldgtype']
