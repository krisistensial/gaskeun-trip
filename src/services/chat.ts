import type {
  ChatMessage,
  ChatPoll,
  ChatReadReceipt,
  ChatReplyPreview,
  TripMember,
} from '../types/trip';

export const MAX_CHAT_MESSAGES = 150;
export const MAX_CHAT_POLLS = 30;
export const MAX_POLL_OPTIONS = 6;
export const MAX_CHAT_TEXT_LENGTH = 1000;
export const CHAT_LAST_READ_KEY_PREFIX = 'gaskeun_chat_last_read_v1_';

export const CHAT_QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '🙏', '🔥'] as const;

export interface EmojiCategory {
  id: string;
  label: string;
  emojis: readonly string[];
}

export const CHAT_EMOJI_CATEGORIES: readonly EmojiCategory[] = [
  {
    id: 'faces',
    label: 'Faces',
    emojis: [
      '😀', '😂', '🥹', '😍', '🥰', '😎', '🤩', '🥳',
      '😅', '😉', '😌', '🤔', '😮', '😭', '😤', '🤯',
      '😴', '🤪', '🙃', '😬', '🫠', '🫡', '🤭', '🤗',
    ],
  },
  {
    id: 'hands',
    label: 'Hands & Hearts',
    emojis: [
      '👍', '👎', '👏', '🙌', '🙏', '🤝', '💪', '✌️',
      '🫶', '👋', '👌', '🤙', '❤️', '🧡', '💚', '🤍',
      '🔥', '✨', '💯', '🎉', '⭐', '💫', '⚡', '👀',
    ],
  },
  {
    id: 'trip',
    label: 'Trip & Food',
    emojis: [
      '🛵', '🚗', '🚆', '✈️', '⛽', '🗺️', '📍', '🏕️',
      '🏨', '🛏️', '📸', '🌅', '🌧️', '☀️', '🌊', '⛰️',
      '🍜', '🍕', '🍔', '☕', '🧋', '🍦', '🥤', '🍻',
    ],
  },
];

export interface CrewSticker {
  id: string;
  emoji: string;
  caption: string;
  url: string;
  fallbackUrl: string;
  tags: readonly string[];
  tone: 'matcha' | 'amber' | 'mint' | 'coral' | 'forest';
}

const noto = (cp: string) =>
  `https://fonts.gstatic.com/s/e/notoemoji/latest/${cp}/512.webp`;
const twemoji = (cp: string) =>
  `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${cp}.png`;

