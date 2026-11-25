import type { ChatMessage, ChatReadReceipt, ChatReplyPreview } from '../types/trip';
import { MAX_CHAT_MESSAGES } from './chat';
import { formatSupabaseError, getSupabaseClient } from './supabaseSync';

const CHAT_CACHE_KEY_PREFIX = 'gaskeun_chat_cache_v1_';
const CHAT_CLEARED_KEY_PREFIX = 'gaskeun_chat_cleared_v1_';
const MAX_CLEARED_CHAT_IDS = 400;

function getClearedChatKey(tripCode: string, memberId: string | null): string {
  const normCode = tripCode.trim().toUpperCase();
  const actor = (memberId || 'guest').trim();
  return `${CHAT_CLEARED_KEY_PREFIX}${normCode}_${actor}`;
}

export function loadClearedChatIds(tripCode: string, memberId: string | null): string[] {
  try {
    if (typeof localStorage === 'undefined' || !tripCode.trim()) return [];
    const raw = localStorage.getItem(getClearedChatKey(tripCode, memberId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [];
  } catch {
    return [];
  }
}

export function saveClearedChatIds(
  tripCode: string,
  memberId: string | null,
  ids: readonly string[],
): void {
  try {
    if (typeof localStorage === 'undefined' || !tripCode.trim()) return;
    const unique = Array.from(new Set(ids.filter(Boolean)));
    const bounded =
      unique.length > MAX_CLEARED_CHAT_IDS
        ? unique.slice(unique.length - MAX_CLEARED_CHAT_IDS)
        : unique;
    localStorage.setItem(getClearedChatKey(tripCode, memberId), JSON.stringify(bounded));
  } catch {
    // ignore storage quota limits
  }
}

export function appendClearedChatIds(
  tripCode: string,
  memberId: string | null,
  idsToClear: readonly string[],
): string[] {
  const existing = loadClearedChatIds(tripCode, memberId);
  const next = Array.from(new Set([...existing, ...idsToClear.filter(Boolean)]));
  const bounded =
    next.length > MAX_CLEARED_CHAT_IDS
      ? next.slice(next.length - MAX_CLEARED_CHAT_IDS)
      : next;
  saveClearedChatIds(tripCode, memberId, bounded);
  return bounded;
}

interface TripMessageRow {
  id: string;
  trip_code: string;
  sender_id: string;
  sender_name: string;
  kind: 'text' | 'sticker';
  text: string | null;
  sticker_id: string | null;
  sticker_url?: string | null;
  reply_to: ChatReplyPreview | null;
  reactions: Record<string, string[]> | null;
  deleted: boolean | null;
  created_at: string;
}

function getChatCacheKey(tripCode: string): string {
  return `${CHAT_CACHE_KEY_PREFIX}${tripCode.trim().toUpperCase()}`;
}

export function loadLocalChatCache(tripCode: string): ChatMessage[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(getChatCacheKey(tripCode));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

export function saveLocalChatCache(tripCode: string, messages: readonly ChatMessage[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const bounded =
      messages.length > MAX_CHAT_MESSAGES
        ? messages.slice(messages.length - MAX_CHAT_MESSAGES)
        : messages;
    localStorage.setItem(getChatCacheKey(tripCode), JSON.stringify(bounded));
  } catch {
    // ignore storage quota limits
  }
}

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string; status?: number };
  const code = String(err.code ?? '');
  const msg = String(err.message ?? '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    code === '42703' ||
    code === 'PGRST204' ||
    err.status === 404 ||
    msg.includes('does not exist') ||
    msg.includes('could not find the table') ||
    msg.includes('sticker_url') ||
    msg.includes('trip_messages')
  );
}

function mapRowToChatMessage(row: TripMessageRow): ChatMessage {
  return {
    id: row.id,
    tripCode: row.trip_code,
    senderId: row.sender_id,
    senderName: row.sender_name,
    kind: row.kind === 'sticker' ? 'sticker' : 'text',
    text: row.text ?? '',
    ...(row.sticker_id ? { stickerId: row.sticker_id } : {}),
    ...(row.sticker_url ? { stickerUrl: row.sticker_url } : {}),
    ...(row.reply_to ? { replyTo: row.reply_to } : {}),
    reactions: row.reactions && typeof row.reactions === 'object' ? row.reactions : {},
    ...(row.deleted ? { deleted: true } : {}),
    createdAt: row.created_at,
  };
}

function mapChatMessageToRow(msg: ChatMessage): TripMessageRow {
  return {
    id: msg.id,
    trip_code: msg.tripCode.trim().toUpperCase(),
    sender_id: msg.senderId,
    sender_name: msg.senderName,
    kind: msg.kind,
    text: msg.deleted ? '' : msg.text,
    sticker_id: msg.stickerId ?? null,
    sticker_url: msg.stickerUrl ?? null,
    reply_to: msg.replyTo ?? null,
    reactions: msg.reactions ?? {},
    deleted: Boolean(msg.deleted),
    created_at: msg.createdAt,
  };
}

export async function fetchRemoteChatMessages(
  tripCode: string,
): Promise<
  | { ok: true; messages: ChatMessage[] }
  | { ok: false; error: string; tableMissing?: boolean }
> {
  const client = getSupabaseClient();
  const normCode = tripCode.trim().toUpperCase();
  if (!client || !normCode) {
    return { ok: false, error: 'Cloud sync is not configured.' };
  }

  try {
    const { data, error } = await client
      .from('trip_messages')
      .select('*')
      .eq('trip_code', normCode)
      .order('created_at', { ascending: false })
      .limit(MAX_CHAT_MESSAGES);

    if (error) {
      return {
        ok: false,
        error: formatSupabaseError(error),
        tableMissing: isMissingTableError(error),
      };
    }

    const rows = Array.isArray(data) ? (data as TripMessageRow[]) : [];
    const mapped = rows.map(mapRowToChatMessage).reverse();
    return { ok: true, messages: mapped };
  } catch (err) {
    return {
      ok: false,
      error: formatSupabaseError(err),
      tableMissing: isMissingTableError(err),
    };
  }
}

export async function upsertRemoteChatMessage(
  msg: ChatMessage,
): Promise<{ ok: boolean; tableMissing?: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Offline' };

  try {
    const { error } = await client
      .from('trip_messages')
      .upsert(mapChatMessageToRow(msg), { onConflict: 'id' });
    if (error) {
      return {
        ok: false,
        error: formatSupabaseError(error),
        tableMissing: isMissingTableError(error),
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: formatSupabaseError(err),
      tableMissing: isMissingTableError(err),
    };
  }
}

export async function patchRemoteChatReaction(
  msg: ChatMessage,
): Promise<{ ok: boolean; tableMissing?: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Offline' };

  try {
    const { error } = await client
      .from('trip_messages')
      .update({ reactions: msg.reactions ?? {} })
      .eq('id', msg.id)
      .eq('trip_code', msg.tripCode.trim().toUpperCase());
    if (error) {
      return {
        ok: false,
        error: formatSupabaseError(error),
        tableMissing: isMissingTableError(error),
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: formatSupabaseError(err),
      tableMissing: isMissingTableError(err),
    };
  }
}

export async function markRemoteChatDeleted(
  msgId: string,
  tripCode: string,
): Promise<{ ok: boolean; tableMissing?: boolean; error?: string }> {
  return markMultipleRemoteChatDeleted([msgId], tripCode);
}

export async function markMultipleRemoteChatDeleted(
  msgIds: readonly string[],
  tripCode: string,
): Promise<{ ok: boolean; tableMissing?: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client || msgIds.length === 0) return { ok: false, error: 'Offline' };

  try {
    const { error } = await client
      .from('trip_messages')
      .update({ deleted: true, text: '', reactions: {} })
      .in('id', [...msgIds])
      .eq('trip_code', tripCode.trim().toUpperCase());
    if (error) {
      return {
        ok: false,
        error: formatSupabaseError(error),
        tableMissing: isMissingTableError(error),
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: formatSupabaseError(err),
      tableMissing: isMissingTableError(err),
    };
  }
}

export interface CrewChatSubscriptionHandlers {
  onMessage: (message: ChatMessage) => void;
  onReaction: (payload: { id: string; reactions: Record<string, string[]> }) => void;
  onDelete: (payload: { ids: string[] }) => void;
  onTyping: (payload: { memberId: string; memberName: string; isTyping: boolean }) => void;
  onSeen?: (receipt: ChatReadReceipt) => void;
}

export interface CrewChatChannelController {
  unsubscribe: () => void;
  broadcastMessage: (message: ChatMessage) => void;
  broadcastReaction: (id: string, reactions: Record<string, string[]>) => void;
  broadcastDelete: (ids: string[]) => void;
  sendTypingPing: (isTyping: boolean) => void;
  sendSeenReceipt: (receipt: ChatReadReceipt) => void;
}

export function subscribeToCrewChat(
  tripCode: string,
  sender: { memberId: string; memberName: string } | null,
  handlers: CrewChatSubscriptionHandlers,
): CrewChatChannelController {
  const client = getSupabaseClient();
  const normCode = tripCode.trim().toUpperCase();

  if (!client || !normCode) {
    return {
      unsubscribe: () => {},
      broadcastMessage: () => {},
      broadcastReaction: () => {},
      broadcastDelete: () => {},
      sendTypingPing: () => {},
      sendSeenReceipt: () => {},
    };
  }

  let subscribed = false;
  const channel = client
    .channel(`trip-chat-${normCode}`, {
      config: { broadcast: { self: false } },
    })
    .on('broadcast', { event: 'chat:message' }, ({ payload }) => {
      if (payload && typeof payload === 'object' && 'id' in payload) {
        handlers.onMessage(payload as ChatMessage);
      }
    })
    .on('broadcast', { event: 'chat:reaction' }, ({ payload }) => {
      if (payload && typeof payload === 'object' && 'id' in payload) {
        handlers.onReaction(payload as { id: string; reactions: Record<string, string[]> });
      }
    })
    .on('broadcast', { event: 'chat:delete' }, ({ payload }) => {
      if (payload && typeof payload === 'object') {
        const p = payload as { id?: string; ids?: string[] };
        const ids = Array.isArray(p.ids) ? p.ids : p.id ? [p.id] : [];
        if (ids.length > 0) {
          handlers.onDelete({ ids });
        }
      }
    })
    .on('broadcast', { event: 'chat:typing' }, ({ payload }) => {
      if (payload && typeof payload === 'object' && 'memberId' in payload) {
        handlers.onTyping(
          payload as { memberId: string; memberName: string; isTyping: boolean },
        );
      }
    })
    .on('broadcast', { event: 'chat:seen' }, ({ payload }) => {
      if (payload && typeof payload === 'object' && 'memberId' in payload) {
        handlers.onSeen?.(payload as ChatReadReceipt);
      }
    })
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'trip_messages',
        filter: `trip_code=eq.${normCode}`,
      },
      (payload) => {
        const row = payload.new as TripMessageRow | undefined;
        if (row && row.id) {
          handlers.onMessage(mapRowToChatMessage(row));
        }
      },
    )
    .subscribe((status) => {
      subscribed = status === 'SUBSCRIBED';
    });

  const emit = (event: string, payload: Record<string, unknown>) => {
    if (!subscribed) return;
    void channel.send({ type: 'broadcast', event, payload });
  };

  return {
    unsubscribe: () => {
      subscribed = false;
      void client.removeChannel(channel);
    },
    broadcastMessage: (message) => emit('chat:message', { ...message }),
    broadcastReaction: (id, reactions) => emit('chat:reaction', { id, reactions }),
    broadcastDelete: (ids) => emit('chat:delete', { ids }),
    sendTypingPing: (isTyping) => {
      if (!sender?.memberId) return;
      emit('chat:typing', {
        memberId: sender.memberId,
        memberName: sender.memberName,
        isTyping,
      });
    },
    sendSeenReceipt: (receipt) => emit('chat:seen', { ...receipt }),
  };
}
