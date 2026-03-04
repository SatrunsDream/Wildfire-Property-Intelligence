import { useReducer, useCallback, useRef, useEffect, useState } from 'react'
import { IconArrowLeft } from '@tabler/icons-react'
import { HeroSection } from './viz-intro/HeroSection'
import { StickyGraphic, type MapApi } from './viz-intro/StickyGraphic'
import { ScrollNarration } from './viz-intro/ScrollNarration'
import type { SceneId } from './viz-intro/constants'

function goToDashboard() {
    window.location.href = '/'
}

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
            api.spotlightCounties()
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

    // Load San Diego / Orange comparison data
    const [comparisonData, setComparisonData] = useState<ComparisonData | null>(null)
    useEffect(() => {
        fetch('/data/county-pair-comparisons.json')
            .then((r) => r.json())
            .then((all: Record<string, ComparisonData>) => {
                setComparisonData(all['06059-06073'] ?? all['06073-06059'] ?? null)
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
                api.spotlightCounties()
                break
        }
    }, [])

    const handleSceneProgress = useCallback((scene: SceneId, progress: number) => {
        dispatch({ type: 'PROGRESS', scene, progress })
        if (scene === 'counties') {
            mapApi.current?.revealChoropleth(progress)
        }
    }, [])

    // Escape key exits to dashboard
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                goToDashboard()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [])

    return (
        <div style={{ background: '#fcfbf8' }}>
            {/* Exit button — fixed top-left, always visible */}
            <a
                href="/"
                onClick={(e) => {
                    e.preventDefault()
                    goToDashboard()
                }}
                className="fixed left-4 top-4 z-[100] flex items-center gap-2 rounded-lg border border-gray-200 bg-white/95 px-4 py-2.5 text-sm font-medium text-gray-700 shadow-md transition-colors hover:bg-gray-50 hover:text-gray-900"
                style={{ textDecoration: 'none' }}
            >
                <IconArrowLeft size={18} stroke={2} />
                <span>Back to Dashboard</span>
                <span className="ml-1 text-xs text-gray-400">(Esc)</span>
            </a>
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
