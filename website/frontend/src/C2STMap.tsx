import { useEffect, useRef, useState } from 'react'
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

    return (
        <div className="app">
            <h1>C2ST: Classifier Two-Sample Test</h1>
            <div className="conditioning-controls" style={{ marginBottom: '1rem' }}>
                <div className="control-group">
                    <select value={selectedLc} onChange={e => setSelectedLc(e.target.value)}>
                        <option value="">All (weighted average)</option>
                        {lcTypes.map(lc => (
                            <option key={lc} value={lc}>{lc}</option>
                        ))}
                    </select>
                </div>
            </div>

            {data && (
                <div className="stats" style={{ marginBottom: '1.5rem' }}>
                    <span>County Pairs: <strong>{data.stats.total_pairs}</strong></span>
                    <span>Mean Accuracy: <strong>{(data.stats.mean_accuracy * 100).toFixed(1)}%</strong></span>
                    <span>Range: <strong>{(data.stats.min_accuracy * 100).toFixed(1)}% - {(data.stats.max_accuracy * 100).toFixed(1)}%</strong></span>
                </div>
            )}

            <div className={`map-container ${isFullscreen ? 'fullscreen' : ''}`}>
                <div className="map-controls">
                    <button className="fullscreen-btn" onClick={toggleFullscreen}>
                        {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                    </button>
                </div>

                {loading && <div className="map-error">Loading C2ST data...</div>}
                {error && <div className="map-error">{error}</div>}

                <div ref={mapContainer} className="map" />

                <div className="map-legend">
                    <div className="legend-title">C2ST Accuracy</div>
                    <div className="legend-bar" style={{
                        background: 'linear-gradient(to right, #440154, #414487, #2a788e, #22a884, #fde725)'
                    }} />
                    <div className="legend-labels">
                        <span>50%</span>
                        <span>100%</span>
                    </div>
                    <div className="legend-desc">
                        <span>Similar</span>
                        <span>Different</span>
                    </div>
                </div>

                {isFullscreen && (
                    <div className="keybind-hints">
                        <span>Press <kbd>Esc</kbd> to exit fullscreen</span>
                    </div>
                )}
            </div>

            <div ref={comparisonRef} className="comparison-section">
                {selectedPair ? (
                    <>
                        <h2 className="comparison-title">
                            {selectedPair.county_a} vs {selectedPair.county_b}
                        </h2>

                        {comparisonLoading && <div className="loading-message">Loading comparison...</div>}

                        {pairComparison && (
                            <div className="comparison-results">
                                <h3 style={{ marginBottom: '0.5rem' }}>Accuracy by Land Cover Type</h3>
                                <p style={{ color: '#666', marginBottom: '1rem', fontSize: '0.9rem' }}>
                                    50% = indistinguishable, 100% = completely different. Click a row to see distributions.
                                </p>

                                <div className="distribution-bars">
                                    {pairComparison.by_landcover.map(lc => (
                                        <div
                                            key={lc.lc_type}
                                            className={`bar-row ${selectedLcType === lc.lc_type ? 'selected' : ''}`}
                                            onClick={() => setSelectedLcType(lc.lc_type)}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            <span className="bar-label">{lc.lc_type}</span>
                                            <div className="bar-container">
                                                <div
                                                    className="bar"
                                                    style={{
                                                        width: `${(lc.accuracy - 0.5) * 200}%`,
                                                        backgroundColor: getAccuracyColor(lc.accuracy)
                                                    }}
                                                />
                                            </div>
                                            <span className="bar-value">{(lc.accuracy * 100).toFixed(1)}%</span>
                                            {lc.imp_clr !== null && (
                                                <span className="feature-importance" style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#666' }}>
                                                    clr:{lc.imp_clr.toFixed(0)}% | bldg:{lc.imp_bldgtype?.toFixed(0)}% | occ:{lc.imp_st_damcat?.toFixed(0)}%
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {pairComparison.insufficient_data.length > 0 && (
                                    <div style={{ marginTop: '1.5rem' }}>
                                        <h4 style={{ margin: '0 0 0.5rem 0', color: '#666', fontSize: '0.9rem' }}>
                                            Insufficient Data ({pairComparison.insufficient_data.length} land covers)
                                        </h4>
                                        <p style={{ color: '#888', fontSize: '0.8rem', margin: '0 0 0.5rem 0' }}>
                                            Need at least 50 records in each county to compare
                                        </p>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                            {pairComparison.insufficient_data.map(item => (
                                                <span
                                                    key={item.lc_type}
                                                    style={{
                                                        padding: '0.25rem 0.5rem',
                                                        background: '#f5f5f5',
                                                        borderRadius: '4px',
                                                        fontSize: '0.8rem',
                                                        color: '#666'
                                                    }}
                                                    title={`${selectedPair?.county_a}: ${item.n_a} records, ${selectedPair?.county_b}: ${item.n_b} records`}
                                                >
                                                    {item.lc_type}
                                                    <span style={{ color: '#999', marginLeft: '0.25rem' }}>
                                                        ({item.n_a}/{item.n_b})
                                                    </span>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {selectedLcType && (
                                    <div style={{ marginTop: '2rem', padding: '1rem', background: '#f9f9f9', borderRadius: '4px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                                            <h3 style={{ margin: 0 }}>Distributions for "{selectedLcType}"</h3>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                {(['clr', 'bldgtype', 'st_damcat'] as const).map(f => (
                                                    <button
                                                        key={f}
                                                        onClick={() => setSelectedFeature(f)}
                                                        style={{
                                                            padding: '0.25rem 0.75rem',
                                                            border: '1px solid #ccc',
                                                            borderRadius: '4px',
                                                            background: selectedFeature === f ? '#8839ef' : '#fff',
                                                            color: selectedFeature === f ? '#fff' : '#333',
                                                            cursor: 'pointer',
                                                            fontSize: '0.85rem'
                                                        }}
                                                    >
                                                        {f === 'clr' ? 'Color' : f === 'bldgtype' ? 'Building Type' : 'Occupancy'}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {comparisonDetailLoading && <div className="loading-message">Loading distributions...</div>}

                                        {countyComparison && !countyComparison.error && (
                                            <div className="distributions-container">
                                                <div className="distribution-panel">
                                                    <h4 style={{ margin: '0 0 0.5rem 0' }}>{countyComparison.county_a.name}</h4>
                                                    <div className="panel-stats">
                                                        {countyComparison.county_a.total_count.toLocaleString()} records | {countyComparison.county_a[selectedFeature].vocab_size} values
                                                    </div>
                                                    <div className="distribution-bars">
                                                        {countyComparison.county_a[selectedFeature].distribution.slice(0, 15).map((d: FeatureDist) => (
                                                            <div key={d.value} className={`bar-row ${d.unique ? 'unique' : ''}`}>
                                                                <span className="bar-label">
                                                                    {selectedFeature === 'clr' && (
                                                                        d.value === 'foo' || d.value === 'bar' ? (
                                                                            <span className="color-swatch" style={{ backgroundColor: '#f0f0f0', color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold' }}>?</span>
                                                                        ) : (
                                                                            <span
                                                                                className="color-swatch"
                                                                                style={{ backgroundColor: COLOR_MAP[d.value] || '#ccc' }}
                                                                            />
                                                                        )
                                                                    )}
                                                                    {d.value}
                                                                </span>
                                                                <div className="bar-container">
                                                                    <div
                                                                        className="bar"
                                                                        style={{
                                                                            width: `${d.proportion * 100}%`,
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
                                                    <h4 style={{ margin: '0 0 0.5rem 0' }}>{countyComparison.county_b.name}</h4>
                                                    <div className="panel-stats">
                                                        {countyComparison.county_b.total_count.toLocaleString()} records | {countyComparison.county_b[selectedFeature].vocab_size} values
                                                    </div>
                                                    <div className="distribution-bars">
                                                        {countyComparison.county_b[selectedFeature].distribution.slice(0, 15).map((d: FeatureDist) => (
                                                            <div key={d.value} className={`bar-row ${d.unique ? 'unique' : ''}`}>
                                                                <span className="bar-label">
                                                                    {selectedFeature === 'clr' && (
                                                                        d.value === 'foo' || d.value === 'bar' ? (
                                                                            <span className="color-swatch" style={{ backgroundColor: '#f0f0f0', color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold' }}>?</span>
                                                                        ) : (
                                                                            <span
                                                                                className="color-swatch"
                                                                                style={{ backgroundColor: COLOR_MAP[d.value] || '#ccc' }}
                                                                            />
                                                                        )
                                                                    )}
                                                                    {d.value}
                                                                </span>
                                                                <div className="bar-container">
                                                                    <div
                                                                        className="bar"
                                                                        style={{
                                                                            width: `${d.proportion * 100}%`,
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
                                        )}

                                        {countyComparison?.error && (
                                            <div className="error-message">{countyComparison.error}</div>
                                        )}
                                    </div>
                                )}

                                <div style={{ marginTop: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div className="vocab-section">
                                        <h4>Most Similar (within land cover)</h4>
                                        <div className="color-chips">
                                            {pairComparison.by_landcover
                                                .filter(lc => lc.accuracy < 0.7)
                                                .slice(0, 5)
                                                .map(lc => (
                                                    <span key={lc.lc_type} className="color-chip unique-a">
                                                        {lc.lc_type}: {(lc.accuracy * 100).toFixed(0)}%
                                                    </span>
                                                ))}
                                            {pairComparison.by_landcover.filter(lc => lc.accuracy < 0.7).length === 0 && (
                                                <span className="no-unique">None below 70%</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="vocab-section">
                                        <h4>Most Different (within land cover)</h4>
                                        <div className="color-chips">
                                            {pairComparison.by_landcover
                                                .filter(lc => lc.accuracy >= 0.9)
                                                .slice(0, 5)
                                                .map(lc => (
                                                    <span key={lc.lc_type} className="color-chip unique-b">
                                                        {lc.lc_type}: {(lc.accuracy * 100).toFixed(0)}%
                                                    </span>
                                                ))}
                                            {pairComparison.by_landcover.filter(lc => lc.accuracy >= 0.9).length === 0 && (
                                                <span className="no-unique">None above 90%</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
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
