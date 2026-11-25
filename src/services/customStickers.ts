export const CUSTOM_STICKERS_STORAGE_KEY = 'gaskeun_custom_stickers_v1';
export const MAX_CUSTOM_STICKERS = 24;
export const MAX_CUSTOM_STICKER_CAPTION = 22;

export type CustomStickerThemeId = 'matcha' | 'amber' | 'coral' | 'cream' | 'ink';

export interface CustomStickerTheme {
  id: CustomStickerThemeId;
  label: string;
  fill: string;
  textColor: string;
  border: string;
}

export const CUSTOM_STICKER_THEMES: readonly CustomStickerTheme[] = [
  { id: 'matcha', label: 'Matcha', fill: '#4A7468', textColor: '#FFFFFF', border: '#FFFFFF' },
  { id: 'amber', label: 'Amber', fill: '#F59E0B', textColor: '#1F332D', border: '#FFFFFF' },
  { id: 'coral', label: 'Coral', fill: '#E25B4B', textColor: '#FFFFFF', border: '#FFFFFF' },
  { id: 'cream', label: 'Cream', fill: '#FFFFFF', textColor: '#1F332D', border: '#E3EDE6' },
  { id: 'ink', label: 'Night', fill: '#1F332D', textColor: '#FFFFFF', border: '#FFFFFF' },
];

export const CUSTOM_STICKER_EMOJIS = [
  '🗿', '🛵', '🔥', '😂', '❤️', '🫶', '🍜', '☕',
  '📸', '🎉', '😎', '😭', '👀', '✨', '💯', '💀',
] as const;

export interface SavedCustomSticker {
  id: string;
  caption: string;
  emoji: string;
  themeId: CustomStickerThemeId;
  dataUrl: string;
  createdAt: string;
}

export function sanitizeStickerCaption(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_CUSTOM_STICKER_CAPTION);
}

export function loadCustomStickers(): SavedCustomSticker[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(CUSTOM_STICKERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is SavedCustomSticker =>
            Boolean(item?.id && typeof item.dataUrl === 'string' && item.dataUrl.startsWith('data:image/')),
        )
      : [];
  } catch {
    return [];
  }
}

export function saveCustomSticker(sticker: SavedCustomSticker): SavedCustomSticker[] {
  const existing = loadCustomStickers().filter((s) => s.id !== sticker.id);
  const next = [sticker, ...existing].slice(0, MAX_CUSTOM_STICKERS);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CUSTOM_STICKERS_STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    // ignore storage quota errors
  }
  return next;
}

export function deleteCustomSticker(id: string): SavedCustomSticker[] {
  const next = loadCustomStickers().filter((s) => s.id !== id);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CUSTOM_STICKERS_STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    // ignore storage quota errors
  }
  return next;
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Generates a pure transparent-background die-cut PNG/WebP sticker from text + emoji
 * without touching any camera or photo gallery files.
 */
export function renderCustomTransparentSticker(params: {
  emoji: string;
  caption: string;
  themeId: CustomStickerThemeId;
}): string | null {
  if (typeof document === 'undefined') return null;

  const caption = sanitizeStickerCaption(params.caption);
  const emoji = params.emoji || '✨';
  const theme =
    CUSTOM_STICKER_THEMES.find((t) => t.id === params.themeId) ??
    CUSTOM_STICKER_THEMES[0];

  const width = 320;
  const height = 220;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, width, height);

  // Subtle tilt for authentic die-cut sticker feel (still transparent around perimeter)
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate((-2.2 * Math.PI) / 180);
  ctx.translate(-width / 2, -height / 2);

  // Top expressive emoji with white die-cut stroke
  const emojiY = caption ? 88 : 114;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '82px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 14;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.96)';
  ctx.strokeText(emoji, width / 2, emojiY);
  ctx.fillText(emoji, width / 2, emojiY);

  if (caption) {
    ctx.font = '800 28px "Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif';
    const textMetrics = ctx.measureText(caption);
    const pillW = Math.min(width - 28, Math.max(116, Math.ceil(textMetrics.width) + 42));
    const pillH = 54;
    const pillX = (width - pillW) / 2;
    const pillY = 134;

    // Outer white die-cut border
    ctx.save();
    ctx.shadowColor = 'rgba(20, 35, 29, 0.22)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    drawRoundedRectPath(ctx, pillX - 5, pillY - 5, pillW + 10, pillH + 10, 29);
    ctx.fillStyle = theme.border;
    ctx.fill();
    ctx.restore();

    // Inner colored label fill
    drawRoundedRectPath(ctx, pillX, pillY, pillW, pillH, 25);
    ctx.fillStyle = theme.fill;
    ctx.fill();

    // Caption text
    ctx.fillStyle = theme.textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(caption, width / 2, pillY + pillH / 2 + 1, pillW - 24);
  }

  ctx.restore();

  let dataUrl = canvas.toDataURL('image/webp', 0.9);
  if (!dataUrl.startsWith('data:image/webp')) {
    dataUrl = canvas.toDataURL('image/png');
  }
  return dataUrl;
}
