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

```
src/
├── main.tsx                    # App entry point
├── Router.tsx                  # Page navigation (5 main views)
├── ConditionalProbability.tsx  # M01: Conditional probability analysis page
├── EmpiricalBayesPooling.tsx   # M02: Empirical Bayes Pooling visualization
├── NeighborDivergence.tsx      # M03: County neighbor divergence analysis
├── C2STMap.tsx                 # M04: C2ST classifier results visualization
├── MoransIMap.tsx              # M05: Moran's I spatial autocorrelation map
├── CaliforniaMap.tsx           # Reusable California map component (used by M01)
├── index.css                   # Tailwind imports, theme config, base styles
└── lib/
    ├── utils.ts                # cn() helper for conditional Tailwind classes
    └── chart-colors.ts         # Color tokens for D3 charts
```

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

**M01 (Conditional Probability):**
- `POST /map/counties` - County-level map data
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

## M01: Conditional Probability

**File**: `ConditionalProbability.tsx`

**Purpose:**
Visualizes surprisal analysis for color distributions by county and landcover type.

**UI Layout:**
- Full-bleed map with top-left controls panel
- Statistics summary: Shows total counties, mean/max surprisal
- Display section: Context columns, target, min support, landcover filter dropdown
- Collapsible bottom sheet detail panel

**Features:**
- Interactive California map showing surprisal metrics by county
- Hover tooltip shows max surprisal, mean surprisal, and top anomaly
- **Landcover filtering**: Dropdown to filter by landcover type in display section
- **Click counties to see detailed breakdown:**
  - **Color Distribution List**: Shows all colors sorted by surprisal (highest first):
    - Color swatch (visual representation using COLOR_MAP)
    - Color name
    - Surprisal value bar (scaled to max surprisal in that landcover)
    - Surprisal value displayed numerically
  - Organized by landcover type
  - Shows total rows, max surprisal, and mean surprisal per landcover
  - Auto-scrolls to detail section when county is clicked

**Visualization patterns:**
- **Surprisal**: Measures how unexpected a color is given the context (county + landcover)
- Higher surprisal = more unexpected/anomalous
- Colors sorted from highest to lowest surprisal
- Bar width scales to max surprisal within each landcover type

**Implementation details:**
- Uses CaliforniaMap component (reusable map component)
- Click handler added to CaliforniaMap via `onCountyClick` prop
- Color distribution list uses COLOR_MAP constant for consistency
- Detail panel is a collapsible bottom sheet with header (county info, collapse/expand/close buttons)
- Error handling and loading states included

**API endpoints used:**
- `POST /map/counties` - Load county-level map data
- `POST /conditional-probability/county/{fips}` - Load detailed county surprisal breakdown
- `GET /conditioning-options` - Load available landcover types

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

## Notes

- The API_URL is hardcoded to `http://localhost:8000` - ensure backend is running
- GeoJSON data is fetched from the backend, not stored locally
- H3 resolution levels are defined in backend constants
- Each method (M01-M05) is in its own component file for maintainability
- All maps share consistent UI/UX patterns for better user experience
