import { useEffect, useRef, useState, useCallback } from 'react'
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

interface CategoryDetail {
    lc_type: string
    bldgtype: string
    frequency: number
    neighbor_mean: number
    neighbor_min: number
    neighbor_max: number
    neighbor_count: number
}

interface CountyDetail {
    fips: string
    county_name: string
    num_neighbors: number
    by_category: CategoryDetail[]
    total_categories: number
}

export function MoransIMap() {
    const mapContainer = useRef<HTMLDivElement>(null)
    const map = useRef<maplibregl.Map | null>(null)
    const [mapData, setMapData] = useState<MoranMapData | null>(null)
    const [countyDetail, setCountyDetail] = useState<CountyDetail | null>(null)
    const [showDetailPanel, setShowDetailPanel] = useState(false)
    const detailRef = useRef<HTMLDivElement>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [legendRange, setLegendRange] = useState<{ min: number; max: number } | null>(null)
    const [landcoverTypes, setLandcoverTypes] = useState<string[]>([])
    const [buildingTypes, setBuildingTypes] = useState<string[]>([])
    const [selectedLandcover, setSelectedLandcover] = useState<string>('')
    const [selectedBuildingType, setSelectedBuildingType] = useState<string>('')
    const [isFullscreen, setIsFullscreen] = useState(false)

    useEffect(() => {
        fetch(`${API_URL}/morans-i/filters`)
            .then(res => res.json())
            .then(data => {
                if (data.landcover_types && Array.isArray(data.landcover_types)) {
                    setLandcoverTypes(data.landcover_types)
                }
                if (data.building_types && Array.isArray(data.building_types)) {
                    setBuildingTypes(data.building_types)
                }
            })
            .catch(err => setError(`Failed to load filters: ${err instanceof Error ? err.message : 'Unknown error'}`))
    }, [])

    const loadMapData = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const response = await fetch(`${API_URL}/morans-i/map`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lc_type: selectedLandcover || null,
                    bldgtype: selectedBuildingType || null
                })
            })

            if (!response.ok) {
                const errorText = await response.text()
                throw new Error(JSON.parse(errorText).detail || errorText)
            }

            const data = await response.json()
            if (data.features && data.features.length > 0) {
                setMapData(data)
                const localScores = data.features
                    .map((f: GeoJSON.Feature) => f.properties?.local)
                    .filter((v: any) => v !== null && v !== undefined && !isNaN(v))
                if (localScores.length > 0) {
                    setLegendRange({ min: Math.min(...localScores), max: Math.max(...localScores) })
                }
            } else {
                setError('No data found for the selected filters')
                setLegendRange(null)
                setMapData(null)
                if (map.current) {
                    if (map.current.getLayer('counties')) map.current.removeLayer('counties')
                    if (map.current.getLayer('counties-outline')) map.current.removeLayer('counties-outline')
                    if (map.current.getSource('counties')) map.current.removeSource('counties')
                }
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load map data')
        } finally {
            setLoading(false)
        }
    }, [selectedLandcover, selectedBuildingType])

    useEffect(() => {
        if (landcoverTypes.length > 0 && buildingTypes.length > 0) {
            loadMapData()
        }
    }, [selectedLandcover, selectedBuildingType, landcoverTypes.length, buildingTypes.length, loadMapData])

    const loadCountyDetail = useCallback(async (fips: string) => {
        try {
            const params = new URLSearchParams()
            if (selectedLandcover) params.append('lc_type', selectedLandcover)
            if (selectedBuildingType) params.append('bldgtype', selectedBuildingType)
            const paramStr = params.toString() ? `?${params.toString()}` : ''
            
            const response = await fetch(`${API_URL}/morans-i/county/${fips}${paramStr}`)
            if (!response.ok) throw new Error('Failed to load county detail')
            const data = await response.json()
            setCountyDetail(data)
            setShowDetailPanel(true)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load county detail')
        }
    }, [selectedLandcover, selectedBuildingType])

    const toggleFullscreen = () => setIsFullscreen(!isFullscreen)

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isFullscreen) setIsFullscreen(false)
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isFullscreen])

    useEffect(() => {
        setTimeout(() => map.current?.resize(), 100)
    }, [isFullscreen])

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

    const updateMapLayer = useCallback((data: MoranMapData) => {
        if (!map.current) return

        if (map.current.getLayer('counties')) map.current.removeLayer('counties')
        if (map.current.getLayer('counties-outline')) map.current.removeLayer('counties-outline')
        if (map.current.getSource('counties')) map.current.removeSource('counties')

        if (data.features.length === 0) return

        map.current.addSource('counties', {
            type: 'geojson',
            data: data
        })

        const localScores = data.features
            .map(f => f.properties?.local)
            .filter((v: any) => v !== null && v !== undefined && !isNaN(v)) as number[]

        if (localScores.length === 0) return

        const minVal = Math.min(...localScores)
        const maxVal = Math.max(...localScores)
        const colorScale = d3.scaleDiverging(d3.interpolateRdBu)
            .domain([minVal, (minVal + maxVal) / 2, maxVal])

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

        map.current.addLayer({
            id: 'counties-outline',
            type: 'line',
            source: 'counties',
            paint: {
                'line-color': '#888',
                'line-width': 1
            }
        })

        const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false })

        map.current.off('mousemove', 'counties')
        map.current.off('mouseleave', 'counties')
        map.current.off('click', 'counties')

        map.current.on('mousemove', 'counties', (e) => {
            if (!e.features || e.features.length === 0) return
            if (map.current) map.current.getCanvas().style.cursor = 'pointer'
            const props = e.features[0].properties as any
            const html = `
                <div style="font-size: 12px; line-height: 1.5;">
                    <div style="font-weight: bold; margin-bottom: 6px; font-size: 13px;">${props.county_name || 'Unknown'} County</div>
                    <div style="margin-bottom: 4px;">Local Moran's I: <strong>${props.local?.toFixed(4) || 'N/A'}</strong></div>
                    <div style="margin-top: 6px; font-size: 10px; color: #666;">Click for details</div>
                </div>
            `
            popup.setLngLat(e.lngLat).setHTML(html).addTo(map.current!)
        })

        map.current.on('mouseleave', 'counties', () => {
            if (map.current) {
                map.current.getCanvas().style.cursor = ''
                popup.remove()
            }
        })

        map.current.on('click', 'counties', (e) => {
            if (!e.features || e.features.length === 0) return
            const props = e.features[0].properties as any
            if (props.fips) {
                loadCountyDetail(String(props.fips))
                setTimeout(() => {
                    detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }, 100)
            }
        })
    }, [loadCountyDetail])

    useEffect(() => {
        if (map.current && mapData) {
            if (map.current.loaded()) {
                updateMapLayer(mapData)
            } else {
                map.current.on('load', () => updateMapLayer(mapData))
            }
        }
    }, [mapData, updateMapLayer])

    const stats = mapData ? mapData.stats : null

    return (
        <div className={cn(
            'relative flex-1 min-h-0',
            isFullscreen && 'fixed top-0 left-0 right-0 bottom-0 w-screen h-screen z-[9999] bg-white'
        )}>
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
                <div className="absolute top-2.5 left-2.5 flex flex-col gap-2 bg-white/95 rounded p-3 shadow-elevated z-10 w-48">
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
                    
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Display</span>
                        <select
                            value={selectedLandcover}
                            onChange={(e) => {
                                setSelectedLandcover(e.target.value)
                                setCountyDetail(null)
                                setShowDetailPanel(false)
                            }}
                            className="px-3 py-1.5 text-xs border border-border rounded bg-white cursor-pointer focus:outline-none focus:border-sage-400"
                        >
                            <option value="">All Landcover Types</option>
                            {landcoverTypes.map(lc => (
                                <option key={lc} value={lc}>{lc}</option>
                            ))}
                        </select>
                        <select
                            value={selectedBuildingType}
                            onChange={(e) => {
                                setSelectedBuildingType(e.target.value)
                                setCountyDetail(null)
                                setShowDetailPanel(false)
                            }}
                            className="px-3 py-1.5 text-xs border border-border rounded bg-white cursor-pointer focus:outline-none focus:border-sage-400"
                        >
                            <option value="">All Building Types</option>
                            {buildingTypes.map(bldg => (
                                <option key={bldg} value={bldg}>{bldg}</option>
                            ))}
                        </select>
                    </div>
                    
                    <button
                        className="px-3 py-1.5 border border-border rounded-sm bg-muted text-[11px] font-medium text-muted-foreground cursor-pointer uppercase tracking-wide transition-all duration-150 hover:bg-sage-100 hover:text-foreground hover:border-sage-300"
                        onClick={toggleFullscreen}
                    >
                        {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                    </button>
                </div>

                {/* Legend - Bottom Right */}
                {legendRange && (
                    <div className="absolute right-2.5 bottom-24 bg-white/95 p-3 rounded shadow-elevated text-xs z-10">
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

                    {showDetailPanel && (
                        <div className="h-[calc(100%-65px)] overflow-y-auto p-6">
                            <div className="mb-4">
                                <p className="text-muted-foreground mb-2">
                                    Neighbors: {countyDetail.num_neighbors} | Categories: {countyDetail.total_categories}
                                </p>
                            </div>

                            <div className="space-y-4">
                                {countyDetail.by_category.map((cat, idx) => (
                                    <div key={idx} className="p-4 bg-background border border-border rounded">
                                        <h3 className="mt-0 mb-2 text-lg text-foreground">
                                            {cat.lc_type} × {cat.bldgtype}
                                        </h3>
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                            <div>
                                                <span className="text-muted-foreground">County Frequency:</span>
                                                <span className="ml-2 font-semibold">{(cat.frequency * 100).toFixed(2)}%</span>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground">Neighbor Mean:</span>
                                                <span className="ml-2 font-semibold">{(cat.neighbor_mean * 100).toFixed(2)}%</span>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground">Neighbor Range:</span>
                                                <span className="ml-2 font-semibold">
                                                    {(cat.neighbor_min * 100).toFixed(2)}% - {(cat.neighbor_max * 100).toFixed(2)}%
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground">Neighbor Count:</span>
                                                <span className="ml-2 font-semibold">{cat.neighbor_count}</span>
                                            </div>
                                        </div>
                                        <div className="mt-3 pt-3 border-t border-border">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-muted-foreground">Deviation:</span>
                                                <span className={`text-sm font-medium ${
                                                    cat.frequency > cat.neighbor_mean ? 'text-red-600' : 
                                                    cat.frequency < cat.neighbor_mean ? 'text-blue-600' : 'text-muted-foreground'
                                                }`}>
                                                    {cat.frequency > cat.neighbor_mean ? '+' : ''}
                                                    {((cat.frequency - cat.neighbor_mean) * 100).toFixed(2)}%
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
