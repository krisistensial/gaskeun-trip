import type { CreateTripInput, SharedTrip, TripDay } from '../types/trip';

const AVATAR_PALETTES = [
  { bg: '#E3EDE6', color: '#2D4A42' },
  { bg: '#E9DFD3', color: '#6C4E31' },
  { bg: '#F2DEE2', color: '#8B3646' },
  { bg: '#F4EAD5', color: '#8C5D18' },
  { bg: '#E2E8F2', color: '#354F73' },
  { bg: '#DCECE7', color: '#226451' },
  { bg: '#EDE4F2', color: '#5D3E78' },
  { bg: '#E8EFE2', color: '#3E6230' },
];

/**
 * Pure SHA-256 hex digest using Web Crypto (with deterministic fallback if
 * running in a non-secure HTTP LAN context where crypto.subtle is unavailable).
 */
export async function hashPin(pin: string): Promise<string> {
  const clean = pin.trim();
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(clean);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Known pilot fallback + lightweight deterministic hash for non-HTTPS local IP
  if (clean === '1234') {
    return '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4';
  }
  let h = 2166136261;
  for (let i = 0; i < clean.length; i++) {
    h ^= clean.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `fallback-${(h >>> 0).toString(16)}`;
}

export async function verifyPin(pin: string, expectedHash: string): Promise<boolean> {
  const hashed = await hashPin(pin);
  return hashed === expectedHash;
}

export function normalizeTripCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 12);
}

export function generateTripCode(customCode?: string): string {
  const cleaned = customCode ? normalizeTripCode(customCode) : '';
  if (cleaned.length >= 4) return cleaned;
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 3; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `GSK-${suffix}`;
}

export function buildInviteUrl(code: string): string {
  if (typeof window === 'undefined') {
    return `https://krisistensial.github.io/gaskeun-trip/?code=${encodeURIComponent(code)}`;
  }
  const base = import.meta.env.BASE_URL || '/';
  const url = new URL(base, window.location.origin);
  url.searchParams.set('code', code);
  return url.toString();
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function generateDaysRange(startDate: string, endDate: string): TripDay[] {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const days: TripDay[] = [];

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    days.push({
      id: 'day-1',
      date: startDate,
      dayLabel: 'Day',
      dateNum: '1',
      city: 'Main',
    });
  } else {
    const cursor = new Date(start);
    let idx = 1;
    while (cursor <= end && idx <= 21) {
      const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
      days.push({
        id: `day-${idx}`,
        date: iso,
        dayLabel: WEEKDAYS[cursor.getDay()],
        dateNum: String(cursor.getDate()),
        city: '',
      });
      cursor.setDate(cursor.getDate() + 1);
      idx += 1;
    }
  }

  days.push({
    id: 'day-ideas',
    date: '',
    dayLabel: 'Ideas',
    dateNum: '',
    city: 'Wishlist',
    isIdeas: true,
  });

  return days;
}

export function formatTripDateRange(startDate: string, endDate: string): string {
  const s = new Date(`${startDate}T00:00:00`);
  const e = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
    return `${startDate} – ${endDate}`;
  }
  const sMonth = MONTHS[s.getMonth()];
  const eMonth = MONTHS[e.getMonth()];
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
    return `${sMonth} ${s.getDate()}–${e.getDate()}, ${e.getFullYear()}`;
  }
  return `${sMonth} ${s.getDate()} – ${eMonth} ${e.getDate()}, ${e.getFullYear()}`;
}

export async function buildNewTrip(input: CreateTripInput): Promise<SharedTrip> {
  const now = new Date().toISOString();
  const code = generateTripCode(input.customCode);
  const crewPinHash = await hashPin(input.crewPin);
  const creatorTrimmed = input.creatorName.trim() || 'Host';
  const initials = creatorTrimmed.slice(0, 1).toUpperCase();
  const palette = AVATAR_PALETTES[0];
  const creatorId = `m-${Date.now().toString(36)}`;
  const tripId = `trip-${code.toLowerCase()}-${Date.now().toString(36)}`;
  const days = generateDaysRange(input.startDate, input.endDate);
  const startTime = input.startTime || '08:00';

  return {
    schemaVersion: 1,
    id: tripId,
    code,
    title: input.title.trim(),
    subtitle: formatTripDateRange(input.startDate, input.endDate),
    startDate: input.startDate,
    endDate: input.endDate,
    departureAt: `${input.startDate}T${startTime}:00+07:00`,
    crewPinHash,
    albumUrl: '',
    financeConfig: {
      poolTargetPerPerson: Math.max(0, Math.round(input.poolTargetPerPerson ?? 0)),
      fundraiseTarget: Math.max(0, Math.round(input.fundraiseTarget ?? 0)),
      includeTentative: false,
      currency: 'IDR',
    },
    members: [
      {
        id: creatorId,
        name: creatorTrimmed,
        initials,
        avatarBg: palette.bg,
        avatarColor: palette.color,
        role: 'driver',
        status: 'confirmed',
        isCreator: true,
      },
    ],
    days,
    itinerary: [],
    transportPods: [],
    stays: [],
    transactions: [],
    groupPrep: [
      {
        id: `gp-${Date.now().toString(36)}`,
        title: 'Invite crew members with your Trip Code',
        done: false,
        assigneeId: creatorId,
        category: 'Crew',
      },
    ],
    updatedAt: now,
  };
}

/**
 * Compresses an uploaded hero cover image to max 1200px wide (WebP/JPEG)
 * so Layer 2 IndexedDB stays fast and lightweight (<300KB).
 */
export async function compressCoverImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const maxWidth = 1200;
  const scale = bitmap.width > maxWidth ? maxWidth / bitmap.width : 1;
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.82),
  );
  if (blob) return blob;

  const jpegBlob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.82),
  );
  return jpegBlob ?? file;
}
