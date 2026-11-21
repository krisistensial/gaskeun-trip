import type { InputHTMLAttributes, ReactNode } from 'react';
import { Check, AlertCircle } from 'lucide-react';
import { Badge } from './Badge';
import './atoms.css';

export type InputStatus = 'default' | 'verified' | 'error';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  errorMessage?: string;
  status?: InputStatus;
  verifiedLabel?: string;
  leftIcon?: ReactNode;
  rightSlot?: ReactNode;
}

export function Input({
  label,
  hint,
  errorMessage,
  status = 'default',
  verifiedLabel = 'Verified',
  leftIcon,
  rightSlot,
  id,
  className = '',
  ...rest
}: InputProps) {
  const effectiveStatus: InputStatus = errorMessage ? 'error' : status;

  return (
    <div className={`gk-field ${className}`.trim()}>
      {label && (
        <label className="gk-field__label" htmlFor={id}>
          {label}
        </label>
      )}
      <div className={`gk-input-shell gk-input-shell--${effectiveStatus}`}>
        {leftIcon && <span className="gk-input__icon">{leftIcon}</span>}
        <input id={id} className="gk-input__native" {...rest} />
        {effectiveStatus === 'verified' && !rightSlot && (
          <Badge tone="mint" icon={<Check size={12} strokeWidth={2.2} />}>
            {verifiedLabel}
          </Badge>
        )}
        {effectiveStatus === 'error' && !rightSlot && (
          <Badge tone="coral" icon={<AlertCircle size={12} strokeWidth={2} />}>
            Invalid
          </Badge>
        )}
        {rightSlot}
      </div>
      {errorMessage ? (
        <span className="gk-field__error">{errorMessage}</span>
      ) : hint ? (
        <span className="gk-field__hint">{hint}</span>
      ) : null}
    </div>
  );
}
