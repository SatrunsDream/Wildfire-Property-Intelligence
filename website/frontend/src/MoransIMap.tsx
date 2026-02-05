import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import * as d3 from 'd3'
import { cn } from './lib/utils'

const API_URL = 'http://localhost:8000'
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json'

interface MoranMapData {
    type: 'FeatureCollection'
    features: GeoJSON.Feature[]
    stats: {
        total_counties: number
        mean_local: number
        max_local: number
        min_local: number
        std_local: number
    }
}

interface CountyDetail {
    fips: string
    county_name: string
    local: number
}

export function MoransIMap() {
    const mapContainer = useRef<HTMLDivElement>(null)
    const map = useRef<maplibregl.Map | null>(null)
    const [mapData, setMapData] = useState<MoranMapData | null>(null)
    const [countyDetail, setCountyDetail] = useState<CountyDetail | null>(null)
    const [showDetailPanel, setShowDetailPanel] = useState(false)
    const detailRef = useRef<HTMLDivElement>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [legendRange, setLegendRange] = useState<{ min: number; max: number } | null>(null)

    // Load map data
    useEffect(() => {
        async function fetchData() {
            try {
                const response = await fetch(`${API_URL}/morans-i/map`)
                if (!response.ok) {
                    throw new Error('Failed to load Moran\'s I data')
                }
                const data = await response.json()
                setMapData(data)
                
                // Calculate legend range
                const localScores = data.features
                    .map((f: GeoJSON.Feature) => f.properties?.local)
                    .filter((v: any) => v !== null && v !== undefined && !isNaN(v))
                
                if (localScores.length > 0) {
                    const minVal = Math.min(...localScores)
                    const maxVal = Math.max(...localScores)
                    setLegendRange({ min: minVal, max: maxVal })
                }
            } catch (err) {
                console.error('Failed to load Moran\'s I data:', err)
                setError(err instanceof Error ? err.message : 'Failed to load Moran\'s I data')
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [])

    // Initialize map
    useEffect(() => {
        if (!mapContainer.current || map.current) return

        try {
            map.current = new maplibregl.Map({
                container: mapContainer.current,
                style: MAP_STYLE,
                center: [-119.5, 37.0],
                zoom: 5.5
            })

            map.current.addControl(new maplibregl.NavigationControl(), 'top-right')

            map.current.on('load', () => {
                // Map is ready
            })

            map.current.on('error', (e) => {
                console.error('Map error:', e)
                setError('Map initialization error')
            })
        } catch (err) {
            console.error('Failed to initialize map:', err)
            setError('Failed to initialize map')
        }

        return () => {
            if (map.current) {
                map.current.remove()
                map.current = null
            }
        }
    }, [])

    // Update map layer when data loads
    useEffect(() => {
        if (!map.current || !mapData) return

        const addLayers = () => {
            if (!map.current || !mapData) return

            // Remove existing layers
            if (map.current.getLayer('counties')) map.current.removeLayer('counties')
            if (map.current.getLayer('counties-outline')) map.current.removeLayer('counties-outline')
            if (map.current.getSource('counties')) map.current.removeSource('counties')

            if (mapData.features.length === 0) {
                return
            }

            // Add source
            map.current.addSource('counties', {
                type: 'geojson',
                data: mapData
            })

            // Get valid local scores for color scale
            const localScores = mapData.features
                .map(f => f.properties?.local)
                .filter((v: any) => v !== null && v !== undefined && !isNaN(v)) as number[]

            if (localScores.length === 0) {
                return
            }

            const minVal = Math.min(...localScores)
            const maxVal = Math.max(...localScores)

            // Create color scale: blue (negative/clustering) -> white (no autocorrelation) -> red (positive/dispersion)
            // Moran's I typically ranges from -1 to +1, but local values can vary
            const colorScale = d3.scaleDiverging(d3.interpolateRdBu)
                .domain([minVal, (minVal + maxVal) / 2, maxVal])

            // Add fill layer
            map.current.addLayer({
                id: 'counties',
                type: 'fill',
                source: 'counties',
                paint: {
                    'fill-color': [
                        'interpolate',
                        ['linear'],
                        ['get', 'local'],
                        minVal, colorScale(minVal),
                        (minVal + maxVal) / 2, colorScale((minVal + maxVal) / 2),
                        maxVal, colorScale(maxVal)
                    ],
                    'fill-opacity': 0.7
                }
            })

            // Add outline layer
            map.current.addLayer({
                id: 'counties-outline',
                type: 'line',
                source: 'counties',
                paint: {
                    'line-color': '#888',
                    'line-width': 1
                }
            })

            // Set up hover tooltip
            const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false })

            map.current.on('mousemove', 'counties', (e) => {
                if (!e.features || e.features.length === 0) return
                if (map.current) {
                    map.current.getCanvas().style.cursor = 'pointer'
                }

                const props = e.features[0].properties as any
                const countyName = props.name || props.county_name || 'Unknown'
                const localScore = props.local?.toFixed(4) || 'N/A'
                const fips = props.fips || 'N/A'

                const html = `
                    <div style="font-size: 12px; line-height: 1.5;">
                        <div style="font-weight: bold; margin-bottom: 6px; font-size: 13px;">${countyName} County</div>
                        <div style="margin-bottom: 4px;">FIPS: <strong>${fips}</strong></div>
                        <div style="margin-bottom: 4px;">Local Moran's I: <strong>${localScore}</strong></div>
                        <div style="margin-top: 6px; font-size: 10px; color: #666;">Click for details</div>
                    </div>
                `
                popup.setLngLat(e.lngLat).setHTML(html).addTo(map.current!)
            })

            map.current.on('mouseleave', 'counties', () => {
                if (map.current) {
                    map.current.getCanvas().style.cursor = ''
                }
                popup.remove()
            })

            // Set up click handler
            map.current.on('click', 'counties', (e) => {
                if (!e.features || e.features.length === 0) return
                const props = e.features[0].properties as any
                const fips = props.fips
                const countyName = props.name || props.county_name || 'Unknown'
                const localScore = props.local

                if (fips && localScore !== null && localScore !== undefined) {
                    setCountyDetail({
                        fips: String(fips),
                        county_name: countyName,
                        local: localScore
                    })
                    setShowDetailPanel(true)
                    setTimeout(() => {
                        detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }, 100)
                }
            })
        }

        if (map.current.loaded()) {
            addLayers()
        } else {
            map.current.on('load', addLayers)
        }
    }, [mapData])

    const stats = mapData ? mapData.stats : null

    return (
        <div className="relative flex-1 min-h-0">
            {/* Map Container - Full bleed */}
            <div className="absolute inset-0">
                <div ref={mapContainer} className="w-full h-full" />
                
                {/* Loading/Error overlays */}
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-20">
                        Loading Moran's I data...
                    </div>
                )}
                {error && (
                    <div className="absolute top-2.5 left-1/2 -translate-x-1/2 px-4 py-2 bg-red-50 border border-red-200 rounded text-red-600 text-sm z-10">
                        {error}
                    </div>
                )}

                {/* Map Controls - Top Left (Statistics and Display) */}
                <div className="absolute top-2.5 left-2.5 flex flex-col gap-2 bg-white/95 rounded p-3 shadow-elevated z-10">
                    {/* Statistics Summary */}
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
                    
                    {/* Display Section */}
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Display</span>
                        <div className="text-xs text-muted-foreground">
                            <div>Spatial Autocorrelation</div>
                            <div className="text-[10px] mt-1">Local Moran's I</div>
                        </div>
                    </div>
                </div>

                {/* Legend - Bottom Right */}
                {legendRange && (
                    <div className="absolute right-2.5 bottom-7 bg-white/95 p-3 rounded shadow-elevated text-xs z-10">
                        <div className="font-semibold mb-2 text-foreground">Local Moran's I</div>
                        <div
                            className="w-44 h-2.5 rounded-sm"
                            style={{
                                background: `linear-gradient(to right, ${d3.interpolateRdBu(0)}, ${d3.interpolateRdBu(0.5)}, ${d3.interpolateRdBu(1)})`
                            }}
                        />
                        <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
                            <span>{legendRange.min.toFixed(4)}</span>
                            <span>{legendRange.max.toFixed(4)}</span>
                        </div>
                        <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
                            <span>Clustering</span>
                            <span>Dispersion</span>
                        </div>
                    </div>
                )}
            </div>

            {/* County Detail Section - Below Map */}
            {countyDetail && (
                <div 
                    ref={detailRef}
                    className={cn(
                        'absolute bottom-0 left-0 right-0 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.15)] z-40 transition-all duration-300',
                        showDetailPanel ? 'h-[65%]' : 'h-auto'
                    )}
                >
                    {/* Panel Header - Always visible */}
                    <div
                        className="px-5 py-4 border-b border-border flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => setShowDetailPanel(!showDetailPanel)}
                    >
                        <div className="flex items-center gap-6">
                            <h3 className="font-semibold text-base">
                                {countyDetail.county_name} (FIPS: {countyDetail.fips})
                            </h3>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                                onClick={(e) => { e.stopPropagation(); setShowDetailPanel(!showDetailPanel) }}
                            >
                                {showDetailPanel ? 'Collapse' : 'Expand'}
                            </button>
                            <button
                                className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded text-xl leading-none"
                                onClick={(e) => { e.stopPropagation(); setCountyDetail(null); setShowDetailPanel(false) }}
                            >
                                ×
                            </button>
                        </div>
                    </div>

                    {/* Panel Content - Expandable */}
                    {showDetailPanel && (
                        <div className="h-[calc(100%-65px)] overflow-y-auto p-6">
                            <h2 className="mt-0 mb-4 text-2xl text-foreground">{countyDetail.county_name} (FIPS: {countyDetail.fips})</h2>
                            
                            <div className="space-y-4">
                                <div className="p-4 bg-background border border-border rounded">
                                    <h3 className="mt-0 mb-2 text-xl text-foreground">Local Moran's I Score</h3>
                                    <div className="text-3xl font-bold mb-2" style={{
                                        color: countyDetail.local > 0 ? '#dc2626' : countyDetail.local < 0 ? '#2563eb' : '#6b7280'
                                    }}>
                                        {countyDetail.local.toFixed(4)}
                                    </div>
                                    <p className="text-muted-foreground text-sm">
                                        {countyDetail.local > 0 
                                            ? 'Positive values indicate spatial clustering (similar values cluster together)'
                                            : countyDetail.local < 0
                                            ? 'Negative values indicate spatial dispersion (dissimilar values cluster together)'
                                            : 'Zero indicates no spatial autocorrelation'}
                                    </p>
                                </div>

                                {stats && (
                                    <div className="p-4 bg-muted/30 border border-border rounded">
                                        <h4 className="mt-0 mb-2 text-base font-semibold text-foreground">Statewide Statistics</h4>
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                            <div>
                                                <span className="text-muted-foreground">Mean:</span>
                                                <span className="ml-2 font-semibold">{stats.mean_local.toFixed(4)}</span>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground">Std Dev:</span>
                                                <span className="ml-2 font-semibold">{stats.std_local.toFixed(4)}</span>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground">Min:</span>
                                                <span className="ml-2 font-semibold">{stats.min_local.toFixed(4)}</span>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground">Max:</span>
                                                <span className="ml-2 font-semibold">{stats.max_local.toFixed(4)}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
