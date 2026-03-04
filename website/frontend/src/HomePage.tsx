import 'katex/dist/katex.min.css'
import { InlineMath, BlockMath } from 'react-katex'

const AUTHORS = [
    { name: 'Angela Shen', email: 'a9shen@ucsd.edu' },
    { name: 'Tatiana Samokhvalova', email: 'tsamokhvalova@ucsd.edu' },
    { name: 'Sardor Sobirov', email: 'ssobirov@ucsd.edu' },
    { name: 'Nathaphat Taleongpong', email: 'ntaleongpong@ucsd.edu' },
]

const MENTORS = [
    { name: 'Lawrence Vulis', affiliation: 'Cotality' },
    { name: 'Peter Nagy', affiliation: 'Cotality' },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="space-y-3">
            <h2 className="text-lg font-semibold border-b pb-1">{title}</h2>
            {children}
        </section>
    )
}

function P({ children }: { children: React.ReactNode }) {
    return <p className="text-base leading-relaxed text-foreground">{children}</p>
}

function Legend({ items }: { items: { sym: string; desc: string }[] }) {
    return (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm pl-1">
            {items.map(({ sym, desc }) => (
                <>
                    <dt key={sym + '-dt'} className="font-mono text-muted-foreground whitespace-nowrap"><InlineMath>{sym}</InlineMath></dt>
                    <dd key={sym + '-dd'} className="text-muted-foreground">{desc}</dd>
                </>
            ))}
        </dl>
    )
}

