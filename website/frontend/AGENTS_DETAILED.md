# Frontend Deep-Dive: Wildfire Property Intelligence Dashboard

> **Purpose**: This document provides a comprehensive, AI-agent-friendly breakdown of the `website/frontend` codebase. Use it to understand architecture, data flows, component responsibilities, and conventions before making changes.

---

## 1. Project Overview

**Domain**: California county geospatial analysis for wildfire property data quality and anomaly detection.

**Core goal**: Visualize aggregated NSI (National Structure Inventory) property data across 58 California counties. The app helps analysts detect reporting inconsistencies, spatial patterns, and distributional anomalies using multiple statistical methods.

**Data context** (from `results.md`):
- ~2.4M structure records aggregated at H3 hex + county level
- Key attributes: `fips`, `lc_type` (landcover), `clr` (color), `bldgtype`, `st_damcat`, `clr_cc` (exposure/count)
- 13 landcover types (urban, forest, urban+forest, etc.)
- Error tokens `foo` and `bar` exist; color vocabularies vary by county

---

## 2. Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React 19 + TypeScript |
| Build | Vite 7 |
| Styling | Tailwind CSS v4 |
| Maps | MapLibre GL (maplibre-gl) |
| Charts | D3.js (direct DOM/SVG), Recharts (via components) |
| Math | KaTeX (react-katex) for formulas |
| Icons | Tabler Icons, Lucide React |
| Theme | next-themes (dark/light mode) |
| Utilities | clsx + tailwind-merge (via `cn()`), Zod |

---

## 3. Entry Point and Routing

### `src/main.tsx`
- Single entry: mounts React root into `#root`
- **ThemeProvider** (next-themes) wraps the app: `attribute="class"`, **`defaultTheme="dark"`** (site loads in dark mode by default), `enableSystem`
- **Path-based split**: If path is `/viz`, renders `VizIntroduction` (scrollytelling); otherwise renders `Router`
- **Hash handling**: `Router` and `HomePage` sync `#poster` / `#paper` → `PdfViewerModal` opens; Router switches to home if on another page
- No React Router — uses custom `useState`-based page switching

### `src/Router.tsx`
- **State**: `page: Page` drives which view is visible
- **Layout**: `SidebarProvider` → `AppSidebar` + `SidebarInset` (header + main content)
- **Pages** (by `Page` type):
  - `home` → `HomePage`
  - `conditional-probability` → `ConditionalProbability`
  - `empirical-bayes` → `EmpiricalBayesPooling`
  - `neighbor-divergence` → `NeighborDivergence`
  - `c2st` → `C2STMap`
  - `morans-i` → `MoransIMap`
  - `group-divergence` → `GroupDivergence`
  - `color-map` → `ColorMap`
- All map pages use `flex flex-1 flex-col min-h-0` for proper fill; home uses `overflow-y-auto` for scrolling content

---

## 4. Layout Components

### `src/components/app-sidebar.tsx`
- Defines `Page` type and `navItems` (title, id, icon, optional href for external links like Case Study → `/viz`)
- Renders `Sidebar` with header ("Wildfire Property Intelligence: Finding Outliers..." + flame icon) and `NavMain`
- Header and all nav items use `--button-accent` (green light / orange dark)
- Receives `currentPage` and `onPageChange` — controlled by `Router`

### `src/components/nav-main.tsx`
- Renders sidebar menu from `items`
- Each `SidebarMenuButton` has `isActive`, `onClick`, `tooltip`
- Highlights active page

### `src/components/site-header.tsx`
- Fixed header with `SidebarTrigger`, separator, page title, and **ThemeToggle** (top-right)
- Height from CSS var `--header-height` (set in Router)
- Title comes from `pageTitles` map in Router; uses `--button-accent` (green light / orange dark)

### `src/components/ThemeToggle.tsx`
- Sun/Moon icons (lucide-react); toggles dark/light via `useTheme()` from next-themes
- **Styling**: `text-[var(--button-accent)]` — icons are **green** in light mode, **orange** in dark mode; `hover:bg-[var(--button-accent)]/10`
- Rendered in site header (dashboard) and fixed top-right on `/viz` page

### `src/components/PdfViewerModal.tsx`
- Full-viewport modal for PDF display (poster, paper)
- **Props**: `target: 'poster' | 'paper' | null`, `onClose`
- **URL hash**: `#poster` or `#paper` opens modal; closing clears hash
- **PDF paths**: Poster = `/images/capstone_poster.pdf`, Paper = `/images/capstone_paper.pdf`
- **Export**: `getPdfTargetFromHash()` — reads hash for initial/open state

---

## 5. Data Sources

The frontend uses **static JSON files** from `public/data/`. Vite serves `public/` at root, so `/data/foo.json` → `public/data/foo.json`.

