import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { cn } from './lib/utils'

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json'

function buildFillColor(metric: 'num_anomalies' | 'avg_divergence') {
    const stops = metric === 'num_anomalies'
        ? [0, '#f7fbff', 2, '#deebf7', 4, '#c6dbef', 6, '#9ecae1', 8, '#6baed6', 10, '#3182bd']
        : [0, '#f7fbff', 0.4, '#deebf7', 0.5, '#c6dbef', 0.6, '#9ecae1', 0.7, '#6baed6', 0.8, '#3182bd']
    return ['interpolate', ['linear'], ['get', metric], ...stops]
}

const COLOR_MAP: Record<string, string> = {
    alabaster: '#f2efe8',
    amber: '#ffbf00',
    auburn: '#922b21',
    cocoa: '#7b4b2a',
    coffee: '#6f4e37',
    emerald: '#2ecc71',
    lemon: '#fff44f',
    lilac: '#c8a2c8',
    sage: '#8aaf7a',
    scarlet: '#ff2400',
    terracotta: '#c0654a',
    verde: '#4caf50',
}

function cssColor(name: string): string {
    return COLOR_MAP[name] ?? name
}

interface LandcoverDivergence {
    lc_type: string
    divergence: number
    anomalous: boolean
}

interface ColorEntry {
    color: string
    county_freq: number
    baseline_freq: number
}

interface LandcoverColors {
    lc_type: string
    county_total: number
    colors: ColorEntry[]
}

interface MapData {
    type: 'FeatureCollection'
    features: GeoJSON.Feature[]
    stats: {
        total_counties: number
        mean_anomalies: number
        max_anomalies: number
        mean_divergence: number
        max_divergence: number
    }
}

function SwatchStrip({ colors, freqKey, onHover }: {
    colors: ColorEntry[]
    freqKey: 'county_freq' | 'baseline_freq'
    onHover: (label: string | null) => void
}) {
    const total = colors.reduce((s, c) => s + c[freqKey], 0)
    if (total === 0) return <div className="h-5 bg-gray-100 rounded text-xs text-gray-400 flex items-center px-1">no data</div>
    return (
        <div className="flex h-5 rounded overflow-hidden">
            {colors.filter(c => c[freqKey] > 0).map(c => (
                <div
                    key={c.color}
                    style={{ flex: c[freqKey], backgroundColor: cssColor(c.color) }}
                    onMouseEnter={() => onHover(`${c.color}: ${(c[freqKey] * 100).toFixed(1)}%`)}
                    onMouseLeave={() => onHover(null)}
                />
            ))}
        </div>
    )
}

function ColorStrips({ colorData }: { colorData: LandcoverColors }) {
    const [hoverLabel, setHoverLabel] = useState<string | null>(null)
    return (
        <div className="space-y-1">
            <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-16 shrink-0">County</span>
                <div className="flex-1">
                    <SwatchStrip colors={colorData.colors} freqKey="county_freq" onHover={setHoverLabel} />
                </div>
            </div>
            <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-16 shrink-0">Statewide</span>
                <div className="flex-1">
                    <SwatchStrip colors={colorData.colors} freqKey="baseline_freq" onHover={setHoverLabel} />
                </div>
            </div>
            <div className="h-4 text-xs text-gray-500 italic">
                {hoverLabel ?? ''}
            </div>
        </div>
    )
}

