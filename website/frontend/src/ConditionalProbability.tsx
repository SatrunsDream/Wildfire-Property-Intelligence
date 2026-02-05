import { useRef } from 'react'
import { CaliforniaMap, type CaliforniaMapRef } from './CaliforniaMap'

const DEFAULT_CONTEXT_COLS = ['lc_type', 'fips']
const DEFAULT_TARGET = 'clr'
const DEFAULT_MIN_SUPPORT = 30

export function ConditionalProbability() {
    const mapRef = useRef<CaliforniaMapRef>(null)

    return (
        <div className="relative flex-1 min-h-0">
            {/* California Map - Full bleed */}
            <CaliforniaMap
                ref={mapRef}
                contextCols={DEFAULT_CONTEXT_COLS}
                target={DEFAULT_TARGET}
                minSupport={DEFAULT_MIN_SUPPORT}
                autoLoad={true}
                className="absolute inset-0 w-full h-full"
            />

            {/* Info badge showing defaults */}
            <div className="absolute top-3 right-3 z-20 bg-white/95 backdrop-blur-sm rounded-lg shadow-elevated px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Context:</span> Land Cover, County &nbsp;|&nbsp;
                <span className="font-medium text-foreground">Target:</span> Color &nbsp;|&nbsp;
                <span className="font-medium text-foreground">Min Support:</span> {DEFAULT_MIN_SUPPORT}
            </div>
        </div>
    )
}
