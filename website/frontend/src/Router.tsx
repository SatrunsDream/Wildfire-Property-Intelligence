import { useState } from 'react'
import { ConditionalProbability } from './ConditionalProbability'
import { EmpiricalBayesPooling } from './EmpiricalBayesPooling'
import { NeighborDivergence } from './NeighborDivergence'
import { C2STMap } from './C2STMap'
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
                    "--sidebar-width": "15rem",
                    "--header-height": "calc(var(--spacing) * 12)",
                } as React.CSSProperties
            }
        >
            <AppSidebar variant="inset" currentPage={page} onPageChange={setPage} />
            <SidebarInset>
                <SiteHeader title={pageTitles[page]} />
                <div className="flex flex-1 flex-col overflow-hidden">
                    <div className="@container/main flex flex-1 flex-col min-h-0">
                        <div className={page === 'home' ? 'flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6' : 'hidden'}>
                            {/* Home page content */}
                        </div>
                        <div className={page === 'conditional-probability' ? 'flex flex-1 flex-col min-h-0' : 'hidden'}>
                            <ConditionalProbability />
                        </div>
                        <div className={page === 'empirical-bayes' ? 'flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6' : 'hidden'}>
                            <EmpiricalBayesPooling />
                        </div>
                        <div className={page === 'neighbor-divergence' ? 'flex flex-1 flex-col min-h-0' : 'hidden'}>
                            <NeighborDivergence />
                        </div>
                        <div className={page === 'c2st' ? 'flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6' : 'hidden'}>
                            <C2STMap />
                        </div>
                    </div>
                </div>
            </SidebarInset>
        </SidebarProvider>
    )
}
