import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './atoms.css';

export type ButtonVariant = 'matcha' | 'forest' | 'glass' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';
export type ControlSurface = 'light' | 'dark';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Use 'dark' when placing glass/ghost buttons over dark overlays or photo lightboxes */
  surface?: ControlSurface;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export function Button({
  variant = 'matcha',
  size = 'md',
  surface = 'light',
  fullWidth = false,
  leftIcon,
  rightIcon,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    'gk-btn',
    `gk-btn--${variant}`,
    surface === 'dark' ? `gk-btn--${variant}-on-dark` : '',
    `gk-btn--${size}`,
    fullWidth ? 'gk-btn--full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type={type} className={classes} {...rest}>
      {leftIcon}
      <span>{children}</span>
      {rightIcon}
    </button>
  );
}
