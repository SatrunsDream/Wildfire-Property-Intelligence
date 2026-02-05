import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import * as d3 from 'd3'
import { cn } from './lib/utils'
import { chartColors } from './lib/chart-colors'

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

interface BaselineDistribution {
    lc_type: string
    clr: string
    baseline_prop: number
}

interface StabilizedDistribution {
    fips: number
    lc_type: string
    clr: string
    count: number
    exposure: number
    observed_prop: number
    baseline_prop: number
    shrinkage_weight: number
    stabilized_prop: number
    movement: number
    abs_movement: number
    effective_n: number
    exposure_bin: string
}

interface CountyMapData {
    type: 'FeatureCollection'
    features: GeoJSON.Feature[]
    metric: string
    lc_type: string | null
    stats: {
        total_counties: number
        mean_value: number
        max_value: number
    }
}

interface CountyDetail {
    fips: string
    county_name: string
    by_landcover: Array<{
        lc_type: string
        total_exposure: number
        mean_shrinkage_weight: number
        max_abs_movement: number
        num_categories: number
        distributions: StabilizedDistribution[]
        baseline: BaselineDistribution[]
    }>
    total_landcover_types: number
}

export function EmpiricalBayesPooling() {
    const mapContainer = useRef<HTMLDivElement>(null)
    const map = useRef<maplibregl.Map | null>(null)
    const [landcoverTypes, setLandcoverTypes] = useState<string[]>([])
    const [selectedLandcover, setSelectedLandcover] = useState<string>('')
    const [mapData, setMapData] = useState<CountyMapData | null>(null)
    const [countyDetail, setCountyDetail] = useState<CountyDetail | null>(null)
    const detailRef = useRef<HTMLDivElement>(null)
    const [showDetailPanel, setShowDetailPanel] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [legendRange, setLegendRange] = useState<{ min: number; max: number } | null>(null)

    const loadCountyDetail = useCallback(async (fips: string) => {
        try {
            const lcParam = selectedLandcover ? `&lc_type=${encodeURIComponent(selectedLandcover)}` : ''
            const response = await fetch(`${API_URL}/bayesian/county/${fips}?${lcParam}`)
            if (!response.ok) {
                const errorText = await response.text()
                throw new Error(`Failed to load county detail: ${errorText}`)
            }
            const data = await response.json()
            setCountyDetail(data)
            setShowDetailPanel(true)
        } catch (err) {
            console.error('Failed to load county detail:', err)
            setError(err instanceof Error ? err.message : 'Failed to load county detail')
        }
    }, [selectedLandcover])

    // Initialize map
    useEffect(() => {
        if (!mapContainer.current || map.current) return

        try {
            map.current = new maplibregl.Map({
                container: mapContainer.current,
                style: MAP_STYLE,
                center: [-119.5, 37.0],
                zoom: 5.5
            })

            map.current.addControl(new maplibregl.NavigationControl(), 'top-right')

            map.current.on('load', () => {})

            map.current.on('click', 'counties', (e) => {
                if (e.features && e.features[0]) {
                    const props = e.features[0].properties as any
                    const fips = props.fips
                    if (fips) {
                        loadCountyDetail(fips)
                        setTimeout(() => {
                            detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        }, 100)
                    }
                }
            })

            map.current.on('error', (e) => {
                console.error('Map error:', e)
                setError('Map initialization error')
            })
        } catch (err) {
            console.error('Failed to initialize map:', err)
            setError('Failed to initialize map')
        }

        return () => {
            if (map.current) {
                map.current.remove()
                map.current = null
            }
        }
    }, [loadCountyDetail])

    // Load landcover types
    useEffect(() => {
        fetch(`${API_URL}/bayesian/baseline-distributions`)
            .then(res => {
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}: ${res.statusText}`)
                }
                return res.json()
            })
            .then(data => {
                if (data.landcover_types && Array.isArray(data.landcover_types)) {
                    setLandcoverTypes(data.landcover_types)
                } else {
                    console.warn('Unexpected response format:', data)
                    setError('Unexpected response format from server')
                }
            })
            .catch(err => {
                console.error('Failed to load landcover types:', err)
                setError(`Failed to load landcover types: ${err instanceof Error ? err.message : 'Unknown error'}`)
            })
    }, [])

    // Load map data
    const loadMapData = async () => {
        setLoading(true)
        setError(null)
        try {
            const response = await fetch(`${API_URL}/bayesian/map/counties`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lc_type: selectedLandcover || null,
                    metric: 'abs_movement' // Always use absolute movement for map
                })
            })

            if (!response.ok) {
                const errorText = await response.text()
                let errorMessage = `HTTP ${response.status}: ${response.statusText}`
                try {
                    const errorJson = JSON.parse(errorText)
                    errorMessage = errorJson.detail || errorMessage
                } catch {
                    errorMessage = errorText || errorMessage
                }
                throw new Error(errorMessage)
            }

            const data = await response.json()

            if (!data.features || !Array.isArray(data.features)) {
                throw new Error('Invalid response format: missing features array')
            }

            if (data.features.length === 0) {
                setError('No data found for the selected filters. Try selecting a different landcover type or check if data is loaded.')
                setLegendRange(null)
            } else {
                setMapData(data)
                updateMapLayer(data)
            }
        } catch (err) {
            console.error('Error loading map data:', err)
            setError(err instanceof Error ? err.message : 'Failed to load map data')
        } finally {
            setLoading(false)
        }
    }

    // Update map layer
    const updateMapLayer = (data: CountyMapData) => {
        if (!map.current) {
            return
        }

        try {
            // Wait for map to be loaded
            if (!map.current.isStyleLoaded()) {
                map.current.once('styledata', () => {
                    updateMapLayer(data)
                })
                return
            }

            // Remove existing layer if present
            if (map.current.getLayer('counties')) {
                map.current.removeLayer('counties')
            }
            if (map.current.getLayer('counties-outline')) {
                map.current.removeLayer('counties-outline')
            }
            if (map.current.getSource('counties')) {
                map.current.removeSource('counties')
            }

            if (!data.features || data.features.length === 0) {
                return
            }

            // Add source and layer
            map.current.addSource('counties', {
                type: 'geojson',
                data: data
            })

            const values = data.features.map(f => {
                const val = f.properties?.mean_value
                return typeof val === 'number' ? val : 0
            }).filter(v => !isNaN(v) && isFinite(v))

            if (values.length === 0) {
                return
            }

            const minVal = Math.min(...values)
            const maxVal = Math.max(...values)

            // Store range for legend (only if values are different)
            if (minVal !== maxVal) {
                setLegendRange({ min: minVal, max: maxVal })
            } else {
                setLegendRange(null)
            }

            if (minVal === maxVal) {
                // All values are the same, use a single color
                map.current.addLayer({
                    id: 'counties',
                    type: 'fill',
                    source: 'counties',
                    paint: {
                        'fill-color': chartColors.primary,
                        'fill-opacity': 0.7
                    }
                })
            } else {
                const colorScale = d3.scaleSequential(d3.interpolateViridis)
                    .domain([minVal, maxVal])

                map.current.addLayer({
                    id: 'counties',
                    type: 'fill',
                    source: 'counties',
                    paint: {
                        'fill-color': [
                            'interpolate',
                            ['linear'],
                            ['get', 'mean_value'],
                            minVal, colorScale(minVal),
                            maxVal, colorScale(maxVal)
                        ],
                        'fill-opacity': 0.7
                    }
                })
            }

            map.current.addLayer({
                id: 'counties-outline',
                type: 'line',
                source: 'counties',
                paint: {
                    'line-color': '#888',
                    'line-width': 1
                }
            })

            const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false })

            // Remove existing event listeners if any
            // @ts-expect-error MapLibre types don't include layer-specific off() overloads
            map.current.off('mousemove', 'counties')
            // @ts-expect-error MapLibre types don't include layer-specific off() overloads
            map.current.off('mouseleave', 'counties')

            map.current.on('mousemove', 'counties', (e) => {
                if (!e.features || e.features.length === 0) return
                if (map.current) {
                    map.current.getCanvas().style.cursor = 'pointer'
                }

                const props = e.features[0].properties as any
                const countyName = props.county_name || props.name || 'Unknown'
                const meanValue = props.mean_value?.toFixed(4) || 'N/A'
                const maxValue = props.max_value?.toFixed(4) || 'N/A'
                const exposure = props.total_exposure?.toLocaleString() || '0'
                const shrinkageWeight = props.mean_shrinkage_weight?.toFixed(3) || 'N/A'
                const topColor = props.top_color || null
                const topMovement = props.top_movement?.toFixed(4) || null

                let html = `
                    <div style="font-size: 12px; line-height: 1.5;">
                        <div style="font-weight: bold; margin-bottom: 6px; font-size: 13px;">${countyName} County</div>
                        <div style="margin-bottom: 4px;">Exposure: <strong>${exposure}</strong> structures</div>
                        <div style="margin-bottom: 4px;">Mean Absolute Movement: <strong>${meanValue}</strong></div>
                        <div style="margin-bottom: 4px;">Max Absolute Movement: ${maxValue}</div>
                        <div style="margin-bottom: 4px;">Mean Shrinkage Weight: ${shrinkageWeight}</div>
                `

                if (topColor) {
                    html += `
                        <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #eee;">
                            <div style="font-size: 11px; color: #666; margin-bottom: 2px;">Top Color Change:</div>
                            <div style="color: #d97706; font-weight: 500;">${topColor}</div>
                            ${topMovement ? `<div style="font-size: 11px; color: #888;">Movement: ${topMovement}</div>` : ''}
                        </div>
                    `
                }

                html += `
                        <div style="margin-top: 6px; font-size: 10px; color: #666; font-style: italic;">Click for details</div>
                    </div>
                `

                popup.setLngLat(e.lngLat).setHTML(html).addTo(map.current!)
            })

            map.current.on('mouseleave', 'counties', () => {
                if (map.current) {
                    map.current.getCanvas().style.cursor = ''
                    popup.remove()
                }
            })
        } catch (err) {
            console.error('Error updating map layer:', err)
            setError('Failed to update map layer')
        }
    }


    useEffect(() => {
        if (mapData && map.current) {
            updateMapLayer(mapData)
        }
    }, [mapData])

    // Calculate statistics from mapData
    const stats = mapData ? {
        mean_abs_movement: mapData.stats.mean_value,
        max_abs_movement: mapData.stats.max_value
    } : null

    return (
        <div className="relative flex-1 min-h-0">
            {/* Map Container - Full bleed */}
            <div className="absolute inset-0">
                <div ref={mapContainer} className="w-full h-full" />
                
                {/* Loading/Error overlays */}
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-20">
                        Loading map data...
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
                    {stats && (
                        <div className="pb-2 mb-1 border-b border-border">
                            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Statistics</div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                <span className="text-muted-foreground">Mean Abs Movement:</span>
                                <span className="font-semibold text-foreground">{stats.mean_abs_movement.toFixed(4)}</span>
                                <span className="text-muted-foreground">Max Abs Movement:</span>
                                <span className="font-semibold text-foreground">{stats.max_abs_movement.toFixed(4)}</span>
                            </div>
                        </div>
                    )}
                    
                    {/* Display Section */}
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Display</span>
                        <select
                            value={selectedLandcover}
                            onChange={(e) => {
                                setSelectedLandcover(e.target.value)
                                setCountyDetail(null) // Clear previous county detail
                                setShowDetailPanel(false) // Reset panel state
                            }}
                            className="px-3 py-1.5 text-xs border border-border rounded bg-white cursor-pointer focus:outline-none focus:border-sage-400"
                        >
                            <option value="">All Landcover Types</option>
                            {landcoverTypes.map(lc => (
                                <option key={lc} value={lc}>{lc}</option>
                            ))}
                        </select>
                    </div>
                    
                    <button
                        onClick={loadMapData}
                        disabled={loading}
                        className={cn(
                            'px-3 py-1.5 border border-border rounded-sm bg-muted text-[11px] font-medium text-muted-foreground cursor-pointer uppercase tracking-wide transition-all duration-150',
                            'hover:bg-sage-100 hover:text-foreground hover:border-sage-300',
                            'disabled:opacity-40 disabled:cursor-not-allowed'
                        )}
                    >
                        {loading ? 'Loading...' : 'Load Map'}
                    </button>
                </div>

                {/* Legend - Bottom Right */}
                {mapData && legendRange && (
                    <div className="absolute right-2.5 bottom-7 bg-white/95 p-3 rounded shadow-elevated text-xs z-10">
                        <div className="font-semibold mb-2 text-foreground">Absolute Movement</div>
                        <div
                            className="w-44 h-2.5 rounded-sm"
                            style={{
                                background: `linear-gradient(to right, ${d3.interpolateViridis(0)}, ${d3.interpolateViridis(1)})`
                            }}
                        />
                        <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
                            <span>{legendRange.min.toFixed(4)}</span>
                            <span>{legendRange.max.toFixed(4)}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* County Detail Section - Below Map */}
            {countyDetail && (
                <div 
                    ref={detailRef}
                    className={cn(
                        'absolute bottom-0 left-0 right-0 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.15)] z-40 transition-all duration-300',
                        showDetailPanel ? 'h-[65%]' : 'h-auto'
                    )}
                >
                    {/* Panel Header - Always visible */}
                    <div
                        className="px-5 py-4 border-b border-border flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => setShowDetailPanel(!showDetailPanel)}
                    >
                        <div className="flex items-center gap-6">
                            <h3 className="font-semibold text-base">
                                {countyDetail.county_name} (FIPS: {countyDetail.fips})
                            </h3>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                                onClick={(e) => { e.stopPropagation(); setShowDetailPanel(!showDetailPanel) }}
                            >
                                {showDetailPanel ? 'Collapse' : 'Expand'}
                            </button>
                            <button
                                className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded text-xl leading-none"
                                onClick={(e) => { e.stopPropagation(); setCountyDetail(null); setShowDetailPanel(false) }}
                            >
                                ×
                            </button>
                        </div>
                    </div>

                    {/* Panel Content - Expandable */}
                    {showDetailPanel && (
                        <div className="h-[calc(100%-65px)] overflow-y-auto p-6">
                            {countyDetail.by_landcover.map(lc => {
                                // Sort distributions by movement (signed) - descending
                                const sortedDistributions = [...lc.distributions].sort((a, b) => {
                                    return (b.movement ?? 0) - (a.movement ?? 0)
                                })

                                // Get max absolute movement for bar scaling
                                const maxMovement = Math.max(...sortedDistributions.map(d => Math.abs(d.movement ?? 0)))

                                return (
                                    <div key={lc.lc_type} className="mb-8 p-4 bg-background border border-border rounded">
                                        <h3 className="mt-0 mb-2 text-xl text-foreground">{lc.lc_type}</h3>
                                        <p className="text-muted-foreground mb-4">
                                            Exposure: {lc.total_exposure.toLocaleString()} |
                                            Mean Shrinkage Weight: {lc.mean_shrinkage_weight.toFixed(3)} |
                                            Max Movement: {lc.max_abs_movement.toFixed(4)}
                                        </p>

                                        {/* Color Distribution List - Movement (signed) */}
                                        <div className="mb-6">
                                            <h4 className="mb-3 text-base font-semibold text-foreground">
                                                Color Distribution (Movement - Signed)
                                            </h4>
                                            <div className="space-y-1.5 border border-border rounded-lg p-3 bg-muted/30">
                                                {sortedDistributions.map((dist) => {
                                                    const movementValue = dist.movement ?? 0
                                                    const absMovement = Math.abs(movementValue)
                                                    const barWidth = maxMovement > 0 ? (absMovement / maxMovement) * 100 : 0
                                                    
                                                    return (
                                                        <div key={dist.clr} className="flex items-center gap-2 text-sm">
                                                            <span className="w-24 flex items-center gap-2 truncate">
                                                                {dist.clr === 'foo' || dist.clr === 'bar' ? (
                                                                    <span className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center text-[8px] font-bold text-gray-500">?</span>
                                                                ) : (
                                                                    <span 
                                                                        className="w-4 h-4 rounded-full border border-border" 
                                                                        style={{ backgroundColor: COLOR_MAP[dist.clr] || '#ccc' }} 
                                                                    />
                                                                )}
                                                                {dist.clr}
                                                            </span>
                                                            <div className="flex-1 h-3 bg-muted rounded overflow-hidden">
                                                                <div
                                                                    className="h-full rounded"
                                                                    style={{
                                                                        width: `${barWidth}%`,
                                                                        backgroundColor: movementValue >= 0 ? '#6b7280' : '#dc2626'
                                                                    }}
                                                                />
                                                            </div>
                                                            <span className="w-20 text-right font-medium text-foreground" title={`Movement for ${dist.clr}: ${movementValue.toFixed(4)}`}>
                                                                {movementValue.toFixed(4)}
                                                            </span>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                            <p className="mt-2 text-xs text-muted-foreground">
                                                Each color shows its individual movement (signed) value. Positive values indicate increase, negative values indicate decrease. Sorted from highest to lowest.
                                            </p>
                                        </div>

                                        <div className="mt-4">
                                            <h4 className="mt-4 mb-2 text-base text-muted-foreground">Baseline vs Stabilized Distributions</h4>
                                            <ComparisonChart
                                                baseline={lc.baseline}
                                                stabilized={lc.distributions}
                                            />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

function ComparisonChart({
    baseline,
    stabilized
}: {
    baseline: BaselineDistribution[]
    stabilized: StabilizedDistribution[]
}) {
    const svgRef = useRef<SVGSVGElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    const renderChart = useCallback(() => {
        if (!svgRef.current || !containerRef.current || baseline.length === 0 || stabilized.length === 0) return

        // Get container width to match the color distribution list above
        const containerWidth = containerRef.current.offsetWidth || 900
        const margin = { top: 30, right: 40, bottom: 220, left: 70 }
        const width = Math.max(containerWidth - margin.left - margin.right, 600)
        const height = 400 - margin.top - margin.bottom

        d3.select(svgRef.current).selectAll('*').remove()

        const svg = d3.select(svgRef.current)
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom)
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`)

        // Combine data
        const combined = baseline.map(b => {
            const stab = stabilized.find(s => s.clr === b.clr)
            return {
                clr: b.clr,
                baseline: b.baseline_prop,
                stabilized: stab?.stabilized_prop || 0,
                observed: stab?.observed_prop || 0,
                movement: stab?.movement || 0
            }
        }).sort((a, b) => b.baseline - a.baseline)

        const x = d3.scaleBand()
            .domain(combined.map(d => d.clr))
            .range([0, width])
            .padding(0.2)

        const y = d3.scaleLinear()
            .domain([0, d3.max(combined, d => Math.max(d.baseline, d.stabilized, d.observed)) || 0.5])
            .range([height, 0])

        // Bars for baseline (sage green)
        svg.selectAll('.bar-baseline')
            .data(combined)
            .join('rect')
            .attr('class', 'bar-baseline')
            .attr('x', d => x(d.clr) || 0)
            .attr('width', x.bandwidth() / 3)
            .attr('y', d => y(d.baseline))
            .attr('height', d => height - y(d.baseline))
            .attr('fill', chartColors.primary)
            .attr('opacity', 0.7)

        // Bars for observed (blue)
        svg.selectAll('.bar-observed')
            .data(combined)
            .join('rect')
            .attr('class', 'bar-observed')
            .attr('x', d => (x(d.clr) || 0) + x.bandwidth() / 3)
            .attr('width', x.bandwidth() / 3)
            .attr('y', d => y(d.observed))
            .attr('height', d => height - y(d.observed))
            .attr('fill', '#2166ac')
            .attr('opacity', 0.7)

        // Bars for stabilized (warm tan)
        svg.selectAll('.bar-stabilized')
            .data(combined)
            .join('rect')
            .attr('class', 'bar-stabilized')
            .attr('x', d => (x(d.clr) || 0) + (2 * x.bandwidth() / 3))
            .attr('width', x.bandwidth() / 3)
            .attr('y', d => y(d.stabilized))
            .attr('height', d => height - y(d.stabilized))
            .attr('fill', '#d4a574')
            .attr('opacity', 0.7)

        // X axis
        svg.append('g')
            .attr('transform', `translate(0,${height})`)
            .call(d3.axisBottom(x))
            .attr('color', chartColors.axis)
            .selectAll('text')
            .attr('transform', 'rotate(-45)')
            .attr('text-anchor', 'end')
            .attr('dx', '-0.5em')
            .attr('dy', '0.5em')
            .style('font-size', '0.85rem')

        // Y axis
        svg.append('g')
            .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('.2%')))
            .attr('color', chartColors.axis)

        // Labels
        svg.append('text')
            .attr('x', width / 2)
            .attr('y', height + 70)
            .attr('text-anchor', 'middle')
            .attr('fill', chartColors.text.muted)
            .style('font-size', '1rem')
            .text('Color Category')

        svg.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('x', -height / 2)
            .attr('y', -50)
            .attr('text-anchor', 'middle')
            .attr('fill', chartColors.text.muted)
            .style('font-size', '1rem')
            .text('Proportion')

        // Legend
        const legend = svg.append('g')
            .attr('transform', `translate(${width - 150}, 20)`)

        const legendData = [
            { label: 'Baseline', color: chartColors.primary },
            { label: 'Observed', color: '#2166ac' },
            { label: 'Stabilized', color: '#d4a574' }
        ]

        legend.selectAll('.legend-item')
            .data(legendData)
            .join('g')
            .attr('class', 'legend-item')
            .attr('transform', (_, i) => `translate(0, ${i * 20})`)
            .each(function(d) {
                const g = d3.select(this)
                g.append('rect')
                    .attr('width', 15)
                    .attr('height', 15)
                    .attr('fill', d.color)
                    .attr('opacity', 0.7)
                g.append('text')
                    .attr('x', 20)
                    .attr('y', 12)
                    .attr('fill', chartColors.text.primary)
                    .style('font-size', '0.9rem')
                    .text(d.label)
            })
    }, [baseline, stabilized])

    useEffect(() => {
        renderChart()
        
        // Handle window resize
        const handleResize = () => {
            renderChart()
        }
        window.addEventListener('resize', handleResize)
        
        // Use ResizeObserver for container size changes
        let resizeObserver: ResizeObserver | null = null
        if (containerRef.current) {
            resizeObserver = new ResizeObserver(() => {
                renderChart()
            })
            resizeObserver.observe(containerRef.current)
        }
        
        return () => {
            window.removeEventListener('resize', handleResize)
            if (resizeObserver && containerRef.current) {
                resizeObserver.unobserve(containerRef.current)
            }
        }
    }, [renderChart])

    return (
        <div ref={containerRef} className="w-full">
            <svg ref={svgRef} className="w-full" style={{ minHeight: '500px' }}></svg>
        </div>
    )
}

