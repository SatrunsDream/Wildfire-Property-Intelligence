Clustering and Harmonizing Categorical Label Vocabularies for Spatial Data Quality in Hazard Risk Modeling
Why this problem matters in hazard inventories
Large-scale hazard and disaster risk models often depend on “national” or “multi-source” building inventories that aggregate (or infer) structure characteristics across many jurisdictions, each with different reporting practices. This is a known risk: recent work shows that using unrefined national inventories can materially compromise risk assessments and decision-making, and that even relatively small refinements (e.g., correcting locations or key attributes) can meaningfully change prioritized outcomes. 

A prominent U.S. example is a nationwide building inventory developed and maintained by U.S. Army Corps of Engineers (through its HEC ecosystem). Official documentation and FAQs explicitly emphasize that users should evaluate data quality within their study area and mitigate limitations as needed—an acknowledgement that “one-size-fits-all” inventories inevitably embed uncertainty and heterogeneity. 

Comparisons between national inventories and local assessor-driven inventories find meaningful differences in attributes and suitability for certain loss-modeling tasks, reinforcing that local coding practices and data provenance can drive systematic discrepancies that look like “signal” unless handled explicitly. 

Your project’s “color” attribute is best understood as a stand-in for any categorical property field (materials, occupancy subtypes, roof type, etc.) where jurisdictions may use different vocabularies for the same latent concept. This is closely analogous to other harmonization problems: land cover classification products frequently require legend standardization/crosswalks before multi-source analysis, precisely because incompatible category systems can create artifacts and prevent meaningful comparison. 

Problem setup and the key failure mode you’re seeing
Your data can be abstracted as sparse counts: for each region (county-like unit) and each context stratum (landcover-like condition), you observe a multinomial distribution over label strings (e.g., color names). You then compare distributions across space (county vs neighbor, county vs baseline) using divergence measures such as Jensen–Shannon divergence (JSD), and label-level “unexpectedness” such as surprisal (e.g., (-\log p)). JSD is widely used as a bounded, symmetric divergence related to Shannon entropy and connected to KL divergence; foundational treatments describe its definition and extensions, and related work discusses metric properties for a symmetric form. 

The core statistical challenge in your setting is that label strings are not the “true” categories—they are noisy surface forms. Two counties can be identical in the latent reality (“light neutral exterior”), yet diverge because one uses “ivory” while another uses “alabaster.” If you cluster/merge these surface labels into pooled groups, you can reduce artificial discrepancies and stabilize downstream anomaly detection.

The failure mode you already identified is extremely common in clustering/harmonization tasks: optimizing a single distribution-matching metric (like mean neighbor JSD) can be gamed by overly aggressive merging, sometimes collapsing many labels into one group. That trivially reduces mismatch but discards information and interpretability. This is a specific instance of a general concern in clustering evaluation: internal objectives and validity indices can promote solutions that look “optimal” numerically yet align poorly with domain sense or expert structure. 

The practical implication is that you need (a) an objective that explicitly balances fit vs complexity, and (b) validation that tests generalization and stability rather than “how low did the score go on the same data.” This is exactly what model selection ideas like BIC and MDL were designed for: penalizing complexity because likelihood (or related fit metrics) will almost always improve as you add degrees of freedom. 

Method families that directly fit “cluster the labels, not the regions”
Below are the method families that most directly match your goal: clustering label types (strings) using evidence from how they behave across contexts and space. The unifying theme is to treat each label as a distribution over contexts (and/or over counties), then cluster labels whose distributions are similar in a principled way.

Information bottleneck–style distributional clustering (highly on-target for you).
The information bottleneck framework and its agglomerative variants were developed for “distributional clustering” problems: compress one variable (e.g., word types) while preserving information about another variable (e.g., document/topic/context). Agglomerative Information Bottleneck (AIB) is a deterministic bottom-up merge procedure that explicitly maximizes preserved mutual information per cluster, producing a full merge hierarchy you can cut at any number of clusters. This is conceptually aligned with your setting where labels (colors) should be compressed while retaining predictive structure about landcover/building context. 