| File | Used By | Purpose |
|------|---------|---------|
| `group-divergence.json` | ConditionalProbability, EmpiricalBayesPooling, NeighborDivergence, MoransIMap, VizIntroduction | County GeoJSON features (geometry) + map metadata. Viz: geoFeaturesRef for buildCountyDetailAllLandcover |
| `conditional-pooling-summary.json` | ConditionalProbability, VizIntroduction | County×landcover summary (kl_div, l1_distance, top_color, etc.). Viz: processKLByFipsSdOnly |
| `conditional-pooling-detail.json` | ConditionalProbability, VizIntroduction | County×landcover×color detail rows. Viz: buildCountyDetailAllLandcover |
| `bayesian-baseline.json` | EmpiricalBayesPooling | Landcover baseline distributions |
| `bayesian-stabilized.json` | EmpiricalBayesPooling | Stabilized distributions post-shrinkage |
| `neighbor-divergence-map.json` | NeighborDivergence, StickyGraphic | Counties GeoJSON (fips, max_divergence) + edges (fips_a, fips_b, weighted_jsd). StickyGraphic: county fill layer, SD edges, choropleths |
| `neighbor-divergence-map-pooled.json` | NeighborDivergence | Same structure, colors merged into groups |
| `county-pair-comparisons.json` | NeighborDivergence, C2STMap, VizIntroduction | County A vs B distributions + JSD (original) |
| `case_study_sd_region.json` | VizIntroduction | San Diego region: counties, exposure, distributions, sd_vs_neighbors (original + **pooled** JSD) |
| `neighbor-jsd-pooled-greedy.json` | VizIntroduction | Post-pooling weighted_jsd/mean_jsd per pair; `processPooledJsdByFips` → max per county → post-pooling map choropleth. Also used by case_study for sd_vs_neighbors |
| `color-pool-merge-tree.json` | ColorPoolDendrogram | D3-ready dendrogram tree (merge sequence from greedy algorithm) |
| `h3-color-cells.json` | ColorMap | H3 hex cells (optional) |
| `c2st-results.json` | C2STMap | C2ST rows (fips_a, fips_b, lc_type, accuracy, etc.) |
| `morans-freq.json` | MoransIMap | Relative frequencies (fips, lc_type, bldgtype, freq) |
| `ca-county-neighbors.json` | MoransIMap | Adjacency list (county_fips, neighbor_fips) |
| `county-colors.json` | GroupDivergence | Per-county color distributions by landcover |
| `conditioning-options.json` | (Referenced in AGENTS; may be unused) | Filter options |

**Viz-specific data** (scrollytelling at `/viz`):

| File | Structure | Viz Usage |
|------|-----------|-----------|
| `neighbor-divergence-map.json` | `{ counties: GeoJSON, edges: GeoJSON, stats }` — counties have `fips`, `max_divergence`; edges have `fips_a`, `fips_b`, `weighted_jsd` | StickyGraphic: counties layer, SD edges layer |
| `neighbor-jsd-pooled-greedy.json` | `{ "06001-06013": { weighted_jsd, mean_jsd }, ... }` | VizIntroduction: `processPooledJsdByFips` → `jsdByFips` (max JSD per county) → `showPostPoolingChoropleth` |
| `case_study_sd_region.json` | `{ counties, exposure, distributions, sd_vs_neighbors: { "06073-06025": { county_a, county_b, jsd: { original, pooled } }, ... } }` | SpotlightComparison, PostPoolingScoresCard; comparisonData prefers sd_vs_neighbors |
| `conditional-pooling-summary.json` | `SummaryRow[]`: `{ fips, lc_type, kl_div, top_color, ... }` | `processKLByFipsSdOnly` → mean KL per SD county; `buildCountyDetailAllLandcover` uses detail |
| `conditional-pooling-detail.json` | `DetailRow[]`: `{ fips, lc_type, clr, y_county, y_pool, p_county, p_pool, ... }` | `buildCountyDetailAllLandcover` — aggregates by color across all landcovers |
| `group-divergence.json` | `{ map: { features: GeoJSON.Feature[] } }` | Geo features for county names in buildCountyDetailAllLandcover |
| `color-pool-merge-tree.json` | `{ name, value?, children?: TreeNode[] }` | ColorPoolDendrogram D3 tree |

**Note**: Vite config also proxies `/conditional-pooling`, `/map`, `/c2st`, `/bayesian`, `/morans-i`, `/group-divergence` to `http://localhost:8000`. Current map components use static JSON; the proxy is for potential live API integration.

---

## 6. Map Components — Shared Patterns

All map views share:

- **MapLibre**: Single `maplibregl.Map` instance in `useRef`
- **Base style**: CartoDB Voyager (`https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json`)
- **Center/zoom**: Typically `[-119.5, 37.0]` or `[-119.5, 37.5]`, zoom `5.5` (California)
- **Controls**: `NavigationControl` in top-right
- **Fullscreen**: Escape key and fullscreen toggle button
- **Detail panel**: Bottom sheet (collapsible) for county drill-down
- **COLOR_MAP**: Inline map from color name → hex (e.g. `foo`/`bar` → gray placeholder)

---

## 7. Page-by-Page Breakdown

