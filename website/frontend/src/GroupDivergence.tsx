import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { cn } from './lib/utils'

const API_URL = 'http://localhost:8000'
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json'

function buildFillColor(metric: 'num_anomalies' | 'avg_divergence') {
    const stops = metric === 'num_anomalies'
        ? [0, '#f7fbff', 2, '#deebf7', 4, '#c6dbef', 6, '#9ecae1', 8, '#6baed6', 10, '#3182bd']
        : [0, '#f7fbff', 0.4, '#deebf7', 0.5, '#c6dbef', 0.6, '#9ecae1', 0.7, '#6baed6', 0.8, '#3182bd']
    return ['interpolate', ['linear'], ['get', metric], ...stops]
}

// CSS color approximations for non-standard names
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

interface CountyDetail {
    fips: number
    landcover_divergences: LandcoverDivergence[]
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

interface CountyColors {
    fips: number
    by_landcover: LandcoverColors[]
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
    const [selectedCounty, setSelectedCounty] = useState<CountyDetail | null>(null)
    const [selectedFips, setSelectedFips] = useState<string | null>(null)
    const [countyColors, setCountyColors] = useState<CountyColors | null>(null)
    const [metric, setMetric] = useState<'num_anomalies' | 'avg_divergence'>('avg_divergence')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Load map data
    useEffect(() => {
        fetch(`${API_URL}/group-divergence/map`)
            .then(res => res.json())
            .then(data => {
                setMapData(data)
                setLoading(false)
            })
            .catch(err => {
                setError(`Failed to load map data: ${err.message}`)
                setLoading(false)
            })
    }, [])

    // Initialize map
    useEffect(() => {
        if (!mapContainer.current || map.current || !mapData) return

        map.current = new maplibregl.Map({
            container: mapContainer.current,
            style: MAP_STYLE,
            center: [-119.4, 37.0],
            zoom: 5.5,
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

            map.current.on('click', 'counties-fill', (e) => {
                if (e.features && e.features.length > 0) {
                    const feature = e.features[0]
                    const fips = feature.properties?.fips

                    if (fips) {
                        setSelectedFips(fips)
                        setCountyColors(null)
                        fetch(`${API_URL}/group-divergence/county/${fips}`)
                            .then(res => res.json())
                            .then(data => setSelectedCounty(data))
                            .catch(err => console.error('Failed to load county detail:', err))
                        fetch(`${API_URL}/group-divergence/county/${fips}/colors`)
                            .then(res => res.json())
                            .then(data => setCountyColors(data))
                            .catch(err => console.error('Failed to load county colors:', err))
                    }
                }
            })

            map.current.on('mouseenter', 'counties-fill', () => {
                if (map.current) map.current.getCanvas().style.cursor = 'pointer'
            })

            map.current.on('mouseleave', 'counties-fill', () => {
                if (map.current) map.current.getCanvas().style.cursor = ''
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
        <div className="relative flex-1 min-h-0">
            {/* Map Container */}
            <div className="absolute inset-0">
                <div ref={mapContainer} className="w-full h-full" />

                {/* Controls */}
                <div className="absolute top-2.5 left-2.5 bg-white/95 rounded shadow-elevated p-3 space-y-3 z-10 w-48">
                    <div>
                        <h2 className="font-semibold text-lg mb-2">Group-Level Divergence</h2>
                        <p className="text-sm text-gray-600 mb-3">
                            Anomaly detection using Jensen-Shannon divergence on landcover-conditioned color distributions
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Color by:</label>
                        <select
                            value={metric}
                            onChange={(e) => setMetric(e.target.value as 'num_anomalies' | 'avg_divergence')}
                            className="w-full px-3 py-2 border rounded"
                        >
                            <option value="num_anomalies">Number of Anomalies</option>
                            <option value="avg_divergence">Average Divergence</option>
                        </select>
                    </div>

                    {mapData && (
                        <div className="text-xs text-gray-600 space-y-1 pt-2 border-t">
                            <div>Counties: {mapData.stats.total_counties}</div>
                            <div>Avg Anomalies: {mapData.stats.mean_anomalies.toFixed(2)}</div>
                            <div>Max Anomalies: {mapData.stats.max_anomalies.toFixed(0)}</div>
                            <div>Avg Divergence: {mapData.stats.mean_divergence.toFixed(3)}</div>
                        </div>
                    )}
                </div>
            </div>

            {/* County Detail Panel */}
            {selectedCounty && (
                <div className="absolute top-2.5 right-2.5 w-96 max-h-[calc(100vh-5rem)] bg-white/95 rounded shadow-elevated p-4 overflow-y-auto z-10">
                    <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-lg font-semibold">County {selectedFips}</h3>
                            <button
                                onClick={() => {
                                    setSelectedCounty(null)
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
                        {selectedCounty.landcover_divergences
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
                                        <div className="flex items-baseline gap-3 mb-2">
                                            <div className="text-2xl font-bold">{lc.divergence.toFixed(3)}</div>
                                            {colorData && (
                                                <div className="text-xs text-gray-500">{colorData.county_total.toLocaleString()} structures</div>
                                            )}
                                        </div>

                                        {colorData ? (
                                            <ColorStrips colorData={colorData} />
                                        ) : (
                                            <div className="h-5 bg-gray-100 rounded animate-pulse" />
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
