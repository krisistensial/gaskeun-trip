/**
 * Single mathematical source of truth for the Frozen Dotted Circular Arc
 * on `Plan → Trail`.
 *
 * Both the fixed dotted SVG rail AND every `TrailDot` + card offset
 * read `getArcX(normalizedY)` so dots stay 100% locked onto the circular rail
 * during 60fps scrolling regardless of whether a day has 1, 4, or 10 stops.
 */

export const ARC_HEIGHT = 520;
export const ARC_WIDTH = 64;
export const ARC_BASE_X = 12;
export const ARC_BULGE = 28;
export const ARC_MAX_X = ARC_BASE_X + ARC_BULGE; // 40px at vertical center u = 0
export const ARC_DOT_GAP = 22; // Fixed distance from dot center to card left edge

const HALF_H = ARC_HEIGHT / 2; // 260px
// Exact circle radius R passing through (ARC_BASE_X, ±HALF_H) and (ARC_MAX_X, 0)
const ARC_RADIUS = (HALF_H * HALF_H + ARC_BULGE * ARC_BULGE) / (2 * ARC_BULGE);

/**
 * Computes the exact horizontal coordinate `x` (in px, inside the 64px left rail)
 * along a true circular C-arc for normalized vertical coordinate `u ∈ [-1, 1]`:
 * - `u = 0`   → vertical center of the trail viewport (`x = ARC_MAX_X = 40px`)
 * - `u = ±1`  → top/bottom edge of the trail viewport (`x = ARC_BASE_X = 12px`)
 */
export function getArcX(normalizedY: number): number {
  const u = Math.max(-1, Math.min(1, normalizedY));
  const dy = u * HALF_H;
  const sagittaAtY =
    Math.sqrt(Math.max(0, ARC_RADIUS * ARC_RADIUS - dy * dy)) - (ARC_RADIUS - ARC_BULGE);
  return ARC_BASE_X + sagittaAtY;
}

/**
 * Generates an SVG path string sampled directly from `getArcX` for any stage height
 * so circular dots (`stroke-dasharray="1 10"`) stay 100% round and never stretch.
 */
export function buildDottedArcPath(paddingY = 12, samples = 56, height = ARC_HEIGHT): string {
  const safeHeight = Math.max(200, height);
  const half = safeHeight / 2;
  const startY = paddingY;
  const endY = safeHeight - paddingY;
  const cmds: string[] = [];

  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const y = startY + t * (endY - startY);
    const u = (y - half) / half;
    const x = getArcX(u);
    cmds.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`);
  }

  return cmds.join(' ');
}

export interface ArcRowMetric {
  id: string;
  centerY: number;
}

export interface ClosestArcMatch {
  id: string;
  targetScrollTop: number;
  distancePx: number;
}

/**
 * Finds the stop/idea row closest to the vertical center (`scrollTop + halfH`)
 * of `.trail-scroll-viewport` and returns the exact clamped `scrollTop` needed
 * to dock that card squarely at the outermost arc apex (`u = 0`).
 */
export function findClosestArcRow(
  rows: readonly ArcRowMetric[],
  scrollTop: number,
  halfH: number,
  maxScrollTop: number,
): ClosestArcMatch | null {
  if (rows.length === 0) return null;

  const viewportCenter = scrollTop + halfH;
  let best: ArcRowMetric = rows[0];
  let bestDist = Math.abs(best.centerY - viewportCenter);

  for (let i = 1; i < rows.length; i += 1) {
    const dist = Math.abs(rows[i].centerY - viewportCenter);
    if (dist < bestDist) {
      bestDist = dist;
      best = rows[i];
    }
  }

  const rawTarget = best.centerY - halfH;
  const clampedMax = Math.max(0, maxScrollTop);
  const targetScrollTop = Math.max(0, Math.min(clampedMax, Math.round(rawTarget)));

  return {
    id: best.id,
    targetScrollTop,
    distancePx: bestDist,
  };
}
