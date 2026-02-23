# Frontend Agent Guide

## Project Overview

React + TypeScript frontend for California county geospatial analysis dashboards.

## Tech Stack

- React 19 + TypeScript
- Vite 7
- Tailwind CSS v4
- MapLibre GL
- D3.js

## Project Structure

**Project Root**: `Wildfire-Property-Intelligence/`  
**Frontend Root**: `Wildfire-Property-Intelligence/website/frontend/`

Key files:
- `src/main.tsx`: App entry
- `src/Router.tsx`: Page switching for active views
- `src/ConditionalProbability.tsx`: Conditional pooling map
- `src/EmpiricalBayesPooling.tsx`: Bayesian pooling map
- `src/NeighborDivergence.tsx`: Neighbor divergence map
- `src/C2STMap.tsx`: C2ST map/details
- `src/MoransIMap.tsx`: Moran's I map/details
- `src/GroupDivergence.tsx`: Group divergence map/details
- `src/components/app-sidebar.tsx`: Sidebar pages/menu
- `src/components/nav-main.tsx`: Sidebar nav rendering
- `src/components/site-header.tsx`: Header title
- `src/index.css`: Theme/tokens/base styles

## Active Pages

Router pages in `src/Router.tsx`:
- `home`
- `conditional-probability`
- `empirical-bayes`
- `neighbor-divergence`
- `c2st`
- `morans-i`
- `group-divergence`

## Backend API Used by Frontend

Base URL in components: `http://localhost:8000`

Conditional Pooling:
- `GET /conditional-pooling/landcover-types`
- `POST /conditional-pooling/map/counties`
- `GET /conditional-pooling/county/{fips}`

Empirical Bayes:
- `GET /bayesian/baseline-distributions`
- `POST /bayesian/map/counties`
- `GET /bayesian/county/{fips}`

Neighbor Divergence:
- `GET /map/neighbor-divergence`
- `GET /conditioning-options`
- `POST /compare/counties`
- `POST /map/neighbor-divergence-merged`

C2ST:
- `GET /c2st/results`
- `GET /c2st/pair/{fips_a}/{fips_b}`
- `POST /compare/counties`

Moran's I:
- `GET /morans-i/filters`
- `POST /morans-i/map`
- `GET /morans-i/county/{fips}`

Group Divergence:
- `GET /group-divergence/map`
- `GET /group-divergence/county/{fips}`
- `GET /group-divergence/county/{fips}/colors`

## Development Commands

```bash
npm run dev
npm run build
npm run lint
npm run preview
```

## Conventions

- Use functional React components with hooks.
- Keep styling in Tailwind utility classes.
- Use `cn()` helper from `src/lib/utils.ts` for conditional class names.
- Keep map interactions in MapLibre event handlers and refs.
