# Frontend Agent Guide

## Project Overview

This is a React + TypeScript frontend for visualizing California county-level geospatial data analysis. The application provides five interactive map visualizations (M01-M05) for different statistical methods, all sharing a consistent UI/UX pattern.

## Tech Stack

- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite 7
- **Styling**: Tailwind CSS v4 (via @tailwindcss/vite plugin)
- **Mapping**: MapLibre GL for interactive maps
- **Visualization**: D3.js for charts and histograms
- **Geospatial**: H3-js for hexagonal indexing
- **Data Tables**: TanStack React Table
- **Linting**: ESLint with TypeScript plugin

## Project Structure

**Project Root**: `Wildfire-Property-Intelligence/`
**Frontend Root**: `Wildfire-Property-Intelligence/website/frontend/`

```
website/frontend/
├── src/
│   ├── main.tsx                    # App entry point (React 19, Vite)
│   ├── Router.tsx                  # Page navigation (5 main views: M01-M05)
│   ├── ConditionalProbability.tsx  # M01: Neighbor-pooled conditional probability (NEW implementation)
│   ├── EmpiricalBayesPooling.tsx   # M02: Empirical Bayes Pooling visualization
│   ├── NeighborDivergence.tsx      # M03: County neighbor divergence analysis
│   ├── C2STMap.tsx                 # M04: C2ST classifier results visualization
│   ├── MoransIMap.tsx              # M05: Moran's I spatial autocorrelation map
│   ├── CaliforniaMap.tsx           # Reusable California map component (used by legacy M01)
│   ├── index.css                   # Tailwind imports, theme config, base styles
│   └── lib/
│       ├── utils.ts                # cn() helper for conditional Tailwind classes
│       └── chart-colors.ts         # Color tokens for D3 charts
│   └── components/
│       ├── app-sidebar.tsx         # Navigation sidebar (defines M01-M05 routes)
│       ├── nav-main.tsx            # Sidebar navigation items
│       ├── site-header.tsx         # Site header component
│       └── ui/                     # shadcn/ui components (buttons, cards, etc.)
├── package.json                    # Dependencies and scripts
├── vite.config.ts                  # Vite configuration
└── tsconfig.json                   # TypeScript configuration
```

**File Locations:**
- **M01 Component**: `website/frontend/src/ConditionalProbability.tsx` (~850 lines)
- **M02 Component**: `website/frontend/src/EmpiricalBayesPooling.tsx` (~830 lines)
- **M03 Component**: `website/frontend/src/NeighborDivergence.tsx` (~1334 lines)
- **M04 Component**: `website/frontend/src/C2STMap.tsx` (~696 lines)
- **M05 Component**: `website/frontend/src/MoransIMap.tsx` (~389 lines)
- **Router**: `website/frontend/src/Router.tsx` (defines routes for all 5 methods)
- **Sidebar Config**: `website/frontend/src/components/app-sidebar.tsx` (navigation menu with icons)

## Consistent UI/UX Pattern

All map components (M01-M05) follow the same layout pattern:

### Layout Structure
1. **Full-bleed map**: Map container uses `relative flex-1 min-h-0` parent with `absolute inset-0` map div
2. **Top-left controls**: Statistics summary and display controls in a semi-transparent white panel (`bg-white/95`)
3. **Bottom-right legend**: Map legend positioned in bottom-right corner (M02, M05)
4. **Collapsible detail panel**: Bottom sheet that expands when a county/path is clicked, with collapse/expand/close buttons

### Common Features
- **Auto-expand**: Clicking a county/path automatically expands the detail panel and scrolls to it
- **Hover tooltips**: Map shows county information on hover
- **Loading states**: Overlay shown during data loading
- **Error handling**: Error messages displayed at top of map
- **Responsive**: All components handle window resizing gracefully

## Key Components

### Router.tsx
Handles navigation between five main pages:
- M01: Conditional Probability (`ConditionalProbability.tsx`)
- M02: Empirical Bayes Pooling (`EmpiricalBayesPooling.tsx`)
- M03: Neighbor Divergence (`NeighborDivergence.tsx`)
- M04: C2ST (`C2STMap.tsx`)
- M05: Moran's I (`MoransIMap.tsx`)

All map page wrappers use `flex flex-1 flex-col min-h-0` for full-height layouts.

