import { createPortal } from 'react-dom';
import { useRegisterOverlay } from '../../context/OverlayContext';
import { useBackHandler } from '../../services/pwaHistory';
import { Button } from './Button';
import './atoms.css';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useRegisterOverlay(open);
  useBackHandler(open, onCancel, 'sheet', title);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="gk-dialog-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gk-dialog-title"
      onClick={onCancel}
    >
      <div className="gk-dialog" onClick={(e) => e.stopPropagation()}>
        <h3 id="gk-dialog-title" className="gk-dialog__title">
          {title}
        </h3>
        <p className="gk-dialog__desc">{description}</p>
        <div className="gk-dialog__actions">
          <Button variant="glass" size="md" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'matcha'}
            size="md"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
