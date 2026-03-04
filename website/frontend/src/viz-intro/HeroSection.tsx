/** Pure editorial intro — no map, no scrollama. Just text + a sample data table. */
export function HeroSection() {
    return (
        <section style={{ background: '#fcfbf8' }}>
            {/* Headline */}
            <div
                className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-6"
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
                    When wildfire hits, the models that predict damage depend on property data.
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
                    Across California, insurers, planners, and emergency responders rely on
                    structural databases to estimate risk. But what if the data itself is inconsistent?
                </p>
            </div>

            {/* The data explainer */}
            <div className="mx-auto max-w-2xl px-6" style={{ paddingBottom: '4rem' }}>
                <p
                    style={{
                        fontSize: '0.95rem',
                        lineHeight: 1.75,
                        color: '#555',
                        marginBottom: '1.5rem',
                    }}
                >
                    The National Structure Inventory records property characteristics for every
                    structure in the United States — building material, occupancy type, land cover.
                    Here, each structure's material is encoded as a <em>color</em> label (a stand-in
                    for categorical attributes like roofing material or wall type). This is what
                    the data looks like:
                </p>

                {/* Sample data table */}
                <div style={{ overflowX: 'auto' }}>
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

                <p
                    style={{
                        marginTop: '1.5rem',
                        fontSize: '0.95rem',
                        lineHeight: 1.75,
                        color: '#555',
                    }}
                >
                    Each row represents a group of structures in one location. The <em>clr</em> column
                    — our focus — encodes a categorical property attribute. If neighboring counties
                    with similar geography report very different distributions of these labels,
                    something may be wrong with the data.
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
