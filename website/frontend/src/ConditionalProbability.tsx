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

interface ColorDistribution {
    clr: string
    y_county: number
    y_pool: number
    p_county: number
    p_pool: number
    contrib: number
    abs_diff: number
}

interface LandcoverDetail {
    lc_type: string
    n_county: number
    n_pool: number
    num_neighbors: number
    kl_div: number
    l1_distance: number
    top_color: string
    top_contrib: number
    distributions: ColorDistribution[]
}

interface CountyDetail {
    fips: string
    county_name: string
    by_landcover: LandcoverDetail[]
    total_landcover_types: number
}

export function ConditionalProbability() {
    const mapContainer = useRef<HTMLDivElement>(null)
    const map = useRef<maplibregl.Map | null>(null)
    const [landcoverTypes, setLandcoverTypes] = useState<string[]>([])
    const [selectedLandcover, setSelectedLandcover] = useState<string>('')
    const [selectedMetric, setSelectedMetric] = useState<string>('kl_div')
    const [mapData, setMapData] = useState<CountyMapData | null>(null)
    const [countyDetail, setCountyDetail] = useState<CountyDetail | null>(null)
    const detailRef = useRef<HTMLDivElement>(null)
    const [showDetailPanel, setShowDetailPanel] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [legendRange, setLegendRange] = useState<{ min: number; max: number } | null>(null)
    const [isFullscreen, setIsFullscreen] = useState(false)

    const loadCountyDetail = useCallback(async (fips: string) => {
        try {
            const lcParam = selectedLandcover ? `?lc_type=${encodeURIComponent(selectedLandcover)}` : ''
            const response = await fetch(`${API_URL}/conditional-pooling/county/${fips}${lcParam}`)
            if (!response.ok) throw new Error('Failed to load county detail')
            const data = await response.json()
            setCountyDetail(data)
            setShowDetailPanel(true)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load county detail')
        }
    }, [selectedLandcover])

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

            map.current.on('error', () => setError('Map initialization error'))
        } catch {
            setError('Failed to initialize map')
        }

        return () => {
            if (map.current) {
                map.current.remove()
                map.current = null
            }
        }
    }, [loadCountyDetail])

    useEffect(() => {
        fetch(`${API_URL}/conditional-pooling/landcover-types`)
            .then(res => res.json())
            .then(data => {
                if (data.landcover_types && Array.isArray(data.landcover_types)) {
                    setLandcoverTypes(data.landcover_types)
                }
            })
            .catch(err => setError(`Failed to load landcover types: ${err instanceof Error ? err.message : 'Unknown error'}`))
    }, [])

    const loadMapData = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const response = await fetch(`${API_URL}/conditional-pooling/map/counties`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lc_type: selectedLandcover || null,
                    metric: selectedMetric
                })
            })

            if (!response.ok) {
                const errorText = await response.text()
                throw new Error(JSON.parse(errorText).detail || errorText)
            }

            const data = await response.json()
            if (data.features && data.features.length > 0) {
                setMapData(data)
                updateMapLayer(data)
            } else {
                setError('No data found for the selected filters')
                setLegendRange(null)
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load map data')
        } finally {
            setLoading(false)
        }
    }, [selectedLandcover, selectedMetric])

    const updateMapLayer = useCallback((data: CountyMapData) => {
        if (!map.current) return

        try {
            if (!map.current.isStyleLoaded()) {
                map.current.once('styledata', () => {
                    updateMapLayer(data)
                })
                return
            }

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

            if (minVal !== maxVal) {
                setLegendRange({ min: minVal, max: maxVal })
            } else {
                setLegendRange(null)
            }

            if (minVal === maxVal) {
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

            map.current.off('mousemove', 'counties')
            map.current.off('mouseleave', 'counties')

            map.current.on('mousemove', 'counties', (e) => {
                if (!e.features || e.features.length === 0) return
                if (map.current) {
                    map.current.getCanvas().style.cursor = 'pointer'
                }

                const props = e.features[0].properties as any
                const countyName = props.county_name || 'Unknown'
                const meanValue = props.mean_value?.toFixed(4) || 'N/A'
                const maxValue = props.max_value?.toFixed(4) || 'N/A'
                const exposure = props.total_exposure?.toLocaleString() || '0'
                const numNeighbors = props.num_neighbors || 0

                const metricLabel = selectedMetric === 'kl_div' ? 'KL Divergence' : 'L1 Distance'

                let html = `
                    <div style="font-size: 12px; line-height: 1.5;">
                        <div style="font-weight: bold; margin-bottom: 6px; font-size: 13px;">${countyName} County</div>
                        <div style="margin-bottom: 4px;">Exposure: <strong>${exposure}</strong> structures</div>
                        <div style="margin-bottom: 4px;">Mean ${metricLabel}: <strong>${meanValue}</strong></div>
                        <div style="margin-bottom: 4px;">Max ${metricLabel}: ${maxValue}</div>
                        <div style="margin-bottom: 4px;">Neighbors: ${numNeighbors}</div>
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
        } catch {
            setError('Failed to update map layer')
        }
    }, [selectedMetric])

    useEffect(() => {
        if (landcoverTypes.length > 0 && !mapData) {
            loadMapData()
        }
    }, [landcoverTypes.length, loadMapData, mapData])

    useEffect(() => {
        if (mapData && map.current && mapData.features && mapData.features.length > 0) {
            updateMapLayer(mapData)
        }
    }, [mapData, updateMapLayer])

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

    const stats = mapData ? {
        mean_value: mapData.stats.mean_value,
        max_value: mapData.stats.max_value
    } : null

    return (
        <div className={cn(
            'relative flex-1 min-h-0',
            isFullscreen && 'fixed top-0 left-0 right-0 bottom-0 w-screen h-screen z-[9999] bg-white'
        )}>
            <div className="absolute inset-0">
                <div ref={mapContainer} className="w-full h-full" />
                
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

                <div className="absolute top-2.5 left-2.5 flex flex-col gap-2 bg-white/95 rounded p-3 shadow-elevated z-10 w-48">
                    {stats && (
                        <div className="pb-2 mb-1 border-b border-border">
                            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Statistics</div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                <span className="text-muted-foreground">Mean {selectedMetric === 'kl_div' ? 'KL Div' : 'L1'}:</span>
                                <span className="font-semibold text-foreground">{stats.mean_value.toFixed(4)}</span>
                                <span className="text-muted-foreground">Max {selectedMetric === 'kl_div' ? 'KL Div' : 'L1'}:</span>
                                <span className="font-semibold text-foreground">{stats.max_value.toFixed(4)}</span>
                            </div>
                        </div>
                    )}
                    
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Display</span>
                        <select
                            value={selectedMetric}
                            onChange={(e) => setSelectedMetric(e.target.value)}
                            className="px-3 py-1.5 text-xs border border-border rounded bg-white cursor-pointer focus:outline-none focus:border-sage-400"
                        >
                            <option value="kl_div">KL Divergence</option>
                            <option value="l1_distance">L1 Distance</option>
                        </select>
                        <select
                            value={selectedLandcover}
                            onChange={(e) => {
                                setSelectedLandcover(e.target.value)
                                setCountyDetail(null)
                                setShowDetailPanel(false)
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
                        className="px-3 py-1.5 border border-border rounded-sm bg-sage-500 text-[11px] font-medium text-white cursor-pointer uppercase tracking-wide transition-all duration-150 hover:bg-sage-600"
                        onClick={loadMapData}
                        disabled={loading}
                    >
                        {loading ? 'Loading...' : 'Load Map'}
                    </button>
                    
                    <button
                        className="px-3 py-1.5 border border-border rounded-sm bg-muted text-[11px] font-medium text-muted-foreground cursor-pointer uppercase tracking-wide transition-all duration-150 hover:bg-sage-100 hover:text-foreground hover:border-sage-300"
                        onClick={toggleFullscreen}
                    >
                        {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                    </button>
                </div>

                {mapData && legendRange && (
                    <div className="absolute right-2.5 bottom-24 bg-white/95 p-3 rounded shadow-elevated text-xs z-10">
                        <div className="font-semibold mb-2 text-foreground">
                            {selectedMetric === 'kl_div' ? 'KL Divergence' : 'L1 Distance'}
                        </div>
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
            {countyDetail && (
                <div 
                    ref={detailRef}
                    className={cn(
                        'absolute bottom-0 left-0 right-0 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.15)] z-40 transition-all duration-300',
                        showDetailPanel ? 'h-[65%]' : 'h-auto'
                    )}
                >
                    <div
                        className="px-5 py-4 border-b border-border flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => setShowDetailPanel(!showDetailPanel)}
                    >
                        <h3 className="font-semibold text-base">
                            {countyDetail.county_name} (FIPS: {countyDetail.fips})
                        </h3>
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

                    {showDetailPanel && (
                        <div className="h-[calc(100%-65px)] overflow-y-auto p-6">
                            {countyDetail.by_landcover.map(lc => {
                                const sortedDistributions = [...lc.distributions].sort((a, b) => 
                                    Math.abs(b.contrib) - Math.abs(a.contrib)
                                )

                                return (
                                    <div key={lc.lc_type} className="mb-8 p-4 bg-background border border-border rounded">
                                        <h3 className="mt-0 mb-2 text-xl text-foreground">{lc.lc_type}</h3>
                                        <p className="text-muted-foreground mb-4">
                                            County Exposure: {lc.n_county.toLocaleString()} |
                                            Pool Exposure: {lc.n_pool.toLocaleString()} |
                                            Neighbors: {lc.num_neighbors} |
                                            KL Divergence: {lc.kl_div.toFixed(4)} |
                                            L1 Distance: {lc.l1_distance.toFixed(4)}
                                        </p>

                                        <div className="mb-6">
                                            <h4 className="mb-3 text-base font-semibold text-foreground">Color Distribution (KL Contribution)</h4>
                                            <div className="space-y-1.5 border border-border rounded-lg p-3 bg-muted/30">
                                                {sortedDistributions.map((dist) => {
                                                    const maxContrib = Math.max(...sortedDistributions.map(d => Math.abs(d.contrib)))
                                                    const barWidth = maxContrib > 0 ? (Math.abs(dist.contrib) / maxContrib) * 100 : 0
                                                    
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
                                                                        backgroundColor: dist.contrib >= 0 ? '#6b7280' : '#dc2626'
                                                                    }}
                                                                />
                                                            </div>
                                                            <span className="w-20 text-right font-medium text-foreground">
                                                                {dist.contrib.toFixed(4)}
                                                            </span>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>

                                        <div className="mb-6">
                                            <h4 className="mb-3 text-base font-semibold text-foreground">Deviation from Regional Norm</h4>
                                            <DeviationChart distributions={lc.distributions} />
                                        </div>

                                        <div className="mb-6">
                                            <h4 className="mb-3 text-base font-semibold text-foreground">Top Contributing Colors</h4>
                                            <TopContributorsChart distributions={lc.distributions} />
                                        </div>

                                        <div className="mt-4">
                                            <h4 className="mb-2 text-base font-semibold text-foreground">County vs Pooled Distribution</h4>
                                            <ComparisonChart distributions={lc.distributions} />
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

function ComparisonChart({ distributions }: { distributions: ColorDistribution[] }) {
    const svgRef = useRef<SVGSVGElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    const renderChart = useCallback(() => {
        if (!svgRef.current || !containerRef.current || distributions.length === 0) return

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

        const sorted = [...distributions].sort((a, b) => b.p_pool - a.p_pool)

        const x = d3.scaleBand()
            .domain(sorted.map(d => d.clr))
            .range([0, width])
            .padding(0.2)

        const y = d3.scaleLinear()
            .domain([0, d3.max(sorted, d => Math.max(d.p_county, d.p_pool)) || 0.5])
            .range([height, 0])

        svg.selectAll('.bar-county')
            .data(sorted)
            .join('rect')
            .attr('class', 'bar-county')
            .attr('x', d => x(d.clr) || 0)
            .attr('width', x.bandwidth() / 2)
            .attr('y', d => y(d.p_county))
            .attr('height', d => height - y(d.p_county))
            .attr('fill', '#2166ac')
            .attr('opacity', 0.7)

        svg.selectAll('.bar-pool')
            .data(sorted)
            .join('rect')
            .attr('class', 'bar-pool')
            .attr('x', d => (x(d.clr) || 0) + x.bandwidth() / 2)
            .attr('width', x.bandwidth() / 2)
            .attr('y', d => y(d.p_pool))
            .attr('height', d => height - y(d.p_pool))
            .attr('fill', chartColors.primary)
            .attr('opacity', 0.7)

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

        svg.append('g')
            .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('.2%')))
            .attr('color', chartColors.axis)

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
            .text('Probability')

        const legend = svg.append('g').attr('transform', `translate(${width - 150}, 20)`)
        const legendData = [
            { label: 'County', color: '#2166ac' },
            { label: 'Pooled', color: chartColors.primary }
        ]

        legend.selectAll('.legend-item')
            .data(legendData)
            .join('g')
            .attr('class', 'legend-item')
            .attr('transform', (_, i) => `translate(0, ${i * 20})`)
            .each(function(d) {
                const g = d3.select(this)
                g.append('rect').attr('width', 15).attr('height', 15).attr('fill', d.color).attr('opacity', 0.7)
                g.append('text').attr('x', 20).attr('y', 12).attr('fill', chartColors.text.primary).style('font-size', '0.9rem').text(d.label)
            })
    }, [distributions])

    useEffect(() => {
        renderChart()
        const handleResize = () => renderChart()
        window.addEventListener('resize', handleResize)
        let resizeObserver: ResizeObserver | null = null
        if (containerRef.current) {
            resizeObserver = new ResizeObserver(() => renderChart())
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

function DeviationChart({ distributions }: { distributions: ColorDistribution[] }) {
    const sorted = [...distributions]
        .map(d => ({ ...d, diff: d.p_county - d.p_pool }))
        .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    
    const maxAbsDiff = Math.max(...sorted.map(d => Math.abs(d.diff)))
    
    return (
        <div className="border border-border rounded-lg p-4 bg-muted/30">
            <div className="space-y-2">
                {sorted.map((dist) => {
                    const diff = dist.diff
                    const absDiff = Math.abs(diff)
                    const barWidth = maxAbsDiff > 0 ? (absDiff / maxAbsDiff) * 100 : 0
                    const isOver = diff > 0
                    
                    return (
                        <div key={dist.clr} className="flex items-center gap-3 text-sm">
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
                            <div className="flex-1 flex items-center gap-2">
                                <div className="flex-1 h-4 bg-muted rounded overflow-hidden relative">
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="h-px w-full bg-border" />
                                    </div>
                                    <div
                                        className={`h-full rounded transition-all ${
                                            isOver ? 'bg-red-500' : 'bg-blue-500'
                                        }`}
                                        style={{
                                            width: `${barWidth}%`,
                                            marginLeft: isOver ? '50%' : `${50 - barWidth}%`
                                        }}
                                    />
                                </div>
                                <span className={`w-24 text-right font-medium ${isOver ? 'text-red-600' : 'text-blue-600'}`}>
                                    {isOver ? '+' : ''}{diff.toFixed(4)}
                                </span>
                            </div>
                        </div>
                    )
                })}
            </div>
            <div className="mt-3 pt-3 border-t border-border flex justify-between text-xs text-muted-foreground">
                <span>Under-represented</span>
                <span>Over-represented</span>
            </div>
        </div>
    )
}

function TopContributorsChart({ distributions }: { distributions: ColorDistribution[] }) {
    const topContributors = [...distributions]
        .sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib))
        .slice(0, 10)
    
    const maxProb = Math.max(...topContributors.map(d => Math.max(d.p_county, d.p_pool)))
    
    return (
        <div className="border border-border rounded-lg p-4 bg-muted/30">
            <div className="space-y-4">
                {topContributors.map((dist) => {
                    const countyBarWidth = maxProb > 0 ? (dist.p_county / maxProb) * 100 : 0
                    const poolBarWidth = maxProb > 0 ? (dist.p_pool / maxProb) * 100 : 0
                    
                    return (
                        <div key={dist.clr} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                    {dist.clr === 'foo' || dist.clr === 'bar' ? (
                                        <span className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center text-[8px] font-bold text-gray-500">?</span>
                                    ) : (
                                        <span 
                                            className="w-4 h-4 rounded-full border border-border" 
                                            style={{ backgroundColor: COLOR_MAP[dist.clr] || '#ccc' }} 
                                        />
                                    )}
                                    <span className="font-medium">{dist.clr}</span>
                                    <span className="text-xs text-muted-foreground">
                                        (KL: {dist.contrib.toFixed(4)})
                                    </span>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                    <span className="w-20 text-xs text-muted-foreground">County:</span>
                                    <div className="flex-1 h-3 bg-muted rounded overflow-hidden">
                                        <div
                                            className="h-full bg-blue-600 rounded"
                                            style={{ width: `${countyBarWidth}%` }}
                                        />
                                    </div>
                                    <span className="w-16 text-xs text-right font-medium">{dist.p_county.toFixed(4)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="w-20 text-xs text-muted-foreground">Pool:</span>
                                    <div className="flex-1 h-3 bg-muted rounded overflow-hidden">
                                        <div
                                            className="h-full bg-sage-500 rounded"
                                            style={{ width: `${poolBarWidth}%` }}
                                        />
                                    </div>
                                    <span className="w-16 text-xs text-right font-medium">{dist.p_pool.toFixed(4)}</span>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
