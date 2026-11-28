import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildChatTimeline,
  buildReplyPreview,
  CHAT_QUICK_REACTIONS,
  computeChatMessageTickStatus,
  computeLatestSeenAnchors,
  createChatPoll,
  CREW_STICKER_PACK,
  countUnreadMessages,
  createStickerChatMessage,
  createTextChatMessage,
  clampWallpaperOpacity,
  extractMentionedMemberIds,
  filterVisibleMessagesForMember,
  filterVisiblePollsForMember,
  formatChatDayDivider,
  getActiveMentionQuery,
  getMessageDeliveredToMembers,
  getMessageSeenByMembers,
  isGroupedWithPrevious,
  isSafeStickerUrl,
  loadChatLastRead,
  MAX_CHAT_MESSAGES,
  mergeChatDeliveryReceipts,
  mergeChatMessages,
  mergeChatPolls,
  mergeChatReadReceipts,
  normalizeChatWallpaper,
  resolveReplyAuthorLabel,
  saveChatLastRead,
  searchBuiltInStickers,
  searchChatTimelineIds,
  splitTextWithMentions,
  toggleMessageReaction,
  togglePollVote,
} from './chat';
import {
  deleteCustomSticker,
  loadCustomStickers,
  sanitizeStickerCaption,
  saveCustomSticker,
} from './customStickers';
import { searchEmojiCatalog } from './emojiCatalog';
import { expandStickerSearchTerms } from './stickerSearch';
import {
  appendClearedChatIds,
  enqueuePendingChatItem,
  flushPendingChatQueue,
  getPendingChatMessageIds,
  loadClearedChatIds,
} from './chatSync';

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

  it('supports transparent external/pasted stickers, URL safety checks, and built-in sticker search', () => {
    expect(isSafeStickerUrl('https://fonts.gstatic.com/s/e/notoemoji/latest/1f602/512.webp')).toBe(
      true,
    );
    expect(isSafeStickerUrl('data:image/webp;base64,UklGRh4AAABXRUJQ')).toBe(true);
    expect(isSafeStickerUrl('data:image/jpeg;base64,/9j/4AAQ')).toBe(false);
    expect(isSafeStickerUrl('javascript:alert(1)')).toBe(false);

    const customSticker = createStickerChatMessage({
      tripCode: 'SOLO-27',
      senderId: 'm-kris',
      senderName: 'Kris',
      stickerUrl: 'data:image/webp;base64,UklGRh4AAABXRUJQ',
      stickerCaption: 'Custom Wave',
    });
    expect(customSticker).toMatchObject({
      kind: 'sticker',
      text: 'Custom Wave',
      stickerUrl: 'data:image/webp;base64,UklGRh4AAABXRUJQ',
    });

    const searched = searchBuiltInStickers('motor');
    expect(searched.some((s) => s.id === 'stk-gaskeun')).toBe(true);
  });

  it('expands Indonesian sticker queries and stores custom die-cut stickers cleanly', () => {
    const terms = expandStickerSearchTerms('keren');
    expect(terms).toContain('cool');
    expect(terms).toContain('sunglasses');

    expect(sanitizeStickerCaption('   GASKEUN   TERUS   BIAR MANTAP BANG  ')).toBe(
      'GASKEUN TERUS BIAR MAN',
    );

    const saved = saveCustomSticker({
      id: 'my-stk-1',
      caption: 'GASKEUN!',
      emoji: '🛵',
      themeId: 'matcha',
      dataUrl: 'data:image/webp;base64,UklGRh4AAABXRUJQ',
      createdAt: '2026-11-25T10:00:00.000Z',
    });
    expect(saved).toHaveLength(1);
    expect(loadCustomStickers()[0].caption).toBe('GASKEUN!');

    const afterDelete = deleteCustomSticker('my-stk-1');
    expect(afterDelete).toHaveLength(0);
  });

  it('includes Moai (batu) in offline emoji search and resolves Seen By receipts', () => {
    const batuHits = searchEmojiCatalog('batu');
    expect(batuHits.some((e) => e.emoji === '🗿')).toBe(true);

    const members = [
      { id: 'm-kris', name: 'Kris', initials: 'KR', role: 'driver' as const, status: 'confirmed' as const, avatarBg: '#E3EDE6', avatarColor: '#2D4A42', isCreator: true },
      { id: 'm-rani', name: 'Rani', initials: 'RN', role: 'passenger' as const, status: 'confirmed' as const, avatarBg: '#E3EDE6', avatarColor: '#2D4A42' },
      { id: 'm-anggi', name: 'Anggi', initials: 'AG', role: 'passenger' as const, status: 'confirmed' as const, avatarBg: '#E3EDE6', avatarColor: '#2D4A42' },
    ];

    const m1 = createTextChatMessage({
      tripCode: 'SOLO-27',
      senderId: 'm-kris',
      senderName: 'Kris',
      text: 'Ketemuan jam 8',
      nowIso: '2026-11-25T10:00:00.000Z',
    })!;
    const m2 = createTextChatMessage({
      tripCode: 'SOLO-27',
      senderId: 'm-kris',
      senderName: 'Kris',
      text: 'Jangan telat!',
      nowIso: '2026-11-25T10:05:00.000Z',
    })!;

    const mergedReceipts = mergeChatReadReceipts(
      { 'm-rani': { memberId: 'm-rani', lastReadAt: '2026-11-25T10:01:00.000Z' } },
      {
        'm-rani': { memberId: 'm-rani', lastReadAt: '2026-11-25T10:02:00.000Z' },
        'm-anggi': { memberId: 'm-anggi', lastReadAt: '2026-11-25T10:06:00.000Z' },
      },
    );

    expect(getMessageSeenByMembers(m1, mergedReceipts, members, 'm-kris')).toHaveLength(2);
    expect(getMessageSeenByMembers(m2, mergedReceipts, members, 'm-kris')).toHaveLength(1);

    const anchors = computeLatestSeenAnchors([m1, m2], mergedReceipts, members, 'm-kris');
    expect(anchors[m1.id]?.map((x) => x.member.id)).toEqual(['m-rani']);
    expect(anchors[m2.id]?.map((x) => x.member.id)).toEqual(['m-anggi']);
  });

  it('persists clean-deleted message IDs per trip and member so cleared chats disappear without unsent tombstones', () => {
    expect(loadClearedChatIds('SOLO-27', 'm-kris')).toEqual([]);

    const cleared = appendClearedChatIds('solo-27', 'm-kris', ['msg-1', 'msg-2', 'msg-1']);
    expect(cleared).toEqual(['msg-1', 'msg-2']);
    expect(loadClearedChatIds('SOLO-27', 'm-kris')).toEqual(['msg-1', 'msg-2']);

    // Isolated per member and trip code
    expect(loadClearedChatIds('SOLO-27', 'm-rani')).toEqual([]);
    expect(loadClearedChatIds('OTHER-1', 'm-kris')).toEqual([]);

    const appended = appendClearedChatIds('SOLO-27', 'm-kris', ['msg-3']);
    expect(appended).toEqual(['msg-1', 'msg-2', 'msg-3']);
  });

  it('parses @mentions, runs single/multi-choice Quick Polls, and searches chronological chat timeline', () => {
    const members = [
      { id: 'm-kris', name: 'Kris', initials: 'KR', role: 'driver' as const, status: 'confirmed' as const, avatarBg: '#E3EDE6', avatarColor: '#2D4A42', isCreator: true },
      { id: 'm-rani', name: 'Rani', initials: 'RN', role: 'passenger' as const, status: 'confirmed' as const, avatarBg: '#E3EDE6', avatarColor: '#2D4A42' },
    ];

    expect(getActiveMentionQuery('Hai @ra', 7)).toEqual({ query: 'ra', startIndex: 4 });
    expect(getActiveMentionQuery('Hai @ra ', 8)).toBeNull();
    expect(extractMentionedMemberIds('Gas @Rani sama @Kris ya', members)).toEqual(['m-rani', 'm-kris']);
    expect(extractMentionedMemberIds('Kumpul @all sekarang', members)).toEqual(['m-kris', 'm-rani']);

    const segments = splitTextWithMentions('Halo @Rani!', members);
    expect(segments).toEqual([
      { text: 'Halo ' },
      { text: '@Rani', memberId: 'm-rani' },
      { text: '!' },
    ]);

    const poll = createChatPoll({
      tripCode: 'solo-27',
      question: 'Makan siang di mana?',
      optionLabels: ['Gudeg', 'Soto', 'Gudeg'],
      allowMultiple: false,
      createdBy: 'm-kris',
      createdByName: 'Kris',
      nowIso: '2026-11-26T09:00:00.000Z',
    })!;
    expect(poll.options).toHaveLength(2);

    const opt0 = poll.options[0].id;
    const opt1 = poll.options[1].id;
    const voted1 = togglePollVote(poll, opt0, 'm-rani');
    expect(voted1.options[0].voterIds).toEqual(['m-rani']);

    // Single-choice switches vote automatically
    const switched = togglePollVote(voted1, opt1, 'm-rani');
    expect(switched.options[0].voterIds).toEqual([]);
    expect(switched.options[1].voterIds).toEqual(['m-rani']);

    const merged = mergeChatPolls([poll], [switched]);
    expect(merged[0].options[1].voterIds).toEqual(['m-rani']);

    const m1 = createTextChatMessage({
      tripCode: 'SOLO-27',
      senderId: 'm-kris',
      senderName: 'Kris',
      text: 'Berangkat jam 8 pagi',
      nowIso: '2026-11-26T08:55:00.000Z',
    })!;
    const timeline = buildChatTimeline([m1], merged);
    expect(timeline.map((t) => t.kind)).toEqual(['message', 'poll']);
    expect(searchChatTimelineIds([m1], merged, 'gudeg')).toEqual([poll.id]);
    expect(searchChatTimelineIds([m1], merged, 'jam 8')).toEqual([m1.id]);
  });

  it('computes strict 3-stage group ticks: pending -> sent (1) -> delivered (2 gray) -> read by ALL crew (2 blue)', () => {
    const members = [
      { id: 'm-kris', name: 'Kris', initials: 'KR', role: 'driver' as const, status: 'confirmed' as const, avatarBg: '#E3EDE6', avatarColor: '#2D4A42', isCreator: true },
      { id: 'm-rani', name: 'Rani', initials: 'RN', role: 'passenger' as const, status: 'confirmed' as const, avatarBg: '#E3EDE6', avatarColor: '#2D4A42' },
      { id: 'm-anggi', name: 'Anggi', initials: 'AG', role: 'passenger' as const, status: 'confirmed' as const, avatarBg: '#E3EDE6', avatarColor: '#2D4A42' },
    ];
    const msg = createTextChatMessage({
      tripCode: 'SOLO-27',
      senderId: 'm-kris',
      senderName: 'Kris',
      text: 'Semua sudah siap?',
      nowIso: '2026-11-27T10:00:00.000Z',
    })!;

    // Stage 0: Pending in offline outbox
    expect(
      computeChatMessageTickStatus({
        message: msg,
        isPending: true,
        members,
        activeMemberId: 'm-kris',
      }),
    ).toBe('pending');

    // Stage 1: Single gray tick (sent to server, no other crew webapp received it yet)
    expect(
      computeChatMessageTickStatus({
        message: msg,
        isPending: false,
        deliveryReceipts: {},
        readReceipts: {},
        members,
        activeMemberId: 'm-kris',
      }),
    ).toBe('sent');

    // Stage 2a: Double gray tick when 1 crew webapp receives it (delivered, not read)
    const del1 = mergeChatDeliveryReceipts(undefined, {
      'm-rani': { memberId: 'm-rani', lastDeliveredAt: '2026-11-27T10:00:05.000Z', lastMessageId: msg.id },
    });
    expect(getMessageDeliveredToMembers(msg, del1, {}, members, 'm-kris')).toHaveLength(1);
    expect(
      computeChatMessageTickStatus({
        message: msg,
        deliveryReceipts: del1,
        readReceipts: {},
        members,
        activeMemberId: 'm-kris',
      }),
    ).toBe('delivered');

    // Stage 2b: Still double gray tick when ONLY 1 of 2 other crew members has read it!
    const readPartial = mergeChatReadReceipts(undefined, {
      'm-rani': { memberId: 'm-rani', lastReadAt: '2026-11-27T10:01:00.000Z', lastMessageId: msg.id },
    });
    expect(
      computeChatMessageTickStatus({
        message: msg,
        deliveryReceipts: del1,
        readReceipts: readPartial,
        members,
        activeMemberId: 'm-kris',
      }),
    ).toBe('delivered');

    // Stage 3: Double BLUE tick only once ALL other crew members (Rani + Anggi) have read it!
    const readAll = mergeChatReadReceipts(readPartial, {
      'm-anggi': { memberId: 'm-anggi', lastReadAt: '2026-11-27T10:02:00.000Z', lastMessageId: msg.id },
    });
    expect(
      computeChatMessageTickStatus({
        message: msg,
        deliveryReceipts: del1,
        readReceipts: readAll,
        members,
        activeMemberId: 'm-kris',
      }),
    ).toBe('read');
  });

  it('queues offline chat messages and flushes both persistence and background push when reconnected', async () => {
    const msg = createTextChatMessage({
      tripCode: 'SOLO-27',
      senderId: 'm-kris',
      senderName: 'Kris',
      text: 'Pesan pas offline',
      nowIso: '2026-11-27T10:10:00.000Z',
    })!;

    enqueuePendingChatItem('SOLO-27', {
      message: msg,
      pushPayload: {
        tripCode: 'SOLO-27',
        senderId: 'm-kris',
        title: 'Solo – Jogja',
        body: 'Kris: Pesan pas offline',
        openChat: true,
      },
    });
    expect(getPendingChatMessageIds('SOLO-27')).toEqual([msg.id]);

    const broadcastSpy = vi.fn();
    const pushSpy = vi.fn().mockResolvedValue(true);
    const upsertSpy = vi.fn().mockResolvedValue({ ok: true });

    const res = await flushPendingChatQueue('SOLO-27', {
      onBroadcast: broadcastSpy,
      upsertFn: upsertSpy,
      pushFn: pushSpy,
    });

    expect(res.flushedIds).toEqual([msg.id]);
    expect(res.remainingIds).toEqual([]);
    expect(upsertSpy).toHaveBeenCalledWith(msg);
    expect(broadcastSpy).toHaveBeenCalledWith(msg);
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(getPendingChatMessageIds('SOLO-27')).toEqual([]);
  });

  it('filters chat history for newly added crew when Host turns new-member history OFF and excludes late joiners from older blue ticks', () => {
    const oldMember = {
      id: 'm-kris',
      name: 'Kris',
      initials: 'K',
      role: 'driver' as const,
      status: 'confirmed' as const,
      avatarBg: '#E3EDE6',
      avatarColor: '#2D4A42',
      isCreator: true,
    };
    const existingCrew = {
      id: 'm-rani',
      name: 'Rani',
      initials: 'R',
      role: 'passenger' as const,
      status: 'confirmed' as const,
      avatarBg: '#E3EDE6',
      avatarColor: '#2D4A42',
    };
    const lateJoiner = {
      id: 'm-bima',
      name: 'Bima',
      initials: 'B',
      role: 'passenger' as const,
      status: 'confirmed' as const,
      avatarBg: '#E3EDE6',
      avatarColor: '#2D4A42',
      joinedAt: '2026-11-27T12:00:00.000Z',
    };

    const olderMsg = createTextChatMessage({
      tripCode: 'SOLO-27',
      senderId: 'm-kris',
      senderName: 'Kris',
      text: 'Day 1 message',
      nowIso: '2026-11-27T10:00:00.000Z',
    })!;
    const newerMsg = createTextChatMessage({
      tripCode: 'SOLO-27',
      senderId: 'm-kris',
      senderName: 'Kris',
      text: 'Welcome Bima!',
      nowIso: '2026-11-27T12:05:00.000Z',
    })!;

    // ON (default): late joiner sees all messages
    expect(filterVisibleMessagesForMember([olderMsg, newerMsg], lateJoiner, true)).toHaveLength(2);
    // OFF: late joiner only sees messages on/after joinedAt
    const filtered = filterVisibleMessagesForMember([olderMsg, newerMsg], lateJoiner, false);
    expect(filtered.map((m) => m.id)).toEqual([newerMsg.id]);

    // Polls follow the same policy
    const oldPoll = createChatPoll({
      tripCode: 'SOLO-27',
      question: 'Makan siang?',
      optionLabels: ['Sate', 'Soto'],
      createdBy: 'm-kris',
      createdByName: 'Kris',
      nowIso: '2026-11-27T09:00:00.000Z',
    })!;
    expect(filterVisiblePollsForMember([oldPoll], lateJoiner, true)).toHaveLength(1);
    expect(filterVisiblePollsForMember([oldPoll], lateJoiner, false)).toHaveLength(0);

    // Tick status: olderMsg turns blue when Rani has read it even if lateJoiner hasn't, when history is OFF
    const members = [oldMember, existingCrew, lateJoiner];
    const receipts = {
      'm-rani': { memberId: 'm-rani', lastReadAt: '2026-11-27T10:15:00.000Z' },
    };
    expect(
      computeChatMessageTickStatus({
        message: olderMsg,
        readReceipts: receipts,
        members,
        activeMemberId: 'm-kris',
        chatHistoryForNewMembers: false,
      }),
    ).toBe('read');
    expect(
      computeChatMessageTickStatus({
        message: olderMsg,
        readReceipts: receipts,
        members,
        activeMemberId: 'm-kris',
        chatHistoryForNewMembers: true,
      }),
    ).toBe('delivered');
  });

  it('normalizes and clamps Host chat wallpaper configs cleanly', () => {
    expect(clampWallpaperOpacity(0.02)).toBe(0.1);
    expect(clampWallpaperOpacity(1.5)).toBe(1);
    expect(normalizeChatWallpaper({ presetId: 'default', opacity: 0.7 })).toBeUndefined();
    expect(normalizeChatWallpaper({ presetId: 'matcha-doodle', opacity: 0.65 })).toEqual({
      presetId: 'matcha-doodle',
      opacity: 0.65,
    });
    expect(
      normalizeChatWallpaper({
        imageUrl: 'https://example.supabase.co/storage/v1/object/public/trip-assets/wp.jpg',
        opacity: 0.4,
      }),
    ).toEqual({
      imageUrl: 'https://example.supabase.co/storage/v1/object/public/trip-assets/wp.jpg',
      opacity: 0.4,
    });
  });

  it('displays "You" for reply quotes targeting the active member (both modern and legacy replies)', () => {
    const doraMsg = createTextChatMessage({
      tripCode: 'SOLO-27',
      senderId: 'm-dora',
      senderName: 'Dora',
      text: 'emg mau ngirim foto apa yang mungkin?',
      nowIso: '2026-11-27T15:30:00.000Z',
    })!;
    const preview = buildReplyPreview(doraMsg);
    expect(preview.senderId).toBe('m-dora');

    const map = new Map([[doraMsg.id, doraMsg]]);
    expect(resolveReplyAuthorLabel(preview, 'm-dora', 'Dora', map)).toBe('You');
    expect(resolveReplyAuthorLabel(preview, 'm-chika', 'Chika', map)).toBe('Dora');

    const legacyPreview = {
      id: doraMsg.id,
      senderName: 'Dora',
      kind: 'text' as const,
      text: doraMsg.text,
    };
    expect(resolveReplyAuthorLabel(legacyPreview, 'm-dora', 'Dora', map)).toBe('You');
    expect(resolveReplyAuthorLabel({ ...legacyPreview, id: 'old-id' }, 'm-dora', 'Dora')).toBe('You');
    expect(resolveReplyAuthorLabel(legacyPreview, 'm-chika', 'Chika', map)).toBe('Dora');
  });

  it('collapses newlines and trims ultra-long messages in reply previews', () => {
    const longMsg = createTextChatMessage({
      tripCode: 'SOLO-27',
      senderId: 'm-kris',
      senderName: 'Kris',
      text: `Baris pertama\n\nBaris kedua ${'panjang '.repeat(40)}`,
    })!;
    const preview = buildReplyPreview(longMsg);
    expect(preview.text).not.toContain('\n');
    expect(preview.text.length).toBeLessThanOrEqual(180);
    expect(preview.text.endsWith('…')).toBe(true);
  });
});
