import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, MoreHorizontal, Plus, X } from 'lucide-react';
import { useHasActiveOverlay } from '../../context/OverlayContext';
import { LiquidGlassSurface } from './LiquidGlassSurface';
import './atoms.css';

export type CornerOrbKind = 'menu' | 'back' | 'close' | 'add' | 'custom';

export interface CornerOrbProps {
  kind?: CornerOrbKind;
  size?: 'md' | 'lg';
  icon?: ReactNode;
  ariaLabel: string;
  onClick?: () => void;
  className?: string;
  /** Render floating bottom-right orb directly in document.body so ancestor transforms/overflow never trap fixed positioning */
  portal?: boolean;
}

export function CornerOrb({
  kind = 'menu',
  size = 'md',
  icon,
  ariaLabel,
  onClick,
  className = '',
  portal = false,
}: CornerOrbProps) {
  const hasOverlay = useHasActiveOverlay();
  const isFloatingFab = portal || className.includes('floating-glass-fab');

  const renderIcon = () => {
    if (icon) return icon;
    switch (kind) {
      case 'back':
        return <ChevronLeft size={20} strokeWidth={1.8} />;
      case 'close':
        return <X size={19} strokeWidth={1.8} />;
      case 'add':
        return <Plus size={22} strokeWidth={2} />;
      case 'menu':
      default:
        return <MoreHorizontal size={20} strokeWidth={1.8} />;
    }
  };

  if (isFloatingFab) {
    if (hasOverlay || typeof document === 'undefined') {
      return null;
    }
    const fabNode = (
      <div className={`floating-glass-fab ${className.replace('floating-glass-fab', '').trim()}`.trim()}>
        <LiquidGlassSurface
          cornerRadius={999}
          displacementScale={24}
          blurAmount={2}
          saturation={190}
          className="gk-orb-lgr-host"
          fallbackClassName="gk-orb gk-orb--lg"
        >
          <button
            type="button"
            className="gk-orb-fab-btn"
            aria-label={ariaLabel}
            onClick={onClick}
          >
            {renderIcon()}
          </button>
        </LiquidGlassSurface>
      </div>
    );
    return createPortal(fabNode, document.body);
  }

  return (
    <button
      type="button"
      className={`gk-orb ${size === 'lg' ? 'gk-orb--lg' : ''} ${className}`.trim()}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {renderIcon()}
    </button>
  );
}
