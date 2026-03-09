import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'

interface TreeNode {
    name: string
    value?: number
    children?: TreeNode[]
}

/** Map color names to hex for nodes and branches */
const COLOR_MAP: Record<string, string> = {
    red: '#c0392b',
    scarlet: '#e74c3c',
    crimson: '#922b21',
    purple: '#8e44ad',
    azure: '#3498db',
    blue: '#2980b9',
    indigo: '#4a69bd',
    foo: '#95a5a6',
    navy: '#1a237e',
    lavender: '#e1bee7',
    lilac: '#ce93d8',
    aqua: '#00bcd4',
    aquamarine: '#64ffda',
    cocoa: '#5d4037',
    brown: '#795548',
    coffee: '#3e2723',
    beige: '#d7ccc8',
    olive: '#558b2f',
    green: '#388e3c',
    sage: '#9e9d24',
    verde: '#689f38',
    alabaster: '#fafafa',
    gray: '#9e9e9e',
    grey: '#757575',
    ivory: '#fffff0',
    amber: '#ffc107',
    gold: '#ffd700',
    lemon: '#fff44f',
    yellow: '#f9a825',
    orange: '#e65100',
    terracotta: '#bf360c',
    sienna: '#a1887f',
}

/** Top-level group colors for branches and internal nodes */
const GROUP_COLORS: Record<string, string> = {
    RED: '#c0392b',
    NAVY: '#1a237e',
    COCOA: '#6d4c41',
    OLIVE: '#558b2f',
    ALABASTER: '#78909c',
    AMBER: '#ffb300',
    ORANGE: '#e65100',
}

function getNodeColor(node: d3.HierarchyPointNode<TreeNode>): string {
    const name = (node.data as TreeNode).name
    return COLOR_MAP[name.toLowerCase()] ?? GROUP_COLORS[name] ?? '#94a3b8'
}

function getGroupColor(node: d3.HierarchyPointNode<TreeNode>): string {
    let n: d3.HierarchyPointNode<TreeNode> | null = node
    while (n) {
        const name = (n.data as TreeNode).name
        if (GROUP_COLORS[name]) return GROUP_COLORS[name]
        n = n.parent
    }
    return '#94a3b8'
}

const WIDTH = 960
const HEIGHT = 400
const NODE_RADIUS = 4
const FOCUS_DURATION = 750

export function ColorPoolDendrogram() {
    const svgRef = useRef<SVGSVGElement>(null)
    const [data, setData] = useState<{ name: string; children?: TreeNode[] } | null>(null)

    useEffect(() => {
        fetch('/data/color-pool-merge-tree.json')
            .then((r) => r.json())
            .then(setData)
            .catch((e) => console.error('Failed to load merge tree', e))
    }, [])

    useEffect(() => {
        if (!data || !svgRef.current) return

        const root = d3.hierarchy(data) as d3.HierarchyPointNode<TreeNode>
        root.each((d) => {
            d.data as TreeNode & { depth?: number }
        })

        const cluster = d3.cluster<TreeNode>().size([HEIGHT - 80, WIDTH - 120])
        cluster(root)

        const svg = d3.select(svgRef.current)
        svg.selectAll('*').remove()

        svg.append('rect')
            .attr('width', '100%')
            .attr('height', '100%')
            .attr('fill', 'transparent')
            .style('cursor', 'grab')

        const g = svg.append('g')

        const link = g
            .selectAll('.link')
            .data(root.links())
            .join('path')
            .attr('class', 'link')
            .attr('fill', 'none')
            .attr('stroke', (d) => getGroupColor(d.target))
            .attr('stroke-width', 2)
            .attr(
                'd',
                d3
                    .linkHorizontal<d3.HierarchyPointLink<TreeNode>, d3.HierarchyPointNode<TreeNode>>()
                    .x((d) => d.y)
                    .y((d) => d.x)
            )
            .style('cursor', 'pointer')

        const node = g
            .selectAll('.node')
            .data(root.descendants())
            .join('g')
            .attr('class', 'node')
            .attr('transform', (d) => `translate(${d.y},${d.x})`)
            .style('cursor', 'pointer')

        node
            .append('circle')
            .attr('r', NODE_RADIUS + 0.5)
            .attr('fill', (d) => (d.children ? getGroupColor(d) : getNodeColor(d)))
            .attr('stroke', (d) => (d.children ? 'none' : 'rgba(0,0,0,0.15)'))
            .attr('stroke-width', (d) => (d.children ? 0 : 1))

        node
            .append('text')
            .attr('dy', '0.32em')
            .attr('x', (d) => (d.children ? -8 : 8))
            .attr('text-anchor', (d) => (d.children ? 'end' : 'start'))
            .attr('font-size', '11px')
            .attr('fill', '#2d3748')
            .attr('font-weight', (d) => (d.children ? 600 : 400))
            .attr('pointer-events', 'none')
            .text((d) => {
                const n = d.data as TreeNode
                if (n.value && n.value > 0) return `${n.name} (${n.value})`
                return n.name
            })

        const zoom = d3
            .zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.5, 4])
            .on('zoom', (event) => {
                g.attr('transform', event.transform as unknown as string)
            })

        const initialScale = 0.65
        const initialTransform = d3.zoomIdentity.translate(60, 40).scale(initialScale)
        svg.call(zoom as never).call(zoom.transform as never, initialTransform)

        function getSubtreeBounds(node: d3.HierarchyPointNode<TreeNode>) {
            const leaves = node.leaves()
            if (leaves.length === 0) {
                return { minX: node.x, maxX: node.x, minY: node.y, maxY: node.y }
            }
            const xs = leaves.map((l) => l.x)
            const ys = leaves.map((l) => l.y)
            const pad = 30
            return {
                minX: Math.min(...xs) - pad,
                maxX: Math.max(...xs) + pad,
                minY: Math.min(...ys) - pad,
                maxY: Math.max(...ys) + pad,
            }
        }

        function focusOnNode(d: d3.HierarchyPointNode<TreeNode>) {
            const bounds = getSubtreeBounds(d)
            const spanX = bounds.maxX - bounds.minX
            const spanY = bounds.maxY - bounds.minY
            const centerX = (bounds.minX + bounds.maxX) / 2
            const centerY = (bounds.minY + bounds.maxY) / 2
            const scale = Math.min(
                (WIDTH - 120) / spanY,
                (HEIGHT - 80) / spanX,
                2.5
            )
            const tx = WIDTH / 2 - 60 - scale * centerY
            const ty = HEIGHT / 2 - 40 - scale * centerX

            svg
                .transition()
                .duration(FOCUS_DURATION)
                .call(zoom.transform as never, d3.zoomIdentity.translate(tx + 60, ty + 40).scale(scale))
        }

        function resetZoom() {
            svg
                .transition()
                .duration(FOCUS_DURATION)
                .call(zoom.transform as never, d3.zoomIdentity.translate(60, 40).scale(initialScale))
        }

        node.on('click', (event, d) => {
            event.stopPropagation()
            focusOnNode(d)
        })

        link.on('click', (event, d) => {
            event.stopPropagation()
            focusOnNode(d.target)
        })

        svg.on('click', () => resetZoom())

        return () => {
            svg.on('.zoom', null)
            node.on('click', null)
            link.on('click', null)
        }
    }, [data])

    return (
        <div className="relative">
            <svg
                ref={svgRef}
                width={WIDTH}
                height={HEIGHT}
                className="rounded border border-border bg-card"
                style={{ maxWidth: '100%' }}
            />
            <p className="mt-2 text-xs text-[#888] italic">
                Click a branch to zoom in. Click background to reset.
            </p>
        </div>
    )
}