### 7.1 HomePage (`src/HomePage.tsx`)
- Static content: authors, mentors, intro, methods
- **About section**: Three centered buttons — Report, Poster, GitHub (FileText, Presentation, Github icons from lucide-react). Report and Poster open `PdfViewerModal`; GitHub links to repo. Uses `--button-accent` for styling.
- **PdfViewerModal**: Rendered when `pdfModalTarget` is 'poster' or 'paper'; state synced with URL hash (`#poster`, `#paper`).
- Uses `react-katex` `BlockMath` and `InlineMath` for formulas
- **Methods section** documents (each `MethodLink` navigates to page on click):
  - Empirical Bayes shrinkage (with "See the math" — shrinkage formula)
  - **Conditional Probability & Spatial Pooling** (with "See the math" — pooled counts, surprisal formula)
  - **Kullback Leibler Divergence** — nested subsection (indented, `border-l-2 border-muted`). Own explanation: KL measures county vs neighbor-pooled deviation; per-color contributions; over/under-represented. "See the math": \(\mathrm{KL}(p_c \| p^{\mathrm{pool}}) = \sum_k p_{ck}\log(p_{ck}/p_k^{\mathrm{pool}})\). Both Conditional Probability and KL link to `conditional-probability` page.
  - Jensen–Shannon neighbor divergence
  - Group-level divergence
  - C2ST (Classifier Two-Sample Test)
  - Moran's I
- Results summary cards: mean neighbor JSD raw vs pooled
- Uses `Section`, `P`, `Legend`, `Dropdown` helper components

### 7.2 ConditionalProbability (`src/ConditionalProbability.tsx`)
**Concept**: Conditional probability with neighbor pooling — county color distribution vs. pooled (county + adjacent counties). KL divergence and L1 distance measure anomaly.

**Data flow**:
1. Load `conditional-pooling-summary.json`, `conditional-pooling-detail.json`, `group-divergence.json` on mount
2. `buildMapData()` aggregates by fips, computes mean/max of `kl_div` or `l1_distance` per county
3. Map choropleth colors counties by selected metric (D3 `interpolateViridis`)

**Filters**: Metric (kl_div | l1_distance), landcover type (or "All")

**Interactions**:
- Click county → `loadCountyDetail()` → bottom panel with per-landcover breakdown
- Hover → popup with exposure, mean metric, neighbor count

**Detail panel** (per landcover):
- Color distribution bars (KL contribution, sorted by |contrib|)
- Deviation chart (county vs pool, over/under)
- Top contributors chart
- D3 bar charts: `ComparisonChart`, `DeviationChart`, `TopContributorsChart`

**Key types**: `SummaryRow`, `DetailRow`, `CountyDetail`, `LandcoverDetail`, `ColorDistribution`

### 7.3 EmpiricalBayesPooling (`src/EmpiricalBayesPooling.tsx`)
**Concept**: Empirical Bayes shrinkage — raw color proportions shrunk toward landcover baseline. Map shows **mean absolute movement** (how much proportions changed).

**Data flow**:
1. Load `bayesian-baseline.json`, `bayesian-stabilized.json`, `group-divergence.json`
2. `buildMapData()` aggregates by fips: mean/max of `abs_movement`, mean shrinkage weight, top_color with largest movement
3. Choropleth by mean abs_movement (Viridis)

**Filters**: Landcover (or All)

**Detail panel**:
- Per landcover: exposure, mean shrinkage weight, max movement
- Color distribution bars (signed movement) — positive = pulled toward baseline, negative = pulled away
- `ComparisonChart`: baseline vs observed vs stabilized (3 bars per color)

**Key types**: `BaselineDistribution`, `StabilizedDistribution`, `CountyDetail`, `CountyMapData`

### 7.4 NeighborDivergence (`src/NeighborDivergence.tsx`)
**Concept**: Jensen–Shannon divergence between **adjacent** county pairs. Edges connect neighboring counties; edge color = weighted JSD. Compare raw vs merged (pooled) color groups.

**Data flow**:
1. Load `neighbor-divergence-map.json`, `county-pair-comparisons.json`
2. Optional: `neighbor-divergence-map-pooled.json` when "Pooled Colors" is on
3. Map shows counties (light fill) + edges (line color from JSD)
4. Click edge → comparison panel with county A vs B color distributions

**Features**:
- **Dual map view**: Original | Merged side-by-side when "Pooled Colors" enabled
- **Color groups**: Browns, Reds, Greens, Blues/Purples, Grays — `poolDistributions()` merges colors before JSD
- **Comparison panel**: Side-by-side bars, unique-to-A/B, shared colors, JSD original vs merged, vocab overlap
- **Keybinds**: E toggles edge visibility, Esc exits fullscreen

**Key types**: `DivergenceData`, `SelectedPair`, `ComparisonResult`, `FeatureDist`, `COLOR_GROUPS_MAP`

### 7.5 C2STMap (`src/C2STMap.tsx`)
**Concept**: Classifier Two-Sample Test — how well can a classifier distinguish two county distributions? Higher accuracy = more different.

**Data flow**:
1. Load `c2st-results.json`, `county-pair-comparisons.json`
2. `buildEdgesGeoJSON()` builds line features between county centroids; color = accuracy
3. Filter by landcover: when selected, edges show that lc_type only; when empty, average accuracy across landcovers

**Interactions**:
- Click edge → pair comparison panel
- Accuracy by landcover table; click row → load county comparison distributions
- Toggle feature: clr | bldgtype | st_damcat for distribution view
- Insufficient data (<50 records) shown separately

**Color scale**: 50% (similar) → 100% (different), Viridis-like gradient

**Key types**: `C2STRow`, `C2STData`, `PairComparison`, `LcAccuracy`, `CountyComparison`

