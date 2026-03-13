import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { cn } from './lib/utils'

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json'

const COLOR_MAP: Record<string, string> = {
    amber: '#FFBF00',
    aqua: '#00FFFF',
    aquamarine: '#7FFFD4',
    auburn: '#922724',
    azure: '#F0FFFF',
    bar: '#888888',
    beige: '#F5F5DC',
    blue: '#0000FF',
    brown: '#A52A2A',
    cocoa: '#D2691E',
    coffee: '#6F4E37',
    crimson: '#DC143C',
    emerald: '#50C878',
    foo: '#888888',
    gold: '#FFD700',
    gray: '#808080',
    green: '#008000',
    grey: '#808080',
    indigo: '#4B0082',
    ivory: '#FFFFF0',
    lavender: '#E6E6FA',
    lemon: '#FFF700',
    lilac: '#C8A2C8',
    maroon: '#800000',
    navy: '#000080',
    olive: '#808000',
    orange: '#FFA500',
    plum: '#8E4585',
    purple: '#800080',
    red: '#FF0000',
    sage: '#9DC183',
    scarlet: '#FF2400',
    sienna: '#A0522D',
    tan: '#D2B48C',
    terracotta: '#E2725B',
    verde: '#00A86B',
    yellow: '#FFFF00',
    alabaster: '#F2F0E6',
}

const COLOR_GROUPS_MAP: Record<string, string> = {
    azure: 'red', blue: 'red', crimson: 'red', foo: 'red', indigo: 'red', purple: 'red', red: 'red', scarlet: 'red',
    aqua: 'navy', aquamarine: 'navy', lavender: 'navy', lilac: 'navy', navy: 'navy',
    alabaster: 'alabaster', gray: 'alabaster', grey: 'alabaster', ivory: 'alabaster',
    amber: 'amber', gold: 'amber', lemon: 'amber', yellow: 'amber',
    beige: 'cocoa', brown: 'cocoa', cocoa: 'cocoa', coffee: 'cocoa',
    green: 'olive', olive: 'olive', sage: 'olive', verde: 'olive',
    orange: 'orange', sienna: 'orange', terracotta: 'orange',
}

const GROUP_NAMES = new Set(Object.values(COLOR_GROUPS_MAP))
const fmtLabel = (v: string) => GROUP_NAMES.has(v) ? v.replace('_', ' / ') : v

function poolDistributions(distA: FeatureDist[], distB: FeatureDist[]): [FeatureDist[], FeatureDist[]] {
    const merge = (dist: FeatureDist[]) => {
        const acc: Record<string, { count: number; proportion: number }> = {}
        for (const d of dist) {
            const key = COLOR_GROUPS_MAP[d.value] ?? d.value
            if (!acc[key]) acc[key] = { count: 0, proportion: 0 }
            acc[key].count += d.count
            acc[key].proportion += d.proportion
        }
        return acc
    }
    const mA = merge(distA)
    const mB = merge(distB)
    const toList = (m: typeof mA, other: typeof mA): FeatureDist[] =>
        Object.entries(m)
            .filter(([, v]) => v.count > 0)
            .map(([key, v]) => ({
                value: key,
                count: v.count,
                proportion: v.proportion,
                unique: (other[key]?.count ?? 0) === 0,
            }))
            .sort((a, b) => b.count - a.count)
    return [toList(mA, mB), toList(mB, mA)]
}

interface DivergenceData {
    counties: GeoJSON.FeatureCollection
    edges: GeoJSON.FeatureCollection
    stats: {
        total_pairs: number
        total_counties: number
        mean_jsd: number
        max_jsd: number
        min_jsd: number
    }
}

interface SelectedPair {
    fips_a: string
    fips_b: string
    county_a: string
    county_b: string
}

interface FeatureDist {
    value: string
    count: number
    proportion: number
    unique: boolean
    is_group?: boolean
}

interface FeatureData {
    distribution: FeatureDist[]
    vocab_size: number
}

interface AppliedCondition {
    column: string
    value: string
}

interface JsdData {
    original: number
    merged?: number
    reduction?: number
    reduction_pct?: number
}

interface ComparisonResult {
    county_a: {
        fips: string
        name: string
        total_count: number
        clr: FeatureData
        clr_merged?: FeatureData
        bldgtype: FeatureData
        st_damcat: FeatureData
    }
    county_b: {
        fips: string
        name: string
        total_count: number
        clr: FeatureData
        clr_merged?: FeatureData
        bldgtype: FeatureData
        st_damcat: FeatureData
    }
    conditioning: {
        conditions: AppliedCondition[]
        total_conditions: number
    }
    jsd?: JsdData
    error?: string
}

