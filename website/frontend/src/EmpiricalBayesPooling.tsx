import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import * as d3 from 'd3'
import { cn } from './lib/utils'
import { chartColors } from './lib/chart-colors'

const API_URL = 'http://localhost:8000'
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json'

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
    const [metric, setMetric] = useState<'movement' | 'abs_movement' | 'shrinkage_weight'>('abs_movement')
    const [mapData, setMapData] = useState<CountyMapData | null>(null)
    const [_selectedCounty, setSelectedCounty] = useState<string | null>(null)
    const [countyDetail, setCountyDetail] = useState<CountyDetail | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [legendRange, setLegendRange] = useState<{ min: number; max: number } | null>(null)

    // Load county detail - use useCallback to avoid stale closures
    const loadCountyDetail = useCallback(async (fips: string) => {
        try {
            const lcParam = selectedLandcover ? `&lc_type=${selectedLandcover}` : ''
            const response = await fetch(`${API_URL}/bayesian/county/${fips}?${lcParam}`)
            if (!response.ok) {
                const errorText = await response.text()
                throw new Error(`Failed to load county detail: ${errorText}`)
            }
            const data = await response.json()
            setCountyDetail(data)
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

            map.current.on('load', () => {
                // Map is ready, can add layers now
            })

            map.current.on('click', 'counties', (e) => {
                if (e.features && e.features[0]) {
                    const props = e.features[0].properties as any
                    const fips = props.fips
                    if (fips) {
                        setSelectedCounty(fips)
                        loadCountyDetail(fips)
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
                    metric: metric
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
            console.warn('Map not initialized')
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
                console.warn('No features in map data')
                return
            }

            // Add source and layer
            map.current.addSource('counties', {
                type: 'geojson',
                data: data
            })

            // Determine color scale based on metric
            const values = data.features.map(f => {
                const val = f.properties?.mean_value
                return typeof val === 'number' ? val : 0
            }).filter(v => !isNaN(v) && isFinite(v))

            if (values.length === 0) {
                console.warn('No valid values for color scale')
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

            // Set up hover tooltip (use current metric value from closure)
            const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false })
            const currentMetric = metric // Capture current metric value

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

                // Get metric label
                const metricLabels: Record<string, string> = {
                    'abs_movement': 'Absolute Movement',
                    'movement': 'Movement',
                    'shrinkage_weight': 'Shrinkage Weight'
                }
                const metricLabel = metricLabels[currentMetric] || currentMetric

                let html = `
                    <div style="font-size: 12px; line-height: 1.5;">
                        <div style="font-weight: bold; margin-bottom: 6px; font-size: 13px;">${countyName} County</div>
                        <div style="margin-bottom: 4px;">Exposure: <strong>${exposure}</strong> structures</div>
                        <div style="margin-bottom: 4px;">Mean ${metricLabel}: <strong>${meanValue}</strong></div>
                        <div style="margin-bottom: 4px;">Max ${metricLabel}: ${maxValue}</div>
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

    // Clear legend when metric changes
    useEffect(() => {
        setLegendRange(null)
    }, [metric])

    return (
        <div className="text-left">
            <h1 className="text-2xl font-medium uppercase tracking-[0.2em] text-center mb-2">
                M02: Empirical Bayes Pooling
            </h1>
            <p className="text-center text-muted-foreground text-lg mb-12">
                Visualize Bayesian shrinkage results: baseline vs stabilized distributions by county
            </p>

            {error && (
                <div className="px-4 py-3 bg-red-50 border border-red-200 rounded mb-6 text-red-600">
                    <strong>Error:</strong> {error}
                </div>
            )}

            <div className="flex flex-wrap gap-8 items-end mb-8">
                <div className="flex flex-col gap-3">
                    <label className="text-sm uppercase tracking-wide text-muted-foreground">Landcover Type:</label>
                    <select
                        value={selectedLandcover}
                        onChange={(e) => setSelectedLandcover(e.target.value)}
                        className="px-5 py-2.5 rounded-sm border border-border bg-muted text-foreground font-mono text-base cursor-pointer focus:outline-none focus:border-sage-400"
                    >
                        <option value="">All Landcover Types</option>
                        {landcoverTypes.map(lc => (
                            <option key={lc} value={lc}>{lc}</option>
                        ))}
                    </select>
                </div>

                <div className="flex flex-col gap-3">
                    <label className="text-sm uppercase tracking-wide text-muted-foreground">Metric:</label>
                    <select
                        value={metric}
                        onChange={(e) => setMetric(e.target.value as any)}
                        className="px-5 py-2.5 rounded-sm border border-border bg-muted text-foreground font-mono text-base cursor-pointer focus:outline-none focus:border-sage-400"
                    >
                        <option value="abs_movement">Absolute Movement</option>
                        <option value="movement">Movement (signed)</option>
                        <option value="shrinkage_weight">Shrinkage Weight</option>
                    </select>
                </div>

                <button
                    onClick={loadMapData}
                    disabled={loading}
                    className={cn(
                        'px-7 py-2.5 bg-sage-500 border border-sage-600 rounded-sm text-white',
                        'font-mono text-base uppercase tracking-wide cursor-pointer transition-all duration-150',
                        'hover:bg-sage-600',
                        'disabled:opacity-40 disabled:cursor-not-allowed'
                    )}
                >
                    {loading ? 'Loading...' : 'Load Map'}
                </button>
            </div>

            {mapData && (
                <div className="px-4 py-3 bg-muted border border-border rounded mb-4 text-sm text-muted-foreground">
                    <p>
                        Showing {mapData.stats.total_counties} counties |
                        Mean {metric}: {mapData.stats.mean_value.toFixed(4)} |
                        Max {metric}: {mapData.stats.max_value.toFixed(4)}
                    </p>
                </div>
            )}

            <div className="relative border border-border rounded overflow-hidden mb-8">
                <div ref={mapContainer} className="w-full h-[700px]" />
                {mapData && legendRange && (
                    <MapLegend
                        metric={metric}
                        minValue={legendRange.min}
                        maxValue={legendRange.max}
                    />
                )}
            </div>

            {countyDetail && (
                <div className="mt-8 p-6 bg-sage-50 border border-border rounded">
                    <h2 className="mt-0 mb-4 text-2xl text-foreground">{countyDetail.county_name} (FIPS: {countyDetail.fips})</h2>
                    {countyDetail.by_landcover.map(lc => (
                        <div key={lc.lc_type} className="mb-8 p-4 bg-background border border-border rounded">
                            <h3 className="mt-0 mb-2 text-xl text-foreground">{lc.lc_type}</h3>
                            <p className="text-muted-foreground mb-4">
                                Exposure: {lc.total_exposure.toLocaleString()} |
                                Mean Shrinkage Weight: {lc.mean_shrinkage_weight.toFixed(3)} |
                                Max Movement: {lc.max_abs_movement.toFixed(4)}
                            </p>

                            <div className="mt-4">
                                <h4 className="mt-4 mb-2 text-base text-muted-foreground">Baseline vs Stabilized Distributions</h4>
                                <ComparisonChart
                                    baseline={lc.baseline}
                                    stabilized={lc.distributions}
                                />
                            </div>
                        </div>
                    ))}
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

    useEffect(() => {
        if (!svgRef.current || baseline.length === 0 || stabilized.length === 0) return

        const margin = { top: 30, right: 40, bottom: 200, left: 70 }
        const width = 900 - margin.left - margin.right
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
            .attr('y', height + 50)
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

    return <svg ref={svgRef}></svg>
}

function MapLegend({
    metric,
    minValue,
    maxValue
}: {
    metric: 'movement' | 'abs_movement' | 'shrinkage_weight'
    minValue: number
    maxValue: number
}) {
    const metricLabels: Record<string, { label: string; description: string; low: string; high: string }> = {
        'abs_movement': {
            label: 'Absolute Movement',
            description: 'Magnitude of change from observed to stabilized',
            low: 'Low change (reliable data)',
            high: 'High change (unreliable data)'
        },
        'movement': {
            label: 'Movement (Signed)',
            description: 'Direction of change',
            low: 'Decreased (pulled down)',
            high: 'Increased (pulled up)'
        },
        'shrinkage_weight': {
            label: 'Shrinkage Weight',
            description: 'Trust in observed data',
            low: 'Low trust (few structures)',
            high: 'High trust (many structures)'
        }
    }

    const metricInfo = metricLabels[metric] || metricLabels['abs_movement']

    // Create color gradient stops
    const gradientStops = []
    const numStops = 10
    for (let i = 0; i <= numStops; i++) {
        const t = i / numStops
        const value = minValue + (maxValue - minValue) * t
        const color = d3.interpolateViridis(t)
        gradientStops.push({ offset: (t * 100) + '%', color, value })
    }

    return (
        <div className="absolute top-2.5 right-2.5 bg-white/95 border border-border rounded p-4 shadow-elevated z-10 min-w-[200px] font-mono">
            <div className="font-semibold text-sm mb-2 text-foreground uppercase tracking-wide">
                {metricInfo.label}
            </div>

            <div className="text-xs text-muted-foreground mb-2.5 leading-relaxed">
                {metricInfo.description}
            </div>

            {/* Color gradient */}
            <div className="flex items-center mb-2 h-5 rounded-sm overflow-hidden border border-border">
                {gradientStops.map((stop, i) => (
                    <div
                        key={i}
                        style={{
                            flex: 1,
                            height: '100%',
                            background: stop.color
                        }}
                    />
                ))}
            </div>

            {/* Value labels */}
            <div className="flex justify-between text-xs text-muted-foreground mb-2">
                <span>{minValue.toFixed(4)}</span>
                <span>{maxValue.toFixed(4)}</span>
            </div>

            {/* Meaning labels */}
            <div className="flex justify-between text-[0.7rem] text-muted-foreground border-t border-border pt-2 gap-2">
                <div className="flex-1">
                    <div className="font-medium" style={{ color: '#440154' }}>Purple</div>
                    <div className="text-[0.65rem] mt-0.5">{metricInfo.low}</div>
                </div>
                <div className="flex-1 text-right">
                    <div className="font-medium" style={{ color: '#fde725' }}>Yellow</div>
                    <div className="text-[0.65rem] mt-0.5">{metricInfo.high}</div>
                </div>
            </div>
        </div>
    )
}
