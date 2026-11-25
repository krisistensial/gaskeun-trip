import { isSafeStickerUrl } from './chat';

export interface ExternalStickerResult {
  id: string;
  url: string;
  caption: string;
  source: 'giphy' | 'tenor' | 'wikimedia';
}

/**
 * Searches free transparent PNG/WebP sticker catalogs:
 * - Uses GIPHY Stickers API if `VITE_GIPHY_API_KEY` is configured
 * - Uses Tenor Stickers API if `VITE_TENOR_API_KEY` is configured
 * - Otherwise queries Wikimedia Commons free keyless CORS API for transparent PNG stickers
 */
export async function searchExternalTransparentStickers(
  rawQuery: string,
  signal?: AbortSignal,
): Promise<ExternalStickerResult[]> {
  const query = rawQuery.trim();
  if (query.length < 2) return [];
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return [];

  const giphyKey = (import.meta.env.VITE_GIPHY_API_KEY as string | undefined)?.trim();
  const tenorKey = (import.meta.env.VITE_TENOR_API_KEY as string | undefined)?.trim();

  if (giphyKey) {
    try {
      const endpoint = `https://api.giphy.com/v1/stickers/search?api_key=${encodeURIComponent(
        giphyKey,
      )}&q=${encodeURIComponent(query)}&limit=16&rating=pg`;
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
              caption: (item.title || query).slice(0, 40),
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

  if (tenorKey) {
    try {
      const endpoint = `https://tenor.googleapis.com/v2/search?key=${encodeURIComponent(
        tenorKey,
      )}&q=${encodeURIComponent(query)}&searchfilter=sticker&media_filter=webp_transparent,png_transparent&limit=16`;
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
              caption: (item.content_description || query).slice(0, 40),
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

  // Zero-key free public fallback: Wikimedia Commons transparent PNG sticker/emoji art
  try {
    const endpoint = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(
      `${query} sticker OR emoji filetype:png`,
    )}&gsrlimit=12&prop=imageinfo&iiprop=url|mime&iiurlwidth=240&format=json&origin=*`;
    const res = await fetch(endpoint, { signal });
    if (!res.ok) return [];
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
    const pages = Object.values(json.query?.pages ?? {});
    const out: ExternalStickerResult[] = [];
    for (const p of pages) {
      const info = p.imageinfo?.[0];
      const url = info?.thumburl || info?.url;
      const mime = info?.mime ?? '';
      if (
        url &&
        isSafeStickerUrl(url) &&
        (mime.includes('png') || mime.includes('webp'))
      ) {
        out.push({
          id: `wm-${p.pageid}`,
          url,
          caption: (p.title ?? query).replace(/^File:/i, '').replace(/\.[^.]+$/, '').slice(0, 36),
          source: 'wikimedia',
        });
      }
    }
    return out;
  } catch {
    return [];
  }
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
