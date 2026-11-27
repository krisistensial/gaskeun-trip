export const NOTIFICATIONS_STORAGE_KEY = 'gaskeun_notifications_enabled';

export type DeviceNotificationPermission = 'unsupported' | 'default' | 'granted' | 'denied';

export interface DeviceNotificationResult {
  ok: boolean;
  error?: string;
}

export type NotificationGroupKind = 'chat' | 'trip';

export interface DeviceNotificationPayload {
  title: string;
  body: string;
  tag?: string;
  renotify?: boolean;
  /** Optional message/event ID used to deduplicate grouped alerts (Push + Realtime) */
  messageId?: string;
  /** When set, appends new lines into one expandable WA-style notification card for this tag */
  groupKind?: NotificationGroupKind;
  openChat?: boolean;
  url?: string;
}

export interface GroupedNotificationData {
  baseTitle?: string;
  groupKind?: NotificationGroupKind;
  lines?: string[];
  messageIds?: string[];
  count?: number;
  openChat?: boolean;
  url?: string;
}

const MAX_STACKED_NOTIFICATION_LINES = 8;
const MAX_TRACKED_NOTIFICATION_IDS = 40;

/**
 * Collapses legacy or per-message tags (e.g. `chat-SOLO-27-msg-abc123`, `poll-SOLO-27-poll-1`,
 * `trip-SOLO-27-log-xyz`) into ONE fixed thread tag per trip (`chat-SOLO-27` or `trip-SOLO-27`)
 * so Android/Chrome ALWAYS renders a single expandable WA-style card instead of separate cards.
 */
export function normalizeGroupedNotificationTag(params: {
  tag?: string;
  groupKind?: NotificationGroupKind;
  openChat?: boolean;
  tripCode?: string;
}): string {
  const cleanCode = (params.tripCode ?? '').trim().toUpperCase();
  const rawTag = (params.tag ?? '').trim();

  if (params.groupKind === 'chat' || params.openChat) {
    if (cleanCode) return `chat-${cleanCode}`;
    const chatMatch = rawTag.match(/^(?:chat|poll)-([A-Z0-9-]+?)(?:-(?:msg|stk|poll)-[A-Za-z0-9_-]+)?$/i);
    if (chatMatch?.[1]) return `chat-${chatMatch[1].toUpperCase()}`;
    return rawTag ? rawTag.replace(/-(?:msg|stk|poll)-[A-Za-z0-9_-]+$/i, '') : 'chat-gaskeun';
  }

  if (params.groupKind === 'trip') {
    if (cleanCode) return `trip-${cleanCode}`;
    const tripMatch = rawTag.match(/^trip-([A-Z0-9-]+?)(?:-(?:log|edit)-[A-Za-z0-9_-]+)?$/i);
    if (tripMatch?.[1]) return `trip-${tripMatch[1].toUpperCase()}`;
    return rawTag ? rawTag.replace(/-(?:log|edit)-[A-Za-z0-9_-]+$/i, '') : 'trip-gaskeun';
  }

  return rawTag || `gaskeun-${Date.now()}`;
}

/**
 * Merges a new incoming alert into an existing OS notification card (WhatsApp-style):
 * - Deduplicates by `messageId` so Push + Realtime never double-add the same message.
 * - Keeps the latest 8 lines separated by `\n` so Android/One UI renders 1 compact card
 *   that expands smoothly when tapping the chevron arrow (showing messages from different crew).
 * - Updates title to `Trip Name (N messages)` / `(N updates)` when multiple items accumulate.
 */