export default function GroupDivergence() {
    const mapContainer = useRef<HTMLDivElement>(null)
    const map = useRef<maplibregl.Map | null>(null)
    const [mapData, setMapData] = useState<MapData | null>(null)
    const [byCounty, setByCounty] = useState<Record<string, LandcoverDivergence[]> | null>(null)
    const [allCountyColors, setAllCountyColors] = useState<Record<string, { by_landcover: LandcoverColors[] }> | null>(null)
    const [selectedDivergences, setSelectedDivergences] = useState<LandcoverDivergence[] | null>(null)
    const [selectedFips, setSelectedFips] = useState<string | null>(null)
    const [countyColors, setCountyColors] = useState<{ by_landcover: LandcoverColors[] } | null>(null)
    const [metric, setMetric] = useState<'num_anomalies' | 'avg_divergence'>('avg_divergence')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [isFullscreen, setIsFullscreen] = useState(false)

    // Load all static data on mount
    useEffect(() => {
        Promise.all([
            fetch('/data/group-divergence.json').then(r => r.json()),
            fetch('/data/county-colors.json').then(r => r.json()),
        ])
            .then(([gd, cc]) => {
                setMapData(gd.map)
                setByCounty(gd.by_county)
                setAllCountyColors(cc)
                setLoading(false)
            })
            .catch(err => {
                setError(`Failed to load data: ${err.message}`)
                setLoading(false)
            })
    }, [])

    // Initialize map
    useEffect(() => {
        if (!mapContainer.current || map.current || !mapData) return

        const isMobile = window.innerWidth < 640
        map.current = new maplibregl.Map({
            container: mapContainer.current,
            style: MAP_STYLE,
            center: [-119.4, 37.0],
            zoom: isMobile ? 4.5 : 5.5,
        })

        map.current.on('load', () => {
            if (!map.current) return

            map.current.resize()

            map.current.addSource('counties', {
                type: 'geojson',
                data: mapData as any,
            })

            map.current.addLayer({
                id: 'counties-fill',
                type: 'fill',
                source: 'counties',
                paint: {
                    'fill-color': buildFillColor(metric) as any,
                    'fill-opacity': 0.7,
                },
            })

            map.current.addLayer({
                id: 'counties-outline',
                type: 'line',
                source: 'counties',
                paint: {
                    'line-color': '#000',
                    'line-width': 1,
                },
            })

            const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false })

            map.current.on('mousemove', 'counties-fill', (e: maplibregl.MapLayerMouseEvent) => {
                if (!e.features || e.features.length === 0) return
                if (map.current) map.current.getCanvas().style.cursor = 'pointer'
                const props = e.features[0].properties as Record<string, unknown>
                const countyName = (props.county_name as string) || (props.name as string) || 'Unknown'
                const numAnomalies = props.num_anomalies as number | undefined
                const avgDiv = props.avg_divergence as number | undefined
                const html = `<div style="font-size:12px;line-height:1.5">
                    <div style="font-weight:bold;margin-bottom:6px">${countyName} County</div>
                    <div>Num Anomalies: <strong>${numAnomalies != null ? numAnomalies.toFixed(0) : 'N/A'}</strong></div>
                    <div>Avg Divergence: <strong>${avgDiv != null ? avgDiv.toFixed(4) : 'N/A'}</strong></div>
                    <div style="margin-top:6px;font-size:10px;color:#666">Click for details</div>
                </div>`
                popup.setLngLat(e.lngLat).setHTML(html).addTo(map.current!)
            })

            map.current.on('mouseleave', 'counties-fill', () => {
                if (map.current) { map.current.getCanvas().style.cursor = ''; popup.remove() }
            })

            map.current.on('click', 'counties-fill', (e) => {
                if (e.features && e.features.length > 0) {
                    const fips = e.features[0].properties?.fips as string | undefined
                    if (fips) {
                        setSelectedFips(fips)
                        setSelectedDivergences(byCounty?.[fips] ?? null)
                        setCountyColors(allCountyColors?.[fips] ?? null)
                    }
                }
            })
        })

        return () => {
            map.current?.remove()
            map.current = null
        }
    }, [mapData])

    // Update map colors when metric changes
    useEffect(() => {
        if (!map.current || !map.current.getLayer('counties-fill')) return
        map.current.setPaintProperty('counties-fill', 'fill-color', buildFillColor(metric))
    }, [metric])

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape' && isFullscreen) setIsFullscreen(false) }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isFullscreen])

    useEffect(() => { setTimeout(() => map.current?.resize(), 100) }, [isFullscreen])

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-lg">Loading JSD Conditional data...</div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-lg text-red-600">{error}</div>
            </div>
        )
    }

    return (
        <div className={cn('relative flex-1 min-h-0', isFullscreen && 'fixed top-0 left-0 right-0 bottom-0 w-screen h-screen z-[9999] bg-white')}>
            <div className="absolute inset-0">
                <div ref={mapContainer} className="w-full h-full" />
                {loading && <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-20">Loading map data...</div>}
                {error && <div className="absolute top-2.5 left-1/2 -translate-x-1/2 px-4 py-2 bg-red-50 border border-red-200 rounded text-red-600 text-sm z-10">{error}</div>}

                <div className="absolute top-2.5 left-2.5 flex flex-col gap-2 bg-white/95 rounded p-2 sm:p-3 shadow-elevated z-10 w-40 sm:w-48">
                    {mapData && (
                        <div className="pb-2 mb-1 border-b border-border">
                            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Statistics</div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                <span className="text-muted-foreground">Counties:</span>
                                <span className="font-semibold text-foreground">{mapData.stats.total_counties}</span>
                                <span className="text-muted-foreground">Mean {metric === 'num_anomalies' ? 'Anomalies' : 'Divergence'}:</span>
                                <span className="font-semibold text-foreground">
                                    {metric === 'num_anomalies' ? mapData.stats.mean_anomalies.toFixed(2) : mapData.stats.mean_divergence.toFixed(3)}
                                </span>
                                <span className="text-muted-foreground">Max {metric === 'num_anomalies' ? 'Anomalies' : 'Divergence'}:</span>
                                <span className="font-semibold text-foreground">
                                    {metric === 'num_anomalies' ? mapData.stats.max_anomalies.toFixed(0) : mapData.stats.max_divergence.toFixed(3)}
                                </span>
                            </div>
                        </div>
                    )}
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Display</span>
                        <select
                            value={metric}
                            onChange={(e) => setMetric(e.target.value as 'num_anomalies' | 'avg_divergence')}
                            className="px-3 py-1.5 text-xs border border-border rounded bg-white cursor-pointer focus:outline-none focus:border-sage-400"
                        >
                            <option value="num_anomalies">Number of Anomalies</option>
                            <option value="avg_divergence">Average Divergence</option>
                        </select>
                    </div>
                    <button
                        className="px-3 py-1.5 border border-border rounded-sm bg-muted text-[11px] font-medium text-muted-foreground cursor-pointer uppercase tracking-wide transition-all duration-150 hover:bg-sage-100 hover:text-foreground hover:border-sage-300"
                        onClick={() => setIsFullscreen(!isFullscreen)}
                    >
                        {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                    </button>
                </div>

                {/* Heat map legend - bottom right (like Conditional Pooling, Neighbor Divergence) */}
                {mapData && (
                    <div
                        className={cn(
                            'absolute right-2.5 bg-white/95 p-2 sm:p-3 rounded shadow-elevated text-xs z-10 transition-all duration-300',
                            selectedDivergences ? 'bottom-32' : 'bottom-20 sm:bottom-24'
                        )}
                    >
                        <div className="font-semibold mb-1 sm:mb-2 text-foreground text-[10px] sm:text-xs">
                            {metric === 'num_anomalies' ? 'Num Anomalies' : 'Avg Divergence'}
                        </div>
                        <div
                            className="w-28 sm:w-44 h-2 sm:h-2.5 rounded-sm"
                            style={{
                                background:
                                    metric === 'num_anomalies'
                                        ? 'linear-gradient(to right, #f7fbff, #deebf7, #c6dbef, #9ecae1, #6baed6, #3182bd)'
                                        : 'linear-gradient(to right, #f7fbff, #deebf7, #c6dbef, #9ecae1, #6baed6, #3182bd)',
                            }}
                        />
                        <div className="flex justify-between mt-1 text-[9px] sm:text-[10px] text-muted-foreground">
                            <span>0</span>
                            <span>
                                {metric === 'num_anomalies'
                                    ? mapData.stats.max_anomalies.toFixed(0)
                                    : mapData.stats.max_divergence.toFixed(3)}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {selectedDivergences && (
                <div className="absolute bottom-0 left-0 right-0 sm:bottom-auto sm:left-auto sm:top-2.5 sm:right-2.5 w-full sm:w-96 max-h-[75vh] sm:max-h-[calc(100vh-5rem)] bg-white/95 rounded-t-xl sm:rounded shadow-elevated p-3 sm:p-4 overflow-y-auto z-10">
                    <div className="mb-3 sm:mb-4">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-base sm:text-lg font-semibold">County {selectedFips}</h3>
                            <button
                                onClick={() => {
                                    setSelectedDivergences(null)
                                    setSelectedFips(null)
                                    setCountyColors(null)
                                }}
                                className="text-sm text-gray-500 hover:text-gray-700"
                            >
                                ✕
                            </button>
                        </div>
                        <p className="text-sm text-gray-600">
                            Divergence scores by landcover type
                        </p>
                    </div>

                    <div className="space-y-3">
                        {[...selectedDivergences]
                            .sort((a, b) => b.divergence - a.divergence)
                            .map((lc) => {
                                const colorData = countyColors?.by_landcover.find(b => b.lc_type === lc.lc_type)
                                return (
                                    <div
                                        key={lc.lc_type}
                                        className={cn(
                                            'p-3 rounded-lg border',
                                            lc.anomalous
                                                ? 'bg-red-50 border-red-300'
                                                : 'bg-gray-50 border-gray-200'
                                        )}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="font-medium text-sm">{lc.lc_type}</span>
                                            {lc.anomalous && (
                                                <span className="text-xs bg-red-200 text-red-800 px-2 py-0.5 rounded">
                                                    Anomalous
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-baseline gap-2 sm:gap-3 mb-2">
                                            <div className="text-xl sm:text-2xl font-bold">{lc.divergence.toFixed(3)}</div>
                                            {colorData && (
                                                <div className="text-xs text-gray-500">{colorData.county_total.toLocaleString()} structures</div>
                                            )}
                                        </div>

                                        {colorData ? (
                                            <ColorStrips colorData={colorData} />
                                        ) : (
                                            <div className="h-5 bg-gray-100 rounded" />
                                        )}

                                        <div className="text-xs text-gray-500 mt-2">
                                            JS Divergence from baseline
                                        </div>
                                    </div>
                                )
                            })}
                    </div>

                    <div className="mt-6 p-3 bg-blue-50 rounded-lg text-xs text-gray-700">
                        <strong>Note:</strong> Divergence measures how different this county's color distribution
                        is from the statewide baseline for each landcover type. Higher = more unusual.
                        Hover swatches to see color names and percentages.
                    </div>
                </div>
            )}
        </div>
    )
}
