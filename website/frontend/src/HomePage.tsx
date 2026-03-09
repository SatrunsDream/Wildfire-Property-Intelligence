import { useState, useEffect } from 'react'
import 'katex/dist/katex.min.css'
import { BlockMath, InlineMath } from 'react-katex'
import { FileText, Github, Presentation } from 'lucide-react'
import type { Page } from './components/app-sidebar'
import { PdfViewerModal, getPdfTargetFromHash, type PdfModalTarget } from './components/PdfViewerModal'

const AUTHORS = [
  { name: 'Angela Shen', email: 'a9shen@ucsd.edu' },
  { name: 'Tatiana Samokhvalova', email: 'tsamokhvalova@ucsd.edu' },
  { name: 'Sardor Sobirov', email: 'ssobirov@ucsd.edu' },
  { name: 'Nathaphat Taleongpong', email: 'ntaleongpong@ucsd.edu' },
]

const MENTORS = [
  { name: 'Lawrence Vulis', affiliation: 'Cotality', email: 'lvulis@cotality.com' },
  { name: 'Peter Nagy', affiliation: 'Cotality', email: 'pnagy@cotality.com' },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold border-b pb-2">{title}</h2>
      {children}
    </section>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm sm:text-base leading-relaxed">{children}</p>
}

function Dropdown({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border bg-muted/30">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-left hover:bg-muted/50 transition-colors"
      >
        {title}
        <span className={`text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>
      {open && <div className="px-3 sm:px-4 pb-4 pt-1 text-sm space-y-3">{children}</div>}
    </div>
  )
}

function MethodLink({ title, page, onPageChange }: {
  title: string
  page: Page
  onPageChange?: (page: Page) => void
}) {
  if (!onPageChange) return <h3 className="text-base font-semibold">{title}</h3>
  return (
    <h3
      className="text-base font-semibold cursor-pointer hover:underline"
      onClick={() => onPageChange(page)}
    >
      {title} →
    </h3>
  )
}

export function HomePage({ onPageChange }: { onPageChange?: (page: Page) => void }) {
  const [pdfModalTarget, setPdfModalTarget] = useState<PdfModalTarget>(null)

  useEffect(() => {
    const syncFromHash = () => {
      const target = getPdfTargetFromHash()
      setPdfModalTarget(target)
    }
    syncFromHash()
    window.addEventListener('hashchange', syncFromHash)
    return () => window.removeEventListener('hashchange', syncFromHash)
  }, [])

  const openPdfModal = (target: Exclude<PdfModalTarget, null>) => {
    window.location.hash = target
    setPdfModalTarget(target)
  }

  return (
    <div className="w-full space-y-8 sm:space-y-12 py-4 sm:py-8 px-1 sm:px-0">
      <div className="space-y-3">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Wildfire Property Intelligence
        </h1>
        <p className="text-base sm:text-lg text-muted-foreground">
          Finding Outliers Before Fire Finds Them First
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm pt-1">
          {AUTHORS.map((a) => (
            <div key={a.email}>
              <p className="font-medium">{a.name}</p>
              <p className="text-xs text-muted-foreground">{a.email}</p>
            </div>
          ))}
        </div>
        <div className="pt-2">
          <p className="text-xs text-muted-foreground font-medium mb-1">Industry Mentors</p>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-6">
            {MENTORS.map((m) => (
              <div key={m.name} className="text-sm">
                <p className="font-medium">{m.name}</p>
                <p className="text-xs text-muted-foreground">{m.affiliation}</p>
                <p className="text-xs text-muted-foreground">{m.email}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <Section title="About">
        <P>
          This capstone project explores approaches for improving the consistency and reliability of large-scale geospatial property datasets used in nationwide risk assessment. Using aggregated NSI data structured at the H3 hex level with land cover information, we explore how regional differences affect categorical property attributes. We implemented different statistical and machine learning approaches, including Empirical Bayes shrinkage, Jensen Shannon divergence, spatial pooling, a classifier two-sample test, and Moran's I to build a pipeline for detecting anomalies. Our results show that most of the variation between neighboring counties comes from inconsistent naming conventions rather than real structural differences, and that merging certain attributes can reduce this noise. This website will briefly walk through our data, methods, results, and takeaways from this project.
        </P>
        <div className="flex flex-wrap justify-center gap-3 pt-4">
          <button
            type="button"
            onClick={() => openPdfModal('paper')}
            className="inline-flex items-center gap-2.5 rounded-lg border px-6 py-3 text-base font-medium hover:bg-muted transition-colors"
          >
            <FileText className="size-5" />
            Report
          </button>
          <button
            type="button"
            onClick={() => openPdfModal('poster')}
            className="inline-flex items-center gap-2.5 rounded-lg border px-6 py-3 text-base font-medium hover:bg-muted transition-colors"
          >
            <Presentation className="size-5" />
            Poster
          </button>
          <a
            href="https://github.com/SatrunsDream/Wildfire-Property-Intelligence"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2.5 rounded-lg border px-6 py-3 text-base font-medium hover:bg-muted transition-colors"
          >
            <Github className="size-5" />
            GitHub
          </a>
        </div>
      </Section>

      <PdfViewerModal target={pdfModalTarget} onClose={() => setPdfModalTarget(null)} />
      <Section title="Background">
        <P>
          Wildfires are disruptive and costly natural disasters in California. The largest wildfire recorded in the state burned down nearly one million acres of land and resulted in 16 billion dollars of property damage. This issue involves many stakeholders, including insurers, planners, and policymakers who rely on predictive risk models to estimate potential structural damage, allocate emergency resources, and price insurance coverage.
        </P>
        <P>
          Pollack et al. showed the importance of having accurate data in risk assessment models, bringing attention to how inaccurate data can distort damage estimates and cause problems with resource allocation. The findings conclude that even fixing misclassifications in story count or basement presence, can significantly improve assessment models. While that study focused on flood risk, the same issues apply to wildfire. In our project we examine property data to explore the following question: how can we detect erroneous property characteristic data, and correct data that is not consistent throughout the dataset?
        </P>
      </Section>
      <Section title="Data">
        <P>
          We use a representative dataset derived from the National Structure Inventory (NSI) and aggregated into H3 level 9 hexagon cells. Each row represents one H3 cell and contains the following fields: <code className="text-sm bg-muted px-1 rounded">h3</code> (the hex cell ID), <code className="text-sm bg-muted px-1 rounded">fips</code> (county FIPS code), <code className="text-sm bg-muted px-1 rounded">st_damcat</code> (structure damage category - Residential, Commercial, Industrial, or Public), <code className="text-sm bg-muted px-1 rounded">bldgtype</code> (building material - M for Masonry, W for Wood, S for Steel, H for Manufactured), <code className="text-sm bg-muted px-1 rounded">lc_type</code> (land cover type from Overture Maps, e.g. urban, forest, urban+crop), <code className="text-sm bg-muted px-1 rounded">loc</code> (geographic coordinates), <code className="text-sm bg-muted px-1 rounded">clr</code> (a categorical color label), and <code className="text-sm bg-muted px-1 rounded">clr_cc</code> (the count of structures with that color in the cell).
        </P>
        <P>
          The color labels are designed to mimic the county-to-county reporting discrepancies commonly observed in real property characteristics. For example, a duplex and a small multi-family building might be coded under different labels due to assessor or county conventions, even though they occupy similar urban parcels. It is important to view the color labels as a stand-in for any categorical property field whose distribution may vary systematically across regions due to reporting practices. Land cover assignment reflects real-world spatial overlap, multiple types can combine (e.g. urban+forest, urban+crop), resulting in thirteen distinct land cover categories.
        </P>
      </Section>
      <Section title="Methods">
        <P>
          Given our findings from exploratory analysis, we can't do direct comparisons of relative frequencies to identify meaningful inconsistencies in the dataset. To detect distributional anomalies while accounting for exposure variability, we implemented and evaluated multiple statistical and machine learning approaches. Each method provides a complementary perspective on divergence, stability, and structural inconsistency. You can click on any method title below to explore its interactive visualization.
        </P>

        <div className="space-y-6 pt-2">
          <div className="space-y-2">
            <MethodLink title="Empirical Bayes Shrinkage" page="empirical-bayes" onPageChange={onPageChange} />
            <P>
              One major challenge in the dataset is that some county and land cover groups contain very few structures. In these cases, a single observation can dramatically change the observed color proportions, leading to artificially extreme values that may appear anomalous but are due to small sample size. To reduce this instability, we applied an empirical Bayes shrinkage approach that partially pulls each county's color distribution toward a broader land cover baseline distribution. The amount of shrinkage depends on exposure, the method trusts large samples and stabilizes small ones. This serves as a sanity check to reduce false positives caused by sampling variability while preserving meaningful deviations.
            </P>
            <Dropdown title="See the math">
              <div className="space-y-2">
                <div className="overflow-x-auto">
                  <BlockMath>{String.raw`\tilde{p}_{c\ell k} = w_{c\ell}\,\hat{p}_{c\ell k} + (1 - w_{c\ell})\,p^{(0)}_{\ell k}, \qquad w_{c\ell} = \frac{N_{c\ell}}{N_{c\ell} + \alpha}`}</BlockMath>
                </div>
                <p className="text-muted-foreground">
                  When <InlineMath>{String.raw`N_{c\ell}`}</InlineMath> is small, <InlineMath>{String.raw`w_{c\ell}`}</InlineMath> is near zero and <InlineMath>{String.raw`\tilde{p}_{c\ell k}`}</InlineMath> is pulled strongly toward the baseline; when <InlineMath>{String.raw`N_{c\ell}`}</InlineMath> is large, <InlineMath>{String.raw`w_{c\ell}`}</InlineMath> approaches one and the stabilized estimate remains close to the observed proportion.
                </p>
              </div>
            </Dropdown>
          </div>
          <div className="space-y-2">
            <MethodLink title="Conditional Probability & Spatial Pooling" page="conditional-probability" onPageChange={onPageChange} />
            <P>
              While shrinkage can stabilize variance due to small sample sizes, it does not explicitly account for spatial dependence. Counties that share borders often have similar geography, development patterns, and potentially similar reporting practices. Evaluating each county in isolation may therefore overlook important regional context. To incorporate spatial structure, we pool structure counts from neighboring counties and apply Dirichlet smoothing. We then compute a surprisal score from the pooled conditional probability, and colors that are rare under the pooled distribution receive higher surprisal values.
            </P>
            <Dropdown title="See the math">
              <div className="space-y-2">
                <div className="overflow-x-auto">
                  <BlockMath>{String.raw`y_{c\ell k}^{\text{pool}} = y_{c\ell k} + \sum_{c' \in \mathcal{N}(c)} y_{c'\ell k}`}</BlockMath>
                </div>
                <div className="overflow-x-auto">
                  <BlockMath>{String.raw`S_{c\ell k} = -\log\!\left(\tilde{p}_{c\ell k}^{\text{pool}}\right)`}</BlockMath>
                </div>
                <p className="text-muted-foreground">
                  The surprisal score <InlineMath>{String.raw`S`}</InlineMath> is higher when a color is rare in its regional context.
                </p>
              </div>
            </Dropdown>
          </div>
          <div className="space-y-2">
            <MethodLink title="Jensen Shannon Neighbor Divergence" page="neighbor-divergence" onPageChange={onPageChange} />
            <P>
              To identify differences in how counties report structural data, we computed a neighbor divergence metric using Jensen Shannon divergence. For each county and land cover type, we calculate color counts and convert them into a probability distribution with Laplace smoothing to avoid zero probabilities. For each adjacent county pair, we compute JSD between the smoothed color distributions separately within each land cover type, only including land cover types where both counties have at least 30 observations. Each land cover type is weighted using the smaller of the two counties' sample sizes. We computed a divergence score for each neighboring county pair, then took the average across all 144 edges. The mean edge score was 0.634.
            </P>
            <Dropdown title="See the math">
              <div className="space-y-2">
                <div className="overflow-x-auto">
                  <BlockMath>{String.raw`D_{cc'} = \frac{\sum_{\ell} w_{cc'\ell}\;\mathrm{JSD}(p_{c\ell},\,p_{c'\ell})}{\sum_{\ell} w_{cc'\ell}}, \quad w_{cc'\ell} = \min(n_{c\ell},\, n_{c'\ell})`}</BlockMath>
                </div>
                <p className="text-muted-foreground">
                  Weighting by <InlineMath>{String.raw`\min(n_{c\ell}, n_{c'\ell})`}</InlineMath> prioritizes land cover types where both counties have reliable support.
                </p>
              </div>
            </Dropdown>
          </div>
          <div className="space-y-2">
            <MethodLink title="Group-Level Divergence" page="group-divergence" onPageChange={onPageChange} />
            <P>
              For this method we compared counties' color distributions to the statewide baseline using Jensen Shannon divergence. Color distributions were calculated for all county + land cover type combinations, and the proportions were taken on the county level. The mean JSD was 0.57, ranging from 0 to 0.81, with the majority of counties in the 0.55-0.75 range. This suggests that most counties' color distributions noticeably diverge from the statewide distribution. One finding was that some counties use one color from a "similar" pair but not the other, for example, "alabaster" is common across California, but some counties exclusively use "ivory" with zero "alabaster" structures, suggesting a labeling inconsistency.
            </P>
            <Dropdown title="See the math">
              <div className="space-y-2">
                <div className="overflow-x-auto">
                  <BlockMath>{String.raw`\mathrm{JSD}(c) = \tfrac{1}{2}\,\mathrm{KL}(p_c \| m_c) + \tfrac{1}{2}\,\mathrm{KL}(p^{(0)} \| m_c), \quad m_{ck} = \tfrac{1}{2}(p_{ck} + p_k^{(0)})`}</BlockMath>
                </div>
                <p className="text-muted-foreground">
                  where <InlineMath>{String.raw`m_c`}</InlineMath> is the midpoint distribution between county and baseline.
                </p>
              </div>
            </Dropdown>
          </div>

          <div className="space-y-2">
            <MethodLink title="Classifier Two-Sample Test (C2ST)" page="c2st" onPageChange={onPageChange} />
            <P>
              For each neighboring county pair and each land cover type, we trained a binary CatBoost classifier to predict whether a record came from county A or county B using the categorical features occupancy, building type, and color (excluding land cover type since we condition on it). If the accuracy is around 50%, it suggests the two counties are hard to differentiate, while higher accuracy indicates differences in the joint distribution of these categories. We filtered to ensure both counties had at least 50 records for a given land cover type, then calculated a single score using a weighted average across land cover types. Across California, we found a mean accuracy of 93.4%, meaning most neighboring county pairs are very separable. Feature importance analysis showed that color was consistently the most important feature.
            </P>
            <Dropdown title="See the math">
              <div className="space-y-2">
                <div className="overflow-x-auto">
                  <BlockMath>{String.raw`\text{C2ST}(c_a, c_b) = \sum_{\ell} w_\ell \, \widehat{\text{Acc}}_\ell(c_a, c_b), \quad w_\ell = \frac{\min(n_{c_a\ell}, n_{c_b\ell})}{\sum_{\ell'} \min(n_{c_a\ell'}, n_{c_b\ell'})}`}</BlockMath>
                </div>
                <p className="text-muted-foreground">
                  Cross-validated accuracy weighted across land cover types, with weights proportional to the smaller sample size.
                </p>
              </div>
            </Dropdown>
          </div>

          <div className="space-y-2">
            <MethodLink title="Moran's I (Spatial Autocorrelation)" page="morans-i" onPageChange={onPageChange} />
            <P>
              One way to approach this task is to assume neighboring counties have similar traits, since generally areas that are close to each other tend to have similar features. Moran's I, as a spatial autocorrelation statistical measure, is a good measurement under this assumption. We computed both global Moran's I (one value for the whole state) and local Moran's I (one value per county). Larger values indicate that the counties are closely correlated with each other, and smaller values indicate that counties are less correlated. However, Moran's I values tend to have more extreme values when counties have more extreme outliers, making it harder to interpret smaller values. Since Moran's I is a univariate statistic, it is also difficult to measure how clustering multiple colors might improve the results. Overall, Moran's I has multiple issues and is generally a poorer fit for this specific task compared to our other methods.
            </P>
            <Dropdown title="See the math">
              <div className="space-y-2">
                <div className="overflow-x-auto">
                  <BlockMath>{String.raw`I_i = \frac{\sum_j z_i \cdot z_j \cdot w_{ij}}{\sum_i z_i^2}`}</BlockMath>
                </div>
                <p className="text-muted-foreground">
                  <InlineMath>{String.raw`w_{ij} = 1`}</InlineMath> if counties <InlineMath>i</InlineMath> and <InlineMath>j</InlineMath> are adjacent, 0 otherwise. <InlineMath>{String.raw`z_i`}</InlineMath> is the standardized feature value for county <InlineMath>i</InlineMath>.
                </p>
              </div>
            </Dropdown>
          </div>

        </div>
      </Section>
      <Section title="Results">
        <P>
          Up to this point, the analytical methods used throughout this study relied on concepts from information theory to quantify differences in categorical distributions across regions. Measures such as conditional probability, surprisals, and Jensen Shannon divergence provide a measurable way to evaluate how unexpected or inconsistent a particular categorical observation is relative to a broader distribution. Many of our methods indicate that anomalies can occur due to similar categories being reported differently in different counties, and that color is an important feature to cluster. During our analysis, we found that county-to-county differences appeared to come from inconsistent naming of similar colors. For example, within the urban+forest land cover type, San Francisco uses the color "coffee" but San Mateo uses "brown."
        </P>
        <P>
          To address this, we implemented a greedy iterative merging algorithm designed to identify color labels that behave similarly across neighboring counties. The algorithm examines county-level conditional distributions and identifies pairs of colors that appear interchangeably across similar structural contexts. In each round, the algorithm finds the most highly voted pair among all county-neighbor pairs in California and merges the lower-frequency label into the higher-frequency label. After six iterations, the algorithm converged on seven dominant color groups, significantly reducing cross-county divergence and lowering the mean neighbor JSD from approximately 0.62 to 0.21. This reduction indicates that a substantial portion of the divergence originally observed between counties was driven by inconsistent labeling conventions rather than differences in structural characteristics.
        </P>
        <P>
          A simple baseline approach was also explored using manual, brute-force grouping of color labels based on semantic similarity (e.g., grouping "brown," "cocoa," and "coffee" together). This is not unlike how domain experts might recognize that "concrete" and "concrete block" refer to similar structural materials. This manual grouping produced a mean JSD of approximately 0.17, indicating an even stronger reduction. While effective, this approach is not scalable to larger datasets or unknown categories, which motivates the need for automated grouping methods.
        </P>


        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-3">
          {[
            { stat: '0.62', label: 'Mean neighbor JSD (raw labels)', note: 'High divergence between neighbors' },
            { stat: '0.21', label: 'Mean neighbor JSD (after pooling)', note: '66% reduction from color grouping' },
          ].map(({ stat, label, note }) => (
            <div key={label} className="rounded-lg border bg-card p-3 sm:p-4">
              <p className="text-xl sm:text-2xl font-semibold tabular-nums">{stat}</p>
              <p className="text-sm font-medium mt-1">{label}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{note}</p>
            </div>
          ))}
        </div>

        <Dropdown title="Color groupings discovered by our algorithm">
          <div className="space-y-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1.5 font-medium">Merged Group</th>
                  <th className="text-left py-1.5 font-medium">Original Labels</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                {[
                  ['Red', 'azure, blue, crimson, foo, indigo, purple, red, scarlet'],
                  ['Navy', 'aqua, aquamarine, lavender, lilac, navy'],
                  ['Alabaster', 'alabaster, gray, grey, ivory'],
                  ['Amber', 'amber, gold, lemon, yellow'],
                  ['Cocoa', 'beige, brown, cocoa, coffee'],
                  ['Olive', 'green, olive, sage, verde'],
                  ['Orange', 'orange, sienna, terracotta'],
                ].map(([group, labels]) => (
                  <tr key={group} className="border-b last:border-0">
                    <td className="py-1.5 font-medium text-foreground">{group}</td>
                    <td className="py-1.5">{labels}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground pt-1">
              Six labels remained as singletons: auburn, bar, emerald, maroon, plum, tan.
            </p>
          </div>
        </Dropdown>
      </Section>
      <Section title="Conclusion">
        <P>
          We explored the effectiveness of multiple analysis methods for anomaly detection, spanning statistical, information theory, and machine learning methods. While all of these methods are able to detect anomalies, we find that Jensen Shannon divergence performs best for anomaly detection across county lines. Overall, we found that JSD-based methods were the most effective at both detecting inconsistencies and quantifying the effects of color pooling. The C2ST classifier confirmed that neighboring counties are highly separable based on categorical features, with color being the primary driver. Empirical Bayes shrinkage and spatial pooling helped stabilize estimates in sparse regions, while Moran's I provided a useful but limited spatial perspective.
        </P>
        <P>
          While our analysis was performed on a dataset limited to California with only a few features, due to data and computation limitations, we expect that these methods will be applicable to a larger dataset. Future work includes performing this analysis on a national scale, improving the automated label-merging algorithm (which currently makes irreversible merges that can prevent better groupings later), running the algorithm separately for each property characteristic, and incorporating non-neighboring counties that share similar structural distributions as additional voting weight.
        </P>
      </Section>

      <Section title="Special Thanks">
        <P>
          We want to thank our industry mentors Lawrence Vulis and Peter Nagy from Cotality for their guidance and domain expertise throughout this project. We also want to thank HDSI and our instructors for their support.
        </P>
      </Section>

    </div>
  )
}
