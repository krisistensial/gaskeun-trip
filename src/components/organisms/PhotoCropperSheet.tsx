import { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';
import { Badge, Button, LiquidBottomSheet } from '../atoms';
import {
  CROP_PRESETS,
  clampPanOffset,
  computePanBounds,
  getCropOutputDimensions,
  renderCroppedImage,
  type AlbumAspectChoice,
  type CropPresetId,
  type CroppedImageResult,
} from '../../services/photoCrop';
import './sheets.css';

export interface PhotoCropperSheetProps {
  open: boolean;
  file: File | null;
  preset: CropPresetId;
  onConfirm: (result: CroppedImageResult) => void;
  onCancel: () => void;
}

const ALBUM_RATIOS: { id: AlbumAspectChoice; label: string }[] = [
  { id: 'original', label: 'Original' },
  { id: '4:5', label: '4:5' },
  { id: '1:1', label: '1:1' },
  { id: '16:9', label: '16:9' },
];

function computeFrameSize(aspect: number): { frameW: number; frameH: number } {
  const maxW = 320;
  const maxH = 296;
  let frameW = maxW;
  let frameH = frameW / aspect;
  if (frameH > maxH) {
    frameH = maxH;
    frameW = frameH * aspect;
  }
  return {
    frameW: Math.max(140, Math.round(frameW)),
    frameH: Math.max(140, Math.round(frameH)),
  };
}

export function PhotoCropperSheet({
  open,
  file,
  preset,
  onConfirm,
  onCancel,
}: PhotoCropperSheetProps) {
  const [objectUrl, setObjectUrl] = useState<string>('');
  const [imgSize, setImgSize] = useState<{ w: number; h: number }>({ w: 1200, h: 900 });
  const [albumRatio, setAlbumRatio] = useState<AlbumAspectChoice>('original');
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [applying, setApplying] = useState<boolean>(false);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{
    active: boolean;
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  }>({
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  });
  const pinchRef = useRef<{ active: boolean; startDist: number; startZoom: number }>({
    active: false,
    startDist: 0,
    startZoom: 1,
  });

  // Load object URL for selected File & reset crop state cleanly
  useEffect(() => {
    if (!open || !file) {
      setObjectUrl('');
      return;
    }
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
    setAlbumRatio('original');
    setApplying(false);
    return () => URL.revokeObjectURL(url);
  }, [open, file]);

  const dims = useMemo(
    () => getCropOutputDimensions(preset, albumRatio, imgSize.w, imgSize.h, rotation),
    [preset, albumRatio, imgSize.w, imgSize.h, rotation],
  );

  const { frameW, frameH } = useMemo(() => computeFrameSize(dims.aspect), [dims.aspect]);

  const bounds = useMemo(
    () => computePanBounds(imgSize.w, imgSize.h, rotation, frameW, frameH, zoom),
    [imgSize.w, imgSize.h, rotation, frameW, frameH, zoom],
  );

  // Re-clamp pan offset whenever zoom, rotation, or aspect changes
  useEffect(() => {
    setOffset((prev) => clampPanOffset(prev.x, prev.y, bounds));
  }, [bounds]);

  if (!open || !file) return null;

  const title = preset === 'album' ? 'Crop Album Photo' : CROP_PRESETS[preset].title;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pinchRef.current.active) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: offset.x,
      originY: offset.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active || dragRef.current.pointerId !== e.pointerId || pinchRef.current.active) {
      return;
    }
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(clampPanOffset(dragRef.current.originX + dx, dragRef.current.originY + dy, bounds));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current.pointerId === e.pointerId) {
      dragRef.current.active = false;
    }
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      dragRef.current.active = false;
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      pinchRef.current = { active: true, startDist: Math.max(10, dist), startZoom: zoom };
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && pinchRef.current.active) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      const nextZoom = Math.max(
        1,
        Math.min(3, pinchRef.current.startZoom * (dist / pinchRef.current.startDist)),
      );
      setZoom(Number(nextZoom.toFixed(2)));
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2) {
      pinchRef.current.active = false;
    }
  };

  const handleApply = async () => {
    if (!imgRef.current || applying) return;
    setApplying(true);
    try {
      const result = await renderCroppedImage({
        image: imgRef.current,
        rotationDeg: rotation,
        frameW,
        frameH,
        zoom,
        offsetX: offset.x,
        offsetY: offset.y,
        outputW: dims.width,
        outputH: dims.height,
        quality: dims.quality,
      });
      onConfirm(result);
    } finally {
      setApplying(false);
    }
  };

  return (
    <LiquidBottomSheet open={open} title={title} onClose={onCancel}>
      <div className="cropper-wrap">
        {/* Dimension Info Badge */}
        <div className="cropper-meta-row">
          <Badge tone="matcha">
            {dims.ratioLabel} · {dims.width} × {dims.height} px
          </Badge>
          <span className="cropper-zoom-tag">{zoom.toFixed(1)}×</span>
        </div>

        {/* Album Aspect Ratio Switcher */}
        {preset === 'album' && (
          <div className="cropper-ratio-row" role="tablist" aria-label="Album aspect ratio">
            {ALBUM_RATIOS.map((r) => (
              <button
                key={r.id}
                type="button"
                role="tab"
                aria-selected={albumRatio === r.id}
                className={`plan-chip tactile ${albumRatio === r.id ? 'plan-chip--active' : ''}`}
                onClick={() => {
                  setAlbumRatio(r.id);
                  setOffset({ x: 0, y: 0 });
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}

        {/* Interactive Crop Stage */}
        <div className="cropper-stage-outer">
          <div
            className="cropper-frame"
            style={{ width: frameW, height: frameH }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {objectUrl && (
              <img
                ref={imgRef}
                src={objectUrl}
                alt="Crop preview"
                draggable={false}
                className="cropper-img"
                onLoad={(e) => {
                  const el = e.currentTarget;
                  setImgSize({
                    w: el.naturalWidth || 1200,
                    h: el.naturalHeight || 900,
                  });
                }}
                style={{
                  width: imgSize.w,
                  height: imgSize.h,
                  transform: `translate(-50%, -50%) translate3d(${offset.x}px, ${offset.y}px, 0) rotate(${rotation}deg) scale(${bounds.displayScale})`,
                }}
              />
            )}

            {/* Overlay Guides */}
            {dims.circular ? (
              <div className="cropper-circle-mask" aria-hidden="true" />
            ) : (
              <div className="cropper-grid-overlay" aria-hidden="true">
                <span className="cropper-grid-v1" />
                <span className="cropper-grid-v2" />
                <span className="cropper-grid-h1" />
                <span className="cropper-grid-h2" />
              </div>
            )}
          </div>
        </div>

        <p className="cropper-hint">Drag to reposition · Pinch or slide to zoom</p>

        {/* Zoom Slider */}
        <div className="cropper-slider-row">
          <ZoomOut size={16} strokeWidth={1.8} color="var(--text-muted)" />
          <input
            aria-label="Zoom level"
            type="range"
            min={1}
            max={3}
            step={0.02}
            value={zoom}
            className="cropper-range"
            onChange={(e) => setZoom(Number(e.target.value))}
          />
          <ZoomIn size={16} strokeWidth={1.8} color="var(--brand-matcha)" />
        </div>

        {/* Rotate & Reset Controls */}
        <div className="cropper-tools-row">
          <Button
            variant="glass"
            size="sm"
            leftIcon={<RotateCw size={14} strokeWidth={2} />}
            onClick={() => {
              setRotation((r) => (r + 90) % 360);
              setOffset({ x: 0, y: 0 });
            }}
          >
            Rotate 90°
          </Button>
          <Button
            variant="glass"
            size="sm"
            leftIcon={<RotateCcw size={14} strokeWidth={2} />}
            onClick={() => {
              setZoom(1);
              setRotation(0);
              setOffset({ x: 0, y: 0 });
            }}
          >
            Reset
          </Button>
        </div>

        {/* Actions */}
        <div className="gk-dialog__actions" style={{ marginTop: 4 }}>
          <Button variant="glass" size="lg" onClick={onCancel} disabled={applying}>
            Cancel
          </Button>
          <Button variant="matcha" size="lg" onClick={() => void handleApply()} disabled={applying}>
            {applying ? 'Applying...' : 'Apply Crop'}
          </Button>
        </div>
      </div>
    </LiquidBottomSheet>
  );
}
