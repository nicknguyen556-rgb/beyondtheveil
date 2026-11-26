/**
 * Beyond the Veil — "dusk field journal" palette.
 * Deep slate night, mist teal accent, moonlit type. Not purple-on-white,
 * not cream+terracotta, not flat single-tone.
 */
export const colors = {
  /** App chrome / page wash */
  background: '#0B1219',
  /** Nested panels, inputs */
  surface: '#141E28',
  /** Raised cards / list rows */
  card: '#1A2431',
  /** Primary readable text (moonlight) */
  ink: '#E6EDF2',
  /** Secondary copy */
  muted: '#8A9AAB',
  /** Mist teal — primary action / brand accent */
  accent: '#4DB8A8',
  /** Soft teal wash behind tips / selected chips */
  accentSoft: '#163530',
  /** Hairlines and chip borders */
  border: '#2A3848',
  /** Errors / destructive */
  danger: '#E07A70',
  /** Text on accent buttons (legacy key kept for call sites) */
  white: '#F2F7F5',
  /** On-accent alias */
  onAccent: '#F2F7F5',
  /** Warm trail dust — secondary warmth */
  trail: '#B89A72',
  /** Header / hero atmospheric wash */
  dawn: '#0F1A24',
  /** Horizon line / subtle highlight */
  horizon: '#2E4A52',
  /** Deepest veil for layered atmosphere */
  veil: '#070C11',
} as const;

/** Chart series — readable on dark, distinct hues (no purple glow stack). */
export const chartSeries = [
  '#4DB8A8', // mist teal
  '#B89A72', // trail warm
  '#6B9FD4', // sky blue
  '#E07A70', // coral
  '#8FBF7A', // moss
  '#C4A35A', // lamp gold
] as const;