### 7.6 MoransIMap (`src/MoransIMap.tsx`)
**Concept**: Local Moran's I — spatial autocorrelation. High I = county similar to neighbors (clustering); low = outlier.

**Data flow**:
1. Load `morans-freq.json`, `ca-county-neighbors.json`, `group-divergence.json`
2. `computeMoransI()` runs client-side: filters by lc_type/bldgtype, builds adjacency, standardizes values, computes local I per county
3. Choropleth: diverging scale (RdBu) — red = high clustering, blue = low/outlier

**Filters**: Landcover, building type (or All)

**Detail panel**: Per (lc_type × bldgtype) — county frequency, neighbor mean/min/max, deviation from neighbor mean

**Key types**: `FreqRow`, `NeighborRow`, `MoranMapData`, `CategoryDetail`, `CountyDetail`

### 7.7 GroupDivergence (`src/GroupDivergence.tsx`)
**Concept**: County-level JSD vs statewide baseline (landcover-conditioned). Single anomaly score per county×landcover.

**Data flow**:
1. Load `group-divergence.json`, `county-colors.json`
2. Map choropleth by `num_anomalies` or `avg_divergence`
3. Click county → right-side panel with per-landcover divergence + color strips (county vs statewide)

**Features**:
- `ColorStrips` / `SwatchStrip`: proportional color bars, hover for tooltip
- Anomalous landcovers highlighted in red

**Key types**: `LandcoverDivergence`, `ColorEntry`, `LandcoverColors`, `MapData`

---

## 8. VizIntroduction (Scrollytelling at `/viz`)

**Entry**: `main.tsx` checks `pathname === '/viz'` → renders `VizIntroduction` instead of `Router`.

### 8.1 Structure

- **ThemeToggle**: Fixed top-right on viz page (alongside "Back to Dashboard" top-left). Same Sun/Moon toggle as dashboard.
- **HeroSection**: Editorial intro (stakes, data, exposure, sample table). No map, no scrollama.
- **StickyGraphic**: Map fixed in viewport; zoom to **SD region only** (Imperial, Orange, Riverside, San Diego) for `spotlight`, `distributions`, `solution`, `postPooling`; draws SD–neighbor edges; legends in bottom-right per scene.
- **ScrollNarration**: react-scrollama drives **six** scroll steps; each triggers `onSceneEnter`/`onSceneProgress` → `activeScene`.

### 8.2 Scenes (`SceneId`)

| Scene | Step | Content | Map / Legend |
|-------|------|---------|--------------|
| `hero` | — | HeroSection | — |
| `counties` | 130vh | NarrationCard — "58 counties report this data independently." | Text: `text-foreground font-medium` (heading), `text-foreground` (paragraph) — readable in dark mode. `revealChoropleth(progress)` — Max Divergence choropleth (full state). Legend: "Max Divergence" + gradient Low/High |
| `spotlight` | 140vh | `SpotlightComparison` — "Same border. Different data." | County names **bold** `text-foreground`; structure count, color labels, percentages `text-muted-foreground`/`text-foreground`; bar track `bg-muted`. All theme-aware for dark mode. `spotlightCounties` — gray fill, SD edges. Legend: county names (teal/purple swatches) |
| `distributions` | 120vh | `KLDivergenceCard` — "{County} Deviation from Regional Norm" (no em dash) | Title format without "—". Expanded intro (regional norm, red/blue bars, click county). Closing: land cover, divergence as naming convention. **Removed** "Click another county on the map...". `showKLChoropleth(klByFips)` — 4 SD counties colored by mean KL, rest gray. Legend: "KL Divergence". **Layout**: Card on **right** (`justify-end`), legend bottom-right |
| `solution` | 120vh | `SolutionCard` — greedy pooling, ColorPoolDendrogram | `spotlightCounties` — zoomed to SD region. **Layout**: Card **centered** (`justify-center`) |
| `postPooling` | 140vh | `PostPoolingScoresCard` + map choropleth | `showPostPoolingChoropleth(jsdByFips)` — 4 SD counties by pooled JSD (green scale), rest gray. Legend: "Post-pooling JSD" |

### 8.3 Data Flow (VizIntroduction)

**Loaded on mount** (6 fetches in `Promise.all`):
1. `county-pair-comparisons.json` → `pairComparisons`
2. `case_study_sd_region.json` → `caseStudyData`
3. `conditional-pooling-summary.json` → `cpSummaryRef`; `processKLByFipsSdOnly` → `klByFips` (SD region only)
4. `conditional-pooling-detail.json` → `cpDetailRef`
5. `group-divergence.json` → `geoFeaturesRef`; county names for `buildCountyDetailAllLandcover`
6. `neighbor-jsd-pooled-greedy.json` → `processPooledJsdByFips` → `jsdByFips` (max pooled JSD per county)

**processPooledJsdByFips** (`VizIntroduction.tsx`):
- Input: `{ "06001-06013": { weighted_jsd, mean_jsd }, ... }`
- For each county fips, collect all pair `weighted_jsd` where fips appears; return `max`
- Output: `Record<string, number>` e.g. `{ "06073": 0.23, "06025": 0.22, ... }`

