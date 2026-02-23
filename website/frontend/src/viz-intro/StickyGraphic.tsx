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
    NAPA_FIPS,
    SONOMA_FIPS,
    SPOTLIGHT_CENTER,
    SPOTLIGHT_ZOOM,
    type SceneId,
} from './constants'

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

export interface MapApi {
    showCounties: () => void
    hideCounties: () => void
    revealChoropleth: (progress: number) => void
    resetToUniform: () => void
    spotlightNapaSonoma: () => void
    resetFromSpotlight: () => void
}

interface StickyGraphicProps {
    scene: SceneId
    progress: number
    onReady: (api: MapApi, data: DivergenceData) => void
}

export function StickyGraphic({ scene, progress, onReady }: StickyGraphicProps) {
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

        layersAdded.current = true
    }, [mapReady, data])

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

    const spotlightNapaSonoma = useCallback(() => {
        const m = map.current
        if (!m || !layersAdded.current) return

        // Fly to Napa/Sonoma area
        m.flyTo({ center: SPOTLIGHT_CENTER, zoom: SPOTLIGHT_ZOOM, duration: 1200 })

        // Highlight Napa & Sonoma, dim everything else
        const highlightExpr: maplibregl.ExpressionSpecification = [
            'case',
            ['==', ['get', 'fips'], NAPA_FIPS], '#21918c',
            ['==', ['get', 'fips'], SONOMA_FIPS], '#440154',
            '#e8e8e4',
        ]
        m.setPaintProperty(COUNTY_FILL_LAYER, 'fill-color', highlightExpr)
        m.setPaintProperty(COUNTY_FILL_LAYER, 'fill-opacity', 0.7)
        m.setPaintProperty(COUNTY_OUTLINE_LAYER, 'line-opacity', 0.8)
        m.setPaintProperty(COUNTY_OUTLINE_LAYER, 'line-width', [
            'case',
            ['any', ['==', ['get', 'fips'], NAPA_FIPS], ['==', ['get', 'fips'], SONOMA_FIPS]],
            2,
            0.5,
        ] as maplibregl.ExpressionSpecification)
    }, [])

    const resetFromSpotlight = useCallback(() => {
        const m = map.current
        if (!m || !layersAdded.current) return
        m.flyTo({ center: MAP_CENTER, zoom: MAP_ZOOM, duration: 1200 })
        m.setPaintProperty(COUNTY_FILL_LAYER, 'fill-color', UNIFORM_FILL)
        m.setPaintProperty(COUNTY_FILL_LAYER, 'fill-opacity', 0.55)
        m.setPaintProperty(COUNTY_OUTLINE_LAYER, 'line-width', 0.7)
    }, [])

    // Notify parent
    useEffect(() => {
        if (layersAdded.current && data && !notifiedRef.current) {
            notifiedRef.current = true
            onReady(
                { showCounties, hideCounties, revealChoropleth, resetToUniform, spotlightNapaSonoma, resetFromSpotlight },
                data,
            )
        }
    }, [mapReady, data, onReady, showCounties, hideCounties, revealChoropleth, resetToUniform, spotlightNapaSonoma, resetFromSpotlight])

    return (
        <div className="sticky top-0 h-screen w-full">
            <div ref={mapContainer} className="w-full h-full" />

            {/* Divergence legend */}
            <div
                className="absolute bottom-8 right-6 z-30 px-4 py-3 transition-opacity duration-500"
                style={{
                    opacity: scene === 'counties' && progress > 0.15 ? 1 : 0,
                    background: 'rgba(252, 251, 248, 0.92)',
                    borderLeft: '3px solid #3b528b',
                }}
            >
                <div style={{ fontSize: '11px', color: '#666', marginBottom: '6px' }}>
                    Max Divergence
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
        </div>
    )
}
