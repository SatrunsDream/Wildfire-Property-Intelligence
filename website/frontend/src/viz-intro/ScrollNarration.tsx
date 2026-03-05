import { Scrollama, Step, type ScrollamaStepEvent } from 'react-scrollama'
import { SpotlightComparison } from './SpotlightComparison'
import type { SceneId } from './constants'

interface ComparisonData {
    county_a: { name: string; total_count: number; clr: { distribution: { value: string; proportion: number; count: number }[] } }
    county_b: { name: string; total_count: number; clr: { distribution: { value: string; proportion: number; count: number }[] } }
    jsd: { original: number }
}

interface CaseStudyData {
    counties?: { fips: string; name: string }[]
    exposure?: Record<string, { total_exposure: number; median_exposure: number }>
    distributions?: Record<string, { name: string; by_landcover: Record<string, { clr: string; proportion: number; count: number }[]> }>
    surprisal?: Record<string, number>
    group_level_divergence?: { avg_divergence_by_county?: Record<string, number> }
    sd_vs_neighbors?: Record<string, { county_a: { name: string }; county_b: { name: string }; jsd: { original?: number } }>
}

interface SelectedPair {
    fips_a: string
    fips_b: string
    county_a: string
    county_b: string
}

interface ScrollNarrationProps {
    onSceneEnter: (scene: SceneId, direction: 'up' | 'down') => void
    onSceneProgress: (scene: SceneId, progress: number) => void
    comparisonData: ComparisonData | null
    caseStudyData: CaseStudyData | Record<string, unknown> | null
    selectedPair: SelectedPair | null
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

function DistributionsCard({
    data,
    visible,
    slideFromRight = false,
}: {
    data: CaseStudyData | Record<string, unknown> | null
    visible: boolean
    slideFromRight?: boolean
}) {
    const d = data as CaseStudyData | null
    if (!d?.distributions) return null
    const urban = Object.entries(d.distributions).map(([, v]) => ({
        name: v.name,
        top: (v.by_landcover?.urban ?? [])?.slice(0, 6) ?? [],
    }))
    return (
        <div
            className="pointer-events-auto"
            style={{
                maxWidth: '26rem',
                padding: '1.5rem',
                background: 'rgba(252, 251, 248, 0.95)',
                borderLeft: '3px solid #f97316',
                opacity: visible ? 1 : 0,
                transform: slideFromRight ? (visible ? 'translateX(0)' : 'translateX(100%)') : undefined,
                transition: 'opacity 0.5s, transform 0.5s ease-out',
            }}
        >
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.35rem', fontWeight: 400, color: '#282828', margin: 0 }}>
                Color distributions (urban landcover)
            </h2>
            <p style={{ fontSize: '0.85rem', color: '#555', marginTop: '0.5rem', lineHeight: 1.5 }}>
                P(color | landcover) varies by county. Top colors for urban areas:
            </p>
            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {urban.map(({ name, top }) => (
                    <div key={name} style={{ padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#666', marginTop: 4 }}>
                            {top.map((t) => `${t.clr} ${(t.proportion * 100).toFixed(1)}%`).join(' · ')}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

export function ScrollNarration({ onSceneEnter, onSceneProgress, comparisonData, caseStudyData, selectedPair, activeScene }: ScrollNarrationProps) {
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
                                county's color distribution differs from adjacent counties. Scroll to zoom
                                into the San Diego region: San Diego, Orange, Riverside, and Imperial.
                            </p>
                        </NarrationCard>
                    </div>
                </Step>

                {/* Scene 2: Spotlight — "Same border, different data" */}
                <Step data="spotlight">
                    <div className="flex min-h-[140vh] items-center px-6 md:px-16">
                        <SpotlightComparison
                            data={comparisonData}
                            selectedPair={selectedPair}
                            visible={activeScene === 'spotlight'}
                        />
                    </div>
                </Step>

                {/* Scene 3: Color distributions — slides in from right, replacing the comparison */}
                <Step data="distributions">
                    <div
                        className="flex min-h-[120vh] items-center px-6 md:px-16"
                        style={{ overflow: 'hidden', justifyContent: 'flex-end' }}
                    >
                        <DistributionsCard
                            data={caseStudyData}
                            visible={activeScene === 'distributions'}
                            slideFromRight={true}
                        />
                    </div>
                </Step>
            </Scrollama>
        </div>
    )
}
