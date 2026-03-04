import { Scrollama, Step, type ScrollamaStepEvent } from 'react-scrollama'
import { SpotlightComparison } from './SpotlightComparison'
import type { SceneId } from './constants'

interface ComparisonData {
    county_a: { name: string; total_count: number; clr: { distribution: { value: string; proportion: number; count: number }[] } }
    county_b: { name: string; total_count: number; clr: { distribution: { value: string; proportion: number; count: number }[] } }
    jsd: { original: number }
}

interface ScrollNarrationProps {
    onSceneEnter: (scene: SceneId, direction: 'up' | 'down') => void
    onSceneProgress: (scene: SceneId, progress: number) => void
    comparisonData: ComparisonData | null
    activeScene: SceneId
}

function NarrationCard({ children, accent = '#21918c' }: { children: React.ReactNode; accent?: string }) {
    return (
        <div
            className="pointer-events-auto"
            style={{
                maxWidth: '22rem',
                padding: '1.25rem 1.5rem',
                background: 'rgba(252, 251, 248, 0.92)',
                borderLeft: `3px solid ${accent}`,
            }}
        >
            {children}
        </div>
    )
}

const METRICS = [
    { label: 'Mean neighbor JSD (raw colors)', value: '0.62', sub: 'Counties differ substantially' },
    { label: 'After color pooling', value: '0.36', sub: '~42% reduction, much is naming' },
    { label: 'C2ST classifier accuracy', value: '92%', sub: 'Counties very separable; color most important' },
    { label: 'Group level JSD vs state', value: '0.57', sub: 'Most counties noticeably diverge from baseline' },
]

function FindingsCard() {
    return (
        <div
            className="pointer-events-auto"
            style={{
                maxWidth: '26rem',
                padding: '1.5rem',
                background: 'rgba(252, 251, 248, 0.95)',
                borderLeft: '3px solid #576342',
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
                What the metrics tell us
            </h2>
            <p style={{ fontSize: '0.9rem', color: '#555', marginTop: '0.5rem', lineHeight: 1.6 }}>
                San Diego and its neighbors exemplify a statewide pattern: large divergence does not
                always mean bad data. Labels like "cocoa" vs "brown" vs "coffee" create artificial
                divergence even when underlying structures are similar, like "duplex" vs "flat."
            </p>
            <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {METRICS.map((m) => (
                    <div key={m.label} style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.02)', borderRadius: 6 }}>
                        <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: 2 }}>{m.label}</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#282828' }}>{m.value}</div>
                        <div style={{ fontSize: '0.8rem', color: '#888', marginTop: 2 }}>{m.sub}</div>
                    </div>
                ))}
            </div>
            <p style={{ fontSize: '0.85rem', color: '#555', marginTop: '1.25rem', lineHeight: 1.65 }}>
                <strong>Detecting divergence alone does not resolve the problem.</strong> Empirical
                Bayes shrinkage and spatial pooling reduce false positives from sparsity. Color
                pooling, merging similar labels, shows that a substantial share of observed
                inconsistency is naming conventions, not true structural differences.
            </p>
        </div>
    )
}

export function ScrollNarration({ onSceneEnter, onSceneProgress, comparisonData, activeScene }: ScrollNarrationProps) {
    const handleStepEnter = ({ data, direction }: ScrollamaStepEvent) => {
        onSceneEnter(data as SceneId, direction)
    }

    const handleStepProgress = ({ data, progress }: ScrollamaStepEvent) => {
        onSceneProgress(data as SceneId, progress ?? 0)
    }

    return (
        <div className="pointer-events-none relative z-10 -mt-[100vh]">
            <Scrollama
                offset={0.5}
                onStepEnter={handleStepEnter}
                onStepProgress={handleStepProgress}
                threshold={4}
            >
                {/* Scene 1: Counties appear */}
                <Step data="counties">
                    <div className="flex min-h-[130vh] items-center px-6 md:px-16">
                        <NarrationCard>
                            <h2
                                style={{
                                    fontFamily: 'Georgia, "Times New Roman", serif',
                                    fontSize: 'clamp(1.25rem, 3vw, 1.625rem)',
                                    fontWeight: 400,
                                    lineHeight: 1.3,
                                    color: '#282828',
                                    margin: 0,
                                }}
                            >
                                58 counties report this data independently.
                            </h2>
                            <p style={{ fontSize: '0.95rem', lineHeight: 1.7, color: '#555', marginTop: '0.75rem' }}>
                                Each county records structural characteristics using its own conventions.
                                The map shows <strong>maximum neighbor divergence</strong>: how much each
                                county's color distribution differs from adjacent counties. Darker
                                regions suggest larger inconsistencies. San Diego, a major urban
                                county, sits in a region with its own divergence profile. Scroll
                                to zoom into San Diego and Orange.
                            </p>
                        </NarrationCard>
                    </div>
                </Step>

                {/* Scene 2: Spotlight on San Diego & Orange */}
                <Step data="spotlight">
                    <div className="flex min-h-[140vh] items-center px-6 md:px-16">
                        <SpotlightComparison
                            data={comparisonData}
                            visible={activeScene === 'spotlight'}
                        />
                    </div>
                </Step>

                {/* Scene 3: Key findings and metrics */}
                <Step data="findings">
                    <div className="flex min-h-[120vh] items-center px-6 md:px-16">
                        <FindingsCard />
                    </div>
                </Step>
            </Scrollama>
        </div>
    )
}
