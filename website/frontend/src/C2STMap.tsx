import { useEffect, useRef, useState } from 'react'
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

interface C2STData {
    edges: GeoJSON.FeatureCollection
    lc_types: string[]
    stats: {
        total_pairs: number
        mean_accuracy: number
        min_accuracy: number
        max_accuracy: number
    }
}

interface SelectedPair {
    fips_a: string
    fips_b: string
    county_a: string
    county_b: string
}

interface LcAccuracy {
    lc_type: string
    accuracy: number
    n_a: number
    n_b: number
    imp_st_damcat: number | null
    imp_bldgtype: number | null
    imp_clr: number | null
}

interface FeatureDist {
    value: string
    count: number
    proportion: number
    unique: boolean
}

interface FeatureData {
    distribution: FeatureDist[]
    vocab_size: number
}

interface CountyComparison {
    county_a: {
        name: string
        total_count: number
        clr: FeatureData
        bldgtype: FeatureData
        st_damcat: FeatureData
    }
    county_b: {
        name: string
        total_count: number
        clr: FeatureData
        bldgtype: FeatureData
        st_damcat: FeatureData
    }
    error?: string
}

interface InsufficientData {
    lc_type: string
    n_a: number
    n_b: number
}

interface PairComparison {
    fips_a: string
    fips_b: string
    county_a: string
    county_b: string
    by_landcover: LcAccuracy[]
    insufficient_data: InsufficientData[]
}

