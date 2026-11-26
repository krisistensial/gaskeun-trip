import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import './LiquidGlassSurface.css';

export function canUseSvgLiquidGlass(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  const reducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) return false;

  const ua = navigator.userAgent || '';
  const isChromiumBlink =
    /(Chrome|Chromium|Edg\/)/i.test(ua) && !/(CriOS|FxiOS|OPiOS)/i.test(ua);
  return isChromiumBlink;
}

export function sanitizeSvgFilterId(rawId: string): string {
  const cleaned = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  return `gk-lens-${cleaned || 'glass'}`;
}

/**
 * Generates an RGBA displacement map (data URL) for `<feDisplacementMap>` shaping
 * a convex rounded-capsule optical bezel:
 * - Neutral (128, 128) in the flat center so icons & text remain tack-sharp
 * - Smooth outward normal curve near the rounded rim so passing content bends cleanly
 */
export function buildConvexLensMapDataUrl(
  width: number,
  height: number,
  cornerRadius: number,
  bezelWidth = 18,
): string {
  if (typeof document === 'undefined') return '';
  const w = Math.max(16, Math.round(width));
  const h = Math.max(16, Math.round(height));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const img = ctx.createImageData(w, h);
  const data = img.data;
  const halfW = w / 2;
  const halfH = h / 2;
  const r = Math.min(cornerRadius, halfW, halfH);
  const bx = Math.max(0, halfW - r);
  const by = Math.max(0, halfH - r);
  const bezel = Math.max(6, Math.min(bezelWidth, Math.min(halfW, halfH)));

  for (let y = 0; y < h; y++) {
    const py = y + 0.5 - halfH;
    const ay = Math.abs(py);
    const qy = Math.max(0, ay - by);

    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - halfW;
      const ax = Math.abs(px);
      const qx = Math.max(0, ax - bx);

      let sdf: number;
      let nx = 0;
      let ny = 0;

      if (qx > 0 || qy > 0) {
        const len = Math.hypot(qx, qy) || 1;
        sdf = len - r;
        nx = (px >= 0 ? 1 : -1) * (qx / len);
        ny = (py >= 0 ? 1 : -1) * (qy / len);
      } else {
        const dxEdge = ax - bx;
        const dyEdge = ay - by;
        if (dxEdge > dyEdge) {
          sdf = dxEdge - r;
          nx = px >= 0 ? 1 : -1;
        } else {
          sdf = dyEdge - r;
          ny = py >= 0 ? 1 : -1;
        }
      }

      const distInside = Math.max(0, -sdf);
      let dx = 0;
      let dy = 0;
      if (distInside < bezel) {
        const t = 1 - distInside / bezel; // 1 at rim -> 0 inward
        const dome = Math.sin(t * Math.PI * 0.5) * t;
        dx = -nx * dome;
        dy = -ny * dome;
      }

      const idx = (y * w + x) * 4;
      data[idx] = Math.max(0, Math.min(255, Math.round(128 + dx * 126)));
      data[idx + 1] = Math.max(0, Math.min(255, Math.round(128 + dy * 126)));
      data[idx + 2] = 128;
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  try {
    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
}

export interface LiquidGlassSurfaceProps {
  children: ReactNode;
  cornerRadius?: number;
  displacementScale?: number;
  blurAmount?: number;
  saturation?: number;
  className?: string;
  fallbackClassName?: string;
  style?: CSSProperties;
}

/**
 * Crystal-clear Optical Liquid Glass wrapper:
 * - On Chromium (Chrome Android/Desktop, Edge), applies `<feDisplacementMap>` via CSS
 *   `backdrop-filter: url(#lens)` directly onto live DOM pixels behind the glass —
 *   preserving crystal transparency while optically bending cards, borders, and shapes.
 * - On Safari/iOS, Firefox, and reduced-motion devices, renders clean CSS Crystal Liquid.
 */
export function LiquidGlassSurface({
  children,
  cornerRadius = 30,
  displacementScale = 28,
  blurAmount = 2.5,
  saturation = 190,
  className = '',
  fallbackClassName = '',
  style,
}: LiquidGlassSurfaceProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const reactId = useId();
  const filterId = useMemo(() => sanitizeSvgFilterId(reactId), [reactId]);
  const [size, setSize] = useState<{ width: number; height: number }>({
    width: cornerRadius >= 900 ? 48 : 344,
    height: cornerRadius >= 900 ? 48 : 60,
  });

  const enabled = canUseSvgLiquidGlass();

  useEffect(() => {
    if (!enabled) return;
    const el = hostRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width >= 16 && rect.height >= 16) {
        setSize((prev) =>
          Math.abs(prev.width - rect.width) > 1 || Math.abs(prev.height - rect.height) > 1
            ? { width: Math.round(rect.width), height: Math.round(rect.height) }
            : prev,
        );
      }
    };

    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [enabled]);

  const lensMapUrl = useMemo(() => {
    if (!enabled) return '';
    return buildConvexLensMapDataUrl(size.width, size.height, cornerRadius, 18);
  }, [enabled, size.width, size.height, cornerRadius]);

  if (!enabled || !lensMapUrl) {
    return (
      <div className={fallbackClassName} style={{ width: '100%', height: '100%', ...style }}>
        {children}
      </div>
    );
  }

  const effectiveRadius = Math.min(cornerRadius, size.height / 2);

  return (
    <div
      ref={hostRef}
      className={`gk-lens-host ${className}`.trim()}
      style={{
        borderRadius: `${effectiveRadius}px`,
        backdropFilter: `url(#${filterId}) blur(${blurAmount}px) saturate(${saturation}%) brightness(1.05)`,
        WebkitBackdropFilter: `url(#${filterId}) blur(${blurAmount}px) saturate(${saturation}%) brightness(1.05)`,
        ...style,
      }}
    >
      <svg className="gk-lens-svg" width="0" height="0" aria-hidden="true">
        <defs>
          <filter
            id={filterId}
            x="0%"
            y="0%"
            width="100%"
            height="100%"
            colorInterpolationFilters="sRGB"
          >
            <feImage
              href={lensMapUrl}
              x="0%"
              y="0%"
              width="100%"
              height="100%"
              preserveAspectRatio="none"
              result="LENS_MAP"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="LENS_MAP"
              scale={displacementScale}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>
      <div className="gk-lens-rim" aria-hidden="true" />
      <div className="gk-lens-content">{children}</div>
    </div>
  );
}
