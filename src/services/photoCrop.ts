/**
 * Pure geometry & Canvas rendering engine for the Universal Interactive Photo Cropper.
 */

export type CropPresetId =
  | 'home-hero'
  | 'plan-cover'
  | 'stay-cover'
  | 'train-photo'
  | 'avatar'
  | 'album';

export type AlbumAspectChoice = 'original' | '4:5' | '1:1' | '16:9';

export interface CropPresetSpec {
  id: CropPresetId;
  title: string;
  ratioLabel: string;
  aspect: number; // width / height
  outputW: number;
  outputH: number;
  quality: number;
  circular?: boolean;
}

export const CROP_PRESETS: Record<Exclude<CropPresetId, 'album'>, CropPresetSpec> = {
  'home-hero': {
    id: 'home-hero',
    title: 'Crop Cover Photo',
    ratioLabel: '9:10',
    aspect: 9 / 10,
    outputW: 1080,
    outputH: 1200,
    quality: 0.82,
  },
  'plan-cover': {
    id: 'plan-cover',
    title: 'Crop Stop Photo',
    ratioLabel: '16:9',
    aspect: 16 / 9,
    outputW: 1200,
    outputH: 675,
    quality: 0.8,
  },
  'stay-cover': {
    id: 'stay-cover',
    title: 'Crop Stay Photo',
    ratioLabel: '16:9',
    aspect: 16 / 9,
    outputW: 1200,
    outputH: 675,
    quality: 0.8,
  },
  'train-photo': {
    id: 'train-photo',
    title: 'Crop Train Photo',
    ratioLabel: '4:3',
    aspect: 4 / 3,
    outputW: 960,
    outputH: 720,
    quality: 0.8,
  },
  avatar: {
    id: 'avatar',
    title: 'Crop Profile Photo',
    ratioLabel: '1:1',
    aspect: 1,
    outputW: 256,
    outputH: 256,
    quality: 0.82,
    circular: true,
  },
};

export interface OutputDimensions {
  width: number;
  height: number;
  aspect: number;
  ratioLabel: string;
  quality: number;
  circular: boolean;
}

export function getRotatedDimensions(
  imgW: number,
  imgH: number,
  rotationDeg: number,
): { effW: number; effH: number } {
  const norm = ((rotationDeg % 360) + 360) % 360;
  if (norm === 90 || norm === 270) {
    return { effW: imgH, effH: imgW };
  }
  return { effW: imgW, effH: imgH };
}

export function getCropOutputDimensions(
  preset: CropPresetId,
  albumRatio: AlbumAspectChoice,
  imgW: number,
  imgH: number,
  rotationDeg = 0,
): OutputDimensions {
  if (preset !== 'album') {
    const spec = CROP_PRESETS[preset];
    return {
      width: spec.outputW,
      height: spec.outputH,
      aspect: spec.aspect,
      ratioLabel: spec.ratioLabel,
      quality: spec.quality,
      circular: Boolean(spec.circular),
    };
  }

  const { effW, effH } = getRotatedDimensions(Math.max(1, imgW), Math.max(1, imgH), rotationDeg);
  const maxDim = 1600;

  if (albumRatio === 'original') {
    const aspect = effW / effH;
    const scale = Math.min(1, maxDim / Math.max(effW, effH));
    return {
      width: Math.max(1, Math.round(effW * scale)),
      height: Math.max(1, Math.round(effH * scale)),
      aspect,
      ratioLabel: 'Original',
      quality: 0.82,
      circular: false,
    };
  }

  const ratioMap: Record<Exclude<AlbumAspectChoice, 'original'>, { aspect: number; w: number; h: number }> = {
    '4:5': { aspect: 4 / 5, w: 1280, h: 1600 },
    '1:1': { aspect: 1, w: 1400, h: 1400 },
    '16:9': { aspect: 16 / 9, w: 1600, h: 900 },
  };
  const chosen = ratioMap[albumRatio];
  return {
    width: chosen.w,
    height: chosen.h,
    aspect: chosen.aspect,
    ratioLabel: albumRatio,
    quality: 0.82,
    circular: false,
  };
}

export interface PanBounds {
  maxOffsetX: number;
  maxOffsetY: number;
  baseScale: number;
  displayScale: number;
}

/**
 * Computes pan limits so the zoomed image always covers 100% of the crop frame
 * with zero blank edges.
 */
export function computePanBounds(
  imgW: number,
  imgH: number,
  rotationDeg: number,
  frameW: number,
  frameH: number,
  zoom: number,
): PanBounds {
  const { effW, effH } = getRotatedDimensions(Math.max(1, imgW), Math.max(1, imgH), rotationDeg);
  const baseScale = Math.max(frameW / effW, frameH / effH);
  const safeZoom = Math.max(1, Math.min(3, zoom));
  const displayScale = baseScale * safeZoom;
  const maxOffsetX = Math.max(0, (effW * displayScale - frameW) / 2);
  const maxOffsetY = Math.max(0, (effH * displayScale - frameH) / 2);
  return { maxOffsetX, maxOffsetY, baseScale, displayScale };
}

export function clampPanOffset(
  offsetX: number,
  offsetY: number,
  bounds: PanBounds,
): { x: number; y: number } {
  return {
    x: Math.max(-bounds.maxOffsetX, Math.min(bounds.maxOffsetX, offsetX)),
    y: Math.max(-bounds.maxOffsetY, Math.min(bounds.maxOffsetY, offsetY)),
  };
}

export interface CroppedImageResult {
  blob: Blob;
  dataUrl: string;
  base64: string;
  width: number;
  height: number;
}

/**
 * Renders the exact user-cropped region into an offscreen Canvas and exports
 * JPEG blob + dataUrl + base64.
 */
export async function renderCroppedImage(params: {
  image: HTMLImageElement;
  rotationDeg: number;
  frameW: number;
  frameH: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
  outputW: number;
  outputH: number;
  quality: number;
}): Promise<CroppedImageResult> {
  const {
    image,
    rotationDeg,
    frameW,
    frameH,
    zoom,
    offsetX,
    offsetY,
    outputW,
    outputH,
    quality,
  } = params;

  const bounds = computePanBounds(
    image.naturalWidth,
    image.naturalHeight,
    rotationDeg,
    frameW,
    frameH,
    zoom,
  );
  const clamped = clampPanOffset(offsetX, offsetY, bounds);

  const canvas = document.createElement('canvas');
  canvas.width = outputW;
  canvas.height = outputH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  const ratioX = outputW / frameW;
  const ratioY = outputH / frameH;
  const outScale = bounds.displayScale * Math.max(ratioX, ratioY);

  ctx.fillStyle = '#F6F8F5';
  ctx.fillRect(0, 0, outputW, outputH);

  ctx.save();
  ctx.translate(outputW / 2 + clamped.x * ratioX, outputH / 2 + clamped.y * ratioY);
  ctx.rotate((rotationDeg * Math.PI) / 180);
  ctx.scale(outScale, outScale);
  ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  ctx.restore();

  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Image export failed'))),
      'image/jpeg',
      quality,
    );
  });
  const base64 = dataUrl.split(',')[1] ?? '';

  return { blob, dataUrl, base64, width: outputW, height: outputH };
}
