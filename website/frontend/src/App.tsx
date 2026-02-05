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
import { cn } from './lib/utils'
import { chartColors } from './lib/chart-colors'

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
            .attr('fill', chartColors.primary)

        svg.append('g')
            .attr('transform', `translate(0,${height})`)
            .call(d3.axisBottom(x).ticks(10))
            .attr('color', chartColors.axis)

        svg.append('g')
            .call(d3.axisLeft(y).ticks(5))
            .attr('color', chartColors.axis)

        svg.append('text')
            .attr('x', width / 2)
            .attr('y', height + 50)
            .attr('text-anchor', 'middle')
            .attr('fill', chartColors.text.muted)
            .style('font-size', '1rem')
            .text('Surprisal')

        svg.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('x', -height / 2)
            .attr('y', -50)
            .attr('text-anchor', 'middle')
            .attr('fill', chartColors.text.muted)
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

        // Sage-based color gradient for anomalies
        const colors = [chartColors.primary, chartColors.primaryLight, '#d4a574', '#c17f59', '#a85d3b']
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
            .attr('fill', chartColors.text.secondary)
            .style('font-size', '0.9rem')
            .text(d => (d.surprisal as number).toFixed(2))

        svg.append('g')
            .attr('transform', `translate(0,${height})`)
            .call(d3.axisBottom(x).tickFormat((_, i) => getLabel(topData[i])))
            .attr('color', chartColors.axis)
            .selectAll('text')
            .attr('transform', 'rotate(-45)')
            .attr('text-anchor', 'end')
            .attr('dx', '-0.5em')
            .attr('dy', '0.5em')
            .style('font-size', '0.85rem')

        svg.append('g')
            .call(d3.axisLeft(y).ticks(5))
            .attr('color', chartColors.axis)

        svg.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('x', -height / 2)
            .attr('y', -50)
            .attr('text-anchor', 'middle')
            .attr('fill', chartColors.text.muted)
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
        if (rating === 'no') return (
            <span className="text-xs px-2 py-1 rounded bg-red-50 border border-red-200 text-red-700 ml-3 uppercase tracking-wide">
                not recommended
            </span>
        )
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
        <div className="text-left">
            <h1 className="text-2xl font-medium uppercase tracking-[0.2em] text-center mb-2">
                Conditional Probability
            </h1>
            <p className="text-center text-muted-foreground text-lg mb-12">
                Score how surprising each value is given its context. High surprisal = potential anomaly.
            </p>

            {/* Configuration Section */}
            <div className="relative border border-border rounded p-6 mb-8">
                <span className="absolute -top-3 left-4 bg-background px-2 text-sm uppercase tracking-[0.15em] text-muted-foreground">
                    Configuration
                </span>
                <div className="flex flex-wrap gap-8 items-start">
                    <div className="flex flex-col gap-3">
                        <label className="text-sm uppercase tracking-wide text-muted-foreground">Context Columns</label>
                        <div className="flex gap-2 flex-wrap">
                            {availableForContext.map(col => (
                                <button
                                    key={col}
                                    className={cn(
                                        'px-5 py-2.5 rounded-sm border text-base transition-all duration-150',
                                        contextCols.includes(col)
                                            ? 'bg-sage-100 border-sage-500 text-foreground'
                                            : 'bg-transparent border-border text-muted-foreground hover:border-sage-400 hover:text-foreground',
                                        getContextBadge(col) === 'warn' && !contextCols.includes(col) && 'border-red-200 text-red-400'
                                    )}
                                    onClick={() => toggleContext(col)}
                                    title={columnMeta[col]?.reason}
                                >
                                    {columnMeta[col]?.label || col}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-col gap-3">
                        <label className="text-sm uppercase tracking-wide text-muted-foreground">Target Column</label>
                        <div>
                            <select
                                value={target}
                                onChange={e => selectTarget(e.target.value)}
                                className="px-5 py-2.5 rounded-sm border border-border bg-muted text-foreground text-base cursor-pointer focus:outline-none focus:border-sage-400"
                            >
                                {columns.map(col => (
                                    <option key={col} value={col}>
                                        {columnMeta[col]?.label || col}
                                    </option>
                                ))}
                            </select>
                            {getTargetBadge(target)}
                        </div>
                    </div>

                    <div className="flex flex-col gap-3">
                        <label className="text-sm uppercase tracking-wide text-muted-foreground">Min Support: {minSupport}</label>
                        <input
                            type="range"
                            min="1"
                            max="100"
                            value={minSupport}
                            onChange={e => setMinSupport(Number(e.target.value))}
                            className="w-36 accent-sage-500"
                        />
                    </div>

                    <div className="flex flex-col gap-3">
                        <label className="text-sm uppercase tracking-wide text-muted-foreground">&nbsp;</label>
                        <button
                            className={cn(
                                'px-7 py-2.5 bg-sage-500 border border-sage-600 rounded-sm text-white',
                                'text-base uppercase tracking-wide cursor-pointer transition-all duration-150',
                                'hover:bg-sage-600',
                                'disabled:opacity-40 disabled:cursor-not-allowed'
                            )}
                            onClick={runAnalysis}
                            disabled={loading || contextCols.length === 0}
                        >
                            {loading ? 'Running...' : 'Run'}
                        </button>
                    </div>
                </div>
            </div>

            {warnings.length > 0 && (
                <div className="mb-6">
                    {warnings.map((w, i) => (
                        <div key={i} className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-sm mb-2 text-amber-700 text-base">
                            {w}
                        </div>
                    ))}
                </div>
            )}

            {error && (
                <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-sm mb-6 text-red-600 text-base">
                    {error}
                </div>
            )}

            {result && (
                <>
                    {/* California Map Section */}
                    <div className="relative border border-border rounded p-6 mb-8">
                        <span className="absolute -top-3 left-4 bg-background px-2 text-sm uppercase tracking-[0.15em] text-muted-foreground">
                            California Map
                        </span>
                        <CaliforniaMap
                            ref={mapRef}
                            contextCols={contextCols}
                            target={target}
                            minSupport={minSupport}
                            autoLoad={true}
                        />
                    </div>

                    {/* Top Anomalies Section */}
                    <div className="relative border border-border rounded p-6 mb-8">
                        <span className="absolute -top-3 left-4 bg-background px-2 text-sm uppercase tracking-[0.15em] text-muted-foreground">
                            Top Anomalies
                        </span>
                        <p className="text-sm text-muted-foreground mb-4 italic">Click a card to fly to that location on the map</p>
                        <div className="grid grid-cols-5 gap-4">
                            {topAnomalies.map((row, i) => (
                                <div
                                    key={i}
                                    className="flex flex-col gap-1.5 p-3 bg-muted border border-border rounded cursor-pointer transition-all duration-150 hover:bg-sage-100 hover:border-sage-300 hover:-translate-y-0.5"
                                    onClick={() => handleAnomalyClick(row)}
                                >
                                    <div className="text-xs font-semibold text-sage-600">#{i + 1}</div>
                                    <div className="flex-1">
                                        <div className="mb-1">
                                            <span className="text-muted-foreground text-xs">{columnMeta[target]?.label || target}:</span>
                                            <span className="text-base font-medium text-foreground block">{row[target] as string}</span>
                                        </div>
                                        <div className="text-[0.7rem] text-muted-foreground mb-2 leading-tight">{formatContext(row)}</div>
                                        <div className="flex flex-wrap gap-2 text-[0.7rem] text-muted-foreground">
                                            <span>Count: <strong className="text-foreground">{row.count as number}</strong></span>
                                            <span>of {row.context_total as number}</span>
                                            <span className="text-amber-600">Surprisal: <strong>{(row.surprisal as number).toFixed(2)}</strong></span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Charts */}
                    <div className="flex flex-col items-center gap-12 my-12">
                        <div className="text-center">
                            <h3 className="mb-6 text-base font-medium text-muted-foreground uppercase tracking-wide">
                                Surprisal Distribution
                            </h3>
                            <SurprisalHistogram data={result.data} />
                        </div>
                        <div className="text-center">
                            <h3 className="mb-6 text-base font-medium text-muted-foreground uppercase tracking-wide">
                                Top 10 Anomalies
                            </h3>
                            <TopAnomaliesChart data={result.data} contextCols={contextCols} target={target} />
                        </div>
                    </div>

                    {/* Full Results Section */}
                    <div className="relative border border-border rounded p-6 mb-8">
                        <span className="absolute -top-3 left-4 bg-background px-2 text-sm uppercase tracking-[0.15em] text-muted-foreground">
                            Full Results
                        </span>

                        <div className="flex gap-12 mb-6 text-base">
                            <span className="text-muted-foreground">Alpha (EB): <strong className="text-foreground font-medium">{result.alpha.toFixed(3)}</strong></span>
                            <span className="text-muted-foreground">Combinations: <strong className="text-foreground font-medium">{result.total_rows.toLocaleString()}</strong></span>
                        </div>

                        <div className="overflow-x-auto border border-border rounded-sm">
                            <table className="w-full border-collapse text-base">
                                <thead>
                                    {table.getHeaderGroups().map(headerGroup => (
                                        <tr key={headerGroup.id}>
                                            {headerGroup.headers.map(header => (
                                                <th
                                                    key={header.id}
                                                    onClick={header.column.getToggleSortingHandler()}
                                                    className="px-5 py-3.5 text-left bg-muted font-medium text-sm uppercase tracking-wide text-muted-foreground sticky top-0 select-none cursor-pointer hover:text-foreground border-b border-border"
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
                                        <tr
                                            key={row.id}
                                            className={cn(
                                                'transition-colors duration-100 hover:bg-muted/50',
                                                !row.original.reliable && 'opacity-40'
                                            )}
                                        >
                                            {row.getVisibleCells().map(cell => (
                                                <td key={cell.id} className="px-5 py-3.5 text-left border-b border-border/50">
                                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex items-center gap-2 mt-6 justify-center">
                            <button
                                onClick={() => table.firstPage()}
                                disabled={!table.getCanPreviousPage()}
                                className="px-3.5 py-2 border border-border bg-transparent text-muted-foreground rounded-sm cursor-pointer text-base transition-all duration-150 hover:bg-muted hover:text-foreground hover:border-sage-300 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                {'<<'}
                            </button>
                            <button
                                onClick={() => table.previousPage()}
                                disabled={!table.getCanPreviousPage()}
                                className="px-3.5 py-2 border border-border bg-transparent text-muted-foreground rounded-sm cursor-pointer text-base transition-all duration-150 hover:bg-muted hover:text-foreground hover:border-sage-300 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                {'<'}
                            </button>
                            <span className="mx-4 text-muted-foreground text-base">
                                Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
                            </span>
                            <button
                                onClick={() => table.nextPage()}
                                disabled={!table.getCanNextPage()}
                                className="px-3.5 py-2 border border-border bg-transparent text-muted-foreground rounded-sm cursor-pointer text-base transition-all duration-150 hover:bg-muted hover:text-foreground hover:border-sage-300 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                {'>'}
                            </button>
                            <button
                                onClick={() => table.lastPage()}
                                disabled={!table.getCanNextPage()}
                                className="px-3.5 py-2 border border-border bg-transparent text-muted-foreground rounded-sm cursor-pointer text-base transition-all duration-150 hover:bg-muted hover:text-foreground hover:border-sage-300 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                {'>>'}
                            </button>
                            <select
                                value={table.getState().pagination.pageSize}
                                onChange={e => table.setPageSize(Number(e.target.value))}
                                className="ml-4 px-5 py-2 rounded-sm border border-border bg-muted text-foreground text-base cursor-pointer"
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
