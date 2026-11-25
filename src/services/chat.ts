import type { ChatMessage, ChatReplyPreview } from '../types/trip';

export const MAX_CHAT_MESSAGES = 150;
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
