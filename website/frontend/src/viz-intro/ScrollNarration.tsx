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
                                Each county in California records structural characteristics
                                using its own conventions. As you scroll, the color shifts
                                to show how much each county's data diverges from its neighbors.
                            </p>
                        </NarrationCard>
                    </div>
                </Step>

                {/* Scene 2: Spotlight on Napa & Sonoma */}
                <Step data="spotlight">
                    <div className="flex min-h-[140vh] items-center px-6 md:px-16">
                        <SpotlightComparison
                            data={comparisonData}
                            visible={activeScene === 'spotlight'}
                        />
                    </div>
                </Step>
            </Scrollama>
        </div>
    )
}
