import {
  Calendar,
  Home,
  Images,
  ListChecks,
  MessageCircle,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useHasActiveOverlay } from '../../context/OverlayContext';
import { triggerFeedback } from '../../services/feedback';
import type { DockTabId } from '../../types/trip';
import { LiquidGlassSurface } from '../atoms/LiquidGlassSurface';
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
  unreadChatCount?: number;
  onOpenChat?: () => void;
  onChange: (tab: DockTabId) => void;
}

export function ExpandingGlassDock({
  activeTab,
  hidden = false,
  unreadChatCount = 0,
  onOpenChat,
  onChange,
}: ExpandingGlassDockProps) {
  const hasOverlay = useHasActiveOverlay();
  const isDockHidden = hidden || hasOverlay;
  const isChatHidden = hasOverlay;

  return (
    <div className="gk-dock-bar">
      {/* Main 5-Tab Expanding Liquid Glass Pill Dock */}
      <div
        data-tour="glass-dock"
        className={`gk-dock-pill-slot ${isDockHidden ? 'gk-dock-slot--hidden' : ''}`}
        aria-hidden={isDockHidden}
      >
        <LiquidGlassSurface
          cornerRadius={30}
          displacementScale={22}
          bezelWidth={9}
          chromaticAberration={0}
          blurAmount={1.15}
          saturation={190}
          className="gk-dock-lgr-host"
          fallbackClassName="gk-dock-fallback"
        >
          <nav className="gk-dock" aria-label="Main navigation">
            {DOCK_ITEMS.map(({ id, label, Icon }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  tabIndex={isDockHidden ? -1 : 0}
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
        </LiquidGlassSurface>
      </div>

      {/* Detached Circular Liquid Glass Crew Chat Orb (Aligned right of Dock, stays accessible on Hero) */}
      {onOpenChat && (
        <div
          data-tour="home-chat"
          className={`gk-dock-chat-slot ${isChatHidden ? 'gk-dock-slot--hidden' : ''}`}
          aria-hidden={isChatHidden}
        >
          <LiquidGlassSurface
            cornerRadius={999}
            displacementScale={24}
            bezelWidth={9}
            chromaticAberration={0}
            blurAmount={1.05}
            saturation={195}
            className="gk-dock-chat-lgr-host"
            fallbackClassName="gk-dock-chat-fallback"
          >
            <button
              type="button"
              tabIndex={isChatHidden ? -1 : 0}
              className="gk-dock-chat-btn"
              aria-label={
                unreadChatCount > 0
                  ? `Open crew chat (${unreadChatCount} unread)`
                  : 'Open crew chat'
              }
              title="Crew Chat"
              onClick={() => {
                triggerFeedback('tap');
                onOpenChat();
              }}
            >
              <MessageCircle size={21} strokeWidth={1.9} />
            </button>
          </LiquidGlassSurface>
          {unreadChatCount > 0 && (
            <span className="gk-dock-chat-badge" aria-hidden="true">
              {unreadChatCount > 99 ? '99+' : unreadChatCount}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