A closely related and very practical precedent is “Brown clustering” in NLP: it hierarchically clusters word types based on their distributional contexts and optimizes a mutual-information/likelihood criterion for a class-based model. Beyond the NLP motivation, Brown-style clustering is relevant because it was explicitly created as a sparsity-aware technique for modeling categorical co-occurrence robustly. 

Information-theoretic co-clustering for sparse contingency tables.
If you build a contingency table where rows represent contexts (e.g., landcover×county bins, or landcover×building-type bins) and columns represent labels (colors), information-theoretic co-clustering treats the normalized table as a joint distribution and finds row- and column-cluster mappings that preserve mutual information between clustered variables. This has two advantages in your case: (1) it is designed for high-dimensional sparse count matrices, and (2) it can simultaneously “regularize” the context side and the label side (useful if some landcover strata are themselves heterogeneous or rare). 

Mixture models for count vectors (Dirichlet-multinomial mixtures, topic-model analogs).
Another direct approach is to represent each label as a count vector over contexts and fit a probabilistic mixture model that clusters these count vectors while accounting for overdispersion and unequal sample sizes. Dirichlet–multinomial mixture (DMM) models are used in domains with exactly the pathologies you report (sparse frequency matrices, varying sample size, heavy tails) and provide posterior uncertainty over cluster membership. 

Topic-model ideas (LDA and related hierarchical Bayesian multinomial models) are not “label clustering” by default, but they provide a useful blueprint: discrete distributions over vocabularies can be modeled with Dirichlet priors, and latent structure can be learned via probabilistic inference rather than greedy merging. This matters because it gives you a principled way to (a) quantify uncertainty and (b) avoid over-confident merges in low-evidence regimes. 

Graph-based community detection on label–label similarity networks.
If you can construct a similarity (or substitution) graph over labels—edges connect labels that appear substitutable across neighbors or similar across contexts—then community detection can find label groups without requiring Euclidean embeddings. The Louvain method is a widely used modularity-optimization algorithm for fast community detection, and the Leiden algorithm is a more recent improvement that provides guarantees about well-connected communities and often yields better partitions. 

This family is especially relevant because it supports multi-signal fusion: you can define edge weights from (i) distributional similarity, (ii) neighbor-substitution evidence, and (iii) semantic similarity between strings—and then detect communities in the fused graph.

Optimal transport for distribution alignment when you have a label geometry.
Optimal transport (OT) becomes useful if you can define a meaningful ground metric between labels (e.g., distance between embeddings of label strings). OT then provides a way to compare or align distributions in a manner that recognizes that “ivory” and “alabaster” are close even if they are not identical tokens. Computational OT has become a standard tool in data science, and Word Mover’s Distance is a well-known example of OT used with embeddings to compare distributions of tokens. 

For your purposes, OT is less directly “a clustering algorithm,” but it can strengthen both clustering and evaluation by giving you an embedding-aware discrepancy measure that is much harder to game by collapsing labels arbitrarily.

Hybrid semantic–distribution approaches that avoid hand-tuned pooling
Your qualitative observation—“some clusters look systematic by hue, others don’t”—is a strong signal that pure semantics and pure distribution matching are each incomplete. Multi-source inventories often encode latent concepts through local conventions; two labels might be semantically distant but operationally used in the same contexts (your report’s observation of unexpected pattern similarity across different color names is a textbook example of distributional substitution). 

Hybrid approaches address this by combining three evidence channels:

Text/string similarity (cheap, high precision for spelling variants).
Classic edit distance provides a low-cost way to merge obvious variants (“grey” vs “gray”) or near-duplicates, and remains a standard primitive for string matching. 

