import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import './App.css'

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
        <div className="app">
            <h1>Neighbor Divergence</h1>
            <p className="subtitle">
                Jensen-Shannon Divergence between neighboring counties' color distributions.
            </p>

            {data && (
                <div className="stats" style={{ marginBottom: '1.5rem' }}>
                    <span>County Pairs: <strong>{data.stats.total_pairs}</strong></span>
                    <span>Mean Avg JSD: <strong>{data.stats.mean_jsd.toFixed(3)}</strong></span>
                    <span>Range: <strong>{data.stats.min_jsd.toFixed(3)} - {data.stats.max_jsd.toFixed(3)}</strong></span>
                </div>
            )}

            {/* Map comparison container */}
            <div className={`map-comparison-container ${showMergedMap ? 'dual' : ''}`}>
                <div className={`map-container ${isFullscreen ? 'fullscreen' : ''}`}>
                    {showMergedMap && <div className="map-label">Original</div>}
                    {data && showMergedMap && (
                        <div className="map-jsd-badge">
                            Mean JSD: {data.stats.mean_jsd.toFixed(3)}
                        </div>
                    )}
                    <div className="map-controls">
                        <button
                            className="toggle-hex-btn"
                            onClick={() => setShowEdges(!showEdges)}
                        >
                            {showEdges ? 'Hide Edges' : 'Show Edges'}
                        </button>
                        <button className="fullscreen-btn" onClick={toggleFullscreen}>
                            {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                        </button>
                    </div>

                    {loading && <div className="map-error">Loading divergence data...</div>}
                    {error && <div className="map-error">{error}</div>}

                    <div ref={mapContainer} className="map" />

                    <div className="map-legend">
                        <div className="legend-title">Avg JSD (Divergence)</div>
                        <div className="legend-bar" style={{
                            background: 'linear-gradient(to right, #440154, #414487, #2a788e, #22a884, #fde725)'
                        }} />
                        <div className="legend-labels">
                            <span>0</span>
                            <span>1</span>
                        </div>
                        <div className="legend-desc">
                            <span>Similar</span>
                            <span>Different</span>
                        </div>
                    </div>

                    <div className="keybind-hints">
                        {isFullscreen && <span>Press <kbd>Esc</kbd> to exit fullscreen</span>}
                        <span>Press <kbd>E</kbd> to {showEdges ? 'hide' : 'show'} edges</span>
                    </div>
                </div>

                {showMergedMap && (
                    <div className="map-container merged-map">
                        <div className="map-label merged">Merged Colors</div>
                        {mergedData && (
                            <div className="map-jsd-badge merged">
                                Mean JSD: {mergedData.stats.mean_jsd.toFixed(3)}
                                {data && (
                                    <span className="jsd-change">
                                        ({((mergedData.stats.mean_jsd - data.stats.mean_jsd) / data.stats.mean_jsd * 100).toFixed(1)}%)
                                    </span>
                                )}
                            </div>
                        )}
                        {mergedMapLoading && <div className="map-loading-overlay">Recalculating...</div>}
                        <div ref={mergedMapContainer} className="map" />
                    </div>
                )}
            </div>

            {/* Color Grouping Panel */}
            <div className="color-grouping-panel">
                <div className="panel-header" onClick={() => setShowColorPanel(!showColorPanel)}>
                    <h3>Color Grouping</h3>
                    <button className="toggle-panel-btn">
                        {showColorPanel ? 'Hide' : 'Show'}
                    </button>
                </div>

                {showColorPanel && (
                    <div className="panel-content">
                        <div className="preset-buttons">
                            <span className="preset-label">Presets:</span>
                            <button onClick={() => addPreset('browns')}>All Browns</button>
                            <button onClick={() => addPreset('reds')}>All Reds</button>
                            <button onClick={() => addPreset('greens')}>All Greens</button>
                            <button onClick={() => addPreset('blues_purples')}>Blues/Purples</button>
                            <button onClick={() => addPreset('grays')}>Grays</button>
                            <button onClick={addAllPresets} className="add-all-btn">Add All</button>
                            <button onClick={resetGroups} className="reset-btn">Reset</button>
                        </div>

                        {colorGroups.length > 0 && (
                            <div className="groups-section">
                                <h4>Groups ({colorGroups.length})</h4>
                                <div className="groups-list">
                                    {colorGroups.map(group => (
                                        <div key={group.name} className="group-item">
                                            <span className="group-name">[{group.name}]</span>
                                            <span className="group-colors">
                                                {group.colors.map(c => (
                                                    <span key={c} className="mini-color-chip" style={{ backgroundColor: COLOR_MAP[c] || '#ccc' }} title={c} />
                                                ))}
                                                <span className="color-count">({group.colors.length})</span>
                                            </span>
                                            <button className="delete-group-btn" onClick={() => removeGroup(group.name)}>×</button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="ungrouped-section">
                            <h4>Ungrouped Colors (click to select)</h4>
                            <div className="ungrouped-colors">
                                {ungroupedColors.map(color => (
                                    <button
                                        key={color}
                                        className={`color-chip-btn ${selectedColors.has(color) ? 'selected' : ''}`}
                                        onClick={() => toggleColorSelection(color)}
                                        style={{
                                            '--chip-color': COLOR_MAP[color] || '#ccc'
                                        } as React.CSSProperties}
                                    >
                                        <span className="chip-swatch" style={{ backgroundColor: COLOR_MAP[color] || '#ccc' }} />
                                        {color}
                                    </button>
                                ))}
                            </div>

                            {selectedColors.size > 0 && (
                                <div className="add-to-group">
                                    <span>{selectedColors.size} selected</span>
                                    <select onChange={(e) => {
                                        if (e.target.value) {
                                            addSelectedToGroup(e.target.value)
                                            e.target.value = ''
                                        }
                                    }}>
                                        <option value="">Add to group...</option>
                                        {colorGroups.map(g => (
                                            <option key={g.name} value={g.name}>{g.name}</option>
                                        ))}
                                        <option value="__new__">+ New group</option>
                                    </select>
                                    {newGroupName !== undefined && (
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
                                        />
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="recalculate-section">
                            <button
                                className="recalculate-btn"
                                onClick={recalculateAllPairs}
                                disabled={colorGroups.length === 0 || mergedMapLoading}
                            >
                                {mergedMapLoading ? 'Calculating...' : 'Recalculate All Pairs'}
                            </button>
                            {colorGroups.length === 0 && (
                                <span className="hint">Add color groups to enable recalculation</span>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <div ref={comparisonRef} className="comparison-section">
                {selectedPair ? (
                    <>
                        <h2 className="comparison-title">
                            Comparing: {selectedPair.county_a} vs {selectedPair.county_b}
                        </h2>

                        <div className="conditioning-controls">
                            <div className="control-group">
                                <label>Land Cover</label>
                                <select value={lcType} onChange={e => setLcType(e.target.value)}>
                                    <option value="">All</option>
                                    {(conditionValues['lc_type'] || []).map(v => (
                                        <option key={v} value={v}>{v}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="control-group">
                                <label>Occupancy</label>
                                <select value={stDamcat} onChange={e => setStDamcat(e.target.value)}>
                                    <option value="">All</option>
                                    {(conditionValues['st_damcat'] || []).map(v => (
                                        <option key={v} value={v}>{v}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="control-group">
                                <label>Building Type</label>
                                <select value={bldgtype} onChange={e => setBldgtype(e.target.value)}>
                                    <option value="">All</option>
                                    {(conditionValues['bldgtype'] || []).map(v => (
                                        <option key={v} value={v}>{v}</option>
                                    ))}
                                </select>
                            </div>

                            {(lcType || stDamcat || bldgtype) && (
                                <button
                                    className="clear-filters-btn"
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

                        {comparisonLoading && <div className="loading-message">Loading comparison...</div>}

                        {comparisonResult && !comparisonResult.error && (
                            <div className="comparison-results">
                                <div className="jsd-summary">
                                    {comparisonResult.jsd && (
                                        <div className="jsd-comparison">
                                            <div className="jsd-box original">
                                                <div className="jsd-label">Original JSD</div>
                                                <div className="jsd-value">{comparisonResult.jsd.original.toFixed(4)}</div>
                                            </div>
                                            {comparisonResult.jsd.merged !== undefined && (
                                                <>
                                                    <div className="jsd-arrow">→</div>
                                                    <div className="jsd-box merged">
                                                        <div className="jsd-label">Merged JSD</div>
                                                        <div className="jsd-value">{comparisonResult.jsd.merged.toFixed(4)}</div>
                                                    </div>
                                                    <div className={`jsd-change-box ${comparisonResult.jsd.reduction! > 0 ? 'positive' : 'negative'}`}>
                                                        <div className="change-value">
                                                            {comparisonResult.jsd.reduction! > 0 ? '-' : '+'}
                                                            {Math.abs(comparisonResult.jsd.reduction_pct!).toFixed(1)}%
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}
                                    <div className="vocab-overlap">
                                        Vocabulary Overlap: {(vocabOverlap * 100).toFixed(0)}%
                                        ({sharedColors.length} shared colors)
                                    </div>
                                </div>
                                {comparisonResult.conditioning.conditions.length > 0 && (
                                    <div className="conditioning-info">
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
                                    <div className="sample-size-warning">
                                        Warning: Small sample size. {comparisonResult.county_a.name} has {comparisonResult.county_a.total_count} records, {comparisonResult.county_b.name} has {comparisonResult.county_b.total_count} records. Results may be unreliable.
                                    </div>
                                )}
                                <div className="distributions-container">
                                    <div className="distribution-panel">
                                        <h3>{comparisonResult.county_a.name}</h3>
                                        <div className="panel-stats">
                                            {comparisonResult.county_a.total_count.toLocaleString()} records |{' '}
                                            {comparisonResult.county_a.clr.vocab_size} colors
                                        </div>
                                        <div className="distribution-bars">
                                            {comparisonResult.county_a.clr.distribution.slice(0, 20).map((d: FeatureDist) => (
                                                <div key={d.value} className={`bar-row ${d.unique ? 'unique' : ''}`}>
                                                    <span className="bar-label">
                                                        {d.value === 'foo' || d.value === 'bar' ? (
                                                            <span className="color-swatch" style={{ backgroundColor: '#f0f0f0', color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold' }}>?</span>
                                                        ) : (
                                                            <span className="color-swatch" style={{ backgroundColor: COLOR_MAP[d.value] || '#ccc' }} />
                                                        )}
                                                        {d.value}
                                                    </span>
                                                    <div className="bar-container">
                                                        <div
                                                            className="bar"
                                                            style={{
                                                                width: `${(d.proportion / maxProportion) * 100}%`,
                                                                backgroundColor: d.unique ? '#0077BB' : '#6b7280'
                                                            }}
                                                        />
                                                    </div>
                                                    <span className="bar-value">{(d.proportion * 100).toFixed(1)}%</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="distribution-panel">
                                        <h3>{comparisonResult.county_b.name}</h3>
                                        <div className="panel-stats">
                                            {comparisonResult.county_b.total_count.toLocaleString()} records |{' '}
                                            {comparisonResult.county_b.clr.vocab_size} colors
                                        </div>
                                        <div className="distribution-bars">
                                            {comparisonResult.county_b.clr.distribution.slice(0, 20).map((d: FeatureDist) => (
                                                <div key={d.value} className={`bar-row ${d.unique ? 'unique' : ''}`}>
                                                    <span className="bar-label">
                                                        {d.value === 'foo' || d.value === 'bar' ? (
                                                            <span className="color-swatch" style={{ backgroundColor: '#f0f0f0', color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold' }}>?</span>
                                                        ) : (
                                                            <span className="color-swatch" style={{ backgroundColor: COLOR_MAP[d.value] || '#ccc' }} />
                                                        )}
                                                        {d.value}
                                                    </span>
                                                    <div className="bar-container">
                                                        <div
                                                            className="bar"
                                                            style={{
                                                                width: `${(d.proportion / maxProportion) * 100}%`,
                                                                backgroundColor: d.unique ? '#EE7733' : '#6b7280'
                                                            }}
                                                        />
                                                    </div>
                                                    <span className="bar-value">{(d.proportion * 100).toFixed(1)}%</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="vocabulary-breakdown">
                                    <div className="vocab-section">
                                        <h4>Unique to {comparisonResult.county_a.name} ({uniqueToA.length})</h4>
                                        <div className="color-chips">
                                            {uniqueToA.length > 0
                                                ? uniqueToA.map((c: string) => (
                                                    <span key={c} className="color-chip unique-a">{c}</span>
                                                ))
                                                : <span className="no-unique">None</span>
                                            }
                                        </div>
                                    </div>

                                    <div className="vocab-section">
                                        <h4>Unique to {comparisonResult.county_b.name} ({uniqueToB.length})</h4>
                                        <div className="color-chips">
                                            {uniqueToB.length > 0
                                                ? uniqueToB.map((c: string) => (
                                                    <span key={c} className="color-chip unique-b">{c}</span>
                                                ))
                                                : <span className="no-unique">None</span>
                                            }
                                        </div>
                                    </div>

                                    <div className="vocab-section shared">
                                        <h4>Shared Colors ({sharedColors.length})</h4>
                                        <div className="color-chips">
                                            {sharedColors.map((c: string) => (
                                                <span key={c} className="color-chip shared">{c}</span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {comparisonResult?.error && (
                            <div className="error-message">{comparisonResult.error}</div>
                        )}
                    </>
                ) : (
                    <div>
                    </div>
                )}
            </div>
        </div>
    )
}