export function C2STMap() {
    const mapContainer = useRef<HTMLDivElement>(null)
    const map = useRef<maplibregl.Map | null>(null)
    const comparisonRef = useRef<HTMLDivElement>(null)
    const [loading, setLoading] = useState(true)
    const [data, setData] = useState<C2STData | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [lcTypes, setLcTypes] = useState<string[]>([])
    const [selectedLc, setSelectedLc] = useState<string>('')
    const [isFullscreen, setIsFullscreen] = useState(false)

    const [selectedPair, setSelectedPair] = useState<SelectedPair | null>(null)
    const [pairComparison, setPairComparison] = useState<PairComparison | null>(null)
    const [comparisonLoading, setComparisonLoading] = useState(false)

    const [selectedLcType, setSelectedLcType] = useState<string | null>(null)
    const [countyComparison, setCountyComparison] = useState<CountyComparison | null>(null)
    const [comparisonDetailLoading, setComparisonDetailLoading] = useState(false)
    const [selectedFeature, setSelectedFeature] = useState<'clr' | 'bldgtype' | 'st_damcat'>('clr')

    useEffect(() => {
        async function fetchData() {
            try {
                const url = selectedLc
                    ? `${API_URL}/c2st/results?lc_type=${encodeURIComponent(selectedLc)}`
                    : `${API_URL}/c2st/results`
                const res = await fetch(url)
                if (!res.ok) throw new Error('Failed to load C2ST data')
                const result = await res.json()
                setData(result)
                if (lcTypes.length === 0) {
                    setLcTypes(result.lc_types)
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Unknown error')
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [selectedLc])

    useEffect(() => {
        if (!selectedPair) return
        const pair = selectedPair

        async function fetchPairComparison() {
            setComparisonLoading(true)
            setSelectedLcType(null)
            setCountyComparison(null)
            try {
                const res = await fetch(`${API_URL}/c2st/pair/${pair.fips_a}/${pair.fips_b}`)
                const data = await res.json()
                setPairComparison(data)
            } catch {
                setPairComparison(null)
            } finally {
                setComparisonLoading(false)
            }
        }
        fetchPairComparison()
    }, [selectedPair])

    useEffect(() => {
        if (!selectedPair || !selectedLcType) return
        const pair = selectedPair
        const lc = selectedLcType

        async function fetchCountyComparison() {
            setComparisonDetailLoading(true)
            try {
                const res = await fetch(`${API_URL}/compare/counties`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        fips_a: pair.fips_a,
                        fips_b: pair.fips_b,
                        conditions: [{ column: 'lc_type', value: lc }]
                    })
                })
                const data = await res.json()
                setCountyComparison(data)
            } catch {
                setCountyComparison(null)
            } finally {
                setComparisonDetailLoading(false)
            }
        }
        fetchCountyComparison()
    }, [selectedPair, selectedLcType])

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
        if (!map.current || !data) return

        const addLayers = () => {
            if (!map.current) return

            if (map.current.getLayer('edges-line')) map.current.removeLayer('edges-line')
            if (map.current.getLayer('selected-edge')) map.current.removeLayer('selected-edge')
            if (map.current.getSource('edges')) map.current.removeSource('edges')

            map.current.addSource('edges', {
                type: 'geojson',
                data: data.edges
            })

            const edgeColorExpr: maplibregl.ExpressionSpecification = [
                'interpolate',
                ['linear'],
                ['to-number', ['get', 'accuracy'], 0.5],
                0.5, '#440154',
                0.625, '#414487',
                0.75, '#2a788e',
                0.875, '#22a884',
                1.0, '#fde725',
            ]

            map.current.addLayer({
                id: 'edges-line',
                type: 'line',
                source: 'edges',
                paint: {
                    'line-color': edgeColorExpr,
                    'line-width': 4,
                    'line-opacity': 0.9,
                },
            })

            map.current.addLayer({
                id: 'selected-edge',
                type: 'line',
                source: 'edges',
                paint: {
                    'line-color': '#8839ef',
                    'line-width': 8,
                    'line-opacity': 1,
                },
                filter: ['==', ['get', 'fips_a'], '']
            })

            const edgePopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false })

            map.current.on('mousemove', 'edges-line', (e) => {
                if (!e.features || e.features.length === 0) return
                map.current!.getCanvas().style.cursor = 'pointer'
                const props = e.features[0].properties
                const countyA = props.county_a || 'Unknown'
                const countyB = props.county_b || 'Unknown'
                const acc = (props.accuracy * 100).toFixed(1)
                const nA = props.n_a?.toLocaleString() || '0'
                const nB = props.n_b?.toLocaleString() || '0'
                const lc = props.lc_type || 'All'
                const html = `
                    <div style="font-size: 12px; line-height: 1.4;">
                        <div style="font-weight: bold; margin-bottom: 4px;">${countyA} vs ${countyB}</div>
                        <div>C2ST Accuracy: <strong>${acc}%</strong></div>
                        <div>Land Cover: ${lc}</div>
                        <div>Samples: ${nA} / ${nB}</div>
                        <div style="margin-top: 6px; font-size: 10px; color: #666;">Click to compare</div>
                    </div>
                `
                edgePopup.setLngLat(e.lngLat).setHTML(html).addTo(map.current!)
            })

            map.current.on('mouseleave', 'edges-line', () => {
                map.current!.getCanvas().style.cursor = ''
                edgePopup.remove()
            })

            map.current.on('click', 'edges-line', (e) => {
                if (!e.features || e.features.length === 0) return
                const props = e.features[0].properties
                setSelectedPair({
                    fips_a: props.fips_a,
                    fips_b: props.fips_b,
                    county_a: props.county_a,
                    county_b: props.county_b
                })

                if (map.current) {
                    map.current.setFilter('selected-edge', [
                        'all',
                        ['==', ['get', 'fips_a'], props.fips_a],
                        ['==', ['get', 'fips_b'], props.fips_b]
                    ])
                }

                setTimeout(() => {
                    comparisonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }, 100)
            })
        }

        if (map.current.loaded()) {
            addLayers()
        } else {
            map.current.on('load', addLayers)
        }
    }, [data])

    const toggleFullscreen = () => setIsFullscreen(!isFullscreen)

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isFullscreen) setIsFullscreen(false)
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isFullscreen])

    useEffect(() => {
        setTimeout(() => map.current?.resize(), 100)
    }, [isFullscreen])

    const getAccuracyColor = (acc: number) => {
        if (acc < 0.575) return '#440154'
        if (acc < 0.65) return '#414487'
        if (acc < 0.75) return '#2a788e'
        if (acc < 0.875) return '#22a884'
        return '#fde725'
    }

    const [showComparisonPanel, setShowComparisonPanel] = useState(false)

    return (
        <div className={cn(
            'relative flex-1 min-h-0',
            isFullscreen && 'fixed top-0 left-0 right-0 bottom-0 w-screen h-screen z-[9999] bg-white'
        )}>
            {/* Map Container - Full bleed */}
            <div className="absolute inset-0">
                <div ref={mapContainer} className="w-full h-full" />
                
                {/* Loading/Error overlays */}
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-20">
                        Loading C2ST data...
                    </div>
                )}
                {error && (
                    <div className="absolute top-2.5 left-1/2 -translate-x-1/2 px-4 py-2 bg-red-50 border border-red-200 rounded text-red-600 text-sm z-10">
                        {error}
                    </div>
                )}

                {/* Map Controls - Top Left (Statistics and Display) */}
                <div className="absolute top-2.5 left-2.5 flex flex-col gap-2 bg-white/95 rounded p-3 shadow-elevated z-10">
                    {/* Statistics Summary */}
                    {data && (
                        <div className="pb-2 mb-1 border-b border-border">
                            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Statistics</div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                <span className="text-muted-foreground">Pairs:</span>
                                <span className="font-semibold text-foreground">{data.stats.total_pairs}</span>
                                <span className="text-muted-foreground">Mean Accuracy:</span>
                                <span className="font-semibold text-foreground">{(data.stats.mean_accuracy * 100).toFixed(1)}%</span>
                                <span className="text-muted-foreground">Range:</span>
                                <span className="font-semibold text-foreground">{(data.stats.min_accuracy * 100).toFixed(1)}% - {(data.stats.max_accuracy * 100).toFixed(1)}%</span>
                            </div>
                        </div>
                    )}
                    
                    {/* Display Section */}
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Display</span>
                        <select
                            value={selectedLc}
                            onChange={e => setSelectedLc(e.target.value)}
                            className="px-3 py-1.5 text-xs border border-border rounded bg-white cursor-pointer focus:outline-none focus:border-sage-400"
                        >
                            <option value="">All (weighted average)</option>
                            {lcTypes.map(lc => (
                                <option key={lc} value={lc}>{lc}</option>
                            ))}
                        </select>
                    </div>
                    
                    <button
                        className="px-3 py-1.5 border border-border rounded-sm bg-muted text-[11px] font-medium text-muted-foreground cursor-pointer uppercase tracking-wide transition-all duration-150 hover:bg-sage-100 hover:text-foreground hover:border-sage-300"
                        onClick={toggleFullscreen}
                    >
                        {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                    </button>
                </div>

                {/* Legend - Bottom Right */}
                <div className="absolute bottom-4 right-2.5 bg-white/95 p-3 rounded shadow-elevated text-xs z-10">
                    <div className="font-semibold mb-2 text-foreground">C2ST Accuracy</div>
                    <div
                        className="h-2.5 w-44 rounded-sm"
                        style={{ background: 'linear-gradient(to right, #440154, #414487, #2a788e, #22a884, #fde725)' }}
                    />
                    <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
                        <span>50%</span>
                        <span>100%</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Similar</span>
                        <span>Different</span>
                    </div>
                </div>
            </div>

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
                            {comparisonLoading && (
                                <div className="text-muted-foreground">Loading comparison...</div>
                            )}

                            {pairComparison && (
                            <div className="space-y-6">
                                <div>
                                    <h3 className="font-medium mb-2">Accuracy by Land Cover Type</h3>
                                    <p className="text-sm text-muted-foreground mb-4">
                                        50% = indistinguishable, 100% = completely different. Click a row to see distributions.
                                    </p>

                                    <div className="space-y-1">
                                        {pairComparison.by_landcover.map(lc => (
                                            <div
                                                key={lc.lc_type}
                                                className={cn(
                                                    'flex items-center gap-2 text-xs p-2 rounded cursor-pointer transition-colors',
                                                    selectedLcType === lc.lc_type
                                                        ? 'bg-sage-100 border border-sage-300'
                                                        : 'hover:bg-muted'
                                                )}
                                                onClick={() => setSelectedLcType(lc.lc_type)}
                                            >
                                                <span className="w-32 truncate">{lc.lc_type}</span>
                                                <div className="flex-1 h-3 bg-muted rounded overflow-hidden">
                                                    <div
                                                        className="h-full rounded"
                                                        style={{
                                                            width: `${(lc.accuracy - 0.5) * 200}%`,
                                                            backgroundColor: getAccuracyColor(lc.accuracy)
                                                        }}
                                                    />
                                                </div>
                                                <span className="w-14 text-right">{(lc.accuracy * 100).toFixed(1)}%</span>
                                                {lc.imp_clr !== null && (
                                                    <span className="text-muted-foreground ml-2">
                                                        clr:{lc.imp_clr.toFixed(0)}% | bldg:{lc.imp_bldgtype?.toFixed(0)}% | occ:{lc.imp_st_damcat?.toFixed(0)}%
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {pairComparison.insufficient_data.length > 0 && (
                                    <div>
                                        <h4 className="text-sm font-medium text-muted-foreground mb-2">
                                            Insufficient Data ({pairComparison.insufficient_data.length} land covers)
                                        </h4>
                                        <p className="text-xs text-muted-foreground mb-2">
                                            Need at least 50 records in each county to compare
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {pairComparison.insufficient_data.map(item => (
                                                <span
                                                    key={item.lc_type}
                                                    className="px-2 py-1 text-xs bg-muted rounded text-muted-foreground"
                                                    title={`${selectedPair?.county_a}: ${item.n_a} records, ${selectedPair?.county_b}: ${item.n_b} records`}
                                                >
                                                    {item.lc_type}
                                                    <span className="ml-1 opacity-60">({item.n_a}/{item.n_b})</span>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {selectedLcType && (
                                    <div className="p-4 bg-muted/50 rounded">
                                        <div className="flex items-center gap-4 mb-4">
                                            <h3 className="font-medium">Distributions for "{selectedLcType}"</h3>
                                            <div className="flex gap-2">
                                                {(['clr', 'bldgtype', 'st_damcat'] as const).map(f => (
                                                    <button
                                                        key={f}
                                                        onClick={() => setSelectedFeature(f)}
                                                        className={cn(
                                                            'px-3 py-1 text-xs border rounded transition-colors',
                                                            selectedFeature === f
                                                                ? 'bg-sage-500 text-white border-sage-500'
                                                                : 'border-border bg-white hover:bg-muted'
                                                        )}
                                                    >
                                                        {f === 'clr' ? 'Color' : f === 'bldgtype' ? 'Building Type' : 'Occupancy'}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {comparisonDetailLoading && (
                                            <div className="text-muted-foreground">Loading distributions...</div>
                                        )}

                                        {countyComparison && !countyComparison.error && (
                                            <div className="grid grid-cols-2 gap-6">
                                                <div className="border border-border rounded p-4 bg-white">
                                                    <h4 className="font-medium mb-1">{countyComparison.county_a.name}</h4>
                                                    <div className="text-xs text-muted-foreground mb-3">
                                                        {countyComparison.county_a.total_count.toLocaleString()} records | {countyComparison.county_a[selectedFeature].vocab_size} values
                                                    </div>
                                                    <div className="space-y-1">
                                                        {countyComparison.county_a[selectedFeature].distribution.slice(0, 15).map((d: FeatureDist) => (
                                                            <div key={d.value} className={cn('flex items-center gap-2 text-xs', d.unique && 'bg-blue-50 -mx-2 px-2 py-0.5 rounded')}>
                                                                <span className="w-24 flex items-center gap-1.5 truncate">
                                                                    {selectedFeature === 'clr' && (
                                                                        d.value === 'foo' || d.value === 'bar' ? (
                                                                            <span className="w-3 h-3 rounded-full bg-gray-200 flex items-center justify-center text-[8px] font-bold text-gray-500">?</span>
                                                                        ) : (
                                                                            <span className="w-3 h-3 rounded-full border border-border" style={{ backgroundColor: COLOR_MAP[d.value] || '#ccc' }} />
                                                                        )
                                                                    )}
                                                                    {d.value}
                                                                </span>
                                                                <div className="flex-1 h-3 bg-muted rounded overflow-hidden">
                                                                    <div
                                                                        className="h-full rounded"
                                                                        style={{
                                                                            width: `${d.proportion * 100}%`,
                                                                            backgroundColor: d.unique ? '#0077BB' : '#6b7280'
                                                                        }}
                                                                    />
                                                                </div>
                                                                <span className="w-12 text-right text-muted-foreground">{(d.proportion * 100).toFixed(1)}%</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="border border-border rounded p-4 bg-white">
                                                    <h4 className="font-medium mb-1">{countyComparison.county_b.name}</h4>
                                                    <div className="text-xs text-muted-foreground mb-3">
                                                        {countyComparison.county_b.total_count.toLocaleString()} records | {countyComparison.county_b[selectedFeature].vocab_size} values
                                                    </div>
                                                    <div className="space-y-1">
                                                        {countyComparison.county_b[selectedFeature].distribution.slice(0, 15).map((d: FeatureDist) => (
                                                            <div key={d.value} className={cn('flex items-center gap-2 text-xs', d.unique && 'bg-orange-50 -mx-2 px-2 py-0.5 rounded')}>
                                                                <span className="w-24 flex items-center gap-1.5 truncate">
                                                                    {selectedFeature === 'clr' && (
                                                                        d.value === 'foo' || d.value === 'bar' ? (
                                                                            <span className="w-3 h-3 rounded-full bg-gray-200 flex items-center justify-center text-[8px] font-bold text-gray-500">?</span>
                                                                        ) : (
                                                                            <span className="w-3 h-3 rounded-full border border-border" style={{ backgroundColor: COLOR_MAP[d.value] || '#ccc' }} />
                                                                        )
                                                                    )}
                                                                    {d.value}
                                                                </span>
                                                                <div className="flex-1 h-3 bg-muted rounded overflow-hidden">
                                                                    <div
                                                                        className="h-full rounded"
                                                                        style={{
                                                                            width: `${d.proportion * 100}%`,
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
                                        )}

                                        {countyComparison?.error && (
                                            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded text-red-800">
                                                {countyComparison.error}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="border border-border rounded p-4">
                                        <h4 className="text-sm font-medium mb-2">Most Similar (within land cover)</h4>
                                        <div className="flex flex-wrap gap-1">
                                            {pairComparison.by_landcover
                                                .filter(lc => lc.accuracy < 0.7)
                                                .slice(0, 5)
                                                .map(lc => (
                                                    <span key={lc.lc_type} className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded">
                                                        {lc.lc_type}: {(lc.accuracy * 100).toFixed(0)}%
                                                    </span>
                                                ))}
                                            {pairComparison.by_landcover.filter(lc => lc.accuracy < 0.7).length === 0 && (
                                                <span className="text-xs text-muted-foreground">None below 70%</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="border border-border rounded p-4">
                                        <h4 className="text-sm font-medium mb-2">Most Different (within land cover)</h4>
                                        <div className="flex flex-wrap gap-1">
                                            {pairComparison.by_landcover
                                                .filter(lc => lc.accuracy >= 0.9)
                                                .slice(0, 5)
                                                .map(lc => (
                                                    <span key={lc.lc_type} className="px-2 py-0.5 text-xs bg-orange-100 text-orange-800 rounded">
                                                        {lc.lc_type}: {(lc.accuracy * 100).toFixed(0)}%
                                                    </span>
                                                ))}
                                            {pairComparison.by_landcover.filter(lc => lc.accuracy >= 0.9).length === 0 && (
                                                <span className="text-xs text-muted-foreground">None above 90%</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
