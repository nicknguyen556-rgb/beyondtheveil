/** Shared numeric merge statistics for multi-source enrichment. */

/** Arithmetic mean. */
export function mean(values: number[]): number {
  if (values.length === 0) {
    throw new Error('mean() requires at least one value');
  }
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Sample standard deviation (n−1). Null when fewer than 2 samples —
 * chart UIs treat that as “no spread yet.”
 */
export function sampleStdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const avg = mean(values);
  const sumSq = values.reduce((sum, v) => sum + (v - avg) ** 2, 0);
  return Math.sqrt(sumSq / (values.length - 1));
}

/** Circular mean for meteorological wind direction (degrees 0–360). */
export function circularMeanDegrees(degrees: number[]): number {
  if (degrees.length === 0) {
    throw new Error('circularMeanDegrees() requires at least one value');
  }
  let sinSum = 0;
  let cosSum = 0;
  for (const deg of degrees) {
    const rad = (deg * Math.PI) / 180;
    sinSum += Math.sin(rad);
    cosSum += Math.cos(rad);
  }
  const n = degrees.length;
  const avg = (Math.atan2(sinSum / n, cosSum / n) * 180) / Math.PI;
  return ((avg % 360) + 360) % 360;
}

/**
 * Circular sample std-dev approximation via mean resultant length.
 * Returns degrees; null when fewer than 2 samples.
 */
export function circularStdDevDegrees(degrees: number[]): number | null {
  if (degrees.length < 2) return null;
  let sinSum = 0;
  let cosSum = 0;
  for (const deg of degrees) {
    const rad = (deg * Math.PI) / 180;
    sinSum += Math.sin(rad);
    cosSum += Math.cos(rad);
  }
  const n = degrees.length;
  const r = Math.sqrt(sinSum * sinSum + cosSum * cosSum) / n;
  // σ ≈ sqrt(−2 ln R) in radians → degrees
  const clamped = Math.min(1, Math.max(1e-9, r));
  return Math.sqrt(-2 * Math.log(clamped)) * (180 / Math.PI);
}
