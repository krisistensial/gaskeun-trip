import { CREW_STICKER_PACK, isSafeStickerUrl } from './chat';

export interface ExternalStickerResult {
  id: string;
  url: string;
  fallbackUrl?: string;
  emojiFallback?: string;
  caption: string;
  source: 'giphy' | 'tenor' | 'noto' | 'wikimedia';
}

interface NotoApiIcon {
  codepoint: string;
  popularity?: number;
  categories?: string[];
  tags?: string[];
}

const NOTO_ANIMATED_API_URL =
  'https://googlefonts.github.io/noto-emoji-animation/data/api.json';

let cachedNotoCatalog: NotoApiIcon[] | null = null;
let inflightNotoFetch: Promise<NotoApiIcon[]> | null = null;

/**
 * Bilingual (Indonesian + English) keyword expansion so natural queries like
 * "keren", "ngakak", "lapar", "kopi", "motor" always find matching animated stickers.
 */
const QUERY_SYNONYMS: Record<string, readonly string[]> = {
  keren: ['cool', 'sunglasses', 'fire', 'star', 'sparkles', 'thumbs', '100', 'clap'],
  mantap: ['thumbs', '100', 'ok', 'fire', 'clap', 'star', 'smile'],
  gas: ['fire', 'rocket', 'car', 'dash', 'thumbs', 'party'],
  gaskeun: ['scooter', 'fire', 'rocket', 'car', 'party', 'thumbs'],
  otw: ['dash', 'car', 'train', 'run', 'airplane', 'bus'],
  ngakak: ['laugh', 'joy', 'rofl', 'grin', 'smile', 'tears'],
  lucu: ['laugh', 'joy', 'cat', 'puppy', 'smile', 'grin', 'wink'],
  wkwk: ['laugh', 'joy', 'rofl', 'grin'],
  sedih: ['sad', 'cry', 'sob', 'pleading', 'broken', 'hug'],
  nangis: ['cry', 'sob', 'sad', 'tear'],
  cinta: ['heart', 'love', 'kiss', 'hug', 'smiling-hearts'],
  sayang: ['heart', 'love', 'hug', 'kiss'],
  lapar: ['food', 'noodle', 'pizza', 'burger', 'ramen', 'eat', 'hungry'],
  makan: ['food', 'noodle', 'pizza', 'burger', 'cake', 'dining'],
  kopi: ['coffee', 'cup', 'beverage', 'hot'],
  ngopi: ['coffee', 'cup', 'tea', 'boba'],
  minum: ['coffee', 'cup', 'boba', 'cheers', 'drink'],
  tidur: ['sleep', 'sleeping', 'yawn', 'night'],
  ngantuk: ['sleep', 'sleeping', 'tired', 'yawn'],
  hujan: ['rain', 'cloud', 'umbrella', 'lightning'],
  kaget: ['exploding', 'scream', 'shocked', 'open-mouth', 'flushed'],
  makasih: ['folded-hands', 'pray', 'heart', 'hug', 'clap'],
  terimakasih: ['folded-hands', 'pray', 'heart', 'hug'],
  selamat: ['party', 'confetti', 'clap', 'sparkles', 'tada'],
  semangat: ['muscle', 'fire', 'sparkles', 'clap', '100'],
  kucing: ['cat', 'kitty', 'meow'],
  motor: ['scooter', 'motorcycle', 'bike', 'car'],
  kereta: ['train', 'locomotive', 'railway'],
  mobil: ['car', 'taxi', 'automobile'],
  foto: ['camera', 'flash', 'sparkles', 'star'],
  santai: ['sunglasses', 'coffee', 'relieved', 'wave'],
  halo: ['wave', 'hand', 'smile'],
};

export function expandStickerSearchTerms(rawQuery: string): string[] {
  const clean = rawQuery.trim().toLowerCase();
  if (!clean) return [];
  const words = clean.split(/\s+/).filter(Boolean);
  const terms = new Set<string>([clean, ...words]);
  for (const w of words) {
    const mapped = QUERY_SYNONYMS[w];
    if (mapped) {
      for (const alias of mapped) terms.add(alias);
    }
  }
  return Array.from(terms);
}

function codepointToEmoji(cp: string): string {
  try {
    const parts = cp
      .split('_')
      .map((hex) => Number.parseInt(hex, 16))
      .filter((n) => Number.isFinite(n));
    return parts.length > 0 ? String.fromCodePoint(...parts) : '✨';
  } catch {
    return '✨';
  }
}

