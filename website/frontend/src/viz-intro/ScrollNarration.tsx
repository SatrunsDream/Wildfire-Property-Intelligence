import { Scrollama, Step, type ScrollamaStepEvent } from 'react-scrollama'
import { SpotlightComparison } from './SpotlightComparison'
import { ColorPoolDendrogram } from './ColorPoolDendrogram'
import { PostPoolingScoresCard } from './PostPoolingScoresCard'
import { KLDivergenceCard } from './KLDivergenceCard'
import type { CountyDetail } from '../lib/conditionalPooling'
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
    sd_vs_neighbors?: Record<string, {
        county_a: { name: string }
        county_b: { name: string }
        jsd: { original?: number; pooled?: { weighted_jsd: number; mean_jsd: number } }
    }>
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
    countyKlDetail: CountyDetail | null
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

function SolutionCard({ visible: _visible }: { visible: boolean }) {
    return (
        <div
            className="pointer-events-auto w-full max-w-4xl"
            style={{
                opacity: 1,
                transform: 'translateX(0)',
            }}
        >
            <div
                style={{
                    padding: '1.75rem 2rem',
                    background: 'rgba(252, 251, 248, 0.97)',
                    borderLeft: '4px solid #21918c',
                    borderRadius: '0 12px 12px 0',
                    boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
                }}
            >
                <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.5rem', fontWeight: 600, color: '#1a1a1a', margin: 0 }}>
                    Our solution: Greedy color pooling
                </h2>
                <p style={{ fontSize: '0.9rem', color: '#444', marginTop: '0.75rem', lineHeight: 1.65 }}>
                    To reconcile county color vocabularies, we use hierarchical merging: similar colors that appear as substitutes across adjacent counties are merged into pooled groups. The algorithm iterates over rounds.
                </p>
                <ul style={{ fontSize: '0.875rem', color: '#555', marginTop: '0.6rem', lineHeight: 1.7, paddingLeft: '1.25rem' }}>
                    <li><strong>Round 1:</strong> Each color starts as its own cluster.</li>
                    <li><strong>Neighbor votes:</strong> Adjacent counties with shared strata (building type, landcover) vote for which color pairs look interchangeable.</li>
                    <li><strong>Greedy merge:</strong> The most-voted pair merges; one color becomes the canonical label (e.g., red absorbs crimson, scarlet).</li>
                    <li><strong>Stop rule:</strong> Merging stops when the top vote falls below a threshold or no candidates remain.</li>
                </ul>
                <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '1rem', lineHeight: 1.6 }}>
                    The dendrogram below shows the merge tree. Horizontal lines indicate merges; the numbers are the vote count (distance) at which clusters combined. Lower values mean earlier, stronger agreement. The result: 50+ raw color names collapse into ~7 semantic groups (RED, NAVY, COCOA, OLIVE, ALABASTER, AMBER, ORANGE).
                </p>
                <p style={{ fontSize: '0.85rem', color: '#2d6a4f', marginTop: '0.75rem', lineHeight: 1.6, fontWeight: 500 }}>
                    <strong>Post-pooling impact:</strong> San Diego vs neighbors JSD drops from ~0.57–0.69 (raw) to ~0.20–0.27 (pooled), evidence that much divergence is naming convention.
                </p>
                <div style={{ marginTop: '1.5rem' }}>
                    <ColorPoolDendrogram />
                    <p style={{ fontSize: '0.75rem', color: '#888', marginTop: '0.5rem', fontStyle: 'italic' }}>
                        Merge dendrogram by round. Click a branch to zoom in; click the background to reset.
                    </p>
                </div>
            </div>
        </div>
    )
}


export function ScrollNarration({ onSceneEnter, onSceneProgress, comparisonData, caseStudyData, countyKlDetail, selectedPair, activeScene }: ScrollNarrationProps) {
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

                {/* Scene 3: KL divergence — deviation from regional norm (right side) */}
                <Step data="distributions">
                    <div className="flex min-h-[120vh] items-center justify-end px-6 md:px-16">
                        <KLDivergenceCard
                            countyDetail={countyKlDetail}
                            visible={activeScene === 'distributions'}
                        />
                    </div>
                </Step>

                {/* Scene 4: Our solution — greedy color pooling with dendrogram (centered) */}
                <Step data="solution">
                    <div className="flex min-h-[120vh] items-center justify-center px-6 md:px-16">
                        <SolutionCard visible={activeScene === 'solution'} />
                    </div>
                </Step>

                {/* Scene 5: Post-pooling JSD scores — like "Same border. Different data." */}
                <Step data="postPooling">
                    <div className="flex min-h-[140vh] items-center px-6 md:px-16">
                        <PostPoolingScoresCard
                            sdVsNeighbors={
                                (caseStudyData as CaseStudyData | null)?.sd_vs_neighbors ?? null
                            }
                            visible={activeScene === 'postPooling'}
                        />
                    </div>
                </Step>
            </Scrollama>
        </div>
    )
}
