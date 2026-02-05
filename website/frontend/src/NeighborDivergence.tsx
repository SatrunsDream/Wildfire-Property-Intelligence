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
    greens: { name: "greens", colors: ["green", "sage", "verde", "emerald"] },
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
            0.0, '#440154',
            0.25, '#414487',
            0.5, '#2a788e',
            0.75, '#22a884',
            1.0, '#fde725',
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
        const layerId = `${edgeSourceId}-line`

        mapInstance.on('mousemove', layerId, (e) => {
            if (!e.features || e.features.length === 0) return
            mapInstance.getCanvas().style.cursor = 'pointer'
            const props = e.features[0].properties
            const countyA = props.county_a || 'Unknown'
            const countyB = props.county_b || 'Unknown'
            const jsd = props.weighted_jsd?.toFixed(3) || 'N/A'
            const nLc = props.n_shared_lc || 0
            const support = props.total_support?.toLocaleString() || '0'
            const clickHint = isOriginal ? '<div style="margin-top: 6px; font-size: 10px; color: #666;">Click to compare</div>' : ''
            const mapLabel = isOriginal ? '' : '<div style="font-size: 10px; color: #2166ac; margin-bottom: 4px;">MERGED COLORS</div>'
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
        <div className="py-6">
            <h1 className="text-2xl font-medium mb-2">Neighbor Divergence</h1>
            <p className="text-muted-foreground mb-6">
                Jensen-Shannon Divergence between neighboring counties' color distributions.
            </p>

            {data && (
                <div className="flex gap-6 text-sm mb-6">
                    <span>County Pairs: <strong>{data.stats.total_pairs}</strong></span>
                    <span>Mean Avg JSD: <strong>{data.stats.mean_jsd.toFixed(3)}</strong></span>
                    <span>Range: <strong>{data.stats.min_jsd.toFixed(3)} - {data.stats.max_jsd.toFixed(3)}</strong></span>
                </div>
            )}

            {/* Map comparison container */}
            <div className={cn('grid gap-4', showMergedMap ? 'grid-cols-2' : 'grid-cols-1')}>
                <div className={cn(
                    'relative border border-border rounded overflow-hidden',
                    isFullscreen && 'fixed inset-0 z-50 rounded-none'
                )}>
                    {showMergedMap && (
                        <div className="absolute top-2 left-2 z-10 px-3 py-1 bg-white/95 text-xs font-medium uppercase tracking-wide rounded shadow-card">
                            Original
                        </div>
                    )}
                    {data && showMergedMap && (
                        <div className="absolute top-2 left-24 z-10 px-3 py-1 bg-white/95 text-xs rounded shadow-card">
                            Mean JSD: {data.stats.mean_jsd.toFixed(3)}
                        </div>
                    )}
                    <div className="absolute top-2 right-12 z-10 flex gap-2">
                        <button
                            className={cn(
                                'px-3 py-1.5 text-xs font-medium rounded border shadow-card cursor-pointer transition-colors',
                                showEdges
                                    ? 'bg-sage-500 text-white border-sage-500'
                                    : 'bg-white/95 text-foreground border-border hover:bg-muted'
                            )}
                            onClick={() => setShowEdges(!showEdges)}
                        >
                            {showEdges ? 'Hide Edges' : 'Show Edges'}
                        </button>
                        <button
                            className="px-3 py-1.5 text-xs font-medium rounded border border-border bg-white/95 text-foreground shadow-card cursor-pointer hover:bg-muted transition-colors"
                            onClick={toggleFullscreen}
                        >
                            {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                        </button>
                    </div>

                    {loading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-20">
                            Loading divergence data...
                        </div>
                    )}
                    {error && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-20 text-red-600">
                            {error}
                        </div>
                    )}

                    <div ref={mapContainer} className={cn('w-full', isFullscreen ? 'h-screen' : 'h-[500px]')} />

                    <div className="absolute bottom-4 left-4 bg-white/95 p-3 rounded shadow-elevated text-xs z-10">
                        <div className="font-medium mb-1">Avg JSD (Divergence)</div>
                        <div
                            className="h-3 w-40 rounded"
                            style={{ background: 'linear-gradient(to right, #440154, #414487, #2a788e, #22a884, #fde725)' }}
                        />
                        <div className="flex justify-between mt-1 text-muted-foreground">
                            <span>0</span>
                            <span>1</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground">
                            <span>Similar</span>
                            <span>Different</span>
                        </div>
                    </div>

                    <div className="absolute bottom-4 right-4 bg-white/95 px-2 py-1 rounded text-xs text-muted-foreground z-10">
                        {isFullscreen && <span>Press <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Esc</kbd> to exit fullscreen · </span>}
                        <span>Press <kbd className="px-1 py-0.5 bg-muted rounded text-xs">E</kbd> to {showEdges ? 'hide' : 'show'} edges</span>
                    </div>
                </div>

                {showMergedMap && (
                    <div className="relative border border-border rounded overflow-hidden">
                        <div className="absolute top-2 left-2 z-10 px-3 py-1 bg-blue-100 text-blue-800 text-xs font-medium uppercase tracking-wide rounded shadow-card">
                            Merged Colors
                        </div>
                        {mergedData && (
                            <div className="absolute top-2 left-32 z-10 px-3 py-1 bg-white/95 text-xs rounded shadow-card">
                                Mean JSD: {mergedData.stats.mean_jsd.toFixed(3)}
                                {data && (
                                    <span className={cn(
                                        'ml-2',
                                        mergedData.stats.mean_jsd < data.stats.mean_jsd ? 'text-green-600' : 'text-red-600'
                                    )}>
                                        ({((mergedData.stats.mean_jsd - data.stats.mean_jsd) / data.stats.mean_jsd * 100).toFixed(1)}%)
                                    </span>
                                )}
                            </div>
                        )}
                        {mergedMapLoading && (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-20">
                                Recalculating...
                            </div>
                        )}
                        <div ref={mergedMapContainer} className="w-full h-[500px]" />
                    </div>
                )}
            </div>

            {/* Color Grouping Panel */}
            <div className="mt-6 border border-border rounded overflow-hidden">
                <div
                    className="flex items-center justify-between px-4 py-3 bg-muted cursor-pointer"
                    onClick={() => setShowColorPanel(!showColorPanel)}
                >
                    <h3 className="font-medium">Color Grouping</h3>
                    <button className="text-sm text-muted-foreground hover:text-foreground">
                        {showColorPanel ? 'Hide' : 'Show'}
                    </button>
                </div>

                {showColorPanel && (
                    <div className="p-4 space-y-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm text-muted-foreground">Presets:</span>
                            <button
                                onClick={() => addPreset('browns')}
                                className="px-3 py-1 text-xs border border-sage-300 rounded hover:bg-sage-100 transition-colors"
                            >
                                All Browns
                            </button>
                            <button
                                onClick={() => addPreset('reds')}
                                className="px-3 py-1 text-xs border border-sage-300 rounded hover:bg-sage-100 transition-colors"
                            >
                                All Reds
                            </button>
                            <button
                                onClick={() => addPreset('greens')}
                                className="px-3 py-1 text-xs border border-sage-300 rounded hover:bg-sage-100 transition-colors"
                            >
                                All Greens
                            </button>
                            <button
                                onClick={() => addPreset('blues_purples')}
                                className="px-3 py-1 text-xs border border-sage-300 rounded hover:bg-sage-100 transition-colors"
                            >
                                Blues/Purples
                            </button>
                            <button
                                onClick={() => addPreset('grays')}
                                className="px-3 py-1 text-xs border border-sage-300 rounded hover:bg-sage-100 transition-colors"
                            >
                                Grays
                            </button>
                            <button
                                onClick={addAllPresets}
                                className="px-3 py-1 text-xs bg-sage-500 text-white rounded hover:bg-sage-600 transition-colors"
                            >
                                Add All
                            </button>
                            <button
                                onClick={resetGroups}
                                className="px-3 py-1 text-xs border border-red-300 text-red-600 rounded hover:bg-red-50 transition-colors"
                            >
                                Reset
                            </button>
                        </div>

                        {colorGroups.length > 0 && (
                            <div>
                                <h4 className="text-sm font-medium mb-2">Groups ({colorGroups.length})</h4>
                                <div className="space-y-2">
                                    {colorGroups.map(group => (
                                        <div key={group.name} className="flex items-center gap-2 p-2 bg-muted rounded">
                                            <span className="text-sm">[{group.name}]</span>
                                            <span className="flex items-center gap-1">
                                                {group.colors.map(c => (
                                                    <span
                                                        key={c}
                                                        className="w-4 h-4 rounded-full border border-border"
                                                        style={{ backgroundColor: COLOR_MAP[c] || '#ccc' }}
                                                        title={c}
                                                    />
                                                ))}
                                                <span className="text-xs text-muted-foreground ml-1">({group.colors.length})</span>
                                            </span>
                                            <button
                                                className="ml-auto text-red-500 hover:text-red-700 text-lg leading-none"
                                                onClick={() => removeGroup(group.name)}
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div>
                            <h4 className="text-sm font-medium mb-2">Ungrouped Colors (click to select)</h4>
                            <div className="flex flex-wrap gap-2">
                                {ungroupedColors.map(color => (
                                    <button
                                        key={color}
                                        className={cn(
                                            'inline-flex items-center gap-1.5 px-2 py-1 text-xs border rounded cursor-pointer transition-colors',
                                            selectedColors.has(color)
                                                ? 'border-sage-500 bg-sage-100 text-foreground'
                                                : 'border-border text-muted-foreground hover:border-sage-400'
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
                            </div>

                            {selectedColors.size > 0 && (
                                <div className="flex items-center gap-2 mt-3">
                                    <span className="text-sm text-muted-foreground">{selectedColors.size} selected</span>
                                    <select
                                        className="px-2 py-1 text-sm border border-border rounded bg-white"
                                        onChange={(e) => {
                                            if (e.target.value) {
                                                addSelectedToGroup(e.target.value)
                                                e.target.value = ''
                                            }
                                        }}
                                    >
                                        <option value="">Add to group...</option>
                                        {colorGroups.map(g => (
                                            <option key={g.name} value={g.name}>{g.name}</option>
                                        ))}
                                        <option value="__new__">+ New group</option>
                                    </select>
                                    <input
                                        type="text"
                                        placeholder="New group name"
                                        value={newGroupName}
                                        onChange={(e) => setNewGroupName(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && newGroupName.trim()) {
                                                addSelectedToGroup('__new__')
                                            }
                                        }}
                                        className="px-2 py-1 text-sm border border-border rounded"
                                    />
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-3 pt-2">
                            <button
                                className={cn(
                                    'px-4 py-2 text-sm font-medium rounded transition-colors',
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
                                <span className="text-sm text-muted-foreground">Add color groups to enable recalculation</span>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <div ref={comparisonRef} className="mt-8">
                {selectedPair ? (
                    <>
                        <h2 className="text-xl font-medium mb-4">
                            Comparing: {selectedPair.county_a} vs {selectedPair.county_b}
                        </h2>

                        <div className="flex flex-wrap items-end gap-4 mb-6">
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Land Cover</label>
                                <select
                                    value={lcType}
                                    onChange={e => setLcType(e.target.value)}
                                    className="px-3 py-2 border border-border rounded bg-white text-sm"
                                >
                                    <option value="">All</option>
                                    {(conditionValues['lc_type'] || []).map(v => (
                                        <option key={v} value={v}>{v}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Occupancy</label>
                                <select
                                    value={stDamcat}
                                    onChange={e => setStDamcat(e.target.value)}
                                    className="px-3 py-2 border border-border rounded bg-white text-sm"
                                >
                                    <option value="">All</option>
                                    {(conditionValues['st_damcat'] || []).map(v => (
                                        <option key={v} value={v}>{v}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Building Type</label>
                                <select
                                    value={bldgtype}
                                    onChange={e => setBldgtype(e.target.value)}
                                    className="px-3 py-2 border border-border rounded bg-white text-sm"
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

                        {comparisonLoading && (
                            <div className="text-muted-foreground">Loading comparison...</div>
                        )}

                        {comparisonResult && !comparisonResult.error && (
                            <div className="space-y-6">
                                <div className="flex flex-wrap items-center gap-4">
                                    {comparisonResult.jsd && (
                                        <div className="flex items-center gap-3">
                                            <div className="px-4 py-3 bg-muted rounded text-center">
                                                <div className="text-xs text-muted-foreground uppercase">Original JSD</div>
                                                <div className="text-lg font-medium">{comparisonResult.jsd.original.toFixed(4)}</div>
                                            </div>
                                            {comparisonResult.jsd.merged !== undefined && (
                                                <>
                                                    <span className="text-muted-foreground">→</span>
                                                    <div className="px-4 py-3 bg-blue-50 rounded text-center">
                                                        <div className="text-xs text-muted-foreground uppercase">Merged JSD</div>
                                                        <div className="text-lg font-medium">{comparisonResult.jsd.merged.toFixed(4)}</div>
                                                    </div>
                                                    <div className={cn(
                                                        'px-3 py-2 rounded font-medium',
                                                        comparisonResult.jsd.reduction! > 0
                                                            ? 'bg-green-100 text-green-700'
                                                            : 'bg-red-100 text-red-700'
                                                    )}>
                                                        {comparisonResult.jsd.reduction! > 0 ? '-' : '+'}
                                                        {Math.abs(comparisonResult.jsd.reduction_pct!).toFixed(1)}%
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}
                                    <div className="text-sm text-muted-foreground">
                                        Vocabulary Overlap: {(vocabOverlap * 100).toFixed(0)}%
                                        ({sharedColors.length} shared colors)
                                    </div>
                                </div>

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
                                        Warning: Small sample size. {comparisonResult.county_a.name} has {comparisonResult.county_a.total_count} records, {comparisonResult.county_b.name} has {comparisonResult.county_b.total_count} records. Results may be unreliable.
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-6">
                                    <div className="border border-border rounded p-4">
                                        <h3 className="font-medium mb-1">{comparisonResult.county_a.name}</h3>
                                        <div className="text-xs text-muted-foreground mb-3">
                                            {comparisonResult.county_a.total_count.toLocaleString()} records |{' '}
                                            {comparisonResult.county_a.clr.vocab_size} colors
                                        </div>
                                        <div className="space-y-1">
                                            {comparisonResult.county_a.clr.distribution.slice(0, 20).map((d: FeatureDist) => (
                                                <div key={d.value} className={cn('flex items-center gap-2 text-xs', d.unique && 'bg-blue-50 -mx-2 px-2 py-0.5 rounded')}>
                                                    <span className="w-24 flex items-center gap-1.5 truncate">
                                                        {d.value === 'foo' || d.value === 'bar' ? (
                                                            <span className="w-3 h-3 rounded-full bg-gray-200 flex items-center justify-center text-[8px] font-bold text-gray-500">?</span>
                                                        ) : (
                                                            <span className="w-3 h-3 rounded-full border border-border" style={{ backgroundColor: COLOR_MAP[d.value] || '#ccc' }} />
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
                                                    <span className="w-12 text-right text-muted-foreground">{(d.proportion * 100).toFixed(1)}%</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="border border-border rounded p-4">
                                        <h3 className="font-medium mb-1">{comparisonResult.county_b.name}</h3>
                                        <div className="text-xs text-muted-foreground mb-3">
                                            {comparisonResult.county_b.total_count.toLocaleString()} records |{' '}
                                            {comparisonResult.county_b.clr.vocab_size} colors
                                        </div>
                                        <div className="space-y-1">
                                            {comparisonResult.county_b.clr.distribution.slice(0, 20).map((d: FeatureDist) => (
                                                <div key={d.value} className={cn('flex items-center gap-2 text-xs', d.unique && 'bg-orange-50 -mx-2 px-2 py-0.5 rounded')}>
                                                    <span className="w-24 flex items-center gap-1.5 truncate">
                                                        {d.value === 'foo' || d.value === 'bar' ? (
                                                            <span className="w-3 h-3 rounded-full bg-gray-200 flex items-center justify-center text-[8px] font-bold text-gray-500">?</span>
                                                        ) : (
                                                            <span className="w-3 h-3 rounded-full border border-border" style={{ backgroundColor: COLOR_MAP[d.value] || '#ccc' }} />
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
                                                    <span className="w-12 text-right text-muted-foreground">{(d.proportion * 100).toFixed(1)}%</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-4">
                                    <div className="border border-border rounded p-4">
                                        <h4 className="text-sm font-medium mb-2">Unique to {comparisonResult.county_a.name} ({uniqueToA.length})</h4>
                                        <div className="flex flex-wrap gap-1">
                                            {uniqueToA.length > 0
                                                ? uniqueToA.map((c: string) => (
                                                    <span key={c} className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded">{c}</span>
                                                ))
                                                : <span className="text-xs text-muted-foreground">None</span>
                                            }
                                        </div>
                                    </div>

                                    <div className="border border-border rounded p-4">
                                        <h4 className="text-sm font-medium mb-2">Unique to {comparisonResult.county_b.name} ({uniqueToB.length})</h4>
                                        <div className="flex flex-wrap gap-1">
                                            {uniqueToB.length > 0
                                                ? uniqueToB.map((c: string) => (
                                                    <span key={c} className="px-2 py-0.5 text-xs bg-orange-100 text-orange-800 rounded">{c}</span>
                                                ))
                                                : <span className="text-xs text-muted-foreground">None</span>
                                            }
                                        </div>
                                    </div>

                                    <div className="border border-border rounded p-4">
                                        <h4 className="text-sm font-medium mb-2">Shared Colors ({sharedColors.length})</h4>
                                        <div className="flex flex-wrap gap-1">
                                            {sharedColors.map((c: string) => (
                                                <span key={c} className="px-2 py-0.5 text-xs bg-muted text-foreground rounded">{c}</span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {comparisonResult?.error && (
                            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded text-red-800">
                                {comparisonResult.error}
                            </div>
                        )}
                    </>
                ) : (
                    <div />
                )}
            </div>
        </div>
    )
}
