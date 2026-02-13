import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { cn } from './lib/utils'

const API_URL = 'http://localhost:8000'
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json'

interface CountySummary {
    num_anomalies: number
    avg_divergence: number
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

export default function GroupDivergence() {
    const mapContainer = useRef<HTMLDivElement>(null)
    const map = useRef<maplibregl.Map | null>(null)
    const [mapData, setMapData] = useState<MapData | null>(null)
    const [selectedCounty, setSelectedCounty] = useState<CountyDetail | null>(null)
    const [selectedFips, setSelectedFips] = useState<string | null>(null)
    const [metric, setMetric] = useState<'num_anomalies' | 'avg_divergence'>('num_anomalies')
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

            map.current.addSource('counties', {
                type: 'geojson',
                data: mapData as any,
            })

            map.current.addLayer({
                id: 'counties-fill',
                type: 'fill',
                source: 'counties',
                paint: {
                    'fill-color': [
                        'interpolate',
                        ['linear'],
                        ['get', metric],
                        0, '#f7fbff',
                        2, '#deebf7',
                        4, '#c6dbef',
                        6, '#9ecae1',
                        8, '#6baed6',
                        10, '#3182bd',
                    ],
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
                        fetch(`${API_URL}/group-divergence/county/${fips}`)
                            .then(res => res.json())
                            .then(data => setSelectedCounty(data))
                            .catch(err => console.error('Failed to load county detail:', err))
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

        map.current.setPaintProperty('counties-fill', 'fill-color', [
            'interpolate',
            ['linear'],
            ['get', metric],
            0, '#f7fbff',
            metric === 'num_anomalies' ? 2 : 0.4, '#deebf7',
            metric === 'num_anomalies' ? 4 : 0.5, '#c6dbef',
            metric === 'num_anomalies' ? 6 : 0.6, '#9ecae1',
            metric === 'num_anomalies' ? 8 : 0.7, '#6baed6',
            metric === 'num_anomalies' ? 10 : 0.8, '#3182bd',
        ])
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
                            .map((lc) => (
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
                                    <div className="text-2xl font-bold">
                                        {lc.divergence.toFixed(3)}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1">
                                        JS Divergence from baseline
                                    </div>
                                </div>
                            ))}
                    </div>

                    <div className="mt-6 p-3 bg-blue-50 rounded-lg text-xs text-gray-700">
                        <strong>Note:</strong> Divergence measures how different this county's color distribution
                        is from the statewide baseline for each landcover type. Higher = more unusual.
                    </div>
                </div>
            )}
        </div>
    )
}
