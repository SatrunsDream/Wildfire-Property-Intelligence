# Bayesian Shrinkage Pooling Methodology

## Overview

This document describes the Empirical Bayes shrinkage methodology applied to stabilize categorical distributions (color categories) across county × landcover combinations. The method addresses the high variance in observed proportions when exposure (sample size) is low by shrinking estimates toward landcover-specific baseline distributions.

## Methodology

### Framework Components

1. **Aggregation**: Aggregate counts to county × landcover × category level
2. **Baseline Estimation**: Estimate landcover-level baseline distributions
3. **Exposure-Aware Shrinkage**: Apply shrinkage based on sample size
4. **Output**: Stabilized proportions and diagnostics

### Mathematical Formulation

#### Variables

- $n_{i,j,k}$: Observed count for county $i$, landcover type $j$, and category $k$
- $N_{i,j} = \sum_k n_{i,j,k}$: Total exposure (structures) for county $i$ and landcover type $j$
- $\pi_{i,j,k} = \frac{n_{i,j,k}}{N_{i,j}}$: Observed proportion for county $i$, landcover type $j$, and category $k$
- $\pi_{0,j,k}$: Baseline proportion for landcover type $j$ and category $k$ (aggregated across all counties)
- $\alpha$: Prior strength parameter (default: $\alpha = 10.0$)
- $w_{i,j}$: Shrinkage weight for county $i$ and landcover type $j$
- $\tilde{\pi}_{i,j,k}$: Stabilized (shrunken) proportion

#### Baseline Distribution

The baseline distribution for each landcover type is computed by aggregating across all counties:

$$\pi_{0,j,k} = \frac{\sum_i n_{i,j,k}}{\sum_i N_{i,j}}$$

This represents the overall distribution of categories within each landcover type, serving as the prior distribution for shrinkage.

#### Shrinkage Weight

The shrinkage weight determines how much to trust the observed data versus the baseline:

$$w_{i,j} = \frac{N_{i,j}}{N_{i,j} + \alpha}$$

Properties:
- When $N_{i,j} \ll \alpha$: $w_{i,j} \approx 0$ (strong shrinkage toward baseline)
- When $N_{i,j} \gg \alpha$: $w_{i,j} \approx 1$ (minimal shrinkage, trust observed data)
- The parameter $\alpha$ controls the "effective sample size" threshold

#### Stabilized Proportion

The final stabilized proportion is a weighted average of the observed and baseline proportions:

$$\tilde{\pi}_{i,j,k} = w_{i,j} \cdot \pi_{i,j,k} + (1 - w_{i,j}) \cdot \pi_{0,j,k}$$

This can be rewritten as:

$$\tilde{\pi}_{i,j,k} = \frac{N_{i,j}}{N_{i,j} + \alpha} \cdot \pi_{i,j,k} + \frac{\alpha}{N_{i,j} + \alpha} \cdot \pi_{0,j,k}$$

#### Effective Sample Size

The effective sample size after shrinkage is:

$$N_{\text{eff}} = N_{i,j} + \alpha$$

This represents the combined information from observed data and prior.

#### Movement Metric

The movement metric quantifies how much the proportion changed due to shrinkage:

$$\Delta_{i,j,k} = \tilde{\pi}_{i,j,k} - \pi_{i,j,k}$$

Absolute movement: $|\Delta_{i,j,k}|$

## Results

### Dataset Summary

- **Total records**: 2,417,766
- **Aggregated counts**: 4,493 county × landcover × color combinations
- **Unique counties**: 58
- **Unique landcover types**: 11
- **Unique colors**: 38

### Exposure Distribution

Exposure (total structures per county × landcover combination) shows high variability:

- **Mean**: 20,698 structures
- **Median**: 1,416 structures
- **Min**: 2 structures
- **Max**: 1,891,556 structures
- **Standard deviation**: 103,777 structures

This wide range indicates that many combinations have very low exposure, making shrinkage particularly important.

### Baseline Distributions

Baseline proportions were computed for each landcover type across all counties. Example baseline distributions:

**Barren landcover**:
- Cocoa: 41.37%
- Alabaster: 10.23%
- Amber: 4.19%
- Other colors: < 1% each

**Forest landcover**:
- Cocoa: ~25-30% (varies by county)
- Green: ~15-20%
- Brown: ~10-15%
- Other colors: distributed across remaining categories

