import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import * as d3 from 'd3'
import { cn } from './lib/utils'
import { chartColors } from './lib/chart-colors'

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json'

const COLOR_MAP: Record<string, string> = {
    amber: '#FFBF00', aqua: '#00FFFF', aquamarine: '#7FFFD4', auburn: '#922724', azure: '#F0FFFF',
    bar: '#888888', beige: '#F5F5DC', blue: '#0000FF', brown: '#A52A2A', cocoa: '#D2691E',
    coffee: '#6F4E37', crimson: '#DC143C', emerald: '#50C878', foo: '#888888', gold: '#FFD700',
    gray: '#808080', green: '#008000', grey: '#808080', indigo: '#4B0082', ivory: '#FFFFF0',
    lavender: '#E6E6FA', lemon: '#FFF700', lilac: '#C8A2C8', maroon: '#800000', navy: '#000080',
    olive: '#808000', orange: '#FFA500', plum: '#8E4585', purple: '#800080', red: '#FF0000',
    sage: '#9DC183', scarlet: '#FF2400', sienna: '#A0522D', tan: '#D2B48C', terracotta: '#E2725B',
    verde: '#00A86B', yellow: '#FFFF00', alabaster: '#F2F0E6',
}

interface SummaryRow { fips: number; lc_type: string; n_county: number; n_pool: number; num_neighbors: number; kl_div: number; l1_distance: number; top_color: string; top_contrib: number }
interface DetailRow { fips: number; lc_type: string; clr: string; y_county: number; y_pool: number; p_county: number; p_pool: number; contrib: number; abs_diff: number }

interface ColorDistribution { clr: string; y_county: number; y_pool: number; p_county: number; p_pool: number; contrib: number; abs_diff: number }
interface LandcoverDetail { lc_type: string; n_county: number; n_pool: number; num_neighbors: number; kl_div: number; l1_distance: number; top_color: string; top_contrib: number; distributions: ColorDistribution[] }
interface CountyDetail { fips: string; county_name: string; by_landcover: LandcoverDetail[]; total_landcover_types: number }
interface CountyMapData { type: 'FeatureCollection'; features: GeoJSON.Feature[]; metric: string; lc_type: string | null; stats: { total_counties: number; mean_value: number; max_value: number } }

function buildMapData(summaryRows: SummaryRow[], geoFeatures: GeoJSON.Feature[], lc: string, metric: string): CountyMapData {
    const filtered = lc ? summaryRows.filter(r => r.lc_type === lc) : summaryRows
    const metricKey = metric === 'kl_div' ? 'kl_div' : 'l1_distance'

    // Group by fips
    const byFips = new Map<number, { values: number[]; total_exposure: number; num_neighbors: number }>()
    for (const r of filtered) {
        if (!byFips.has(r.fips)) byFips.set(r.fips, { values: [], total_exposure: 0, num_neighbors: r.num_neighbors })
        const entry = byFips.get(r.fips)!
        entry.values.push(r[metricKey])
        entry.total_exposure += r.n_county
    }

    // Build geometry map
    const geoByFips = new Map<string, GeoJSON.Feature>()
    for (const f of geoFeatures) {
        const fips = f.properties?.fips as string
        if (fips) geoByFips.set(fips, f)
    }

    const features: GeoJSON.Feature[] = []
    for (const [fipsNum, data] of byFips.entries()) {
        const fipsStr = String(fipsNum).padStart(5, '0')
        const geo = geoByFips.get(fipsStr)
        if (!geo) continue
        const mean_value = data.values.reduce((a, b) => a + b, 0) / data.values.length
        const max_value = Math.max(...data.values)
        features.push({
            type: 'Feature',
            geometry: geo.geometry,
            properties: {
                fips: fipsStr,
                county_name: geo.properties?.county_name || geo.properties?.name || fipsStr,
                mean_value,
                max_value,
                total_exposure: data.total_exposure,
                num_neighbors: data.num_neighbors,
            }
        })
    }

    const allValues = features.map(f => f.properties!.mean_value as number)
    return {
        type: 'FeatureCollection',
        features,
        metric,
        lc_type: lc || null,
        stats: {
            total_counties: features.length,
            mean_value: allValues.length > 0 ? allValues.reduce((a, b) => a + b, 0) / allValues.length : 0,
            max_value: allValues.length > 0 ? Math.max(...allValues) : 0,
        }
    }
}

