/** Card showing post-pooling JSD scores for San Diego vs each neighbor — like SpotlightComparison */

interface SdVsNeighbor {
    county_a: { name: string }
    county_b: { name: string }
    jsd: {
        original?: number
        pooled?: { weighted_jsd: number; mean_jsd: number }
    }
}

interface PostPoolingScoresCardProps {
    sdVsNeighbors: Record<string, SdVsNeighbor> | null
    visible: boolean
}

const SD_PAIRS_ORDER = ['06073-06025', '06073-06059', '06073-06065'] as const
// Imperial, Orange, Riverside

export function PostPoolingScoresCard({ sdVsNeighbors, visible }: PostPoolingScoresCardProps) {
    if (!sdVsNeighbors) return null

    const pairs = SD_PAIRS_ORDER.map((key) => {
        const entry = sdVsNeighbors[key]
        if (!entry) return null
        // SD is always county_b for keys 06073-*; neighbor is county_a
        const label = `San Diego vs ${entry.county_a.name}`
        const orig = entry.jsd?.original
        const pooled = entry.jsd?.pooled?.weighted_jsd
        return { key, label, orig, pooled }
    }).filter(Boolean) as { key: string; label: string; orig: number; pooled: number }[]

    if (pairs.length === 0) return null

    return (
        <div
            className="pointer-events-auto max-w-[26rem] p-6 bg-card/95 border-l-4 border-[#21918c] transition-opacity duration-500"
            style={{ opacity: visible ? 1 : 0 }}
        >
            <h2 className="font-serif text-[1.35rem] font-normal leading-snug text-foreground m-0">
                Post-pooling JSD scores
            </h2>
            <p className="text-[0.85rem] text-muted-foreground mt-1.5 leading-normal">
                San Diego vs each neighbor: original divergence → pooled (after merging similar colors).
                Lower = more similar color vocabularies.
            </p>

            <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {pairs.map(({ label, orig, pooled }) => (
                    <div
                        key={label}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0.6rem 1rem',
                            borderRadius: 8,
                        }}
                        className="bg-background border border-border"
                    >
                        <span className="text-[0.9rem] font-semibold text-foreground">{label}</span>
                        <span className="text-[0.9rem] text-muted-foreground">
                            <strong style={{ color: '#3b528b' }}>{orig.toFixed(3)}</strong>
                            <span style={{ margin: '0 0.4rem', color: '#999' }}>→</span>
                            <strong style={{ color: '#2d6a4f' }}>{pooled.toFixed(3)}</strong>
                            <span style={{ marginLeft: '0.25rem', fontSize: '0.75rem', color: '#888' }}>pooled</span>
                        </span>
                    </div>
                ))}
            </div>

            <div className="mt-4 pt-3 border-t border-border flex justify-start gap-5 text-[0.75rem] text-muted-foreground">
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: '#3b528b' }} />
                    Original
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: '#2d6a4f' }} />
                    Pooled
                </span>
            </div>

            <p className="text-[0.8rem] text-muted-foreground mt-3 leading-relaxed">
                JSD drops 60–70% after pooling, confirming that much divergence is naming convention rather than true structural difference.
            </p>
        </div>
    )
}
