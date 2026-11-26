import { useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, G, Line, Path, Polygon, Text as SvgText } from 'react-native-svg';

import { chartSeries, colors } from '@/theme/colors';
import type { ChartType } from '@/types/models';
import type { TrendBuildResult, TrendSeries } from '@/trends/types';

const SERIES_COLORS = chartSeries;

const PAD = { top: 16, right: 12, bottom: 36, left: 44 };

interface TrendChartProps {
  result: TrendBuildResult;
  chartType: ChartType;
  showStdDev: boolean;
  height?: number;
  /** Override empty-state copy (e.g. first-run with no observations). */
  emptyHint?: string;
}

function niceDomain(min: number, max: number): [number, number] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    return [min - pad, max + pad];
  }
  const span = max - min;
  const pad = span * 0.08;
  return [min - pad, max + pad];
}

function formatTick(value: number): string {
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function formatDateTick(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length]!;
}

function buildPath(
  points: { x: number; y: number }[],
  close = false,
): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  let d = `M ${first!.x} ${first!.y}`;
  for (const p of rest) {
    d += ` L ${p.x} ${p.y}`;
  }
  if (close) d += ' Z';
  return d;
}

function scaleSeries(
  series: TrendSeries,
  plotW: number,
  plotH: number,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  sharedScale: boolean,
): { xs: number[]; ys: number[]; yLows: number[]; yHighs: number[] } {
  const localY = series.points.map((p) => p.value);
  const localMin = localY.length ? Math.min(...localY) : 0;
  const localMax = localY.length ? Math.max(...localY) : 1;
  const [ly0, ly1] = sharedScale ? [yMin, yMax] : niceDomain(localMin, localMax);

  const xs: number[] = [];
  const ys: number[] = [];
  const yLows: number[] = [];
  const yHighs: number[] = [];

  for (const p of series.points) {
    const tx = xMax === xMin ? 0.5 : (p.x - xMin) / (xMax - xMin);
    const x = PAD.left + tx * plotW;
    const ty = ly1 === ly0 ? 0.5 : (p.value - ly0) / (ly1 - ly0);
    const y = PAD.top + (1 - ty) * plotH;
    xs.push(x);
    ys.push(y);

    if (p.stdDev != null && Number.isFinite(p.stdDev)) {
      const low = p.value - p.stdDev;
      const high = p.value + p.stdDev;
      const tyLow = ly1 === ly0 ? 0.5 : (low - ly0) / (ly1 - ly0);
      const tyHigh = ly1 === ly0 ? 0.5 : (high - ly0) / (ly1 - ly0);
      yLows.push(PAD.top + (1 - tyLow) * plotH);
      yHighs.push(PAD.top + (1 - tyHigh) * plotH);
    } else {
      yLows.push(y);
      yHighs.push(y);
    }
  }

  return { xs, ys, yLows, yHighs };
}

