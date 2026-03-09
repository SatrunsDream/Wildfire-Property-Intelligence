import { useState, useEffect } from 'react'
import { HomePage } from './HomePage'
import { ConditionalProbability } from './ConditionalProbability'
import { EmpiricalBayesPooling } from './EmpiricalBayesPooling'
import { NeighborDivergence } from './NeighborDivergence'
import { C2STMap } from './C2STMap'
import { MoransIMap } from './MoransIMap'
import GroupDivergence from './GroupDivergence'
import { ColorMap } from './ColorMap'
import { AppSidebar, type Page } from './components/app-sidebar'
import { SiteHeader } from './components/site-header'
import { SidebarInset, SidebarProvider } from './components/ui/sidebar'

const pageTitles: Record<Page, string> = {
    'home': 'Home',
    'conditional-probability': 'Conditional Pooling',
    'empirical-bayes': 'Empirical Bayes Pooling',
    'neighbor-divergence': 'Neighbor Divergence',
    'c2st': 'C2ST',
    'morans-i': "Moran's I",
    'group-divergence': 'Group-Level Divergence',
    'color-map': 'Color Distribution Map',
}

function getPdfHashPage(): Page | null {
    const hash = window.location.hash?.replace('#', '')
    if (hash === 'poster' || hash === 'paper') return 'home'
    return null
}

export function Router() {
    const [page, setPage] = useState<Page>('home')

    useEffect(() => {
        if (getPdfHashPage()) setPage('home')
        const handleHashChange = () => {
            if (getPdfHashPage()) setPage('home')
        }
        window.addEventListener('hashchange', handleHashChange)
        return () => window.removeEventListener('hashchange', handleHashChange)
    }, [])

    useEffect(() => {
        document.title = `Wildfire Property Intelligence | ${pageTitles[page]}`
    }, [page])

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
                        <div className={page === 'home' ? 'overflow-y-auto px-4 lg:px-8' : 'hidden'}>
                            <HomePage onPageChange={setPage} />
                        </div>
                        <div className={page === 'conditional-probability' ? 'flex flex-1 flex-col min-h-0' : 'hidden'}>
                            <ConditionalProbability />
                        </div>
                        <div className={page === 'empirical-bayes' ? 'flex flex-1 flex-col min-h-0' : 'hidden'}>
                            <EmpiricalBayesPooling />
                        </div>
                        <div className={page === 'neighbor-divergence' ? 'flex flex-1 flex-col min-h-0' : 'hidden'}>
                            <NeighborDivergence />
                        </div>
                        <div className={page === 'c2st' ? 'flex flex-1 flex-col min-h-0' : 'hidden'}>
                            <C2STMap />
                        </div>
                        <div className={page === 'morans-i' ? 'flex flex-1 flex-col min-h-0' : 'hidden'}>
                            <MoransIMap />
                        </div>
                        <div className={page === 'group-divergence' ? 'flex flex-1 flex-col min-h-0' : 'hidden'}>
                            <GroupDivergence />
                        </div>
                        <div className={page === 'color-map' ? 'flex flex-1 flex-col min-h-0' : 'hidden'}>
                            <ColorMap />
                        </div>
                    </div>
                </div>
            </SidebarInset>
        </SidebarProvider>
    )
}
