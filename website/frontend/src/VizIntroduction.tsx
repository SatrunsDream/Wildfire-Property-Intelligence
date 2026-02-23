import { useReducer, useCallback, useRef, useEffect, useState } from 'react'
import { HeroSection } from './viz-intro/HeroSection'
import { StickyGraphic, type MapApi } from './viz-intro/StickyGraphic'
import { ScrollNarration } from './viz-intro/ScrollNarration'
import type { SceneId } from './viz-intro/constants'

interface State {
    activeScene: SceneId
    progress: number
    direction: 'up' | 'down'
}

type Action =
    | { type: 'SCENE_ENTER'; scene: SceneId; direction: 'up' | 'down' }
    | { type: 'PROGRESS'; scene: SceneId; progress: number }

function reducer(state: State, action: Action): State {
    switch (action.type) {
        case 'SCENE_ENTER':
            return { ...state, activeScene: action.scene, direction: action.direction }
        case 'PROGRESS':
            if (action.scene !== state.activeScene) return state
            return { ...state, progress: action.progress }
        default:
            return state
    }
}

function applyScene(api: MapApi, scene: SceneId, progress: number) {
    switch (scene) {
        case 'hero':
            api.showCounties()
            break
        case 'counties':
            api.revealChoropleth(progress)
            break
        case 'spotlight':
            api.spotlightNapaSonoma()
            break
    }
}

interface ComparisonData {
    county_a: { name: string; total_count: number; clr: { distribution: { value: string; proportion: number; count: number }[] } }
    county_b: { name: string; total_count: number; clr: { distribution: { value: string; proportion: number; count: number }[] } }
    jsd: { original: number }
}

export function VizIntroduction() {
    const [state, dispatch] = useReducer(reducer, {
        activeScene: 'hero',
        progress: 0,
        direction: 'down',
    })

    const mapApi = useRef<MapApi | null>(null)
    const stateRef = useRef(state)
    stateRef.current = state

    // Load Napa/Sonoma comparison data
    const [comparisonData, setComparisonData] = useState<ComparisonData | null>(null)
    useEffect(() => {
        fetch('/data/county-pair-comparisons.json')
            .then((r) => r.json())
            .then((all: Record<string, ComparisonData>) => {
                setComparisonData(all['06055-06097'] ?? null)
            })
            .catch((e) => console.error('Failed to load comparison data', e))
    }, [])

    const handleMapReady = useCallback((api: MapApi) => {
        mapApi.current = api
        applyScene(api, stateRef.current.activeScene, stateRef.current.progress)
    }, [])

    const handleSceneEnter = useCallback((scene: SceneId, direction: 'up' | 'down') => {
        dispatch({ type: 'SCENE_ENTER', scene, direction })

        const api = mapApi.current
        if (!api) return

        switch (scene) {
            case 'hero':
                if (direction === 'up') {
                    api.resetFromSpotlight()
                    api.showCounties()
                }
                break
            case 'counties':
                if (direction === 'up') {
                    api.resetFromSpotlight()
                }
                api.revealChoropleth(0)
                break
            case 'spotlight':
                api.spotlightNapaSonoma()
                break
        }
    }, [])

    const handleSceneProgress = useCallback((scene: SceneId, progress: number) => {
        dispatch({ type: 'PROGRESS', scene, progress })
        if (scene === 'counties') {
            mapApi.current?.revealChoropleth(progress)
        }
    }, [])

    return (
        <div style={{ background: '#fcfbf8' }}>
            {/* Part 1: Editorial intro — no map */}
            <HeroSection />

            {/* Part 2: Scrollytelling with sticky map */}
            <div className="relative">
                <StickyGraphic
                    scene={state.activeScene}
                    progress={state.progress}
                    onReady={handleMapReady}
                />
                <ScrollNarration
                    onSceneEnter={handleSceneEnter}
                    onSceneProgress={handleSceneProgress}
                    comparisonData={comparisonData}
                    activeScene={state.activeScene}
                />
            </div>
        </div>
    )
}
