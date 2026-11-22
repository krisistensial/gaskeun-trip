import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useRegisterOverlay } from '../../context/OverlayContext';
import { CornerOrb } from './CornerOrb';
import '../organisms/sheets.css';

export interface LiquidBottomSheetProps {
  open: boolean;
  title?: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Portal-rendered Crystal Liquid Bottom Sheet.
 * - Mounts into `document.body` at `z-index: var(--z-sheet)` (strictly above Dock).
 * - Registers with OverlayContext so ExpandingGlassDock automatically hides.
 */
export function LiquidBottomSheet({
  open,
  title,
  subtitle,
  onClose,
  children,
}: LiquidBottomSheetProps) {
  useRegisterOverlay(open);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="gk-sheet-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="gk-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="gk-sheet__handle" />
        {(title || subtitle) && (
          <div className="gk-sheet__head">
            <div>
              {title && <h3 className="gk-sheet__title">{title}</h3>}
              {subtitle && <p className="gk-sheet__sub">{subtitle}</p>}
            </div>
            <CornerOrb kind="close" ariaLabel="Close sheet" onClick={onClose} />
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
