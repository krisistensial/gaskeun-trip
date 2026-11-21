import { Plus } from 'lucide-react';
import './atoms.css';

export type DayPillVariant = 'day' | 'ideas' | 'add';

export interface DayPillProps {
  variant?: DayPillVariant;
  dayLabel?: string;
  dateNum?: string;
  active?: boolean;
  onClick?: () => void;
}

export function DayPill({
  variant = 'day',
  dayLabel = 'Thu',
  dateNum = '11',
  active = false,
  onClick,
}: DayPillProps) {
  const classes = [
    'gk-day-pill',
    variant === 'ideas' ? 'gk-day-pill--ideas' : '',
    variant === 'add' ? 'gk-day-pill--add' : '',
    active && variant !== 'add' ? 'gk-day-pill--active' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={classes}
      onClick={onClick}
      aria-pressed={variant !== 'add' ? active : undefined}
      aria-label={variant === 'add' ? 'Add new day' : `${dayLabel} ${dateNum}`.trim()}
    >
      {variant === 'add' ? (
        <>
          <Plus size={16} strokeWidth={2} color="var(--brand-matcha)" />
          <span className="gk-day-pill__day">Day</span>
        </>
      ) : variant === 'ideas' ? (
        <span className="gk-day-pill__day">{dayLabel || 'Ideas'}</span>
      ) : (
        <>
          <span className="gk-day-pill__day">{dayLabel}</span>
          <span className="gk-day-pill__num">{dateNum}</span>
        </>
      )}
    </button>
  );
}
