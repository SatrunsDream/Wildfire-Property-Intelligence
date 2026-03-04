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
| Utilities | clsx + tailwind-merge (via `cn()`), Zod |

---

## 3. Entry Point and Routing

### `src/main.tsx`
- Single entry: mounts React root into `#root`
- **Path-based split**: If path is `/viz`, renders `VizIntroduction` (scrollytelling); otherwise renders `Router`
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
- All map pages use `flex flex-1 flex-col min-h-0` for proper fill; home uses `overflow-y-auto` for scrolling content

---

## 4. Layout Components

### `src/components/app-sidebar.tsx`
- Defines `Page` type and `navItems` (title, id, icon)
- Renders `Sidebar` with header ("Wildfire Intel" + flame icon) and `NavMain`
- Receives `currentPage` and `onPageChange` — controlled by `Router`

### `src/components/nav-main.tsx`
- Renders sidebar menu from `items`
- Each `SidebarMenuButton` has `isActive`, `onClick`, `tooltip`
- Highlights active page

### `src/components/site-header.tsx`
- Fixed header with `SidebarTrigger`, separator, and page title
- Height from CSS var `--header-height` (set in Router)
- Title comes from `pageTitles` map in Router

---

## 5. Data Sources

The frontend uses **static JSON files** from `public/data/`. Vite serves `public/` at root, so `/data/foo.json` → `public/data/foo.json`.

| File | Used By | Purpose |
|------|---------|---------|
| `group-divergence.json` | ConditionalProbability, EmpiricalBayesPooling, NeighborDivergence, MoransIMap, StickyGraphic | County GeoJSON features (geometry) + map metadata |
| `conditional-pooling-summary.json` | ConditionalProbability | County×landcover summary (kl_div, l1_distance, top_color, etc.) |
| `conditional-pooling-detail.json` | ConditionalProbability | County×landcover×color detail rows |
| `bayesian-baseline.json` | EmpiricalBayesPooling | Landcover baseline distributions |
| `bayesian-stabilized.json` | EmpiricalBayesPooling | Stabilized distributions post-shrinkage |
| `neighbor-divergence-map.json` | NeighborDivergence, StickyGraphic | Counties + edges (GeoJSON) with weighted_jsd |
| `neighbor-divergence-map-pooled.json` | NeighborDivergence | Same structure, colors merged into groups |
| `county-pair-comparisons.json` | NeighborDivergence, C2STMap, VizIntroduction | County A vs B distributions + JSD |
| `c2st-results.json` | C2STMap | C2ST rows (fips_a, fips_b, lc_type, accuracy, etc.) |
| `morans-freq.json` | MoransIMap | Relative frequencies (fips, lc_type, bldgtype, freq) |
| `ca-county-neighbors.json` | MoransIMap | Adjacency list (county_fips, neighbor_fips) |
| `county-colors.json` | GroupDivergence | Per-county color distributions by landcover |
| `conditioning-options.json` | (Referenced in AGENTS; may be unused) | Filter options |

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
- Uses `react-katex` `BlockMath` and `InlineMath` for formulas
- **Methods section** documents:
  - Empirical Bayes shrinkage
  - Conditional probability & spatial pooling
  - Moran's I
  - Jensen–Shannon neighbor divergence
  - C2ST (Classifier Two-Sample Test)
  - Group-level divergence
- Results summary cards: mean neighbor JSD raw vs pooled
- Uses `Section`, `P`, `Legend` helper components

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

**Structure**:
- `HeroSection`: Editorial intro (no map)
- `StickyGraphic`: Map fixed in viewport; scenes change on scroll
- `ScrollNarration`: ScrollNarration (react-scrollama) drives scene changes

**Scenes** (`SceneId`):
- `hero`: Counties visible, uniform or initial state
- `counties`: Choropleth reveal (progress 0→1)
- `spotlight`: Zoom to Napa/Sonoma, highlight edge

**Data**: Loads `neighbor-divergence-map.json`, `county-pair-comparisons.json` (Napa–Sonoma pair). `StickyGraphic` exposes `MapApi`: `showCounties`, `revealChoropleth`, `spotlightNapaSonoma`, `resetFromSpotlight`, etc.

**Files**: `viz-intro/HeroSection.tsx`, `StickyGraphic.tsx`, `ScrollNarration.tsx`, `SpotlightComparison.tsx`, `constants.ts`

---

## 9. UI Primitives and Utilities

### `src/lib/utils.ts`
- `cn(...inputs)`: Merges class names via `clsx` + `tailwind-merge`. Use for conditional Tailwind classes.

### `src/lib/chart-colors.ts`
- `chartColors`: Primary (sage), gradient, anomaly, sequential, diverging, categorical, text, axis
- `viridisColors`, `surprisalColors`: Legacy scales

### `src/index.css`
- Tailwind imports + tw-animate-css
- Geist font (variable)
- Custom theme: sage palette, semantic tokens (background, foreground, muted, border)
- MapLibre popup/control overrides (styling to match app)
- Radix/shadcn CSS variables (radius, colors)

### `src/components/ui/*`
- Radix-based primitives: `button`, `card`, `input`, `label`, `select`, `tabs`, `tooltip`, `badge`, `separator`, `checkbox`, `dropdown-menu`, `sheet`, `drawer`, `skeleton`, `table`, `breadcrumb`, `avatar`, `sonner`, `toggle`, `toggle-group`
- `sidebar.tsx`: SidebarProvider, Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger, SidebarInset

---

## 10. Conventions and Best Practices

1. **Functional components + hooks** — No class components
2. **Tailwind for styling** — Utility classes; use `cn()` for conditional classes
3. **Map interactions** — Keep in MapLibre event handlers (`on`, `off`) and refs; avoid re-creating map
4. **Data loading** — `useEffect` + `fetch` on mount; store in state or refs; loading/error states handled
5. **FIPS format** — Backend uses integer; frontend displays as 5-digit string (`String(fips).padStart(5, '0')`)
6. **Color tokens** — `foo`/`bar` rendered as gray placeholder dot; real colors from `COLOR_MAP`
7. **Chart rendering** — D3 in `useCallback` + `useEffect` with `ResizeObserver` for responsiveness
8. **Path alias** — `@/` maps to `src/` (e.g. `@/components/ui/...`)

---

## 11. File Reference

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
| `src/GroupDivergence.tsx` | Group-level JSD choropleth + county panel |
| `src/VizIntroduction.tsx` | Scrollytelling orchestrator |
| `src/viz-intro/*` | Scrollytelling subcomponents |
| `src/components/app-sidebar.tsx` | Sidebar + nav definition |
| `src/components/nav-main.tsx` | Nav menu renderer |
| `src/components/site-header.tsx` | Header bar |
| `src/lib/utils.ts` | `cn()` helper |
| `src/lib/chart-colors.ts` | Chart color tokens |
| `src/index.css` | Theme, base styles, MapLibre overrides |
| `vite.config.ts` | Vite config, proxy, path alias |
| `package.json` | Dependencies and scripts |

---

## 12. Backend API Reference (Proxy Targets)

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

## 13. Development Commands

```bash
npm run dev     # Start Vite dev server
npm run build   # TypeScript check + Vite build
npm run lint    # ESLint
npm run preview # Preview production build
```

**To run with backend**: Start FastAPI backend at `localhost:8000` for proxy. Static data in `public/data/` must exist for map views to load.