export function HomePage() {
    return (
        <div className="max-w-3xl space-y-10 py-6">

            {/* Title */}
            <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight">
                    Wildfire Property Intelligence
                </h1>
                <p className="text-muted-foreground text-sm italic">
                    Finding outliers before fire finds them first
                </p>
            </div>

            {/* Authors */}
            <Section title="Authors">
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    {AUTHORS.map((a) => (
                        <div key={a.email}>
                            <p className="font-medium">{a.name}</p>
                            <p className="text-xs text-muted-foreground">{a.email}</p>
                        </div>
                    ))}
                </div>
                <div className="pt-1">
                    <p className="text-xs text-muted-foreground font-medium mb-1">Industry Mentors</p>
                    <div className="flex gap-6">
                        {MENTORS.map((m) => (
                            <div key={m.name} className="text-sm">
                                <p className="font-medium">{m.name}</p>
                                <p className="text-xs text-muted-foreground">{m.affiliation}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </Section>

            {/* Introduction */}
            <Section title="Introduction">
                <P>
                    This capstone project explores approaches for improving the consistency and reliability of large scale geospatial property datasets used in nationwide risk assessment. Using aggregated NSI data structured at the H3 hex level with landcover information, we examine how exposure sparsity and regional heterogeneity affect categorical property attributes. The work focuses on exploratory analysis and the development of exposure aware statistical frameworks to support scalable anomaly detection and data quality assessment.
                </P>
            </Section>

            {/* Methods */}
            <Section title="Methods">
                <P>
                    We implemented and evaluated multiple statistical and machine learning approaches.
                </P>
                <P>CONTENT FOR METHODS TO BE ADDED FOR EACH ONE</P>
                <div className="space-y-8 pt-2">

                    {/* Empirical Bayes */}
                    <div className="space-y-2">
                        <h3 className="text-sm font-semibold">Empirical Bayes Shrinkage</h3>
                        <div className="overflow-x-auto py-2">
                            <BlockMath>{String.raw`\tilde{p}_{c\ell k} = w_{c\ell}\,\hat{p}_{c\ell k} + (1 - w_{c\ell})\,p^{(0)}_{\ell k}, \qquad w_{c\ell} = \frac{N_{c\ell}}{N_{c\ell} + \alpha}`}</BlockMath>
                        </div>
                        <Legend items={[
                            { sym: 'c,\\,\\ell,\\,k', desc: 'county, land cover type, color category' },
                            { sym: '\\tilde{p}_{c\\ell k}', desc: 'stabilized (shrinkage) color proportion' },
                            { sym: '\\hat{p}_{c\\ell k}', desc: 'raw observed proportion for county c' },
                            { sym: 'p^{(0)}_{\\ell k}', desc: 'statewide baseline proportion for land cover ℓ' },
                            { sym: 'w_{c\\ell}', desc: 'shrinkage weight — approaches 1 as exposure grows' },
                            { sym: 'N_{c\\ell}', desc: 'total structure count (exposure) for county c, land cover ℓ' },
                            { sym: '\\alpha', desc: 'shrinkage strength hyperparameter' },
                        ]} />
                    </div>

                    {/* Conditional Pooling */}
                    <div className="space-y-2">
                        <h3 className="text-sm font-semibold">Conditional Probability & Spatial Pooling</h3>
                        <div className="overflow-x-auto py-2">
                            <BlockMath>{String.raw`y_{c\ell k}^{\text{pool}} = y_{c\ell k} + \sum_{c' \in \mathcal{N}(c)} y_{c'\ell k}`}</BlockMath>
                        </div>
                        <div className="overflow-x-auto py-2">
                            <BlockMath>{String.raw`S_{c\ell k} = -\log\!\left(\tilde{p}_{c\ell k}^{\text{pool}}\right)`}</BlockMath>
                        </div>
                        <Legend items={[
                            { sym: 'y_{c\\ell k}', desc: 'raw structure count for county c, land cover ℓ, color k' },
                            { sym: '\\mathcal{N}(c)', desc: 'set of counties geographically adjacent to county c' },
                            { sym: 'y_{c\\ell k}^{\\text{pool}}', desc: 'pooled count including all neighboring counties' },
                            { sym: 'S_{c\\ell k}', desc: 'surprisal score — higher means the color is more anomalous in context' },
                            { sym: '\\tilde{p}_{c\\ell k}^{\\text{pool}}', desc: 'smoothed conditional probability after neighbor pooling' },
                        ]} />
                    </div>

                    {/* Neighbor Divergence */}
                    <div className="space-y-2">
                        <h3 className="text-sm font-semibold">Jensen–Shannon Neighbor Divergence</h3>
                        <div className="overflow-x-auto py-2">
                            <BlockMath>{String.raw`D_{cc'} = \frac{\displaystyle\sum_{\ell \in \mathcal{L}_{cc'}} w_{cc'\ell}\;\mathrm{JSD}(p_{c\ell},\,p_{c'\ell})}{\displaystyle\sum_{\ell \in \mathcal{L}_{cc'}} w_{cc'\ell}}, \quad w_{cc'\ell} = \min(n_{c\ell},\, n_{c'\ell})`}</BlockMath>
                        </div>
                        <Legend items={[
                            { sym: 'c,\\,c\'', desc: 'an adjacent county pair' },
                            { sym: '\\mathcal{L}_{cc\'}', desc: 'land cover types where both counties have ≥ 30 structures' },
                            { sym: 'p_{c\\ell}', desc: 'color probability distribution for county c within land cover ℓ' },
                            { sym: 'w_{cc\'\\ell}', desc: 'weight = min sample size of the two counties for that land cover' },
                            { sym: 'D_{cc\'}', desc: 'weighted mean JSD across shared land cover types for the pair' },
                        ]} />
                    </div>

                    {/* Group Divergence */}
                    <div className="space-y-2">
                        <h3 className="text-sm font-semibold">Group-Level Distributional Anomaly Detection</h3>
                        <div className="overflow-x-auto py-2">
                            <BlockMath>{String.raw`\mathrm{JSD}(c) = \tfrac{1}{2}\,\mathrm{KL}(p_c \| m_c) + \tfrac{1}{2}\,\mathrm{KL}(p^{(0)} \| m_c), \quad m_{ck} = \tfrac{1}{2}(p_{ck} + p_k^{(0)})`}</BlockMath>
                        </div>
                        <Legend items={[
                            { sym: 'p_c', desc: 'county-level color distribution (aggregated over all land cover types)' },
                            { sym: 'p^{(0)}', desc: 'statewide baseline color distribution' },
                            { sym: 'm_c', desc: 'midpoint distribution between county and baseline' },
                            { sym: '\\mathrm{KL}(\\cdot\\|\\cdot)', desc: 'Kullback–Leibler divergence' },
                            { sym: '\\mathrm{JSD}(c)', desc: 'Jensen–Shannon divergence — single anomaly score per county vs. state' },
                        ]} />
                    </div>

                    {/* C2ST */}
                    <div className="space-y-2">
                        <h3 className="text-sm font-semibold">Classifier Two-Sample Test (C2ST)</h3>
                        <div className="overflow-x-auto py-2">
                            <BlockMath>{String.raw`\mathbf{x}_i = (\text{occupancy}_i, \text{bldgtype}_i, \text{color}_i), \quad y_i = \begin{cases} 1 & \text{if from } c_a \\ 0 & \text{if from } c_b \end{cases}`}</BlockMath>
                        </div>
                        <div className="overflow-x-auto py-2">
                            <BlockMath>{String.raw`\widehat{\text{Acc}}_\ell(c_a, c_b) = \frac{1}{N_\ell} \sum_{i=1}^{N_\ell} \mathbf{1}(\widehat{y}_i = y_i)`}</BlockMath>
                        </div>
                        <div className="overflow-x-auto py-2">
                            <BlockMath>{String.raw`\text{C2ST}(c_a, c_b) = \sum_{\ell} w_\ell \, \widehat{\text{Acc}}_\ell(c_a, c_b), \quad w_\ell = \frac{\min(n_{c_a\ell}, n_{c_b\ell})}{\sum_{\ell'} \min(n_{c_a\ell'}, n_{c_b\ell'})}`}</BlockMath>
                        </div>
                        <Legend items={[
                            { sym: 'c_a,\\,c_b', desc: 'neighboring county pair' },
                            { sym: '\\ell', desc: 'land cover type' },
                            { sym: '\\mathbf{x}_i', desc: 'categorical feature (occupancy, building type, color)' },
                            { sym: 'y_i', desc: 'binary label: 1 if from c_a, 0 if from c_b' },
                            { sym: '\\widehat{\\text{Acc}}_\\ell', desc: 'CV accuracy of classifier in land cover ℓ' },
                            { sym: 'w_\\ell', desc: 'exposure weight = min sample sizes normalized across ℓ' },
                        ]} />
                    </div>

                    {/* Moran's I */}
                    <div className="space-y-2">
                        <h3 className="text-sm font-semibold">Moran's I</h3>
                        <div className="overflow-x-auto py-2">
                            <BlockMath>{String.raw`I_i = \frac{\sum_j z_i \cdot z_j \cdot w_{ij}}{\sum_i z_i^2}`}</BlockMath>
                        </div>
                        <Legend items={[
                            { sym: 'i,\\,j', desc: 'county indices (58 counties in California)' },
                            { sym: 'z_i', desc: 'standardized feature value for county i (e.g. relative color frequency)' },
                            { sym: 'w_{ij}', desc: 'spatial weight — 1 if counties i and j share a border, 0 otherwise' },
                            { sym: 'I_i', desc: 'local Moran\'s I — high = clusters with neighbors, low = spatial outlier' },
                        ]} />
                    </div>

                </div>
            </Section>

            {/* Results */}
            <Section title="Results & Discussion">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    {[
                        { stat: '4.17', label: 'Mean surprisal (unweighted)' },
                        { stat: '2.50', label: 'Exposure-weighted mean surprisal' },
                        { stat: '0.621', label: 'Mean neighbor JSD (raw color labels)' },
                        { stat: '0.21', label: 'Mean neighbor JSD after color group pooling' },
                        { stat: '0.97', label: 'KL divergence (county vs neighbor pool, mean)' },
                        { stat: '0.165', label: "Local Moran's I (mean)" },
                        { stat: '93.4%', label: 'C2ST classifier accuracy (mean)' },
                    ].map(({ stat, label }) => (
                        <div key={label} className="rounded-lg border bg-card p-4">
                            <p className="text-2xl font-semibold tabular-nums">{stat}</p>
                            <p className="text-xs text-muted-foreground mt-1 leading-snug">{label}</p>
                        </div>
                    ))}
                </div>
            </Section>

        </div>
    )
}