export function buildMergedNotificationContent(params: {
  baseTitle: string;
  newLine: string;
  groupKind: NotificationGroupKind;
  messageId?: string;
  existingData?: GroupedNotificationData | null;
  existingBody?: string;
}): {
  title: string;
  body: string;
  duplicate: boolean;
  data: Required<Pick<GroupedNotificationData, 'baseTitle' | 'groupKind' | 'lines' | 'messageIds' | 'count'>>;
} {
  const cleanBaseTitle = params.baseTitle.trim() || 'GASKEUN!';
  const cleanLine = params.newLine.replace(/\s+/g, ' ').trim();
  const prev = params.existingData ?? null;
  const prevIds = Array.isArray(prev?.messageIds)
    ? prev.messageIds.filter((x): x is string => typeof x === 'string' && x.length > 0)
    : [];

  let prevLines: string[] = [];
  if (Array.isArray(prev?.lines) && prev.lines.length > 0) {
    prevLines = prev.lines.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
  } else if (params.existingBody && params.existingBody.trim()) {
    prevLines = params.existingBody
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const prevCount =
    typeof prev?.count === 'number' && prev.count > 0 ? prev.count : prevLines.length;

  if (params.messageId && prevIds.includes(params.messageId)) {
    const unit = params.groupKind === 'chat' ? 'messages' : 'updates';
    const title = prevCount > 1 ? `${cleanBaseTitle} (${prevCount} ${unit})` : cleanBaseTitle;
    return {
      title,
      body: prevLines.join('\n') || cleanLine,
      duplicate: true,
      data: {
        baseTitle: cleanBaseTitle,
        groupKind: params.groupKind,
        lines: prevLines,
        messageIds: prevIds,
        count: Math.max(1, prevCount),
      },
    };
  }

  const nextLines = [...prevLines, cleanLine]
    .filter(Boolean)
    .slice(-MAX_STACKED_NOTIFICATION_LINES);
  const nextIds = params.messageId
    ? [...prevIds, params.messageId].slice(-MAX_TRACKED_NOTIFICATION_IDS)
    : prevIds;
  const nextCount = prevCount + 1;
  const unit = params.groupKind === 'chat' ? 'messages' : 'updates';
  const title = nextCount > 1 ? `${cleanBaseTitle} (${nextCount} ${unit})` : cleanBaseTitle;

  return {
    title,
    body: nextLines.join('\n'),
    duplicate: false,
    data: {
      baseTitle: cleanBaseTitle,
      groupKind: params.groupKind,
      lines: nextLines,
      messageIds: nextIds,
      count: nextCount,
    },
  };
}

function truncateNotificationText(raw: string, maxLen = 72): string {
  const clean = raw.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1).trimEnd()}…`;
}

/**
 * Formats compact, non-stacked notification copy for Crew Chat messages & polls.
 */
export function formatChatNotificationCopy(params: {
  tripTitle: string;
  senderName: string;
  kind: 'text' | 'sticker' | 'poll';
  text: string;
  unreadFromOthers?: number;
  isMentioned?: boolean;
}): { title: string; body: string } {
  const title = truncateNotificationText(params.tripTitle || 'Crew Chat', 36);
  const sender = params.senderName.trim() || 'Crew';
  const unread = Math.max(1, params.unreadFromOthers ?? 1);
  const mentionPrefix = params.isMentioned ? 'Mentioned you · ' : '';

  let preview = '';
  if (params.kind === 'sticker') {
    preview = `${sender} sent a sticker ✨`;
  } else if (params.kind === 'poll') {
    preview = `Poll · ${sender}: ${params.text}`;
  } else if (unread > 1) {
    preview = `(${unread} unread) ${sender}: ${params.text}`;
  } else {
    preview = `${sender}: ${params.text}`;
  }

  return {
    title,
    body: truncateNotificationText(`${mentionPrefix}${preview}`, 80),
  };
}

/**
 * Formats compact, single-line trip update copy for background sync notifications.
 */
export function formatTripUpdateNotificationCopy(params: {
  tripTitle: string;
  actorName: string;
  action: string;
}): { title: string; body: string } {
  return {
    title: truncateNotificationText(params.tripTitle || 'Trip Updated', 36),
    body: truncateNotificationText(`${params.actorName}: ${params.action}`, 76),
  };
}

/**
 * Fire OS tray notifications when the app is backgrounded OR the browser window
 * is currently unfocused (e.g. covered window / desktop workspace / split-screen),
 * while actively focused sessions use the sleek in-app heads-up banner/toast.
 */
export function shouldFireOsNotification(
  isDocumentHidden: boolean,
  hasDocumentFocus = true,
): boolean {
  return Boolean(isDocumentHidden || !hasDocumentFocus);
}

export function isDeviceNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getDeviceNotificationPermission(): DeviceNotificationPermission {
  if (!isDeviceNotificationSupported()) return 'unsupported';
  return window.Notification.permission;
}

export function getDeviceNotificationsEnabled(): boolean {
  try {
    if (typeof localStorage === 'undefined') return true;
    return localStorage.getItem(NOTIFICATIONS_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setDeviceNotificationsEnabled(enabled: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, String(Boolean(enabled)));
  } catch {
    // ignore storage restrictions
  }
}

function resolveAssetUrl(file: string): string {
  try {
    const base = import.meta.env.BASE_URL || '/';
    if (typeof window !== 'undefined' && window.location?.origin) {
      return new URL(`${base}${file}`, window.location.origin).href;
    }
    return `${base}${file}`;
  } catch {
    return `./${file}`;
  }
}

/**
 * Displays an OS / Android PWA tray notification when permission is granted
 * and returns a clear result object so manual tests can surface diagnostics.
 */
export async function tryShowDeviceNotification(
  payload: DeviceNotificationPayload,
): Promise<DeviceNotificationResult> {
  if (!isDeviceNotificationSupported()) {
    return {
      ok: false,
      error: 'On iPhone/iPad, install GASKEUN via Share -> Add to Home Screen to enable alerts.',
    };
  }
  if (window.Notification.permission === 'denied') {
    return {
      ok: false,
      error: 'Notifications are blocked in your browser/phone site settings.',
    };
  }
  if (window.Notification.permission !== 'granted') {
    return {
      ok: false,
      error: 'Notification permission not granted yet.',
    };
  }
  if (!getDeviceNotificationsEnabled()) {
    return {
      ok: false,
      error: 'Phone notifications are paused on this device.',
    };
  }

  const icon = resolveAssetUrl('pwa-192x192.png');
  const badge = resolveAssetUrl('favicon-32x32.png');

  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const sw = navigator.serviceWorker;
      let reg: ServiceWorkerRegistration | null | undefined = null;
      if (typeof sw.getRegistration === 'function') {
        reg =
          (await sw.getRegistration(resolveAssetUrl('')).catch(() => undefined)) ??
          (await sw.getRegistration().catch(() => undefined));
      }
      if (!reg && sw.ready) {
        let timerId: ReturnType<typeof globalThis.setTimeout> | undefined;
        reg = await Promise.race([
          sw.ready.catch(() => null),
          new Promise<null>((resolve) => {
            timerId = globalThis.setTimeout(() => resolve(null), 2500);
          }),
        ]);
        if (timerId !== undefined) globalThis.clearTimeout(timerId);
      }
      if (reg && typeof reg.showNotification === 'function') {
        const tag = normalizeGroupedNotificationTag({
          tag: payload.tag,
          groupKind: payload.groupKind,
          openChat: payload.openChat,
        });
        let finalTitle = payload.title;
        let finalBody = payload.body;
        let notifData: GroupedNotificationData = {
          baseTitle: payload.title,
          openChat: Boolean(payload.openChat),
          ...(payload.url ? { url: payload.url } : {}),
        };

        if (payload.groupKind && typeof reg.getNotifications === 'function') {
          try {
            const existing = await reg.getNotifications({ tag });
            const latestExisting = existing[existing.length - 1];
            const merged = buildMergedNotificationContent({
              baseTitle: payload.title,
              newLine: payload.body,
              groupKind: payload.groupKind,
              messageId: payload.messageId,
              existingData: (latestExisting?.data as GroupedNotificationData | undefined) ?? null,
              existingBody: latestExisting?.body,
            });
            if (merged.duplicate) {
              return { ok: true };
            }
            finalTitle = merged.title;
            finalBody = merged.body;
            notifData = {
              ...notifData,
              ...merged.data,
            };
          } catch {
            // fall through with single notification body
          }
        }

        await reg.showNotification(finalTitle, {
          body: finalBody,
          icon,
          badge,
          tag,
          silent: false,
          vibrate: [180, 70, 180],
          timestamp: Date.now(),
          data: notifData,
          ...(payload.renotify || payload.groupKind ? { renotify: true } : {}),
        } as NotificationOptions);
        return { ok: true };
      }
    }
  } catch {
    // fall through cleanly to window.Notification
  }

  try {
    new window.Notification(payload.title, {
      body: payload.body,
      icon,
      tag: payload.tag || `gaskeun-${Date.now()}`,
    });
    return { ok: true };
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : '';
    const friendlyMsg = /illegal constructor/i.test(rawMsg)
      ? 'Install PWA or reload once so the notification Service Worker stays active.'
      : rawMsg || 'Browser declined showing notification.';
    return {
      ok: false,
      error: friendlyMsg,
    };
  }
}

export async function showDeviceNotification(
  payload: DeviceNotificationPayload,
): Promise<boolean> {
  const res = await tryShowDeviceNotification(payload);
  return res.ok;
}

/**
 * Dismisses active OS notifications matching `tag` (e.g. `chat-SOLO-27`) once the
 * user opens Crew Chat so the expandable unread notification stack resets cleanly.
 */
export async function clearDeviceNotificationsByTag(tag: string): Promise<void> {
  if (!tag || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const sw = navigator.serviceWorker;
    const reg =
      (typeof sw.getRegistration === 'function'
        ? (await sw.getRegistration(resolveAssetUrl('')).catch(() => undefined)) ??
          (await sw.getRegistration().catch(() => undefined))
        : null) ?? null;
    if (!reg || typeof reg.getNotifications !== 'function') return;
    const all = await reg.getNotifications();
    all
      .filter((n) => n.tag === tag || (n.tag && n.tag.startsWith(`${tag}-`)))
      .forEach((n) => n.close());
    const worker = reg.active ?? sw.controller;
    worker?.postMessage({ type: 'GASKEUN_CLEAR_NOTIF_TAG', tag });
  } catch {
    // ignore cleanup failures
  }
}

export async function requestDeviceNotificationPermission(): Promise<{
  permission: DeviceNotificationPermission;
  granted: boolean;
  shown?: boolean;
  error?: string;
}> {
  if (!isDeviceNotificationSupported()) {
    return {
      permission: 'unsupported',
      granted: false,
      error:
        'Notifications require Safari -> Share -> Add to Home Screen on iOS, or a supported browser.',
    };
  }

  try {
    const result = await window.Notification.requestPermission();
    const granted = result === 'granted';
    if (granted) {
      setDeviceNotificationsEnabled(true);
      const testRes = await tryShowDeviceNotification({
        title: 'GASKEUN! Notifications On',
        body: 'Crew Chat messages and trip updates will now alert this phone.',
        tag: `gaskeun-welcome-${Date.now()}`,
      });
      return {
        permission: result,
        granted: true,
        shown: testRes.ok,
        error: testRes.error,
      };
    }
    return {
      permission: result,
      granted: false,
      error:
        result === 'denied'
          ? 'Notifications blocked — allow alerts in browser site settings.'
          : 'Notification prompt dismissed.',
    };
  } catch (err) {
    return {
      permission: getDeviceNotificationPermission(),
      granted: false,
      error: err instanceof Error ? err.message : 'Could not request notifications.',
    };
  }
}
