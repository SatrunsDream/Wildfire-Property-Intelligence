import { useState } from 'react'
import App from './App.tsx'
import { EmpiricalBayesPooling } from './EmpiricalBayesPooling.tsx'
import { NeighborDivergence } from './NeighborDivergence.tsx'
import { C2STMap } from './C2STMap.tsx'
import { cn } from './lib/utils'

type Page = 'conditional-probability' | 'empirical-bayes' | 'neighbor-divergence' | 'c2st'

export function Router() {
    const [page, setPage] = useState<Page>('conditional-probability')

    return (
        <>
            <nav className="flex justify-center gap-0 pt-4 pb-0 mb-0 border-b border-border">
                <button
                    className={cn(
                        'px-8 py-3 border border-border border-b-0 bg-muted text-muted-foreground',
                        'font-mono text-sm font-medium uppercase tracking-widest',
                        'cursor-pointer transition-all duration-150 -mb-px rounded-t',
                        'hover:bg-sage-100 hover:text-foreground',
                        page === 'conditional-probability' && 'bg-background text-foreground border-b-background'
                    )}
                    onClick={() => setPage('conditional-probability')}
                >
                    M01: Conditional Probability
                </button>
                <button
                    className={cn(
                        'px-8 py-3 border border-border border-b-0 border-l-0 bg-muted text-muted-foreground',
                        'font-mono text-sm font-medium uppercase tracking-widest',
                        'cursor-pointer transition-all duration-150 -mb-px rounded-t',
                        'hover:bg-sage-100 hover:text-foreground',
                        page === 'empirical-bayes' && 'bg-background text-foreground border-b-background'
                    )}
                    onClick={() => setPage('empirical-bayes')}
                >
                    M02: Empirical Bayes Pooling
                </button>
                <button
                    className={cn(
                        'px-8 py-3 border border-border border-b-0 border-l-0 bg-muted text-muted-foreground',
                        'font-mono text-sm font-medium uppercase tracking-widest',
                        'cursor-pointer transition-all duration-150 -mb-px rounded-t',
                        'hover:bg-sage-100 hover:text-foreground',
                        page === 'neighbor-divergence' && 'bg-background text-foreground border-b-background'
                    )}
                    onClick={() => setPage('neighbor-divergence')}
                >
                    M03: Neighbor Divergence
                </button>
                <button
                    className={cn(
                        'px-8 py-3 border border-border border-b-0 border-l-0 bg-muted text-muted-foreground',
                        'font-mono text-sm font-medium uppercase tracking-widest',
                        'cursor-pointer transition-all duration-150 -mb-px rounded-t',
                        'hover:bg-sage-100 hover:text-foreground',
                        page === 'c2st' && 'bg-background text-foreground border-b-background'
                    )}
                    onClick={() => setPage('c2st')}
                >
                    M04: C2ST
                </button>
            </nav>
            {page === 'conditional-probability' && <App />}
            {page === 'empirical-bayes' && <EmpiricalBayesPooling />}
            {page === 'neighbor-divergence' && <NeighborDivergence />}
            {page === 'c2st' && <C2STMap />}
        </>
    )
}
