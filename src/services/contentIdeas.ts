import type {
  ContentIdea,
  ContentPlatform,
  PlanItem,
  PlanItemType,
} from '../types/trip';

export type PlanFilterOption = 'all' | PlanItemType | 'content';

export type PlanTimelineEntry =
  | { kind: 'stop'; id: string; sortKey: string; stop: PlanItem }
  | { kind: 'idea'; id: string; sortKey: string; idea: ContentIdea };

/**
 * Normalizes a pasted reference URL to always have an https:// scheme when non-empty.
 */
export function normalizeReferenceUrl(raw?: string | null): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * Automatically detects the social platform from a reference URL and returns
 * both the detected platform and normalized URL.
 */
export function detectContentPlatform(rawUrl: string): {
  platform: ContentPlatform;
  normalizedUrl: string;
} {
  const normalizedUrl = normalizeReferenceUrl(rawUrl);
  if (!normalizedUrl) {
    return { platform: 'web', normalizedUrl: '' };
  }

  let host = '';
  try {
    host = new URL(normalizedUrl).hostname.toLowerCase();
  } catch {
    host = normalizedUrl.toLowerCase();
  }

  if (host.includes('instagram.com') || host.includes('instagr.am')) {
    return { platform: 'instagram', normalizedUrl };
  }
  if (host.includes('tiktok.com')) {
    return { platform: 'tiktok', normalizedUrl };
  }
  if (
    host.includes('youtube.com') ||
    host.includes('youtu.be') ||
    host.includes('youtube-nocookie.com')
  ) {
    return { platform: 'youtube', normalizedUrl };
  }
  if (host.includes('pinterest.') || host.includes('pin.it')) {
    return { platform: 'pinterest', normalizedUrl };
  }
  return { platform: 'web', normalizedUrl };
}

/**
 * Extracts a direct high-quality thumbnail URL when the reference link is
 * a YouTube video or YouTube Short. Returns undefined for other platforms.
 */
export function extractAutoThumbnail(rawUrl?: string | null): string | undefined {
  const normalized = normalizeReferenceUrl(rawUrl);
  if (!normalized) return undefined;

  let videoId = '';
  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase();
    if (host.includes('youtu.be')) {
      videoId = parsed.pathname.replace(/^\/+/, '').split('/')[0] ?? '';
    } else if (host.includes('youtube.com') || host.includes('youtube-nocookie.com')) {
      if (parsed.pathname.startsWith('/shorts/')) {
        videoId = parsed.pathname.split('/')[2] ?? '';
      } else if (parsed.pathname.startsWith('/embed/')) {
        videoId = parsed.pathname.split('/')[2] ?? '';
      } else {
        videoId = parsed.searchParams.get('v') ?? '';
      }
    }
  } catch {
    return undefined;
  }

  if (/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  }
  return undefined;
}

/**
 * Formats a clean 100% English badge label for a ContentPlatform.
 */
export function formatPlatformLabel(platform: ContentPlatform, url?: string): string {
  if (platform === 'instagram') {
    if (url && /\/reels?\//i.test(url)) return 'IG Reels';
    return 'Instagram';
  }
  if (platform === 'tiktok') return 'TikTok';
  if (platform === 'youtube') {
    if (url && /\/shorts\//i.test(url)) return 'YT Shorts';
    return 'YouTube';
  }
  if (platform === 'pinterest') return 'Pinterest';
  return 'Link';
}

/**
 * Returns true if the active member can edit or delete a specific ContentIdea:
 * - Creating a new idea is open to all crew.
 * - Editing/deleting an existing idea is allowed for its creator or any trip Editor/Host.
 */
export function canManageContentIdea(
  idea: ContentIdea | null,
  activeMemberId: string | null,
  canEditTripFlag: boolean,
): boolean {
  if (!idea) return true;
  if (canEditTripFlag) return true;
  if (!activeMemberId || activeMemberId === 'guest') return false;
  return idea.createdBy === activeMemberId;
}

function toSortTimeKey(hhmm?: string): string {
  const clean = String(hhmm ?? '').trim();
  const match = clean.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '99:99';
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return '99:99';
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Merges a day's normal itinerary stops with any ContentIdeas scheduled for that day
 * (`showInPlan === true && dayId === targetDayId`) in strict chronological order.
 * Ideas without a set time appear neatly at the end of the day.
 */
export function mergePlanEntries(
  stops: PlanItem[],
  ideas: ContentIdea[] | undefined,
  targetDayId: string | undefined,
  filter: PlanFilterOption = 'all',
): PlanTimelineEntry[] {
  if (!targetDayId) return [];

  const entries: PlanTimelineEntry[] = [];

  if (filter !== 'content') {
    for (const stop of stops) {
      if (stop.dayId !== targetDayId) continue;
      if (filter !== 'all' && stop.type !== filter) continue;
      entries.push({
        kind: 'stop',
        id: stop.id,
        sortKey: toSortTimeKey(stop.startTime),
        stop,
      });
    }
  }

  if (filter === 'all' || filter === 'content') {
    for (const idea of ideas ?? []) {
      if (!idea.showInPlan || idea.dayId !== targetDayId) continue;
      entries.push({
        kind: 'idea',
        id: idea.id,
        sortKey: toSortTimeKey(idea.time),
        idea,
      });
    }
  }

  entries.sort((a, b) => {
    const timeCmp = a.sortKey.localeCompare(b.sortKey);
    if (timeCmp !== 0) return timeCmp;
    if (a.kind !== b.kind) return a.kind === 'stop' ? -1 : 1;
    const titleA = a.kind === 'stop' ? a.stop.title : a.idea.title;
    const titleB = b.kind === 'stop' ? b.stop.title : b.idea.title;
    return titleA.localeCompare(titleB);
  });

  return entries;
}
