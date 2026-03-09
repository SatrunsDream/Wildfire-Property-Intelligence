import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import * as d3 from 'd3'
import { cn } from './lib/utils'

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json'

interface FreqRow { fips: number; lc_type: string; bldgtype: string; freq: number }
interface NeighborRow { county_fips: number; neighbor_fips: number }
interface MoranMapData { type: 'FeatureCollection'; features: GeoJSON.Feature[]; stats: { total_counties: number; mean_local: number; max_local: number; min_local: number; std_local: number } }
interface CategoryDetail { lc_type: string; bldgtype: string; frequency: number; neighbor_mean: number; neighbor_min: number; neighbor_max: number; neighbor_count: number }
interface CountyDetail { fips: string; county_name: string; num_neighbors: number; by_category: CategoryDetail[]; total_categories: number }

function computeMoransI(freqData: FreqRow[], neighbors: NeighborRow[], geoFeatures: GeoJSON.Feature[], lc: string, bldg: string): MoranMapData | null {
    // Filter and group by fips
    const filtered = freqData.filter(r => (!lc || r.lc_type === lc) && (!bldg || r.bldgtype === bldg))
    const xByFips = new Map<number, number>()
    for (const r of filtered) {
        xByFips.set(r.fips, (xByFips.get(r.fips) || 0) + r.freq)
    }
    if (xByFips.size < 3) return null

    // Build adjacency
    const adjMap = new Map<number, number[]>()
    for (const n of neighbors) {
        if (!adjMap.has(n.county_fips)) adjMap.set(n.county_fips, [])
        if (!adjMap.has(n.neighbor_fips)) adjMap.set(n.neighbor_fips, [])
        adjMap.get(n.county_fips)!.push(n.neighbor_fips)
        adjMap.get(n.neighbor_fips)!.push(n.county_fips)
    }

    const fipsList = [...xByFips.keys()]
    const values = fipsList.map(f => xByFips.get(f)!)
    const n = values.length
    const mean = values.reduce((a, b) => a + b, 0) / n
    const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / n
    if (variance === 0) return null
    const std = Math.sqrt(variance)

    // Compute local Moran's I
    const localI = new Map<number, number>()
    for (const fips of fipsList) {
        const xi = xByFips.get(fips)!
        const zi = (xi - mean) / std
        const neighborFips = adjMap.get(fips) || []
        const neighborVals = neighborFips.map(nf => xByFips.get(nf)).filter((v): v is number => v !== undefined)
        if (neighborVals.length === 0) { localI.set(fips, 0); continue }
        const weightedSum = neighborVals.reduce((a, v) => a + (v - mean) / std, 0) / neighborVals.length
        localI.set(fips, zi * weightedSum)
    }

    // Build GeoJSON
    const geoByFips = new Map<string, GeoJSON.Feature>()
    for (const f of geoFeatures) {
        const fp = f.properties?.fips as string
        if (fp) geoByFips.set(fp, f)
    }

    const features: GeoJSON.Feature[] = []
    for (const fips of fipsList) {
        const fipsStr = String(fips).padStart(5, '0')
        const geo = geoByFips.get(fipsStr)
        if (!geo) continue
        const local = localI.get(fips) ?? 0
        features.push({ type: 'Feature', geometry: geo.geometry, properties: { fips: fipsStr, county_name: geo.properties?.county_name || geo.properties?.name || fipsStr, local, x_value: xByFips.get(fips) } })
    }

    const localScores = features.map(f => f.properties!.local as number)
    const meanLocal = localScores.reduce((a, b) => a + b, 0) / localScores.length
    const stdLocal = Math.sqrt(localScores.reduce((a, v) => a + (v - meanLocal) ** 2, 0) / localScores.length)

    return { type: 'FeatureCollection', features, stats: { total_counties: features.length, mean_local: meanLocal, max_local: Math.max(...localScores), min_local: Math.min(...localScores), std_local: stdLocal } }
}

