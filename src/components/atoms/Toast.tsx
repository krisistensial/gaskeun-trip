import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import './atoms.css';

export type ToastTone = 'success' | 'info' | 'error';

export interface ToastProps {
  open: boolean;
  message: string;
  tone?: ToastTone;
  durationMs?: number;
  onClose: () => void;
}

export function Toast({
  open,
  message,
  tone = 'success',
  durationMs = 2800,
  onClose,
}: ToastProps) {
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(onClose, durationMs);
    return () => window.clearTimeout(timer);
  }, [open, durationMs, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const Icon = tone === 'error' ? AlertCircle : tone === 'info' ? Info : CheckCircle2;

  return createPortal(
    <div className="gk-toast-host" role="status" aria-live="polite">
      <div className="gk-toast">
        <Icon size={18} strokeWidth={1.8} className={`gk-toast__icon--${tone}`} />
        <span>{message}</span>
      </div>
    </div>,
    document.body,
  );
}