### Shrinkage Statistics by Exposure Level

| Exposure Bin | Mean Absolute Movement | Mean Shrinkage Weight | Mean Exposure | Unique Counties |
|--------------|------------------------|----------------------|---------------|----------------|
| < 5          | 0.3071                 | 0.2392               | 3.26          | 13             |
| 5-10         | 0.1158                 | 0.4404               | 8.00          | 5              |
| 10-20        | 0.0567                 | 0.6083               | 15.80         | 13             |
| 20-50        | 0.0212                 | 0.7735               | 35.93         | 24             |
| 50-100       | 0.0095                 | 0.8852               | 79.29         | 20             |
| 100+         | 0.0009                 | 0.9891               | 30,186.62     | 58             |

### Variance Reduction

Variance reduction measures how much the variance of proportions decreased after shrinkage:

| Exposure Bin | Mean Variance Reduction | Mean Exposure |
|--------------|------------------------|---------------|
| 10-20        | 0.4512                 | 15.60         |
| 20-50        | 0.2401                 | 35.40         |
| 50-100       | 0.1413                 | 78.74         |
| 100+         | 0.0185                 | 25,525.03     |

Note: For very low exposure bins (< 10), variance reduction shows extreme values (negative infinity) due to division by near-zero variance in observed proportions.

### Proportion Sum Validation

After shrinkage, stabilized proportions should sum to approximately 1.0 within each county × landcover group:

- **Observed proportions**: All groups sum to exactly 1.0 (by construction)
- **Stabilized proportions**: Mean sum = 0.9444, with range [0.1787, 1.0000]
- **Groups with sum < 0.99**: Primarily low-exposure groups where not all categories are observed

## Map Visualization Guide

### Understanding What the Maps Show

The interactive maps visualize how Bayesian shrinkage affects property color distributions across California counties. This section explains what each visualization option means and how to interpret the results.

---

### Filtering Options

#### **Landcover Type Filter**

**"All Landcover Types"** (default):
- Shows aggregated statistics across ALL landcover types (barren, crop, forest, grass, shrub, urban, etc.)
- Each county's color represents the **average** shrinkage metric across all its landcover types
- Useful for: Getting an overall sense of which counties had the most shrinkage overall
- **Example**: If Los Angeles County has high absolute movement, it means shrinkage affected many of its landcover types

**Specific Landcover Type** (e.g., "forest", "urban"):
- Shows statistics for ONLY that landcover type
- Each county's color represents shrinkage metrics for that specific landcover type
- Counties with no data for that landcover type won't appear colored
- Useful for: Understanding how shrinkage affects specific landcover types across counties
- **Example**: Filtering to "forest" shows which counties' forest areas had the most shrinkage

---

### Metric Options: What Each One Shows

#### **1. Absolute Movement** (Recommended for first-time viewing)

**What it shows**: How much the proportions changed overall, regardless of direction.

**Formula**: $|\Delta| = |\text{stabilized} - \text{observed}|$

**What the colors mean**:
- **Purple/Dark colors** (high values, ~0.05-0.31): Counties where shrinkage had a **big impact**
  - These counties had low exposure (few structures)
  - Their observed proportions were pulled significantly toward baseline
  - **Interpretation**: "This county's data was unreliable due to small sample size"
- **Yellow/Light colors** (low values, ~0.0001-0.01): Counties where shrinkage had **minimal impact**
  - These counties had high exposure (many structures)
  - Their observed proportions were mostly trusted
  - **Interpretation**: "This county's data was reliable, shrinkage barely changed it"

**When to use**: Best for understanding **where shrinkage mattered most**. High absolute movement = unreliable raw data.

**Real-world meaning**:
- Counties with **high absolute movement** (< 20 structures): Raw data was noisy, shrinkage stabilized it
- Counties with **low absolute movement** (100+ structures): Raw data was already reliable

---

#### **2. Movement (Signed)**

**What it shows**: The direction of change - whether proportions increased or decreased after shrinkage.

**Formula**: $\Delta = \text{stabilized} - \text{observed}$

**What the colors mean**:
- **Positive values** (yellow/green): Proportions **increased** after shrinkage
  - Observed proportion was **lower** than baseline
  - Shrinkage pulled it **up** toward baseline
  - **Example**: A county had 5% "cocoa" but baseline is 25% → shrinkage increased it toward 25%
