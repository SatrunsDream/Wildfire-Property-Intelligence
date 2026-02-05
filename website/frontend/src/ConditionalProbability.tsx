import { useRef, useState, useCallback, useEffect } from 'react'
import { CaliforniaMap, type CaliforniaMapRef } from './CaliforniaMap'
import { cn } from './lib/utils'

const API_URL = 'http://localhost:8000'

const DEFAULT_CONTEXT_COLS = ['lc_type', 'fips']
const DEFAULT_TARGET = 'clr'
const DEFAULT_MIN_SUPPORT = 30

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

interface ColorDistribution {
    clr: string
    surprisal: number
    prob: number
    count: number
    context_total: number
}

interface LandcoverDetail {
    lc_type: string
    total_rows: number
    max_surprisal: number
    mean_surprisal: number
    distributions: ColorDistribution[]
}

interface CountyDetail {
    fips: string
    county_name: string
    alpha: number
    by_landcover: LandcoverDetail[]
    total_landcover_types: number
}

export function ConditionalProbability() {
    const mapRef = useRef<CaliforniaMapRef>(null)
    const detailRef = useRef<HTMLDivElement>(null)
    const [countyDetail, setCountyDetail] = useState<CountyDetail | null>(null)
    const [showDetailPanel, setShowDetailPanel] = useState(false)
    const [landcoverTypes, setLandcoverTypes] = useState<string[]>([])
    const [selectedLandcover, setSelectedLandcover] = useState<string>('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Load landcover types
    useEffect(() => {
        fetch(`${API_URL}/conditioning-options`)
            .then(res => {
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}: ${res.statusText}`)
                }
                return res.json()
            })
            .then(data => {
                if (data.values && data.values.lc_type && Array.isArray(data.values.lc_type)) {
                    setLandcoverTypes(data.values.lc_type)
                } else {
                }
            })
            .catch(err => {
                console.error('Failed to load landcover types:', err)
            })
    }, [])

    const handleCountyClick = useCallback(async (fips: string) => {
        setLoading(true)
        setError(null)
        try {
            const response = await fetch(`${API_URL}/conditional-probability/county/${fips}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    context_cols: DEFAULT_CONTEXT_COLS,
                    target: DEFAULT_TARGET,
                    min_support: DEFAULT_MIN_SUPPORT
                })
            })
            if (!response.ok) {
                throw new Error('Failed to load county detail')
            }
            const data = await response.json()
            setCountyDetail(data)
            setShowDetailPanel(true)
            // Scroll to detail section
            setTimeout(() => {
                detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }, 100)
        } catch (err) {
            console.error('Failed to load county detail:', err)
            setError(err instanceof Error ? err.message : 'Failed to load county detail')
        } finally {
            setLoading(false)
        }
    }, [])

    return (
        <div className="relative flex-1 min-h-0">
            {/* Map Container - Full bleed */}
            <div className="absolute inset-0">
                <CaliforniaMap
                    ref={mapRef}
                    contextCols={DEFAULT_CONTEXT_COLS}
                    target={DEFAULT_TARGET}
                    minSupport={DEFAULT_MIN_SUPPORT}
                    autoLoad={true}
                    className="w-full h-full"
                    onCountyClick={handleCountyClick}
                />

                {/* Loading/Error overlays */}
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-20">
                        Loading county details...
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
                    {countyDetail && (
                        <div className="pb-2 mb-1 border-b border-border">
                            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Statistics</div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                <span className="text-muted-foreground">Alpha:</span>
                                <span className="font-semibold text-foreground">{countyDetail.alpha.toFixed(4)}</span>
                                <span className="text-muted-foreground">Landcover Types:</span>
                                <span className="font-semibold text-foreground">{countyDetail.total_landcover_types}</span>
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
                </div>
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
                            <h2 className="mt-0 mb-4 text-2xl text-foreground">{countyDetail.county_name} (FIPS: {countyDetail.fips})</h2>
                            <p className="text-muted-foreground mb-4">
                                Alpha: {countyDetail.alpha.toFixed(4)} | Landcover Types: {countyDetail.total_landcover_types}
                            </p>
                            
                            {countyDetail.by_landcover
                                .filter(lc => !selectedLandcover || lc.lc_type === selectedLandcover)
                                .map(lc => {
                        const maxSurprisal = Math.max(...lc.distributions.map(d => d.surprisal))
                        
                        return (
                            <div key={lc.lc_type} className="mb-8 p-4 bg-background border border-border rounded">
                                <h3 className="mt-0 mb-2 text-xl text-foreground">{lc.lc_type}</h3>
                                <p className="text-muted-foreground mb-4">
                                    Total Rows: {lc.total_rows.toLocaleString()} |
                                    Max Surprisal: {lc.max_surprisal.toFixed(4)} |
                                    Mean Surprisal: {lc.mean_surprisal.toFixed(4)}
                                </p>

                                {/* Color Distribution List */}
                                <div className="mb-6">
                                    <h4 className="mb-3 text-base font-semibold text-foreground">
                                        Color Distribution (Surprisal)
                                    </h4>
                                    <div className="space-y-1.5 border border-border rounded-lg p-3 bg-muted/30">
                                        {lc.distributions.map(dist => {
                                            const barWidth = maxSurprisal > 0 ? (dist.surprisal / maxSurprisal) * 100 : 0
                                            
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
                                                                backgroundColor: '#6b7280'
                                                            }}
                                                        />
                                                    </div>
                                                    <span className="w-20 text-right font-medium text-foreground" title={`Surprisal: ${dist.surprisal.toFixed(4)}, Probability: ${dist.prob.toFixed(4)}`}>
                                                        {dist.surprisal.toFixed(4)}
                                                    </span>
                                                </div>
                                            )
                                        })}
                                    </div>
                                    <p className="mt-2 text-xs text-muted-foreground">
                                        Each color shows its individual surprisal value, sorted from highest to lowest.
                                    </p>
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