**processKLByFipsSdOnly** (`VizIntroduction.tsx`):
- Filters `conditional-pooling-summary` to SD_FIPS `[6025, 6059, 6065, 6073]`
- Mean KL per county → `Record<string, number>`

**buildCountyDetailAllLandcover** (`src/lib/conditionalPooling.ts`):
- Aggregates `conditional-pooling-detail` by color across **all landcovers** for a county
- Returns `CountyDetail` with single `by_landcover: [{ lc_type: "All land cover types", distributions: ColorDistribution[] }]`
- Used by `KLDivergenceCard` for Deviation table (diverging bars: red = over, blue = under)

**comparisonData** (passed to SpotlightComparison + StickyGraphic):
- When `selectedPair` null: default `sd_vs_neighbors['06073-06059']`
- Prefers `caseStudyData.sd_vs_neighbors` for SD pairs (has `jsd.pooled`)
- SD pair keys: `06073-06025`, `06073-06059`, `06073-06065`

### 8.4 StickyGraphic — MapApi

| Method | When | Behavior |
|--------|------|----------|
| `showCounties` | hero | Uniform fill, labels visible |
| `revealChoropleth(progress)` | counties | Interpolate `max_divergence` → Viridis; opacity by progress |
| `spotlightCounties` | spotlight, solution | `flyTo(SPOTLIGHT_CENTER, SPOTLIGHT_ZOOM)`; gray fill `#e8e8e4`; SD edges visible; click edge → `onEdgeSelect` |
| `showKLChoropleth(klByFips, onCountySelect)` | distributions | Merge `mean_kl` into features; SD region only colored, rest gray (`#e8e8e4`); `case` expr; flyTo SPOTLIGHT; click county → `onCountySelect` |
| `showPostPoolingChoropleth(jsdByFips)` | postPooling | Merge `pooled_jsd` into features; SD region only; normalize to 0–1 with max 0.6 (green scale); `case` expr; flyTo SPOTLIGHT |
| `resetFromSpotlight` | hero (scroll up) | flyTo MAP_CENTER, uniform fill, hide edges |

**Zoom enforcement** (`useEffect` in StickyGraphic):
- When `scene` ∈ `['spotlight', 'distributions', 'solution', 'postPooling']` → `flyTo(SPOTLIGHT_CENTER, SPOTLIGHT_ZOOM)`
- Ensures map stays zoomed to SD region

**SD_REGION_FIPS**: `['06025', '06059', '06065', '06073']` (Imperial, Orange, Riverside, San Diego)

**Legends** (bottom-right `absolute bottom-8 right-6`):
- counties / distributions: "Max Divergence" or "KL Divergence" + Viridis gradient + Low/High
- spotlight: county names + teal/purple swatches (from `comparisonData`)
- postPooling: "Post-pooling JSD" + same Viridis gradient
- **Dark mode**: Legends use `bg-card/95`, `text-muted-foreground`

### 8.5 KLDivergenceCard — Deviation from Regional Norm

- **Title**: `{countyDetail.county_name} Deviation from Regional Norm` (no em dash "—").
- **Intro paragraph**: Explains regional norm (pools adjacent counties in SD region); "Click a county on the map to switch"; red bars = over-represented, blue = under.
- **Closing paragraph**: `{allLc.lc_type}`; divergence reflects naming choices (e.g. "cocoa" vs "brown"). **Removed** "Click another county on the map to compare Imperial, Orange, or Riverside."
- **Layout**: Positioned on **right** (`justify-end`); `border-r-4` accent (right border).
- **Dark mode**: Uses `bg-card/95`, `text-muted-foreground`, `text-foreground`, `bg-muted/30` for DeviationTable.
- **Scope**: SD region only. **All land cover types** aggregated (no per-landcover breakdown).
- **Default**: San Diego (06073) on enter; click another county to switch.
- **Data**: `countyKlDetail` from `buildCountyDetailAllLandcover(fipsNum, cpDetailRef.current, geoFeaturesRef.current)`
- **Display**: Single table — `DeviationTable` with diverging bars (p_county − p_pool per color). Red = over-represented, blue = under. Legend: Under / Over.

### 8.6 PostPoolingScoresCard

- **Dark mode**: Uses `bg-card/95`, `bg-background` for pair rows, `text-muted-foreground`.
- **Data**: `caseStudyData.sd_vs_neighbors` — keys `06073-06025`, `06073-06059`, `06073-06065`
- **Display**: SD vs Imperial, Orange, Riverside — original JSD → pooled JSD per pair
- **Legend**: Original (navy) / Pooled (green) swatches

### 8.7 ColorPoolDendrogram

- Loads `color-pool-merge-tree.json`
- **Initial scale**: 0.65 (zoomed out)
- D3 cluster layout, d3-zoom; click branch → focus; click background → reset to 0.65
- `COLOR_MAP`, `GROUP_COLORS` for node colors

### 8.8 File Paths

