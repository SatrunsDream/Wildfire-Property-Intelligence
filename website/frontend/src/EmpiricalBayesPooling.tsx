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

interface BaselineDistribution { lc_type: string; clr: string; baseline_prop: number }
interface StabilizedDistribution { fips: number; lc_type: string; clr: string; count: number; exposure: number; observed_prop: number; baseline_prop: number; shrinkage_weight: number; stabilized_prop: number; movement: number; abs_movement: number; effective_n: number; exposure_bin: string }
interface CountyMapData { type: 'FeatureCollection'; features: GeoJSON.Feature[]; metric: string; lc_type: string | null; stats: { total_counties: number; mean_value: number; max_value: number } }
interface CountyDetail { fips: string; county_name: string; by_landcover: Array<{ lc_type: string; total_exposure: number; mean_shrinkage_weight: number; max_abs_movement: number; num_categories: number; distributions: StabilizedDistribution[]; baseline: BaselineDistribution[] }>; total_landcover_types: number }

function buildMapData(stabilized: StabilizedDistribution[], geoFeatures: GeoJSON.Feature[], lc: string): CountyMapData {
    const filtered = lc ? stabilized.filter(r => r.lc_type === lc) : stabilized
    const byFips = new Map<number, { abs_movements: number[]; exposure: number; shrinkage_weights: number[]; top_color: string; top_movement: number }>()
    for (const r of filtered) {
        if (!byFips.has(r.fips)) byFips.set(r.fips, { abs_movements: [], exposure: r.exposure, shrinkage_weights: [], top_color: r.clr, top_movement: r.abs_movement })
        const e = byFips.get(r.fips)!
        e.abs_movements.push(r.abs_movement)
        e.shrinkage_weights.push(r.shrinkage_weight)
        if (r.abs_movement > e.top_movement) { e.top_movement = r.abs_movement; e.top_color = r.clr }
    }
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
        const mean_value = data.abs_movements.reduce((a, b) => a + b, 0) / data.abs_movements.length
        const max_value = Math.max(...data.abs_movements)
        const mean_sw = data.shrinkage_weights.reduce((a, b) => a + b, 0) / data.shrinkage_weights.length
        features.push({ type: 'Feature', geometry: geo.geometry, properties: { fips: fipsStr, county_name: geo.properties?.county_name || geo.properties?.name || fipsStr, mean_value, max_value, total_exposure: data.exposure, mean_shrinkage_weight: mean_sw, top_color: data.top_color, top_movement: data.top_movement } })
    }
    const allValues = features.map(f => f.properties!.mean_value as number)
    return { type: 'FeatureCollection', features, metric: 'abs_movement', lc_type: lc || null, stats: { total_counties: features.length, mean_value: allValues.length > 0 ? allValues.reduce((a, b) => a + b, 0) / allValues.length : 0, max_value: allValues.length > 0 ? Math.max(...allValues) : 0 } }
}

function buildCountyDetail(fipsNum: number, stabilized: StabilizedDistribution[], baseline: BaselineDistribution[], geoFeatures: GeoJSON.Feature[], lc: string): CountyDetail {
    const fipsStr = String(fipsNum).padStart(5, '0')
    const geo = geoFeatures.find(f => f.properties?.fips === fipsStr)
    const county_name = geo?.properties?.county_name || geo?.properties?.name || fipsStr
    const filteredStab = stabilized.filter(r => r.fips === fipsNum && (!lc || r.lc_type === lc))
    const lcTypes = [...new Set(filteredStab.map(r => r.lc_type))]
    const by_landcover = lcTypes.map(lcType => {
        const rows = filteredStab.filter(r => r.lc_type === lcType)
        const total_exposure = rows[0]?.exposure || 0
        const mean_sw = rows.reduce((a, r) => a + r.shrinkage_weight, 0) / rows.length
        const max_abs = Math.max(...rows.map(r => r.abs_movement))
        return { lc_type: lcType, total_exposure, mean_shrinkage_weight: mean_sw, max_abs_movement: max_abs, num_categories: rows.length, distributions: rows, baseline: baseline.filter(b => b.lc_type === lcType) }
    })
    return { fips: fipsStr, county_name, by_landcover, total_landcover_types: by_landcover.length }
}

