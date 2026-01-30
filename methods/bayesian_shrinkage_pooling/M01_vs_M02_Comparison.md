# M01: Conditional Probability vs M02: Empirical Bayes Pooling

## How M01 (Conditional Probability) Works

### Overview
M01 computes **surprisal scores** on-the-fly from the raw dataset. It's flexible and interactive but slower because it calculates everything in real-time.

### Key Features

#### 1. **Context Columns** (What you're conditioning on)
- **Default**: `['lc_type', 'fips']` (landcover type + county)
- **Options**: You can add/remove:
  - `fips` - County
  - `lc_type` - Landcover type
  - `bldgtype` - Building type
  - `st_damcat` - Occupancy type
- **What it does**: Groups data by these columns to compute conditional probabilities
- **Example**: If context = `['lc_type', 'fips']`, it computes: "Given forest landcover in Alameda County, what's the probability of each color?"

#### 2. **Target Column** (What you're predicting)
- **Options**: `clr` (color), `bldgtype`, `st_damcat`
- **What it does**: Computes surprisal for each value of the target
- **Example**: Target = `clr` → "How surprising is it to see 'cocoa' color given the context?"

#### 3. **Minimum Support** (Filter threshold)
- **Default**: 30 structures
- **What it means**: Only show combinations where `context_total >= min_support`
- **Formula**: `context_total = number of structures matching the context`
- **Example**: 
  - Context = `['forest', '06001']` (forest in Alameda County)
  - If there are only 10 structures → `reliable = False` (filtered out)
  - If there are 50 structures → `reliable = True` (shown)
- **Purpose**: Filters out unreliable estimates based on small sample sizes

#### 4. **Computation Process** (What happens when you click "Run Analysis")

**Step 1: Group and Count**
```python
# Count structures for each context + target combination
counts = df.group_by(['lc_type', 'fips', 'clr']).agg(pl.len())
# Result: forest, 06001, cocoa → 3656 structures

# Count total structures for each context
context_totals = df.group_by(['lc_type', 'fips']).agg(pl.len())
# Result: forest, 06001 → 10026 total structures
```

**Step 2: Compute Global Prior**
```python
# Overall distribution of target (across all data)
global_prior = df.group_by('clr').agg(pl.len())
# Result: cocoa → 30% of all structures
```

**Step 3: Estimate Alpha (Shrinkage Parameter)**
- Uses Empirical Bayes to estimate optimal shrinkage strength
- Balances between observed data and global prior

**Step 4: Compute Conditional Probability**
```python
prob = (count + alpha * p_global) / (context_total + alpha)
# Shrinks toward global prior when context_total is small
```

**Step 5: Compute Surprisal**
```python
surprisal = -log(prob)
# High surprisal = unexpected, low surprisal = expected
```

**Step 6: Filter by Minimum Support**
```python
reliable = context_total >= min_support
# Only keep combinations with enough data
```

#### 5. **Visualization Options**

**Counties View** (`/map/counties`):
- Aggregates surprisal scores by county
- Shows `max_surprisal` and `mean_surprisal` per county
- Uses county GeoJSON boundaries
- **What it shows**: Which counties have the most surprising combinations

**Hexes View** (`/map/hexes`):
- Shows surprisal at H3 hex level (resolution 5-9)
- More granular than counties
- Can zoom to see individual hex cells
- **What it shows**: Specific locations with surprising combinations

### Why M01 Takes Time
- Processes ~2.4M rows on every request
- Groups by multiple columns
- Computes probabilities and surprisal scores
- Filters and aggregates results
- **Typical time**: 5-30 seconds depending on context columns

---

## How M02 (Empirical Bayes Pooling) Works

### Overview
M02 uses **pre-computed** Bayesian shrinkage results. It's fast because all calculations are already done, but less flexible.

### Key Features

#### 1. **Fixed Structure**
- **Data is pre-aggregated**: County × Landcover × Color
- **Already computed**: Baseline distributions, shrinkage weights, stabilized proportions
- **No flexibility**: Can't change context columns or target

#### 2. **Landcover Filter**
- **Options**: All landcover types OR specific type (forest, urban, etc.)
- **What it does**: Filters the pre-computed data by landcover type
- **Fast**: Just filtering, no computation

#### 3. **Metric Selection**
- **Absolute Movement**: Magnitude of change
- **Movement (Signed)**: Direction of change
- **Shrinkage Weight**: Data reliability
- **What it does**: Selects which pre-computed column to visualize

#### 4. **No Minimum Support Filter** (Currently)
- All data is shown regardless of exposure
- Low-exposure combinations are included (they just have high movement/low weight)

#### 5. **Visualization**
- **Only Counties**: No hex-level view (data is aggregated to county level)
- **Pre-computed**: No on-the-fly computation

### Why M02 is Fast
- Data already processed and saved to CSV
- Just filtering and aggregating pre-computed values
- **Typical time**: < 1 second

---

## Key Differences Summary

