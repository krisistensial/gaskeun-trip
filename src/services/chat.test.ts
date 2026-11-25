import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHAT_QUICK_REACTIONS,
  CREW_STICKER_PACK,
  countUnreadMessages,
  createStickerChatMessage,
  createTextChatMessage,
  formatChatDayDivider,
  isGroupedWithPrevious,
  loadChatLastRead,
  MAX_CHAT_MESSAGES,
  mergeChatMessages,
  saveChatLastRead,
  toggleMessageReaction,
} from './chat';

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (idx: number) => Array.from(map.keys())[idx] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, val: string) => {
      map.set(key, String(val));
    },
  };
}

describe('Crew Chat pure helpers (text, stickers, emoji reactions, unread)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates text and sticker messages while rejecting empty or unknown payloads', () => {
    expect(
      createTextChatMessage({
        tripCode: 'solo-27',
        senderId: 'm-kris',
        senderName: 'Kris',
        text: '   ',
      }),
    ).toBeNull();

    const textMsg = createTextChatMessage({
      tripCode: 'solo-27',
      senderId: 'm-kris',
      senderName: 'Kris',
      text: '  Kumpul stasiun jam 21:00 ya!  ',
      nowIso: '2026-11-25T10:00:00.000Z',
    });
    expect(textMsg).toMatchObject({
      tripCode: 'SOLO-27',
      senderId: 'm-kris',
      senderName: 'Kris',
      kind: 'text',
      text: 'Kumpul stasiun jam 21:00 ya!',
      reactions: {},
    });

    expect(
      createStickerChatMessage({
        tripCode: 'SOLO-27',
        senderId: 'm-rani',
        senderName: 'Rani',
        stickerId: 'unknown-sticker',
      }),
    ).toBeNull();

    const stk = createStickerChatMessage({
      tripCode: 'SOLO-27',
      senderId: 'm-rani',
      senderName: 'Rani',
      stickerId: CREW_STICKER_PACK[0].id,
      nowIso: '2026-11-25T10:01:00.000Z',
    });
    expect(stk).toMatchObject({
      kind: 'sticker',
      stickerId: 'stk-gaskeun',
      text: 'GASKEUN!',
    });
  });

  it('toggles emoji reactions idempotently like IG/WhatsApp and deletes empty emoji buckets', () => {
    const base = createTextChatMessage({
      tripCode: 'SOLO-27',
      senderId: 'm-kris',
      senderName: 'Kris',
      text: 'Ready!',
      nowIso: '2026-11-25T10:00:00.000Z',
    })!;

    // Kris & Rani react with ❤️
    let next = toggleMessageReaction(base, CHAT_QUICK_REACTIONS[0], 'm-kris');
    next = toggleMessageReaction(next, '❤️', 'm-rani');
    next = toggleMessageReaction(next, '😂', 'm-anggi');
    expect(next.reactions).toEqual({
      '❤️': ['m-kris', 'm-rani'],
      '😂': ['m-anggi'],
    });

    // Anggi taps 😂 again -> bucket removed cleanly
    next = toggleMessageReaction(next, '😂', 'm-anggi');
    expect(next.reactions).toEqual({
      '❤️': ['m-kris', 'm-rani'],
    });
  });

  it('merges messages chronologically, preserves unsend state, and caps at MAX_CHAT_MESSAGES', () => {
    const bulk = Array.from({ length: MAX_CHAT_MESSAGES + 10 }, (_, idx) => ({
      id: `m-${idx}`,
      tripCode: 'SOLO-27',
      senderId: 'm-kris',
      senderName: 'Kris',
      kind: 'text' as const,
      text: `Msg ${idx}`,
      reactions: {},
      createdAt: new Date(Date.UTC(2026, 10, 25, 0, idx)).toISOString(),
    }));

    const merged = mergeChatMessages(bulk.slice(0, 50), bulk.slice(40));
    expect(merged).toHaveLength(MAX_CHAT_MESSAGES);
    expect(merged[0].id).toBe('m-10');
    expect(merged[merged.length - 1].id).toBe(`m-${MAX_CHAT_MESSAGES + 9}`);
  });

  it('counts unread messages excluding own messages and tracks last-read timestamps', () => {
    const msgs = [
      createTextChatMessage({
        tripCode: 'SOLO-27',
        senderId: 'm-kris',
        senderName: 'Kris',
        text: '1',
        nowIso: '2026-11-25T10:00:00.000Z',
      })!,
      createTextChatMessage({
        tripCode: 'SOLO-27',
        senderId: 'm-rani',
        senderName: 'Rani',
        text: '2',
        nowIso: '2026-11-25T10:05:00.000Z',
      })!,
      createTextChatMessage({
        tripCode: 'SOLO-27',
        senderId: 'm-anggi',
        senderName: 'Anggi',
        text: '3',
        nowIso: '2026-11-25T10:06:00.000Z',
      })!,
    ];

    expect(countUnreadMessages(msgs, '', 'm-kris')).toBe(2);
    saveChatLastRead('SOLO-27', 'm-kris', '2026-11-25T10:05:00.000Z');
    const saved = loadChatLastRead('SOLO-27', 'm-kris');
    expect(countUnreadMessages(msgs, saved, 'm-kris')).toBe(1);
  });

  it('groups consecutive sender messages within 2 minutes and formats day dividers', () => {
    const m1 = createTextChatMessage({
      tripCode: 'SOLO-27',
      senderId: 'm-kris',
      senderName: 'Kris',
      text: 'Halo',
      nowIso: '2026-11-25T10:00:00.000Z',
    })!;
    const m2 = createTextChatMessage({
      tripCode: 'SOLO-27',
      senderId: 'm-kris',
      senderName: 'Kris',
      text: 'Udah siap?',
      nowIso: '2026-11-25T10:01:30.000Z',
    })!;
    const m3 = createTextChatMessage({
      tripCode: 'SOLO-27',
      senderId: 'm-kris',
      senderName: 'Kris',
      text: 'Halo lagi',
      nowIso: '2026-11-25T10:05:00.000Z',
    })!;

    expect(isGroupedWithPrevious(m1, m2)).toBe(true);
    expect(isGroupedWithPrevious(m2, m3)).toBe(false);

    const now = new Date('2026-11-25T12:00:00.000Z');
    expect(formatChatDayDivider('2026-11-25T10:00:00.000Z', now)).toBe('Today');
    expect(formatChatDayDivider('2026-11-24T10:00:00.000Z', now)).toBe('Yesterday');
  });
});