function buildCountyDetail(fipsNum: number, summaryRows: SummaryRow[], detailRows: DetailRow[], geoFeatures: GeoJSON.Feature[], lc: string): CountyDetail {
    const fipsStr = String(fipsNum).padStart(5, '0')
    const geo = geoFeatures.find(f => f.properties?.fips === fipsStr)
    const county_name = geo?.properties?.county_name || geo?.properties?.name || fipsStr

    const filteredSummary = summaryRows.filter(r => r.fips === fipsNum && (!lc || r.lc_type === lc))
    const filteredDetail = detailRows.filter(r => r.fips === fipsNum && (!lc || r.lc_type === lc))

    const by_landcover: LandcoverDetail[] = filteredSummary.map(s => ({
        lc_type: s.lc_type,
        n_county: s.n_county,
        n_pool: s.n_pool,
        num_neighbors: s.num_neighbors,
        kl_div: s.kl_div,
        l1_distance: s.l1_distance,
        top_color: s.top_color,
        top_contrib: s.top_contrib,
        distributions: filteredDetail
            .filter(d => d.lc_type === s.lc_type)
            .map(d => ({ clr: d.clr, y_county: d.y_county, y_pool: d.y_pool, p_county: d.p_county, p_pool: d.p_pool, contrib: d.contrib, abs_diff: d.abs_diff }))
    }))

    return { fips: fipsStr, county_name, by_landcover, total_landcover_types: by_landcover.length }
}