export const CREW_STICKER_PACK: readonly CrewSticker[] = [
  // Core 16 Crew Trip Stickers (100% transparent WebP/PNG cutouts)
  {
    id: 'stk-gaskeun',
    emoji: '🛵',
    caption: 'GASKEUN!',
    url: twemoji('1f6f5'),
    fallbackUrl: twemoji('1f6f5'),
    tags: ['motor', 'scooter', 'bike', 'gaskeun', 'go', 'ride'],
    tone: 'matcha',
  },
  {
    id: 'stk-otw',
    emoji: '💨',
    caption: 'OTW Guys!',
    url: twemoji('1f4a8'),
    fallbackUrl: twemoji('1f4a8'),
    tags: ['otw', 'dash', 'fast', 'omw', 'jalan'],
    tone: 'mint',
  },
  {
    id: 'stk-train',
    emoji: '🚆',
    caption: 'On Train!',
    url: twemoji('1f686'),
    fallbackUrl: twemoji('1f686'),
    tags: ['train', 'kereta', 'kai', 'stasiun'],
    tone: 'forest',
  },
  {
    id: 'stk-wait',
    emoji: '🏃',
    caption: 'Wait Me!',
    url: twemoji('1f3c3'),
    fallbackUrl: twemoji('1f3c3'),
    tags: ['wait', 'tunggu', 'run', 'lari'],
    tone: 'amber',
  },
  {
    id: 'stk-hungry',
    emoji: '🍜',
    caption: 'Lapar Nih',
    url: noto('1f35c'),
    fallbackUrl: twemoji('1f35c'),
    tags: ['food', 'makan', 'lapar', 'mie', 'noodle', 'hungry'],
    tone: 'amber',
  },
  {
    id: 'stk-coffee',
    emoji: '☕',
    caption: 'Ngopi Yuk',
    url: noto('2615'),
    fallbackUrl: twemoji('2615'),
    tags: ['coffee', 'kopi', 'ngopi', 'cafe', 'drink'],
    tone: 'forest',
  },
  {
    id: 'stk-rain',
    emoji: '🌧️',
    caption: 'Rain Alert',
    url: noto('1f327_fe0f'),
    fallbackUrl: twemoji('1f327'),
    tags: ['rain', 'hujan', 'cuaca', 'jas hujan'],
    tone: 'coral',
  },
  {
    id: 'stk-fuel',
    emoji: '⛽',
    caption: 'Pit Stop',
    url: noto('26fd'),
    fallbackUrl: twemoji('26fd'),
    tags: ['fuel', 'bensin', 'spbu', 'pit stop'],
    tone: 'matcha',
  },
  {
    id: 'stk-photo',
    emoji: '📸',
    caption: 'Foto Dulu!',
    url: noto('1f4f8'),
    fallbackUrl: twemoji('1f4f8'),
    tags: ['photo', 'foto', 'camera', 'selfie'],
    tone: 'amber',
  },
  {
    id: 'stk-sunset',
    emoji: '🌅',
    caption: 'Vibes!!',
    url: noto('1f305'),
    fallbackUrl: twemoji('1f305'),
    tags: ['sunset', 'sunrise', 'vibes', 'view'],
    tone: 'amber',
  },
  {
    id: 'stk-oke',
    emoji: '👍',
    caption: 'Gasss!',
    url: noto('1f44d'),
    fallbackUrl: twemoji('1f44d'),
    tags: ['ok', 'oke', 'sip', 'gas', 'good', 'thumbs'],
    tone: 'mint',
  },
  {
    id: 'stk-laugh',
    emoji: '😂',
    caption: 'Ngakak',
    url: noto('1f602'),
    fallbackUrl: twemoji('1f602'),
    tags: ['laugh', 'haha', 'wkwk', 'ngakak', 'funny'],
    tone: 'amber',
  },
  {
    id: 'stk-rest',
    emoji: '🛏️',
    caption: 'Rebahan',
    url: twemoji('1f6cf'),
    fallbackUrl: twemoji('1f6cf'),
    tags: ['sleep', 'rest', 'tidur', 'rebahan', 'stay', 'hotel'],
    tone: 'matcha',
  },
  {
    id: 'stk-care',
    emoji: '🫶',
    caption: 'Hati-Hati',
    url: noto('1faf6'),
    fallbackUrl: twemoji('1faf6'),
    tags: ['love', 'heart', 'care', 'safe', 'hati-hati'],
    tone: 'coral',
  },
  {
    id: 'stk-fire',
    emoji: '🔥',
    caption: 'Seru Pol!',
    url: noto('1f525'),
    fallbackUrl: twemoji('1f525'),
    tags: ['fire', 'lit', 'seru', 'keren', 'hot'],
    tone: 'coral',
  },
  {
    id: 'stk-arrived',
    emoji: '🎉',
    caption: 'Sampai!',
    url: noto('1f389'),
    fallbackUrl: twemoji('1f389'),
    tags: ['party', 'arrived', 'sampai', 'yay', 'hore'],
    tone: 'mint',
  },

  // Extra Expressive Animated Transparent WebP Stickers
  {
    id: 'stk-love',
    emoji: '❤️',
    caption: 'Love',
    url: noto('2764_fe0f'),
    fallbackUrl: twemoji('2764'),
    tags: ['love', 'heart', 'sayang', 'red'],
    tone: 'coral',
  },
  {
    id: 'stk-heart-eyes',
    emoji: '😍',
    caption: 'Kece Banget',
    url: noto('1f60d'),
    fallbackUrl: twemoji('1f60d'),
    tags: ['love', 'wow', 'kece', 'cantik', 'keren'],
    tone: 'coral',
  },
  {
    id: 'stk-party-face',
    emoji: '🥳',
    caption: 'Gas Liburan',
    url: noto('1f973'),
    fallbackUrl: twemoji('1f973'),
    tags: ['party', 'holiday', 'liburan', 'happy'],
    tone: 'amber',
  },
  {
    id: 'stk-starstruck',
    emoji: '🤩',
    caption: 'Mantap!',
    url: noto('1f929'),
    fallbackUrl: twemoji('1f929'),
    tags: ['star', 'mantap', 'amazing', 'wow'],
    tone: 'amber',
  },
  {
    id: 'stk-cool',
    emoji: '😎',
    caption: 'Santai',
    url: noto('1f60e'),
    fallbackUrl: twemoji('1f60e'),
    tags: ['cool', 'santai', 'chill', 'sunglasses'],
    tone: 'matcha',
  },
  {
    id: 'stk-rofl',
    emoji: '🤣',
    caption: 'WKWKWK',
    url: noto('1f923'),
    fallbackUrl: twemoji('1f923'),
    tags: ['rofl', 'wkwk', 'laugh', 'ngakak', 'lol'],
    tone: 'amber',
  },
  {
    id: 'stk-cry',
    emoji: '😭',
    caption: 'Yaah',
    url: noto('1f62d'),
    fallbackUrl: twemoji('1f62d'),
    tags: ['cry', 'sad', 'nangis', 'yah'],
    tone: 'mint',
  },
  {
    id: 'stk-mindblown',
    emoji: '🤯',
    caption: 'Gila Sih',
    url: noto('1f92f'),
    fallbackUrl: twemoji('1f92f'),
    tags: ['mindblown', 'gila', 'kaget', 'shock'],
    tone: 'coral',
  },
  {
    id: 'stk-pray',
    emoji: '🙏',
    caption: 'Makasih!',
    url: noto('1f64f'),
    fallbackUrl: twemoji('1f64f'),
    tags: ['pray', 'thanks', 'makasih', 'please', 'tolong'],
    tone: 'matcha',
  },
  {
    id: 'stk-clap',
    emoji: '👏',
    caption: 'Keren!',
    url: noto('1f44f'),
    fallbackUrl: twemoji('1f44f'),
    tags: ['clap', 'tepuk tangan', 'bravo', 'keren'],
    tone: 'mint',
  },
  {
    id: 'stk-hug',
    emoji: '🤗',
    caption: 'Peluk',
    url: noto('1f917'),
    fallbackUrl: twemoji('1f917'),
    tags: ['hug', 'warm', 'peluk', 'friendly'],
    tone: 'amber',
  },
  {
    id: 'stk-wave',
    emoji: '👋',
    caption: 'Halo!',
    url: noto('1f44b'),
    fallbackUrl: twemoji('1f44b'),
    tags: ['hi', 'halo', 'hello', 'bye', 'wave'],
    tone: 'mint',
  },
  {
    id: 'stk-100',
    emoji: '💯',
    caption: '100% Gas',
    url: noto('1f4af'),
    fallbackUrl: twemoji('1f4af'),
    tags: ['100', 'setuju', 'agree', 'perfect'],
    tone: 'coral',
  },
  {
    id: 'stk-sparkles',
    emoji: '✨',
    caption: 'Estetik',
    url: noto('2728'),
    fallbackUrl: twemoji('2728'),
    tags: ['sparkles', 'aesthetic', 'estetik', 'clean'],
    tone: 'amber',
  },
  {
    id: 'stk-car',
    emoji: '🚗',
    caption: 'Di Mobil',
    url: noto('1f697'),
    fallbackUrl: twemoji('1f697'),
    tags: ['car', 'mobil', 'drive', 'roadtrip'],
    tone: 'matcha',
  },
  {
    id: 'stk-boba',
    emoji: '🧋',
    caption: 'Boba Time',
    url: noto('1f9cb'),
    fallbackUrl: twemoji('1f9cb'),
    tags: ['boba', 'minum', 'drink', 'haus', 'sweet'],
    tone: 'amber',
  },
  {
    id: 'stk-pizza',
    emoji: '🍕',
    caption: 'Makan Yuk',
    url: noto('1f355'),
    fallbackUrl: twemoji('1f355'),
    tags: ['pizza', 'makan', 'snack', 'dinner'],
    tone: 'amber',
  },
  {
    id: 'stk-cheers',
    emoji: '🍻',
    caption: 'Cheers!',
    url: noto('1f37b'),
    fallbackUrl: twemoji('1f37b'),
    tags: ['cheers', 'toast', 'nongkrong'],
    tone: 'amber',
  },
  {
    id: 'stk-sleep',
    emoji: '😴',
    caption: 'Ngantuk',
    url: noto('1f634'),
    fallbackUrl: twemoji('1f634'),
    tags: ['sleepy', 'ngantuk', 'zzz', 'tired'],
    tone: 'forest',
  },
  {
    id: 'stk-eyes',
    emoji: '👀',
    caption: 'Spill?',
    url: noto('1f440'),
    fallbackUrl: twemoji('1f440'),
    tags: ['eyes', 'spill', 'lihat', 'intip'],
    tone: 'matcha',
  },
];