export function EmpiricalBayesPooling() {
    const mapContainer = useRef<HTMLDivElement>(null)
    const map = useRef<maplibregl.Map | null>(null)
    const selectedLandcoverRef = useRef<string>('')
    const stabilizedRef = useRef<StabilizedDistribution[]>([])
    const baselineRef = useRef<BaselineDistribution[]>([])
    const geoFeaturesRef = useRef<GeoJSON.Feature[]>([])

    const [landcoverTypes, setLandcoverTypes] = useState<string[]>([])
    const [selectedLandcover, setSelectedLandcover] = useState<string>('')
    const [mapData, setMapData] = useState<CountyMapData | null>(null)
    const [countyDetail, setCountyDetail] = useState<CountyDetail | null>(null)
    const detailRef = useRef<HTMLDivElement>(null)
    const [showDetailPanel, setShowDetailPanel] = useState(false)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [legendRange, setLegendRange] = useState<{ min: number; max: number } | null>(null)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [isMapReady, setIsMapReady] = useState(false)
    const [dataLoaded, setDataLoaded] = useState(false)

    useEffect(() => { selectedLandcoverRef.current = selectedLandcover }, [selectedLandcover])

    useEffect(() => {
        Promise.all([
            fetch('/data/bayesian-baseline.json').then(r => r.json()),
            fetch('/data/bayesian-stabilized.json').then(r => r.json()),
            fetch('/data/group-divergence.json').then(r => r.json()),
        ]).then(([bl, stab, gd]) => {
            baselineRef.current = bl
            stabilizedRef.current = stab
            geoFeaturesRef.current = gd.map.features
            const lcs = [...new Set<string>(stab.map((r: StabilizedDistribution) => r.lc_type))].sort()
            setLandcoverTypes(lcs)
            setDataLoaded(true)
            setLoading(false)
        }).catch(err => { setError(`Failed to load data: ${err.message}`); setLoading(false) })
    }, [])

    const loadCountyDetail = useCallback((fipsStr: string) => {
        const fipsNum = parseInt(fipsStr, 10)
        const lc = selectedLandcoverRef.current
        const detail = buildCountyDetail(fipsNum, stabilizedRef.current, baselineRef.current, geoFeaturesRef.current, lc)
        setCountyDetail(detail)
        setShowDetailPanel(true)
    }, [])

    useEffect(() => {
        if (!mapContainer.current || map.current) return
        try {
            map.current = new maplibregl.Map({ container: mapContainer.current, style: MAP_STYLE, center: [-119.5, 37.0], zoom: 5.5 })
            map.current.addControl(new maplibregl.NavigationControl(), 'top-right')
            map.current.on('load', () => setIsMapReady(true))
            map.current.on('click', 'counties', (e) => {
                if (e.features && e.features[0]) {
                    const fips = (e.features[0].properties as any).fips
                    if (fips) { loadCountyDetail(fips); setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100) }
                }
            })
            map.current.on('error', () => setError('Map initialization error'))
        } catch { setError('Failed to initialize map') }
        return () => { if (map.current) { map.current.remove(); map.current = null } setIsMapReady(false) }
    }, [loadCountyDetail])

    useEffect(() => {
        if (!dataLoaded || !isMapReady) return
        const data = buildMapData(stabilizedRef.current, geoFeaturesRef.current, selectedLandcover)
        if (data.features.length > 0) setMapData(data)
        else setError('No data found for the selected filters')
    }, [dataLoaded, isMapReady, selectedLandcover])

    const updateMapLayer = (data: CountyMapData) => {
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
            const minVal = Math.min(...values); const maxVal = Math.max(...values)
            if (minVal !== maxVal) setLegendRange({ min: minVal, max: maxVal }); else setLegendRange(null)
            if (minVal === maxVal) {
                map.current.addLayer({ id: 'counties', type: 'fill', source: 'counties', paint: { 'fill-color': chartColors.primary, 'fill-opacity': 0.7 } })
            } else {
                const colorScale = d3.scaleSequential(d3.interpolateViridis).domain([minVal, maxVal])
                map.current.addLayer({ id: 'counties', type: 'fill', source: 'counties', paint: { 'fill-color': ['interpolate', ['linear'], ['get', 'mean_value'], minVal, colorScale(minVal), maxVal, colorScale(maxVal)], 'fill-opacity': 0.7 } })
            }
            map.current.addLayer({ id: 'counties-outline', type: 'line', source: 'counties', paint: { 'line-color': '#888', 'line-width': 1 } })
            const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false })
            // @ts-expect-error MapLibre types
            map.current.off('mousemove', 'counties'); map.current.off('mouseleave', 'counties')
            map.current.on('mousemove', 'counties', (e) => {
                if (!e.features || e.features.length === 0) return
                if (map.current) map.current.getCanvas().style.cursor = 'pointer'
                const props = e.features[0].properties as any
                let html = `<div style="font-size:12px;line-height:1.5"><div style="font-weight:bold;margin-bottom:6px">${props.county_name || 'Unknown'} County</div><div>Exposure: <strong>${props.total_exposure?.toLocaleString()}</strong></div><div>Mean Abs Movement: <strong>${props.mean_value?.toFixed(4)}</strong></div><div>Max Abs Movement: ${props.max_value?.toFixed(4)}</div><div>Mean Shrinkage: ${props.mean_shrinkage_weight?.toFixed(3)}</div>`
                if (props.top_color) html += `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #eee"><div style="font-size:11px;color:#666">Top Color Change:</div><div style="color:#d97706;font-weight:500">${props.top_color}</div></div>`
                html += `<div style="margin-top:6px;font-size:10px;color:#666">Click for details</div></div>`
                popup.setLngLat(e.lngLat).setHTML(html).addTo(map.current!)
            })
            map.current.on('mouseleave', 'counties', () => { if (map.current) { map.current.getCanvas().style.cursor = ''; popup.remove() } })
        } catch { setError('Failed to update map layer') }
    }

    useEffect(() => { if (isMapReady && mapData && map.current && mapData.features.length > 0) updateMapLayer(mapData) }, [isMapReady, mapData])
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape' && isFullscreen) setIsFullscreen(false) }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isFullscreen])
    useEffect(() => { setTimeout(() => map.current?.resize(), 100) }, [isFullscreen])

    const stats = mapData ? { mean_abs_movement: mapData.stats.mean_value, max_abs_movement: mapData.stats.max_value } : null

    return (
        <div className={cn('relative flex-1 min-h-0', isFullscreen && 'fixed top-0 left-0 right-0 bottom-0 w-screen h-screen z-[9999] bg-white')}>
            <div className="absolute inset-0">
                <div ref={mapContainer} className="w-full h-full" />
                {loading && <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-20">Loading map data...</div>}
                {error && <div className="absolute top-2.5 left-1/2 -translate-x-1/2 px-4 py-2 bg-red-50 border border-red-200 rounded text-red-600 text-sm z-10">{error}</div>}
                <div className="absolute top-2.5 left-2.5 flex flex-col gap-2 bg-white/95 rounded p-3 shadow-elevated z-10 w-48">
                    {stats && (
                        <div className="pb-2 mb-1 border-b border-border">
                            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Statistics</div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                <span className="text-muted-foreground">Mean Abs Movement:</span>
                                <span className="font-semibold text-foreground">{stats.mean_abs_movement.toFixed(4)}</span>
                                <span className="text-muted-foreground">Max Abs Movement:</span>
                                <span className="font-semibold text-foreground">{stats.max_abs_movement.toFixed(4)}</span>
                            </div>
                        </div>
                    )}
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Display</span>
                        <select value={selectedLandcover} onChange={(e) => { setSelectedLandcover(e.target.value); setCountyDetail(null); setShowDetailPanel(false) }} className="px-3 py-1.5 text-xs border border-border rounded bg-white cursor-pointer focus:outline-none focus:border-sage-400">
                            <option value="">All Landcover Types</option>
                            {landcoverTypes.map(lc => <option key={lc} value={lc}>{lc}</option>)}
                        </select>
                    </div>
                    <button className="px-3 py-1.5 border border-border rounded-sm bg-muted text-[11px] font-medium text-muted-foreground cursor-pointer uppercase tracking-wide transition-all duration-150 hover:bg-sage-100 hover:text-foreground hover:border-sage-300" onClick={() => setIsFullscreen(!isFullscreen)}>
                        {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                    </button>
                </div>
                {mapData && legendRange && (
                    <div className="absolute right-2.5 bottom-24 bg-white/95 p-3 rounded shadow-elevated text-xs z-10">
                        <div className="font-semibold mb-2 text-foreground">Absolute Movement</div>
                        <div className="w-44 h-2.5 rounded-sm" style={{ background: `linear-gradient(to right, ${d3.interpolateViridis(0)}, ${d3.interpolateViridis(1)})` }} />
                        <div className="flex justify-between mt-1 text-[10px] text-muted-foreground"><span>{legendRange.min.toFixed(4)}</span><span>{legendRange.max.toFixed(4)}</span></div>
                    </div>
                )}
            </div>
            {countyDetail && (
                <div ref={detailRef} className={cn('absolute bottom-0 left-0 right-0 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.15)] z-40 transition-all duration-300', showDetailPanel ? 'h-[65%]' : 'h-auto')}>
                    <div className="px-5 py-4 border-b border-border flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setShowDetailPanel(!showDetailPanel)}>
                        <h3 className="font-semibold text-base">{countyDetail.county_name} (FIPS: {countyDetail.fips})</h3>
                        <div className="flex items-center gap-3">
                            <button className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors" onClick={(e) => { e.stopPropagation(); setShowDetailPanel(!showDetailPanel) }}>{showDetailPanel ? 'Collapse' : 'Expand'}</button>
                            <button className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded text-xl leading-none" onClick={(e) => { e.stopPropagation(); setCountyDetail(null); setShowDetailPanel(false) }}>×</button>
                        </div>
                    </div>
                    {showDetailPanel && (
                        <div className="h-[calc(100%-65px)] overflow-y-auto p-6">
                            {countyDetail.by_landcover.map(lc => {
                                const sorted = [...lc.distributions].sort((a, b) => (b.movement ?? 0) - (a.movement ?? 0))
                                const maxMov = Math.max(...sorted.map(d => Math.abs(d.movement ?? 0)))
                                return (
                                    <div key={lc.lc_type} className="mb-8 p-4 bg-background border border-border rounded">
                                        <h3 className="mt-0 mb-2 text-xl text-foreground">{lc.lc_type}</h3>
                                        <p className="text-muted-foreground mb-4">Exposure: {lc.total_exposure.toLocaleString()} | Mean Shrinkage Weight: {lc.mean_shrinkage_weight.toFixed(3)} | Max Movement: {lc.max_abs_movement.toFixed(4)}</p>
                                        <div className="mb-6">
                                            <h4 className="mb-3 text-base font-semibold text-foreground">Color Distribution (Movement - Signed)</h4>
                                            <div className="space-y-1.5 border border-border rounded-lg p-3 bg-muted/30">
                                                {sorted.map((dist) => {
                                                    const mv = dist.movement ?? 0; const abs = Math.abs(mv); const bw = maxMov > 0 ? (abs / maxMov) * 100 : 0
                                                    return (
                                                        <div key={dist.clr} className="flex items-center gap-2 text-sm">
                                                            <span className="w-24 flex items-center gap-2 truncate">
                                                                {dist.clr === 'foo' || dist.clr === 'bar' ? <span className="w-4 h-4 rounded-full bg-gray-200" /> : <span className="w-4 h-4 rounded-full border border-border" style={{ backgroundColor: COLOR_MAP[dist.clr] || '#ccc' }} />}
                                                                {dist.clr}
                                                            </span>
                                                            <div className="flex-1 h-3 bg-muted rounded overflow-hidden"><div className="h-full rounded" style={{ width: `${bw}%`, backgroundColor: mv >= 0 ? '#6b7280' : '#dc2626' }} /></div>
                                                            <span className="w-20 text-right font-medium text-foreground">{mv.toFixed(4)}</span>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                        <div className="mt-4">
                                            <h4 className="mt-4 mb-2 text-base text-muted-foreground">Baseline vs Stabilized Distributions</h4>
                                            <ComparisonChart baseline={lc.baseline} stabilized={lc.distributions} />
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

function ComparisonChart({ baseline, stabilized }: { baseline: BaselineDistribution[]; stabilized: StabilizedDistribution[] }) {
    const svgRef = useRef<SVGSVGElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const renderChart = useCallback(() => {
        if (!svgRef.current || !containerRef.current || baseline.length === 0 || stabilized.length === 0) return
        const containerWidth = containerRef.current.offsetWidth || 900
        const margin = { top: 30, right: 40, bottom: 220, left: 70 }
        const width = Math.max(containerWidth - margin.left - margin.right, 600)
        const height = 400 - margin.top - margin.bottom
        d3.select(svgRef.current).selectAll('*').remove()
        const svg = d3.select(svgRef.current).attr('width', width + margin.left + margin.right).attr('height', height + margin.top + margin.bottom).append('g').attr('transform', `translate(${margin.left},${margin.top})`)
        const combined = baseline.map(b => { const s = stabilized.find(s => s.clr === b.clr); return { clr: b.clr, baseline: b.baseline_prop, stabilized: s?.stabilized_prop || 0, observed: s?.observed_prop || 0 } }).sort((a, b) => b.baseline - a.baseline)
        const x = d3.scaleBand().domain(combined.map(d => d.clr)).range([0, width]).padding(0.2)
        const y = d3.scaleLinear().domain([0, d3.max(combined, d => Math.max(d.baseline, d.stabilized, d.observed)) || 0.5]).range([height, 0])
        svg.selectAll('.bar-baseline').data(combined).join('rect').attr('class', 'bar-baseline').attr('x', d => x(d.clr) || 0).attr('width', x.bandwidth() / 3).attr('y', d => y(d.baseline)).attr('height', d => height - y(d.baseline)).attr('fill', chartColors.primary).attr('opacity', 0.7)
        svg.selectAll('.bar-observed').data(combined).join('rect').attr('class', 'bar-observed').attr('x', d => (x(d.clr) || 0) + x.bandwidth() / 3).attr('width', x.bandwidth() / 3).attr('y', d => y(d.observed)).attr('height', d => height - y(d.observed)).attr('fill', '#2166ac').attr('opacity', 0.7)
        svg.selectAll('.bar-stabilized').data(combined).join('rect').attr('class', 'bar-stabilized').attr('x', d => (x(d.clr) || 0) + (2 * x.bandwidth() / 3)).attr('width', x.bandwidth() / 3).attr('y', d => y(d.stabilized)).attr('height', d => height - y(d.stabilized)).attr('fill', '#d4a574').attr('opacity', 0.7)
        svg.append('g').attr('transform', `translate(0,${height})`).call(d3.axisBottom(x)).attr('color', chartColors.axis).selectAll('text').attr('transform', 'rotate(-45)').attr('text-anchor', 'end').attr('dx', '-0.5em').attr('dy', '0.5em').style('font-size', '0.85rem')
        svg.append('g').call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('.2%'))).attr('color', chartColors.axis)
        svg.append('text').attr('x', width / 2).attr('y', height + 70).attr('text-anchor', 'middle').attr('fill', chartColors.text.muted).style('font-size', '1rem').text('Color Category')
        svg.append('text').attr('transform', 'rotate(-90)').attr('x', -height / 2).attr('y', -50).attr('text-anchor', 'middle').attr('fill', chartColors.text.muted).style('font-size', '1rem').text('Proportion')
        const legend = svg.append('g').attr('transform', `translate(${width - 150}, 20)`)
        legend.selectAll('.legend-item').data([{ label: 'Baseline', color: chartColors.primary }, { label: 'Observed', color: '#2166ac' }, { label: 'Stabilized', color: '#d4a574' }]).join('g').attr('class', 'legend-item').attr('transform', (_, i) => `translate(0, ${i * 20})`).each(function(d) { const g = d3.select(this); g.append('rect').attr('width', 15).attr('height', 15).attr('fill', d.color).attr('opacity', 0.7); g.append('text').attr('x', 20).attr('y', 12).attr('fill', chartColors.text.primary).style('font-size', '0.9rem').text(d.label) })
    }, [baseline, stabilized])
    useEffect(() => {
        renderChart()
        const handleResize = () => renderChart()
        window.addEventListener('resize', handleResize)
        let obs: ResizeObserver | null = null
        if (containerRef.current) { obs = new ResizeObserver(() => renderChart()); obs.observe(containerRef.current) }
        return () => { window.removeEventListener('resize', handleResize); if (obs && containerRef.current) obs.unobserve(containerRef.current) }
    }, [renderChart])
    return <div ref={containerRef} className="w-full"><svg ref={svgRef} className="w-full" style={{ minHeight: '500px' }}></svg></div>
}
