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
├── main.tsx           # App entry point
├── Router.tsx         # Page navigation (3 main views)
├── App.tsx            # Conditional probability analysis page
├── C2STMap.tsx        # C2ST classifier results visualization
├── CaliforniaMap.tsx  # Reusable California map component
├── NeighborDivergence.tsx  # County neighbor divergence analysis
├── App.css            # Main styles
└── index.css          # Base styles
```

## Key Components

### Router.tsx
Handles navigation between three main pages:
- M01: Conditional Probability (`App.tsx`)
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

## Notes

- The API_URL is hardcoded to `http://localhost:8000` - ensure backend is running
- GeoJSON data is fetched from the backend, not stored locally
- H3 resolution levels are defined in backend constants
