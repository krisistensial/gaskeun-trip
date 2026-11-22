/**
 * Pure geometry, Original Passthrough & High-Res Canvas rendering engine
 * for the Universal Interactive Photo Cropper.
 */

export type CropPresetId =
  | 'home-hero'
  | 'plan-cover'
  | 'stay-cover'
  | 'train-photo'
  | 'avatar'
  | 'idea'
  | 'album';

export type AlbumAspectChoice = 'original' | '4:5' | '1:1' | '16:9';

export const ALBUM_MAX_DIM = 4096;
export const ALBUM_HIGH_QUALITY = 0.94;
export const ORIGINAL_PASSTHROUGH_MAX_BYTES = 12 * 1024 * 1024; // 12 MB safe ceiling for Apps Script

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
    quality: 0.86,
  },
  'plan-cover': {
    id: 'plan-cover',
    title: 'Crop Stop Photo',
    ratioLabel: '16:9',
    aspect: 16 / 9,
    outputW: 1200,
    outputH: 675,
    quality: 0.86,
  },
  'stay-cover': {
    id: 'stay-cover',
    title: 'Crop Stay Photo',
    ratioLabel: '16:9',
    aspect: 16 / 9,
    outputW: 1200,
    outputH: 675,
    quality: 0.86,
  },
  'train-photo': {
    id: 'train-photo',
    title: 'Crop Train Photo',
    ratioLabel: '4:3',
    aspect: 4 / 3,
    outputW: 960,
    outputH: 720,
    quality: 0.86,
  },
  avatar: {
    id: 'avatar',
    title: 'Crop Profile Photo',
    ratioLabel: '1:1',
    aspect: 1,
    outputW: 256,
    outputH: 256,
    quality: 0.86,
    circular: true,
  },
  idea: {
    id: 'idea',
    title: 'Crop Reference Cover',
    ratioLabel: '4:5',
    aspect: 4 / 5,
    outputW: 960,
    outputH: 1200,
    quality: 0.86,
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

/**
 * Returns true when an album upload can skip Canvas re-encoding completely and
 * pass through the untouched native image file (zero quality loss) safely under 12 MB.
 */
export function shouldUseOriginalPassthrough(params: {
  preset: CropPresetId;
  albumRatio: AlbumAspectChoice;
  zoom: number;
  panX: number;
  panY: number;
  rotationDeg: number;
  fileSizeBytes: number;
}): boolean {
  if (params.preset !== 'album') return false;
  if (params.albumRatio !== 'original') return false;
  if (Math.abs(params.zoom - 1) > 1e-4) return false;
  if (Math.abs(params.panX) >= 0.5 || Math.abs(params.panY) >= 0.5) return false;
  const normRot = ((params.rotationDeg % 360) + 360) % 360;
  if (normRot !== 0) return false;
  if (params.fileSizeBytes <= 0 || params.fileSizeBytes > ORIGINAL_PASSTHROUGH_MAX_BYTES) {
    return false;
  }
  return true;
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

  if (albumRatio === 'original') {
    const aspect = effW / effH;
    const scale = Math.min(1, ALBUM_MAX_DIM / Math.max(effW, effH));
    return {
      width: Math.max(1, Math.round(effW * scale)),
      height: Math.max(1, Math.round(effH * scale)),
      aspect,
      ratioLabel: 'Original',
      quality: ALBUM_HIGH_QUALITY,
      circular: false,
    };
  }

  const aspectMap: Record<Exclude<AlbumAspectChoice, 'original'>, number> = {
    '4:5': 4 / 5,
    '1:1': 1,
    '16:9': 16 / 9,
  };
  const targetAspect = aspectMap[albumRatio];

  // Match the native resolution of the cropped region inside (effW, effH) without upscaling,
  // capping the longest edge at ALBUM_MAX_DIM (4096 px).
  let cropW: number;
  let cropH: number;
  if (effW / effH >= targetAspect) {
    cropH = effH;
    cropW = effH * targetAspect;
  } else {
    cropW = effW;
    cropH = effW / targetAspect;
  }
  const scale = Math.min(1, ALBUM_MAX_DIM / Math.max(cropW, cropH));

  return {
    width: Math.max(1, Math.round(cropW * scale)),
    height: Math.max(1, Math.round(cropH * scale)),
    aspect: targetAspect,
    ratioLabel: albumRatio,
    quality: ALBUM_HIGH_QUALITY,
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
  mimeType?: string;
  isOriginalPassthrough?: boolean;
}

/**
 * Reads an original image File directly as a Data URL + base64 without Canvas
 * re-encoding so native camera resolution & sharpness stay 100% intact.
 */
export async function readOriginalImageFile(
  file: File,
  width: number,
  height: number,
): Promise<CroppedImageResult> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Could not read original image'));
    };
    reader.onerror = () => reject(new Error('Could not read original image'));
    reader.readAsDataURL(file);
  });
  const base64 = dataUrl.split(',')[1] ?? '';
  return {
    blob: file,
    dataUrl,
    base64,
    width,
    height,
    mimeType: file.type || 'image/jpeg',
    isOriginalPassthrough: true,
  };
}

/**
 * Renders the exact user-cropped region into an offscreen Canvas with high-quality
 * resampling and exports JPEG blob + dataUrl + base64.
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

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

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

  return {
    blob,
    dataUrl,
    base64,
    width: outputW,
    height: outputH,
    mimeType: 'image/jpeg',
    isOriginalPassthrough: false,
  };
}
