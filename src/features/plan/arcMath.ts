/**
 * Single mathematical source of truth for the Fixed Dotted Circular Arc
 * on `Plan → Trail`.
 *
 * Both the fixed sticky SVG dotted rail AND every `TrailDot` + card offset
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
 * - `u = 0`   → vertical center of the 520px sticky rail (`x = ARC_MAX_X = 40px`)
 * - `u = ±1`  → top/bottom edge of the 520px sticky rail (`x = ARC_BASE_X = 12px`)
 */
export function getArcX(normalizedY: number): number {
  const u = Math.max(-1, Math.min(1, normalizedY));
  const dy = u * HALF_H;
  const sagittaAtY = Math.sqrt(Math.max(0, ARC_RADIUS * ARC_RADIUS - dy * dy)) - (ARC_RADIUS - ARC_BULGE);
  return ARC_BASE_X + sagittaAtY;
}

/**
 * Generates an SVG path string sampled directly from `getArcX` so the rendered
 * dotted rail matches the dot coordinate equation down to sub-pixel precision.
 */
export function buildDottedArcPath(paddingY = 10, samples = 50): string {
  const startY = paddingY;
  const endY = ARC_HEIGHT - paddingY;
  const cmds: string[] = [];

  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const y = startY + t * (endY - startY);
    const u = (y - HALF_H) / HALF_H;
    const x = getArcX(u);
    cmds.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`);
  }

  return cmds.join(' ');
}
