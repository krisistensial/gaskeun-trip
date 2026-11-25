import type { ChatMessage, ChatReplyPreview } from '../types/trip';

export const MAX_CHAT_MESSAGES = 150;
export const MAX_CHAT_TEXT_LENGTH = 1000;
export const CHAT_LAST_READ_KEY_PREFIX = 'gaskeun_chat_last_read_v1_';

export const CHAT_QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '🙏', '🔥'] as const;

export interface CrewSticker {
  id: string;
  emoji: string;
  caption: string;
  tone: 'matcha' | 'amber' | 'mint' | 'coral' | 'forest';
}

export const CREW_STICKER_PACK: readonly CrewSticker[] = [
  { id: 'stk-gaskeun', emoji: '🛵', caption: 'GASKEUN!', tone: 'matcha' },
  { id: 'stk-otw', emoji: '💨', caption: 'OTW Guys!', tone: 'mint' },
  { id: 'stk-train', emoji: '🚆', caption: 'On Train!', tone: 'forest' },
  { id: 'stk-wait', emoji: '🏃', caption: 'Wait Me!', tone: 'amber' },
  { id: 'stk-hungry', emoji: '🍜', caption: 'Lapar Nih', tone: 'amber' },
  { id: 'stk-coffee', emoji: '☕', caption: 'Ngopi Yuk', tone: 'forest' },
  { id: 'stk-rain', emoji: '🌧️', caption: 'Rain Alert', tone: 'coral' },
  { id: 'stk-fuel', emoji: '⛽', caption: 'Pit Stop', tone: 'matcha' },
  { id: 'stk-photo', emoji: '📸', caption: 'Foto Dulu!', tone: 'amber' },
  { id: 'stk-sunset', emoji: '🌅', caption: 'Vibes!!', tone: 'amber' },
  { id: 'stk-oke', emoji: '👍', caption: 'Gasss!', tone: 'mint' },
  { id: 'stk-laugh', emoji: '😂', caption: 'Ngakak', tone: 'amber' },
  { id: 'stk-rest', emoji: '🛏️', caption: 'Rebahan', tone: 'matcha' },
  { id: 'stk-care', emoji: '🫶', caption: 'Hati-Hati', tone: 'coral' },
  { id: 'stk-fire', emoji: '🔥', caption: 'Seru Pol!', tone: 'coral' },
  { id: 'stk-arrived', emoji: '🎉', caption: 'Sampai!', tone: 'mint' },
];

export function getStickerById(stickerId?: string): CrewSticker | undefined {
  if (!stickerId) return undefined;
  return CREW_STICKER_PACK.find((s) => s.id === stickerId);
}

export function sanitizeChatText(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return trimmed.length > MAX_CHAT_TEXT_LENGTH
    ? trimmed.slice(0, MAX_CHAT_TEXT_LENGTH).trim()
    : trimmed;
}

export function createTextChatMessage(params: {
  tripCode: string;
  senderId: string;
  senderName: string;
  text: string;
  replyTo?: ChatReplyPreview;
  nowIso?: string;
}): ChatMessage | null {
  const clean = sanitizeChatText(params.text);
  if (!clean) return null;

  return {
    id: `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    tripCode: params.tripCode.trim().toUpperCase(),
    senderId: params.senderId || 'guest',
    senderName: params.senderName.trim() || 'Guest',
    kind: 'text',
    text: clean,
    ...(params.replyTo ? { replyTo: params.replyTo } : {}),
    reactions: {},
    createdAt: params.nowIso ?? new Date().toISOString(),
  };
}

export function createStickerChatMessage(params: {
  tripCode: string;
  senderId: string;
  senderName: string;
  stickerId: string;
  replyTo?: ChatReplyPreview;
  nowIso?: string;
}): ChatMessage | null {
  const sticker = getStickerById(params.stickerId);
  if (!sticker) return null;

  return {
    id: `stk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    tripCode: params.tripCode.trim().toUpperCase(),
    senderId: params.senderId || 'guest',
    senderName: params.senderName.trim() || 'Guest',
    kind: 'sticker',
    text: sticker.caption,
    stickerId: sticker.id,
    ...(params.replyTo ? { replyTo: params.replyTo } : {}),
    reactions: {},
    createdAt: params.nowIso ?? new Date().toISOString(),
  };
}

/**
 * Toggles an emoji reaction from `memberId` on `message` (IG/WA style).
 */
