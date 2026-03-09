import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import * as h3lib from 'h3-js'

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json'

const COLOR_HEX: Record<string, string> = {
  alabaster: '#9a9a90',
  amber: '#d4a000',
  aqua: '#0097a7',
  aquamarine: '#3db896',
  auburn: '#a52a2a',
  azure: '#2e6fdc',
  bar: '#808060',
  beige: '#b89870',
  blue: '#2980b9',
  brown: '#7b3a1e',
  cocoa: '#8c5c3e',
  coffee: '#6b4226',
  crimson: '#dc143c',
  emerald: '#1a7a3a',
  foo: '#e07070',
  gold: '#c8a800',
  gray: '#808080',
  green: '#1e9a50',
  grey: '#6e6e6e',
  indigo: '#5b2d9e',
  ivory: '#a0a08a',
  lavender: '#9370b8',
  lemon: '#c0b800',
  lilac: '#b08ccc',
  maroon: '#7a1a1a',
  navy: '#1a3a7a',
  olive: '#6b7a00',
  orange: '#c86010',
  plum: '#7a1a5a',
  purple: '#7d3fb5',
  red: '#c0392b',
  sage: '#7d9060',
  scarlet: '#e8240a',
  sienna: '#9a4820',
  tan: '#c8a878',
  terracotta: '#b85c38',
  verde: '#2e8a55',
  yellow: '#c8a800',
}

function zoomToRes(zoom: number): number {
  if (zoom < 5.5) return 5
  if (zoom < 7.0) return 6
  if (zoom < 8.5) return 7
  if (zoom < 10.5) return 8
  return 9
}

type TopColor = [number, number]
type Cell = [string, number, number, number, number, number, TopColor[]]

interface HexData {
  clr_labels: string[]
  lc_labels: string[]
  cells: Cell[]
}

function buildGeoJSON(
  data: HexData,
  lcFilter: string,
  targetRes: number,
  bounds: maplibregl.LngLatBounds | null,
): GeoJSON.FeatureCollection {
  const { clr_labels, lc_labels, cells } = data

  const aggMap = new Map<string, { clrTotals: Map<number, number>; lc: number; total: number }>()

  for (const [h3id, clrIdx, lcIdx, total, lon, lat] of cells) {
    if (lcFilter && lc_labels[lcIdx] !== lcFilter) continue

    if (targetRes === 9 && bounds) {
      if (lon < bounds.getWest() || lon > bounds.getEast() ||
        lat < bounds.getSouth() || lat > bounds.getNorth()) continue
    }

    const parentId = targetRes === 9 ? h3id : h3lib.cellToParent(h3id, targetRes)
    if (!parentId) continue

    let agg = aggMap.get(parentId)
    if (!agg) {
      agg = { clrTotals: new Map(), lc: lcIdx, total: 0 }
      aggMap.set(parentId, agg)
    }
    agg.total += total
    agg.clrTotals.set(clrIdx, (agg.clrTotals.get(clrIdx) ?? 0) + total)
  }

  const features: GeoJSON.Feature[] = []

  for (const [cellId, agg] of aggMap) {
    let maxCount = 0
    let dominantClrIdx = 0
    for (const [ci, count] of agg.clrTotals) {
      if (count > maxCount) { maxCount = count; dominantClrIdx = ci }
    }

    const clrName = clr_labels[dominantClrIdx]
    const hex = COLOR_HEX[clrName] ?? '#888888'

    let boundary: [number, number][]
    try {
      boundary = h3lib.cellToBoundary(cellId).map(([lat, lng]) => [lng, lat])
    } catch {
      continue
    }
    boundary.push(boundary[0])

    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [boundary] },
      properties: {
        h3: cellId,
        clr: clrName,
        hex,
        lc: lc_labels[agg.lc],
        total: agg.total,
        res: targetRes,
      },
    })
  }

  return { type: 'FeatureCollection', features }
}

