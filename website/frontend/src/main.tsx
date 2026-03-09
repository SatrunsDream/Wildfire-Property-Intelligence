import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from 'next-themes'
import './index.css'
import { Router } from './Router.tsx'
import { VizIntroduction } from './VizIntroduction.tsx'

const normalizedPath = window.location.pathname.replace(/\/+$/, '') || '/'
const isVizRoute = normalizedPath === '/viz'

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
            {isVizRoute ? <VizIntroduction /> : <Router />}
        </ThemeProvider>
    </StrictMode>,
)
