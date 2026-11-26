import type { CSSProperties, ReactNode } from 'react';
import LiquidGlass from 'liquid-glass-react';
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

export interface LiquidGlassSurfaceProps {
  children: ReactNode;
  cornerRadius?: number;
  displacementScale?: number;
  blurAmount?: number;
  saturation?: number;
  aberrationIntensity?: number;
  elasticity?: number;
  overLight?: boolean;
  mode?: 'standard' | 'polar' | 'prominent' | 'shader';
  className?: string;
  fallbackClassName?: string;
  style?: CSSProperties;
}

/**
 * Hybrid Liquid Glass wrapper:
 * - Uses real SVG displacement refraction (`liquid-glass-react`) on Chromium browsers
 * - Falls back cleanly to pure CSS Crystal Liquid (`fallbackClassName`) on iOS Safari,
 *   Firefox, and reduced-motion devices so scroll FPS & layout stay rock-solid.
 */
export function LiquidGlassSurface({
  children,
  cornerRadius = 30,
  displacementScale = 24,
  blurAmount = 0.04,
  saturation = 155,
  aberrationIntensity = 0,
  elasticity = 0.1,
  overLight = false,
  mode = 'shader',
  className = '',
  fallbackClassName = '',
  style,
}: LiquidGlassSurfaceProps) {
  if (!canUseSvgLiquidGlass()) {
    return (
      <div className={fallbackClassName} style={{ width: '100%', height: '100%', ...style }}>
        {children}
      </div>
    );
  }

  return (
    <div className={`gk-lgr-host ${className}`.trim()} style={style}>
      <LiquidGlass
        cornerRadius={cornerRadius}
        displacementScale={displacementScale}
        blurAmount={blurAmount}
        saturation={saturation}
        aberrationIntensity={aberrationIntensity}
        elasticity={elasticity}
        overLight={overLight}
        mode={mode}
        padding="0px"
        className="gk-lgr-node"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: '100%',
          height: '100%',
        }}
      >
        {children}
      </LiquidGlass>
    </div>
  );
}