function buildCountyDetail(fipsNum: number, freqData: FreqRow[], neighbors: NeighborRow[], geoFeatures: GeoJSON.Feature[], lc: string, bldg: string): CountyDetail {
    const fipsStr = String(fipsNum).padStart(5, '0')
    const geo = geoFeatures.find(f => f.properties?.fips === fipsStr)
    const county_name = geo?.properties?.county_name || geo?.properties?.name || fipsStr

    // Build adjacency for this county
    const neighborFips = neighbors.filter(n => n.county_fips === fipsNum).map(n => n.neighbor_fips)
        .concat(neighbors.filter(n => n.neighbor_fips === fipsNum).map(n => n.county_fips))

    // Filter county's freq data
    const countyFreq = freqData.filter(r => r.fips === fipsNum && (!lc || r.lc_type === lc) && (!bldg || r.bldgtype === bldg))

    const by_category: CategoryDetail[] = countyFreq.map(r => {
        const neighborVals = neighborFips
            .map(nf => freqData.find(f => f.fips === nf && f.lc_type === r.lc_type && f.bldgtype === r.bldgtype)?.freq)
            .filter((v): v is number => v !== undefined)
        return {
            lc_type: r.lc_type,
            bldgtype: r.bldgtype,
            frequency: r.freq,
            neighbor_mean: neighborVals.length > 0 ? neighborVals.reduce((a, b) => a + b, 0) / neighborVals.length : 0,
            neighbor_min: neighborVals.length > 0 ? Math.min(...neighborVals) : 0,
            neighbor_max: neighborVals.length > 0 ? Math.max(...neighborVals) : 0,
            neighbor_count: neighborVals.length,
        }
    }).sort((a, b) => Math.abs(b.frequency - b.neighbor_mean) - Math.abs(a.frequency - a.neighbor_mean))

    return { fips: fipsStr, county_name, num_neighbors: neighborFips.length, by_category, total_categories: by_category.length }
}