Semantic embeddings of label strings (captures synonymy beyond spelling).
Word and sentence embedding methods produce vector representations that encode semantic similarity; SBERT-style embeddings are commonly used for clustering and similarity search. In your case, embeddings help ensure clusters remain interpretable (“ivory” and “alabaster” should probably not be separated unless distributional evidence is strong). 

Distributional similarity / substitution evidence (captures operational equivalence).
Information-bottleneck, Brown-style, and co-clustering methods are explicitly designed to cluster items that occur in similar contexts, even if they don’t look semantically similar on the surface. That is precisely what you need if jurisdictional coding conventions are driving the discrepancies. 

A practical way to fuse these without “manual grouping” is to treat the task as entity resolution for category values: the “records” are label strings and their observed behaviors; the goal is to decide whether two strings refer to the same latent concept (or should be placed in the same pooled bucket). The Fellegi–Sunter framework is a foundational probabilistic model for record linkage, and modern tools operationalize it for fuzzy matching and deduplication workflows. While traditional record linkage is pairwise rather than clustering, it provides a principled vocabulary (match vs non-match probabilities) and a disciplined approach to combining multiple similarity fields. 

The remote-sensing community’s “legend harmonization” literature provides another relevant pattern: teams often start with semantic interoperability principles (crosswalks, similarity measures), but they also acknowledge that harmonization is constrained by how classes are actually used and defined across producers. Some harmonization work even uses probabilistic topic-model machinery (e.g., LDA-inspired approaches) to reconcile legends across products, showing that “category mapping” can legitimately be a learned statistical object rather than a purely semantic one. 

Validation frameworks that go beyond “minimize JSD / surprisal”
If your end goal is “a solution that transfers to other datasets,” the validation strategy must explicitly test transfer and must measure stability.

Out-of-sample evaluation (prevents overfitting to your current counties/contexts).
A strong design is to learn the pooling on one subset of counties (or landcover strata) and evaluate on held-out counties/strata. This directly tests whether your merges capture generalizable substitution patterns rather than idiosyncratic noise.

Stability under resampling (tests whether clusters are real or brittle artifacts).
Stability-based validation explicitly measures whether a clustering repeats under perturbations (subsampling, bootstrapping). Foundational work proposes evaluating stability via similarity between clusterings obtained from subsamples; later work emphasizes that stability can vary cluster-by-cluster (some groups are robust, others unstable), which is exactly what you want to diagnose before “shipping” a mapping. 

Consensus clustering (turns stability into a usable artifact).
Consensus clustering aggregates clustering results across many resampled runs to produce (i) a consensus partition and (ii) diagnostics like a consensus matrix showing which label pairs consistently cluster together, which is extremely useful for explaining and justifying your grouping decisions in a report/poster. 

Cluster-comparison metrics for “clusterings across runs.”
When you do stability analysis, you need a principled distance between partitions. Variation of Information (VI) is an information-theoretic distance between clusterings that measures information lost/gained when moving from one partition to another; it’s commonly used for comparing clusterings without imposing assumptions about how they were generated. 

Complexity control as part of the objective (prevents “one giant cluster”).
Because fit metrics tend to improve as you merge/simplify (or as you add parameters, depending on the formulation), you should treat “number of groups” as a model-order selection problem and penalize complexity in a defensible way. BIC is the classic large-sample approximation to Bayesian model selection that penalizes parameter count; MDL is a broader principle that selects the model yielding the shortest combined description of model + data, explicitly trading off fit and complexity. 

Finally, it is worth being explicit in your write-up that not all cluster validity indices are trustworthy arbiter signals. Recent analyses show that many popular internal indices can perform poorly relative to expert structure, reinforcing your intuition that “JSD/surprisal cannot be the end-all be-all” and motivating a validation stack rather than a single score. 

Recommended experiment plan and decision guide for your next iteration
This section is written so you can hand it to Cursor as a “build list,” but it is also defensible in a capstone report.

