import type { HTMLAttributes, ReactNode } from 'react';
import './atoms.css';

export type GlassVariant = 'clear' | 'spotlight' | 'elevated' | 'tinted';
export type GlassPadding = 'none' | 'sm' | 'md' | 'lg';

export interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: GlassVariant;
  padding?: GlassPadding;
  interactive?: boolean;
  children: ReactNode;
}

export function GlassCard({
  variant = 'clear',
  padding = 'md',
  interactive = false,
  className = '',
  children,
  ...rest
}: GlassCardProps) {
  const classes = [
    'gk-glass',
    `gk-glass--${variant}`,
    `gk-glass--pad-${padding}`,
    interactive ? 'gk-glass--interactive' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