### CaliforniaMap.tsx
Reusable MapLibre GL component for California county visualization. Exposes a ref interface (`CaliforniaMapRef`) for programmatic map control. Used by M01 (Conditional Probability).

## Backend API

The frontend connects to a FastAPI backend at `http://localhost:8000`. Key endpoints:

**M01 (Conditional Pooling):**
- `GET /conditional-pooling/landcover-types` - Available landcover types
- `POST /conditional-pooling/map/counties` - County-level map data with KL divergence/L1 distance
- `GET /conditional-pooling/county/{fips}` - Detailed county conditional pooling data by color

**M01 (Conditional Probability - Legacy):**
- `POST /map/counties` - County-level map data (county-only method)
- `POST /conditional-probability/county/{fips}` - Detailed county surprisal data by color
- `GET /conditioning-options` - Available filter options

**M02 (Empirical Bayes Pooling):**
- `GET /bayesian/baseline-distributions` - Baseline distributions by landcover
- `POST /bayesian/map/counties` - Bayesian shrinkage map data
- `GET /bayesian/county/{fips}` - Detailed county shrinkage data

**M03 (Neighbor Divergence):**
- `GET /map/neighbor-divergence` - County divergence data
- `POST /compare/counties` - County pair comparison
- `POST /map/neighbor-divergence-merged` - Recalculate JSDs with merged colors

**M04 (C2ST):**
- `GET /c2st/results` - C2ST analysis results
- `GET /c2st/pair/{fips_a}/{fips_b}` - C2ST detail for county pair