export function toggleMessageReaction(
  message: ChatMessage,
  emoji: string,
  memberId: string,
): ChatMessage {
  if (message.deleted || !memberId) return message;
  const currentMap = message.reactions ?? {};
  const list = Array.isArray(currentMap[emoji]) ? currentMap[emoji] : [];
  const hasReacted = list.includes(memberId);
  const nextList = hasReacted
    ? list.filter((id) => id !== memberId)
    : Array.from(new Set([...list, memberId]));

  const nextReactions: Record<string, string[]> = { ...currentMap };
  if (nextList.length === 0) {
    delete nextReactions[emoji];
  } else {
    nextReactions[emoji] = nextList;
  }

  return {
    ...message,
    reactions: nextReactions,
  };
}

/**
 * Deterministically merges chat messages by ID, sorted oldest -> newest and capped
 * at `MAX_CHAT_MESSAGES` so offline/realtime updates stay crisp and bounded.
 */
export function mergeChatMessages(
  existing: readonly ChatMessage[],
  incoming: readonly ChatMessage[],
): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();

  for (const msg of existing) {
    if (!msg?.id) continue;
    byId.set(msg.id, { ...msg, reactions: msg.reactions ?? {} });
  }

  for (const msg of incoming) {
    if (!msg?.id) continue;
    const prev = byId.get(msg.id);
    if (!prev) {
      byId.set(msg.id, { ...msg, reactions: msg.reactions ?? {} });
      continue;
    }
    byId.set(msg.id, {
      ...prev,
      ...msg,
      deleted: Boolean(prev.deleted || msg.deleted),
      reactions: msg.reactions ?? prev.reactions ?? {},
    });
  }

  const sorted = Array.from(byId.values()).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  return sorted.length > MAX_CHAT_MESSAGES
    ? sorted.slice(sorted.length - MAX_CHAT_MESSAGES)
    : sorted;
}

export function buildReplyPreview(msg: ChatMessage): ChatReplyPreview {
  return {
    id: msg.id,
    senderName: msg.senderName,
    kind: msg.kind,
    text: msg.deleted ? 'Message unsent' : msg.text,
    ...(msg.stickerId ? { stickerId: msg.stickerId } : {}),
  };
}

export function countTotalReactions(reactions: Record<string, string[]>): Array<{
  emoji: string;
  memberIds: string[];
}> {
  return Object.entries(reactions ?? {})
    .filter(([, ids]) => Array.isArray(ids) && ids.length > 0)
    .map(([emoji, memberIds]) => ({ emoji, memberIds }));
}

export function getChatLastReadStorageKey(tripCode: string, memberId: string): string {
  return `${CHAT_LAST_READ_KEY_PREFIX}${tripCode.trim().toUpperCase()}_${memberId || 'guest'}`;
}

export function loadChatLastRead(tripCode: string, memberId: string): string {
  try {
    if (typeof localStorage === 'undefined') return '';
    return localStorage.getItem(getChatLastReadStorageKey(tripCode, memberId)) ?? '';
  } catch {
    return '';
  }
}

export function saveChatLastRead(tripCode: string, memberId: string, iso: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(getChatLastReadStorageKey(tripCode, memberId), iso);
  } catch {
    // ignore storage quota errors
  }
}

export function countUnreadMessages(
  messages: readonly ChatMessage[],
  lastReadIso: string,
  activeMemberId: string | null,
): number {
  const lastMs = lastReadIso ? Date.parse(lastReadIso) : 0;
  let unread = 0;
  for (const msg of messages) {
    if (msg.deleted) continue;
    if (activeMemberId && msg.senderId === activeMemberId) continue;
    const msgMs = Date.parse(msg.createdAt);
    if (!Number.isFinite(msgMs)) continue;
    if (!lastReadIso || msgMs > lastMs) {
      unread += 1;
    }
  }
  return unread;
}

export function formatChatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function getChatDateKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatChatDayDivider(iso: string, nowDate = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';

  const key = getChatDateKey(iso);
  const todayKey = getChatDateKey(nowDate.toISOString());
  if (key === todayKey) return 'Today';

  const yesterday = new Date(nowDate);
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === getChatDateKey(yesterday.toISOString())) return 'Yesterday';

  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Determines whether two adjacent messages belong in the same visual sender cluster
 * (same day, same sender, non-deleted, and within 2 minutes).
 */
export function isGroupedWithPrevious(prev: ChatMessage | undefined, curr: ChatMessage): boolean {
  if (!prev || prev.deleted || curr.deleted) return false;
  if (prev.senderId !== curr.senderId) return false;
  if (getChatDateKey(prev.createdAt) !== getChatDateKey(curr.createdAt)) return false;
  const prevMs = Date.parse(prev.createdAt);
  const currMs = Date.parse(curr.createdAt);
  if (!Number.isFinite(prevMs) || !Number.isFinite(currMs)) return false;
  return currMs - prevMs <= 2 * 60 * 1000;
}