export function ColorMap() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const popup = useRef<maplibregl.Popup | null>(null)
  const dataRef = useRef<HexData | null>(null)
  const geoCache = useRef<Map<string, GeoJSON.FeatureCollection>>(new Map())

  const [loading, setLoading] = useState(true)
  const [loadingMsg, setLoadingMsg] = useState('Downloading hex data…')
  const [layerLoading, setLayerLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isMapReady, setIsMapReady] = useState(false)
  const [dataReady, setDataReady] = useState(false)

  const [lcTypes, setLcTypes] = useState<string[]>([])
  const [selectedLc, setSelectedLc] = useState('')
  const [currentRes, setCurrentRes] = useState(6)
  const [stats, setStats] = useState<{ cells: number; res: number } | null>(null)

  const selectedLcRef = useRef('')
  useEffect(() => { selectedLcRef.current = selectedLc }, [selectedLc])

  useEffect(() => {
    fetch('/data/h3-color-cells.json')
      .then(r => r.json())
      .then((data: HexData) => {
        dataRef.current = data
        setLcTypes(data.lc_labels)
        setDataReady(true)
        setLoadingMsg('')
      })
      .catch(err => { setError(`Failed to load: ${err.message}`); setLoading(false) })
  }, [])

  useEffect(() => {
    if (!mapContainer.current || map.current) return
    const isMobile = window.innerWidth < 640
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_STYLE,
      center: [-119.5, 37.0],
      zoom: isMobile ? 4.5 : 5.5,
    })
    map.current.addControl(new maplibregl.NavigationControl(), 'top-right')
    popup.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, maxWidth: '260px' })
    map.current.once('load', () => setIsMapReady(true))
    map.current.on('error', () => setError('Map error'))
    return () => { map.current?.remove(); map.current = null }
  }, [])

  const updateLayer = useCallback((res: number, lcFilter: string, bounds: maplibregl.LngLatBounds | null) => {
    if (!map.current || !dataRef.current) return

    const cacheKey = `${res}|${lcFilter}|${res === 9 ? JSON.stringify(bounds?.toArray()) : ''}`
    let geo = geoCache.current.get(cacheKey)

    if (!geo) {
      geo = buildGeoJSON(dataRef.current, lcFilter, res, res === 9 ? bounds : null)
      if (res < 9) geoCache.current.set(cacheKey, geo)
    }

    setStats({ cells: geo.features.length, res })
    setCurrentRes(res)

    const src = map.current.getSource('hexcells') as maplibregl.GeoJSONSource | undefined
    if (src) {
      src.setData(geo)
    } else {
      map.current.addSource('hexcells', { type: 'geojson', data: geo, promoteId: 'h3' })
      map.current.addLayer({
        id: 'hexcells-fill',
        type: 'fill',
        source: 'hexcells',
        paint: {
          'fill-color': ['get', 'hex'],
          'fill-opacity': 0.78,
        },
      })
      map.current.addLayer({
        id: 'hexcells-outline',
        type: 'line',
        source: 'hexcells',
        paint: {
          'line-color': 'rgba(0,0,0,0.25)',
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            5, 0.3,
            9, 0.7,
            12, 1.2,
          ],
        },
      })

      map.current.on('mousemove', 'hexcells-fill', (e: any) => {
        if (!e.features?.length) return
        map.current!.getCanvas().style.cursor = 'pointer'
        const p = e.features[0].properties as any
        popup.current!
          .setLngLat(e.lngLat)
          .setHTML(popupHtml(p))
          .addTo(map.current!)
      })
      map.current.on('mouseleave', 'hexcells-fill', () => {
        map.current!.getCanvas().style.cursor = ''
        popup.current!.remove()
      })
    }

    setLayerLoading(false)
    setLoading(false)
  }, [])

  const refresh = useCallback(() => {
    if (!map.current || !dataRef.current) return
    const zoom = map.current.getZoom()
    const res = zoomToRes(zoom)
    const bounds = res === 9 ? map.current.getBounds() : null
    setLayerLoading(true)
    setTimeout(() => updateLayer(res, selectedLcRef.current, bounds), 0)
  }, [updateLayer])

  useEffect(() => {
    if (!dataReady || !isMapReady) return
    refresh()
  }, [dataReady, isMapReady, refresh])

  useEffect(() => {
    if (!isMapReady || !map.current) return
    let lastRes = zoomToRes(map.current.getZoom())

    const onZoomEnd = () => {
      const newRes = zoomToRes(map.current!.getZoom())
      if (newRes !== lastRes) {
        lastRes = newRes
        refresh()
      } else if (newRes === 9) {
        refresh()
      }
    }
    const onMoveEnd = () => {
      if (zoomToRes(map.current!.getZoom()) === 9) refresh()
    }

    map.current.on('zoomend', onZoomEnd)
    map.current.on('moveend', onMoveEnd)
    return () => {
      map.current?.off('zoomend', onZoomEnd)
      map.current?.off('moveend', onMoveEnd)
    }
  }, [isMapReady, refresh])

  const isFirst = useRef(true)
  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return }
    geoCache.current.clear()
    refresh()
  }, [selectedLc, refresh])

  return (
    <div className="relative flex-1 min-h-0">
      <div className="absolute inset-0">
        <div ref={mapContainer} className="w-full h-full" />

        {/* Full-screen loading */}
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 z-20 gap-3">
            <div className="w-8 h-8 border-2 border-sage-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-muted-foreground">{loadingMsg || 'Building hexagons…'}</span>
          </div>
        )}

        {/* Layer-update spinner */}
        {!loading && layerLoading && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 bg-background/80 rounded-full p-3 shadow">
            <div className="w-5 h-5 border-2 border-sage-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="absolute top-2.5 left-1/2 -translate-x-1/2 px-4 py-2 bg-red-50 border border-red-200 rounded text-red-600 text-sm z-10">
            {error}
          </div>
        )}

        {/* Controls */}
        <div className="absolute top-2.5 left-2.5 flex flex-col gap-2 bg-card/95 rounded p-2 sm:p-3 shadow-elevated z-10 w-40 sm:w-52">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Landcover</span>
            <select
              value={selectedLc}
              onChange={e => setSelectedLc(e.target.value)}
              className="px-3 py-1.5 text-xs border border-border rounded bg-background cursor-pointer focus:outline-none focus:border-sage-400"
            >
              <option value="">All Types</option>
              {lcTypes.map(lc => <option key={lc} value={lc}>{lc}</option>)}
            </select>
          </div>

          {stats && (
            <div className="pt-2 border-t border-border">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Map info</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                <span className="text-muted-foreground">H3 resolution:</span>
                <span className="font-semibold">{stats.res}</span>
                <span className="text-muted-foreground">Hexagons:</span>
                <span className="font-semibold">{stats.cells.toLocaleString()}</span>
              </div>
              <div className="mt-1.5 text-[10px] text-muted-foreground">
                {currentRes < 9 ? 'Zoom in for finer detail' : 'At max resolution (lvl 9)'}
              </div>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="absolute right-2.5 bottom-20 sm:bottom-24 bg-card/95 p-2 sm:p-3 rounded shadow-elevated text-xs z-10 max-h-48 sm:max-h-72 overflow-y-auto w-28 sm:w-36">
          <div className="font-semibold mb-1 sm:mb-2 text-foreground text-[10px] sm:text-xs">Dominant color</div>
          <div className="flex flex-col gap-1">
            {Object.entries(COLOR_HEX).sort(([a], [b]) => a.localeCompare(b)).map(([name, hex]) => (
              <div key={name} className="flex items-center gap-1.5">
                <div className="w-3 h-3 flex-shrink-0 border border-black/10" style={{ background: hex, clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }} />
                <span className="text-muted-foreground capitalize">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function popupHtml(p: { clr: string; hex: string; lc: string; total: number; h3: string; res: number }) {
  return `
        <div style="font-size:12px;line-height:1.6">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                <div style="width:16px;height:16px;background:${p.hex};border:1px solid rgba(0,0,0,.15);
                     clip-path:polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%);flex-shrink:0"></div>
                <strong style="text-transform:capitalize;font-size:13px">${p.clr}</strong>
            </div>
            <div style="display:grid;grid-template-columns:auto 1fr;gap:1px 10px;font-size:11px">
                <span style="color:#888">Landcover:</span><span>${p.lc}</span>
                <span style="color:#888">Buildings:</span><span style="font-weight:600">${Number(p.total).toLocaleString()}</span>
                <span style="color:#888">H3 res:</span><span>${p.res}</span>
            </div>
            <div style="margin-top:6px;font-size:10px;color:#bbb;font-family:monospace">${p.h3}</div>
        </div>`
}