**M05 (Moran's I):**
- `GET /morans-i/map` - Moran's I spatial autocorrelation map data

## Development Commands

```bash
npm run dev      # Start dev server (port 5173)
npm run build    # Build for production
npm run lint     # Run ESLint
npm run preview  # Preview production build
```

## Conventions

- Use TypeScript strict mode
- Components are functional with hooks
- State management via React useState/useEffect
- API calls use native fetch
- Map interactions use refs for imperative control
- D3 renders into SVG refs

### Styling (Tailwind CSS - REQUIRED)

**You MUST use Tailwind CSS for all styling.** Do not create CSS files or use inline style objects except for:
- Dynamic values (e.g., `style={{ width: `${percentage}%` }}`)
- Color swatches with dynamic hex values
- D3.js chart elements (inline styles are the D3 pattern)
- MapLibre popup HTML (injected into map, not React)

**Key patterns:**
```typescript
// Use cn() helper for conditional classes
import { cn } from './lib/utils'

<button className={cn(
    'px-3 py-2 text-sm rounded border',
    isActive ? 'bg-sage-500 text-white' : 'bg-white hover:bg-muted'
)}>

// Design system colors (defined in index.css @theme)
// Primary accent: sage-500 (#8b9a6b)
// Background: white, Muted: #f5f5f5
// Text: foreground (#141414), muted-foreground (#666666)
// Border: border (#e5e5e5)
```

**Common component patterns:**
- Buttons: `px-3 py-2 text-sm rounded border border-border hover:bg-muted`
- Primary button: `bg-sage-500 text-white hover:bg-sage-600`
- Cards/sections: `border border-border rounded p-4`
- Chips (selected): `border-sage-500 bg-sage-100 text-foreground`
- Chips (unselected): `border-border text-muted-foreground hover:border-sage-400`

## M01: Conditional Pooling

**File**: `website/frontend/src/ConditionalProbability.tsx`

**Purpose:**
Visualizes conditional pooling analysis comparing county-level color distributions to regional (neighbor-pooled) distributions. Uses KL divergence and L1 distance to identify anomalies relative to spatial context.

**UI Layout:**
- Full-bleed map with top-left controls panel
- Statistics summary: Mean and max KL divergence or L1 distance
- Display section: Metric selector (KL Divergence / L1 Distance), landcover filter dropdown
- Load Map button: Manual trigger to update map
- Bottom-right legend: Color scale for selected metric
- Collapsible bottom sheet detail panel

**Features:**
- Interactive California map showing KL divergence or L1 distance metrics by county
- **Metric selection**: Toggle between KL Divergence (information-theoretic) and L1 Distance (intuitive)
- **Landcover filtering**: Dropdown to filter by landcover type
- **Load Map button**: Manual trigger to update map with current selections
- **Initial auto-load**: Map loads automatically on mount with "All Landcover Types"
- **Fullscreen mode**: Toggle fullscreen display
- **Click counties to see detailed breakdown:**
  - **Color Distribution (KL Contribution)**: Shows all colors sorted by KL contribution (absolute value, highest first)
    - Color swatch (visual representation using COLOR_MAP)
    - Color name
    - KL contribution bar (scaled to max contribution, color-coded: gray for positive, red for negative)
    - KL contribution value displayed numerically
  - **Deviation from Regional Norm**: Horizontal bar chart showing probability differences
    - Red bars extend right for over-represented colors (p_county > p_pool)
    - Blue bars extend left for under-represented colors (p_county < p_pool)
    - Sorted by absolute difference (largest deviations first)
    - Shows actual difference value (+/-)
  - **Top Contributing Colors**: Shows top 10 colors by absolute KL contribution
    - County probability bar (blue) vs Pool probability bar (sage green)
    - Both bars scaled to same max for easy comparison
    - Shows KL contribution value and actual probability values
  - **County vs Pooled Distribution**: D3.js bar chart component
    - Blue bar: County probability (p_county)
    - Green bar: Pooled probability (p_pool)
    - Responsive sizing with ResizeObserver
  - Statistics per landcover:
    - County exposure (n_county) vs Pooled exposure (n_pool)
    - Number of neighbors used
    - KL divergence and L1 distance values
    - Top contributing color and its contribution value
  - Organized by landcover type
  - Auto-expands and scrolls to detail section when county is clicked

**Visualization patterns:**
- **KL Divergence**: Information-theoretic difference between county and pooled distributions
  - Higher KL divergence = more different from regional pattern
  - Measures how much information is lost when using pooled distribution to approximate county distribution
- **L1 Distance**: Intuitive absolute difference (0.5 * sum(|p_county - p_pool|))
  - More interpretable than KL divergence
  - Ranges from 0 (identical) to 1 (completely different)
- **KL Contribution**: Per-color contribution to total KL divergence
  - Positive: County has higher probability than pool
  - Negative: County has lower probability than pool
  - Colors sorted by absolute contribution (most impactful first)

**Implementation details (`ConditionalProbability.tsx`):**

**State Management (lines 102-113):**
- `landcoverTypes`: Available landcover types from API
- `selectedLandcover`: Currently selected landcover filter (empty = all)
- `selectedMetric`: 'kl_div' or 'l1_distance'
- `mapData`: GeoJSON data for map visualization
- `countyDetail`: Detailed county data when county is clicked
- `showDetailPanel`: Whether detail panel is expanded
- `loading`: Loading state for API calls
- `error`: Error message state
- `legendRange`: Min/max values for legend
- `isFullscreen`: Fullscreen mode state
- `colorGroups`: Array of color group objects
- `showColorPanel`: Whether color group panel is visible
- `selectedColors`: Set of selected colors for grouping
- `allColors`: All available colors (from COLOR_MAP)

**Key Functions:**
- `loadMapData`: Fetches map data from `/conditional-pooling/map/counties`
  - Uses `selectedLandcover` and `selectedMetric` from state
  - Updates `mapData` state
  - Calls `updateMapLayer()` to render
- `updateMapLayer`: Updates MapLibre map with new GeoJSON data
  - Removes old layers
  - Adds new source and fill/line layers
  - Sets up hover tooltips and click handlers
  - Updates legend range
- `loadCountyDetail`: Fetches county detail from `/conditional-pooling/county/{fips}`
  - Includes optional `lc_type` query param
  - Updates `countyDetail` state
  - Expands detail panel

**Map Initialization (lines 133-176):**
- Creates MapLibre map instance on mount
- Sets center to California (`[-119.5, 37.0]`, zoom 5.5)
- Adds navigation controls
- Sets up click handler for counties (calls `loadCountyDetail`)
- Sets up error handler

**Data Loading Flow:**
1. Component mounts → `useEffect` (line 178) fetches landcover types
2. Landcover types loaded → `useEffect` (line 410) triggers initial map load
3. User changes dropdown → State updates, but map doesn't reload (manual trigger)
4. User clicks "Load Map" → `loadMapData()` called → Map updates
5. User clicks county → `loadCountyDetail()` called → Detail panel shows

**Visualization Components:**
- `DeviationChart`: Horizontal bar chart showing probability differences
  - Colors sorted by absolute difference (p_county - p_pool)
  - Red bars (right) for over-represented, blue bars (left) for under-represented
  - Centered at zero with visual indicator
- `TopContributorsChart`: Shows top 10 colors by KL contribution
  - Side-by-side bars: county (blue) vs pool (sage green)
  - Displays KL contribution value and probability values
  - Scaled to same max for easy comparison
- `ComparisonChart`: D3.js bar chart component
  - Shows county vs pooled probabilities side-by-side
  - Blue bars for county, green bars for pooled
  - Responsive sizing with ResizeObserver

**Error Handling:**
- All API calls wrapped in try/catch
- Errors displayed in red banner at top of map
- Loading overlay shown during API calls
- Empty state handling for no data scenarios

**API endpoints used:**
- `GET /conditional-pooling/landcover-types` - Load available landcover types (called on mount)
- `POST /conditional-pooling/map/counties` - Load county-level map data (called by `loadMapData`)
  - Request body: `{ lc_type: string | null, metric: 'kl_div' | 'l1_distance' }`
  - Response: GeoJSON with county features + statistics
- `GET /conditional-pooling/county/{fips}` - Load detailed county breakdown (called by `loadCountyDetail`)
  - Optional query param: `?lc_type=...`
  - Response: County detail with by_landcover array

**Data Flow:**
1. **Component Mount**: Fetches landcover types from `/conditional-pooling/landcover-types`
2. **Initial Map Load**: Runs when landcover types are loaded, calls `loadMapData()` with defaults
3. **Manual Map Load**: Triggered by "Load Map" button, uses current selections
4. **County Click**: Extracts FIPS from clicked feature, calls `loadCountyDetail()`
   - Calls `loadCountyDetail(fips)` 
   - Sets `countyDetail` state and expands detail panel
   - Scrolls to detail panel
5. **Map Layer Update** (`updateMapLayer` function, line 248-404):
   - Removes existing map layers
   - Adds new GeoJSON source and layers
   - Sets up hover tooltips and click handlers
   - Updates legend with value range

## M02: Empirical Bayes Pooling

**File**: `EmpiricalBayesPooling.tsx`

**Purpose:**
Visualizes Bayesian shrinkage results showing how observed distributions are stabilized using landcover-specific priors.

**UI Layout:**
- Full-bleed map with top-left controls panel
- Statistics summary: Mean Absolute Movement, Max Absolute Movement
- Display section: Landcover type dropdown (11 options)
- Bottom-right legend: Color scale for absolute movement
- Collapsible bottom sheet detail panel

**Features:**
- Interactive California map showing shrinkage metrics by county
- **Map always uses `abs_movement` metric** (not user-selectable)
- Filter by landcover type (dropdown: barren, crop, forest, grass, other, shrub, urban, urban+barren, urban+crop, urban+forest)
- **Click counties to see detailed breakdown:**
  - **Color Distribution List**: Shows all colors sorted by movement (signed) for the selected landcover:
    - Color swatch (visual representation using COLOR_MAP)
    - Color name
    - Movement value bar (scaled to max movement in that landcover)
    - Movement value displayed numerically (signed, shows direction of change)
  - **Baseline vs Observed vs Stabilized distributions comparison chart** (D3.js bar chart):
    - Green bar: Baseline proportion (landcover-specific prior)
    - Blue bar: Observed proportion (raw data)
    - Orange bar: Stabilized proportion (after shrinkage)
    - Chart width matches color distribution list width
    - X-axis label positioned at `height + 70` to prevent overlap
    - Uses ResizeObserver for responsive sizing
  - Exposure, shrinkage weight, and movement statistics
  - Organized by landcover type

**Visualization patterns:**
- **Low exposure counties** (< 20 structures): High absolute movement (0.05-0.31), low shrinkage weight (0.24-0.61)
- **High exposure counties** (100+ structures): Low absolute movement (~0.001), high shrinkage weight (~0.99)
- **Map coloring**: Uses Viridis color scale to show absolute movement values across counties
- **Detail panel**: Shows movement (signed) for each color, not shrinkage weight

**Implementation details:**
- Uses MapLibre GL for map visualization
- D3.js for comparison charts showing baseline/observed/stabilized proportions
- Color distribution list uses COLOR_MAP constant for consistency
- Colors sorted by movement (descending) - highest values first
- Bar width scales to max movement within each landcover type
- URL encoding: Uses `encodeURIComponent` for landcover types containing `+` characters
- Detail panel auto-expands and scrolls on county click
- Error handling and loading states included

**API endpoints used:**
- `GET /bayesian/baseline-distributions` - Load landcover types dropdown
- `POST /bayesian/map/counties` - Load county-level map data (always requests `metric: 'abs_movement'`)
- `GET /bayesian/county/{fips}` - Load detailed county breakdown (with landcover filter)

## M03: Neighbor Divergence

**File**: `NeighborDivergence.tsx`

**Purpose:**
Visualizes Jensen-Shannon Divergence (JSD) between adjacent counties, with interactive color pooling to test if similar color names inflate divergence scores.

**UI Layout:**
- Full-bleed map (or side-by-side when merged map is shown)
- Top-left controls: Statistics summary (Pairs, Mean JSD, Range)
- Collapsible color grouping panel
- Collapsible bottom sheet comparison panel

**Features:**
- **Interactive color grouping**:
  - Preset buttons: "All Browns", "All Reds", "All Greens", "Blues/Purples", "Grays", "Add All", "Reset"
  - List of created groups with color chips
  - Ungrouped colors section (click to select, then add to existing/new group)
  - Custom group creation with name input
- **Dual Map Comparison View**:
  - Side-by-side "Original" vs "Merged Colors" maps
  - Same Viridis color scale for fair comparison
  - Mean JSD badge on each map with % change indicator
- **"Recalculate All Pairs" button**: Sends color groups to backend, updates merged map view
- **Click paths/edges to see comparison**:
  - **Auto-expands comparison panel** when a path is clicked
  - Shows both counties' color distributions side-by-side
  - Color swatches with names and percentages
  - JSD comparison: Original JSD → Merged JSD with % reduction
  - Shows both original and merged distributions

**Preset color groups:**
```typescript
const PRESETS = {
  browns: ["brown", "sienna", "cocoa", "coffee", "tan", "terracotta", "auburn"],
  reds: ["red", "scarlet", "crimson", "maroon"],
  greens: ["green", "sage", "verde", "emerald"],
  blues_purples: ["blue", "indigo", "navy", "purple", "lavender", "lilac"],
  grays: ["gray", "grey"]
};
```

**Key state:**
```typescript
const [colorGroups, setColorGroups] = useState<ColorGroup[]>([])
const [showColorPanel, setShowColorPanel] = useState(false)
const [selectedColors, setSelectedColors] = useState<Set<string>>(new Set())
const [showMergedMap, setShowMergedMap] = useState(false)
const [mergedData, setMergedData] = useState<DivergenceData | null>(null)
```

**API endpoints used:**
- `GET /map/neighbor-divergence` - Load original divergence data
- `POST /compare/counties` - Compare two counties (with optional color_groups)
- `POST /map/neighbor-divergence-merged` - Recalculate all pair JSDs with merged colors

## M04: C2ST (Classifier Two-Sample Test)

**File**: `C2STMap.tsx`

**Purpose:**
Visualizes C2ST classifier results showing how well a classifier can distinguish between adjacent county pairs.

**UI Layout:**
- Full-bleed map with top-left controls panel
- Statistics summary: Pairs, Mean Accuracy, Range
- Display section: Landcover type dropdown
- Collapsible bottom sheet comparison panel

**Features:**
- Interactive California map showing C2ST accuracy scores by county pair
- Filter by landcover type (dropdown)
- Hover tooltip shows county pair names and accuracy score
- **Click paths/edges to see comparison**:
  - **Auto-expands comparison panel** when a path is clicked
  - Shows both counties' color distributions
  - Displays C2ST accuracy score and classification result
  - Color swatches with names and percentages

**Visualization patterns:**
- **Accuracy score**: 0.5 = random (cannot distinguish), 1.0 = perfect separation
- Higher accuracy = more distinct color distributions between counties
- Map coloring uses Viridis color scale

**Implementation details:**
- Uses MapLibre GL for map visualization
- Same UI pattern as M03 (Neighbor Divergence)
- Detail panel auto-expands and scrolls on path click
- Error handling and loading states included

**API endpoints used:**
- `GET /c2st/results` - Load C2ST results
- `GET /c2st/pair/{fips_a}/{fips_b}` - Load detailed pair comparison

## M05: Moran's I

**File**: `MoransIMap.tsx`

**Purpose:**
Visualizes spatial autocorrelation using Moran's I statistic to identify clusters of similar color distributions.

**UI Layout:**
- Full-bleed map with top-left controls panel
- Statistics summary: Total Counties, Mean Local, Max Local, Min Local, Std Dev
- Bottom-right legend: Color scale for Moran's I scores
- Collapsible bottom sheet detail panel (shows county name and local score)

**Features:**
- Interactive California map showing Moran's I local scores by county
- Hover tooltip shows county name and local score
- **Click counties to see detail**:
  - Shows county name and local Moran's I score
  - Positive values indicate spatial clustering
  - Negative values indicate spatial dispersion

**Visualization patterns:**
- **Local Moran's I**: Measures spatial autocorrelation
  - Positive values: Similar values cluster together
  - Negative values: Dissimilar values cluster together
  - Near zero: Random spatial distribution
- Map coloring uses custom color scale (not Viridis) to highlight positive/negative values

**Implementation details:**
- Uses MapLibre GL for map visualization
- Data loaded from `morans_i_homogeneity.csv` (FIPS and local scores)
- FIPS matching: Converts integer FIPS to zero-padded strings for GeoJSON matching
- Error handling and loading states included

**API endpoints used:**
- `GET /morans-i/map` - Load Moran's I map data (GeoJSON with local scores)

## Common Patterns

### API Calls
```typescript
const response = await fetch(`${API_URL}/endpoint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
})
const data = await response.json()
```

### Map Ref Pattern
```typescript
const mapRef = useRef<maplibregl.Map | null>(null)
// Later: mapRef.current?.flyTo(coords)
```

### Detail Panel Pattern
```typescript
const [showDetailPanel, setShowDetailPanel] = useState(false)
const detailRef = useRef<HTMLDivElement>(null)

