/** Pure editorial intro, no map, no scrollama. Story driven narrative from report.tex */
export function HeroSection() {
    return (
        <section style={{ background: '#fcfbf8' }}>
            {/* Act 1: The stakes */}
            <div
                className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-6"
                style={{ textAlign: 'center' }}
            >
                <h1
                    style={{
                        fontFamily: 'Georgia, "Times New Roman", serif',
                        fontSize: 'clamp(2rem, 5vw, 3.25rem)',
                        fontWeight: 400,
                        lineHeight: 1.2,
                        color: '#282828',
                        letterSpacing: '-0.015em',
                    }}
                >
                    Finding outliers before fire finds them first.
                </h1>
                <p
                    style={{
                        marginTop: '1.5rem',
                        fontSize: '1.1rem',
                        lineHeight: 1.75,
                        color: '#555',
                        maxWidth: '36rem',
                    }}
                >
                    Wildfires are among the most costly natural disasters in California. The largest
                    burned nearly one million acres and caused $16 billion in property damage. Insurers,
                    planners, and emergency responders rely on structural databases to estimate risk.
                    But inaccurate data can distort damage estimates and misallocate resources.
                </p>
                <p
                    style={{
                        marginTop: '1rem',
                        fontSize: '1rem',
                        lineHeight: 1.75,
                        color: '#666',
                        maxWidth: '34rem',
                    }}
                >
                    Our question: <em>How can we detect erroneous property data and correct
                    inconsistencies across regions?</em> We examine San Diego County and its
                    neighbors to tell that story.
                </p>
            </div>

            {/* Act 2: The data */}
            <div className="mx-auto max-w-2xl px-6 py-12">
                <h2 className="text-xl font-semibold border-b pb-2 mb-4" style={{ color: '#282828' }}>
                    The data
                </h2>
                <p style={{ fontSize: '0.95rem', lineHeight: 1.75, color: '#555', marginBottom: '1rem' }}>
                    We use aggregated National Structure Inventory (NSI) data at the H3 hexagon level.
                    Each cell contains counts of structures stratified by occupancy, building material,
                    and land cover. Our categorical attribute, <em>color</em>, stands in for any
                    property field (e.g. roofing material) whose distribution may vary across counties
                    due to reporting conventions. Think of it like "duplex" vs "small multifamily":
                    different labels, similar structures.
                </p>
                <p style={{ fontSize: '0.95rem', lineHeight: 1.75, color: '#555', marginBottom: '1.5rem' }}>
                    San Diego and Los Angeles are both major urban counties with similar color distributions.
                    Yet even adjacent counties like San Diego and Orange can diverge, not because
                    structures differ, but because assessors use different vocabularies.
                </p>

                {/* Sample data table */}
                <p style={{ fontSize: '0.9rem', color: '#555', marginBottom: '0.75rem' }}>
                    Sample records: each row is a group of structures in one location.
                </p>
                <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
                    <table
                        style={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            fontSize: '0.8rem',
                            fontFamily: '"SF Mono", "Fira Code", "Fira Mono", monospace',
                        }}
                    >
                        <thead>
                            <tr style={{ borderBottom: '2px solid #282828' }}>
                                {['County', 'Land Cover', 'Building Type', 'Color', 'Count'].map((h) => (
                                    <th
                                        key={h}
                                        style={{
                                            textAlign: 'left',
                                            padding: '0.5rem 0.75rem',
                                            color: '#282828',
                                            fontWeight: 600,
                                        }}
                                    >
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {SAMPLE_ROWS.map((row, i) => (
                                <tr
                                    key={i}
                                    style={{
                                        borderBottom: '1px solid #e8e8e4',
                                        background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)',
                                    }}
                                >
                                    {row.map((cell, j) => (
                                        <td
                                            key={j}
                                            style={{
                                                padding: '0.4rem 0.75rem',
                                                color: '#444',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            {cell}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Act 3: Exposure and sparsity */}
                <h2 className="text-xl font-semibold border-b pb-2 mb-4 mt-10" style={{ color: '#282828' }}>
                    Exposure drives instability
                </h2>
                <p style={{ fontSize: '0.95rem', lineHeight: 1.75, color: '#555', marginBottom: '1rem' }}>
                    Across 221,108 H3 cells, exposure ranges from 2 to 2,195 structures per cell, with a
                    median of 21. Twenty six percent of cells have fewer than 5 structures and contain
                    only 1.5% of total structures. Rural and forest dominated counties, including
                    parts of San Diego's inland and mountainous areas, have over 60% of cells classified
                    as sparse (&lt;10 structures).
                </p>
                <p style={{ fontSize: '0.95rem', lineHeight: 1.75, color: '#555', marginBottom: '1rem' }}>
                    This matters: <strong>low exposure creates unstable categorical proportions.</strong>
                    A single observation can dramatically shift frequencies. Naive anomaly detection
                    overflags rural areas not because the data is wrong, but because sample sizes
                    are too small. Any framework must account for exposure heterogeneity.
                </p>
                <p style={{ fontSize: '0.95rem', lineHeight: 1.75, color: '#555', marginBottom: '1.5rem' }}>
                    Scroll to see California's divergence landscape and zoom into San Diego to
                    compare it with Orange County, a neighbor that shares a border and similar geography.
                </p>
            </div>
        </section>
    )
}

const SAMPLE_ROWS = [
    ['San Diego', 'Urban + Forest', 'Wood', 'cocoa', '3,421'],
    ['San Diego', 'Urban + Forest', 'Masonry', 'olive', '1,892'],
    ['San Diego', 'Urban', 'Wood', 'terracotta', '5,103'],
    ['Orange', 'Urban + Forest', 'Wood', 'brown', '2,847'],
    ['Orange', 'Urban + Forest', 'Masonry', 'sage', '1,456'],
    ['Orange', 'Urban', 'Wood', 'lavender', '4,221'],
]
