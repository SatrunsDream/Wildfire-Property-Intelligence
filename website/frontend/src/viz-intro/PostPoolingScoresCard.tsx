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
            className="pointer-events-auto"
            style={{
                maxWidth: '26rem',
                padding: '1.5rem',
                background: 'rgba(252, 251, 248, 0.95)',
                borderLeft: '3px solid #21918c',
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
                Post-pooling JSD scores
            </h2>
            <p style={{ fontSize: '0.85rem', color: '#555', marginTop: '0.35rem', lineHeight: 1.5 }}>
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
                            background: '#fff',
                            borderRadius: 8,
                            border: '1px solid #e8e6e1',
                        }}
                    >
                        <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#282828' }}>{label}</span>
                        <span style={{ fontSize: '0.9rem', color: '#555' }}>
                            <strong style={{ color: '#3b528b' }}>{orig.toFixed(3)}</strong>
                            <span style={{ margin: '0 0.4rem', color: '#999' }}>→</span>
                            <strong style={{ color: '#2d6a4f' }}>{pooled.toFixed(3)}</strong>
                            <span style={{ marginLeft: '0.25rem', fontSize: '0.75rem', color: '#888' }}>pooled</span>
                        </span>
                    </div>
                ))}
            </div>

            <div
                style={{
                    marginTop: '1rem',
                    paddingTop: '0.75rem',
                    borderTop: '1px solid #dee2e6',
                    display: 'flex',
                    justifyContent: 'flex-start',
                    gap: '1.25rem',
                    fontSize: '0.75rem',
                    color: '#6c757d',
                }}
            >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: '#3b528b' }} />
                    Original
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: '#2d6a4f' }} />
                    Pooled
                </span>
            </div>

            <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.75rem', lineHeight: 1.6 }}>
                JSD drops 60–70% after pooling, confirming that much divergence is naming convention rather than true structural difference.
            </p>
        </div>
    )
}
