import { Check } from 'lucide-react';
import './atoms.css';

export type TrailDotStatus = 'done' | 'active' | 'upcoming' | 'content' | 'content-done';

export interface TrailDotProps {
  status: TrailDotStatus;
}

export function TrailDot({ status }: TrailDotProps) {
  const showCheck = status === 'done' || status === 'content-done';
  return (
    <span className={`gk-trail-dot gk-trail-dot--${status}`} aria-label={status}>
      {showCheck && <Check size={12} strokeWidth={2.4} />}
    </span>
  );
}