| Feature | M01: Conditional Probability | M02: Empirical Bayes Pooling |
|---------|------------------------------|------------------------------|
| **Data Source** | Raw dataset (2.4M rows) | Pre-computed CSV files |
| **Computation** | On-the-fly (slow) | Pre-computed (fast) |
| **Context Columns** | Flexible (choose any combination) | Fixed (county × landcover) |
| **Target** | Flexible (clr, bldgtype, st_damcat) | Fixed (clr only) |
| **Minimum Support** | Yes (filters unreliable estimates) | No (currently) |
| **Visualization** | Counties OR Hexes | Counties only |
| **What it shows** | Surprisal (unexpectedness) | Shrinkage effects (movement, weight) |
| **Use Case** | Explore different combinations | Understand shrinkage impact |

---

## Should M02 Have More Options?

### Current Limitations of M02

1. **No Minimum Support Filter**
   - Currently shows ALL county × landcover combinations
   - Even very low-exposure ones (2-5 structures)
   - These might not be meaningful to visualize

2. **No Hex-Level View**
   - Only shows county-level aggregation
   - Can't see spatial patterns within counties
   - Less granular than M01

3. **Fixed Target**
   - Only shows color (`clr`)
   - Can't analyze `bldgtype` or `st_damcat` shrinkage

4. **Fixed Context**
   - Always county × landcover
   - Can't explore other combinations

### What Options Would Make Sense for M02?

#### ✅ **1. Minimum Exposure Filter** (Highly Recommended)

**What it would do**: Filter out county × landcover combinations with exposure below threshold

**What "minimum exposure" means**:
- Same as "minimum support" but for pre-computed data
- Threshold for total structures in that county × landcover combination
- **Example**: min_exposure = 20 → Only show combinations with ≥ 20 structures

**Why it's useful**:
- Removes noise from very low-exposure combinations
- Focuses on meaningful patterns
- Similar to M01's min_support but applied to exposure

**Implementation**:
```python
if req.min_exposure:
    data = data.filter(pl.col("exposure") >= req.min_exposure)
```

**Default value**: Could use 20 (based on exposure bin analysis showing meaningful patterns start around 20-50)

#### ✅ **2. Hex-Level Visualization** (Moderately Useful)

**What it would require**:
- Need to aggregate stabilized data to H3 hex level
- Would need to compute hex-level statistics from county × landcover data
- More complex but doable

**Why it might be useful**:
- See spatial patterns within counties
- Identify specific locations with high/low shrinkage
- More granular than county-level

**Challenge**: 
- Current data is aggregated to county × landcover level
- Would need to map back to H3 hexes using the original dataset
- Might require additional computation or pre-processing

#### ⚠️ **3. Multiple Targets** (Less Useful)

**Why it's less useful**:
- Bayesian shrinkage was specifically designed for color distributions
- Other targets (bldgtype, st_damcat) would need separate shrinkage calculations
- Would require pre-computing separate datasets for each target
- Current focus is on color, which is the most variable

**If implemented**: Would need separate CSV files for each target

#### ⚠️ **4. Flexible Context** (Not Recommended)

**Why it's not recommended**:
- Defeats the purpose of pre-computation
- Would require on-the-fly computation (like M01)
- M01 already handles this use case
- M02's value is speed through pre-computation

---

## Recommended: Add Minimum Exposure Filter

### What It Would Do

**Filter low-exposure combinations**:
- Hide county × landcover combinations with very few structures
- Focus visualization on reliable data
- Similar to M01's min_support but for exposure

**Example**:
- min_exposure = 20 → Only show combinations with ≥ 20 structures
- min_exposure = 100 → Only show combinations with ≥ 100 structures (high reliability)

### How It Would Work

**In the backend**:
```python
class BayesianMapRequest(BaseModel):
    lc_type: str | None = None
    metric: str = "movement"
    color_category: str | None = None
    min_exposure: int = 0  # NEW: Filter by minimum exposure
```

**In the endpoint**:
```python
if req.min_exposure:
    data = data.filter(pl.col("exposure") >= req.min_exposure)
```

**In the frontend**:
- Add a slider or input for "Minimum Exposure"
- Default: 0 (show all) or 20 (recommended)
- Filter applies before aggregation

### What It Would Show

**With min_exposure = 0** (current behavior):
- Shows all counties, even those with very low exposure
- Some counties might have high movement just because they have 2-3 structures

**With min_exposure = 20**:
- Only shows county × landcover combinations with ≥ 20 structures
- More reliable patterns
- Focuses on meaningful shrinkage effects

**With min_exposure = 100**:
- Only shows high-exposure combinations
- Very reliable data
- Shows where shrinkage had minimal impact (low movement, high weight)

---

## Summary: What Each Method is Best For

### Use M01 When:
- ✅ You want to explore different context/target combinations
- ✅ You need hex-level granularity
- ✅ You want to analyze surprisal (unexpectedness)
- ✅ You can wait 5-30 seconds for computation
- ✅ You want flexible filtering

### Use M02 When:
- ✅ You want to understand shrinkage effects specifically
- ✅ You need fast results (< 1 second)
- ✅ You're focused on color distributions
- ✅ County-level view is sufficient
- ✅ You want to see baseline vs stabilized comparisons

### Add to M02:
- ✅ **Minimum Exposure Filter** - Filter out low-exposure combinations
- ⚠️ **Hex-Level View** - If spatial granularity is needed (requires more work)
- ❌ **Multiple Targets** - Not necessary (M01 handles this)
- ❌ **Flexible Context** - Defeats purpose of pre-computation
