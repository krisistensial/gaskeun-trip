import { createClient } from '@supabase/supabase-js';
import * as webpushModule from 'web-push';

const webpush =
  (webpushModule as unknown as { default?: typeof webpushModule }).default ??
  webpushModule;

interface ApiRequest {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
}

interface ApiResponse {
  setHeader(name: string, value: string): void;
  status(code: number): ApiResponse;
  json(body: unknown): void;
  end(): void;
}

interface PushSubscriptionRow {
  endpoint: string;
  trip_code: string;
  member_id: string;
  p256dh: string;
  auth: string;
}

interface PushRequestBody {
  tripCode?: string;
  senderId?: string;
  title?: string;
  body?: string;
  tag?: string;
  renotify?: boolean;
  openChat?: boolean;
  url?: string;
  forceShow?: boolean;
}

function setCors(res: ApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

function getPushEnv() {
  const publicKey = (
    process.env.VAPID_PUBLIC_KEY ||
    process.env.VITE_VAPID_PUBLIC_KEY ||
    ''
  ).trim();
  const privateKey = (process.env.VAPID_PRIVATE_KEY || '').trim();
  const subject = (process.env.VAPID_SUBJECT || 'mailto:noreply@gaskeun.app').trim();
  const supabaseUrl = (
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    ''
  )
    .trim()
    .replace(/\/+$/, '');
  const supabaseKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ''
  ).trim();

  return { publicKey, privateKey, subject, supabaseUrl, supabaseKey };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    setCors(res);

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    const env = getPushEnv();
    const missing: string[] = [];
    if (!env.publicKey) missing.push('VAPID_PUBLIC_KEY');
    if (!env.privateKey) missing.push('VAPID_PRIVATE_KEY');
    if (!env.supabaseUrl) missing.push('VITE_SUPABASE_URL');
    if (!env.supabaseKey) missing.push('VITE_SUPABASE_ANON_KEY');
    const isConfigured = missing.length === 0;

    if (req.method === 'GET') {
      res.status(200).json({
        ok: true,
        configured: isConfigured,
        publicKey: env.publicKey || null,
        ...(missing.length > 0 ? { missing } : {}),
      });
      return;
    }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  if (!isConfigured) {
    res.status(503).json({
      ok: false,
      configured: false,
      error: 'Web Push VAPID environment variables are not configured on the server.',
    });
    return;
  }

  let payload: PushRequestBody = {};
  if (typeof req.body === 'string') {
    try {
      payload = JSON.parse(req.body) as PushRequestBody;
    } catch {
      res.status(400).json({ ok: false, error: 'Invalid JSON body' });
      return;
    }
  } else if (req.body && typeof req.body === 'object') {
    payload = req.body as PushRequestBody;
  }

  const tripCode = String(payload.tripCode || '').trim().toUpperCase();
  const senderId = String(payload.senderId || '').trim();
  const title = String(payload.title || 'GASKEUN!').trim().slice(0, 120);
  const body = String(payload.body || '').trim().slice(0, 240);

  if (tripCode.length < 3 || !body) {
    res.status(400).json({ ok: false, error: 'Missing tripCode or notification body' });
    return;
  }

  webpush.setVapidDetails(env.subject, env.publicKey, env.privateKey);
  const supabase = createClient(env.supabaseUrl, env.supabaseKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from('trip_push_subscriptions')
    .select('endpoint, trip_code, member_id, p256dh, auth')
    .eq('trip_code', tripCode);

  if (error) {
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to load push subscriptions',
    });
    return;
  }

  const rows = ((data as PushSubscriptionRow[] | null) ?? []).filter((row) => {
    if (!row.endpoint || !row.p256dh || !row.auth) return false;
    if (senderId && row.member_id === senderId && !payload.forceShow) return false;
    return true;
  });

  if (rows.length === 0) {
    res.status(200).json({ ok: true, sent: 0, expired: 0 });
    return;
  }

  const notificationJson = JSON.stringify({
    title,
    body,
    tag: payload.tag || `gaskeun-${tripCode}`,
    renotify: Boolean(payload.renotify),
    openChat: Boolean(payload.openChat),
    url: payload.url || (payload.openChat ? '/?open=chat' : '/'),
    forceShow: Boolean(payload.forceShow),
  });

  const expiredEndpoints: string[] = [];
  let sent = 0;

  await Promise.allSettled(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: {
              p256dh: row.p256dh,
              auth: row.auth,
            },
          },
          notificationJson,
          {
            TTL: 86_400,
            urgency: 'high',
          },
        );
        sent += 1;
      } catch (err: unknown) {
        const statusCode =
          typeof err === 'object' && err !== null && 'statusCode' in err
            ? Number((err as { statusCode?: number }).statusCode)
            : 0;
        if (statusCode === 404 || statusCode === 410) {
          expiredEndpoints.push(row.endpoint);
        }
      }
    }),
  );

  if (expiredEndpoints.length > 0) {
    await supabase
      .from('trip_push_subscriptions')
      .delete()
      .in('endpoint', expiredEndpoints);
  }

  res.status(200).json({
    ok: true,
    sent,
    totalTargets: rows.length,
    expired: expiredEndpoints.length,
  });
  } catch (err: unknown) {
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Unexpected push server error',
    });
  }
}
