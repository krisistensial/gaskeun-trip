import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useRegisterOverlay } from '../../context/OverlayContext';
import { triggerFeedback } from '../../services/feedback';
import { useBackHandler } from '../../services/pwaHistory';
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
  useBackHandler(open, onClose, 'sheet', title);

  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      triggerFeedback('tap');
    }
    wasOpenRef.current = open;
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const handleClose = () => {
    triggerFeedback('tap');
    onClose();
  };

  return createPortal(
    <div className="gk-sheet-backdrop" role="dialog" aria-modal="true" onClick={handleClose}>
      <div className="gk-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="gk-sheet__handle" />
        {(title || subtitle) && (
          <div className="gk-sheet__head">
            <div>
              {title && <h3 className="gk-sheet__title">{title}</h3>}
              {subtitle && <p className="gk-sheet__sub">{subtitle}</p>}
            </div>
            <CornerOrb kind="close" ariaLabel="Close sheet" onClick={handleClose} />
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
