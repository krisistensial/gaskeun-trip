import { Check } from 'lucide-react';
import './atoms.css';

export type TrailDotStatus = 'done' | 'active' | 'upcoming';

export interface TrailDotProps {
  status: TrailDotStatus;
}

export function TrailDot({ status }: TrailDotProps) {
  return (
    <span className={`gk-trail-dot gk-trail-dot--${status}`} aria-label={status}>
      {status === 'done' && <Check size={12} strokeWidth={2.4} />}
    </span>
  );
}
