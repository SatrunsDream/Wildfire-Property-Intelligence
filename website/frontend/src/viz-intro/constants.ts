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

/** Napa/Sonoma spotlight */
export const NAPA_FIPS = '06055'
export const SONOMA_FIPS = '06097'
export const SPOTLIGHT_CENTER: [number, number] = [-122.5, 38.35]
export const SPOTLIGHT_ZOOM = 8.5

/** Scene identifiers */
export type SceneId = 'hero' | 'counties' | 'spotlight'

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
