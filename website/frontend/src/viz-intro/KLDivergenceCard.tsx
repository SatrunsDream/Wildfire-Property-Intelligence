/** Deviation from Regional Norm — SD region only, All land cover types aggregated, colors only */

import type { CountyDetail, ColorDistribution } from '../lib/conditionalPooling'

const COLOR_MAP: Record<string, string> = {
    amber: '#FFBF00', aqua: '#00FFFF', aquamarine: '#7FFFD4', auburn: '#922724', azure: '#F0FFFF',
    bar: '#888888', beige: '#F5F5DC', blue: '#0000FF', brown: '#A52A2A', cocoa: '#D2691E',
    coffee: '#6F4E37', crimson: '#DC143C', emerald: '#50C878', foo: '#888888', gold: '#FFD700',
    gray: '#808080', green: '#008000', grey: '#808080', indigo: '#4B0082', ivory: '#FFFFF0',
    lavender: '#E6E6FA', lemon: '#FFF700', lilac: '#C8A2C8', maroon: '#800000', navy: '#000080',
    olive: '#808000', orange: '#FFA500', plum: '#8E4585', purple: '#800080', red: '#FF0000',
    sage: '#9DC183', scarlet: '#FF2400', sienna: '#A0522D', tan: '#D2B48C', terracotta: '#E2725B',
    verde: '#00A86B', yellow: '#FFFF00', alabaster: '#F2F0E6',
}

interface KLDivergenceCardProps {
    countyDetail: CountyDetail | null
    visible: boolean
}

function DeviationTable({ distributions }: { distributions: ColorDistribution[] }) {
    const sorted = [...distributions]
        .map((d) => ({ ...d, diff: d.p_county - d.p_pool }))
        .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    const maxAbsDiff = Math.max(...sorted.map((d) => Math.abs(d.diff)), 0.001)
    return (
        <div className="mt-2 p-2 bg-muted/30 rounded-md">
            {sorted.slice(0, 8).map((dist) => {
                const diff = dist.diff
                const absDiff = Math.abs(diff)
                const barWidth = (absDiff / maxAbsDiff) * 100
                const isOver = diff > 0
                return (
                    <div
                        key={dist.clr}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            fontSize: '0.7rem',
                            marginBottom: '0.25rem',
                        }}
                    >
                        <span
                            style={{
                                width: 54,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                flexShrink: 0,
                            }}
                        >
                            {dist.clr === 'foo' || dist.clr === 'bar' ? (
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ccc' }} />
                            ) : (
                                <span
                                    style={{
                                        width: 8,
                                        height: 8,
                                        borderRadius: '50%',
                                        background: COLOR_MAP[dist.clr] || '#ccc',
                                        border: '1px solid #ddd',
                                    }}
                                />
                            )}
                            {dist.clr}
                        </span>
                        <div
                            style={{
                                flex: 1,
                                height: 6,
                                background: '#e9ecef',
                                borderRadius: 3,
                                position: 'relative',
                                overflow: 'hidden',
                            }}
                        >
                            <div
                                style={{
                                    position: 'absolute',
                                    left: '50%',
                                    top: 0,
                                    bottom: 0,
                                    width: `${barWidth}%`,
                                    marginLeft: isOver ? 0 : `-${barWidth}%`,
                                    background: isOver ? '#dc3545' : '#0d6efd',
                                    borderRadius: 3,
                                }}
                            />
                        </div>
                        <span
                            style={{
                                width: 48,
                                textAlign: 'right',
                                fontWeight: 500,
                                color: isOver ? '#dc3545' : '#0d6efd',
                            }}
                        >
                            {diff >= 0 ? '+' : ''}{diff.toFixed(3)}
                        </span>
                    </div>
                )
            })}
            <div
                style={{
                    marginTop: 4,
                    paddingTop: 4,
                    borderTop: '1px solid #dee2e6',
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.65rem',
                    color: '#6c757d',
                }}
            >
                <span>Under</span>
                <span>Over</span>
            </div>
        </div>
    )
}

export function KLDivergenceCard({ countyDetail, visible }: KLDivergenceCardProps) {
    if (!visible) return null
    if (!countyDetail) return null

    // Single "All land cover types" entry with color deviations
    const allLc = countyDetail.by_landcover[0]
    if (!allLc) return null

    return (
        <div className="pointer-events-auto max-w-[26rem] max-h-[70vh] overflow-y-auto p-6 bg-card/95 border-r-4 border-[#3b528b]">
            <h2 className="font-serif text-[1.35rem] font-normal leading-snug text-foreground m-0">
                {countyDetail.county_name} Deviation from Regional Norm
            </h2>
            <p className="text-[0.85rem] text-muted-foreground mt-1.5 leading-normal">
                How does {countyDetail.county_name}&apos;s color distribution compare to its neighbors? The regional norm
                pools adjacent counties in the San Diego region to show what the area typically reports.
                <strong> Click a county</strong> on the map to switch. Red bars = this county uses that color more often;
                blue = less often than the regional norm.
            </p>
            <div style={{ marginTop: '1rem' }}>
                <DeviationTable distributions={allLc.distributions} />
            </div>
            <p className="text-[0.8rem] text-muted-foreground mt-4 leading-relaxed">
                {allLc.lc_type}. Divergence often reflects naming choices (e.g. &quot;cocoa&quot; vs &quot;brown&quot;) rather than
                real structural differences.
            </p>
        </div>
    )
}
