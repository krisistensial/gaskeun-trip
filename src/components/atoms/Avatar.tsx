import './atoms.css';

export type AvatarVariant = 'solid' | 'selected' | 'tentative' | 'passenger';
export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

export interface AvatarProps {
  initials: string;
  name?: string;
  src?: string;
  showLabel?: boolean;
  variant?: AvatarVariant;
  size?: AvatarSize;
  bg?: string;
  color?: string;
  onClick?: () => void;
}

export function Avatar({
  initials,
  name,
  src,
  showLabel = false,
  variant = 'solid',
  size = 'md',
  bg = '#E3EDE6',
  color = '#2D4A42',
  onClick,
}: AvatarProps) {
  const circle = (
    <span
      className={`gk-avatar gk-avatar--${size} gk-avatar--${variant}`}
      style={{ backgroundColor: bg, color }}
      aria-label={name ?? initials}
    >
      {src ? (
        <img src={src} alt={name ?? initials} className="gk-avatar__img" />
      ) : (
        initials
      )}
      {variant === 'passenger' && <span className="gk-avatar__dot" aria-hidden="true" />}
    </span>
  );

  if (onClick) {
    return (
      <button type="button" className="gk-avatar-wrap tactile" onClick={onClick}>
        {circle}
        {showLabel && name && (
          <span className="gk-avatar__label">
            {variant === 'tentative' ? `${name}?` : name}
          </span>
        )}
      </button>
    );
  }

  return (
    <span className="gk-avatar-wrap">
      {circle}
      {showLabel && name && (
        <span className="gk-avatar__label">
          {variant === 'tentative' ? `${name}?` : name}
        </span>
      )}
    </span>
  );
}