export function ConditionalProbability() {
    const mapContainer = useRef<HTMLDivElement>(null)
    const map = useRef<maplibregl.Map | null>(null)
    const selectedLandcoverRef = useRef<string>('')
    const summaryRef = useRef<SummaryRow[]>([])
    const detailRef2 = useRef<DetailRow[]>([])
    const geoFeaturesRef = useRef<GeoJSON.Feature[]>([])

    const [landcoverTypes, setLandcoverTypes] = useState<string[]>([])
    const [selectedLandcover, setSelectedLandcover] = useState<string>('')
    const [selectedMetric, setSelectedMetric] = useState<string>('kl_div')
    const [mapData, setMapData] = useState<CountyMapData | null>(null)
    const [countyDetail, setCountyDetail] = useState<CountyDetail | null>(null)
    const detailRef = useRef<HTMLDivElement>(null)
    const [showDetailPanel, setShowDetailPanel] = useState(false)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [legendRange, setLegendRange] = useState<{ min: number; max: number } | null>(null)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [controlsOpen, setControlsOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 640)
    const [isMapReady, setIsMapReady] = useState(false)
    const [dataLoaded, setDataLoaded] = useState(false)

    useEffect(() => { selectedLandcoverRef.current = selectedLandcover }, [selectedLandcover])

    // Load all static data on mount
    useEffect(() => {
        Promise.all([
            fetch('/data/conditional-pooling-summary.json').then(r => r.json()),
            fetch('/data/conditional-pooling-detail.json').then(r => r.json()),
            fetch('/data/group-divergence.json').then(r => r.json()),
        ])
            .then(([summary, detail, gd]) => {
                summaryRef.current = summary
                detailRef2.current = detail
                geoFeaturesRef.current = gd.map.features
                const lcs = [...new Set<string>(summary.map((r: SummaryRow) => r.lc_type))].sort()
                setLandcoverTypes(lcs)
                setDataLoaded(true)
                setLoading(false)
            })
            .catch(err => {
                setError(`Failed to load data: ${err.message}`)
                setLoading(false)
            })
    }, [])

    const loadCountyDetail = useCallback((fipsStr: string) => {
        const fipsNum = parseInt(fipsStr, 10)
        const lc = selectedLandcoverRef.current
        const detail = buildCountyDetail(fipsNum, summaryRef.current, detailRef2.current, geoFeaturesRef.current, lc)
        setCountyDetail(detail)
        setShowDetailPanel(true)
    }, [])

    useEffect(() => {
        if (!mapContainer.current || map.current) return
        try {
            const isMobile = window.innerWidth < 640
            map.current = new maplibregl.Map({ container: mapContainer.current, style: MAP_STYLE, center: [-119.5, 37.0], zoom: isMobile ? 4.5 : 5.5 })
            map.current.on('load', () => setIsMapReady(true))
            map.current.addControl(new maplibregl.NavigationControl(), 'top-right')
            map.current.on('click', 'counties', (e) => {
                if (e.features && e.features[0]) {
                    const fips = (e.features[0].properties as any).fips
                    if (fips) {
                        loadCountyDetail(fips)
                        setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
                    }
                }
            })
            map.current.on('error', () => setError('Map initialization error'))
        } catch { setError('Failed to initialize map') }
        return () => { if (map.current) { map.current.remove(); map.current = null } setIsMapReady(false) }
    }, [loadCountyDetail])

    // Rebuild map data when filters or data change
    useEffect(() => {
        if (!dataLoaded || !isMapReady) return
        const data = buildMapData(summaryRef.current, geoFeaturesRef.current, selectedLandcover, selectedMetric)
        if (data.features.length > 0) {
            setMapData(data)
        } else {
            setError('No data found for the selected filters')
        }
    }, [dataLoaded, isMapReady, selectedLandcover, selectedMetric])

    const updateMapLayer = useCallback((data: CountyMapData) => {
        if (!map.current) return
        try {
            if (!map.current.isStyleLoaded()) { map.current.once('styledata', () => updateMapLayer(data)); return }
            if (map.current.getLayer('counties')) map.current.removeLayer('counties')
            if (map.current.getLayer('counties-outline')) map.current.removeLayer('counties-outline')
            if (map.current.getSource('counties')) map.current.removeSource('counties')
            if (!data.features || data.features.length === 0) return

            map.current.addSource('counties', { type: 'geojson', data: data })

            const values = data.features.map(f => f.properties?.mean_value).filter((v): v is number => typeof v === 'number' && !isNaN(v) && isFinite(v))
            if (values.length === 0) return
            const minVal = Math.min(...values)
            const maxVal = Math.max(...values)

            if (minVal !== maxVal) setLegendRange({ min: minVal, max: maxVal })
            else setLegendRange(null)

            if (minVal === maxVal) {
                map.current.addLayer({ id: 'counties', type: 'fill', source: 'counties', paint: { 'fill-color': chartColors.primary, 'fill-opacity': 0.7 } })
            } else {
                const colorScale = d3.scaleSequential(d3.interpolateViridis).domain([minVal, maxVal])
                map.current.addLayer({ id: 'counties', type: 'fill', source: 'counties', paint: { 'fill-color': ['interpolate', ['linear'], ['get', 'mean_value'], minVal, colorScale(minVal), maxVal, colorScale(maxVal)], 'fill-opacity': 0.7 } })
            }
            map.current.addLayer({ id: 'counties-outline', type: 'line', source: 'counties', paint: { 'line-color': '#888', 'line-width': 1 } })

            const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false })
            ;(map.current as any).off('mousemove', 'counties')
            ;(map.current as any).off('mouseleave', 'counties')
            map.current.on('mousemove', 'counties', (e: any) => {
                if (!e.features || e.features.length === 0) return
                if (map.current) map.current.getCanvas().style.cursor = 'pointer'
                const props = e.features[0].properties as any
                const metricLabel = selectedMetric === 'kl_div' ? 'KL Divergence' : 'L1 Distance'
                popup.setLngLat(e.lngLat).setHTML(`<div style="font-size:12px;line-height:1.5"><div style="font-weight:bold;margin-bottom:6px">${props.county_name} County</div><div>Exposure: <strong>${props.total_exposure?.toLocaleString()}</strong></div><div>Mean ${metricLabel}: <strong>${props.mean_value?.toFixed(4)}</strong></div><div>Neighbors: ${props.num_neighbors}</div><div style="margin-top:6px;font-size:10px;color:#666">Click for details</div></div>`).addTo(map.current!)
            })
            map.current.on('mouseleave', 'counties', () => { if (map.current) { map.current.getCanvas().style.cursor = ''; popup.remove() } })
        } catch { setError('Failed to update map layer') }
    }, [selectedMetric])

    useEffect(() => {
        if (isMapReady && mapData && map.current && mapData.features.length > 0) updateMapLayer(mapData)
    }, [isMapReady, mapData, updateMapLayer])

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape' && isFullscreen) setIsFullscreen(false) }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isFullscreen])

    useEffect(() => { setTimeout(() => map.current?.resize(), 100) }, [isFullscreen])

    const stats = mapData ? { mean_value: mapData.stats.mean_value, max_value: mapData.stats.max_value } : null

    return (
        <div className={cn('relative flex-1 min-h-0', isFullscreen && 'fixed top-0 left-0 right-0 bottom-0 w-screen h-screen z-[9999] bg-background')}>
            <div className="absolute inset-0">
                <div ref={mapContainer} className="w-full h-full" />
                {loading && <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-20">Loading map data...</div>}
                {error && <div className="absolute top-2.5 left-1/2 -translate-x-1/2 px-4 py-2 bg-red-50 border border-red-200 rounded text-red-600 text-sm z-10">{error}</div>}
                <div className="absolute top-2.5 left-2.5 flex flex-col gap-2 bg-card/95 rounded p-2 sm:p-3 shadow-elevated z-10 w-40 sm:w-48">
                    <div className="relative pr-4">
                        <div className="text-[10px] sm:text-xs text-muted-foreground leading-snug text-left">Measures how much a county's color distribution deviates from its neighbors' pooled distribution. Higher values = more unusual.</div>
                        <button onClick={() => setControlsOpen(v => !v)} className="absolute -top-1 -right-1 text-[9px] text-muted-foreground cursor-pointer hover:text-foreground">{controlsOpen ? '▲' : '▼'}</button>
                    </div>
                    {controlsOpen && <>
                    {stats && (
                        <div className="pb-2 mb-1 border-b border-border">
                            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Statistics</div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                <span className="text-muted-foreground">Mean {selectedMetric === 'kl_div' ? 'KL Div' : 'L1'}:</span>
                                <span className="font-semibold text-foreground">{stats.mean_value.toFixed(4)}</span>
                                <span className="text-muted-foreground">Max {selectedMetric === 'kl_div' ? 'KL Div' : 'L1'}:</span>
                                <span className="font-semibold text-foreground">{stats.max_value.toFixed(4)}</span>
                            </div>
                        </div>
                    )}
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Display</span>
                        <select value={selectedMetric} onChange={(e) => setSelectedMetric(e.target.value)} className="px-3 py-1.5 text-xs border border-border rounded bg-background cursor-pointer focus:outline-none focus:border-sage-400">
                            <option value="kl_div">KL Divergence</option>
                            <option value="l1_distance">L1 Distance</option>
                        </select>
                        <select value={selectedLandcover} onChange={(e) => { setSelectedLandcover(e.target.value); setCountyDetail(null); setShowDetailPanel(false) }} className="px-3 py-1.5 text-xs border border-border rounded bg-background cursor-pointer focus:outline-none focus:border-sage-400">
                            <option value="">All Landcover Types</option>
                            {landcoverTypes.map(lc => <option key={lc} value={lc}>{lc}</option>)}
                        </select>
                    </div>
                    <button className="px-3 py-1.5 border border-[var(--button-accent)] rounded-sm bg-muted/50 text-[11px] font-medium text-[var(--button-accent)] cursor-pointer uppercase tracking-wide transition-all duration-150 hover:bg-[var(--button-accent)]/10" onClick={() => setIsFullscreen(!isFullscreen)}>
                        {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                    </button>
                    </>}
                </div>

                {mapData && legendRange && (
                    <div className="absolute right-2.5 bottom-20 sm:bottom-24 bg-card/95 p-2 sm:p-3 rounded shadow-elevated text-xs z-10">
                        <div className="font-semibold mb-1 sm:mb-2 text-foreground text-[10px] sm:text-xs">{selectedMetric === 'kl_div' ? 'KL Divergence' : 'L1 Distance'}</div>
                        <div className="w-28 sm:w-44 h-2 sm:h-2.5 rounded-sm" style={{ background: `linear-gradient(to right, ${d3.interpolateViridis(0)}, ${d3.interpolateViridis(1)})` }} />
                        <div className="flex justify-between mt-1 text-[9px] sm:text-[10px] text-muted-foreground">
                            <span>{legendRange.min.toFixed(4)}</span><span>{legendRange.max.toFixed(4)}</span>
                        </div>
                        <div className="flex justify-between mt-1 text-[9px] sm:text-[10px] text-muted-foreground"><span>Typical</span><span>Unusual</span></div>
                    </div>
                )}
            </div>

            {countyDetail && (
                <div ref={detailRef} className={cn('absolute bottom-0 left-0 right-0 bg-card shadow-[0_-4px_20px_rgba(0,0,0,0.15)] z-40 transition-all duration-300', showDetailPanel ? 'h-[80%] sm:h-[65%]' : 'h-auto')}>
                    <div className="px-3 sm:px-5 py-3 sm:py-4 border-b border-border flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setShowDetailPanel(!showDetailPanel)}>
                        <h3 className="font-semibold text-sm sm:text-base truncate mr-2">{countyDetail.county_name} (FIPS: {countyDetail.fips})</h3>
                        <div className="flex items-center gap-3">
                            <button className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors" onClick={(e) => { e.stopPropagation(); setShowDetailPanel(!showDetailPanel) }}>
                                {showDetailPanel ? 'Collapse' : 'Expand'}
                            </button>
                            <button className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded text-xl leading-none" onClick={(e) => { e.stopPropagation(); setCountyDetail(null); setShowDetailPanel(false) }}>×</button>
                        </div>
                    </div>
                    {showDetailPanel && (
                        <div className="h-[calc(100%-55px)] sm:h-[calc(100%-65px)] overflow-y-auto p-3 sm:p-6">
                            {countyDetail.by_landcover.map(lc => {
                                const sortedDistributions = [...lc.distributions].sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib))
                                return (
                                    <div key={lc.lc_type} className="mb-6 sm:mb-8 p-3 sm:p-4 bg-background border border-border rounded">
                                        <h3 className="mt-0 mb-2 text-base sm:text-xl text-foreground">{lc.lc_type}</h3>
                                        <div className="text-xs sm:text-sm text-muted-foreground mb-4 space-y-0.5 sm:space-y-0">
                                            <p className="sm:inline">County: {lc.n_county.toLocaleString()}<span className="hidden sm:inline"> | </span></p>
                                            <p className="sm:inline">Pool: {lc.n_pool.toLocaleString()}<span className="hidden sm:inline"> | </span></p>
                                            <p className="sm:inline">Neighbors: {lc.num_neighbors}<span className="hidden sm:inline"> | </span></p>
                                            <p className="sm:inline">KL: {lc.kl_div.toFixed(4)}<span className="hidden sm:inline"> | </span></p>
                                            <p className="sm:inline">L1: {lc.l1_distance.toFixed(4)}</p>
                                        </div>
                                        <div className="mb-6">
                                            <h4 className="mb-3 text-base font-semibold text-foreground">Color Distribution (KL Contribution)</h4>
                                            <div className="space-y-1.5 border border-border rounded-lg p-3 bg-muted/30">
                                                {sortedDistributions.map((dist) => {
                                                    const maxContrib = Math.max(...sortedDistributions.map(d => Math.abs(d.contrib)))
                                                    const barWidth = maxContrib > 0 ? (Math.abs(dist.contrib) / maxContrib) * 100 : 0
                                                    return (
                                                        <div key={dist.clr} className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
                                                            <span className="w-16 sm:w-24 flex items-center gap-1 sm:gap-2 truncate">
                                                                {dist.clr === 'foo' || dist.clr === 'bar' ? (
                                                                    <span className="w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-muted flex items-center justify-center text-[8px] font-bold text-muted-foreground shrink-0">?</span>
                                                                ) : (
                                                                    <span className="w-3 h-3 sm:w-4 sm:h-4 rounded-full border border-border shrink-0" style={{ backgroundColor: COLOR_MAP[dist.clr] || '#ccc' }} />
                                                                )}
                                                                <span className="truncate">{dist.clr}</span>
                                                            </span>
                                                            <div className="flex-1 h-2.5 sm:h-3 bg-muted rounded overflow-hidden">
                                                                <div className="h-full rounded" style={{ width: `${barWidth}%`, backgroundColor: dist.contrib >= 0 ? '#6b7280' : '#dc2626' }} />
                                                            </div>
                                                            <span className="w-14 sm:w-20 text-right font-medium text-foreground">{dist.contrib.toFixed(4)}</span>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                        <div className="mb-6">
                                            <h4 className="mb-3 text-base font-semibold text-foreground">Deviation from Regional Norm</h4>
                                            <DeviationChart distributions={lc.distributions} />
                                        </div>
                                        <div className="mb-6">
                                            <h4 className="mb-3 text-base font-semibold text-foreground">Top Contributing Colors</h4>
                                            <TopContributorsChart distributions={lc.distributions} />
                                        </div>
                                        <div className="mt-4">
                                            <h4 className="mb-2 text-base font-semibold text-foreground">County vs Pooled Distribution</h4>
                                            <ComparisonChart distributions={lc.distributions} />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

function ComparisonChart({ distributions }: { distributions: ColorDistribution[] }) {
    const svgRef = useRef<SVGSVGElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    const renderChart = useCallback(() => {
        if (!svgRef.current || !containerRef.current || distributions.length === 0) return
        const containerWidth = containerRef.current.offsetWidth || 900
        const isMobile = containerWidth < 500
        const margin = { top: 20, right: isMobile ? 10 : 40, bottom: isMobile ? 90 : 120, left: isMobile ? 60 : 90 }
        const width = Math.max(containerWidth - margin.left - margin.right, 200)
        const height = 400 - margin.top - margin.bottom
        d3.select(svgRef.current).selectAll('*').remove()
        const svg = d3.select(svgRef.current).attr('width', width + margin.left + margin.right).attr('height', height + margin.top + margin.bottom).append('g').attr('transform', `translate(${margin.left},${margin.top})`)
        const sorted = [...distributions].sort((a, b) => b.p_pool - a.p_pool)
        const x = d3.scaleBand().domain(sorted.map(d => d.clr)).range([0, width]).padding(0.2)
        const y = d3.scaleLinear().domain([0, d3.max(sorted, d => Math.max(d.p_county, d.p_pool)) || 0.5]).range([height, 0])
        svg.selectAll('.bar-county').data(sorted).join('rect').attr('class', 'bar-county').attr('x', d => x(d.clr) || 0).attr('width', x.bandwidth() / 2).attr('y', d => y(d.p_county)).attr('height', d => height - y(d.p_county)).attr('fill', '#2166ac').attr('opacity', 0.7)
        svg.selectAll('.bar-pool').data(sorted).join('rect').attr('class', 'bar-pool').attr('x', d => (x(d.clr) || 0) + x.bandwidth() / 2).attr('width', x.bandwidth() / 2).attr('y', d => y(d.p_pool)).attr('height', d => height - y(d.p_pool)).attr('fill', chartColors.primary).attr('opacity', 0.7)
        const fontSize = isMobile ? '0.65rem' : '0.85rem'
        const labelSize = isMobile ? '0.75rem' : '1rem'
        svg.append('g').attr('transform', `translate(0,${height})`).call(d3.axisBottom(x)).attr('color', chartColors.axis).selectAll('text').attr('transform', isMobile ? 'rotate(-90)' : 'rotate(-45)').attr('text-anchor', 'end').attr('dx', isMobile ? '-0.5em' : '-0.5em').attr('dy', isMobile ? '-0.4em' : '0.5em').style('font-size', fontSize)
        svg.append('g').call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('.2%'))).attr('color', chartColors.axis).selectAll('text').style('font-size', fontSize)
        svg.append('text').attr('x', width / 2).attr('y', height + (isMobile ? 78 : 108)).attr('text-anchor', 'middle').attr('fill', chartColors.text.muted).style('font-size', labelSize).text('Color Category')
        svg.append('text').attr('transform', 'rotate(-90)').attr('x', -height / 2).attr('y', isMobile ? -48 : -72).attr('text-anchor', 'middle').attr('fill', chartColors.text.muted).style('font-size', labelSize).text('Probability')
        const legendSize = isMobile ? 10 : 15
        const legend = svg.append('g').attr('transform', `translate(${width - (isMobile ? 100 : 150)}, ${isMobile ? -10 : 20})`)
        legend.selectAll('.legend-item').data([{ label: 'County', color: '#2166ac' }, { label: 'Pooled', color: chartColors.primary }]).join('g').attr('class', 'legend-item').attr('transform', (_, i) => `translate(0, ${i * (legendSize + 5)})`).each(function(d) { const g = d3.select(this); g.append('rect').attr('width', legendSize).attr('height', legendSize).attr('fill', d.color).attr('opacity', 0.7); g.append('text').attr('x', legendSize + 5).attr('y', legendSize - 3).attr('fill', chartColors.text.primary).style('font-size', isMobile ? '0.7rem' : '0.9rem').text(d.label) })
    }, [distributions])

    useEffect(() => {
        renderChart()
        const handleResize = () => renderChart()
        window.addEventListener('resize', handleResize)
        let obs: ResizeObserver | null = null
        if (containerRef.current) { obs = new ResizeObserver(() => renderChart()); obs.observe(containerRef.current) }
        return () => { window.removeEventListener('resize', handleResize); if (obs && containerRef.current) obs.unobserve(containerRef.current) }
    }, [renderChart])

    return <div ref={containerRef} className="w-full overflow-x-auto"><svg ref={svgRef} className="w-full" style={{ minHeight: '300px' }}></svg></div>
}

function DeviationChart({ distributions }: { distributions: ColorDistribution[] }) {
    const sorted = [...distributions].map(d => ({ ...d, diff: d.p_county - d.p_pool })).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    const maxAbsDiff = Math.max(...sorted.map(d => Math.abs(d.diff)))
    return (
        <div className="border border-border rounded-lg p-3 sm:p-4 bg-muted/30">
            <div className="space-y-2">
                {sorted.map((dist) => {
                    const diff = dist.diff; const absDiff = Math.abs(diff); const barWidth = maxAbsDiff > 0 ? (absDiff / maxAbsDiff) * 100 : 0; const isOver = diff > 0
                    return (
                        <div key={dist.clr} className="flex items-center gap-1.5 sm:gap-3 text-xs sm:text-sm">
                            <span className="w-16 sm:w-24 flex items-center gap-1 sm:gap-2 truncate">
                                {dist.clr === 'foo' || dist.clr === 'bar' ? <span className="w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-muted shrink-0" /> : <span className="w-3 h-3 sm:w-4 sm:h-4 rounded-full border border-border shrink-0" style={{ backgroundColor: COLOR_MAP[dist.clr] || '#ccc' }} />}
                                <span className="truncate">{dist.clr}</span>
                            </span>
                            <div className="flex-1 flex items-center gap-1.5 sm:gap-2">
                                <div className="flex-1 h-3 sm:h-4 bg-muted rounded overflow-hidden relative">
                                    <div className="absolute inset-0 flex items-center justify-center"><div className="h-px w-full bg-border" /></div>
                                    <div className={`h-full rounded transition-all ${isOver ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${barWidth}%`, marginLeft: isOver ? '50%' : `${50 - barWidth}%` }} />
                                </div>
                                <span className={`w-14 sm:w-24 text-right font-medium ${isOver ? 'text-red-600' : 'text-blue-600'}`}>{isOver ? '+' : ''}{diff.toFixed(4)}</span>
                            </div>
                        </div>
                    )
                })}
            </div>
            <div className="mt-3 pt-3 border-t border-border flex justify-between text-[10px] sm:text-xs text-muted-foreground"><span>Under-represented</span><span>Over-represented</span></div>
        </div>
    )
}

function TopContributorsChart({ distributions }: { distributions: ColorDistribution[] }) {
    const top = [...distributions].sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib)).slice(0, 10)
    const maxProb = Math.max(...top.map(d => Math.max(d.p_county, d.p_pool)))
    return (
        <div className="border border-border rounded-lg p-3 sm:p-4 bg-muted/30">
            <div className="space-y-3 sm:space-y-4">
                {top.map((dist) => (
                    <div key={dist.clr} className="space-y-1">
                        <div className="flex items-center justify-between text-xs sm:text-sm">
                            <div className="flex items-center gap-1.5 sm:gap-2">
                                {dist.clr === 'foo' || dist.clr === 'bar' ? <span className="w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-muted shrink-0" /> : <span className="w-3 h-3 sm:w-4 sm:h-4 rounded-full border border-border shrink-0" style={{ backgroundColor: COLOR_MAP[dist.clr] || '#ccc' }} />}
                                <span className="font-medium">{dist.clr}</span>
                                <span className="text-[10px] sm:text-xs text-muted-foreground">(KL: {dist.contrib.toFixed(4)})</span>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5 sm:gap-2">
                                <span className="w-14 sm:w-20 text-[10px] sm:text-xs text-muted-foreground">County:</span>
                                <div className="flex-1 h-2.5 sm:h-3 bg-muted rounded overflow-hidden"><div className="h-full bg-blue-600 rounded" style={{ width: `${maxProb > 0 ? (dist.p_county / maxProb) * 100 : 0}%` }} /></div>
                                <span className="w-12 sm:w-16 text-[10px] sm:text-xs text-right font-medium">{dist.p_county.toFixed(4)}</span>
                            </div>
                            <div className="flex items-center gap-1.5 sm:gap-2">
                                <span className="w-14 sm:w-20 text-[10px] sm:text-xs text-muted-foreground">Pool:</span>
                                <div className="flex-1 h-2.5 sm:h-3 bg-muted rounded overflow-hidden"><div className="h-full bg-sage-500 rounded" style={{ width: `${maxProb > 0 ? (dist.p_pool / maxProb) * 100 : 0}%` }} /></div>
                                <span className="w-12 sm:w-16 text-[10px] sm:text-xs text-right font-medium">{dist.p_pool.toFixed(4)}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
