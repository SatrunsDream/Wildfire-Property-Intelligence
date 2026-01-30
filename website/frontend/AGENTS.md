# Frontend Agent Guide

## Project Overview

This is a React + TypeScript frontend for visualizing California county-level geospatial data analysis, including conditional probability analysis, neighbor divergence, and C2ST (Classifier Two-Sample Test) results.

## Tech Stack

- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite 7
- **Mapping**: MapLibre GL for interactive maps
- **Visualization**: D3.js for charts and histograms
- **Geospatial**: H3-js for hexagonal indexing
- **Data Tables**: TanStack React Table
- **Linting**: ESLint with TypeScript plugin

## Project Structure

```
src/
├── main.tsx                    # App entry point
├── Router.tsx                  # Page navigation (4 main views)
├── App.tsx                     # M01: Conditional probability analysis page
├── EmpiricalBayesPooling.tsx   # M02: Empirical Bayes Pooling visualization
├── NeighborDivergence.tsx      # M03: County neighbor divergence analysis
├── C2STMap.tsx                 # M04: C2ST classifier results visualization
├── CaliforniaMap.tsx           # Reusable California map component
├── App.css                     # Main styles
└── index.css                   # Base styles
```

## Key Components

### Router.tsx
Handles navigation between four main pages:
- M01: Conditional Probability (`App.tsx`)
- M02: Empirical Bayes Pooling (`EmpiricalBayesPooling.tsx`)
- M03: Neighbor Divergence (`NeighborDivergence.tsx`)
- M04: C2ST (`C2STMap.tsx`)

### CaliforniaMap.tsx
Reusable MapLibre GL component for California county visualization. Exposes a ref interface (`CaliforniaMapRef`) for programmatic map control.

## Backend API

The frontend connects to a FastAPI backend at `http://localhost:8000`. Key endpoints:
- `GET /columns` - Available data columns
- `POST /analyze/conditional-probability` - Run probability analysis
- `POST /map/counties` - County-level map data
- `POST /map/hexes` - H3 hexagon map data
- `GET /map/neighbor-divergence` - County divergence data
- `GET /c2st/results` - C2ST analysis results
- `POST /compare/counties` - County comparison
- `GET /bayesian/baseline-distributions` - Baseline distributions by landcover
- `GET /bayesian/stabilized-distributions` - Stabilized distributions
- `POST /bayesian/map/counties` - Bayesian shrinkage map data
- `GET /bayesian/county/{fips}` - Detailed county shrinkage data

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
const mapRef = useRef<CaliforniaMapRef>(null)
// Later: mapRef.current?.flyTo(coords)
```

## M02: Empirical Bayes Pooling (Added)

**What was done:**
- Created new component `EmpiricalBayesPooling.tsx` for visualizing Bayesian shrinkage results
- Added M02 route to `Router.tsx` between M01 and M03
- Component structure follows same pattern as other methods (separate file, self-contained)

**Component features:**
- Interactive California map showing shrinkage metrics by county
- Filter by landcover type (dropdown with 11 options: barren, crop, forest, grass, other, shrub, urban, urban+barren, urban+crop, urban+forest)
- Select metric to visualize:
  - **Absolute Movement**: Magnitude of change (|Δ|) - shows where shrinkage had most impact
  - **Movement (signed)**: Directional change (Δ) - shows if proportions increased or decreased
  - **Shrinkage Weight**: How much observed data was trusted (w) - higher = less shrinkage
- Click counties to see detailed breakdown:
  - Baseline vs Observed vs Stabilized distributions comparison chart (D3.js bar chart)
  - Exposure, shrinkage weight, and movement statistics
  - Organized by landcover type

**Visualization patterns (based on Bayesian shrinkage methodology):**
- **Low exposure counties** (< 20 structures): Should show high absolute movement (0.05-0.31) and low shrinkage weight (0.24-0.61)
- **High exposure counties** (100+ structures): Should show low absolute movement (~0.001) and high shrinkage weight (~0.99)
- **Comparison chart**: Three bars per color category showing:
  - Green bar: Baseline proportion (landcover-specific prior)
  - Blue bar: Observed proportion (raw data)
  - Orange bar: Stabilized proportion (after shrinkage)
- **Map coloring**: Uses Viridis color scale to show metric values across counties

**Implementation details:**
- Uses MapLibre GL for map visualization (similar to other methods)
- D3.js for comparison charts showing baseline/observed/stabilized proportions
- Error handling and loading states included
- Map layer updates when data loads or filters change
- County detail view shows side-by-side distribution comparisons
- Handles map initialization errors gracefully

**Key differences from M01:**
- Pre-computed data (no analysis step needed - data comes from CSV files)
- Focuses on shrinkage effects rather than surprisal
- Shows baseline distributions as reference point
- Visualizes movement/shift from observed to stabilized
- Data files: All in `backend/data/` folder (must be present for component to work)

**API endpoints used:**
- `GET /bayesian/baseline-distributions` - Load landcover types dropdown
- `POST /bayesian/map/counties` - Load county-level map data
- `GET /bayesian/county/{fips}` - Load detailed county breakdown

## Notes

- The API_URL is hardcoded to `http://localhost:8000` - ensure backend is running
- GeoJSON data is fetched from the backend, not stored locally
- H3 resolution levels are defined in backend constants
- Each method (M01-M04) is in its own component file for maintainability
