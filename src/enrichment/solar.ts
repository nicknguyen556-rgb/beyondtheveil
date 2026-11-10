/** Derived solar / lunar context from sunrise–sunset and observation time. */

export type TimeOfDay =
  | 'night'
  | 'dawn'
  | 'morning'
  | 'midday'
  | 'afternoon'
  | 'dusk';

export interface SolarContext {
  timeOfDay: TimeOfDay;
  daylightRemainingMin: number;
  moonPhaseFraction: number;
  moonPhaseName: string;
}

const MS_PER_DAY = 86_400_000;

/**
 * Approximate illuminated fraction (0–1) using a synodic-month model.
 * Good enough for trendable field context; not ephemeris-grade.
 */
export function moonPhaseFraction(date: Date): number {
  // Known new moon: 2000-01-06 18:14 UTC
  const knownNew = Date.UTC(2000, 0, 6, 18, 14);
  const synodicDays = 29.53058867;
  const days = (date.getTime() - knownNew) / MS_PER_DAY;
  const cycle = ((days % synodicDays) + synodicDays) % synodicDays;
  const phase = cycle / synodicDays;
  // Illuminated fraction ≈ (1 - cos(2π phase)) / 2
  return (1 - Math.cos(2 * Math.PI * phase)) / 2;
}

export function moonPhaseName(_fraction: number, date: Date): string {
  const knownNew = Date.UTC(2000, 0, 6, 18, 14);
  const synodicDays = 29.53058867;
  const days = (date.getTime() - knownNew) / MS_PER_DAY;
  const cycle = ((days % synodicDays) + synodicDays) % synodicDays;
  const phase = cycle / synodicDays;

  if (phase < 0.03 || phase >= 0.97) return 'new';
  if (phase < 0.22) return 'waxing crescent';
  if (phase < 0.28) return 'first quarter';
  if (phase < 0.47) return 'waxing gibbous';
  if (phase < 0.53) return 'full';
  if (phase < 0.72) return 'waning gibbous';
  if (phase < 0.78) return 'last quarter';
  return 'waning crescent';
}

export function deriveSolarContext(
  capturedAt: Date,
  sunriseIso: string | null,
  sunsetIso: string | null,
): SolarContext {
  const fraction = moonPhaseFraction(capturedAt);
  const moon = {
    moonPhaseFraction: Number(fraction.toFixed(3)),
    moonPhaseName: moonPhaseName(fraction, capturedAt),
  };

  if (!sunriseIso || !sunsetIso) {
    return {
      timeOfDay: 'night',
      daylightRemainingMin: 0,
      ...moon,
    };
  }

  const sunrise = new Date(sunriseIso).getTime();
  const sunset = new Date(sunsetIso).getTime();
  const t = capturedAt.getTime();

  if (Number.isNaN(sunrise) || Number.isNaN(sunset)) {
    return {
      timeOfDay: 'night',
      daylightRemainingMin: 0,
      ...moon,
    };
  }

  const dayLength = Math.max(sunset - sunrise, 1);
  const dawnStart = sunrise - 0.05 * dayLength;
  const morningEnd = sunrise + 0.25 * dayLength;
  const middayEnd = sunrise + 0.55 * dayLength;
  const afternoonEnd = sunrise + 0.85 * dayLength;
  const duskEnd = sunset + 0.05 * dayLength;

  let timeOfDay: TimeOfDay;
  if (t < dawnStart || t >= duskEnd) timeOfDay = 'night';
  else if (t < sunrise) timeOfDay = 'dawn';
  else if (t < morningEnd) timeOfDay = 'morning';
  else if (t < middayEnd) timeOfDay = 'midday';
  else if (t < afternoonEnd) timeOfDay = 'afternoon';
  else if (t < duskEnd) timeOfDay = 'dusk';
  else timeOfDay = 'night';

  const remainingMs = Math.max(0, sunset - t);
  const daylightRemainingMin =
    t < sunrise || t > sunset ? 0 : Math.round(remainingMs / 60_000);

  return {
    timeOfDay,
    daylightRemainingMin,
    ...moon,
  };
}
