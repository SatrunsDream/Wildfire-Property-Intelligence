import type maplibregl from 'maplibre-gl'

/** Map defaults */
export const MAP_CENTER: [number, number] = [-119.5, 37.0]
export const MAP_ZOOM = 5.5
/** Blank style — just a background color, no tiles. Counties render on top. */
export const MAP_STYLE: maplibregl.StyleSpecification = {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {},
    layers: [
        {
            id: 'background',
            type: 'background',
            paint: { 'background-color': '#fcfbf8' },
        },
    ],
}

/** San Diego regional case study — 4 counties */
export const SPOTLIGHT_FIPS = ['06025', '06059', '06065', '06073'] as const  // Imperial, Orange, Riverside, San Diego
export const SPOTLIGHT_FIPS_A = '06059'  // Orange (legacy)
export const SPOTLIGHT_FIPS_B = '06073'  // San Diego (legacy)
export const SPOTLIGHT_CENTER: [number, number] = [-116.5, 33.2]
export const SPOTLIGHT_ZOOM = 7.5

/** Scene identifiers */
export type SceneId = 'hero' | 'counties' | 'spotlight' | 'distributions'

/** Color ramp for divergence choropleth (Viridis) */
export const DIVERGENCE_STOPS: [number, string][] = [
    [0.0, '#fde725'],
    [0.3, '#5ec962'],
    [0.5, '#21918c'],
    [0.7, '#3b528b'],
    [1.0, '#440154'],
]

/** Uniform county fill for Scene 2 */
export const UNIFORM_FILL = '#b5de2b'

/** Source / layer IDs */
export const COUNTY_SOURCE = 'intro-counties'
export const COUNTY_FILL_LAYER = 'intro-counties-fill'
export const COUNTY_OUTLINE_LAYER = 'intro-counties-outline'