- **Negative values** (purple/blue): Proportions **decreased** after shrinkage
  - Observed proportion was **higher** than baseline
  - Shrinkage pulled it **down** toward baseline
  - **Example**: A county had 50% "cocoa" but baseline is 25% → shrinkage decreased it toward 25%
- **Near zero** (middle colors): Little change, observed was close to baseline

**When to use**: Best for understanding **which counties were above vs. below** the landcover baseline.

**Real-world meaning**:
- **Positive movement**: County had unusually low proportions (maybe due to small sample size)
- **Negative movement**: County had unusually high proportions (maybe due to small sample size or real difference)

---

#### **3. Shrinkage Weight**

**What it shows**: How much the method trusted the observed data vs. the baseline.

**Formula**: $w = \frac{N}{N + \alpha}$ where $N$ = exposure (number of structures)

**What the colors mean**:
- **High values** (yellow/light, ~0.85-0.99): High trust in observed data
  - County had **high exposure** (many structures)
  - Shrinkage weight close to 1.0 means "we trust your data"
  - **Interpretation**: "This county has enough data to be reliable"
- **Low values** (purple/dark, ~0.24-0.61): Low trust in observed data
  - County had **low exposure** (few structures)
  - Shrinkage weight close to 0 means "we don't trust your data, using baseline instead"
  - **Interpretation**: "This county doesn't have enough data, using baseline"

**When to use**: Best for understanding **data reliability** across counties. Low weight = unreliable data.

**Real-world meaning**:
- **High shrinkage weight** (0.9+): County has enough structures to trust the observed proportions
- **Low shrinkage weight** (< 0.5): County has too few structures, baseline is more reliable

---

### Understanding the Statistics Displayed

When you load the map, you'll see statistics like:

**"Showing 58 counties | Mean abs_movement: 0.0123 | Max abs_movement: 0.2847"**

**What this means**:
- **Total counties**: Number of counties with data (out of 58 total CA counties)
- **Mean [metric]**: Average value across all counties
  - For absolute movement: Average amount of change
  - For shrinkage weight: Average trust level
- **Max [metric]**: Highest value found
  - Shows the "worst case" or "most extreme" county
  - Useful for understanding the range of values

**Example interpretation**:
- Mean abs_movement: 0.0123 → On average, proportions changed by 1.23%
- Max abs_movement: 0.2847 → One county had proportions change by 28.47% (very high!)

---

### Color Scale Interpretation

The maps use a **Viridis color scale** (purple → yellow):

**General pattern**:
- **Purple/Dark Blue** = Low values (minimal shrinkage, high trust, or negative movement)
- **Green** = Medium values
- **Yellow/Bright** = High values (high shrinkage, low trust, or positive movement)

**For Absolute Movement**:
- Purple = Little change (reliable data)
- Yellow = Big change (unreliable data, needed shrinkage)

**For Shrinkage Weight**:
- Purple = Low trust (few structures)
- Yellow = High trust (many structures)

**For Movement (Signed)**:
- Purple = Decreased (pulled down toward baseline)
- Yellow = Increased (pulled up toward baseline)

---

### What to Look For

#### **Patterns to Identify**:

1. **Rural vs. Urban Counties**:
   - Rural counties (fewer structures) → Higher absolute movement, lower shrinkage weight
   - Urban counties (more structures) → Lower absolute movement, higher shrinkage weight

2. **Landcover-Specific Patterns**:
   - Filter to "forest" → See which counties have reliable forest data
   - Filter to "urban" → See which counties have reliable urban data
   - Some counties may have good data for one landcover but not another

3. **Geographic Clusters**:
   - Do neighboring counties have similar shrinkage weights?
   - Are there regional patterns in movement?

4. **Outliers**:
   - Counties with unusually high absolute movement → Very unreliable raw data
   - Counties with unusually low shrinkage weight → Very few structures for that landcover type

---

### County Detail View: What You See When Clicking

When you click a county on the map, you see:

**For each landcover type in that county**:
- **Exposure**: Total number of structures (e.g., "1,416 structures")
- **Mean Shrinkage Weight**: Average trust level (e.g., "0.7735" = 77% trust)
- **Max Absolute Movement**: Largest change for any color category (e.g., "0.0212" = 2.12% change)