// On click:
setShowDetailPanel(true)
setTimeout(() => {
    detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}, 100)
```

### Color Map Constant
All components use the same `COLOR_MAP` constant for consistent color swatches:
```typescript
const COLOR_MAP: Record<string, string> = {
    amber: '#FFBF00',
    aqua: '#00FFFF',
    // ... 38 total colors
}
```

## File Paths and Locations

**Component Files:**
- `ConditionalProbability.tsx`: `website/frontend/src/ConditionalProbability.tsx`
- `EmpiricalBayesPooling.tsx`: `website/frontend/src/EmpiricalBayesPooling.tsx`
- `NeighborDivergence.tsx`: `website/frontend/src/NeighborDivergence.tsx`
- `C2STMap.tsx`: `website/frontend/src/C2STMap.tsx`
- `MoransIMap.tsx`: `website/frontend/src/MoransIMap.tsx`

**Configuration Files:**
- `Router.tsx`: `website/frontend/src/Router.tsx` (defines `/conditional-probability`, `/bayesian-pooling`, `/neighbor-divergence`, `/c2st`, `/morans-i` routes)
- `app-sidebar.tsx`: `website/frontend/src/components/app-sidebar.tsx` (navigation menu, line ~50+ defines M01-M05 routes with icons)
- `package.json`: `website/frontend/package.json` (dependencies: react, maplibre-gl, d3, etc.)

**Data Sources:**
- All data fetched from backend API at `http://localhost:8000`
- No local data files stored in frontend
- GeoJSON geometries come from backend `ca_counties_geojson`
- All statistical data computed on backend

## Notes

- **API_URL**: Hardcoded to `http://localhost:8000` in all components - ensure backend is running
- **GeoJSON**: All GeoJSON data is fetched from backend, not stored locally
- **H3 resolution**: H3 resolution levels are defined in backend `constants.py`
- **Component organization**: Each method (M01-M05) is in its own component file for maintainability
- **UI consistency**: All maps share consistent UI/UX patterns (full-bleed map, top-left controls, collapsible detail panel)
- **State management**: Uses React hooks (`useState`, `useEffect`, `useCallback`, `useRef`) for all state
- **Map library**: MapLibre GL for interactive maps (same as OpenStreetMap style)
- **Chart library**: D3.js for all visualizations (bar charts, histograms)
- **Styling**: Tailwind CSS v4 for all styling (no custom CSS files)
