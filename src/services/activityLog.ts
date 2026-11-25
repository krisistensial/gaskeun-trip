import type {
  EditLogCategory,
  EditLogEntry,
  OnlinePresenceUser,
  SharedTrip,
  TripMember,
} from '../types/trip';

export const MAX_EDIT_LOG_ENTRIES = 80;
export const MAX_VISIBLE_PRESENCE_AVATARS = 3;

export interface PresenceTrackPayload {
  memberId: string;
  name: string;
  initials: string;
  avatarBg?: string;
  avatarColor?: string;
  isGuest?: boolean;
  joinedAt: string;
}

/**
 * Infers which section of the trip was modified by comparing previous and next Layer-1 snapshots,
 * falling back to lightweight keyword inspection on the action summary.
 */
export function inferEditLogCategory(
  prev: SharedTrip,
  next: SharedTrip,
  summary = '',
): EditLogCategory {
  if (prev.itinerary !== next.itinerary || prev.days !== next.days) return 'plan';
  if (prev.transactions !== next.transactions || prev.financeConfig !== next.financeConfig) {
    return 'wallet';
  }
  if (prev.groupPrep !== next.groupPrep) return 'prep';
  if (prev.contentIdeas !== next.contentIdeas) return 'album';
  if (
    prev.transportPods !== next.transportPods ||
    prev.stays !== next.stays ||
    prev.trainPass !== next.trainPass
  ) {
    return 'crew';
  }
  if (
    prev.title !== next.title ||
    prev.subtitle !== next.subtitle ||
    prev.departureAt !== next.departureAt ||
    prev.coverPhotoUrl !== next.coverPhotoUrl ||
    prev.heroCoverUrl !== next.heroCoverUrl ||
    prev.crewEditPin !== next.crewEditPin ||
    prev.editorMemberIds !== next.editorMemberIds ||
    prev.gdriveScriptUrl !== next.gdriveScriptUrl ||
    prev.gdriveFolderUrl !== next.gdriveFolderUrl
  ) {
    return 'settings';
  }
  if (prev.members !== next.members) return 'crew';

  const low = summary.toLowerCase();
  if (low.includes('stop') || low.includes('day') || low.includes('itinerary')) return 'plan';
  if (low.includes('transaction') || low.includes('pool') || low.includes('settled')) {
    return 'wallet';
  }
  if (low.includes('prep') || low.includes('checked') || low.includes('checklist')) return 'prep';
  if (low.includes('idea') || low.includes('photo')) return 'album';
  if (low.includes('pin') || low.includes('editor') || low.includes('setting') || low.includes('cover')) {
    return 'settings';
  }
  if (low.includes('crew') || low.includes('seat') || low.includes('swap') || low.includes('stay')) {
    return 'crew';
  }
  return 'general';
}

export function buildEditLogSummary(
  prev: SharedTrip,
  next: SharedTrip,
  toastMsg?: string,
): string {
  const clean = toastMsg?.trim();
  if (clean) return clean;

  if (prev.itinerary !== next.itinerary) return 'Updated itinerary stop details';
  if (prev.days !== next.days) return 'Updated trip days';
  if (prev.groupPrep !== next.groupPrep) return 'Updated shared group checklist';
  if (prev.transactions !== next.transactions) return 'Updated shared wallet';
  if (prev.transportPods !== next.transportPods) return 'Updated transport seating';
  if (prev.stays !== next.stays) return 'Updated homestay details';
  if (prev.contentIdeas !== next.contentIdeas) return 'Updated content ideas';
  if (prev.members !== next.members) return 'Updated crew profile';
  if (prev.coverPhotoUrl !== next.coverPhotoUrl) return 'Updated shared cover photo';
  return 'Updated shared trip';
}

/**
 * Prepends a new edit audit entry onto `SharedTrip.editLog` (capped at `MAX_EDIT_LOG_ENTRIES`).
 */