export function TrendChart({
  result,
  chartType,
  showStdDev,
  height = 240,
  emptyHint,
}: TrendChartProps) {
  const { width: windowWidth } = useWindowDimensions();
  const width = Math.max(280, Math.min(windowWidth - 40, 520));
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  const layout = useMemo(() => {
    const active = result.series.filter((s) => s.points.length > 0);
    if (active.length === 0) return null;

    const allX = active.flatMap((s) => s.points.map((p) => p.x));
    const xMin = Math.min(...allX);
    const xMax = Math.max(...allX);

    const sharedScale = result.sharedUnit != null;
    let yMin = 0;
    let yMax = 1;
    if (sharedScale) {
      const allY = active.flatMap((s) =>
        s.points.flatMap((p) => {
          if (showStdDev && p.stdDev != null) {
            return [p.value - p.stdDev, p.value + p.stdDev, p.value];
          }
          return [p.value];
        }),
      );
      [yMin, yMax] = niceDomain(Math.min(...allY), Math.max(...allY));
    }

    return { active, xMin, xMax, yMin, yMax, sharedScale };
  }, [result, showStdDev]);

  if (!layout) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={styles.emptyText}>
          {emptyHint ??
            'No chartable points for the selected signals in this filter window. Enrich observations or widen filters.'}
        </Text>
      </View>
    );
  }

  const { active, xMin, xMax, yMin, yMax, sharedScale } = layout;
  const yTicks = sharedScale
    ? [yMin, (yMin + yMax) / 2, yMax]
    : [0, 0.5, 1];
  const xTicks = [xMin, (xMin + xMax) / 2, xMax];

  return (
    <View style={styles.wrap}>
      <Svg width={width} height={height}>
        {/* Axes */}
        <Line
          x1={PAD.left}
          y1={PAD.top}
          x2={PAD.left}
          y2={PAD.top + plotH}
          stroke={colors.border}
          strokeWidth={1}
        />
        <Line
          x1={PAD.left}
          y1={PAD.top + plotH}
          x2={PAD.left + plotW}
          y2={PAD.top + plotH}
          stroke={colors.border}
          strokeWidth={1}
        />

        {yTicks.map((tick, i) => {
          const y =
            sharedScale
              ? PAD.top + (1 - (tick - yMin) / (yMax - yMin || 1)) * plotH
              : PAD.top + (1 - tick) * plotH;
          return (
            <G key={`y-${i}`}>
              <Line
                x1={PAD.left}
                y1={y}
                x2={PAD.left + plotW}
                y2={y}
                stroke={colors.border}
                strokeWidth={0.5}
                opacity={0.6}
              />
              <SvgText
                x={PAD.left - 6}
                y={y + 4}
                fontSize={10}
                fill={colors.muted}
                textAnchor="end"
              >
                {sharedScale ? formatTick(tick) : `${Math.round(tick * 100)}%`}
              </SvgText>
            </G>
          );
        })}

        {xTicks.map((tick, i) => {
          const tx = xMax === xMin ? 0.5 : (tick - xMin) / (xMax - xMin);
          const x = PAD.left + tx * plotW;
          return (
            <SvgText
              key={`x-${i}`}
              x={x}
              y={height - 10}
              fontSize={10}
              fill={colors.muted}
              textAnchor="middle"
            >
              {formatDateTick(tick)}
            </SvgText>
          );
        })}

        {active.map((series, index) => {
          const color = seriesColor(index);
          const scaled = scaleSeries(
            series,
            plotW,
            plotH,
            xMin,
            xMax,
            yMin,
            yMax,
            sharedScale,
          );

          const bandPts: { x: number; y: number }[] = [];
          if (showStdDev && series.points.some((p) => p.stdDev != null)) {
            for (let i = 0; i < scaled.xs.length; i += 1) {
              bandPts.push({ x: scaled.xs[i]!, y: scaled.yHighs[i]! });
            }
            for (let i = scaled.xs.length - 1; i >= 0; i -= 1) {
              bandPts.push({ x: scaled.xs[i]!, y: scaled.yLows[i]! });
            }
          }

          const linePts = scaled.xs.map((x, i) => ({ x, y: scaled.ys[i]! }));

          return (
            <G key={series.key}>
              {bandPts.length >= 4 ? (
                <Polygon
                  points={bandPts.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill={color}
                  opacity={0.15}
                />
              ) : null}

              {chartType === 'bar'
                ? scaled.xs.map((x, i) => {
                    const barW = Math.max(4, plotW / Math.max(scaled.xs.length * 2, 8));
                    const y = scaled.ys[i]!;
                    const base = PAD.top + plotH;
                    return (
                      <Line
                        key={`${series.key}-bar-${i}`}
                        x1={x}
                        y1={base}
                        x2={x}
                        y2={y}
                        stroke={color}
                        strokeWidth={barW}
                        strokeLinecap="butt"
                        opacity={0.85}
                      />
                    );
                  })
                : (
                  <Path
                    d={buildPath(linePts)}
                    stroke={color}
                    strokeWidth={2}
                    fill="none"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                )}

              {scaled.xs.map((x, i) => (
                <Circle
                  key={`${series.key}-pt-${i}`}
                  cx={x}
                  cy={scaled.ys[i]!}
                  r={chartType === 'scatter' ? 4.5 : 3}
                  fill={color}
                />
              ))}
            </G>
          );
        })}
      </Svg>

      <View style={styles.legend}>
        {result.series.map((series, index) => (
          <View key={series.key} style={styles.legendRow}>
            <View style={[styles.swatch, { backgroundColor: seriesColor(index) }]} />
            <Text style={styles.legendText}>
              {series.label}
              {series.unit ? ` (${series.unit})` : ''}
              {` · ${series.points.length} pt`}
              {series.skippedCount > 0 ? ` · ${series.skippedCount} skipped` : ''}
            </Text>
          </View>
        ))}
        {!sharedScale && active.length > 1 ? (
          <Text style={styles.scaleNote}>
            Series use independent scales (different units). Y-axis shows relative %.
          </Text>
        ) : null}
        {sharedScale ? (
          <Text style={styles.scaleNote}>Shared scale ({result.sharedUnit}).</Text>
        ) : null}
        {showStdDev ? (
          <Text style={styles.scaleNote}>
            Shaded band = ± sample std-dev from multi-source samples (when ≥2 sources).
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
  },
  empty: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  legend: {
    gap: 6,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: 2,
  },
  legendText: {
    flex: 1,
    fontSize: 13,
    color: colors.ink,
  },
  scaleNote: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
    marginTop: 2,
  },
});
