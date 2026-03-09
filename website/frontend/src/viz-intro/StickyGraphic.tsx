import { useRef, useEffect, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { FeatureCollection } from 'geojson'
import {
    MAP_CENTER,
    MAP_ZOOM,
    MAP_STYLE,
    COUNTY_SOURCE,
    COUNTY_FILL_LAYER,
    COUNTY_OUTLINE_LAYER,
    UNIFORM_FILL,
    DIVERGENCE_STOPS,
    SPOTLIGHT_CENTER,
    SPOTLIGHT_ZOOM,
    type SceneId,
} from './constants'

/** Normalize value to 0-1 for consistent legend mapping */
function normalizeTo01(val: number, min: number, max: number): number {
    const range = max - min
    if (range <= 0) return 0
    return Math.max(0, Math.min(1, (val - min) / range))
}

interface DivergenceData {
    counties: FeatureCollection
    edges: FeatureCollection
    stats: {
        total_pairs: number
        total_counties: number
        mean_jsd: number
        max_jsd: number
        min_jsd: number
    }
}

export interface SelectedPair {
    fips_a: string
    fips_b: string
    county_a: string
    county_b: string
}

const KL_COLOR_STOPS: [number, string][] = [
    [0.0, '#fde725'],
    [0.2, '#5ec962'],
    [0.4, '#21918c'],
    [0.6, '#3b528b'],
    [1.0, '#440154'],
]

export interface MapApi {
    showCounties: () => void
    hideCounties: () => void
    revealChoropleth: (progress: number) => void
    resetToUniform: () => void
    spotlightCounties: () => void
    resetFromSpotlight: () => void
    showKLChoropleth: (klByFips: Record<string, number>, onCountySelect: (fips: string) => void) => void
    showPostPoolingChoropleth: (jsdByFips: Record<string, number>) => void
}

interface SpotlightComparisonData {
    county_a: { name: string }
    county_b: { name: string }
}

interface StickyGraphicProps {
    scene: SceneId
    progress: number
    onReady: (api: MapApi, data: DivergenceData) => void
    onEdgeSelect?: (pair: SelectedPair) => void
    comparisonData?: SpotlightComparisonData | null
}

const SD_FIPS = '06073'

/** Filter edges to only those from San Diego to its neighbors */
function filterSdEdges(edges: FeatureCollection): FeatureCollection {
    const sdFeatures = edges.features.filter((f) => {
        const p = f.properties as Record<string, string> | undefined
        if (!p) return false
        return p.fips_a === SD_FIPS || p.fips_b === SD_FIPS
    })
    return { type: 'FeatureCollection', features: sdFeatures }
}

export function StickyGraphic({ scene, progress, onReady, onEdgeSelect, comparisonData }: StickyGraphicProps) {
    const mapContainer = useRef<HTMLDivElement>(null)
    const map = useRef<maplibregl.Map | null>(null)
    const [mapReady, setMapReady] = useState(false)
    const [data, setData] = useState<DivergenceData | null>(null)
    const layersAdded = useRef(false)
    const notifiedRef = useRef(false)

    // Fetch data
    useEffect(() => {
        fetch('/data/neighbor-divergence-map.json')
            .then((r) => r.json())
            .then((d: DivergenceData) => setData(d))
            .catch((e) => console.error('Failed to load divergence data', e))
    }, [])

    // Init map
    useEffect(() => {
        if (!mapContainer.current || map.current) return

        map.current = new maplibregl.Map({
            container: mapContainer.current,
            style: MAP_STYLE,
            center: MAP_CENTER,
            zoom: MAP_ZOOM,
        })

        // Disable all interactions
        map.current.scrollZoom.disable()
        map.current.boxZoom.disable()
        map.current.dragRotate.disable()
        map.current.dragPan.disable()
        map.current.keyboard.disable()
        map.current.doubleClickZoom.disable()
        map.current.touchZoomRotate.disable()

        map.current.on('load', () => setMapReady(true))

        return () => {
            map.current?.remove()
            map.current = null
            setMapReady(false)
        }
    }, [])

    // Add county layers
    useEffect(() => {
        if (!map.current || !mapReady || !data || layersAdded.current) return

        map.current.addSource(COUNTY_SOURCE, { type: 'geojson', data: data.counties })

        map.current.addLayer({
            id: COUNTY_FILL_LAYER,
            type: 'fill',
            source: COUNTY_SOURCE,
            paint: {
                'fill-color': UNIFORM_FILL,
                'fill-opacity': 0,
                'fill-opacity-transition': { duration: 600, delay: 0 },
                'fill-color-transition': { duration: 800, delay: 0 },
            },
        })

        map.current.addLayer({
            id: COUNTY_OUTLINE_LAYER,
            type: 'line',
            source: COUNTY_SOURCE,
            paint: {
                'line-color': '#94a3b8',
                'line-width': 0.7,
                'line-opacity': 0,
                'line-opacity-transition': { duration: 600, delay: 0 },
            },
        })

        // Build point centroids for county labels
        const centroids: GeoJSON.FeatureCollection = {
            type: 'FeatureCollection',
            features: data.counties.features.map((f) => {
                const coords = f.geometry.type === 'MultiPolygon'
                    ? f.geometry.coordinates.flat(2)
                    : f.geometry.type === 'Polygon'
                        ? f.geometry.coordinates.flat()
                        : []
                const lng = coords.reduce((s, c) => s + (c as number[])[0], 0) / coords.length
                const lat = coords.reduce((s, c) => s + (c as number[])[1], 0) / coords.length
                return {
                    type: 'Feature' as const,
                    properties: { name: f.properties?.name ?? '' },
                    geometry: { type: 'Point' as const, coordinates: [lng, lat] },
                }
            }),
        }

        map.current.addSource('county-labels', { type: 'geojson', data: centroids })
        map.current.addLayer({
            id: 'county-labels-text',
            type: 'symbol',
            source: 'county-labels',
            layout: {
                'text-field': ['get', 'name'],
                'text-size': ['interpolate', ['linear'], ['zoom'], 5, 9, 8, 12, 10, 14],
                'text-font': ['Open Sans Regular'],
                'text-anchor': 'center',
                'text-allow-overlap': false,
                'text-padding': 4,
            },
            paint: {
                'text-color': '#555',
                'text-halo-color': '#fcfbf8',
                'text-halo-width': 1.5,
                'text-opacity': 0,
                'text-opacity-transition': { duration: 600, delay: 0 },
            },
        })

        // SD paths (edges from San Diego to neighbors) — shown in spotlight
        const sdEdges = filterSdEdges(data.edges as FeatureCollection)
        map.current.addSource('sd-edges', { type: 'geojson', data: sdEdges })
        map.current.addLayer({
            id: 'sd-edges-line',
            type: 'line',
            source: 'sd-edges',
            layout: { visibility: 'none' },
            paint: {
                'line-color': [
                    'interpolate', ['linear'],
                    ['to-number', ['get', 'weighted_jsd'], 0],
                    0.0, '#fde725',
                    0.5, '#21918c',
                    1.0, '#440154',
                ] as maplibregl.ExpressionSpecification,
                'line-width': 4,
                'line-opacity': 0.9,
            },
        })

        const edgesLayerId = 'sd-edges-line'
        map.current.on('mouseenter', edgesLayerId, () => {
            if (map.current) map.current.getCanvas().style.cursor = 'pointer'
        })
        map.current.on('mouseleave', edgesLayerId, () => {
            if (map.current) map.current.getCanvas().style.cursor = ''
        })
        map.current.on('click', edgesLayerId, (e) => {
            if (!e.features?.length || !onEdgeSelect) return
            const p = e.features[0].properties as Record<string, string>
            onEdgeSelect({
                fips_a: p.fips_a ?? '',
                fips_b: p.fips_b ?? '',
                county_a: p.county_a ?? 'Unknown',
                county_b: p.county_b ?? 'Unknown',
            })
        })

        layersAdded.current = true
    }, [mapReady, data, onEdgeSelect])

    // --- Transition functions ---

    const showCounties = useCallback(() => {
        if (!map.current || !layersAdded.current) return
        map.current.setPaintProperty(COUNTY_FILL_LAYER, 'fill-color', UNIFORM_FILL)
        map.current.setPaintProperty(COUNTY_FILL_LAYER, 'fill-opacity', 0.55)
        map.current.setPaintProperty(COUNTY_OUTLINE_LAYER, 'line-opacity', 0.6)
        map.current.setPaintProperty('county-labels-text', 'text-opacity', 0.8)
    }, [])

    const hideCounties = useCallback(() => {
        if (!map.current || !layersAdded.current) return
        map.current.setPaintProperty(COUNTY_FILL_LAYER, 'fill-opacity', 0)
        map.current.setPaintProperty(COUNTY_OUTLINE_LAYER, 'line-opacity', 0)
        map.current.setPaintProperty('county-labels-text', 'text-opacity', 0)
    }, [])

    const revealChoropleth = useCallback((p: number) => {
        if (!map.current || !layersAdded.current) return
        const colorExpr: maplibregl.ExpressionSpecification = [
            'interpolate',
            ['linear'],
            ['to-number', ['get', 'max_divergence'], 0],
            ...DIVERGENCE_STOPS.flatMap(([stop, color]) => [stop, color]),
        ]
        map.current.setPaintProperty(COUNTY_FILL_LAYER, 'fill-color', colorExpr)
        map.current.setPaintProperty(COUNTY_FILL_LAYER, 'fill-opacity', 0.3 + p * 0.5)
        map.current.setPaintProperty(COUNTY_OUTLINE_LAYER, 'line-opacity', 0.4 + p * 0.5)
    }, [])

    const resetToUniform = useCallback(() => {
        if (!map.current || !layersAdded.current) return
        map.current.setPaintProperty(COUNTY_FILL_LAYER, 'fill-color', UNIFORM_FILL)
        map.current.setPaintProperty(COUNTY_FILL_LAYER, 'fill-opacity', 0.55)
    }, [])

    const spotlightCounties = useCallback(() => {
        const m = map.current
        if (!m || !layersAdded.current) return

        m.flyTo({ center: SPOTLIGHT_CENTER, zoom: SPOTLIGHT_ZOOM, duration: 1200 })

        // Light gray fill for all counties — paths stand out
        m.setPaintProperty(COUNTY_FILL_LAYER, 'fill-color', '#e8e8e4')
        m.setPaintProperty(COUNTY_FILL_LAYER, 'fill-opacity', 0.5)
        m.setPaintProperty(COUNTY_OUTLINE_LAYER, 'line-opacity', 0.6)
        m.setPaintProperty(COUNTY_OUTLINE_LAYER, 'line-width', 0.7)

        // Show SD paths (edges branching from San Diego to Imperial, Orange, Riverside)
        try {
            m.setLayoutProperty('sd-edges-line', 'visibility', 'visible')
        } catch {
            /* layer may not exist yet */
        }
    }, [])

    const resetFromSpotlight = useCallback(() => {
        const m = map.current
        if (!m || !layersAdded.current) return
        m.flyTo({ center: MAP_CENTER, zoom: MAP_ZOOM, duration: 1200 })
        m.setPaintProperty(COUNTY_FILL_LAYER, 'fill-color', UNIFORM_FILL)
        m.setPaintProperty(COUNTY_FILL_LAYER, 'fill-opacity', 0.55)
        m.setPaintProperty(COUNTY_OUTLINE_LAYER, 'line-width', 0.7)
        try {
            m.setLayoutProperty('sd-edges-line', 'visibility', 'none')
        } catch {
            /* ignore */
        }
    }, [])

    const countyClickHandlerRef = useRef<((e: maplibregl.MapLayerMouseEvent) => void) | null>(null)

    const SD_REGION_FIPS = ['06025', '06059', '06065', '06073']

    const showKLChoropleth = useCallback(
        (klByFips: Record<string, number>, onCountySelectCb: (fips: string) => void) => {
            const m = map.current
            if (!m || !layersAdded.current || !data) return

            // Merge mean_kl into county features; non-SD-region get -1 (gray)
            const mergedFeatures = data.counties.features.map((f) => {
                const fips = (f.properties as Record<string, unknown>)?.fips as string
                const isSdRegion = fips && SD_REGION_FIPS.includes(fips)
                const meanKl = isSdRegion && fips ? klByFips[fips] ?? 0 : -1
                return {
                    ...f,
                    properties: { ...f.properties, mean_kl: meanKl },
                }
            })
            const mergedGeo: FeatureCollection = {
                type: 'FeatureCollection',
                features: mergedFeatures,
            }

            const values = mergedFeatures
                .map((f) => (f.properties as Record<string, number>)?.mean_kl)
                .filter((v): v is number => typeof v === 'number' && v >= 0 && !isNaN(v) && isFinite(v))
            const minVal = values.length ? Math.min(...values) : 0
            const maxVal = values.length ? Math.max(...values) : 1
            const range = maxVal - minVal || 1

            const src = m.getSource(COUNTY_SOURCE) as maplibregl.GeoJSONSource
            if (src) src.setData(mergedGeo)

            const colorExpr: maplibregl.ExpressionSpecification = [
                'case',
                ['<', ['get', 'mean_kl'], 0],
                '#e8e8e4',
                [
                    'interpolate',
                    ['linear'],
                    ['get', 'mean_kl'],
                    minVal,
                    KL_COLOR_STOPS[0][1],
                    minVal + range * 0.2,
                    KL_COLOR_STOPS[1][1],
                    minVal + range * 0.4,
                    KL_COLOR_STOPS[2][1],
                    minVal + range * 0.6,
                    KL_COLOR_STOPS[3][1],
                    maxVal,
                    KL_COLOR_STOPS[4][1],
                ],
            ]

            m.setPaintProperty(COUNTY_FILL_LAYER, 'fill-color', colorExpr)
            m.setPaintProperty(COUNTY_FILL_LAYER, 'fill-opacity', 0.7)
            m.setPaintProperty(COUNTY_OUTLINE_LAYER, 'line-opacity', 0.6)
            m.setPaintProperty('county-labels-text', 'text-opacity', 0.9)
            try {
                m.setLayoutProperty('sd-edges-line', 'visibility', 'none')
            } catch {
                /* ignore */
            }
            m.flyTo({ center: SPOTLIGHT_CENTER, zoom: SPOTLIGHT_ZOOM, duration: 800 })

            const handler = (e: maplibregl.MapLayerMouseEvent) => {
                if (!e.features?.length || !onCountySelectCb) return
                const fips = (e.features[0].properties as Record<string, string>)?.fips
                if (fips && SD_REGION_FIPS.includes(fips)) onCountySelectCb(fips)
            }
            countyClickHandlerRef.current = handler
            m.on('click', COUNTY_FILL_LAYER, handler)
            m.on('mouseenter', COUNTY_FILL_LAYER, () => {
                if (m.getCanvas()) m.getCanvas().style.cursor = 'pointer'
            })
            m.on('mouseleave', COUNTY_FILL_LAYER, () => {
                if (m.getCanvas()) m.getCanvas().style.cursor = ''
            })
        },
        [data]
    )

    const showPostPoolingChoropleth = useCallback(
        (jsdByFips: Record<string, number>) => {
            const m = map.current
            if (!m || !layersAdded.current || !data) return

            // Only SD region: use POST-POOLING JSD (from jsdByFips), rest gray
            const mergedFeatures = data.counties.features.map((f) => {
                const fips = (f.properties as Record<string, unknown>)?.fips as string
                const isSdRegion = fips && SD_REGION_FIPS.includes(fips)
                const pooledJsd = isSdRegion && fips ? jsdByFips[fips] ?? 0 : -1
                return {
                    ...f,
                    properties: { ...f.properties, pooled_jsd: pooledJsd },
                }
            })

            const values = mergedFeatures
                .map((f) => (f.properties as Record<string, number>)?.pooled_jsd)
                .filter((v): v is number => typeof v === 'number' && v >= 0 && !isNaN(v) && isFinite(v))
            const minVal = values.length ? Math.min(...values) : 0
            // Fixed max 0.6 so post-pooling values (typically 0.15–0.3) map to green
            const maxVal = 0.6

            const mergedWithNorm = mergedFeatures.map((f) => {
                const raw = (f.properties as Record<string, number>)?.pooled_jsd ?? -1
                const normalized = raw >= 0 ? normalizeTo01(raw, minVal, maxVal) : -1
                return {
                    ...f,
                    properties: { ...f.properties, pooled_jsd_norm: normalized },
                }
            })

            const mergedGeo: FeatureCollection = {
                type: 'FeatureCollection',
                features: mergedWithNorm,
            }

            const src = m.getSource(COUNTY_SOURCE) as maplibregl.GeoJSONSource
            if (src) src.setData(mergedGeo)

            // Post-pooling: green scale (low JSD = green). Non-SD = gray.
            const colorExpr: maplibregl.ExpressionSpecification = [
                'case',
                ['<', ['get', 'pooled_jsd_norm'], 0],
                '#e8e8e4',
                [
                    'interpolate',
                    ['linear'],
                    ['get', 'pooled_jsd_norm'],
                    0.0,
                    '#fde725',
                    0.25,
                    '#5ec962',
                    0.5,
                    '#21918c',
                    0.75,
                    '#3b528b',
                    1.0,
                    '#440154',
                ],
            ]

            m.setPaintProperty(COUNTY_FILL_LAYER, 'fill-color', colorExpr)
            m.setPaintProperty(COUNTY_FILL_LAYER, 'fill-opacity', 0.7)
            m.setPaintProperty(COUNTY_OUTLINE_LAYER, 'line-opacity', 0.6)
            m.setPaintProperty('county-labels-text', 'text-opacity', 0.9)
            try {
                m.setLayoutProperty('sd-edges-line', 'visibility', 'none')
            } catch {
                /* ignore */
            }
            m.flyTo({ center: SPOTLIGHT_CENTER, zoom: SPOTLIGHT_ZOOM, duration: 800 })
        },
        [data]
    )

    // Remove county click handler when leaving KL mode (spotlightCounties is called)
    const spotlightCountiesRef = useRef(spotlightCounties)
    spotlightCountiesRef.current = spotlightCounties
    const spotlightCountiesWithCleanup = useCallback(() => {
        const m = map.current
        if (m && countyClickHandlerRef.current) {
            try {
                m.off('click', COUNTY_FILL_LAYER, countyClickHandlerRef.current)
            } catch {
                /* ignore */
            }
            countyClickHandlerRef.current = null
        }
        spotlightCountiesRef.current()
    }, [])

    // Keep map zoomed to SD region for spotlight, distributions, solution, postPooling
    const sdScenes: SceneId[] = ['spotlight', 'distributions', 'solution', 'postPooling']
    useEffect(() => {
        if (map.current && layersAdded.current && sdScenes.includes(scene)) {
            map.current.flyTo({ center: SPOTLIGHT_CENTER, zoom: SPOTLIGHT_ZOOM, duration: 600 })
        }
    }, [scene])

    // Notify parent
    useEffect(() => {
        if (layersAdded.current && data && !notifiedRef.current) {
            notifiedRef.current = true
            onReady(
                {
                    showCounties,
                    hideCounties,
                    revealChoropleth,
                    resetToUniform,
                    spotlightCounties: spotlightCountiesWithCleanup,
                    resetFromSpotlight,
                    showKLChoropleth,
                    showPostPoolingChoropleth,
                },
                data,
            )
        }
    }, [mapReady, data, onReady, showCounties, hideCounties, revealChoropleth, resetToUniform, spotlightCountiesWithCleanup, resetFromSpotlight, showKLChoropleth, showPostPoolingChoropleth])

    return (
        <div className="sticky top-0 h-screen w-full">
            <div ref={mapContainer} className="w-full h-full" />

            {/* Divergence / JSD legend (counties, distributions, postPooling) */}
            <div
                className="absolute bottom-8 right-6 z-30 px-4 py-3 transition-opacity duration-500"
                style={{
                    opacity: (scene === 'counties' && progress > 0.15) || scene === 'distributions' || scene === 'postPooling' ? 1 : 0,
                    pointerEvents: (scene === 'counties' && progress > 0.15) || scene === 'distributions' || scene === 'postPooling' ? 'auto' : 'none',
                    background: 'rgba(252, 251, 248, 0.92)',
                    borderLeft: '3px solid #3b528b',
                }}
            >
                <div style={{ fontSize: '11px', color: '#666', marginBottom: '6px' }}>
                    {scene === 'distributions' ? 'KL Divergence' : scene === 'postPooling' ? 'Post-pooling JSD' : 'Max Divergence'}
                </div>
                <div
                    style={{
                        width: '140px',
                        height: '8px',
                        background: 'linear-gradient(to right, #fde725, #5ec962, #21918c, #3b528b, #440154)',
                    }}
                />
                <div className="flex justify-between" style={{ fontSize: '10px', color: '#999', marginTop: '4px' }}>
                    <span>Low</span>
                    <span>High</span>
                </div>
            </div>

            {/* JSD bar legend (spotlight — Same border. Different data.) */}
            {comparisonData && (
                <div
                    className="absolute bottom-8 right-6 z-30 px-4 py-3 transition-opacity duration-500"
                    style={{
                        opacity: scene === 'spotlight' ? 1 : 0,
                        pointerEvents: scene === 'spotlight' ? 'auto' : 'none',
                        background: 'rgba(252, 251, 248, 0.92)',
                        borderLeft: '3px solid #21918c',
                    }}
                >
                    <div style={{ fontSize: '11px', color: '#666', marginBottom: '8px' }}>
                        Color distribution
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', fontSize: '10px', color: '#6c757d' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <span style={{ width: 10, height: 10, borderRadius: 2, background: '#21918c' }} />
                            {comparisonData.county_a.name}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <span style={{ width: 10, height: 10, borderRadius: 2, background: '#440154' }} />
                            {comparisonData.county_b.name}
                        </span>
                    </div>
                </div>
            )}
        </div>
    )
}
