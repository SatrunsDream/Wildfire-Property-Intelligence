/** Shared types and buildCountyDetail for Conditional Probability / KL divergence */

export interface SummaryRow {
    fips: number
    lc_type: string
    n_county: number
    n_pool: number
    num_neighbors: number
    kl_div: number
    l1_distance: number
    top_color: string
    top_contrib: number
}

export interface DetailRow {
    fips: number
    lc_type: string
    clr: string
    y_county: number
    y_pool: number
    p_county: number
    p_pool: number
    contrib: number
    abs_diff: number
}

export interface ColorDistribution {
    clr: string
    y_county: number
    y_pool: number
    p_county: number
    p_pool: number
    contrib: number
    abs_diff: number
}

export interface LandcoverDetail {
    lc_type: string
    n_county: number
    n_pool: number
    num_neighbors: number
    kl_div: number
    l1_distance: number
    top_color: string
    top_contrib: number
    distributions: ColorDistribution[]
}

export interface CountyDetail {
    fips: string
    county_name: string
    by_landcover: LandcoverDetail[]
    total_landcover_types: number
}

export function buildCountyDetail(
    fipsNum: number,
    summaryRows: SummaryRow[],
    detailRows: DetailRow[],
    geoFeatures: GeoJSON.Feature[],
    lc: string
): CountyDetail {
    const fipsStr = String(fipsNum).padStart(5, '0')
    const geo = geoFeatures.find((f) => f.properties?.fips === fipsStr)
    const county_name = (geo?.properties?.county_name || geo?.properties?.name) as string || fipsStr

    const filteredSummary = summaryRows.filter((r) => r.fips === fipsNum && (!lc || r.lc_type === lc))
    const filteredDetail = detailRows.filter((r) => r.fips === fipsNum && (!lc || r.lc_type === lc))

    const by_landcover: LandcoverDetail[] = filteredSummary.map((s) => ({
        lc_type: s.lc_type,
        n_county: s.n_county,
        n_pool: s.n_pool,
        num_neighbors: s.num_neighbors,
        kl_div: s.kl_div,
        l1_distance: s.l1_distance,
        top_color: s.top_color,
        top_contrib: s.top_contrib,
        distributions: filteredDetail
            .filter((d) => d.lc_type === s.lc_type)
            .map((d) => ({
                clr: d.clr,
                y_county: d.y_county,
                y_pool: d.y_pool,
                p_county: d.p_county,
                p_pool: d.p_pool,
                contrib: d.contrib,
                abs_diff: d.abs_diff,
            })),
    }))

    return { fips: fipsStr, county_name, by_landcover, total_landcover_types: by_landcover.length }
}

/** Build county detail aggregated across ALL land cover types (colors only). */
export function buildCountyDetailAllLandcover(
    fipsNum: number,
    detailRows: DetailRow[],
    geoFeatures: GeoJSON.Feature[]
): CountyDetail {
    const fipsStr = String(fipsNum).padStart(5, '0')
    const geo = geoFeatures.find((f) => f.properties?.fips === fipsStr)
    const county_name = (geo?.properties?.county_name || geo?.properties?.name) as string || fipsStr

    const filtered = detailRows.filter((r) => r.fips === fipsNum)
    const totalCounty = filtered.reduce((s, d) => s + d.y_county, 0)
    const totalPool = filtered.reduce((s, d) => s + d.y_pool, 0)

    const byColor: Record<string, { y_county: number; y_pool: number }> = {}
    filtered.forEach((d) => {
        if (!byColor[d.clr]) byColor[d.clr] = { y_county: 0, y_pool: 0 }
        byColor[d.clr].y_county += d.y_county
        byColor[d.clr].y_pool += d.y_pool
    })

    const distributions: ColorDistribution[] = Object.entries(byColor).map(([clr, { y_county, y_pool }]) => {
        const p_county = totalCounty > 0 ? y_county / totalCounty : 0
        const p_pool = totalPool > 0 ? y_pool / totalPool : 0
        const diff = p_county - p_pool
        return {
            clr,
            y_county,
            y_pool,
            p_county,
            p_pool,
            contrib: Math.abs(diff),
            abs_diff: Math.abs(diff),
        }
    })

    const singleLandcover: LandcoverDetail = {
        lc_type: 'All land cover types',
        n_county: totalCounty,
        n_pool: totalPool,
        num_neighbors: 0,
        kl_div: 0,
        l1_distance: 0,
        top_color: '',
        top_contrib: 0,
        distributions,
    }

    return {
        fips: fipsStr,
        county_name,
        by_landcover: [singleLandcover],
        total_landcover_types: 1,
    }
}
