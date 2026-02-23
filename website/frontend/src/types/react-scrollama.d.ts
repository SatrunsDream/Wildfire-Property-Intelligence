declare module 'react-scrollama' {
    import type { ReactNode } from 'react'

    export interface ScrollamaStepEvent {
        element: Element
        data: unknown
        direction: 'up' | 'down'
        entry: IntersectionObserverEntry
        progress?: number
    }

    export interface ScrollamaProps {
        offset?: number | string
        threshold?: number
        onStepEnter?: (event: ScrollamaStepEvent) => void
        onStepExit?: (event: ScrollamaStepEvent) => void
        onStepProgress?: (event: ScrollamaStepEvent) => void
        debug?: boolean
        children?: ReactNode
    }

    export interface StepProps {
        data?: unknown
        children: ReactNode
    }

    export const Scrollama: (props: ScrollamaProps) => ReactNode
    export const Step: (props: StepProps) => ReactNode
}