export function appendEditLog(
  prev: SharedTrip,
  next: SharedTrip,
  actor: { id: string; name: string },
  toastMsg?: string,
  nowIso = new Date().toISOString(),
): EditLogEntry[] {
  const existing = Array.isArray(prev.editLog) ? prev.editLog : [];
  const action = buildEditLogSummary(prev, next, toastMsg);
  const category = inferEditLogCategory(prev, next, action);
  const entry: EditLogEntry = {
    id: `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    actorId: actor.id || 'guest',
    actorName: actor.name?.trim() || 'Guest',
    action,
    category,
    timestamp: nowIso,
  };
  return [entry, ...existing].slice(0, MAX_EDIT_LOG_ENTRIES);
}

export function formatEditLogCategoryLabel(category: EditLogCategory): string {
  switch (category) {
    case 'plan':
      return 'Plan';
    case 'wallet':
      return 'Wallet';
    case 'crew':
      return 'Crew';
    case 'prep':
      return 'Prep';
    case 'album':
      return 'Album';
    case 'settings':
      return 'Settings';
    default:
      return 'Trip';
  }
}

export function formatRelativeLogTime(iso: string, nowMs = Date.now()): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const diffSec = Math.max(0, Math.floor((nowMs - ms) / 1000));
  if (diffSec < 45) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;

  const d = new Date(ms);
  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${dateStr} · ${timeStr}`;
}

/**
 * Extracts deduplicated online crew members from a Supabase Realtime `presenceState()` snapshot.
 * Enriches each member with fresh avatar/name from `tripMembers`.
 */
export function extractOnlineMembers(
  presenceState: Record<string, Array<Partial<PresenceTrackPayload>>>,
  tripMembers: TripMember[],
): OnlinePresenceUser[] {
  const memberById = new Map(tripMembers.map((m) => [m.id, m]));
  const byId = new Map<string, OnlinePresenceUser>();

  for (const metas of Object.values(presenceState)) {
    if (!Array.isArray(metas)) continue;
    for (const meta of metas) {
      const memberId = typeof meta?.memberId === 'string' ? meta.memberId.trim() : '';
      if (!memberId) continue;

      const joinedAt =
        typeof meta.joinedAt === 'string' && meta.joinedAt
          ? meta.joinedAt
          : new Date(0).toISOString();

      const existing = byId.get(memberId);
      if (existing && existing.joinedAt <= joinedAt) {
        continue;
      }

      const member = memberById.get(memberId);
      if (member) {
        byId.set(memberId, {
          memberId: member.id,
          name: member.name,
          initials: member.initials,
          avatarDataUrl: member.avatarDataUrl,
          avatarBg: member.avatarBg,
          avatarColor: member.avatarColor,
          isGuest: false,
          joinedAt,
        });
      } else {
        const cleanName = (typeof meta.name === 'string' && meta.name.trim()) || 'Guest';
        const cleanInitials =
          (typeof meta.initials === 'string' && meta.initials.trim()) ||
          cleanName.slice(0, 1).toUpperCase();
        byId.set(memberId, {
          memberId,
          name: cleanName,
          initials: cleanInitials,
          avatarBg: meta.avatarBg || '#EAEFED',
          avatarColor: meta.avatarColor || '#546860',
          isGuest: Boolean(meta.isGuest || memberId === 'guest'),
          joinedAt,
        });
      }
    }
  }

  return Array.from(byId.values()).sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
}

/**
 * Returns other currently online members (excluding the current user) and slices
 * at most 3 overlapping avatars for the compact Home Hero presence stack.
 */
export function getVisibleOtherOnlineMembers(
  allOnline: OnlinePresenceUser[],
  activeMemberId: string | null,
): {
  others: OnlinePresenceUser[];
  visibleStack: OnlinePresenceUser[];
  overflowCount: number;
} {
  const others = allOnline.filter((u) => !activeMemberId || u.memberId !== activeMemberId);
  const visibleStack = others.slice(0, MAX_VISIBLE_PRESENCE_AVATARS);
  const overflowCount = Math.max(0, others.length - visibleStack.length);
  return { others, visibleStack, overflowCount };
}