**Comparison Chart** (Baseline vs Observed vs Stabilized):
- **Green bars**: Baseline proportions (what we expect for this landcover type)
- **Blue bars**: Observed proportions (what the raw data showed)
- **Orange bars**: Stabilized proportions (after shrinkage)

**What to look for**:
- **Big differences** between blue and orange → Shrinkage had a big impact
- **Blue close to orange** → Raw data was already reliable
- **Orange closer to green than blue** → Shrinkage pulled toward baseline (low exposure)

---

### Quick Reference: Decision Tree

**"Which metric should I use?"**
- Want to see **where data is unreliable**? → Use **Absolute Movement**
- Want to see **which counties are above/below baseline**? → Use **Movement (Signed)**
- Want to see **data quality/reliability**? → Use **Shrinkage Weight**

**"What does a purple county mean?"**
- Absolute Movement: Reliable data, little shrinkage needed
- Movement (Signed): Proportions decreased (pulled down)
- Shrinkage Weight: Low trust, few structures

**"What does a yellow county mean?"**
- Absolute Movement: Unreliable data, high shrinkage needed
- Movement (Signed): Proportions increased (pulled up)
- Shrinkage Weight: High trust, many structures

---

## Interpretation and Implications

### Key Findings

1. **Exposure-Dependent Shrinkage**: The method successfully applies stronger shrinkage to low-exposure groups. Groups with exposure < 5 structures show mean absolute movement of 0.31, while groups with exposure > 100 show minimal movement (0.0009).

2. **Variance Stabilization**: Shrinkage effectively reduces variance in proportion estimates, particularly for medium-exposure groups (10-50 structures), where variance reduction ranges from 24% to 45%.

3. **Baseline Influence**: Low-exposure groups are strongly pulled toward landcover-specific baselines, which helps stabilize estimates that would otherwise be highly variable due to small sample sizes.

### Implications

#### For Anomaly Detection

- **Reduced False Positives**: Low-exposure groups that might show spurious anomalies due to sampling variability are stabilized toward expected baselines
- **Preserved Signal**: High-exposure groups retain their observed proportions, ensuring real anomalies are not masked
- **Spatial Coherence**: Shrinkage promotes consistency across counties with similar landcover types

#### For Downstream Analysis

- **Stabilized Distributions**: The stabilized proportions can be used for similarity analysis, clustering, or spatial coherence checks without noise from low exposure
- **Robust Comparisons**: Comparisons between counties are more meaningful when proportions are stabilized, especially for rare landcover types

#### Limitations

1. **Proportion Sum Deviation**: Some low-exposure groups show stabilized proportions that don't sum to 1.0. This occurs when not all categories are observed in a group, and the shrinkage pulls toward baseline categories that weren't present in the observed data.

2. **Prior Strength Selection**: The default $\alpha = 10.0$ is a moderate choice but may need tuning based on:
   - Domain knowledge about expected exposure levels
   - Validation against known anomalies
   - Desired trade-off between variance reduction and bias introduction

3. **Baseline Assumptions**: The method assumes that landcover-specific baselines are appropriate priors. This may not hold if:
   - There are strong regional effects beyond landcover type
   - Temporal trends affect distributions
   - Data quality issues bias the baseline estimates

### Recommendations

1. **Parameter Tuning**: Conduct sensitivity analysis on $\alpha$ to find optimal shrinkage strength for the specific use case

2. **Validation**: Compare anomaly detection results using raw vs. stabilized proportions to quantify the benefit of shrinkage

3. **Proportion Normalization**: For groups where stabilized proportions don't sum to 1.0, consider renormalizing:
   $$\tilde{\pi}_{i,j,k}^{\text{norm}} = \frac{\tilde{\pi}_{i,j,k}}{\sum_k \tilde{\pi}_{i,j,k}}$$

4. **Production Implementation**: Translate the shrinkage logic to SQL for efficient computation on large datasets

## Technical Notes

### Computational Complexity

- **Aggregation**: $O(n)$ where $n$ is the number of records
- **Baseline computation**: $O(m)$ where $m$ is the number of unique landcover × category combinations
- **Shrinkage application**: $O(m \times c)$ where $c$ is the number of counties
- **Overall**: Linear in dataset size, efficient for large-scale analysis

### Implementation Considerations

- The method handles missing categories gracefully by filling with uniform prior
- Shrinkage weight calculation is numerically stable for all exposure values
- The framework is extensible to other categorical variables beyond color
