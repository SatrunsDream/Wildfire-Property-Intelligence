import { useState, useEffect, useMemo, useRef } from 'react'
import {
    useReactTable,
    getCoreRowModel,
    getSortedRowModel,
    getPaginationRowModel,
    flexRender
} from '@tanstack/react-table'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import * as d3 from 'd3'
import { CaliforniaMap, type CaliforniaMapRef } from './CaliforniaMap'
import './App.css'

const API_URL = 'http://localhost:8000'

interface ColumnMeta {
    label: string
    as_target: 'yes' | 'no'
    as_context: 'yes' | 'no'
    reason: string
}

interface ProbRow {
    [key: string]: string | number | boolean
}

interface AnalysisResult {
    alpha: number
    total_rows: number
    data: ProbRow[]
}

function SurprisalHistogram({ data }: { data: ProbRow[] }) {
    const svgRef = useRef<SVGSVGElement>(null)

    useEffect(() => {
        if (!svgRef.current || data.length === 0) return

        const margin = { top: 30, right: 40, bottom: 60, left: 70 }
        const width = 700 - margin.left - margin.right
        const height = 400 - margin.top - margin.bottom

        d3.select(svgRef.current).selectAll('*').remove()

        const svg = d3.select(svgRef.current)
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom)
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`)

        const surprisals = data.map(d => d.surprisal as number).filter(s => s !== undefined)

        const x = d3.scaleLinear()
            .domain([0, d3.max(surprisals) || 10])
            .range([0, width])

        const histogram = d3.bin()
            .domain(x.domain() as [number, number])
            .thresholds(x.ticks(20))

        const bins = histogram(surprisals)

        const y = d3.scaleLinear()
            .domain([0, d3.max(bins, d => d.length) || 0])
            .range([height, 0])

        svg.selectAll('rect')
            .data(bins)
            .join('rect')
            .attr('x', d => x(d.x0 || 0) + 1)
            .attr('width', d => Math.max(0, x(d.x1 || 0) - x(d.x0 || 0) - 2))
            .attr('y', d => y(d.length))
            .attr('height', d => height - y(d.length))
            .attr('fill', '#a805fb')

        svg.append('g')
            .attr('transform', `translate(0,${height})`)
            .call(d3.axisBottom(x).ticks(10))
            .attr('color', '#888')

        svg.append('g')
            .call(d3.axisLeft(y).ticks(5))
            .attr('color', '#888')

        svg.append('text')
            .attr('x', width / 2)
            .attr('y', height + 50)
            .attr('text-anchor', 'middle')
            .attr('fill', '#888')
            .style('font-size', '1rem')
            .text('Surprisal')

        svg.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('x', -height / 2)
            .attr('y', -50)
            .attr('text-anchor', 'middle')
            .attr('fill', '#888')
            .style('font-size', '1rem')
            .text('Count')

    }, [data])

    return <svg ref={svgRef}></svg>
}

function TopAnomaliesChart({ data, contextCols, target }: { data: ProbRow[], contextCols: string[], target: string }) {
    const svgRef = useRef<SVGSVGElement>(null)

    useEffect(() => {
        if (!svgRef.current || data.length === 0) return

        const margin = { top: 30, right: 40, bottom: 200, left: 70 }
        const width = 900 - margin.left - margin.right
        const height = 550 - margin.top - margin.bottom

        d3.select(svgRef.current).selectAll('*').remove()

        const svg = d3.select(svgRef.current)
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom)
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`)

        const topData = data
            .filter(d => d.reliable)
            .slice(0, 10)

        const getLabel = (d: ProbRow) => {
            const ctx = contextCols.map(c => d[c]).join(' / ')
            return `${ctx} → ${d[target]}`
        }

        const x = d3.scaleBand()
            .domain(topData.map((_, i) => i.toString()))
            .range([0, width])
            .padding(0.2)

        const y = d3.scaleLinear()
            .domain([0, d3.max(topData, d => d.surprisal as number) || 10])
            .range([height, 0])

        const colors = ['#ffcd2e', '#ff8e65', '#ff6e80', '#dd37d2', '#a805fb']
        const colorScale = d3.scaleQuantize<string>()
            .domain([d3.min(topData, d => d.surprisal as number) || 0, d3.max(topData, d => d.surprisal as number) || 10])
            .range(colors)

        svg.selectAll('rect')
            .data(topData)
            .join('rect')
            .attr('x', (_, i) => x(i.toString()) || 0)
            .attr('width', x.bandwidth())
            .attr('y', d => y(d.surprisal as number))
            .attr('height', d => height - y(d.surprisal as number))
            .attr('fill', d => colorScale(d.surprisal as number))
            .attr('rx', 2)

        svg.selectAll('.bar-label')
            .data(topData)
            .join('text')
            .attr('class', 'bar-label')
            .attr('x', (_, i) => (x(i.toString()) || 0) + x.bandwidth() / 2)
            .attr('y', d => y(d.surprisal as number) - 8)
            .attr('text-anchor', 'middle')
            .attr('fill', '#ccc')
            .style('font-size', '0.9rem')
            .text(d => (d.surprisal as number).toFixed(2))

        svg.append('g')
            .attr('transform', `translate(0,${height})`)
            .call(d3.axisBottom(x).tickFormat((_, i) => getLabel(topData[i])))
            .attr('color', '#888')
            .selectAll('text')
            .attr('transform', 'rotate(-45)')
            .attr('text-anchor', 'end')
            .attr('dx', '-0.5em')
            .attr('dy', '0.5em')
            .style('font-size', '0.85rem')

        svg.append('g')
            .call(d3.axisLeft(y).ticks(5))
            .attr('color', '#888')

        svg.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('x', -height / 2)
            .attr('y', -50)
            .attr('text-anchor', 'middle')
            .attr('fill', '#888')
            .style('font-size', '1rem')
            .text('Surprisal')

    }, [data, contextCols, target])

    return <svg ref={svgRef}></svg>
}

