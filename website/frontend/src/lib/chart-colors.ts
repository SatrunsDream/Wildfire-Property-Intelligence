// Chart color tokens matching the sage green design system
export const chartColors = {
  // Primary chart color (sage green)
  primary: '#8b9a6b',
  primaryLight: '#9aa883',
  primaryDark: '#6f7d52',

  // Gradient colors for surprisal/anomaly charts
  gradient: ['#8b9a6b', '#9aa883', '#b5c0a3', '#d4dac9', '#e8ebe3'],

  // Warm accent colors for highlighting anomalies
  anomaly: {
    low: '#8b9a6b',      // sage - normal
    medium: '#d4a574',   // warm tan
    high: '#c17f59',     // terracotta
    extreme: '#a85d3b',  // burnt sienna
  },

  // Sequential scale for heatmaps (sage to warm)
  sequential: [
    '#e8ebe3',  // lightest
    '#d4dac9',
    '#b5c0a3',
    '#9aa883',
    '#8b9a6b',
    '#7d8c5d',
    '#6f7d52',
    '#576342',  // darkest
  ],

  // Diverging scale for comparison charts
  diverging: {
    negative: '#2166ac',
    negativeLight: '#67a9cf',
    neutral: '#f7f7f7',
    positiveLight: '#d4a574',
    positive: '#a85d3b',
  },

  // Categorical colors for distribution charts
  categorical: [
    '#8b9a6b',  // sage
    '#6f7d52',  // dark sage
    '#9aa883',  // light sage
    '#b5c0a3',  // pale sage
    '#d4a574',  // warm tan
    '#a85d3b',  // terracotta
  ],

  // Text colors for chart labels
  text: {
    primary: '#141414',
    secondary: '#666666',
    muted: '#888888',
  },

  // Grid and axis colors
  grid: '#e5e5e5',
  axis: '#888888',
}

// Viridis-inspired colors for JSD/accuracy maps (keep existing for compatibility)
export const viridisColors = [
  '#440154',
  '#414487',
  '#2a788e',
  '#22a884',
  '#fde725',
]

// Red-blue diverging for surprisal maps (keep existing)
export const surprisalColors = [
  '#2166ac',
  '#67a9cf',
  '#d1e5f0',
  '#f7f7f7',
  '#fddbc7',
  '#ef8a62',
  '#b2182b',
  '#67001f',
]
