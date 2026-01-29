import { useState } from 'react'
import App from './App.tsx'
import { NeighborDivergence } from './NeighborDivergence.tsx'
import { C2STMap } from './C2STMap.tsx'

type Page = 'conditional-probability' | 'neighbor-divergence' | 'c2st'

export function Router() {
    const [page, setPage] = useState<Page>('conditional-probability')

    return (
        <>
            <nav className="nav-bar">
                <button
                    className={`nav-btn ${page === 'conditional-probability' ? 'active' : ''}`}
                    onClick={() => setPage('conditional-probability')}
                >
                    M01: Conditional Probability
                </button>
                <button
                    className={`nav-btn ${page === 'neighbor-divergence' ? 'active' : ''}`}
                    onClick={() => setPage('neighbor-divergence')}
                >
                    M03: Neighbor Divergence
                </button>
                <button
                    className={`nav-btn ${page === 'c2st' ? 'active' : ''}`}
                    onClick={() => setPage('c2st')}
                >
                    M04: C2ST
                </button>
            </nav>
            {page === 'conditional-probability' && <App />}
            {page === 'neighbor-divergence' && <NeighborDivergence />}
            {page === 'c2st' && <C2STMap />}
        </>
    )
}