function formatNotoCaption(tags?: string[]): string {
  const first = tags?.[0] ?? 'Sticker';
  const cleaned = first.replace(/:/g, '').replace(/[-_]+/g, ' ').trim();
  if (!cleaned) return 'Sticker';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1, 24);
}

async function getNotoAnimatedCatalog(signal?: AbortSignal): Promise<NotoApiIcon[]> {
  if (cachedNotoCatalog) return cachedNotoCatalog;
  if (!inflightNotoFetch) {
    inflightNotoFetch = fetch(NOTO_ANIMATED_API_URL, { signal })
      .then(async (res) => {
        if (!res.ok) return [];
        const json = (await res.json()) as { icons?: NotoApiIcon[] };
        const icons = Array.isArray(json.icons) ? json.icons : [];
        cachedNotoCatalog = icons;
        return icons;
      })
      .catch(() => [])
      .finally(() => {
        inflightNotoFetch = null;
      });
  }
  return inflightNotoFetch;
}

/**
 * Searches transparent PNG/WebP sticker catalogs with instant bilingual matching:
 * 1. Optional GIPHY Stickers API (`VITE_GIPHY_API_KEY`)
 * 2. Optional Tenor Stickers API (`VITE_TENOR_API_KEY`)
 * 3. Live 881-item Google Noto Animated WebP Catalog (`api.json`, zero API key)
 * 4. Wikimedia Commons PNG search fallback
 */
