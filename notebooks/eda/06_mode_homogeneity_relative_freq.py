#!/usr/bin/env python
# coding: utf-8

import pandas as pd
import numpy as np
import sys, getopt, ast

def get_mode(inp):
    return list(inp.value_counts().index)[0]

def bin_homogeneity(dataset, to_groupby = ['fips'], bins = ['lc_type', 'bldgtype']):
    totals = dataset.drop(columns = ['loc', 'h3']).groupby(to_groupby).count().rename(columns = {'st_damcat' : 'total'}).iloc[:, 0]
    relative_freq = dataset.drop(columns = ['loc', 'h3']).groupby(to_groupby + bins).count().reset_index().merge(totals, how = 'left', on = to_groupby)
    #print(relative_freq.columns)
    to_drop = [c for c in relative_freq.columns if c not in to_groupby + ['freq'] + bins]
    relative_freq = relative_freq.assign(freq = relative_freq.st_damcat / relative_freq.total).drop(columns = to_drop).sort_values(by = to_groupby + ['freq'], ascending = False)
    def filter_cdf(col):
        #print(np.array(col.freq))
        _max = sum(np.cumsum(np.array(col.freq)) <= 0.8)
        return col[:_max]
    most_freq = relative_freq.groupby(to_groupby).apply(include_groups = False, func = filter_cdf).reset_index()
    most_freq = most_freq.drop(columns = [c for c in most_freq.columns if 'level' in c])
    #print(most_freq)
    return most_freq, relative_freq
    
#bin_categories = ['lc_type', 'bldgtype']
#most_freq = bin_homogeneity(data, bin_categories = ['lc_type', 'bldgtype'])
#most_freq.to_csv()
# using homogeneity counts for Bigquery analysis
#most_freq.groupby(['fips']).count().reset_index().iloc[:, :2].rename(columns = {'lc_type' : 'count'})#.to_csv('eda_lc_type_bldgtype_homogeneity.csv')

def main(argv):
    inputfile = ''
    outputfile = ''
    type_of_data = ''
    try:
        opts, args = getopt.getopt(argv,"hi:o:t:f::")
    except getopt.GetoptError:
        print ('eda_notebook.py -i <inputfile> -o <outputfile> -t <mode or homogeneity or relative> -f <features to groupby>')
        sys.exit(2)
    for opt, arg in opts:
        if opt == '-h':
            print ('eda_notebook.py -i <inputfile> -o <outputfile> -t <mode or homogeneity or relative> -f <features to groupby>')
            sys.exit()
        elif opt == "-t":
            type_of_data = arg
        elif opt == "-i":
            input_file = arg
        elif opt == "-o":
            output_file = arg
        elif opt == '-f':
            features = ast.literal_eval(arg)
    #print ('Input file is "', inputfile)
    #print ('Output file is "', outputfile)
    #print(type_of_data)
    #print(features)
    #print(type(type_of_data))
    #print(type(features))
    data = pd.read_csv(input_file)
    #adjacent_counties = pd.read_csv('data/adjacent_counties.csv')   
    if type_of_data == 'mode':
        data.drop(columns = ['loc', 'h3']).groupby('fips').agg(get_mode).to_csv(output_file)
    elif type_of_data in ('homogeneity', 'relative'):
        most, relative = bin_homogeneity(data, bins = features)
        if type_of_data == 'relative':
            relative.set_index('fips').to_csv(output_file)
        if type_of_data == 'homogeneity':
            most = most.groupby(['fips']).count().rename(columns = {most.columns[-1] : 'count'})
            most.drop(columns = [x for x in most.columns if x != 'count']).to_csv(output_file)
    else: 
        print ('eda_notebook.py -i <inputfile> -o <outputfile> -t <mode or homogeneity or relative> -f <features to groupby>')
        
if __name__ == "__main__":
    main(sys.argv[1:]) 

