/** Side-by-side bar chart comparing San Diego vs Orange color distributions */

interface DistEntry {
    value: string
    proportion: number
    count: number
}

interface ComparisonData {
    county_a: { name: string; total_count: number; clr: { distribution: DistEntry[] } }
    county_b: { name: string; total_count: number; clr: { distribution: DistEntry[] } }
    jsd: { original: number }
}

interface SpotlightComparisonProps {
    data: ComparisonData | null
    visible: boolean
}

export function SpotlightComparison({ data, visible }: SpotlightComparisonProps) {
    if (!data) return null

    const topA = data.county_a.clr.distribution.slice(0, 6)
    const topB = data.county_b.clr.distribution.slice(0, 6)
    const maxProp = Math.max(
        ...topA.map((d) => d.proportion),
        ...topB.map((d) => d.proportion),
    )

    return (
        <div
            className="pointer-events-auto"
            style={{
                maxWidth: '26rem',
                padding: '1.5rem',
                background: 'rgba(252, 251, 248, 0.95)',
                borderLeft: '3px solid #3b528b',
                opacity: visible ? 1 : 0,
                transition: 'opacity 0.5s',
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
                Same border. Different data.
            </h2>
            <p style={{ fontSize: '0.85rem', color: '#888', marginTop: '0.35rem' }}>
                Jensen-Shannon divergence: {data.jsd.original.toFixed(3)}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginTop: '1rem' }}>
                <CountyBars
                    name={data.county_a.name}
                    count={data.county_a.total_count}
                    entries={topA}
                    maxProp={maxProp}
                    color="#21918c"
                />
                <CountyBars
                    name={data.county_b.name}
                    count={data.county_b.total_count}
                    entries={topB}
                    maxProp={maxProp}
                    color="#440154"
                />
            </div>

            <p style={{ fontSize: '0.8rem', color: '#999', marginTop: '1rem', lineHeight: 1.6 }}>
                These counties share a border and similar geography — yet their top reported
                building attributes barely overlap.
            </p>
        </div>
    )
}

function CountyBars({
    name,
    count,
    entries,
    maxProp,
    color,
}: {
    name: string
    count: number
    entries: DistEntry[]
    maxProp: number
    color: string
}) {
    return (
        <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#282828' }}>{name}</div>
            <div style={{ fontSize: '0.7rem', color: '#999', marginBottom: '0.5rem' }}>
                {count.toLocaleString()} structures
            </div>
            {entries.map((d) => (
                <div key={d.value} style={{ marginBottom: '3px' }}>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            fontSize: '0.7rem',
                        }}
                    >
                        <span style={{ width: '4.5rem', color: '#555', flexShrink: 0 }}>
                            {d.value}
                        </span>
                        <div
                            style={{
                                flex: 1,
                                height: '10px',
                                background: '#eee',
                                position: 'relative',
                            }}
                        >
                            <div
                                style={{
                                    position: 'absolute',
                                    left: 0,
                                    top: 0,
                                    bottom: 0,
                                    width: `${(d.proportion / maxProp) * 100}%`,
                                    background: color,
                                    transition: 'width 0.6s ease',
                                }}
                            />
                        </div>
                        <span
                            style={{
                                width: '2.5rem',
                                textAlign: 'right',
                                color: '#888',
                                fontSize: '0.65rem',
                                flexShrink: 0,
                            }}
                        >
                            {(d.proportion * 100).toFixed(1)}%
                        </span>
                    </div>
                </div>
            ))}
        </div>
    )
}
