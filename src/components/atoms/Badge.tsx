import type { HTMLAttributes, ReactNode } from 'react';
import './atoms.css';

export type BadgeTone = 'matcha' | 'mint' | 'amber' | 'coral' | 'neutral';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
}

export function Badge({
  tone = 'matcha',
  icon,
  className = '',
  children,
  ...rest
}: BadgeProps) {
  return (
    <span className={`gk-badge gk-badge--${tone} ${className}`.trim()} {...rest}>
      {icon}
      <span>{children}</span>
    </span>
  );
}
