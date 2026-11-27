export interface OnboardingTourStep {
  id: string;
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
    targetSelector: '[data-tour="home-hero"]',
    title: 'Live Countdown & Trip Hub',
    description:
      'Track your departure countdown at a glance. Scroll down anytime to explore rides, stays, and crew details.',
    scrollBlock: 'start',
    spotlightPadding: 8,
    spotlightRadius: 24,
  },
  {
    id: 'home-chat',
    targetSelector: '[data-tour="home-chat"]',
    title: 'Crew Chat & Live Polls',
    description:
      'Tap here to chat with your crew, send transparent stickers, run quick polls, and see who is online right now.',
    scrollBlock: 'start',
    spotlightPadding: 10,
    spotlightRadius: 999,
  },
  {
    id: 'home-profile',
    targetSelector: '[data-tour="home-profile"]',
    title: 'Profile, Passcode & Settings',
    description:
      'Change your profile photo, manage your 4-digit passcode, enable phone alerts, or replay this tour anytime.',
    scrollBlock: 'start',
    spotlightPadding: 10,
    spotlightRadius: 999,
  },
  {
    id: 'home-bento',
    targetSelector: '[data-tour="home-bento"]',
    title: 'Train Pass & Shared Album',
    description:
      'Check your outbound & return train schedule and jump straight into your crew photo collage.',
    scrollBlock: 'center',
    spotlightPadding: 8,
    spotlightRadius: 26,
  },
  {
    id: 'home-crew',
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
    targetSelector: '[data-tour="glass-dock"]',
    title: 'Quick Navigation Dock',
    description:
      'Switch effortlessly between Home, Plan itinerary, Wallet funds, Album & content ideas, and your private Prep list.',
    requiresDock: true,
    scrollBlock: 'nearest',
    spotlightPadding: 8,
    spotlightRadius: 34,
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
