import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { cn } from './lib/utils'

const API_URL = 'http://localhost:8000'
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

const PRESETS = {
    browns: { name: "browns", colors: ["brown", "sienna", "cocoa", "coffee", "tan", "terracotta", "auburn"] },
    reds: { name: "reds", colors: ["red", "scarlet", "crimson", "maroon"] },
    greens: { name: "greens", colors: ["green", "sage", "verde", "emerald", "olive"] },
    blues_purples: { name: "blues_purples", colors: ["blue", "indigo", "navy", "purple", "lavender", "lilac"] },
    grays: { name: "grays", colors: ["gray", "grey"] },
}

interface ColorGroup {
    name: string
    colors: string[]
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
    const [showEdges, setShowEdges] = useState(true)

    // Selected pair for comparison
    const [selectedPair, setSelectedPair] = useState<SelectedPair | null>(null)

    // Comparison state
    const [conditionValues, setConditionValues] = useState<Record<string, string[]>>({})
    const [lcType, setLcType] = useState<string>('')
    const [stDamcat, setStDamcat] = useState<string>('')
    const [bldgtype, setBldgtype] = useState<string>('')
    const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null)
    const [comparisonLoading, setComparisonLoading] = useState(false)

    const [colorGroups, setColorGroups] = useState<ColorGroup[]>([])
    const [showColorPanel, setShowColorPanel] = useState(false)
    const [selectedColors, setSelectedColors] = useState<Set<string>>(new Set())
    const [newGroupName, setNewGroupName] = useState('')
    const [allColors, setAllColors] = useState<string[]>([])

    // Map comparison state
    const [showMergedMap, setShowMergedMap] = useState(false)
    const [mergedMapLoading, setMergedMapLoading] = useState(false)

    const [showComparisonPanel, setShowComparisonPanel] = useState(false)


    const [draggedColor, setDraggedColor] = useState<{ color: string; fromGroup: string | null } | null>(null)

    const [hoveredEdge, setHoveredEdge] = useState<{ fips_a: string; fips_b: string; sourceMap: 'original' | 'merged'; lngLat: [number, number] } | null>(null)
    const originalPopupRef = useRef<maplibregl.Popup | null>(null)
    const mergedPopupRef = useRef<maplibregl.Popup | null>(null)
    const isSyncingRef = useRef(false)

    const comparisonRef = useRef<HTMLDivElement>(null)

    const groupedColors = new Set(colorGroups.flatMap(g => g.colors))
    const ungroupedColors = allColors.filter(c => !groupedColors.has(c))

    useEffect(() => {
        async function fetchData() {
            try {
                const [divergenceRes, conditionsRes] = await Promise.all([
                    fetch(`${API_URL}/map/neighbor-divergence`),
                    fetch(`${API_URL}/conditioning-options`)
                ])
                if (!divergenceRes.ok) throw new Error('Failed to load divergence data')
                const result = await divergenceRes.json()
                const conditions = await conditionsRes.json()
                setData(result)
                setConditionValues(conditions.values)

                setAllColors(Object.keys(COLOR_MAP).filter(c => c !== 'foo' && c !== 'bar').sort())
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

    const [mergedMapReady, setMergedMapReady] = useState(false)

    useEffect(() => {
        if (!mergedMapContainer.current || !showMergedMap || mergedMap.current) return

        const newMap = new maplibregl.Map({
            container: mergedMapContainer.current,
            style: MAP_STYLE,
            center: [-119.5, 37.5],
            zoom: 5.5,
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
            const clickHint = isOriginal ? '<div style="margin-top: 6px; font-size: 10px; color: #666;">Click to compare</div>' : ''
            const mapLabel = isOriginal ? '<div style="font-size: 10px; color: #666; margin-bottom: 4px;">ORIGINAL</div>' : '<div style="font-size: 10px; color: #2166ac; margin-bottom: 4px;">MERGED COLORS</div>'
            const html = `
                <div style="font-size: 12px; line-height: 1.4;">
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
                setShowComparisonPanel(true) // Auto-expand panel when pair is selected

                mapInstance.setFilter('selected-edge', [
                    'all',
                    ['==', ['get', 'fips_a'], props.fips_a],
                    ['==', ['get', 'fips_b'], props.fips_b]
                ])

                setTimeout(() => {
                    comparisonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }, 100)
            })
        }
    }, [])

    useEffect(() => {
        if (!map.current || !data) return

        const addLayers = () => {
            if (!map.current) return
            addLayersToMap(map.current, data, true)
        }

        if (map.current.loaded()) {
            addLayers()
        } else {
            map.current.on('load', addLayers)
        }
    }, [data, addLayersToMap])

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
            const mapLabel = isOriginal ? '<div style="font-size: 10px; color: #666; margin-bottom: 4px;">ORIGINAL</div>' : '<div style="font-size: 10px; color: #2166ac; margin-bottom: 4px;">MERGED COLORS</div>'

            const html = `
                <div style="font-size: 12px; line-height: 1.4;">
                    ${mapLabel}
                    <div style="font-weight: bold; margin-bottom: 4px;">${countyA} - ${countyB}</div>
                    <div>Avg JSD: <strong>${jsd}</strong></div>
                    <div>Shared Land Cover Types: ${nLc}</div>
                    <div>Total Support: ${support}</div>
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

    // Fetch comparison when pair or conditioning changes
    useEffect(() => {
        if (!selectedPair) return

        const pair = selectedPair

        const conditions: { column: string; value: string }[] = []
        if (lcType) conditions.push({ column: 'lc_type', value: lcType })
        if (stDamcat) conditions.push({ column: 'st_damcat', value: stDamcat })
        if (bldgtype) conditions.push({ column: 'bldgtype', value: bldgtype })

        async function fetchComparison() {
            setComparisonLoading(true)
            try {
                const res = await fetch(`${API_URL}/compare/counties`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        fips_a: pair.fips_a,
                        fips_b: pair.fips_b,
                        conditions: conditions.length > 0 ? conditions : null,
                        color_groups: colorGroups.length > 0 ? colorGroups : null
                    })
                })
                const data = await res.json()
                setComparisonResult(data)
            } catch {
                setComparisonResult(null)
            } finally {
                setComparisonLoading(false)
            }
        }
        fetchComparison()
    }, [selectedPair, lcType, stDamcat, bldgtype, colorGroups])

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

    const addPreset = (presetKey: keyof typeof PRESETS) => {
        const preset = PRESETS[presetKey]
        if (colorGroups.some(g => g.name === preset.name)) return
        setColorGroups([...colorGroups, { ...preset }])
    }

    const addAllPresets = () => {
        const newGroups: ColorGroup[] = []
        for (const preset of Object.values(PRESETS)) {
            if (!colorGroups.some(g => g.name === preset.name)) {
                newGroups.push({ ...preset })
            }
        }
        setColorGroups([...colorGroups, ...newGroups])
    }

    const removeGroup = (name: string) => {
        setColorGroups(colorGroups.filter(g => g.name !== name))
    }

    const resetGroups = () => {
        setColorGroups([])
        setSelectedColors(new Set())
        setShowMergedMap(false)
        setMergedData(null)
    }

    const toggleColorSelection = (color: string) => {
        const newSelected = new Set(selectedColors)
        if (newSelected.has(color)) {
            newSelected.delete(color)
        } else {
            newSelected.add(color)
        }
        setSelectedColors(newSelected)
    }

    const addSelectedToGroup = (groupName: string) => {
        if (selectedColors.size === 0) return

        if (groupName === '__new__') {
            if (!newGroupName.trim()) return
            const newGroup: ColorGroup = {
                name: newGroupName.trim().toLowerCase().replace(/\s+/g, '_'),
                colors: Array.from(selectedColors)
            }
            setColorGroups([...colorGroups, newGroup])
            setNewGroupName('')
        } else {
            setColorGroups(colorGroups.map(g =>
                g.name === groupName
                    ? { ...g, colors: [...new Set([...g.colors, ...selectedColors])] }
                    : g
            ))
        }
        setSelectedColors(new Set())
    }

    const handleDragStart = (color: string, fromGroup: string | null) => {
        setDraggedColor({ color, fromGroup })
    }

    const handleDragEnd = () => {
        setDraggedColor(null)
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
    }

    const handleDrop = (e: React.DragEvent, targetGroup: string | null) => {
        e.preventDefault()
        if (!draggedColor) return

        const { color, fromGroup } = draggedColor

        if (fromGroup === targetGroup) {
            setDraggedColor(null)
            return
        }

        let newGroups = colorGroups.map(g => {
            if (g.name === fromGroup) {
                return { ...g, colors: g.colors.filter(c => c !== color) }
            }
            return g
        })

        if (targetGroup !== null) {
            newGroups = newGroups.map(g => {
                if (g.name === targetGroup && !g.colors.includes(color)) {
                    return { ...g, colors: [...g.colors, color] }
                }
                return g
            })
        }

        newGroups = newGroups.filter(g => g.colors.length > 0)

        setColorGroups(newGroups)
        setDraggedColor(null)
    }

    const recalculateAllPairs = async () => {
        if (colorGroups.length === 0) return

        setMergedMapLoading(true)
        setShowMergedMap(true)

        try {
            const res = await fetch(`${API_URL}/map/neighbor-divergence-merged`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ color_groups: colorGroups })
            })
            const result = await res.json()
            setMergedData(result)
        } catch (err) {
            console.error('Failed to recalculate:', err)
        } finally {
            setMergedMapLoading(false)
        }
    }

    const maxProportion = comparisonResult && !comparisonResult.error
        ? Math.max(
            ...comparisonResult.county_a.clr.distribution.map((d: FeatureDist) => d.proportion),
            ...comparisonResult.county_b.clr.distribution.map((d: FeatureDist) => d.proportion)
        )
        : 0

    const uniqueToA = comparisonResult && !comparisonResult.error
        ? comparisonResult.county_a.clr.distribution.filter((d: FeatureDist) => d.unique).map((d: FeatureDist) => d.value)
        : []
    const uniqueToB = comparisonResult && !comparisonResult.error
        ? comparisonResult.county_b.clr.distribution.filter((d: FeatureDist) => d.unique).map((d: FeatureDist) => d.value)
        : []
    const sharedColors = comparisonResult && !comparisonResult.error
        ? comparisonResult.county_a.clr.distribution.filter((d: FeatureDist) => !d.unique && d.count > 0).map((d: FeatureDist) => d.value)
        : []
    const vocabOverlap = comparisonResult && !comparisonResult.error && (comparisonResult.county_a.clr.vocab_size + comparisonResult.county_b.clr.vocab_size - sharedColors.length) > 0
        ? sharedColors.length / (comparisonResult.county_a.clr.vocab_size + comparisonResult.county_b.clr.vocab_size - sharedColors.length)
        : 0

    return (
        <div className={cn(
            'relative flex-1 min-h-0',
            isFullscreen && 'fixed top-0 left-0 right-0 bottom-0 w-screen h-screen z-[9999] bg-white'
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
                        <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-20">
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
                        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-white/95 rounded shadow-elevated text-xs font-semibold uppercase tracking-wide z-10">
                            Original
                        </div>
                    )}

                    {/* Map Controls - Top Left */}
                    <div className="absolute top-2.5 left-2.5 flex flex-col gap-2 bg-white/95 rounded p-3 shadow-elevated z-10">
                        {/* Stats Summary */}
                        {data && (
                            <div className="pb-2 mb-1 border-b border-border">
                                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Statistics</div>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                    <span className="text-muted-foreground">Pairs:</span>
                                    <span className="font-semibold text-foreground">{data.stats.total_pairs}</span>
                                    <span className="text-muted-foreground">Mean JSD:</span>
                                    <span className="font-semibold text-foreground">{data.stats.mean_jsd.toFixed(3)}</span>
                                    <span className="text-muted-foreground">Range:</span>
                                    <span className="font-semibold text-foreground">{data.stats.min_jsd.toFixed(3)} - {data.stats.max_jsd.toFixed(3)}</span>
                                </div>
                            </div>
                        )}
                        <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Display</span>
                            <div className="flex rounded-sm overflow-hidden border border-border">
                                <button
                                    className={cn(
                                        'px-3 py-1.5 border-none bg-muted text-xs font-medium text-muted-foreground cursor-pointer transition-all duration-150',
                                        'hover:bg-sage-100 hover:text-foreground',
                                        showEdges && 'bg-sage-500 text-white hover:bg-sage-600 hover:text-white'
                                    )}
                                    onClick={() => setShowEdges(true)}
                                >
                                    Show Edges
                                </button>
                                <button
                                    className={cn(
                                        'px-3 py-1.5 border-none border-l border-border bg-muted text-xs font-medium text-muted-foreground cursor-pointer transition-all duration-150',
                                        'hover:bg-sage-100 hover:text-foreground',
                                        !showEdges && 'bg-sage-500 text-white hover:bg-sage-600 hover:text-white'
                                    )}
                                    onClick={() => setShowEdges(false)}
                                >
                                    Hide Edges
                                </button>
                            </div>
                        </div>
                        <button
                            className="px-3 py-1.5 border border-border rounded-sm bg-muted text-[11px] font-medium text-muted-foreground cursor-pointer uppercase tracking-wide transition-all duration-150 hover:bg-sage-100 hover:text-foreground hover:border-sage-300"
                            onClick={() => setShowColorPanel(!showColorPanel)}
                        >
                            {showColorPanel ? 'Hide Color Groups' : 'Color Groups'}
                        </button>
                        <button
                            className="px-3 py-1.5 border border-border rounded-sm bg-muted text-[11px] font-medium text-muted-foreground cursor-pointer uppercase tracking-wide transition-all duration-150 hover:bg-sage-100 hover:text-foreground hover:border-sage-300"
                            onClick={toggleFullscreen}
                        >
                            {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                        </button>
                        {showMergedMap && (
                            <button
                                className="px-3 py-1.5 border border-red-300 rounded-sm bg-red-50 text-[11px] font-medium text-red-600 cursor-pointer uppercase tracking-wide transition-all duration-150 hover:bg-red-100 hover:border-red-400"
                                onClick={() => setShowMergedMap(false)}
                            >
                                Close Comparison
                            </button>
                        )}
                    </div>

                    {/* Stats badge when split view */}
                    {showMergedMap && data && (
                        <div className={cn(
                            "absolute left-1/2 -translate-x-1/2 z-10 bg-white rounded-lg shadow-elevated px-4 py-3 text-center",
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
                            'absolute right-2.5 bg-white/95 p-3 rounded shadow-elevated text-xs z-10 transition-all duration-300',
                            selectedPair ? 'bottom-20' : 'bottom-7'
                        )}>
                            <div className="font-semibold mb-2 text-foreground">Avg JSD (Divergence)</div>
                            <div
                                className="w-44 h-2.5 rounded-sm"
                                style={{ background: 'linear-gradient(to right, #fde725, #22a884, #2a788e, #414487, #440154)' }}
                            />
                            <div className="flex justify-between mt-1 text-muted-foreground">
                                <span>0</span>
                                <span>0.5</span>
                                <span>1</span>
                            </div>
                            <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
                                <span>Similar</span>
                                <span>Different</span>
                            </div>
                        </div>
                    )}

                    {/* Keybind Hints - Bottom Left (only when not split) */}
                    {!showMergedMap && (
                        <div className={cn(
                            'absolute left-2.5 flex flex-col gap-1 z-10 transition-all duration-300',
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
                            <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-20">
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
                                "absolute left-1/2 -translate-x-1/2 z-10 bg-white rounded-lg shadow-elevated px-4 py-3 text-center",
                                selectedPair ? 'bottom-20' : 'bottom-4'
                            )}>
                                <div className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide mb-1">Merged</div>
                                <div className="text-lg font-bold text-foreground">{mergedData.stats.mean_jsd.toFixed(3)}</div>
                                <div className="text-[10px] text-muted-foreground">Mean JSD</div>
                            </div>
                        )}

                        {/* Legend */}
                        <div className={cn(
                            'absolute right-2.5 bg-white/95 p-3 rounded shadow-elevated text-xs z-10',
                            selectedPair ? 'bottom-20' : 'bottom-7'
                        )}>
                            <div className="font-semibold mb-2 text-foreground">Avg JSD (Divergence)</div>
                            <div
                                className="w-36 h-2.5 rounded-sm"
                                style={{ background: 'linear-gradient(to right, #fde725, #22a884, #2a788e, #414487, #440154)' }}
                            />
                            <div className="flex justify-between mt-1 text-muted-foreground">
                                <span>0</span>
                                <span>1</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Color Grouping Panel - Floating */}
            {showColorPanel && (
                <div className="absolute top-16 left-2.5 w-[380px] max-h-[calc(100%-120px)] bg-white rounded-lg shadow-elevated z-30 overflow-hidden flex flex-col">
                    <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
                        <h3 className="font-semibold text-sm">Color Grouping</h3>
                        <button
                            className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded text-lg leading-none"
                            onClick={() => setShowColorPanel(false)}
                        >
                            ×
                        </button>
                    </div>
                    <div className="p-4 space-y-4 overflow-y-auto flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">Presets:</span>
                            <button
                                onClick={() => addPreset('browns')}
                                className={cn(
                                    'px-2.5 py-1 text-xs border rounded transition-colors',
                                    colorGroups.some(g => g.name === 'browns')
                                        ? 'bg-sage-500 text-white border-sage-500'
                                        : 'border-sage-300 hover:bg-sage-100'
                                )}
                            >
                                Browns
                            </button>
                            <button
                                onClick={() => addPreset('reds')}
                                className={cn(
                                    'px-2.5 py-1 text-xs border rounded transition-colors',
                                    colorGroups.some(g => g.name === 'reds')
                                        ? 'bg-sage-500 text-white border-sage-500'
                                        : 'border-sage-300 hover:bg-sage-100'
                                )}
                            >
                                Reds
                            </button>
                            <button
                                onClick={() => addPreset('greens')}
                                className={cn(
                                    'px-2.5 py-1 text-xs border rounded transition-colors',
                                    colorGroups.some(g => g.name === 'greens')
                                        ? 'bg-sage-500 text-white border-sage-500'
                                        : 'border-sage-300 hover:bg-sage-100'
                                )}
                            >
                                Greens
                            </button>
                            <button
                                onClick={() => addPreset('blues_purples')}
                                className={cn(
                                    'px-2.5 py-1 text-xs border rounded transition-colors',
                                    colorGroups.some(g => g.name === 'blues_purples')
                                        ? 'bg-sage-500 text-white border-sage-500'
                                        : 'border-sage-300 hover:bg-sage-100'
                                )}
                            >
                                Blues/Purples
                            </button>
                            <button
                                onClick={() => addPreset('grays')}
                                className={cn(
                                    'px-2.5 py-1 text-xs border rounded transition-colors',
                                    colorGroups.some(g => g.name === 'grays')
                                        ? 'bg-sage-500 text-white border-sage-500'
                                        : 'border-sage-300 hover:bg-sage-100'
                                )}
                            >
                                Grays
                            </button>
                            <button
                                onClick={addAllPresets}
                                className={cn(
                                    'px-2.5 py-1 text-xs border rounded transition-colors',
                                    colorGroups.length > 0 && colorGroups.length === Object.keys(PRESETS).length
                                        ? 'bg-sage-500 text-white border-sage-500'
                                        : 'border-sage-300 hover:bg-sage-100'
                                )}
                            >
                                All
                            </button>
                            <button
                                onClick={resetGroups}
                                className="px-2.5 py-1 text-xs border border-red-300 text-red-600 rounded hover:bg-red-50 transition-colors"
                            >
                                Reset
                            </button>
                        </div>

                        {colorGroups.length > 0 && (
                            <div>
                                <h4 className="text-xs font-semibold mb-1.5">Groups ({colorGroups.length}) <span className="font-normal text-muted-foreground">- drag colors to reorder</span></h4>
                                <div className="space-y-1.5">
                                    {colorGroups.map(group => (
                                        <div
                                            key={group.name}
                                            className="flex items-center gap-2 p-2 rounded text-xs bg-muted"
                                            onDragOver={handleDragOver}
                                            onDrop={(e) => handleDrop(e, group.name)}
                                        >
                                            <span className="font-medium min-w-[70px]">{group.name}</span>
                                            <span className="flex items-center gap-1 flex-1 flex-wrap">
                                                {group.colors.map(c => (
                                                    <span
                                                        key={c}
                                                        draggable
                                                        onDragStart={() => handleDragStart(c, group.name)}
                                                        onDragEnd={handleDragEnd}
                                                        className={cn(
                                                            'w-5 h-5 rounded-full border-2 cursor-grab active:cursor-grabbing transition-all hover:scale-110',
                                                            draggedColor?.color === c ? 'opacity-50 border-sage-500' : 'border-white shadow-sm'
                                                        )}
                                                        style={{ backgroundColor: COLOR_MAP[c] || '#ccc' }}
                                                        title={`${c} - drag to move`}
                                                    />
                                                ))}
                                            </span>
                                            <button
                                                className="w-5 h-5 flex items-center justify-center text-red-500 hover:text-red-700 hover:bg-red-50 rounded leading-none"
                                                onClick={() => removeGroup(group.name)}
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, null)}
                        >
                            <h4 className="text-xs font-semibold mb-1.5">Ungrouped Colors</h4>
                            <div className="flex flex-wrap gap-1 min-h-[40px]">
                                {ungroupedColors.map(color => (
                                    <button
                                        key={color}
                                        draggable
                                        onDragStart={() => handleDragStart(color, null)}
                                        onDragEnd={handleDragEnd}
                                        className={cn(
                                            'inline-flex items-center gap-1 px-2 py-0.5 text-xs border rounded cursor-grab active:cursor-grabbing transition-all',
                                            selectedColors.has(color)
                                                ? 'border-sage-500 bg-sage-100 text-foreground'
                                                : 'border-border text-muted-foreground hover:border-sage-400',
                                            draggedColor?.color === color && 'opacity-50'
                                        )}
                                        onClick={() => toggleColorSelection(color)}
                                    >
                                        <span
                                            className="w-3 h-3 rounded-full border border-border"
                                            style={{ backgroundColor: COLOR_MAP[color] || '#ccc' }}
                                        />
                                        {color}
                                    </button>
                                ))}
                                {ungroupedColors.length === 0 && (
                                    <span className="text-xs text-muted-foreground italic">All colors are grouped</span>
                                )}
                            </div>

                            {selectedColors.size > 0 && (
                                <div className="flex items-center gap-2 mt-2 p-2 bg-sage-50 rounded border border-sage-200">
                                    <span className="text-xs font-medium text-sage-700">{selectedColors.size} selected</span>
                                    <select
                                        className="px-2 py-1 text-xs border border-border rounded bg-white"
                                        onChange={(e) => {
                                            if (e.target.value) {
                                                addSelectedToGroup(e.target.value)
                                                e.target.value = ''
                                            }
                                        }}
                                    >
                                        <option value="">Add to...</option>
                                        {colorGroups.map(g => (
                                            <option key={g.name} value={g.name}>{g.name}</option>
                                        ))}
                                        <option value="__new__">+ New</option>
                                    </select>
                                    <input
                                        type="text"
                                        placeholder="Group name"
                                        value={newGroupName}
                                        onChange={(e) => setNewGroupName(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && newGroupName.trim()) {
                                                addSelectedToGroup('__new__')
                                            }
                                        }}
                                        className="px-2 py-1 text-xs border border-border rounded flex-1"
                                    />
                                </div>
                            )}
                        </div>

                        <button
                            className={cn(
                                'w-full px-3 py-2 text-xs font-semibold rounded transition-colors',
                                colorGroups.length === 0 || mergedMapLoading
                                    ? 'bg-muted text-muted-foreground cursor-not-allowed'
                                    : 'bg-sage-500 text-white hover:bg-sage-600 cursor-pointer'
                            )}
                            onClick={recalculateAllPairs}
                            disabled={colorGroups.length === 0 || mergedMapLoading}
                        >
                            {mergedMapLoading ? 'Calculating...' : 'Recalculate All Pairs'}
                        </button>
                        {colorGroups.length === 0 && (
                            <p className="text-[10px] text-muted-foreground text-center">Add color groups to enable recalculation</p>
                        )}
                    </div>
                </div>
            )}

            {/* Comparison Panel - Bottom Sheet */}
            {selectedPair && (
                <div
                    ref={comparisonRef}
                    className={cn(
                        'absolute bottom-0 left-0 right-0 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.15)] z-40 transition-all duration-300',
                        showComparisonPanel ? 'h-[65%]' : 'h-auto'
                    )}
                >
                    {/* Panel Header - Always visible */}
                    <div
                        className="px-5 py-4 border-b border-border flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => setShowComparisonPanel(!showComparisonPanel)}
                    >
                        <div className="flex items-center gap-6">
                            <h3 className="font-semibold text-base">
                                {selectedPair.county_a} vs {selectedPair.county_b}
                            </h3>
                            {comparisonResult?.jsd && (
                                <div className="flex items-center gap-3 text-sm">
                                    <span className="px-3 py-1 bg-muted rounded font-medium">JSD: {comparisonResult.jsd.original.toFixed(4)}</span>
                                    {comparisonResult.jsd.merged !== undefined && (
                                        <>
                                            <span className="text-muted-foreground">→</span>
                                            <span className="px-3 py-1 bg-blue-50 rounded font-medium">{comparisonResult.jsd.merged.toFixed(4)}</span>
                                            <span className={cn(
                                                'px-3 py-1 rounded font-semibold',
                                                comparisonResult.jsd.reduction! > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                            )}>
                                                {comparisonResult.jsd.reduction! > 0 ? '-' : '+'}
                                                {Math.abs(comparisonResult.jsd.reduction_pct!).toFixed(1)}%
                                            </span>
                                        </>
                                    )}
                                    <span className="text-muted-foreground">|</span>
                                    <span className="text-muted-foreground">
                                        Overlap: {(vocabOverlap * 100).toFixed(0)}% ({sharedColors.length} colors)
                                    </span>
                                </div>
                            )}
                            {comparisonLoading && <span className="text-sm text-muted-foreground">Loading...</span>}
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                                onClick={(e) => { e.stopPropagation(); setShowComparisonPanel(!showComparisonPanel) }}
                            >
                                {showComparisonPanel ? 'Collapse' : 'Expand'}
                            </button>
                            <button
                                className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded text-xl leading-none"
                                onClick={(e) => { e.stopPropagation(); setSelectedPair(null); setShowComparisonPanel(false) }}
                            >
                                ×
                            </button>
                        </div>
                    </div>

                    {/* Panel Content - Expandable */}
                    {showComparisonPanel && (
                        <div className="h-[calc(100%-65px)] overflow-y-auto p-6">
                            {/* Filters */}
                            <div className="flex flex-wrap items-end gap-4 mb-6">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Land Cover</label>
                                    <select
                                        value={lcType}
                                        onChange={e => setLcType(e.target.value)}
                                        className="px-3 py-2 border border-border rounded bg-white text-sm min-w-[140px]"
                                    >
                                        <option value="">All</option>
                                        {(conditionValues['lc_type'] || []).map(v => (
                                            <option key={v} value={v}>{v}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Occupancy</label>
                                    <select
                                        value={stDamcat}
                                        onChange={e => setStDamcat(e.target.value)}
                                        className="px-3 py-2 border border-border rounded bg-white text-sm min-w-[140px]"
                                    >
                                        <option value="">All</option>
                                        {(conditionValues['st_damcat'] || []).map(v => (
                                            <option key={v} value={v}>{v}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Building Type</label>
                                    <select
                                        value={bldgtype}
                                        onChange={e => setBldgtype(e.target.value)}
                                        className="px-3 py-2 border border-border rounded bg-white text-sm min-w-[140px]"
                                    >
                                        <option value="">All</option>
                                        {(conditionValues['bldgtype'] || []).map(v => (
                                            <option key={v} value={v}>{v}</option>
                                        ))}
                                    </select>
                                </div>

                                {(lcType || stDamcat || bldgtype) && (
                                    <button
                                        className="px-3 py-2 text-sm border border-red-300 text-red-600 rounded hover:bg-red-50 transition-colors"
                                        onClick={() => {
                                            setLcType('')
                                            setStDamcat('')
                                            setBldgtype('')
                                        }}
                                    >
                                        Clear Filters
                                    </button>
                                )}
                            </div>

                            {comparisonResult && !comparisonResult.error && (
                                <div className="space-y-6">
                                    {comparisonResult.conditioning.conditions.length > 0 && (
                                        <div className="text-sm text-muted-foreground">
                                            Filtered by:{' '}
                                            {comparisonResult.conditioning.conditions.map((c, i) => (
                                                <span key={c.column}>
                                                    {i > 0 && ' AND '}
                                                    <strong>{c.column}</strong> = <strong>{c.value}</strong>
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {(comparisonResult.county_a.total_count < 100 || comparisonResult.county_b.total_count < 100) && (
                                        <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded text-amber-800 text-sm">
                                            Warning: Small sample size. {comparisonResult.county_a.name} has {comparisonResult.county_a.total_count} records, {comparisonResult.county_b.name} has {comparisonResult.county_b.total_count} records.
                                        </div>
                                    )}

                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="border border-border rounded-lg p-4">
                                            <h3 className="font-semibold text-base mb-1">{comparisonResult.county_a.name}</h3>
                                            <div className="text-xs text-muted-foreground mb-3">
                                                {comparisonResult.county_a.total_count.toLocaleString()} records | {comparisonResult.county_a.clr.vocab_size} colors
                                            </div>
                                            <div className="space-y-1.5">
                                                {comparisonResult.county_a.clr.distribution.slice(0, 15).map((d: FeatureDist) => (
                                                    <div key={d.value} className={cn('flex items-center gap-2 text-sm', d.unique && 'bg-blue-50 -mx-2 px-2 py-1 rounded')}>
                                                        <span className="w-24 flex items-center gap-2 truncate">
                                                            {d.value === 'foo' || d.value === 'bar' ? (
                                                                <span className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center text-[8px] font-bold text-gray-500">?</span>
                                                            ) : (
                                                                <span className="w-4 h-4 rounded-full border border-border" style={{ backgroundColor: COLOR_MAP[d.value] || '#ccc' }} />
                                                            )}
                                                            {d.value}
                                                        </span>
                                                        <div className="flex-1 h-3 bg-muted rounded overflow-hidden">
                                                            <div
                                                                className="h-full rounded"
                                                                style={{
                                                                    width: `${(d.proportion / maxProportion) * 100}%`,
                                                                    backgroundColor: d.unique ? '#0077BB' : '#6b7280'
                                                                }}
                                                            />
                                                        </div>
                                                        <span className="w-14 text-right text-muted-foreground">{(d.proportion * 100).toFixed(1)}%</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="border border-border rounded-lg p-4">
                                            <h3 className="font-semibold text-base mb-1">{comparisonResult.county_b.name}</h3>
                                            <div className="text-xs text-muted-foreground mb-3">
                                                {comparisonResult.county_b.total_count.toLocaleString()} records | {comparisonResult.county_b.clr.vocab_size} colors
                                            </div>
                                            <div className="space-y-1.5">
                                                {comparisonResult.county_b.clr.distribution.slice(0, 15).map((d: FeatureDist) => (
                                                    <div key={d.value} className={cn('flex items-center gap-2 text-sm', d.unique && 'bg-orange-50 -mx-2 px-2 py-1 rounded')}>
                                                        <span className="w-24 flex items-center gap-2 truncate">
                                                            {d.value === 'foo' || d.value === 'bar' ? (
                                                                <span className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center text-[8px] font-bold text-gray-500">?</span>
                                                            ) : (
                                                                <span className="w-4 h-4 rounded-full border border-border" style={{ backgroundColor: COLOR_MAP[d.value] || '#ccc' }} />
                                                            )}
                                                            {d.value}
                                                        </span>
                                                        <div className="flex-1 h-3 bg-muted rounded overflow-hidden">
                                                            <div
                                                                className="h-full rounded"
                                                                style={{
                                                                    width: `${(d.proportion / maxProportion) * 100}%`,
                                                                    backgroundColor: d.unique ? '#EE7733' : '#6b7280'
                                                                }}
                                                            />
                                                        </div>
                                                        <span className="w-14 text-right text-muted-foreground">{(d.proportion * 100).toFixed(1)}%</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="border border-border rounded-lg p-4">
                                            <h4 className="text-sm font-semibold mb-2">Unique to {comparisonResult.county_a.name} ({uniqueToA.length})</h4>
                                            <div className="flex flex-wrap gap-1.5">
                                                {uniqueToA.length > 0
                                                    ? uniqueToA.map((c: string) => (
                                                        <span key={c} className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">{c}</span>
                                                    ))
                                                    : <span className="text-sm text-muted-foreground">None</span>
                                                }
                                            </div>
                                        </div>

                                        <div className="border border-border rounded-lg p-4">
                                            <h4 className="text-sm font-semibold mb-2">Unique to {comparisonResult.county_b.name} ({uniqueToB.length})</h4>
                                            <div className="flex flex-wrap gap-1.5">
                                                {uniqueToB.length > 0
                                                    ? uniqueToB.map((c: string) => (
                                                        <span key={c} className="px-2 py-1 text-xs bg-orange-100 text-orange-800 rounded">{c}</span>
                                                    ))
                                                    : <span className="text-sm text-muted-foreground">None</span>
                                                }
                                            </div>
                                        </div>

                                        <div className="border border-border rounded-lg p-4">
                                            <h4 className="text-sm font-semibold mb-2">Shared Colors ({sharedColors.length})</h4>
                                            <div className="flex flex-wrap gap-1.5">
                                                {sharedColors.map((c: string) => (
                                                    <span key={c} className="px-2 py-1 text-xs bg-muted text-foreground rounded">{c}</span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {comparisonResult?.error && (
                                <div className="px-4 py-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
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