| Path | Purpose |
|------|---------|
| `src/VizIntroduction.tsx` | Orchestrator; 6 fetches; applyScene; handleSceneEnter; handleMapReady |
| `src/viz-intro/HeroSection.tsx` | Editorial intro |
| `src/viz-intro/StickyGraphic.tsx` | Map, MapApi, legends, zoom enforcement |
| `src/viz-intro/ScrollNarration.tsx` | Scrollama steps, cards |
| `src/viz-intro/SpotlightComparison.tsx` | County A vs B color bars |
| `src/viz-intro/KLDivergenceCard.tsx` | Deviation from Regional Norm |
| `src/viz-intro/PostPoolingScoresCard.tsx` | Post-pooling JSD scores |
| `src/viz-intro/ColorPoolDendrogram.tsx` | D3 dendrogram |
| `src/viz-intro/constants.ts` | MAP_CENTER, SPOTLIGHT_CENTER, SPOTLIGHT_ZOOM, SceneId, DIVERGENCE_STOPS |
| `src/lib/conditionalPooling.ts` | buildCountyDetail, buildCountyDetailAllLandcover, SummaryRow, DetailRow, CountyDetail, ColorDistribution |

---

## 9. Notebook → JSON Data Pipeline (Viz-Specific)

The scrollytelling at `/viz` depends on JSON files produced by notebooks and scripts. Regenerate in this order:

### 9.1 `neighbor-jsd-pooled-greedy.json`

**Source**: `notebooks/methods/color_groupings/color_pool.ipynb`

- Run the greedy merge algorithm (produces `results` or `refined_results`)
- Run the **export cell** (after JSD evaluation)
- Output: `{ "06073-06025": { "weighted_jsd": 0.226, "mean_jsd": 0.272 }, ... }`
- Keys: `fips_a-fips_b` (smaller fips first)
- Export cell uses `Path.cwd()` and walks up to find `website/frontend/public/data/`

### 9.2 `color-pool-merge-tree.json`

**Source**: `scripts/build_merge_tree.py` or equivalent cell in color_pool notebook

- Builds D3-ready tree from `MERGE_LIST` (merged → canonical, votes)
- Output: nested `{ name, value?, children[] }` structure
- Run: `python scripts/build_merge_tree.py` from project root

### 9.3 `case_study_sd_region.json`

**Source**: `notebooks/eda/case_study.ipynb`

- **Requires**: `neighbor-jsd-pooled-greedy.json` (from step 9.1) must exist
- Loads `county-pair-comparisons.json` for SD pairs (06073 vs 06025, 06059, 06065)
- Loads `jsd_pooled` from `neighbor-jsd-pooled-greedy.json` if present
- Builds `sd_vs_neighbors` with `jsd: { original, pooled }` per pair
- Output path: `OUTPUT_PATH / 'case_study_sd_region.json'` = `website/frontend/public/data/case_study_sd_region.json`
- Run **all cells** including the "Load post-pooling JSD" cell (cell 8) and the "Build Case Study JSON" cell (cell 14)

### 9.4 `county-pair-comparisons.json`

**Source**: Backend export or pre-existing pipeline (see `website/_archive/backend/`)

- Structure: `{ "06059-06073": { county_a, county_b, jsd: { original } }, ... }`
- Used by VizIntroduction as fallback when case study sd_vs_neighbors lacks pooled
- Also used by NeighborDivergence, C2STMap

### 9.5 Dependency Graph

```
color_pool.ipynb (greedy merge + JSD)
    → neighbor-jsd-pooled-greedy.json
    → color-pool-merge-tree.json (via build_merge_tree.py)

case_study.ipynb
    ← county-pair-comparisons.json
    ← neighbor-jsd-pooled-greedy.json
    → case_study_sd_region.json (sd_vs_neighbors with jsd.original + jsd.pooled)

VizIntroduction
    ← county-pair-comparisons.json
    ← case_study_sd_region.json
    ← conditional-pooling-summary.json
    ← conditional-pooling-detail.json
    ← group-divergence.json
    ← neighbor-jsd-pooled-greedy.json

StickyGraphic
    ← neighbor-divergence-map.json
    ← comparisonData (from VizIntroduction, for spotlight legend)
    ← klByFips (for showKLChoropleth)
    ← jsdByFips (for showPostPoolingChoropleth)
```

---

## 10. UI Primitives and Utilities

### 10.1 `src/lib/utils.ts`
- `cn(...inputs)`: Merges class names via `clsx` + `tailwind-merge`. Use for conditional Tailwind classes.

### 10.2 `src/lib/chart-colors.ts`
- `chartColors`: Primary (sage), gradient, anomaly, sequential, diverging, categorical, text, axis
- `viridisColors`, `surprisalColors`: Legacy scales

### 10.3 `src/index.css` — Theme and Dark Mode

**Default theme**: `ThemeProvider` in `main.tsx` uses `defaultTheme="dark"` — site loads in dark mode. `enableSystem` allows toggle to follow system preference.

**Light mode** (`:root`):
- `--brand-orange`: oklch(0.6 0.18 45)
- `--button-accent`: oklch(0.5 0.12 145) — green for buttons, nav, titles

**Dark mode** (`.dark`):
- `--brand-orange`, `--heading-accent`: fire orange
- `--button-accent`: same as `--brand-orange` — orange for buttons, nav, titles

**Headings** (h1–h6): `color: var(--button-accent)` — green in light, orange in dark

