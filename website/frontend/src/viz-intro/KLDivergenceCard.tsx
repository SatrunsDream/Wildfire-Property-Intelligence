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
        <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: '#f8f9fa', borderRadius: 6 }}>
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
        <div
            className="pointer-events-auto"
            style={{
                maxWidth: '26rem',
                maxHeight: '70vh',
                overflowY: 'auto',
                padding: '1.5rem',
                background: 'rgba(252, 251, 248, 0.95)',
                borderRight: '3px solid #3b528b',
            }}
        >
            <h2
                style={{
                    fontFamily: 'Georgia, "Times New Roman", serif',
                    fontSize: '1.35rem',
                    fontWeight: 400,
                    lineHeight: 1.3,
                    color: '#282828',
                    margin: 0,
                }}
            >
                {countyDetail.county_name} — Deviation from Regional Norm
            </h2>
            <p style={{ fontSize: '0.8rem', color: '#555', marginTop: '0.35rem', lineHeight: 1.5 }}>
                {allLc.lc_type}. County color distribution vs. neighbor-pooled. Red = over-represented, blue = under-represented.
            </p>
            <div style={{ marginTop: '1rem' }}>
                <DeviationTable distributions={allLc.distributions} />
            </div>
            <p style={{ fontSize: '0.75rem', color: '#666', marginTop: '1rem', lineHeight: 1.5 }}>
                Click another county (Orange, Riverside, Imperial) on the map to compare.
            </p>
        </div>
    )
}
