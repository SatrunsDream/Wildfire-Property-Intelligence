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
            className="pointer-events-auto max-w-[22rem] p-5 sm:p-6 bg-card/95 border-l-4"
            style={{ borderLeftColor: accent }}
        >
            {children}
        </div>
    )
}

function ConclusionCard({ visible: _visible }: { visible: boolean }) {
    return (
        <div
            className="pointer-events-auto w-full max-w-4xl"
            style={{ opacity: 1, transform: 'translateX(0)' }}
        >
            <div className="py-7 px-8 bg-card/97 border-l-4 border-[var(--button-accent)] rounded-r-xl shadow-lg">
                <h2 className="font-serif text-2xl font-semibold text-foreground m-0">
                    Conclusion
                </h2>
                <p className="text-[0.9rem] text-muted-foreground mt-3 leading-relaxed">
                    The analytical methods used throughout this study rely on concepts from information theory to quantify differences in categorical distributions across regions. Measures such as conditional probability, KL, surprisals, and Jensen–Shannon divergence provide a measurable way to evaluate how unexpected a particular categorical observation is relative to a broader distribution. We relied heavily on Dirichlet-based smoothing throughout our analysis and quantified the &quot;distance&quot; between two distributions in terms of the information required to distinguish them.
                </p>
                <p className="text-[0.9rem] text-muted-foreground mt-3 leading-relaxed">
                    Labels produce artificial divergence even though the underlying structures are similar. Many of our methods indicate that anomalies can occur due to similar categories being reported differently and that color is an important feature to cluster. While all methods can detect outliers, Jensen–Shannon divergence performs best for anomaly detection across county lines. Our greedy iterative merging algorithm converged on seven dominant color groups, lowering mean neighbor JSD from approximately 0.62 to 0.21, evidence that much observed divergence is driven by inconsistent labeling conventions rather than differences in structural characteristics.
                </p>
                <p className="text-[0.9rem] text-muted-foreground mt-3 leading-relaxed">
                    This work provides both methodological insights and practical tools for improving the quality of large-scale structure datasets. By identifying sources of apparent anomalies, evaluating detection methods, and proposing strategies for scalable analysis, we contribute to the broader effort of strengthening the data foundations that support disaster risk modeling and resilience planning.
                </p>
            </div>
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
            <div className="py-7 px-8 bg-card/97 border-l-4 border-[#21918c] rounded-r-xl shadow-lg">
                <h2 className="font-serif text-2xl font-semibold text-foreground m-0">
                    Our solution: Greedy color pooling
                </h2>
                <p className="text-[0.9rem] text-muted-foreground mt-3 leading-relaxed">
                    To reconcile county color vocabularies, we use hierarchical merging: similar colors that appear as substitutes across adjacent counties are merged into pooled groups. The algorithm iterates over rounds.
                </p>
                <ul className="text-[0.875rem] text-muted-foreground mt-2.5 leading-relaxed pl-5">
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
                                className="text-foreground font-medium"
                                style={{
                                    fontFamily: 'Georgia, "Times New Roman", serif',
                                    fontSize: 'clamp(1.25rem, 3vw, 1.625rem)',
                                    lineHeight: 1.3,
                                    margin: 0,
                                }}
                            >
                                58 counties report this data independently.
                            </h2>
                            <p className="text-foreground text-[0.95rem] leading-[1.7] mt-3">
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

                {/* Scene 6: Conclusion — centered box from report sections 4-6 */}
                <Step data="conclusion">
                    <div className="flex min-h-[120vh] items-center justify-center px-6 md:px-16">
                        <ConclusionCard visible={activeScene === 'conclusion'} />
                    </div>
                </Step>
            </Scrollama>
        </div>
    )
}
