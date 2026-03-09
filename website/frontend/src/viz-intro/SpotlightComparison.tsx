/** Side by side bar chart comparing San Diego vs Orange color distributions */

interface DistEntry {
    value: string
    proportion: number
    count: number
}

interface ComparisonData {
    county_a: { name: string; total_count: number; clr: { distribution: DistEntry[] } }
    county_b: { name: string; total_count: number; clr: { distribution: DistEntry[] } }
    jsd: { original: number; pooled?: { weighted_jsd: number; mean_jsd: number } }
}

interface SpotlightComparisonProps {
    data: ComparisonData | null
    selectedPair?: { fips_a: string; fips_b: string; county_a: string; county_b: string } | null
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
            className="pointer-events-auto max-w-[26rem] p-6 bg-card/95 border-l-4 border-[#3b528b] transition-opacity duration-500"
            style={{ opacity: visible ? 1 : 0 }}
        >
            <h2 className="font-serif text-[1.35rem] font-normal leading-snug text-foreground m-0">
                Same border. Different data.
            </h2>
            <p className="text-[0.85rem] text-muted-foreground mt-1.5 leading-normal">
                Paths show JSD between San Diego and each neighbor. <strong>Click a path</strong> to compare.
                {data.county_a.name}–{data.county_b.name}: JSD <strong>{data.jsd.original.toFixed(3)}</strong>
                {data.jsd.pooled != null && <> → <strong>{data.jsd.pooled.weighted_jsd.toFixed(3)}</strong> after pooling</>}.
                Different color vocabularies (e.g. "cocoa" vs "brown") create divergence.
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

            <p className="text-[0.8rem] text-muted-foreground mt-4 leading-relaxed">
                The top colors differ between counties. Pooling similar labels (e.g. cocoa, olive,
                red, navy) reduces mean neighbor JSD from ~0.62 to ~0.21 statewide, evidence that
                much observed divergence is labeling convention, not structural difference.
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
            <div className="text-[0.85rem] font-bold text-foreground">{name}</div>
            <div className="text-[0.7rem] text-muted-foreground mb-2">
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
                        <span className="w-[4.5rem] shrink-0 text-foreground">
                            {d.value}
                        </span>
                        <div className="flex-1 h-2.5 relative bg-muted">
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
                        <span className="w-[2.5rem] text-right text-muted-foreground text-[0.65rem] shrink-0">
                            {(d.proportion * 100).toFixed(1)}%
                        </span>
                    </div>
                </div>
            ))}
        </div>
    )
}