export function MoransIMap() {
    const mapContainer = useRef<HTMLDivElement>(null)
    const map = useRef<maplibregl.Map | null>(null)
    const freqRef = useRef<FreqRow[]>([])
    const neighborsRef = useRef<NeighborRow[]>([])
    const geoFeaturesRef = useRef<GeoJSON.Feature[]>([])

    const [mapData, setMapData] = useState<MoranMapData | null>(null)
    const [countyDetail, setCountyDetail] = useState<CountyDetail | null>(null)
    const [showDetailPanel, setShowDetailPanel] = useState(false)
    const detailRef = useRef<HTMLDivElement>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [legendRange, setLegendRange] = useState<{ min: number; max: number } | null>(null)
    const [landcoverTypes, setLandcoverTypes] = useState<string[]>([])
    const [buildingTypes, setBuildingTypes] = useState<string[]>([])
    const [selectedLandcover, setSelectedLandcover] = useState<string>('')
    const [selectedBuildingType, setSelectedBuildingType] = useState<string>('')
    const [dataLoaded, setDataLoaded] = useState(false)
    const [isMapReady, setIsMapReady] = useState(false)

    const selectedLcRef = useRef('')
    const selectedBldgRef = useRef('')
    useEffect(() => { selectedLcRef.current = selectedLandcover }, [selectedLandcover])
    useEffect(() => { selectedBldgRef.current = selectedBuildingType }, [selectedBuildingType])

    useEffect(() => {
        Promise.all([
            fetch('/data/morans-freq.json').then(r => r.json()),
            fetch('/data/ca-county-neighbors.json').then(r => r.json()),
            fetch('/data/group-divergence.json').then(r => r.json()),
        ]).then(([freq, nbrs, gd]) => {
            freqRef.current = freq
            neighborsRef.current = nbrs
            geoFeaturesRef.current = gd.map.features
            const lcs = [...new Set<string>(freq.map((r: FreqRow) => r.lc_type))].sort()
            const bldgs = [...new Set<string>(freq.map((r: FreqRow) => r.bldgtype))].sort()
            setLandcoverTypes(lcs)
            setBuildingTypes(bldgs)
            setDataLoaded(true)
            setLoading(false)
        }).catch(err => { setError(`Failed to load data: ${err.message}`); setLoading(false) })
    }, [])

    // Recompute when filters or data change
    useEffect(() => {
        if (!dataLoaded || !isMapReady) return
        const result = computeMoransI(freqRef.current, neighborsRef.current, geoFeaturesRef.current, selectedLandcover, selectedBuildingType)
        if (result && result.features.length > 0) {
            setMapData(result)
            const scores = result.features.map(f => f.properties?.local as number).filter(v => v !== null && !isNaN(v))
            if (scores.length > 0) setLegendRange({ min: Math.min(...scores), max: Math.max(...scores) })
        } else {
            setError('No data found for the selected filters')
            setLegendRange(null)
        }
    }, [dataLoaded, isMapReady, selectedLandcover, selectedBuildingType])

    const loadCountyDetail = useCallback((fipsStr: string) => {
        const fipsNum = parseInt(fipsStr, 10)
        const detail = buildCountyDetail(fipsNum, freqRef.current, neighborsRef.current, geoFeaturesRef.current, selectedLcRef.current, selectedBldgRef.current)
        setCountyDetail(detail)
        setShowDetailPanel(true)
    }, [])

    useEffect(() => {
        if (!mapContainer.current || map.current) return
        try {
            const isMobile = window.innerWidth < 640
            map.current = new maplibregl.Map({ container: mapContainer.current, style: MAP_STYLE, center: [-119.5, 37.0], zoom: isMobile ? 4.5 : 5.5 })
            map.current.addControl(new maplibregl.NavigationControl(), 'top-right')
            map.current.once('load', () => setIsMapReady(true))
            map.current.on('error', () => setError('Map initialization error'))
        } catch { setError('Failed to initialize map') }
        return () => { if (map.current) { map.current.remove(); map.current = null } }
    }, [])

    const updateMapLayer = useCallback((data: MoranMapData) => {
        if (!map.current) return
        if (map.current.getLayer('counties')) map.current.removeLayer('counties')
        if (map.current.getLayer('counties-outline')) map.current.removeLayer('counties-outline')
        if (map.current.getSource('counties')) map.current.removeSource('counties')
        if (data.features.length === 0) return
        map.current.addSource('counties', { type: 'geojson', data: data })
        const scores = data.features.map(f => f.properties?.local).filter((v): v is number => v !== null && !isNaN(v))
        if (scores.length === 0) return
        const minVal = Math.min(...scores); const maxVal = Math.max(...scores)
        const colorScale = d3.scaleDiverging(d3.interpolateRdBu).domain([minVal, (minVal + maxVal) / 2, maxVal])
        map.current.addLayer({ id: 'counties', type: 'fill', source: 'counties', paint: { 'fill-color': ['interpolate', ['linear'], ['get', 'local'], minVal, colorScale(minVal), (minVal + maxVal) / 2, colorScale((minVal + maxVal) / 2), maxVal, colorScale(maxVal)], 'fill-opacity': 0.7 } })
        map.current.addLayer({ id: 'counties-outline', type: 'line', source: 'counties', paint: { 'line-color': '#888', 'line-width': 1 } })
        const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false })
        ;(map.current as any).off('mousemove', 'counties')
        ;(map.current as any).off('mouseleave', 'counties')
        ;(map.current as any).off('click', 'counties')
        map.current.on('mousemove', 'counties', (e: any) => {
            if (!e.features || e.features.length === 0) return
            if (map.current) map.current.getCanvas().style.cursor = 'pointer'
            const props = e.features[0].properties as any
            popup.setLngLat(e.lngLat).setHTML(`<div style="font-size:12px;line-height:1.5"><div style="font-weight:bold;margin-bottom:6px">${props.county_name || 'Unknown'} County</div><div>Local Moran's I: <strong>${props.local?.toFixed(4) || 'N/A'}</strong></div><div style="margin-top:6px;font-size:10px;color:#666">Click for details</div></div>`).addTo(map.current!)
        })
        map.current.on('mouseleave', 'counties', () => { if (map.current) { map.current.getCanvas().style.cursor = ''; popup.remove() } })
        map.current.on('click', 'counties', (e: any) => {
            if (!e.features || e.features.length === 0) return
            const props = e.features[0].properties as any
            if (props.fips) { loadCountyDetail(String(props.fips)); setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100) }
        })
    }, [loadCountyDetail])

    useEffect(() => {
        if (!isMapReady || !map.current || !mapData) return
        updateMapLayer(mapData)
    }, [isMapReady, mapData, updateMapLayer])

    const stats = mapData ? mapData.stats : null

    return (
        <div className="relative flex-1 min-h-0">
            <div className="absolute inset-0">
                <div ref={mapContainer} className="w-full h-full" />
                {loading && <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-20">Loading Moran's I data...</div>}
                {error && <div className="absolute top-2.5 left-1/2 -translate-x-1/2 px-4 py-2 bg-red-50 border border-red-200 rounded text-red-600 text-sm z-10">{error}</div>}
                <div className="absolute top-2.5 left-2.5 flex flex-col gap-2 bg-card/95 rounded p-2 sm:p-3 shadow-elevated z-10 w-40 sm:w-48">
                    {stats && (
                        <div className="pb-2 mb-1 border-b border-border">
                            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Statistics</div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                <span className="text-muted-foreground">Counties:</span>
                                <span className="font-semibold text-foreground">{stats.total_counties}</span>
                                <span className="text-muted-foreground">Mean Local I:</span>
                                <span className="font-semibold text-foreground">{stats.mean_local.toFixed(4)}</span>
                                <span className="text-muted-foreground">Range:</span>
                                <span className="font-semibold text-foreground">{stats.min_local.toFixed(4)} - {stats.max_local.toFixed(4)}</span>
                            </div>
                        </div>
                    )}
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Display</span>
                        <select value={selectedLandcover} onChange={(e) => { setSelectedLandcover(e.target.value); setCountyDetail(null); setShowDetailPanel(false) }} className="px-3 py-1.5 text-xs border border-border rounded bg-background cursor-pointer focus:outline-none focus:border-sage-400">
                            <option value="">All Landcover Types</option>
                            {landcoverTypes.map(lc => <option key={lc} value={lc}>{lc}</option>)}
                        </select>
                        <select value={selectedBuildingType} onChange={(e) => { setSelectedBuildingType(e.target.value); setCountyDetail(null); setShowDetailPanel(false) }} className="px-3 py-1.5 text-xs border border-border rounded bg-background cursor-pointer focus:outline-none focus:border-sage-400">
                            <option value="">All Building Types</option>
                            {buildingTypes.map(bldg => <option key={bldg} value={bldg}>{bldg}</option>)}
                        </select>
                    </div>
                </div>
                {legendRange && (
                    <div className="absolute right-2.5 bottom-20 sm:bottom-24 bg-card/95 p-2 sm:p-3 rounded shadow-elevated text-xs z-10">
                        <div className="font-semibold mb-1 sm:mb-2 text-foreground text-[10px] sm:text-xs">Local Moran's I</div>
                        <div className="w-28 sm:w-44 h-2 sm:h-2.5 rounded-sm" style={{ background: `linear-gradient(to right, ${d3.interpolateRdBu(0)}, ${d3.interpolateRdBu(0.5)}, ${d3.interpolateRdBu(1)})` }} />
                        <div className="flex justify-between mt-1 text-[9px] sm:text-[10px] text-muted-foreground"><span>{legendRange.min.toFixed(4)}</span><span>{legendRange.max.toFixed(4)}</span></div>
                        <div className="flex justify-between mt-1 text-[9px] sm:text-[10px] text-muted-foreground"><span>Clustering</span><span>Dispersion</span></div>
                    </div>
                )}
            </div>
            {countyDetail && (
                <div ref={detailRef} className={cn('absolute bottom-0 left-0 right-0 bg-card shadow-[0_-4px_20px_rgba(0,0,0,0.15)] z-40 transition-all duration-300', showDetailPanel ? 'h-[80%] sm:h-[65%]' : 'h-auto')}>
                    <div className="px-3 sm:px-5 py-3 sm:py-4 border-b border-border flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setShowDetailPanel(!showDetailPanel)}>
                        <h3 className="font-semibold text-sm sm:text-base truncate mr-2">{countyDetail.county_name} (FIPS: {countyDetail.fips})</h3>
                        <div className="flex items-center gap-3">
                            <button className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors" onClick={(e) => { e.stopPropagation(); setShowDetailPanel(!showDetailPanel) }}>{showDetailPanel ? 'Collapse' : 'Expand'}</button>
                            <button className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded text-xl leading-none" onClick={(e) => { e.stopPropagation(); setCountyDetail(null); setShowDetailPanel(false) }}>×</button>
                        </div>
                    </div>
                    {showDetailPanel && (
                        <div className="h-[calc(100%-55px)] sm:h-[calc(100%-65px)] overflow-y-auto p-3 sm:p-6">
                            <p className="text-xs sm:text-sm text-muted-foreground mb-3 sm:mb-4">Neighbors: {countyDetail.num_neighbors} | Categories: {countyDetail.total_categories}</p>
                            <div className="space-y-3 sm:space-y-4">
                                {countyDetail.by_category.map((cat, idx) => (
                                    <div key={idx} className="p-3 sm:p-4 bg-background border border-border rounded">
                                        <h3 className="mt-0 mb-2 text-base sm:text-lg text-foreground">{cat.lc_type} × {cat.bldgtype}</h3>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 sm:gap-y-2 text-xs sm:text-sm">
                                            <div><span className="text-muted-foreground">County Frequency:</span><span className="ml-2 font-semibold">{(cat.frequency * 100).toFixed(2)}%</span></div>
                                            <div><span className="text-muted-foreground">Neighbor Mean:</span><span className="ml-2 font-semibold">{(cat.neighbor_mean * 100).toFixed(2)}%</span></div>
                                            <div><span className="text-muted-foreground">Neighbor Range:</span><span className="ml-2 font-semibold">{(cat.neighbor_min * 100).toFixed(2)}% - {(cat.neighbor_max * 100).toFixed(2)}%</span></div>
                                            <div><span className="text-muted-foreground">Neighbor Count:</span><span className="ml-2 font-semibold">{cat.neighbor_count}</span></div>
                                        </div>
                                        <div className="mt-3 pt-3 border-t border-border">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-muted-foreground">Deviation:</span>
                                                <span className={`text-sm font-medium ${cat.frequency > cat.neighbor_mean ? 'text-red-600' : cat.frequency < cat.neighbor_mean ? 'text-blue-600' : 'text-muted-foreground'}`}>
                                                    {cat.frequency > cat.neighbor_mean ? '+' : ''}{((cat.frequency - cat.neighbor_mean) * 100).toFixed(2)}%
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