Experiment design principles (apply to all experiments).
Train (learn merges) on one split; evaluate on another split (held-out counties, held-out landcovers, or both). Repeat over multiple random splits. Add a bootstrap/subsample stability layer to see which merges are fragile vs consistent. Use at least one complexity penalty (BIC/MDL-style) so that “collapse into a mega-cluster” is mathematically disfavored rather than informally rejected. 

Experiments to run (three to six, ordered by “most directly aligned to your need”).

Experiment using information bottleneck clustering for label pooling
What to do: Construct (p(\text{context} \mid \text{label})) where “context” is your chosen conditioning set (at minimum landcover; ideally landcover×building-type or landcover×occupancy if available and not too sparse). Run Agglomerative Information Bottleneck to produce a full merge tree, then cut at multiple K values. 

What to plot: (i) held-out neighbor/baseline divergence vs K, (ii) preserved mutual information vs K, (iii) cluster stability vs K (bootstrap). 

Success criteria: You want a region where (a) performance improves on held-out splits, (b) stability is high, and (c) mutual information is not collapsing too sharply.

Experiment using information-theoretic co-clustering for sparse contingency tables
What to do: Build a context×label contingency table (normalized to a joint distribution) and run Dhillon’s co-clustering to simultaneously discover context clusters and label clusters. 

What to plot: compare label clusters produced with and without context co-clustering; evaluate out-of-sample divergence and stability.
Why it matters: If some landcover strata are internally heterogeneous, row co-clustering can reduce noise that would otherwise distort label clustering.

Experiment using a multi-signal label similarity graph with Leiden community detection
What to do: Define a weighted label–label graph where edge weights combine (1) distributional similarity/substitution evidence, (2) semantic similarity from embeddings, and (3) a sparsity-aware confidence weight (downweight edges supported only by tiny exposure). Then run Leiden for community detection, tuning the resolution parameter and edge threshold. 

Why Leiden: it improves on Louvain by addressing poorly connected communities and often yields better quality partitions with guarantees. 

Success criteria: Produces well-connected, interpretable communities without a single dominant cluster, and holds up under bootstrap.

Experiment using a Dirichlet-multinomial mixture model on label-by-context count vectors
What to do: Treat each label as a “sample” with a count vector over contexts; fit a DMM with various K, pick K using BIC/MDL-like penalties, and inspect posterior uncertainty (labels that are ambiguous should have diffuse assignment). 

Why it helps: probabilistic clustering plus complexity penalties is a principled way to resist over-merging, and DMM is specifically motivated by sparse frequency matrices with unequal sample size. 

Optional experiment using embedding-aware OT distances as an evaluation lens
What to do: Use OT/Wasserstein-style distances between county distributions where label distances come from embeddings; compare whether “improvements” in JSD correspond to improvements in embedding-aware discrepancy. 

Why it matters: if your system is collapsing semantically distant labels, an embedding-aware discrepancy will often reveal that collapse as harmful even when JSD improves.

Decision guide (what to do when results look “non-systematic” or too “systematic”).
If clusters look non-systematic but generalize well: justify them as behaviorally equivalent substitutions discovered from context-conditioned evidence (information bottleneck / co-clustering framing), and report stability results to show these are not flukes. 

If clusters collapse into one giant group: increase complexity penalties (BIC/MDL), strengthen semantic constraints (embedding similarity thresholds), or tune Leiden resolution/edge thresholds. 

If clusters are unstable across bootstrap runs: either you lack enough evidence for that granularity (reduce K), or your similarity signals are too noisy in sparse regimes (increase shrinkage/regularization; downweight low-exposure contexts). Use consensus clustering diagnostics to identify which merges are reliable and which are questionable. 

If JSD improves but interpretability collapses: explicitly treat this as a multi-objective optimization problem (fit + interpretability + stability), and cite that single-number clustering criteria often misalign with expert structure—your additional constraints are not “hand-waving,” they are a recognized necessity in real clustering practice. 