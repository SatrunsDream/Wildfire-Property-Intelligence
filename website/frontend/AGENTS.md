# Frontend Agent Guide

## Project Overview

React + TypeScript frontend for California county geospatial analysis dashboards. Two entry modes:
- **Dashboard** (`/`): Sidebar navigation, multiple map views (conditional probability, Bayesian, neighbor divergence, C2ST, Moran's I, group divergence)
- **Scrollytelling** (`/viz`): Editorial narrative with sticky map, San Diego case study, color pooling solution

## Tech Stack

- React 19 + TypeScript
- Vite 7
- Tailwind CSS v4
- MapLibre GL
- D3.js
- react-scrollama (viz only)
- next-themes (dark/light mode)

## Routing

`src/main.tsx`:
- Wraps app in `ThemeProvider` (next-themes) for dark/light mode; **defaultTheme="dark"** (site loads in dark mode by default)
- `pathname === '/viz'` → `VizIntroduction` (scrollytelling)
- else → `Router` (dashboard)
- Hash `#poster` or `#paper` → Router switches to home; `PdfViewerModal` opens for PDF viewer

## Project Structure

**Project Root**: `Wildfire-Property-Intelligence/`  
**Frontend Root**: `Wildfire-Property-Intelligence/website/frontend/`

Key files:
- `src/main.tsx`: Entry, path-based split
- `src/Router.tsx`: Page switching for dashboard
- `src/VizIntroduction.tsx`: Scrollytelling orchestrator (HeroSection + StickyGraphic + ScrollNarration); loads 6 JSON files, `processKLByFipsSdOnly`, `processPooledJsdByFips`, `buildCountyDetailAllLandcover`
- `src/viz-intro/HeroSection.tsx`: Editorial intro
- `src/viz-intro/StickyGraphic.tsx`: Map, `showCounties`, `revealChoropleth`, `spotlightCounties`, `showKLChoropleth`, `showPostPoolingChoropleth`; legends bottom-right; zoom enforcement for SD scenes
- `src/viz-intro/ScrollNarration.tsx`: Scrollama steps, NarrationCard, SpotlightComparison, KLDivergenceCard, SolutionCard, PostPoolingScoresCard
- `src/viz-intro/SpotlightComparison.tsx`: County A vs B bars, JSD original + pooled; theme-aware text (county names bold, no hardcoded grays)
- `src/viz-intro/KLDivergenceCard.tsx`: Deviation from Regional Norm (title without em dash; expanded intro/closing; All land cover types, colors only)
- `src/viz-intro/PostPoolingScoresCard.tsx`: Post-pooling JSD scores SD vs neighbors
- `src/viz-intro/ColorPoolDendrogram.tsx`: D3 dendrogram (initialScale 0.65)
- `src/viz-intro/constants.ts`: MAP_CENTER, SPOTLIGHT_CENTER, SPOTLIGHT_ZOOM, SceneId, DIVERGENCE_STOPS
- `src/lib/conditionalPooling.ts`: `buildCountyDetail`, `buildCountyDetailAllLandcover`, SummaryRow, DetailRow, CountyDetail
- `src/ConditionalProbability.tsx`, `EmpiricalBayesPooling.tsx`, `NeighborDivergence.tsx`, `C2STMap.tsx`, `MoransIMap.tsx`, `GroupDivergence.tsx`
- `src/components/app-sidebar.tsx`: Sidebar + nav
- `public/data/*.json`: Static data (see Data Pipeline below)

## VizIntroduction (`/viz`) — Scrollytelling Flow

1. **HeroSection**: Editorial intro (stakes, data, exposure). No map.
2. **StickyGraphic**: Map sticks in viewport. Loads `neighbor-divergence-map.json`. For scenes `spotlight`, `distributions`, `solution`, `postPooling` — zooms to **SD region only** (Imperial, Orange, Riverside, San Diego). Legend in bottom-right per scene.
3. **ScrollNarration** (react-scrollama): Six scroll-triggered steps drive `activeScene`:
   - **counties** (130vh): "58 counties report this data independently" — NarrationCard with theme-aware `text-foreground` (readable in dark mode). Max Divergence choropleth (full state), legend bottom-right
   - **spotlight** (140vh): `SpotlightComparison` — "Same border. Different data." SD vs neighbor color bars; county names **bold** and `text-foreground`; all text theme-aware (color labels, percentages, bar track `bg-muted`). JSD original → pooled. Legend (county names) bottom-right
   - **distributions** (120vh): `KLDivergenceCard` — "{County} Deviation from Regional Norm" (no em dash). Expanded intro: regional norm pools adjacent counties in SD region; red = over-represented, blue = under; "Click a county" to switch. Closing paragraph: land cover type, divergence as naming convention. **Removed** "Click another county on the map..." sentence. SD region only; 4 counties colored by mean KL; non-SD gray. **All land cover types** aggregated (colors only). Click county → per-color deviation table. Legend "KL Divergence" bottom-right. **Layout**: Card on **right** side (`justify-end`), legend bottom-right.
   - **solution** (120vh): `SolutionCard` — greedy color pooling, **ColorPoolDendrogram** (zoom 0.65), post-pooling impact. **Layout**: Card **centered** over map (`justify-center`).
   - **postPooling** (140vh): `PostPoolingScoresCard` — post-pooling JSD scores SD vs each neighbor. Map: **showPostPoolingChoropleth** — 4 SD counties colored by pooled JSD (green scale), rest gray. Legend "Post-pooling JSD" bottom-right
4. **Data** (all fetched on mount): `county-pair-comparisons.json`, `case_study_sd_region.json`, `conditional-pooling-summary.json`, `conditional-pooling-detail.json`, `group-divergence.json`, `neighbor-jsd-pooled-greedy.json`. Case study `sd_vs_neighbors` includes `jsd.pooled`. `comparisonData` prefers `sd_vs_neighbors`. `klByFips` from conditional-pooling (SD region only). `jsdByFips` from neighbor-jsd-pooled-greedy (max pooled JSD per county).

## Data Pipeline (Notebooks → JSON → Frontend)

| JSON | Path | Source | Purpose |
|------|------|--------|---------|
| `neighbor-jsd-pooled-greedy.json` | `public/data/` | `notebooks/methods/color_groupings/color_pool.ipynb` | Post-pooling JSD per pair `{ "06001-06013": { weighted_jsd, mean_jsd }, ... }`. Viz: `processPooledJsdByFips` → max per county → `showPostPoolingChoropleth` |
| `color-pool-merge-tree.json` | `public/data/` | `scripts/build_merge_tree.py` | D3 dendrogram `{ name, value?, children[] }` for ColorPoolDendrogram |
| `case_study_sd_region.json` | `public/data/` | `notebooks/eda/case_study.ipynb` | SD region: counties, exposure, distributions, `sd_vs_neighbors` (original + pooled JSD) |
| `county-pair-comparisons.json` | `public/data/` | Backend/export | County A vs B distributions + JSD original |
| `conditional-pooling-summary.json` | `public/data/` | Pipeline | `SummaryRow[]` (fips, lc_type, kl_div, top_color). Viz: `processKLByFipsSdOnly` → mean KL per SD county |
| `conditional-pooling-detail.json` | `public/data/` | Pipeline | `DetailRow[]` (fips, lc_type, clr, y_county, y_pool, p_county, p_pool). Viz: `buildCountyDetailAllLandcover` aggregates by color |
| `group-divergence.json` | `public/data/` | Pipeline | `{ map: { features: GeoJSON.Feature[] } }` — county geometry for labels |
| `neighbor-divergence-map.json` | `public/data/` | Pipeline | Counties GeoJSON (fips, max_divergence) + edges (fips_a, fips_b, weighted_jsd) |

**Order to regenerate viz data**:
1. Run `color_pool.ipynb` (merge + JSD evaluation + export) → `neighbor-jsd-pooled-greedy.json`
2. Run `scripts/build_merge_tree.py` → `color-pool-merge-tree.json`
3. Run `case_study.ipynb` → `case_study_sd_region.json`

## Active Pages (Dashboard)

Router pages: `home`, `conditional-probability`, `empirical-bayes`, `neighbor-divergence`, `c2st`, `morans-i`, `group-divergence`, `color-map`

**HomePage Methods section** (clickable titles → navigate to page):
- Empirical Bayes Shrinkage, Conditional Probability & Spatial Pooling, Jensen Shannon Neighbor Divergence, Group-Level Divergence, C2ST, Moran's I
- **Kullback Leibler Divergence** — nested under Conditional Probability & Spatial Pooling (left border, indented). Own explanation + "See the math" with KL formula: \(\mathrm{KL}(p_c \| p^{\mathrm{pool}}) = \sum_k p_{ck} \log(p_{ck}/p_k^{\mathrm{pool}})\). Both link to `conditional-probability` page.

## Theme and Styling

- **Default theme**: `defaultTheme="dark"` in main.tsx — site loads in dark mode. `enableSystem` kept for theme toggle.
- **Dark/Light mode**: `ThemeProvider` (next-themes), `ThemeToggle` (Sun/Moon icons from lucide-react) in site header and viz page top-right.
- **ThemeToggle**: Icons use `text-[var(--button-accent)]` — **green** in light mode, **orange** in dark mode; hover `bg-[var(--button-accent)]/10`.
- **Accent colors** (`src/index.css`): `--button-accent` (green in light, orange in dark); `--brand-orange` (orange, used for branding).
- **Headings** (h1–h6): Use `--button-accent` (green light / orange dark).
- **Nav, buttons, titles**: All use `--button-accent` for consistent theme-aware coloring.
- **Dark mode**: Cards, legends, control panels use `bg-card`, `bg-card/95`; method pages and viz cards are theme-aware. GroupDivergence county cards use `bg-card`; anomalous cards use `bg-red-500/10` (light) / `bg-red-500/20` (dark).
- **PDF modal**: `PdfViewerModal` — full viewport; URL hash `#poster` / `#paper`; close via X or backdrop click.

## Conventions

- Functional components + hooks.
- Tailwind utility classes; `cn()` from `src/lib/utils.ts`.
- Map interactions in MapLibre handlers and refs.
- FIPS as 5-digit strings (`06073`).
- `foo`/`bar` as gray placeholder for error tokens.

## Development Commands

```bash
npm run dev     # Vite dev server
npm run build   # TypeScript + build
npm run lint    # ESLint
npm run preview # Preview production build
```

**HomePage About section**:
- Three centered buttons: Report, Poster, GitHub (icons: FileText, Presentation, Github from lucide-react).
- Report and Poster open `PdfViewerModal` with PDF; Poster uses `public/images/capstone_poster.pdf`; Paper uses `public/images/capstone_paper.pdf`.
- URL hash `#poster` / `#paper` opens modal and is shareable.

For full docs: see `AGENTS_DETAILED.md`.
