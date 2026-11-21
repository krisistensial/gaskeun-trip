import type { ReactNode } from 'react';
import { GlassCard } from './GlassCard';
import './atoms.css';

export interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <GlassCard variant="clear" padding="none">
      <div className="gk-empty">
        <div className="gk-empty__icon">{icon}</div>
        <h4 className="gk-empty__title">{title}</h4>
        <p className="gk-empty__desc">{description}</p>
        {action && <div style={{ marginTop: 6 }}>{action}</div>}
      </div>
    </GlassCard>
  );
}