export function getStickerById(stickerId?: string): CrewSticker | undefined {
  if (!stickerId) return undefined;
  return CREW_STICKER_PACK.find((s) => s.id === stickerId);
}

export function searchBuiltInStickers(query: string): CrewSticker[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...CREW_STICKER_PACK];
  return CREW_STICKER_PACK.filter(
    (s) =>
      s.caption.toLowerCase().includes(q) ||
      s.emoji.includes(q) ||
      s.tags.some((tag) => tag.includes(q)),
  );
}

export function isSafeStickerUrl(url?: string): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (trimmed.startsWith('https://')) return true;
  if (trimmed.startsWith('data:image/webp;base64,')) return true;
  if (trimmed.startsWith('data:image/png;base64,')) return true;
  if (trimmed.startsWith('data:image/gif;base64,')) return true;
  return false;
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
  stickerId?: string;
  stickerUrl?: string;
  stickerCaption?: string;
  replyTo?: ChatReplyPreview;
  nowIso?: string;
}): ChatMessage | null {
  const builtIn = getStickerById(params.stickerId);
  const customUrl = isSafeStickerUrl(params.stickerUrl)
    ? params.stickerUrl?.trim()
    : undefined;

  if (!builtIn && !customUrl) return null;

  const stickerId = builtIn ? builtIn.id : params.stickerId || 'stk-custom';
  const stickerUrl = customUrl ?? builtIn?.url;
  const caption =
    (params.stickerCaption?.trim() || builtIn?.caption || 'Sticker').slice(0, 80);

  return {
    id: `stk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    tripCode: params.tripCode.trim().toUpperCase(),
    senderId: params.senderId || 'guest',
    senderName: params.senderName.trim() || 'Guest',
    kind: 'sticker',
    text: caption,
    stickerId,
    ...(stickerUrl ? { stickerUrl } : {}),
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
    ...(msg.stickerUrl ? { stickerUrl: msg.stickerUrl } : {}),
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

/**
 * Merges read receipts per memberId, always keeping the newest `lastReadAt` timestamp.
 */
export function mergeChatReadReceipts(
  existing: Record<string, ChatReadReceipt> | undefined,
  incoming: Record<string, ChatReadReceipt> | undefined,
): Record<string, ChatReadReceipt> {
  const next: Record<string, ChatReadReceipt> = { ...(existing ?? {}) };
  for (const [memberId, rec] of Object.entries(incoming ?? {})) {
    if (!rec?.lastReadAt) continue;
    const prev = next[memberId];
    if (!prev || Date.parse(rec.lastReadAt) > Date.parse(prev.lastReadAt)) {
      next[memberId] = rec;
    }
  }
  return next;
}

export interface MessageSeenMemberInfo {
  member: TripMember;
  seenAt: string;
}

/**
 * Returns all crew members (excluding active viewer & message sender) who have read
 * up through `message.createdAt`, sorted most-recent-reader first.
 */
export function getMessageSeenByMembers(
  message: ChatMessage,
  readReceipts: Record<string, ChatReadReceipt> | undefined,
  members: readonly TripMember[],
  activeMemberId: string | null,
): MessageSeenMemberInfo[] {
  if (!readReceipts || message.deleted) return [];
  const msgMs = Date.parse(message.createdAt);
  if (!Number.isFinite(msgMs)) return [];

  const list: MessageSeenMemberInfo[] = [];
  for (const member of members) {
    if (activeMemberId && member.id === activeMemberId) continue;
    if (member.id === message.senderId) continue;
    const receipt = readReceipts[member.id];
    if (!receipt?.lastReadAt) continue;
    const readMs = Date.parse(receipt.lastReadAt);
    if (Number.isFinite(readMs) && readMs >= msgMs) {
      list.push({ member, seenAt: receipt.lastReadAt });
    }
  }

  return list.sort((a, b) => b.seenAt.localeCompare(a.seenAt));
}

/**
 * Maps each messageId -> list of members whose *latest* seen non-deleted message is that ID
 * (IG/Messenger-style clean inline `Seen by` avatar anchor).
 */
export function computeLatestSeenAnchors(
  messages: readonly ChatMessage[],
  readReceipts: Record<string, ChatReadReceipt> | undefined,
  members: readonly TripMember[],
  activeMemberId: string | null,
): Record<string, MessageSeenMemberInfo[]> {
  const anchors: Record<string, MessageSeenMemberInfo[]> = {};
  if (!readReceipts || messages.length === 0) return anchors;

  for (const member of members) {
    if (activeMemberId && member.id === activeMemberId) continue;
    const receipt = readReceipts[member.id];
    if (!receipt?.lastReadAt) continue;
    const readMs = Date.parse(receipt.lastReadAt);
    if (!Number.isFinite(readMs)) continue;

    let latestMsgId: string | null = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.deleted) continue;
      if (m.senderId === member.id) continue;
      const mMs = Date.parse(m.createdAt);
      if (Number.isFinite(mMs) && readMs >= mMs) {
        latestMsgId = m.id;
        break;
      }
    }

    if (latestMsgId) {
      if (!anchors[latestMsgId]) anchors[latestMsgId] = [];
      anchors[latestMsgId].push({ member, seenAt: receipt.lastReadAt });
    }
  }

  return anchors;
}

/* ==========================================================================
   @Mentions, Quick Polls, Chronological Timeline & Search Helpers
   ========================================================================== */

export interface ActiveMentionQuery {
  query: string;
  startIndex: number;
}

/**
 * Detects an active `@query` mention token immediately before `cursorIndex` in the composer.
 */
export function getActiveMentionQuery(
  text: string,
  cursorIndex: number,
): ActiveMentionQuery | null {
  const safeCursor = Math.max(0, Math.min(text.length, cursorIndex));
  const before = text.slice(0, safeCursor);
  const match = before.match(/(?:^|\s)@([A-Za-z0-9_.-]{0,24})$/);
  if (!match) return null;
  const startIndex = before.lastIndexOf('@');
  if (startIndex < 0) return null;
  return {
    query: match[1].toLowerCase(),
    startIndex,
  };
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildMentionRegex(members: readonly TripMember[]): RegExp | null {
  const names = members
    .map((m) => m.name.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const tokens = ['everyone', 'all', ...names.map(escapeRegExp)];
  if (tokens.length === 0) return null;
  return new RegExp(`(@(?:${tokens.join('|')}))(?=$|[\\s.,!?:;])`, 'gi');
}

export interface MentionSegment {
  text: string;
  memberId?: string;
  isEveryone?: boolean;
}

/**
 * Splits a message string into plain text and highlighted `@Member` / `@all` segments.
 */
export function splitTextWithMentions(
  text: string,
  members: readonly TripMember[],
): MentionSegment[] {
  if (!text || !text.includes('@')) return [{ text }];
  const re = buildMentionRegex(members);
  if (!re) return [{ text }];

  const memberByLowerName = new Map<string, TripMember>();
  for (const m of members) {
    memberByLowerName.set(m.name.trim().toLowerCase(), m);
  }

  const segments: MentionSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index) });
    }
    const rawToken = match[1];
    const cleanName = rawToken.slice(1).toLowerCase();
    if (cleanName === 'all' || cleanName === 'everyone') {
      segments.push({ text: rawToken, isEveryone: true });
    } else {
      const m = memberByLowerName.get(cleanName);
      segments.push(m ? { text: rawToken, memberId: m.id } : { text: rawToken });
    }
    lastIndex = match.index + rawToken.length;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex) });
  }
  return segments.length > 0 ? segments : [{ text }];
}

/**
 * Returns unique member IDs referenced via `@Name` or `@all`/`@everyone`.
 */
export function extractMentionedMemberIds(
  text: string,
  members: readonly TripMember[],
): string[] {
  const segments = splitTextWithMentions(text, members);
  const ids = new Set<string>();
  for (const seg of segments) {
    if (seg.isEveryone) {
      for (const m of members) ids.add(m.id);
    } else if (seg.memberId) {
      ids.add(seg.memberId);
    }
  }
  return Array.from(ids);
}

/**
 * Creates a validated Quick Poll object for Crew Chat.
 * Requires a non-empty question and at least 2 distinct non-empty options.
 */
export function createChatPoll(params: {
  tripCode: string;
  question: string;
  optionLabels: readonly string[];
  allowMultiple?: boolean;
  createdBy: string;
  createdByName: string;
  nowIso?: string;
}): ChatPoll | null {
  const question = params.question.replace(/\s+/g, ' ').trim().slice(0, 140);
  if (!question || !params.tripCode.trim()) return null;

  const uniqueLabels: string[] = [];
  const seen = new Set<string>();
  for (const raw of params.optionLabels) {
    const clean = raw.replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueLabels.push(clean);
    if (uniqueLabels.length >= MAX_POLL_OPTIONS) break;
  }
  if (uniqueLabels.length < 2) return null;

  return {
    id: `poll-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    tripCode: params.tripCode.trim().toUpperCase(),
    question,
    options: uniqueLabels.map((label, idx) => ({
      id: `opt-${idx + 1}-${Math.random().toString(36).slice(2, 5)}`,
      label,
      voterIds: [],
    })),
    allowMultiple: Boolean(params.allowMultiple),
    createdBy: params.createdBy || 'guest',
    createdByName: params.createdByName.trim() || 'Guest',
    createdAt: params.nowIso ?? new Date().toISOString(),
  };
}

