import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './atoms.css';

export type ButtonVariant = 'matcha' | 'forest' | 'glass' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export function Button({
  variant = 'matcha',
  size = 'md',
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