function App() {
    const [columns, setColumns] = useState<string[]>([])
    const [columnMeta, setColumnMeta] = useState<Record<string, ColumnMeta>>({})
    const [contextCols, setContextCols] = useState<string[]>(['lc_type', 'fips'])
    const [target, setTarget] = useState<string>('clr')
    const [minSupport, setMinSupport] = useState<number>(30)
    const [result, setResult] = useState<AnalysisResult | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [sorting, setSorting] = useState<SortingState>([])
    const mapRef = useRef<CaliforniaMapRef>(null)

    useEffect(() => {
        fetch(`${API_URL}/columns`)
            .then((res) => res.json())
            .then((data) => {
                setColumns(data.columns)
                setColumnMeta(data.meta)
            })
            .catch((err) => console.error('Failed to fetch columns:', err))
    }, [])

    const runAnalysis = async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await fetch(`${API_URL}/analyze/conditional-probability`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    context_cols: contextCols,
                    target: target,
                    min_support: minSupport
                })
            })
            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.detail || 'Analysis failed')
            }
            const data = await res.json()
            setResult(data)
            setSorting([{ id: 'surprisal', desc: true }])
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error')
        } finally {
            setLoading(false)
        }
    }

    const toggleContext = (col: string) => {
        if (contextCols.includes(col)) {
            setContextCols(contextCols.filter(c => c !== col))
        } else if (col !== target) {
            setContextCols([...contextCols, col])
        }
    }

    const selectTarget = (col: string) => {
        setTarget(col)
        setContextCols(contextCols.filter(c => c !== col))
    }

    const warnings = useMemo(() => {
        const w: string[] = []
        const targetMeta = columnMeta[target]
        if (targetMeta?.as_target === 'no') {
            w.push(`"${targetMeta.label}" is not recommended as a target: ${targetMeta.reason}`)
        }
        for (const col of contextCols) {
            const meta = columnMeta[col]
            if (meta?.as_context === 'no') {
                w.push(`"${meta.label}" is not recommended as context: ${meta.reason}`)
            }
        }
        return w
    }, [target, contextCols, columnMeta])

    const topAnomalies = useMemo(() => {
        if (!result?.data) return []
        return result.data
            .filter(d => d.reliable)
            .slice(0, 10)
    }, [result])

    const availableForContext = columns.filter(c => c !== target)

    const tableColumns = useMemo<ColumnDef<ProbRow>[]>(() => {
        if (!result?.data[0]) return []
        const displayKeys = Object.keys(result.data[0]).filter(k => !['p_global'].includes(k))
        return displayKeys.map(key => ({
            accessorKey: key,
            header: key,
            cell: info => {
                const val = info.getValue()
                if (typeof val === 'number') return val.toFixed(4)
                if (typeof val === 'boolean') return val ? 'Yes' : 'No'
                return val as string
            },
            sortingFn: typeof result.data[0][key] === 'number' ? 'basic' : 'alphanumeric'
        }))
    }, [result])

    const table = useReactTable({
        data: result?.data ?? [],
        columns: tableColumns,
        state: { sorting },
        onSortingChange: setSorting,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        initialState: { pagination: { pageSize: 50 } }
    })

    const getTargetBadge = (col: string) => {
        const rating = columnMeta[col]?.as_target
        if (rating === 'no') return <span className="badge no">not recommended</span>
        return null
    }

    const getContextBadge = (col: string) => {
        const rating = columnMeta[col]?.as_context
        if (rating === 'no') return 'warn'
        return ''
    }

    const formatContext = (row: ProbRow) => {
        return contextCols.map(c => {
            const label = columnMeta[c]?.label || c
            return `${label}: ${row[c]}`
        }).join(', ')
    }

    const handleAnomalyClick = (row: ProbRow) => {
        if (!mapRef.current) return

        const sampleH3 = row.sample_h3 as string | undefined
        if (sampleH3) {
            mapRef.current.flyToH3(sampleH3)
            return
        }

        const fips = row.fips as number | string | undefined
        if (fips) {
            const fipsStr = String(fips).padStart(5, '0')
            mapRef.current.flyToCounty(fipsStr)
        }
    }

    return (
        <div className="app">
            <h1>Conditional Probability</h1>
            <p className="subtitle">
                Score how surprising each value is given its context. High surprisal = potential anomaly.
            </p>

            <div className="section">
                <span className="section-title">Configuration</span>
                <div className="controls">
                    <div className="control-group">
                        <label>Context Columns</label>
                        <div className="chips">
                            {availableForContext.map(col => (
                                <button
                                    key={col}
                                    className={`chip ${contextCols.includes(col) ? 'selected' : ''} ${getContextBadge(col)}`}
                                    onClick={() => toggleContext(col)}
                                    title={columnMeta[col]?.reason}
                                >
                                    {columnMeta[col]?.label || col}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="control-group">
                        <label>Target Column</label>
                        <div>
                            <select value={target} onChange={e => selectTarget(e.target.value)}>
                                {columns.map(col => (
                                    <option key={col} value={col}>
                                        {columnMeta[col]?.label || col}
                                    </option>
                                ))}
                            </select>
                            {getTargetBadge(target)}
                        </div>
                    </div>

                    <div className="control-group">
                        <label>Min Support: {minSupport}</label>
                        <input
                            type="range"
                            min="1"
                            max="100"
                            value={minSupport}
                            onChange={e => setMinSupport(Number(e.target.value))}
                        />
                    </div>

                    <div className="control-group">
                        <label>&nbsp;</label>
                        <button className="run-btn" onClick={runAnalysis} disabled={loading || contextCols.length === 0}>
                            {loading ? 'Running...' : 'Run'}
                        </button>
                    </div>
                </div>
            </div>

            {warnings.length > 0 && (
                <div className="warnings">
                    {warnings.map((w, i) => <div key={i} className="warning">{w}</div>)}
                </div>
            )}

            {error && <div className="error">{error}</div>}

            {result && (
                <>
                    <div className="section">
                        <span className="section-title">California Map</span>
                        <CaliforniaMap
                            ref={mapRef}
                            contextCols={contextCols}
                            target={target}
                            minSupport={minSupport}
                            autoLoad={true}
                        />
                    </div>

                    <div className="section">
                        <span className="section-title">Top Anomalies</span>
                        <p className="section-hint">Click a card to fly to that location on the map</p>
                        <div className="anomaly-cards">
                            {topAnomalies.map((row, i) => (
                                <div key={i} className="anomaly-card clickable" onClick={() => handleAnomalyClick(row)}>
                                    <div className="anomaly-rank">#{i + 1}</div>
                                    <div className="anomaly-content">
                                        <div className="anomaly-target">
                                            <span className="anomaly-label">{columnMeta[target]?.label || target}:</span>
                                            <span className="anomaly-value">{row[target] as string}</span>
                                        </div>
                                        <div className="anomaly-context">{formatContext(row)}</div>
                                        <div className="anomaly-stats">
                                            <span>Count: <strong>{row.count as number}</strong></span>
                                            <span>of {row.context_total as number}</span>
                                            <span className="anomaly-surprisal">Surprisal: <strong>{(row.surprisal as number).toFixed(2)}</strong></span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="charts">
                        <div className="chart">
                            <h3>Surprisal Distribution</h3>
                            <SurprisalHistogram data={result.data} />
                        </div>
                        <div className="chart">
                            <h3>Top 10 Anomalies</h3>
                            <TopAnomaliesChart data={result.data} contextCols={contextCols} target={target} />
                        </div>
                    </div>

                    <div className="section">
                        <span className="section-title">Full Results</span>

                        <div className="stats">
                            <span>Alpha (EB): <strong>{result.alpha.toFixed(3)}</strong></span>
                            <span>Combinations: <strong>{result.total_rows.toLocaleString()}</strong></span>
                        </div>

                        <div className="table-container">
                            <table>
                                <thead>
                                    {table.getHeaderGroups().map(headerGroup => (
                                        <tr key={headerGroup.id}>
                                            {headerGroup.headers.map(header => (
                                                <th
                                                    key={header.id}
                                                    onClick={header.column.getToggleSortingHandler()}
                                                >
                                                    {flexRender(header.column.columnDef.header, header.getContext())}
                                                    {{
                                                        asc: ' ↑',
                                                        desc: ' ↓'
                                                    }[header.column.getIsSorted() as string] ?? ''}
                                                </th>
                                            ))}
                                        </tr>
                                    ))}
                                </thead>
                                <tbody>
                                    {table.getRowModel().rows.map(row => (
                                        <tr key={row.id} className={row.original.reliable ? '' : 'unreliable'}>
                                            {row.getVisibleCells().map(cell => (
                                                <td key={cell.id}>
                                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="pagination">
                            <button onClick={() => table.firstPage()} disabled={!table.getCanPreviousPage()}>{'<<'}</button>
                            <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>{'<'}</button>
                            <span>Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}</span>
                            <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>{'>'}</button>
                            <button onClick={() => table.lastPage()} disabled={!table.getCanNextPage()}>{'>>'}</button>
                            <select
                                value={table.getState().pagination.pageSize}
                                onChange={e => table.setPageSize(Number(e.target.value))}
                            >
                                {[25, 50, 100, 200].map(size => (
                                    <option key={size} value={size}>{size} rows</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}

export default App