**Dark mode overrides**:
- `.dark svg text`: fill = foreground (chart labels readable)
- `.dark svg .domain`, `.dark svg .tick line`: stroke = foreground
- MapLibre popups/controls: dark background, light text
- Cards, legends, control panels: use `bg-card`, `bg-card/95` (not `bg-white`)

**Other**:
- Tailwind imports + tw-animate-css
- Geist font (variable)
- Custom theme: sage palette, semantic tokens (background, foreground, muted, border)
- MapLibre popup/control overrides (styling to match app; dark variants for .dark)
- Radix/shadcn CSS variables (radius, colors)

### 10.4 `src/components/ui/*`
- Radix-based primitives: `button`, `card`, `input`, `label`, `select`, `tabs`, `tooltip`, `badge`, `separator`, `checkbox`, `dropdown-menu`, `sheet`, `drawer`, `skeleton`, `table`, `breadcrumb`, `avatar`, `sonner`, `toggle`, `toggle-group`
- `sidebar.tsx`: SidebarProvider, Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger, SidebarInset

---

## 11. Conventions and Best Practices

1. **Functional components + hooks** — No class components
2. **Tailwind for styling** — Utility classes; use `cn()` for conditional classes
3. **Map interactions** — Keep in MapLibre event handlers (`on`, `off`) and refs; avoid re-creating map
4. **Data loading** — `useEffect` + `fetch` on mount; store in state or refs; loading/error states handled
5. **FIPS format** — Backend uses integer; frontend displays as 5-digit string (`String(fips).padStart(5, '0')`)
6. **Color tokens** — `foo`/`bar` rendered as gray placeholder dot; real colors from `COLOR_MAP`
7. **Chart rendering** — D3 in `useCallback` + `useEffect` with `ResizeObserver` for responsiveness
8. **Path alias** — `@/` maps to `src/` (e.g. `@/components/ui/...`)

---

## 12. File Reference

| Path | Purpose |
|------|---------|
| `src/main.tsx` | Entry, path-based Router vs VizIntroduction |
| `src/Router.tsx` | Page state, layout, conditional page render |
| `src/HomePage.tsx` | Static content, methods, formulas |
| `src/ConditionalProbability.tsx` | Conditional pooling map + detail panel |
| `src/EmpiricalBayesPooling.tsx` | Empirical Bayes map + detail panel |
| `src/NeighborDivergence.tsx` | Neighbor JSD edges + dual map + comparison panel |
| `src/C2STMap.tsx` | C2ST edges + pair comparison panel |
| `src/MoransIMap.tsx` | Moran's I choropleth + detail panel |
| `src/GroupDivergence.tsx` | Group-level JSD choropleth + county panel (theme-aware cards) |
| `src/ColorMap.tsx` | Color distribution map |
| `src/VizIntroduction.tsx` | Scrollytelling orchestrator (HeroSection, StickyGraphic, ScrollNarration) |
| `src/viz-intro/HeroSection.tsx` | Editorial intro (no map) |
| `src/viz-intro/StickyGraphic.tsx` | Sticky map, SD edges, edge click → selectedPair |
| `src/viz-intro/ScrollNarration.tsx` | Scrollama steps; NarrationCard (counties) uses `text-foreground font-medium` for heading; SpotlightComparison, KLDivergenceCard, SolutionCard, PostPoolingScoresCard |
| `src/viz-intro/SpotlightComparison.tsx` | County A vs B bars, JSD original + pooled. Theme-aware: county names bold `text-foreground`; structure count, color labels, percentages, footer use `text-foreground`/`text-muted-foreground`; bar track `bg-muted` (no hardcoded grays) |
| `src/viz-intro/KLDivergenceCard.tsx` | Deviation from Regional Norm (All land cover types). Title without em dash; expanded intro and closing; removed "Click another county..." |
| `src/viz-intro/PostPoolingScoresCard.tsx` | Post-pooling JSD scores SD vs neighbors |
| `src/viz-intro/ColorPoolDendrogram.tsx` | Interactive D3 dendrogram (initialScale 0.65) |
| `src/viz-intro/constants.ts` | MAP_CENTER, SPOTLIGHT_CENTER, SPOTLIGHT_ZOOM, SceneId, DIVERGENCE_STOPS |
| `src/lib/conditionalPooling.ts` | buildCountyDetail, buildCountyDetailAllLandcover, SummaryRow, DetailRow, CountyDetail |
| `src/components/app-sidebar.tsx` | Sidebar + nav definition |
| `src/components/nav-main.tsx` | Nav menu renderer |
| `src/components/site-header.tsx` | Header bar + ThemeToggle |
| `src/components/ThemeToggle.tsx` | Sun/Moon theme switch |
| `src/components/PdfViewerModal.tsx` | Full-screen PDF viewer (poster, paper) |
| `src/lib/utils.ts` | `cn()` helper |
| `src/lib/chart-colors.ts` | Chart color tokens |
| `src/index.css` | Theme, base styles, MapLibre overrides |
| `vite.config.ts` | Vite config, proxy, path alias |
| `package.json` | Dependencies and scripts |

---

## 13. Backend API Reference (Proxy Targets)

If switching to live API, these endpoints are proxied from `/` to `http://localhost:8000`:

