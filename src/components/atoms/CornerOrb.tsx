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
  /** Use 'dark' when rendering over dark overlays, lightboxes, or dark photo headers */
  surface?: 'light' | 'dark';
  icon?: ReactNode;
  ariaLabel: string;
  onClick?: () => void;
  className?: string;
  /** Render floating bottom-right orb directly in document.body so ancestor transforms/overflow never trap fixed positioning */
  portal?: boolean;
  /** Optional guided tour target attribute */
  dataTour?: string;
}

export function CornerOrb({
  kind = 'menu',
  size = 'md',
  surface = 'light',
  icon,
  ariaLabel,
  onClick,
  className = '',
  portal = false,
  dataTour,
}: CornerOrbProps) {
  const hasOverlay = useHasActiveOverlay();
  const isFloatingFab = portal || className.includes('floating-glass-fab');

  const renderIcon = () => {
    if (icon) return icon;
    switch (kind) {
      case 'back':
        return <ChevronLeft size={20} strokeWidth={1.8} />;
      case 'close':
        return <X size={19} strokeWidth={surface === 'dark' ? 2.25 : 1.8} />;
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
      <div
        data-tour={dataTour}
        className={`floating-glass-fab ${className.replace('floating-glass-fab', '').trim()}`.trim()}
      >
        <LiquidGlassSurface
          cornerRadius={999}
          displacementScale={20}
          bezelWidth={8}
          chromaticAberration={0}
          blurAmount={1.1}
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
      data-tour={dataTour}
      className={[
        'gk-orb',
        size === 'lg' ? 'gk-orb--lg' : '',
        surface === 'dark' ? 'gk-orb--on-dark' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {renderIcon()}
    </button>
  );
}
