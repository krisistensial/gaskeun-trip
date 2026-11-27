import type { DockTabId } from '../types/trip';

export interface OnboardingTourStep {
  id: string;
  /** Which main Dock tab must be active for this step */
  tab: DockTabId;
  /** Friendly page label shown in the tour step badge */
  tabLabel: string;
  targetSelector: string;
  title: string;
  description: string;
  /** Whether the Floating Glass Dock must be visible during this step */
  requiresDock?: boolean;
  /** Scroll alignment when focusing the target element */
  scrollBlock?: ScrollLogicalPosition;
  /** Extra padding around the spotlight box in px */
  spotlightPadding?: number;
  /** Border radius of the spotlight cutout in px */
  spotlightRadius?: number;
}

export const ONBOARDING_TOUR_KEY_PREFIX = 'gaskeun_tour_done_v1_';

export const ONBOARDING_TOUR_STEPS: readonly OnboardingTourStep[] = [
  {
    id: 'home-hero',
    tab: 'home',
    tabLabel: 'Home',
    targetSelector: '[data-tour="home-hero"]',
    title: 'Live Countdown & Trip Hub',
    description:
      'Track your departure countdown at a glance. Tap the trip title to switch trips, or scroll down to explore rides & stays.',
    scrollBlock: 'start',
    spotlightPadding: 8,
    spotlightRadius: 24,
  },
  {
    id: 'home-chat',
    tab: 'home',
    tabLabel: 'Chat',
    targetSelector: '[data-tour="home-chat"]',
    title: 'Crew Chat, Stickers & Polls',
    description:
      'Tap this floating glass orb from any page to chat live with your crew, send transparent stickers, or run quick polls.',
    scrollBlock: 'nearest',
    spotlightPadding: 10,
    spotlightRadius: 999,
  },
  {
    id: 'home-profile',
    tab: 'home',
    tabLabel: 'Home',
    targetSelector: '[data-tour="home-profile"]',
    title: 'Profile, Passcode & Settings',
    description:
      'Update your avatar, lock your profile with a 4-digit passcode, enable phone alerts, or replay this tour anytime.',
    scrollBlock: 'start',
    spotlightPadding: 10,
    spotlightRadius: 999,
  },
  {
    id: 'home-bento',
    tab: 'home',
    tabLabel: 'Home',
    targetSelector: '[data-tour="home-bento"]',
    title: 'Train Pass & Shared Album',
    description:
      'Check your outbound & return train schedule and preview the latest crew photo collage right on Home.',
    scrollBlock: 'center',
    spotlightPadding: 8,
    spotlightRadius: 26,
  },
  {
    id: 'home-crew',
    tab: 'home',
    tabLabel: 'Home',
    targetSelector: '[data-tour="home-crew"]',
    title: 'Rides, Seats & Stays',
    description:
      'See motorbike pairings, car cabin seating, train seat assignments, and shared homestay rooms.',
    scrollBlock: 'center',
    spotlightPadding: 8,
    spotlightRadius: 26,
  },
  {
    id: 'glass-dock',
    tab: 'home',
    tabLabel: 'Dock',
    targetSelector: '[data-tour="glass-dock"]',
    title: 'Quick Navigation Dock',
    description:
      'Jump smoothly between all 5 pages. Next, let us take a quick peek inside Plan, Wallet, Album, and Prep!',
    requiresDock: true,
    scrollBlock: 'nearest',
    spotlightPadding: 8,
    spotlightRadius: 34,
  },
  {
    id: 'plan-overview',
    tab: 'plan',
    tabLabel: 'Plan',
    targetSelector: '[data-tour="plan-overview"]',
    title: 'Plan — Itinerary, Map & Table',
    description:
      'Explore every stop by day on the curved Trail or Table view, filter by Places, Transit, or Content Ideas, export Excel, or open the offline Route Map.',
    requiresDock: true,
    scrollBlock: 'start',
    spotlightPadding: 6,
    spotlightRadius: 24,
  },
  {
    id: 'wallet-overview',
    tab: 'wallet',
    tabLabel: 'Wallet',
    targetSelector: '[data-tour="wallet-overview"]',
    title: 'Wallet — Shared Funds & Personal Spend',
    description:
      'Track Combined Balance, Crew Pool, Fundraise goals, and Budget Pockets — plus a private Personal tab visible only on your device.',
    requiresDock: true,
    scrollBlock: 'start',
    spotlightPadding: 8,
    spotlightRadius: 22,
  },
  {
    id: 'album-overview',
    tab: 'album',
    tabLabel: 'Album',
    targetSelector: '[data-tour="album-overview"]',
    title: 'Album — Shared Photos & Content Ideas',
    description:
      'Upload and download trip memories via shared Google Drive, or switch to Ideas to save Reels & TikTok inspiration straight into your Plan.',
    requiresDock: true,
    scrollBlock: 'start',
    spotlightPadding: 8,
    spotlightRadius: 22,
  },
  {
    id: 'prep-overview',
    tab: 'prep',
    tabLabel: 'Prep',
    targetSelector: '[data-tour="prep-overview"]',
    title: 'Prep — Private Bags & Group Checklist',
    description:
      'Pack your own private checklist organized by Bag or Place with 1-tap Move (saved on your phone only), or switch to Group for shared crew gear.',
    requiresDock: true,
    scrollBlock: 'start',
    spotlightPadding: 8,
    spotlightRadius: 24,
  },
];

export function buildTourStorageKey(tripCode: string, memberId: string): string {
  const normCode = tripCode.trim().toUpperCase() || 'TRIP';
  const normMember = memberId.trim() || 'guest';
  return `${ONBOARDING_TOUR_KEY_PREFIX}${normCode}_${normMember}`;
}

export function hasCompletedTour(tripCode: string, memberId: string | null): boolean {
  if (!tripCode.trim() || !memberId || memberId === 'guest') return true;
  try {
    if (typeof localStorage === 'undefined') return false;
    return Boolean(localStorage.getItem(buildTourStorageKey(tripCode, memberId)));
  } catch {
    return false;
  }
}

export function markTourCompleted(tripCode: string, memberId: string | null): void {
  if (!tripCode.trim() || !memberId || memberId === 'guest') return;
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(
      buildTourStorageKey(tripCode, memberId),
      new Date().toISOString(),
    );
  } catch {
    // ignore quota errors
  }
}

export function resetTourCompleted(tripCode: string, memberId: string | null): void {
  if (!tripCode.trim() || !memberId || memberId === 'guest') return;
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(buildTourStorageKey(tripCode, memberId));
  } catch {
    // ignore storage errors
  }
}