- `GET /conditional-pooling/landcover-types`
- `POST /conditional-pooling/map/counties`
- `GET /conditional-pooling/county/{fips}`
- `GET /bayesian/baseline-distributions`
- `POST /bayesian/map/counties`
- `GET /bayesian/county/{fips}`
- `GET /map/neighbor-divergence`
- `POST /map/neighbor-divergence-merged`
- `GET /conditioning-options`
- `POST /compare/counties`
- `GET /c2st/results`
- `GET /c2st/pair/{fips_a}/{fips_b}`
- `GET /morans-i/filters`
- `POST /morans-i/map`
- `GET /morans-i/county/{fips}`
- `GET /group-divergence/map`
- `GET /group-divergence/county/{fips}`
- `GET /group-divergence/county/{fips}/colors`

---

## 14. Development Commands

```bash
npm run dev     # Start Vite dev server
npm run build   # TypeScript check + Vite build
npm run lint    # ESLint
npm run preview # Preview production build
```

**To run with backend**: Start FastAPI backend at `localhost:8000` for proxy. Static data in `public/data/` must exist for map views to load.

---

## 15. Troubleshooting (Viz / Scrollytelling)

### Pooled JSD not showing in SpotlightComparison

- **Cause**: `case_study_sd_region.json` lacks `jsd.pooled` in `sd_vs_neighbors`.
- **Fix**: Run `notebooks/methods/color_groupings/color_pool.ipynb` export cell → `neighbor-jsd-pooled-greedy.json`; then run `notebooks/eda/case_study.ipynb` (all cells). Ensure case_study cell 8 (load pooled) ran and cell 14 (build JSON) ran.

### Post-pooling section: map shows KL colors (purple) instead of green

- **Cause**: Wrong data or scale. Post-pooling JSD uses `jsdByFips` from `neighbor-jsd-pooled-greedy.json`. Color scale uses max 0.6 so values 0.15–0.3 map to green.
- **Fix**: Ensure `neighbor-jsd-pooled-greedy.json` is fetched (6th in Promise.all). Check `processPooledJsdByFips` returns per-county max. If `jsdByFips` empty, falls back to `spotlightCounties` (gray).

### Post-pooling section: map zooms out to full state

- **Cause**: `showPostPoolingChoropleth` or zoom enforcement not running.
- **Fix**: `useEffect` in StickyGraphic enforces `flyTo(SPOTLIGHT_CENTER, SPOTLIGHT_ZOOM)` when `scene` ∈ `['spotlight','distributions','solution','postPooling']`. Ensure `handleSceneEnter` calls `showPostPoolingChoropleth` for postPooling. Check `handleMapReady` passes `jsdByFips` to `applyScene`.

### Post-pooling section: counties not colored (gray)

- **Cause**: `jsdByFips` empty when entering postPooling (race: data loads after scroll).
- **Fix**: `useEffect` in VizIntroduction re-applies `showPostPoolingChoropleth` when `activeScene === 'postPooling'` and `Object.keys(jsdByFips).length > 0`.

### KL / Deviation card: no county detail on click

- **Cause**: `buildCountyDetailAllLandcover` requires `cpDetailRef`, `geoFeaturesRef` populated. Non-SD counties not clickable.
- **Fix**: Ensure conditional-pooling-detail.json and group-divergence.json load. SD_REGION_FIPS = ['06025','06059','06065','06073'].

### Scroll stops at "Our solution" section

- **Cause**: Solution step had insufficient height.
- **Fix**: Solution step uses `min-h-[120vh]`. If stuck, increase or add padding.

### Dendrogram too zoomed in

- **Cause**: Initial scale was 1.0.
- **Fix**: ColorPoolDendrogram uses `initialScale = 0.65`; reset also uses 0.65.

### Dendrogram not loading

- **Cause**: `color-pool-merge-tree.json` missing or malformed.
- **Fix**: Run `python scripts/build_merge_tree.py` from project root.

### Case study data 404 / blank

- **Cause**: JSON files missing from `public/data/`.
- **Fix**: Run notebooks in order (see 9.5 Dependency Graph). All 6 viz data files must exist.

### PDF modal not opening from hash

- **Cause**: `PdfViewerModal` only renders when `page === 'home'` (inside HomePage). Hash `#poster` / `#paper` triggers `Router` to switch to home and `HomePage` to open modal.
- **Fix**: Ensure `Router` useEffect listens for hash; `HomePage` syncs `pdfModalTarget` from hash. Poster file must exist at `public/images/capstone_poster.pdf`. Paper at `public/images/capstone_paper.pdf` (add when ready).

### Dark mode: cards/legends still white

- **Cause**: Hardcoded `bg-white` or `bg-gray-50` in components.
- **Fix**: Use `bg-card`, `bg-card/95`, `bg-muted`, `text-muted-foreground` instead. Method pages (EmpiricalBayesPooling, ConditionalProbability, etc.) and GroupDivergence county cards should all use theme-aware classes.

### HomePage KL formula not rendering (KaTeX)

- **Cause**: Extra `}` in denominator breaks parsing. Correct formula: `\mathrm{KL}(p_c \,\|\, p^{\mathrm{pool}}) = \sum_{k} p_{ck}\,\log\frac{p_{ck}}{p_k^{\mathrm{pool}}}` (two closing braces in `p_k^{\mathrm{pool}}`, not three).
