import { useState } from 'react'
import App from './App.tsx'
import { EmpiricalBayesPooling } from './EmpiricalBayesPooling.tsx'
import { NeighborDivergence } from './NeighborDivergence.tsx'
import { C2STMap } from './C2STMap.tsx'
import { AppSidebar, type Page } from './components/app-sidebar'
import { SiteHeader } from './components/site-header'
import { SidebarInset, SidebarProvider } from './components/ui/sidebar'

const pageTitles: Record<Page, string> = {
    'home': 'Home',
    'conditional-probability': 'Conditional Probability',
    'empirical-bayes': 'Empirical Bayes Pooling',
    'neighbor-divergence': 'Neighbor Divergence',
    'c2st': 'C2ST',
}

export function Router() {
    const [page, setPage] = useState<Page>('home')

    return (
        <SidebarProvider
            style={
                {
                    "--sidebar-width": "calc(var(--spacing) * 72)",
                    "--header-height": "calc(var(--spacing) * 12)",
                } as React.CSSProperties
            }
        >
            <AppSidebar variant="inset" currentPage={page} onPageChange={setPage} />
            <SidebarInset>
                <SiteHeader title={pageTitles[page]} />
                <div className="flex flex-1 flex-col">
                    <div className="@container/main flex flex-1 flex-col gap-2">
                        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
                            {page === 'home' && null}
                            {page === 'conditional-probability' && <App />}
                            {page === 'empirical-bayes' && <EmpiricalBayesPooling />}
                            {page === 'neighbor-divergence' && <NeighborDivergence />}
                            {page === 'c2st' && <C2STMap />}
                        </div>
                    </div>
                </div>
            </SidebarInset>
        </SidebarProvider>
    )
}