export async function searchExternalTransparentStickers(
  rawQuery: string,
  signal?: AbortSignal,
): Promise<ExternalStickerResult[]> {
  const query = rawQuery.trim();
  if (query.length < 1) return [];
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return [];

  const terms = expandStickerSearchTerms(query);
  const primaryEnglishQuery = terms.find((t) => t !== query.toLowerCase()) ?? query;

  const giphyKey = (import.meta.env.VITE_GIPHY_API_KEY as string | undefined)?.trim();
  const tenorKey = (import.meta.env.VITE_TENOR_API_KEY as string | undefined)?.trim();

  if (giphyKey && query.length >= 2) {
    try {
      const endpoint = `https://api.giphy.com/v1/stickers/search?api_key=${encodeURIComponent(
        giphyKey,
      )}&q=${encodeURIComponent(primaryEnglishQuery)}&limit=16&rating=pg`;
      const res = await fetch(endpoint, { signal });
      if (res.ok) {
        const json = (await res.json()) as {
          data?: Array<{
            id: string;
            title?: string;
            images?: { fixed_width_small?: { webp?: string; url?: string } };
          }>;
        };
        const mapped: ExternalStickerResult[] = [];
        for (const item of json.data ?? []) {
          const url = item.images?.fixed_width_small?.webp || item.images?.fixed_width_small?.url;
          if (url && isSafeStickerUrl(url)) {
            mapped.push({
              id: `giphy-${item.id}`,
              url,
              caption: (item.title || query).slice(0, 32),
              source: 'giphy',
            });
          }
        }
        if (mapped.length > 0) return mapped;
      }
    } catch {
      // fall through cleanly
    }
  }

  if (tenorKey && query.length >= 2) {
    try {
      const endpoint = `https://tenor.googleapis.com/v2/search?key=${encodeURIComponent(
        tenorKey,
      )}&q=${encodeURIComponent(primaryEnglishQuery)}&searchfilter=sticker&media_filter=webp_transparent,png_transparent&limit=16`;
      const res = await fetch(endpoint, { signal });
      if (res.ok) {
        const json = (await res.json()) as {
          results?: Array<{
            id: string;
            content_description?: string;
            media_formats?: {
              webp_transparent?: { url?: string };
              png_transparent?: { url?: string };
            };
          }>;
        };
        const mapped: ExternalStickerResult[] = [];
        for (const item of json.results ?? []) {
          const url =
            item.media_formats?.webp_transparent?.url ||
            item.media_formats?.png_transparent?.url;
          if (url && isSafeStickerUrl(url)) {
            mapped.push({
              id: `tenor-${item.id}`,
              url,
              caption: (item.content_description || query).slice(0, 32),
              source: 'tenor',
            });
          }
        }
        if (mapped.length > 0) return mapped;
      }
    } catch {
      // fall through cleanly
    }
  }

  const builtInUrls = new Set(CREW_STICKER_PACK.map((s) => s.url));
  const results: ExternalStickerResult[] = [];
  const seenUrls = new Set<string>();

  // 3. Official 881-item Google Noto Animated WebP Transparent Stickers
  const notoCatalog = await getNotoAnimatedCatalog(signal);
  if (notoCatalog.length > 0) {
    for (const icon of notoCatalog) {
      const haystack = [
        ...(icon.tags ?? []),
        ...(icon.categories ?? []),
      ]
        .join(' ')
        .toLowerCase();
      if (!terms.some((term) => haystack.includes(term))) continue;

      const url = `https://fonts.gstatic.com/s/e/notoemoji/latest/${icon.codepoint}/512.webp`;
      if (builtInUrls.has(url) || seenUrls.has(url)) continue;
      seenUrls.add(url);

      const twemojiCp = icon.codepoint.replace(/_fe0f/g, '');
      results.push({
        id: `noto-${icon.codepoint}`,
        url,
        fallbackUrl: `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${twemojiCp}.png`,
        emojiFallback: codepointToEmoji(icon.codepoint),
        caption: formatNotoCaption(icon.tags),
        source: 'noto',
      });
      if (results.length >= 20) break;
    }
  }

  if (results.length >= 4 || query.length < 2) {
    return results;
  }

  // 4. Wikimedia Commons PNG clipart/sticker fallback (no unsupported filetype syntax)
  try {
    const endpoint = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(
      `${primaryEnglishQuery} sticker png`,
    )}&gsrlimit=10&prop=imageinfo&iiprop=url|mime&iiurlwidth=240&format=json&origin=*`;
    const res = await fetch(endpoint, { signal });
    if (res.ok) {
      const json = (await res.json()) as {
        query?: {
          pages?: Record<
            string,
            {
              pageid: number;
              title?: string;
              imageinfo?: Array<{ thumburl?: string; url?: string; mime?: string }>;
            }
          >;
        };
      };
      for (const p of Object.values(json.query?.pages ?? {})) {
        const info = p.imageinfo?.[0];
        const url = info?.thumburl || info?.url;
        const mime = info?.mime ?? '';
        if (
          url &&
          !seenUrls.has(url) &&
          isSafeStickerUrl(url) &&
          (mime.includes('png') || mime.includes('webp'))
        ) {
          seenUrls.add(url);
          results.push({
            id: `wm-${p.pageid}`,
            url,
            caption: (p.title ?? query).replace(/^File:/i, '').replace(/\.[^.]+$/, '').slice(0, 28),
            source: 'wikimedia',
          });
        }
      }
    }
  } catch {
    // ignore network errors cleanly
  }

  return results;
}

/**
 * Converts a keyboard-pasted sticker blob (`image/webp`, `image/png`, `image/gif`) into
 * a compact transparent WebP/PNG data URL (`<= 220px`) while rejecting normal camera JPEG photos.
 */
export async function processPastedStickerBlob(
  blob: Blob,
): Promise<{ ok: true; dataUrl: string } | { ok: false; reason: string }> {
  const mime = (blob.type || '').toLowerCase();
  if (mime === 'image/jpeg' || mime === 'image/jpg' || mime === 'image/heic') {
    return {
      ok: false,
      reason: 'Text & stickers only — please use Album for regular photos',
    };
  }
  if (!['image/webp', 'image/png', 'image/gif'].includes(mime)) {
    return {
      ok: false,
      reason: 'Unsupported paste format — only transparent stickers allowed',
    };
  }

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const maxSide = 220;
        const scale = Math.min(1, maxSide / Math.max(img.width || 1, img.height || 1));
        const width = Math.max(1, Math.round((img.width || 160) * scale));
        const height = Math.max(1, Math.round((img.height || 160) * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          resolve({ ok: false, reason: 'Could not process sticker' });
          return;
        }
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(objectUrl);

        let dataUrl = canvas.toDataURL('image/webp', 0.86);
        if (!dataUrl.startsWith('data:image/webp')) {
          dataUrl = canvas.toDataURL('image/png');
        }
        if (dataUrl.length > 140_000) {
          dataUrl = canvas.toDataURL('image/webp', 0.68);
        }
        if (dataUrl.length > 160_000) {
          resolve({ ok: false, reason: 'Sticker payload is too large' });
          return;
        }
        resolve({ ok: true, dataUrl });
      } catch {
        URL.revokeObjectURL(objectUrl);
        resolve({ ok: false, reason: 'Could not decode pasted sticker' });
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ ok: false, reason: 'Could not read pasted sticker' });
    };
    img.src = objectUrl;
  });
}