/**
 * Toggles a crew member's vote on a Quick Poll option cleanly.
 * Single-choice polls automatically switch the member's vote to the tapped option
 * (or remove it if tapping their already-selected option).
 */
export function togglePollVote(
  poll: ChatPoll,
  optionId: string,
  memberId: string,
): ChatPoll {
  if (poll.closed || !memberId || memberId === 'guest') return poll;
  const target = poll.options.find((o) => o.id === optionId);
  if (!target) return poll;

  const alreadySelected = target.voterIds.includes(memberId);
  const nextOptions = poll.options.map((opt) => {
    const withoutMember = opt.voterIds.filter((id) => id !== memberId);
    if (poll.allowMultiple) {
      if (opt.id !== optionId) return opt;
      return {
        ...opt,
        voterIds: alreadySelected ? withoutMember : [...withoutMember, memberId],
      };
    }
    if (opt.id !== optionId) {
      return { ...opt, voterIds: withoutMember };
    }
    return {
      ...opt,
      voterIds: alreadySelected ? withoutMember : [...withoutMember, memberId],
    };
  });

  return { ...poll, options: nextOptions };
}

/**
 * Deterministically merges Crew Chat polls by ID, preserving newest votes and closed state.
 */
export function mergeChatPolls(
  existing: readonly ChatPoll[],
  incoming: readonly ChatPoll[],
): ChatPoll[] {
  const byId = new Map<string, ChatPoll>();
  for (const p of existing) {
    if (p?.id) byId.set(p.id, p);
  }
  for (const p of incoming) {
    if (!p?.id) continue;
    const prev = byId.get(p.id);
    if (!prev) {
      byId.set(p.id, p);
      continue;
    }
    byId.set(p.id, {
      ...prev,
      ...p,
      closed: Boolean(prev.closed || p.closed),
    });
  }
  const sorted = Array.from(byId.values()).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  return sorted.length > MAX_CHAT_POLLS
    ? sorted.slice(sorted.length - MAX_CHAT_POLLS)
    : sorted;
}

