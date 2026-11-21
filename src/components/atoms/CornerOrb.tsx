import type { ReactNode } from 'react';
import { ChevronLeft, MoreHorizontal, Plus, X } from 'lucide-react';
import './atoms.css';

export type CornerOrbKind = 'menu' | 'back' | 'close' | 'add' | 'custom';

export interface CornerOrbProps {
  kind?: CornerOrbKind;
  size?: 'md' | 'lg';
  icon?: ReactNode;
  ariaLabel: string;
  onClick?: () => void;
  className?: string;
}

export function CornerOrb({
  kind = 'menu',
  size = 'md',
  icon,
  ariaLabel,
  onClick,
  className = '',
}: CornerOrbProps) {
  const renderIcon = () => {
    if (icon) return icon;
    switch (kind) {
      case 'back':
        return <ChevronLeft size={20} strokeWidth={1.8} />;
      case 'close':
        return <X size={19} strokeWidth={1.8} />;
      case 'add':
        return <Plus size={22} strokeWidth={2} />;
      case 'menu':
      default:
        return <MoreHorizontal size={20} strokeWidth={1.8} />;
    }
  };

  return (
    <button
      type="button"
      className={`gk-orb ${size === 'lg' ? 'gk-orb--lg' : ''} ${className}`.trim()}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {renderIcon()}
    </button>
  );
}
