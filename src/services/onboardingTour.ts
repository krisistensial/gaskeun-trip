import type { DockTabId } from '../types/trip';

export interface OnboardingTourAccess {
  isHost: boolean;
  canEditCrew: boolean;
  canEditPlan: boolean;
  canEditWallet: boolean;
  canEditPrep: boolean;
}

export interface OnboardingTourStep {
  id: string;
  /** Which main Dock tab must be active for this step */
  tab: DockTabId;
  /** Friendly page label shown in the tour step badge */
  tabLabel: string;
  /** Optional subtle access badge shown for editor/host-only controls */
  roleTag?: 'Editor Access' | 'Host Control';
  /** Optional interactive action widget rendered inside the tour card */
  interactiveKind?: 'install-app' | 'enable-notifications';
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

const DEFAULT_ACCESS: OnboardingTourAccess = {
  isHost: false,
  canEditCrew: false,
  canEditPlan: false,
  canEditWallet: false,
  canEditPrep: false,
};

/**
 * Builds a role-aware guided spotlight tour covering all 5 pages and
 * dynamically highlighting edit/host controls that match the active user's permissions.
 */
export function buildOnboardingTourSteps(
  access: Partial<OnboardingTourAccess> = DEFAULT_ACCESS,
): OnboardingTourStep[] {
  const isHost = Boolean(access.isHost);
  const canEditCrew = Boolean(access.canEditCrew || isHost);
  const canEditPlan = Boolean(access.canEditPlan || isHost);
  const canEditWallet = Boolean(access.canEditWallet || isHost);
  const canEditPrep = Boolean(access.canEditPrep || isHost);

  const steps: OnboardingTourStep[] = [
    {
      id: 'home-hero',
      tab: 'home',
      tabLabel: 'Home',
      targetSelector: '[data-tour="home-hero"]',
      title: 'Live Countdown & Trip Hub',
      description: canEditCrew
        ? 'Track your departure countdown at a glance. Tap the trip title to switch trips, or use the top-left camera button to update the shared cover photo.'
        : 'Track your departure countdown at a glance. Tap the trip title anytime to switch trips, or scroll down to explore rides & stays.',
      scrollBlock: 'start',
      spotlightPadding: 8,
      spotlightRadius: 24,
    },
    {
      id: 'home-chat',
      tab: 'home',
      tabLabel: 'Chat',
      targetSelector: '[data-tour="home-chat"]',
      title: 'Floating Crew Chat',
      description: isHost
        ? 'Tap this floating glass orb from any page to chat, send stickers, or run polls. As Host, you can also set the Crew Chat wallpaper & new-member history rules inside.'
        : 'Tap this floating glass orb from any page to chat live with your crew, send transparent stickers, reply, or vote in quick polls.',
      scrollBlock: 'nearest',
      spotlightPadding: 10,
      spotlightRadius: 999,
    },
    {
      id: 'home-profile',
      tab: 'home',
      tabLabel: 'Home',
      roleTag: isHost ? 'Host Control' : undefined,
      targetSelector: '[data-tour="home-profile"]',
      title: isHost ? 'Host Controls, Passcode & Settings' : 'Profile, Passcode & Settings',
      description: isHost
        ? 'Open your Host hub here: manage Trip Settings, grant Crew Edit Permissions, check Activity Log, toggle View-Only Mode, set your passcode, or replay this tour.'
        : 'Update your profile photo, lock your account with a 4-digit passcode, turn on phone push alerts, or replay this tour anytime.',
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
      description: canEditCrew
        ? 'Tap Train Pass to view or update departure codes, schedule & train photo — and tap Album to preview the latest crew photo collage.'
        : 'Check your outbound & return train schedule and preview the latest crew photo collage right on Home.',
      scrollBlock: 'center',
      spotlightPadding: 8,
      spotlightRadius: 26,
    },
    {
      id: 'home-crew',
      tab: 'home',
      tabLabel: 'Home',
      roleTag: canEditCrew ? 'Editor Access' : undefined,
      targetSelector: '[data-tour="home-crew"]',
      title: canEditCrew ? 'Manage Rides, Seats & Stays' : 'Rides, Seats & Stays',
      description: canEditCrew
        ? 'You can edit Crew & Stay! Tap the Edit button here to assign motorbike riders, arrange car cabin or train seats, and organize homestay rooms.'
        : 'See motorbike pairings, car cabin seating, train seat assignments, and who shares each homestay room.',
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
        'Jump smoothly between Home, Plan, Wallet, Album, and Prep. Let us step through each page and show your exact tools!',
      requiresDock: true,
      scrollBlock: 'nearest',
      spotlightPadding: 8,
      spotlightRadius: 34,
    },

    // PLAN
    {
      id: 'plan-overview',
      tab: 'plan',
      tabLabel: 'Plan',
      targetSelector: '[data-tour="plan-overview"]',
      title: 'Plan — Trail, Table & Filters',
      description: canEditPlan
        ? 'Browse stops by day on the curved Trail or Table view, filter by Places/Transit/Content, export Excel, and tap any stop card to edit its time, photo, or notes.'
        : 'Browse every stop by day on the curved Trail or Table view, filter by Places, Transit, or Content Ideas, and tap any stop for notes & directions.',
      requiresDock: true,
      scrollBlock: 'start',
      spotlightPadding: 6,
      spotlightRadius: 24,
    },
    {
      id: 'plan-map',
      tab: 'plan',
      tabLabel: 'Plan',
      targetSelector: '[data-tour="plan-map"]',
      title: 'Offline Route Map & Crew Radar',
      description:
        'Tap this map icon anytime to see all stops pinned on an interactive route map, check live crew convoy statuses, or jump straight into Google Maps.',
      requiresDock: true,
      scrollBlock: 'start',
      spotlightPadding: 10,
      spotlightRadius: 999,
    },
  ];

  if (canEditPlan) {
    steps.push({
      id: 'plan-add',
      tab: 'plan',
      tabLabel: 'Plan',
      roleTag: 'Editor Access',
      targetSelector: '[data-tour="plan-add"]',
      title: 'Add New Itinerary Stop',
      description:
        'You have Plan edit access! Tap this floating + button anytime to add a new destination, meal stop, or activity with schedule time, cover photo, and rich notes.',
      requiresDock: true,
      scrollBlock: 'nearest',
      spotlightPadding: 10,
      spotlightRadius: 999,
    });
  }

  // WALLET
  steps.push({
    id: 'wallet-overview',
    tab: 'wallet',
    tabLabel: 'Wallet',
    targetSelector: '[data-tour="wallet-overview"]',
    title: 'Wallet — Shared Funds & Personal Spend',
    description: canEditWallet
      ? 'Switch across Combined, Pool, Fundraise, Spent, and your private Personal tab. You can also create Budget Pockets to allocate funds clearly.'
      : 'Track Combined Balance, Crew Pool, Fundraise goals, and shared expenses in real time — plus switch to Personal to log your own private spending with +.',
    requiresDock: true,
    scrollBlock: 'start',
    spotlightPadding: 8,
    spotlightRadius: 22,
  });

  if (canEditWallet) {
    steps.push({
      id: 'wallet-add',
      tab: 'wallet',
      tabLabel: 'Wallet',
      roleTag: 'Editor Access',
      targetSelector: '[data-tour="wallet-add"]',
      title: 'Record Transactions & Budget Pockets',
      description:
        'You have Wallet edit access! Tap this + button to log Pool deposits, Fundraise income, shared expenses, out-of-pocket reimbursements, or Personal spend.',
      requiresDock: true,
      scrollBlock: 'nearest',
      spotlightPadding: 10,
      spotlightRadius: 999,
    });
  }

  // ALBUM
  steps.push(
    {
      id: 'album-overview',
      tab: 'album',
      tabLabel: 'Album',
      targetSelector: '[data-tour="album-overview"]',
      title: 'Album — Photos & Content Ideas',
      description:
        'Use this switcher to jump between trip Photos and the Ideas board — save Reels, TikTok, or YouTube shot inspiration and even pin them straight into Plan.',
      requiresDock: true,
      scrollBlock: 'start',
      spotlightPadding: 8,
      spotlightRadius: 22,
    },
    {
      id: 'album-gdrive',
      tab: 'album',
      tabLabel: 'Album',
      targetSelector: '[data-tour="album-gdrive"]',
      title: 'Open Shared Google Drive',
      description: isHost
        ? 'Tap this Google Drive icon to open the original full-resolution shared folder directly (or link/update the Drive sync URL in Trip Settings).'
        : 'Tap this Google Drive icon anytime to jump straight into the shared trip Drive folder with all original full-resolution photos.',
      requiresDock: true,
      scrollBlock: 'start',
      spotlightPadding: 10,
      spotlightRadius: 999,
    },
    {
      id: 'album-upload',
      tab: 'album',
      tabLabel: 'Album',
      targetSelector: '[data-tour="album-upload"]',
      title: 'Upload Trip Photos',
      description:
        'Tap Upload to pick photos from your gallery or camera — they sync straight into the shared Google Drive album for the whole crew to view & download.',
      requiresDock: true,
      scrollBlock: 'start',
      spotlightPadding: 8,
      spotlightRadius: 999,
    },
  );

  // PREP
  steps.push(
    {
      id: 'prep-overview',
      tab: 'prep',
      tabLabel: 'Prep',
      roleTag: canEditPrep ? 'Editor Access' : undefined,
      targetSelector: '[data-tour="prep-overview"]',
      title: 'Prep — Personal vs Group',
      description: canEditPrep
        ? 'Personal is strictly private on your phone. Switch to Group to manage shared crew gear — you have edit access to add, check, and assign crew tasks!'
        : 'Personal is strictly private on your phone (never synced). Switch to Group anytime to check shared crew gear and see who is bringing what.',
      requiresDock: true,
      scrollBlock: 'start',
      spotlightPadding: 8,
      spotlightRadius: 24,
    },
    {
      id: 'prep-bags',
      tab: 'prep',
      tabLabel: 'Prep',
      targetSelector: '[data-tour="prep-bags"]',
      title: 'Filter Packing List by Bag',
      description:
        'Filter your private packing list by Backpack, Camera Bag, or Pouch at a glance. Pinned bags stay neatly at the top.',
      requiresDock: true,
      scrollBlock: 'center',
      spotlightPadding: 8,
      spotlightRadius: 24,
    },
    {
      id: 'prep-add',
      tab: 'prep',
      tabLabel: 'Prep',
      targetSelector: '[data-tour="prep-add"]',
      title: 'Tap Edit to Add, Move or Remove',
      description: canEditPrep
        ? 'Prep stays clean and tap-safe by default. Tap Edit whenever you want to add (+), move between bags, rename, or remove Personal & Group items.'
        : 'Prep stays clean and tap-safe by default. Tap Edit whenever you want to add (+), organize bags, move, or remove your personal items.',
      requiresDock: true,
      scrollBlock: 'start',
      spotlightPadding: 8,
      spotlightRadius: 999,
    },

    // SETUP: INSTALL APP & NOTIFICATIONS
    {
      id: 'setup-install',
      tab: 'home',
      tabLabel: 'Install App',
      interactiveKind: 'install-app',
      targetSelector: '',
      title: 'Add GASKEUN! to Home Screen',
      description:
        'Install GASKEUN! like a native app for full-screen speed, offline access on the road, and reliable background phone alerts.',
      requiresDock: false,
      scrollBlock: 'start',
    },
    {
      id: 'setup-notifications',
      tab: 'home',
      tabLabel: 'Alerts',
      interactiveKind: 'enable-notifications',
      targetSelector: '[data-tour="home-profile"]',
      title: 'Turn On Phone Notifications',
      description:
        'Enable alerts right here so new Crew Chat messages, polls, and trip updates reach your phone even when the app is closed. You can also manage alerts anytime inside your Profile menu.',
      requiresDock: false,
      scrollBlock: 'start',
      spotlightPadding: 10,
      spotlightRadius: 999,
    },
  );

  return steps;
}

export const ONBOARDING_TOUR_STEPS: readonly OnboardingTourStep[] =
  buildOnboardingTourSteps(DEFAULT_ACCESS);

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