export type ChatTimelineEntry =
  | { kind: 'message'; id: string; createdAt: string; message: ChatMessage }
  | { kind: 'poll'; id: string; createdAt: string; poll: ChatPoll };

/**
 * Merges messages and inline polls into one chronological stream (oldest -> newest).
 */
export function buildChatTimeline(
  messages: readonly ChatMessage[],
  polls: readonly ChatPoll[] = [],
): ChatTimelineEntry[] {
  const entries: ChatTimelineEntry[] = [
    ...messages.map((message) => ({
      kind: 'message' as const,
      id: message.id,
      createdAt: message.createdAt,
      message,
    })),
    ...polls.map((poll) => ({
      kind: 'poll' as const,
      id: poll.id,
      createdAt: poll.createdAt,
      poll,
    })),
  ];
  return entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Returns IDs (oldest -> newest) of non-deleted messages and polls matching `query`.
 */
export function searchChatTimelineIds(
  messages: readonly ChatMessage[],
  polls: readonly ChatPoll[],
  rawQuery: string,
): string[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];
  const timeline = buildChatTimeline(messages, polls);
  const hits: string[] = [];
  for (const entry of timeline) {
    if (entry.kind === 'message') {
      const m = entry.message;
      if (m.deleted) continue;
      if (
        m.text.toLowerCase().includes(q) ||
        m.senderName.toLowerCase().includes(q)
      ) {
        hits.push(m.id);
      }
    } else {
      const p = entry.poll;
      if (
        p.question.toLowerCase().includes(q) ||
        p.createdByName.toLowerCase().includes(q) ||
        p.options.some((o) => o.label.toLowerCase().includes(q))
      ) {
        hits.push(p.id);
      }
    }
  }
  return hits;
}
