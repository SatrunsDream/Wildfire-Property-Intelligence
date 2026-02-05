import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { cellToLatLng } from 'h3-js'
import { cn } from './lib/utils'

const API_URL = 'http://localhost:8000'

type ViewMode = 'counties' | 'hexes'

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json'

interface MapProps {
    contextCols: string[]
    target: string
    minSupport: number
    autoLoad?: boolean
}

export interface CaliforniaMapRef {
    flyToCounty: (fips: string) => void
    flyToLocation: (lng: number, lat: number, zoom?: number) => void
    flyToH3: (h3Index: string, zoom?: number) => void
}

const COUNTY_CENTROIDS: Record<string, [number, number]> = {
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

interface H3Level {
    res: number
    minZoom: number
    maxZoom: number
}

interface CountyMapData {
    type: 'FeatureCollection'
    features: GeoJSON.Feature[]
    alpha: number
}

interface HexMapData {
    by_resolution: Record<string, GeoJSON.FeatureCollection>
    alpha: number
    total_hexes: number
    levels: H3Level[]
}

const H3_LEVELS: H3Level[] = [
    { res: 5, minZoom: 0, maxZoom: 7 },
    { res: 6, minZoom: 6, maxZoom: 9 },
    { res: 7, minZoom: 8, maxZoom: 11 },
    { res: 8, minZoom: 10, maxZoom: 13 },
    { res: 9, minZoom: 12, maxZoom: 20 },
]

export const CaliforniaMap = forwardRef<CaliforniaMapRef, MapProps>(({ contextCols, target, minSupport, autoLoad = false }, ref) => {
    const mapContainer = useRef<HTMLDivElement>(null)
    const map = useRef<maplibregl.Map | null>(null)
    const [viewMode, setViewMode] = useState<ViewMode>('counties')
    const [loading, setLoading] = useState(false)
    const [countyData, setCountyData] = useState<CountyMapData | null>(null)
    const [hexData, setHexData] = useState<HexMapData | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [hexesVisible, setHexesVisible] = useState(true)

    useImperativeHandle(ref, () => ({
        flyToCounty: (fips: string) => {
            const coords = COUNTY_CENTROIDS[fips]
            if (coords && map.current) {
                map.current.flyTo({
                    center: coords,
                    zoom: 9,
                    duration: 1500
                })
            }
        },
        flyToLocation: (lng: number, lat: number, zoom = 10) => {
            if (map.current) {
                map.current.flyTo({
                    center: [lng, lat],
                    zoom,
                    duration: 1500
                })
            }
        },
        flyToH3: (h3Index: string, zoom = 14) => {
            if (map.current && h3Index) {
                try {
                    const [lat, lng] = cellToLatLng(h3Index)
                    map.current.flyTo({
                        center: [lng, lat],
                        zoom,
                        duration: 1500
                    })
                } catch (e) {
                    console.warn('Invalid h3 index:', h3Index, e)
                }
            }
        }
    }))

    useEffect(() => {
        if (autoLoad && viewMode === 'counties') {
            fetchCountyData()
        }
    }, [autoLoad])

    const fillColorExpr: maplibregl.ExpressionSpecification = [
        'case',
        ['==', ['get', 'max_surprisal'], null],
        '#333',
        [
            'interpolate',
            ['linear'],
            ['to-number', ['get', 'max_surprisal'], 0],
            0.0, '#2166ac',
            2.0, '#67a9cf',
            3.0, '#d1e5f0',
            4.0, '#f7f7f7',
            5.0, '#fddbc7',
            6.0, '#ef8a62',
            7.5, '#b2182b',
            9.5, '#67001f',
        ]
    ]

    const fetchCountyData = async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await fetch(`${API_URL}/map/counties`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    context_cols: contextCols,
                    target: target,
                    min_support: minSupport
                })
            })
            if (!res.ok) throw new Error('Failed to load county data')
            const data = await res.json()
            setCountyData(data)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error')
        } finally {
            setLoading(false)
        }
    }

    const fetchHexData = async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await fetch(`${API_URL}/map/hexes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    context_cols: contextCols,
                    target: target,
                    min_support: minSupport
                })
            })
            if (!res.ok) throw new Error('Failed to load hex data')
            const data = await res.json()
            setHexData(data)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (!mapContainer.current || map.current) return

        map.current = new maplibregl.Map({
            container: mapContainer.current,
            style: MAP_STYLE,
            center: [-119.5, 37.5],
            zoom: 5.5,
        })

        map.current.addControl(new maplibregl.NavigationControl(), 'top-right')

        return () => {
            map.current?.remove()
            map.current = null
        }
    }, [])

    useEffect(() => {
        if (!map.current || viewMode !== 'counties' || !countyData) return

        const sourceId = 'counties-data'
        const fillId = 'counties-fill'
        const outlineId = 'counties-outline'

        const removeHexLayers = () => {
            for (const level of H3_LEVELS) {
                const hexFillId = `hexes-fill-res${level.res}`
                const hexOutlineId = `hexes-outline-res${level.res}`
                const hexSourceId = `hexes-res${level.res}`
                if (map.current?.getLayer(hexFillId)) map.current.removeLayer(hexFillId)
                if (map.current?.getLayer(hexOutlineId)) map.current.removeLayer(hexOutlineId)
                if (map.current?.getSource(hexSourceId)) map.current.removeSource(hexSourceId)
            }
        }

        const addCountyLayers = () => {
            if (!map.current) return

            removeHexLayers()

            if (map.current.getLayer(outlineId)) map.current.removeLayer(outlineId)
            if (map.current.getLayer(fillId)) map.current.removeLayer(fillId)
            if (map.current.getSource(sourceId)) map.current.removeSource(sourceId)

            map.current.addSource(sourceId, {
                type: 'geojson',
                data: countyData as GeoJSON.FeatureCollection
            })

            map.current.addLayer({
                id: fillId,
                type: 'fill',
                source: sourceId,
                paint: {
                    'fill-color': fillColorExpr,
                    'fill-opacity': 0.7,
                },
            })

            map.current.addLayer({
                id: outlineId,
                type: 'line',
                source: sourceId,
                paint: {
                    'line-color': '#888',
                    'line-width': 1,
                },
            })

            const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false })

            map.current.on('mousemove', fillId, (e) => {
                if (!e.features || e.features.length === 0) return
                map.current!.getCanvas().style.cursor = 'pointer'
                const props = e.features[0].properties
                const name = props.name || 'Unknown'
                const maxSurp = props.max_surprisal?.toFixed(2) || 'N/A'
                const meanSurp = props.mean_surprisal?.toFixed(2) || 'N/A'
                const rows = props.total_rows?.toLocaleString() || '0'
                const html = `
                    <div style="font-size: 12px; line-height: 1.4;">
                        <div style="font-weight: bold; margin-bottom: 4px;">${name} County</div>
                        <div>Max Surprisal: <strong>${maxSurp}</strong></div>
                        <div>Mean Surprisal: ${meanSurp}</div>
                        <div>Rows: ${rows}</div>
                        ${props.top_anomaly_value ? `<div style="margin-top: 4px; color: #d97706;">Top: ${props.top_anomaly_value} (${props.top_anomaly_surprisal?.toFixed(2)})</div>` : ''}
                    </div>
                `
                popup.setLngLat(e.lngLat).setHTML(html).addTo(map.current!)
            })

            map.current.on('mouseleave', fillId, () => {
                map.current!.getCanvas().style.cursor = ''
                popup.remove()
            })
        }

        if (map.current.loaded()) {
            addCountyLayers()
        } else {
            map.current.on('load', addCountyLayers)
        }
    }, [countyData, viewMode])

    useEffect(() => {
        if (!map.current || viewMode !== 'hexes' || !hexData) return

        const removeCountyLayers = () => {
            const sourceId = 'counties-data'
            const fillId = 'counties-fill'
            const outlineId = 'counties-outline'
            if (map.current?.getLayer(outlineId)) map.current.removeLayer(outlineId)
            if (map.current?.getLayer(fillId)) map.current.removeLayer(fillId)
            if (map.current?.getSource(sourceId)) map.current.removeSource(sourceId)
        }

        const addHexLayers = () => {
            if (!map.current) return

            removeCountyLayers()

            for (const level of H3_LEVELS) {
                const hexFillId = `hexes-fill-res${level.res}`
                const hexOutlineId = `hexes-outline-res${level.res}`
                const hexSourceId = `hexes-res${level.res}`
                if (map.current.getLayer(hexFillId)) map.current.removeLayer(hexFillId)
                if (map.current.getLayer(hexOutlineId)) map.current.removeLayer(hexOutlineId)
                if (map.current.getSource(hexSourceId)) map.current.removeSource(hexSourceId)
            }

            for (const level of H3_LEVELS) {
                const res = level.res
                const sourceId = `hexes-res${res}`
                const fillId = `hexes-fill-res${res}`
                const outlineId = `hexes-outline-res${res}`

                const geojson = hexData.by_resolution[String(res)]
                if (!geojson) continue

                map.current.addSource(sourceId, {
                    type: 'geojson',
                    data: geojson
                })

                const fadeIn = level.minZoom
                const fadeOut = level.maxZoom
                const fullStart = fadeIn + 1
                const fullEnd = fadeOut - 1

                const opacityExpr: maplibregl.ExpressionSpecification = [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    fadeIn, 0,
                    fullStart, 0.7,
                    fullEnd, 0.7,
                    fadeOut, 0,
                ]

                const lineOpacityExpr: maplibregl.ExpressionSpecification = [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    fadeIn, 0,
                    fullStart, 1,
                    fullEnd, 1,
                    fadeOut, 0,
                ]

                map.current.addLayer({
                    id: fillId,
                    type: 'fill',
                    source: sourceId,
                    minzoom: fadeIn,
                    maxzoom: fadeOut,
                    paint: {
                        'fill-color': fillColorExpr,
                        'fill-opacity': opacityExpr,
                    },
                })

                map.current.addLayer({
                    id: outlineId,
                    type: 'line',
                    source: sourceId,
                    minzoom: fadeIn,
                    maxzoom: fadeOut,
                    paint: {
                        'line-color': '#555',
                        'line-width': 0.5,
                        'line-opacity': lineOpacityExpr,
                    },
                })

                const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false })

                if (res === 9) {
                    map.current.on('mousemove', fillId, (e) => {
                        if (!e.features || e.features.length === 0) return
                        map.current!.getCanvas().style.cursor = 'pointer'
                        const props = e.features[0].properties
                        const h3Id = props.h3 || 'Unknown'
                        const maxSurp = props.max_surprisal?.toFixed(2) || 'N/A'
                        const lcType = props.lc_type || 'N/A'
                        const fips = props.fips || 'N/A'

                        const anomalyValue = props.anomaly_value || null
                        const anomalyProb = props.anomaly_prob ? (props.anomaly_prob * 100).toFixed(1) : null
                        const anomalyContext = props.anomaly_context || null
                        const expected = props.expected || null

                        let anomalySection = ''
                        const surprisalNum = parseFloat(maxSurp)
                        if (anomalyValue && maxSurp !== 'N/A' && surprisalNum >= 4) {
                            const contextDesc = anomalyContext
                                ? `Compared to other ${anomalyContext} areas in county ${fips}`
                                : `Compared to similar areas in county ${fips}`
                            anomalySection = `
                                <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e5e5;">
                                    <div style="color: #d97706; font-weight: bold;">Why anomalous?</div>
                                    <div style="margin-top: 4px;">
                                        Observed: <span style="color: #dc2626; font-weight: bold;">${anomalyValue}</span>
                                        ${anomalyProb ? `<span style="color: #888;"> (${anomalyProb}% prob)</span>` : ''}
                                    </div>
                                    <div style="color: #888; font-size: 11px;">${contextDesc}</div>
                                    ${expected ? `<div style="margin-top: 4px; color: #16a34a; font-size: 11px;">Expected: ${expected}</div>` : ''}
                                </div>
                            `
                        }

                        const html = `
                            <div style="font-size: 12px; line-height: 1.4; max-width: 280px;">
                                <div style="font-weight: bold; margin-bottom: 4px; font-family: monospace;">${h3Id.slice(0, 12)}...</div>
                                <div>Land Cover: ${lcType}</div>
                                <div>FIPS: ${fips}</div>
                                <div>Max Surprisal: <strong style="color: ${parseFloat(maxSurp) > 6 ? '#dc2626' : parseFloat(maxSurp) > 4 ? '#d97706' : '#16a34a'}">${maxSurp} nats</strong></div>
                                ${anomalySection}
                            </div>
                        `
                        popup.setLngLat(e.lngLat).setHTML(html).addTo(map.current!)
                    })

                    map.current.on('mouseleave', fillId, () => {
                        map.current!.getCanvas().style.cursor = ''
                        popup.remove()
                    })
                }
            }
        }

        if (map.current.loaded()) {
            addHexLayers()
        } else {
            map.current.on('load', addHexLayers)
        }
    }, [hexData, viewMode])

    const handleViewChange = (mode: ViewMode) => {
        setViewMode(mode)
        if (mode === 'counties') {
            fetchCountyData()
        } else {
            fetchHexData()
        }
    }

    const handleRefresh = () => {
        if (viewMode === 'counties') {
            fetchCountyData()
        } else {
            fetchHexData()
        }
    }

    const toggleFullscreen = () => {
        setIsFullscreen(!isFullscreen)
    }

    const toggleHexVisibility = () => {
        const newVisible = !hexesVisible
        setHexesVisible(newVisible)

        if (!map.current) return
        const visibility = newVisible ? 'visible' : 'none'

        for (const level of H3_LEVELS) {
            const fillId = `hexes-fill-res${level.res}`
            const outlineId = `hexes-outline-res${level.res}`
            try {
                if (map.current.getLayer(fillId)) {
                    map.current.setLayoutProperty(fillId, 'visibility', visibility)
                }
                if (map.current.getLayer(outlineId)) {
                    map.current.setLayoutProperty(outlineId, 'visibility', visibility)
                }
            } catch {
                // Layer might not be ready
            }
        }
    }

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isFullscreen) {
                setIsFullscreen(false)
            }
            if ((e.key === 'h' || e.key === 'H') && viewMode === 'hexes') {
                toggleHexVisibility()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isFullscreen, hexesVisible, viewMode])

    useEffect(() => {
        setTimeout(() => {
            map.current?.resize()
        }, 100)
    }, [isFullscreen])

    return (
        <div className={cn(
            'relative border border-border rounded overflow-hidden mb-8',
            isFullscreen && 'fixed top-0 left-0 right-0 bottom-0 w-screen h-screen z-[9999] border-none rounded-none m-0'
        )}>
            {/* Map Controls */}
            <div className="absolute top-2.5 left-2.5 flex flex-col gap-2 bg-white/95 rounded p-3 shadow-elevated z-10">
                <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">View</span>
                    <div className="flex rounded-sm overflow-hidden border border-border">
                        <button
                            className={cn(
                                'px-3 py-1.5 border-none bg-muted text-xs font-medium text-muted-foreground cursor-pointer transition-all duration-150',
                                'hover:bg-sage-100 hover:text-foreground',
                                viewMode === 'counties' && 'bg-sage-500 text-white hover:bg-sage-600 hover:text-white'
                            )}
                            onClick={() => handleViewChange('counties')}
                        >
                            Counties
                        </button>
                        <button
                            className={cn(
                                'px-3 py-1.5 border-none border-l border-border bg-muted text-xs font-medium text-muted-foreground cursor-pointer transition-all duration-150',
                                'hover:bg-sage-100 hover:text-foreground',
                                viewMode === 'hexes' && 'bg-sage-500 text-white hover:bg-sage-600 hover:text-white'
                            )}
                            onClick={() => handleViewChange('hexes')}
                        >
                            H3 Hexes
                        </button>
                    </div>
                </div>
                <button
                    className="px-3 py-1.5 border border-border rounded-sm bg-muted text-[11px] font-medium text-muted-foreground cursor-pointer uppercase tracking-wide transition-all duration-150 hover:bg-sage-100 hover:text-foreground hover:border-sage-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={handleRefresh}
                    disabled={loading}
                >
                    {loading ? 'Loading...' : 'Refresh Map'}
                </button>
                {viewMode === 'hexes' && (
                    <button
                        className="px-3 py-1.5 border border-border rounded-sm bg-muted text-[11px] font-medium text-muted-foreground cursor-pointer uppercase tracking-wide transition-all duration-150 hover:bg-sage-100 hover:text-foreground hover:border-sage-300"
                        onClick={toggleHexVisibility}
                    >
                        {hexesVisible ? 'Hide Hexes' : 'Show Hexes'}
                    </button>
                )}
                <button
                    className="px-3 py-1.5 border border-border rounded-sm bg-muted text-[11px] font-medium text-muted-foreground cursor-pointer uppercase tracking-wide transition-all duration-150 hover:bg-sage-100 hover:text-foreground hover:border-sage-300"
                    onClick={toggleFullscreen}
                >
                    {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                </button>
            </div>

            {error && (
                <div className="absolute top-2.5 left-1/2 -translate-x-1/2 px-4 py-2 bg-red-50 border border-red-200 rounded text-red-600 text-sm z-10">
                    {error}
                </div>
            )}

            <div ref={mapContainer} className={cn('w-full h-[700px]', isFullscreen && 'h-screen')} />

            {/* Legend */}
            <div className="absolute bottom-7 right-2.5 bg-white/95 p-3 rounded shadow-elevated text-xs z-10">
                <div className="font-semibold mb-2 text-foreground">Max Surprisal (nats)</div>
                <div
                    className="w-44 h-2.5 rounded-sm"
                    style={{ background: 'linear-gradient(to right, #2166ac 0%, #67a9cf 20%, #d1e5f0 30%, #f7f7f7 40%, #fddbc7 50%, #ef8a62 60%, #b2182b 80%, #67001f 100%)' }}
                />
                <div className="flex justify-between mt-1 text-muted-foreground">
                    <span>2</span>
                    <span>5</span>
                    <span>9+</span>
                </div>
                <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
                    <span>Expected</span>
                    <span>Unusual</span>
                    <span>Anomalous</span>
                </div>
                {hexData && viewMode === 'hexes' && (
                    <div className="mt-1.5 text-[9px] text-muted-foreground italic">
                        {hexData.total_hexes.toLocaleString()} hexes (zoom for detail)
                    </div>
                )}
            </div>

            {/* Keybind Hints */}
            <div className="absolute bottom-2.5 left-2.5 flex flex-col gap-1 z-10">
                {isFullscreen && (
                    <span className="bg-white/90 px-2.5 py-1.5 rounded text-xs text-muted-foreground">
                        Press <kbd className="bg-sage-100 border border-sage-300 rounded px-1.5 py-0.5 font-semibold text-foreground">Esc</kbd> to exit fullscreen
                    </span>
                )}
                {viewMode === 'hexes' && (
                    <span className="bg-white/90 px-2.5 py-1.5 rounded text-xs text-muted-foreground">
                        Press <kbd className="bg-sage-100 border border-sage-300 rounded px-1.5 py-0.5 font-semibold text-foreground">H</kbd> to {hexesVisible ? 'hide' : 'show'} hexes
                    </span>
                )}
            </div>
        </div>
    )
})
