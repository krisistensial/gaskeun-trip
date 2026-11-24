import { Calendar, Home, Images, ListChecks, Wallet, type LucideIcon } from 'lucide-react';
import { useHasActiveOverlay } from '../../context/OverlayContext';
import { triggerFeedback } from '../../services/feedback';
import type { DockTabId } from '../../types/trip';
import './ExpandingGlassDock.css';

interface DockItemConfig {
  id: DockTabId;
  label: string;
  Icon: LucideIcon;
}

const DOCK_ITEMS: DockItemConfig[] = [
  { id: 'home', label: 'Home', Icon: Home },
  { id: 'plan', label: 'Plan', Icon: Calendar },
  { id: 'wallet', label: 'Wallet', Icon: Wallet },
  { id: 'album', label: 'Album', Icon: Images },
  { id: 'prep', label: 'Prep', Icon: ListChecks },
];

export interface ExpandingGlassDockProps {
  activeTab: DockTabId;
  hidden?: boolean;
  onChange: (tab: DockTabId) => void;
}

export function ExpandingGlassDock({
  activeTab,
  hidden = false,
  onChange,
}: ExpandingGlassDockProps) {
  const hasOverlay = useHasActiveOverlay();
  const isHidden = hidden || hasOverlay;

  return (
    <div className={`gk-dock-wrap ${isHidden ? 'gk-dock-wrap--hidden' : ''}`} aria-hidden={isHidden}>
      <nav className="gk-dock" aria-label="Main navigation">
        {DOCK_ITEMS.map(({ id, label, Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              tabIndex={isHidden ? -1 : 0}
              className={`gk-dock__item ${isActive ? 'gk-dock__item--active' : ''}`}
              onClick={() => {
                if (!isActive) triggerFeedback('tap');
                onChange(id);
              }}
              aria-current={isActive ? 'page' : undefined}
              aria-label={label}
            >
              <Icon size={20} strokeWidth={1.8} />
              <span className="gk-dock__label">{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