export function NeighborDivergence() {
    const mapContainer = useRef<HTMLDivElement>(null)
    const mergedMapContainer = useRef<HTMLDivElement>(null)
    const map = useRef<maplibregl.Map | null>(null)
    const mergedMap = useRef<maplibregl.Map | null>(null)
    const [loading, setLoading] = useState(true)
    const [data, setData] = useState<DivergenceData | null>(null)
    const [mergedData, setMergedData] = useState<DivergenceData | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [controlsOpen, setControlsOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 640)
    const [showEdges, setShowEdges] = useState(true)

    // Selected pair for comparison
    const [selectedPair, setSelectedPair] = useState<SelectedPair | null>(null)

    // Comparison state
    const [pairComparisons, setPairComparisons] = useState<Record<string, any>>({})
    const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null)

    const [usePooled, setUsePooled] = useState(false)

    // Map comparison state
    const [showMergedMap, setShowMergedMap] = useState(false)
    const [showColorGroups, setShowColorGroups] = useState(false)
    const [mergedMapLoading, setMergedMapLoading] = useState(false)
    const [mainMapReady, setMainMapReady] = useState(false)

    const [showComparisonPanel, setShowComparisonPanel] = useState(false)



    const [hoveredEdge, setHoveredEdge] = useState<{ fips_a: string; fips_b: string; sourceMap: 'original' | 'merged'; lngLat: [number, number] } | null>(null)
    const originalPopupRef = useRef<maplibregl.Popup | null>(null)
    const mergedPopupRef = useRef<maplibregl.Popup | null>(null)
    const isSyncingRef = useRef(false)

    const comparisonRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        async function fetchData() {
            try {
                const [divergenceRes, pairsRes] = await Promise.all([
                    fetch('/data/neighbor-divergence-map.json'),
                    fetch('/data/county-pair-comparisons.json')
                ])
                if (!divergenceRes.ok) throw new Error('Failed to load divergence data')
                const result = await divergenceRes.json()
                const pairs = await pairsRes.json()
                setData(result)
                setPairComparisons(pairs)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Unknown error')
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [])

    useEffect(() => {
        if (!mapContainer.current || map.current) return

        const isMobile = window.innerWidth < 640
        map.current = new maplibregl.Map({
            container: mapContainer.current,
            style: MAP_STYLE,
            center: [-119.5, 37.5],
            zoom: isMobile ? 4.5 : 5.5,
        })

        map.current.addControl(new maplibregl.NavigationControl(), 'top-right')
        map.current.on('load', () => setMainMapReady(true))

        return () => {
            map.current?.remove()
            map.current = null
            setMainMapReady(false)
        }
    }, [])

    const [mergedMapReady, setMergedMapReady] = useState(false)

    useEffect(() => {
        if (!mergedMapContainer.current || !showMergedMap || mergedMap.current) return

        const isMobile = window.innerWidth < 640
        const newMap = new maplibregl.Map({
            container: mergedMapContainer.current,
            style: MAP_STYLE,
            center: [-119.5, 37.5],
            zoom: isMobile ? 4.5 : 5.5,
        })

        newMap.addControl(new maplibregl.NavigationControl(), 'top-right')

        newMap.on('load', () => {
            setMergedMapReady(true)
        })

        mergedMap.current = newMap

        return () => {
            mergedMap.current?.remove()
            mergedMap.current = null
            setMergedMapReady(false)
        }
    }, [showMergedMap])

    useEffect(() => {
        if (!showMergedMap || !map.current || !mergedMap.current || !mergedMapReady) return

        const syncCamera = (source: maplibregl.Map, target: maplibregl.Map) => {
            if (isSyncingRef.current) return
            isSyncingRef.current = true

            target.jumpTo({
                center: source.getCenter(),
                zoom: source.getZoom(),
                bearing: source.getBearing(),
                pitch: source.getPitch()
            })

            isSyncingRef.current = false
        }

        const onOriginalMove = () => syncCamera(map.current!, mergedMap.current!)
        const onMergedMove = () => syncCamera(mergedMap.current!, map.current!)

        map.current.on('move', onOriginalMove)
        mergedMap.current.on('move', onMergedMove)

        syncCamera(map.current, mergedMap.current)

        return () => {
            map.current?.off('move', onOriginalMove)
            mergedMap.current?.off('move', onMergedMove)
        }
    }, [showMergedMap, mergedMapReady])

    const addLayersToMap = useCallback((mapInstance: maplibregl.Map, mapData: DivergenceData, isOriginal: boolean) => {
        const sourceId = isOriginal ? 'counties' : 'merged-counties'
        const edgeSourceId = isOriginal ? 'edges' : 'merged-edges'

        if (mapInstance.getLayer(`${sourceId}-fill`)) mapInstance.removeLayer(`${sourceId}-fill`)
        if (mapInstance.getLayer(`${sourceId}-outline`)) mapInstance.removeLayer(`${sourceId}-outline`)
        if (mapInstance.getLayer(`${edgeSourceId}-line`)) mapInstance.removeLayer(`${edgeSourceId}-line`)
        if (mapInstance.getLayer('selected-edge')) mapInstance.removeLayer('selected-edge')
        if (mapInstance.getSource(sourceId)) mapInstance.removeSource(sourceId)
        if (mapInstance.getSource(edgeSourceId)) mapInstance.removeSource(edgeSourceId)

        mapInstance.addSource(sourceId, {
            type: 'geojson',
            data: mapData.counties
        })

        mapInstance.addSource(edgeSourceId, {
            type: 'geojson',
            data: mapData.edges
        })

        mapInstance.addLayer({
            id: `${sourceId}-fill`,
            type: 'fill',
            source: sourceId,
            paint: {
                'fill-color': '#f5f5f5',
                'fill-opacity': 0.3,
            },
        })

        mapInstance.addLayer({
            id: `${sourceId}-outline`,
            type: 'line',
            source: sourceId,
            paint: {
                'line-color': '#999',
                'line-width': 0.5,
            },
        })

        const edgeColorExpr: maplibregl.ExpressionSpecification = [
            'interpolate',
            ['linear'],
            ['to-number', ['get', 'weighted_jsd'], 0],
            0.0, '#fde725',
            0.25, '#22a884',
            0.5, '#2a788e',
            0.75, '#414487',
            1.0, '#440154',
        ]

        mapInstance.addLayer({
            id: `${edgeSourceId}-line`,
            type: 'line',
            source: edgeSourceId,
            paint: {
                'line-color': edgeColorExpr,
                'line-width': 4,
                'line-opacity': 0.9,
            },
        })

        const edgePopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false })
        if (isOriginal) {
            originalPopupRef.current = edgePopup
        } else {
            mergedPopupRef.current = edgePopup
        }

        const layerId = `${edgeSourceId}-line`

        mapInstance.on('mousemove', layerId, (e) => {
            if (!e.features || e.features.length === 0) return
            mapInstance.getCanvas().style.cursor = 'pointer'
            const props = e.features[0].properties
            const fips_a = props.fips_a
            const fips_b = props.fips_b

            setHoveredEdge({
                fips_a,
                fips_b,
                sourceMap: isOriginal ? 'original' : 'merged',
                lngLat: [e.lngLat.lng, e.lngLat.lat]
            })

            const countyA = props.county_a || 'Unknown'
            const countyB = props.county_b || 'Unknown'
            const jsd = props.weighted_jsd?.toFixed(3) || 'N/A'
            const nLc = props.n_shared_lc || 0
            const support = props.total_support?.toLocaleString() || '0'
            const clickHint = '<div style="margin-top: 6px; font-size: 10px; color: #94a3b8;">Click to compare</div>'
            const mapLabel = isOriginal ? '<div style="font-size: 10px; color: #94a3b8; margin-bottom: 4px;">ORIGINAL</div>' : '<div style="font-size: 10px; color: #60a5fa; margin-bottom: 4px;">MERGED COLORS</div>'
            const html = `
                <div style="font-size: 12px; line-height: 1.4; background: #18181b; color: #e4e4e7; padding: 8px 10px; border-radius: 6px; border: 1px solid #3f3f46;">
                    ${mapLabel}
                    <div style="font-weight: bold; margin-bottom: 4px;">${countyA} - ${countyB}</div>
                    <div>Avg JSD: <strong>${jsd}</strong></div>
                    <div>Shared Land Cover Types: ${nLc}</div>
                    <div>Total Support: ${support}</div>
                    ${clickHint}
                </div>
            `
            edgePopup.setLngLat(e.lngLat).setHTML(html).addTo(mapInstance)
        })

        mapInstance.on('mouseleave', layerId, () => {
            mapInstance.getCanvas().style.cursor = ''
            edgePopup.remove()
            setHoveredEdge(null)
        })

        if (isOriginal) {
            mapInstance.addLayer({
                id: 'selected-edge',
                type: 'line',
                source: edgeSourceId,
                paint: {
                    'line-color': '#8839ef',
                    'line-width': 4,
                    'line-opacity': 1,
                },
                filter: ['==', ['get', 'fips_a'], '']
            })
        }

        mapInstance.on('click', layerId, (e) => {
            if (!e.features || e.features.length === 0) return
            const props = e.features[0].properties
            const pair: SelectedPair = {
                fips_a: props.fips_a,
                fips_b: props.fips_b,
                county_a: props.county_a,
                county_b: props.county_b
            }
            setSelectedPair(pair)
            setShowComparisonPanel(true)

            if (isOriginal) {
                mapInstance.setFilter('selected-edge', [
                    'all',
                    ['==', ['get', 'fips_a'], props.fips_a],
                    ['==', ['get', 'fips_b'], props.fips_b]
                ])
            }

            setTimeout(() => {
                comparisonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }, 100)
        })
    }, [])

    useEffect(() => {
        if (!mainMapReady || !map.current || !data) return
        addLayersToMap(map.current, data, true)
    }, [mainMapReady, data, addLayersToMap])

    useEffect(() => {
        if (!mergedMap.current || !mergedData || !mergedMapReady) return
        addLayersToMap(mergedMap.current, mergedData, false)
    }, [mergedData, mergedMapReady, addLayersToMap])

    useEffect(() => {
        if (!hoveredEdge || !showMergedMap) {
            if (hoveredEdge === null) {
                originalPopupRef.current?.remove()
                mergedPopupRef.current?.remove()
            }
            return
        }

        const { fips_a, fips_b, sourceMap, lngLat } = hoveredEdge

        const showTooltipOnMap = (
            mapInstance: maplibregl.Map | null,
            mapData: DivergenceData | null,
            popup: maplibregl.Popup | null,
            isOriginal: boolean
        ) => {
            if (!mapInstance || !mapData || !popup) return

            const edgeFeature = mapData.edges.features.find(f =>
                f.properties?.fips_a === fips_a && f.properties?.fips_b === fips_b
            )

            if (!edgeFeature) return

            const props = edgeFeature.properties || {}
            const countyA = props.county_a || 'Unknown'
            const countyB = props.county_b || 'Unknown'
            const jsd = props.weighted_jsd?.toFixed(3) || 'N/A'
            const nLc = props.n_shared_lc || 0
            const support = props.total_support?.toLocaleString() || '0'
            const mapLabel = isOriginal ? '<div style="font-size: 10px; color: #94a3b8; margin-bottom: 4px;">ORIGINAL</div>' : '<div style="font-size: 10px; color: #60a5fa; margin-bottom: 4px;">MERGED COLORS</div>'

            const html = `
                <div style="font-size: 12px; line-height: 1.4; background: #18181b; color: #e4e4e7; padding: 8px 10px; border-radius: 6px; border: 1px solid #3f3f46;">
                    ${mapLabel}
                    <div style="font-weight: bold; margin-bottom: 4px; color: #fafafa;">${countyA} - ${countyB}</div>
                    <div style="color: #a1a1aa;">Avg JSD: <strong style="color: #e4e4e7;">${jsd}</strong></div>
                    <div style="color: #a1a1aa;">Shared Land Cover Types: ${nLc}</div>
                    <div style="color: #a1a1aa;">Total Support: ${support}</div>
                </div>
            `

            popup.setLngLat(lngLat).setHTML(html).addTo(mapInstance)
        }

        if (sourceMap === 'original') {

            showTooltipOnMap(mergedMap.current, mergedData, mergedPopupRef.current, false)
        } else {
            showTooltipOnMap(map.current, data, originalPopupRef.current, true)
        }

        return () => {
            if (sourceMap === 'original') {
                mergedPopupRef.current?.remove()
            } else {
                originalPopupRef.current?.remove()
            }
        }
    }, [hoveredEdge, showMergedMap, data, mergedData])

    // Load comparison from static data when pair changes
    useEffect(() => {
        if (!selectedPair) return
        const key = `${selectedPair.fips_a}-${selectedPair.fips_b}`
        const entry = pairComparisons[key]
        if (entry) {
            setComparisonResult({
                county_a: entry.county_a,
                county_b: entry.county_b,
                conditioning: { conditions: [], total_conditions: 0 },
                jsd: entry.jsd,
            })
        } else {
            setComparisonResult(null)
        }
    }, [selectedPair, pairComparisons])

    useEffect(() => {
        if (!map.current) return
        const visibility = showEdges ? 'visible' : 'none'
        try {
            if (map.current.getLayer('edges-line')) {
                map.current.setLayoutProperty('edges-line', 'visibility', visibility)
            }
            if (map.current.getLayer('selected-edge')) {
                map.current.setLayoutProperty('selected-edge', 'visibility', visibility)
            }
        } catch {
            // Layer might not be ready
        }
    }, [showEdges])

    const toggleFullscreen = () => {
        setIsFullscreen(!isFullscreen)
    }

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isFullscreen) {
                setIsFullscreen(false)
            }
            if (e.key === 'e' || e.key === 'E') {
                setShowEdges(prev => !prev)
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isFullscreen])

    useEffect(() => {
        setTimeout(() => {
            map.current?.resize()
            mergedMap.current?.resize()
        }, 100)
    }, [isFullscreen, showMergedMap])

    useEffect(() => {
        if (!usePooled) {
            setShowMergedMap(false)
            setMergedData(null)
            return
        }
        setMergedMapLoading(true)
        setShowMergedMap(true)
        fetch('/data/neighbor-divergence-map-pooled.json')
            .then(r => r.json())
            .then(result => setMergedData(result))
            .catch(err => console.error('Failed to load pooled data:', err))
            .finally(() => setMergedMapLoading(false))
    }, [usePooled])

    const [displayClrA, displayClrB] = useMemo(() => {
        if (!comparisonResult || comparisonResult.error) return [null, null]
        if (!usePooled) return [comparisonResult.county_a.clr, comparisonResult.county_b.clr]
        const [pA, pB] = poolDistributions(
            comparisonResult.county_a.clr.distribution,
            comparisonResult.county_b.clr.distribution
        )
        return [
            { distribution: pA, vocab_size: pA.length },
            { distribution: pB, vocab_size: pB.length },
        ]
    }, [comparisonResult, usePooled])

    const maxProportion = displayClrA && displayClrB
        ? Math.max(
            ...displayClrA.distribution.map((d: FeatureDist) => d.proportion),
            ...displayClrB.distribution.map((d: FeatureDist) => d.proportion)
        )
        : 0

    const uniqueToA = displayClrA ? displayClrA.distribution.filter((d: FeatureDist) => d.unique).map((d: FeatureDist) => d.value) : []
    const uniqueToB = displayClrB ? displayClrB.distribution.filter((d: FeatureDist) => d.unique).map((d: FeatureDist) => d.value) : []
    const sharedColors = displayClrA
        ? displayClrA.distribution.filter((d: FeatureDist) => !d.unique && d.count > 0).map((d: FeatureDist) => d.value)
        : []
    const vocabOverlap = displayClrA && displayClrB && (displayClrA.vocab_size + displayClrB.vocab_size - sharedColors.length) > 0
        ? sharedColors.length / (displayClrA.vocab_size + displayClrB.vocab_size - sharedColors.length)
        : 0

    return (
        <div className={cn(
            'relative flex-1 min-h-0',
            isFullscreen && 'fixed top-0 left-0 right-0 bottom-0 w-screen h-screen z-[9999] bg-background'
        )}>
            {/* Maps Container - 50/50 split when merged map is shown */}
            <div className={cn(
                'absolute inset-0 flex',
                showMergedMap ? 'gap-1' : ''
            )}>
                {/* Original Map */}
                <div className={cn(
                    'relative h-full',
                    showMergedMap ? 'w-1/2' : 'w-full'
                )}>
                    <div ref={mapContainer} className="w-full h-full" />

                    {/* Loading/Error overlays */}
                    {loading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-20">
                            Loading divergence data...
                        </div>
                    )}
                    {error && (
                        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 px-4 py-2 bg-red-50 border border-red-200 rounded text-red-600 text-sm z-10">
                            {error}
                        </div>
                    )}

                    {/* Map Label when split view */}
                    {showMergedMap && (
                        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-card/95 rounded shadow-elevated text-xs font-semibold uppercase tracking-wide z-10">
                            Original
                        </div>
                    )}

                    {/* Map Controls - Top Left (Dark theme) */}
                    <div className="absolute top-2.5 left-2.5 flex flex-col gap-2 bg-zinc-900/95 rounded p-2 sm:p-3 shadow-elevated z-10 w-40 sm:w-52 border border-zinc-700">
                        <div className="relative pr-4">
                            <div className="text-[10px] sm:text-xs text-zinc-400 leading-snug text-left">Compares color distributions between neighboring counties using JSD. 0 = identical, 1 = completely different.</div>
                            <button onClick={() => setControlsOpen(v => !v)} className="absolute -top-1 -right-1 text-[9px] text-zinc-500 cursor-pointer hover:text-zinc-200">{controlsOpen ? '▲' : '▼'}</button>
                        </div>
                        {controlsOpen && <>
                        {/* Stats Summary */}
                        {data && (
                            <div className="pb-2 mb-1 border-b border-zinc-700">
                                <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-1">Statistics</div>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                    <span className="text-zinc-500">Pairs:</span>
                                    <span className="font-semibold text-zinc-100">{data.stats.total_pairs}</span>
                                    <span className="text-zinc-500">Mean JSD:</span>
                                    <span className="font-semibold text-zinc-100">{data.stats.mean_jsd.toFixed(3)}</span>
                                    <span className="text-zinc-500">Range:</span>
                                    <span className="font-semibold text-zinc-100">{data.stats.min_jsd.toFixed(3)} - {data.stats.max_jsd.toFixed(3)}</span>
                                </div>
                            </div>
                        )}
                        <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">Display</span>
                            <div className="flex rounded-sm overflow-hidden border border-zinc-600">
                                <button
                                    className={cn(
                                        'px-3 py-1.5 border-none bg-zinc-800 text-xs font-medium text-zinc-300 cursor-pointer transition-all duration-150',
                                        'hover:bg-[var(--button-accent)]/20 hover:text-white',
                                        showEdges && 'bg-[var(--button-accent)] text-white hover:opacity-90'
                                    )}
                                    onClick={() => setShowEdges(true)}
                                >
                                    Show Edges
                                </button>
                                <button
                                    className={cn(
                                        'px-3 py-1.5 border-none border-l border-zinc-600 bg-zinc-800 text-xs font-medium text-zinc-300 cursor-pointer transition-all duration-150',
                                        'hover:bg-[var(--button-accent)]/20 hover:text-white',
                                        !showEdges && 'bg-[var(--button-accent)] text-white hover:opacity-90'
                                    )}
                                    onClick={() => setShowEdges(false)}
                                >
                                    Hide Edges
                                </button>
                            </div>
                        </div>
                        <div className="flex flex-col gap-1">
                            <button
                                className={cn(
                                    'px-3 py-1.5 border rounded-sm text-[11px] font-medium cursor-pointer uppercase tracking-wide transition-all duration-150',
                                    usePooled
                                        ? 'border-[var(--button-accent)] bg-[var(--button-accent)] text-white hover:opacity-90'
                                        : 'border-zinc-600 bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                                )}
                                onClick={() => setUsePooled(p => !p)}
                            >
                                {usePooled ? 'Pooled Colors' : 'Raw Colors'}
                            </button>
                            <button
                                className="px-3 py-1 border border-zinc-600 rounded-sm bg-zinc-800 text-[10px] font-medium text-zinc-300 cursor-pointer tracking-wide transition-all duration-150 hover:bg-zinc-700 flex items-center justify-between gap-2"
                                onClick={() => setShowColorGroups(v => !v)}
                            >
                                <span>Color Groups</span>
                                <span>{showColorGroups ? '▲' : '▼'}</span>
                            </button>
                            {showColorGroups && (
                                <div className="bg-zinc-800 border border-zinc-600 rounded p-2 space-y-1.5 text-[11px]">
                                    {[
                                        { name: 'Red', members: 'azure, blue, crimson, foo, indigo, purple, red, scarlet', color: '#FF0000' },
                                        { name: 'Navy', members: 'aqua, aquamarine, lavender, lilac, navy', color: '#000080' },
                                        { name: 'Alabaster', members: 'alabaster, gray, grey, ivory', color: '#F2F0E6' },
                                        { name: 'Amber', members: 'amber, gold, lemon, yellow', color: '#FFBF00' },
                                        { name: 'Cocoa', members: 'beige, brown, cocoa, coffee', color: '#D2691E' },
                                        { name: 'Olive', members: 'green, olive, sage, verde', color: '#808000' },
                                        { name: 'Orange', members: 'orange, sienna, terracotta', color: '#FFA500' },
                                    ].map(g => (
                                        <div key={g.name} className="flex items-start gap-1.5">
                                            <span className="mt-0.5 shrink-0 w-2.5 h-2.5 rounded-sm" style={{ background: g.color }} />
                                            <div className="leading-snug">
                                                <span className="font-semibold text-zinc-100">{g.name}:</span>
                                                <span className="text-zinc-400"> {g.members}</span>
                                            </div>
                                        </div>
                                    ))}
                                    <div className="text-zinc-500 pt-1 border-t border-zinc-600">All other colors kept as-is</div>
                                </div>
                            )}
                        </div>
                        <button
                            className="px-3 py-1.5 border border-zinc-600 rounded-sm bg-zinc-800 text-[11px] font-medium text-zinc-300 cursor-pointer uppercase tracking-wide transition-all duration-150 hover:bg-zinc-700"
                            onClick={toggleFullscreen}
                        >
                            {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                        </button>
                        {showMergedMap && (
                            <button
                                className="px-3 py-1.5 border border-red-800 rounded-sm bg-red-900/50 text-[11px] font-medium text-red-300 cursor-pointer uppercase tracking-wide transition-all duration-150 hover:bg-red-900/70"
                                onClick={() => setShowMergedMap(false)}
                            >
                                Close Comparison
                            </button>
                        )}
                        </>}
                    </div>

                    {/* Stats badge when split view */}
                    {showMergedMap && data && (
                        <div className={cn(
                            "absolute left-1/2 -translate-x-1/2 z-10 bg-white rounded-lg shadow-elevated px-2 sm:px-4 py-2 sm:py-3 text-center",
                            selectedPair ? 'bottom-20' : 'bottom-4'
                        )}>
                            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Original</div>
                            <div className="text-lg font-bold text-foreground">{data.stats.mean_jsd.toFixed(3)}</div>
                            <div className="text-[10px] text-muted-foreground">Mean JSD</div>
                        </div>
                    )}

                    {/* Legend - Bottom Right (only when not split) */}
                    {!showMergedMap && (
                        <div className={cn(
                            'absolute right-2.5 bg-card/95 p-2 sm:p-3 rounded shadow-elevated text-xs z-10 transition-all duration-300',
                            selectedPair ? 'bottom-32' : 'bottom-20 sm:bottom-24'
                        )}>
                            <div className="font-semibold mb-1 sm:mb-2 text-foreground text-[10px] sm:text-xs">Avg JSD (Divergence)</div>
                            <div
                                className="w-28 sm:w-44 h-2 sm:h-2.5 rounded-sm"
                                style={{ background: 'linear-gradient(to right, #fde725, #22a884, #2a788e, #414487, #440154)' }}
                            />
                            <div className="flex justify-between mt-1 text-[9px] sm:text-[10px] text-muted-foreground">
                                <span>0</span>
                                <span>0.5</span>
                                <span>1</span>
                            </div>
                            <div className="flex justify-between mt-1 text-[9px] sm:text-[10px] text-muted-foreground">
                                <span>Similar</span>
                                <span>Different</span>
                            </div>
                        </div>
                    )}

                    {/* Keybind Hints - Bottom Left (only when not split, hidden on mobile) */}
                    {!showMergedMap && (
                        <div className={cn(
                            'absolute left-2.5 hidden sm:flex flex-col gap-1 z-10 transition-all duration-300',
                            selectedPair ? 'bottom-20' : 'bottom-2.5'
                        )}>
                            {isFullscreen && (
                                <span className="bg-white/90 px-2.5 py-1.5 rounded text-xs text-muted-foreground">
                                    Press <kbd className="bg-sage-100 border border-sage-300 rounded px-1.5 py-0.5 font-semibold text-foreground">Esc</kbd> to exit fullscreen
                                </span>
                            )}
                            <span className="bg-white/90 px-2.5 py-1.5 rounded text-xs text-muted-foreground">
                                Press <kbd className="bg-sage-100 border border-sage-300 rounded px-1.5 py-0.5 font-semibold text-foreground">E</kbd> to {showEdges ? 'hide' : 'show'} edges
                            </span>
                            {!selectedPair && (
                                <span className="bg-white/90 px-2.5 py-1.5 rounded text-xs text-muted-foreground">
                                    Click edge to compare counties
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {/* Merged Map - 50% width side by side */}
                {showMergedMap && (
                    <div className="relative w-1/2 h-full">
                        <div ref={mergedMapContainer} className="w-full h-full" />

                        {/* Loading overlay */}
                        {mergedMapLoading && (
                            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-20">
                                Recalculating...
                            </div>
                        )}

                        {/* Map Label */}
                        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-blue-100 text-blue-800 rounded shadow-elevated text-xs font-semibold uppercase tracking-wide z-10">
                            Merged Colors
                        </div>

                        {/* Stats badge */}
                        {mergedData && data && (
                            <div className={cn(
                                "absolute left-1/2 -translate-x-1/2 z-10 bg-white rounded-lg shadow-elevated px-2 sm:px-4 py-2 sm:py-3 text-center",
                                selectedPair ? 'bottom-20' : 'bottom-4'
                            )}>
                                <div className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide mb-1">Merged</div>
                                <div className="text-lg font-bold text-foreground">{mergedData.stats.mean_jsd.toFixed(3)}</div>
                                <div className="text-[10px] text-muted-foreground">Mean JSD</div>
                            </div>
                        )}

                        {/* Legend */}
                        <div className={cn(
                            'absolute right-2.5 bg-card/95 p-2 sm:p-3 rounded shadow-elevated text-xs z-10',
                            selectedPair ? 'bottom-20' : 'bottom-24 sm:bottom-7'
                        )}>
                            <div className="font-semibold mb-1 sm:mb-2 text-foreground text-[10px] sm:text-xs">Avg JSD (Divergence)</div>
                            <div
                                className="w-24 sm:w-36 h-2 sm:h-2.5 rounded-sm"
                                style={{ background: 'linear-gradient(to right, #fde725, #22a884, #2a788e, #414487, #440154)' }}
                            />
                            <div className="flex justify-between mt-1 text-muted-foreground">
                                <span>0</span>
                                <span>1</span>
                            </div>
                            <div className="flex justify-between mt-1 text-muted-foreground">
                                <span>Similar</span>
                                <span>Different</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>



            {/* Comparison Panel - Bottom Sheet (Dark theme) */}
            {selectedPair && (
                <div
                    ref={comparisonRef}
                    className={cn(
                        'absolute bottom-0 left-0 right-0 bg-zinc-900 shadow-[0_-4px_24px_rgba(0,0,0,0.4)] z-40 transition-all duration-300',
                        showComparisonPanel ? 'h-[85%] sm:h-[65%]' : 'h-auto'
                    )}
                >
                    {/* Panel Header - Always visible */}
                    <div
                        className="px-3 sm:px-5 py-3 sm:py-4 border-b border-zinc-700 flex items-center justify-between cursor-pointer hover:bg-zinc-800/60 transition-colors"
                        onClick={() => setShowComparisonPanel(!showComparisonPanel)}
                    >
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-6 min-w-0">
                            <h3 className="font-semibold text-sm sm:text-base truncate text-zinc-100">
                                {selectedPair.county_a} vs {selectedPair.county_b}
                            </h3>
                            {comparisonResult?.jsd && (
                                <div className="flex items-center gap-1.5 sm:gap-3 text-xs sm:text-sm flex-wrap">
                                    <span className="px-2 sm:px-3 py-0.5 sm:py-1 bg-zinc-700 text-zinc-200 rounded font-medium">JSD: {comparisonResult.jsd.original.toFixed(4)}</span>
                                    {comparisonResult.jsd.merged !== undefined && (
                                        <>
                                            <span className="text-zinc-500">→</span>
                                            <span className="px-2 sm:px-3 py-0.5 sm:py-1 bg-blue-900/60 text-blue-200 rounded font-medium">{comparisonResult.jsd.merged.toFixed(4)}</span>
                                            <span className={cn(
                                                'px-2 sm:px-3 py-0.5 sm:py-1 rounded font-semibold',
                                                comparisonResult.jsd.reduction! > 0 ? 'bg-emerald-900/60 text-emerald-300' : 'bg-red-900/60 text-red-300'
                                            )}>
                                                {comparisonResult.jsd.reduction! > 0 ? '-' : '+'}
                                                {Math.abs(comparisonResult.jsd.reduction_pct!).toFixed(1)}%
                                            </span>
                                        </>
                                    )}
                                    <span className="hidden sm:inline text-zinc-500">|</span>
                                    <span className="hidden sm:inline text-zinc-500">
                                        Overlap: {(vocabOverlap * 100).toFixed(0)}% ({sharedColors.length} colors)
                                    </span>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                className="px-3 py-1.5 text-sm font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 rounded transition-colors"
                                onClick={(e) => { e.stopPropagation(); setShowComparisonPanel(!showComparisonPanel) }}
                            >
                                {showComparisonPanel ? 'Collapse' : 'Expand'}
                            </button>
                            <button
                                className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 rounded text-xl leading-none transition-colors"
                                onClick={(e) => { e.stopPropagation(); setSelectedPair(null); setShowComparisonPanel(false) }}
                            >
                                ×
                            </button>
                        </div>
                    </div>

                    {/* Panel Content - Expandable (Dark) */}
                    {showComparisonPanel && (
                        <div className="h-[calc(100%-55px)] sm:h-[calc(100%-65px)] overflow-y-auto p-3 sm:p-6 bg-zinc-900">
                                {comparisonResult && !comparisonResult.error && (
                                <div className="space-y-4 sm:space-y-6">
                                    {(comparisonResult.county_a.total_count < 100 || comparisonResult.county_b.total_count < 100) && (
                                        <div className="px-3 sm:px-4 py-2 sm:py-3 bg-amber-900/40 border border-amber-700 rounded text-amber-200 text-xs sm:text-sm">
                                            Warning: Small sample size. {comparisonResult.county_a.name} has {comparisonResult.county_a.total_count} records, {comparisonResult.county_b.name} has {comparisonResult.county_b.total_count} records.
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                                        <div className="border border-zinc-600 rounded-lg p-3 sm:p-4 bg-zinc-800/50">
                                            <h3 className="font-semibold text-sm sm:text-base mb-1 text-zinc-100">{comparisonResult.county_a.name}</h3>
                                            <div className="text-xs text-zinc-400 mb-3">
                                                {comparisonResult.county_a.total_count.toLocaleString()} records | {displayClrA?.vocab_size} {usePooled ? 'groups' : 'colors'}
                                            </div>
                                            <div className="space-y-1.5">
                                                {displayClrA?.distribution.slice(0, 15).map((d: FeatureDist) => (
                                                    <div key={d.value} className={cn('flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm', d.unique && 'bg-blue-900/40 -mx-2 px-2 py-1 rounded')}>
                                                        <span className="w-20 sm:w-28 flex items-center gap-1 sm:gap-2 truncate">
                                                            {d.value === 'foo' || d.value === 'bar' ? (
                                                                <span className="w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-zinc-600 flex items-center justify-center text-[8px] font-bold text-zinc-400 shrink-0">?</span>
                                                            ) : GROUP_NAMES.has(d.value) ? (
                                                                <span className="w-3 h-3 sm:w-4 sm:h-4 rounded-sm shrink-0" style={{ backgroundColor: COLOR_MAP[d.value] ?? '#94a3b8' }} />
                                                            ) : (
                                                                <span className="w-3 h-3 sm:w-4 sm:h-4 rounded-full border border-zinc-500 shrink-0" style={{ backgroundColor: COLOR_MAP[d.value] || '#94a3b8' }} />
                                                            )}
                                                            {GROUP_NAMES.has(d.value)
                                                                ? <span className="px-1 py-0.5 rounded text-[10px] sm:text-[11px] font-medium bg-blue-900/50 text-blue-300 border border-blue-700">{fmtLabel(d.value)}</span>
                                                                : <span className="text-xs sm:text-sm truncate text-zinc-200">{fmtLabel(d.value)}</span>
                                                            }
                                                        </span>
                                                        <div className="flex-1 h-2.5 sm:h-3 bg-zinc-700 rounded overflow-hidden">
                                                            <div
                                                                className="h-full rounded"
                                                                style={{
                                                                    width: `${(d.proportion / maxProportion) * 100}%`,
                                                                    backgroundColor: d.unique ? '#3b82f6' : '#64748b'
                                                                }}
                                                            />
                                                        </div>
                                                        <span className="w-12 sm:w-14 text-right text-zinc-400">{(d.proportion * 100).toFixed(1)}%</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="border border-zinc-600 rounded-lg p-3 sm:p-4 bg-zinc-800/50">
                                            <h3 className="font-semibold text-sm sm:text-base mb-1 text-zinc-100">{comparisonResult.county_b.name}</h3>
                                            <div className="text-xs text-zinc-400 mb-3">
                                                {comparisonResult.county_b.total_count.toLocaleString()} records | {displayClrB?.vocab_size} {usePooled ? 'groups' : 'colors'}
                                            </div>
                                            <div className="space-y-1.5">
                                                {displayClrB?.distribution.slice(0, 15).map((d: FeatureDist) => (
                                                    <div key={d.value} className={cn('flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm', d.unique && 'bg-amber-900/40 -mx-2 px-2 py-1 rounded')}>
                                                        <span className="w-20 sm:w-28 flex items-center gap-1 sm:gap-2 truncate">
                                                            {d.value === 'foo' || d.value === 'bar' ? (
                                                                <span className="w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-zinc-600 flex items-center justify-center text-[8px] font-bold text-zinc-400 shrink-0">?</span>
                                                            ) : GROUP_NAMES.has(d.value) ? (
                                                                <span className="w-3 h-3 sm:w-4 sm:h-4 rounded-sm shrink-0" style={{ backgroundColor: COLOR_MAP[d.value] ?? '#94a3b8' }} />
                                                            ) : (
                                                                <span className="w-3 h-3 sm:w-4 sm:h-4 rounded-full border border-zinc-500 shrink-0" style={{ backgroundColor: COLOR_MAP[d.value] || '#94a3b8' }} />
                                                            )}
                                                            {GROUP_NAMES.has(d.value)
                                                                ? <span className="px-1 py-0.5 rounded text-[10px] sm:text-[11px] font-medium bg-blue-900/50 text-blue-300 border border-blue-700">{fmtLabel(d.value)}</span>
                                                                : <span className="text-xs sm:text-sm truncate text-zinc-200">{fmtLabel(d.value)}</span>
                                                            }
                                                        </span>
                                                        <div className="flex-1 h-2.5 sm:h-3 bg-zinc-700 rounded overflow-hidden">
                                                            <div
                                                                className="h-full rounded"
                                                                style={{
                                                                    width: `${(d.proportion / maxProportion) * 100}%`,
                                                                    backgroundColor: d.unique ? '#f97316' : '#64748b'
                                                                }}
                                                            />
                                                        </div>
                                                        <span className="w-12 sm:w-14 text-right text-zinc-400">{(d.proportion * 100).toFixed(1)}%</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                                        <div className="border border-zinc-600 rounded-lg p-3 sm:p-4 bg-zinc-800/50">
                                            <h4 className="text-xs sm:text-sm font-semibold mb-2 text-zinc-200">Unique to {comparisonResult.county_a.name} ({uniqueToA.length})</h4>
                                            <div className="flex flex-wrap gap-1.5">
                                                {uniqueToA.length > 0
                                                    ? uniqueToA.map((c: string) => (
                                                        <span key={c} className="px-2 py-1 text-xs bg-blue-900/50 text-blue-200 rounded border border-blue-700/50">{c}</span>
                                                    ))
                                                    : <span className="text-sm text-zinc-500">None</span>
                                                }
                                            </div>
                                        </div>

                                        <div className="border border-zinc-600 rounded-lg p-3 sm:p-4 bg-zinc-800/50">
                                            <h4 className="text-xs sm:text-sm font-semibold mb-2 text-zinc-200">Unique to {comparisonResult.county_b.name} ({uniqueToB.length})</h4>
                                            <div className="flex flex-wrap gap-1.5">
                                                {uniqueToB.length > 0
                                                    ? uniqueToB.map((c: string) => (
                                                        <span key={c} className="px-2 py-1 text-xs bg-amber-900/50 text-amber-200 rounded border border-amber-700/50">{c}</span>
                                                    ))
                                                    : <span className="text-sm text-zinc-500">None</span>
                                                }
                                            </div>
                                        </div>

                                        <div className="border border-zinc-600 rounded-lg p-3 sm:p-4 bg-zinc-800/50">
                                            <h4 className="text-xs sm:text-sm font-semibold mb-2 text-zinc-200">Shared {usePooled ? 'Groups' : 'Colors'} ({sharedColors.length})</h4>
                                            <div className="flex flex-wrap gap-1.5">
                                                {sharedColors.map((c: string) => (
                                                    <span key={c} className="px-2 py-1 text-xs bg-zinc-700 text-zinc-200 rounded">{c}</span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {comparisonResult?.error && (
                                <div className="px-4 py-3 bg-red-900/40 border border-red-700 rounded text-red-200 text-sm">
                                    {comparisonResult.error}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
