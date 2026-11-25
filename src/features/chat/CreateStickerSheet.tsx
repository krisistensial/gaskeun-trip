import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent,
} from 'react';
import { ImagePlus, Scissors, Sparkles, Upload } from 'lucide-react';
import { Button, LiquidBottomSheet } from '../../components/atoms';
import {
  CUSTOM_STICKER_EMOJIS,
  CUSTOM_STICKER_THEMES,
  renderCustomTransparentSticker,
  sanitizeStickerCaption,
  type CustomStickerThemeId,
  type SavedCustomSticker,
} from '../../services/customStickers';
import { triggerFeedback } from '../../services/feedback';
import './chat.css';

export type StickerStudioTab = 'photo' | 'emoji';
export type StickerCutShape = 'circle' | 'rounded' | 'square' | 'heart';
export type StickerTextPos = 'bottom' | 'top';

export interface CreateStickerSheetProps {
  open: boolean;
  onSaveAndSend: (sticker: SavedCustomSticker) => void;
  onClose: () => void;
}

const CUT_SHAPES: ReadonlyArray<{ id: StickerCutShape; label: string }> = [
  { id: 'rounded', label: 'Squircle' },
  { id: 'circle', label: 'Circle' },
  { id: 'heart', label: 'Heart' },
  { id: 'square', label: 'Square' },
];

function traceStickerShapePath(
  ctx: CanvasRenderingContext2D,
  shape: StickerCutShape,
  x: number,
  y: number,
  size: number,
) {
  ctx.beginPath();
  if (shape === 'circle') {
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    return;
  }
  if (shape === 'heart') {
    const cx = x + size / 2;
    const topY = y + size * 0.24;
    ctx.moveTo(cx, y + size * 0.92);
    ctx.bezierCurveTo(
      x - size * 0.04,
      y + size * 0.62,
      x + size * 0.04,
      y + size * 0.14,
      cx,
      topY + size * 0.14,
    );
    ctx.bezierCurveTo(
      x + size * 0.96,
      y + size * 0.14,
      x + size * 1.04,
      y + size * 0.62,
      cx,
      y + size * 0.92,
    );
    ctx.closePath();
    return;
  }

  const radius = shape === 'square' ? 16 : size * 0.24;
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + size - radius, y);
  ctx.quadraticCurveTo(x + size, y, x + size, y + radius);
  ctx.lineTo(x + size, y + size - radius);
  ctx.quadraticCurveTo(x + size, y + size, x + size - radius, y + size);
  ctx.lineTo(x + radius, y + size);
  ctx.quadraticCurveTo(x, y + size, x, y + size - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawPillRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

function renderPhotoStickerCanvas(params: {
  img: HTMLImageElement;
  zoom: number;
  panX: number;
  panY: number;
  shape: StickerCutShape;
  removeWhiteBg: boolean;
  caption: string;
  themeId: CustomStickerThemeId;
  outlineOnly: boolean;
  textPos: StickerTextPos;
}): string | null {
  const size = 280;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, size, size);

  const pad = 16;
  const shapeSize = size - pad * 2;

  // 1. Optional white die-cut sticker rim (skip outer rim if transparent BG removal is active)
  if (!params.removeWhiteBg) {
    ctx.save();
    ctx.shadowColor = 'rgba(20, 35, 29, 0.22)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    traceStickerShapePath(ctx, params.shape, pad - 5, pad - 5, shapeSize + 10);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.restore();
  }

  // 2. Clipped image layer (supports zoom, pan, and optional bright background keying)
  const photoCanvas = document.createElement('canvas');
  photoCanvas.width = size;
  photoCanvas.height = size;
  const pCtx = photoCanvas.getContext('2d');
  if (!pCtx) return null;

  pCtx.save();
  traceStickerShapePath(pCtx, params.shape, pad, pad, shapeSize);
  pCtx.clip();

  const imgW = params.img.naturalWidth || params.img.width || 1;
  const imgH = params.img.naturalHeight || params.img.height || 1;
  const baseScale = Math.max(shapeSize / imgW, shapeSize / imgH);
  const drawW = imgW * baseScale * params.zoom;
  const drawH = imgH * baseScale * params.zoom;
  const drawX = size / 2 - drawW / 2 + params.panX * shapeSize;
  const drawY = size / 2 - drawH / 2 + params.panY * shapeSize;

  pCtx.drawImage(params.img, drawX, drawY, drawW, drawH);
  pCtx.restore();

  if (params.removeWhiteBg) {
    try {
      const imgData = pCtx.getImageData(0, 0, size, size);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a === 0) continue;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const minC = Math.min(r, g, b);
        const maxC = Math.max(r, g, b);
        if (minC > 228 && maxC - minC < 26) {
          data[i + 3] = 0;
        } else if (minC > 205 && maxC - minC < 28) {
          data[i + 3] = Math.round(((228 - minC) / 23) * a);
        }
      }
      pCtx.putImageData(imgData, 0, 0);
    } catch {
      // ignore if canvas readback fails
    }
  }

  ctx.drawImage(photoCanvas, 0, 0);

  // 3. Custom Caption Overlay
  const cleanCaption = sanitizeStickerCaption(params.caption);
  if (cleanCaption) {
    const theme =
      CUSTOM_STICKER_THEMES.find((t) => t.id === params.themeId) ??
      CUSTOM_STICKER_THEMES[0];
    const centerY = params.textPos === 'top' ? 42 : size - 36;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 24px "Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif';

    if (params.outlineOnly) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#1F332D';
      ctx.strokeText(cleanCaption, size / 2, centerY, size - 24);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(cleanCaption, size / 2, centerY, size - 24);
    } else {
      const metrics = ctx.measureText(cleanCaption);
      const pillW = Math.min(size - 24, Math.max(98, Math.ceil(metrics.width) + 34));
      const pillH = 42;
      const pillX = (size - pillW) / 2;
      const pillY = centerY - pillH / 2;

      ctx.shadowColor = 'rgba(20, 35, 29, 0.25)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
      drawPillRect(ctx, pillX - 3, pillY - 3, pillW + 6, pillH + 6, 24);
      ctx.fillStyle = theme.border;
      ctx.fill();
      ctx.shadowColor = 'transparent';

      drawPillRect(ctx, pillX, pillY, pillW, pillH, 21);
      ctx.fillStyle = theme.fill;
      ctx.fill();

      ctx.fillStyle = theme.textColor;
      ctx.fillText(cleanCaption, size / 2, centerY + 1, pillW - 18);
    }
    ctx.restore();
  }

  let dataUrl = canvas.toDataURL('image/webp', 0.88);
  if (!dataUrl.startsWith('data:image/webp')) {
    dataUrl = canvas.toDataURL('image/png');
  }
  if (dataUrl.length > 145_000) {
    dataUrl = canvas.toDataURL('image/webp', 0.68);
  }
  return dataUrl;
}

export function CreateStickerSheet({
  open,
  onSaveAndSend,
  onClose,
}: CreateStickerSheetProps) {
  const [studioTab, setStudioTab] = useState<StickerStudioTab>('photo');

  // Photo Crop & Sticker Options
  const [loadedImg, setLoadedImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1.15);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [cutShape, setCutShape] = useState<StickerCutShape>('rounded');
  const [removeWhiteBg, setRemoveWhiteBg] = useState(false);
  const [outlineOnly, setOutlineOnly] = useState(false);
  const [textPos, setTextPos] = useState<StickerTextPos>('bottom');

  // Shared Caption + Emoji Mode
  const [emoji, setEmoji] = useState<string>(CUSTOM_STICKER_EMOJIS[0]);
  const [caption, setCaption] = useState('');
  const [themeId, setThemeId] = useState<CustomStickerThemeId>('matcha');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<{
    active: boolean;
    pointerId: number;
    startX: number;
    startY: number;
    origPanX: number;
    origPanY: number;
  }>({
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    origPanX: 0,
    origPanY: 0,
  });

  useEffect(() => {
    if (!open) {
      setLoadedImg(null);
      setZoom(1.15);
      setPan({ x: 0, y: 0 });
      setCaption('');
      setRemoveWhiteBg(false);
    }
  }, [open]);

  const previewDataUrl = useMemo(() => {
    if (!open) return null;
    if (studioTab === 'photo') {
      if (!loadedImg) return null;
      return renderPhotoStickerCanvas({
        img: loadedImg,
        zoom,
        panX: pan.x,
        panY: pan.y,
        shape: cutShape,
        removeWhiteBg,
        caption,
        themeId,
        outlineOnly,
        textPos,
      });
    }
    return renderCustomTransparentSticker({
      emoji,
      caption: caption || 'GASKEUN!',
      themeId,
    });
  }, [
    open,
    studioTab,
    loadedImg,
    zoom,
    pan,
    cutShape,
    removeWhiteBg,
    caption,
    themeId,
    outlineOnly,
    textPos,
    emoji,
  ]);

  const handleFilePicked = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      setLoadedImg(img);
      setZoom(1.15);
      setPan({ x: 0, y: 0 });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const handlePreviewPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (studioTab !== 'photo' || !loadedImg) return;
    dragRef.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origPanX: pan.x,
      origPanY: pan.y,
    };
  };

  const handlePreviewPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d.active || d.pointerId !== e.pointerId) return;
    const dx = (e.clientX - d.startX) / 220;
    const dy = (e.clientY - d.startY) / 220;
    setPan({
      x: Math.max(-0.48, Math.min(0.48, d.origPanX + dx)),
      y: Math.max(-0.48, Math.min(0.48, d.origPanY + dy)),
    });
  };

  const handlePreviewPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current.pointerId === e.pointerId) {
      dragRef.current.active = false;
      dragRef.current.pointerId = -1;
    }
  };

  const handleSave = () => {
    if (!previewDataUrl) return;
    triggerFeedback('success');
    const cleanCap =
      sanitizeStickerCaption(caption) ||
      (studioTab === 'emoji' ? 'GASKEUN!' : 'Custom Sticker');
    onSaveAndSend({
      id: `my-stk-${Date.now().toString(36)}`,
      caption: cleanCap,
      emoji: studioTab === 'photo' ? '🖼️' : emoji,
      themeId,
      dataUrl: previewDataUrl,
      createdAt: new Date().toISOString(),
    });
    onClose();
  };

  const canSave = Boolean(previewDataUrl) && (studioTab === 'emoji' || Boolean(loadedImg));

  return (
    <LiquidBottomSheet
      open={open}
      title="Sticker Studio"
      subtitle="Crop a photo or design a transparent die-cut sticker"
      onClose={onClose}
    >
      <div className="sticker-studio">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFilePicked}
        />

        {/* 2-Way Mode Switcher */}
        <div className="sticker-studio__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={studioTab === 'photo'}
            className={`sticker-studio__tab tactile ${
              studioTab === 'photo' ? 'sticker-studio__tab--active' : ''
            }`}
            onClick={() => {
              triggerFeedback('tap');
              setStudioTab('photo');
            }}
          >
            <ImagePlus size={14} strokeWidth={2.1} />
            <span>From Photo</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={studioTab === 'emoji'}
            className={`sticker-studio__tab tactile ${
              studioTab === 'emoji' ? 'sticker-studio__tab--active' : ''
            }`}
            onClick={() => {
              triggerFeedback('tap');
              setStudioTab('emoji');
            }}
          >
            <Sparkles size={14} strokeWidth={2.1} />
            <span>Emoji &amp; Text</span>
          </button>
        </div>

        {/* Interactive Checkerboard Transparent Stage */}
        <div
          className="sticker-studio__stage"
          onPointerDown={handlePreviewPointerDown}
          onPointerMove={handlePreviewPointerMove}
          onPointerUp={handlePreviewPointerEnd}
          onPointerCancel={handlePreviewPointerEnd}
        >
          {studioTab === 'photo' && !loadedImg ? (
            <button
              type="button"
              className="sticker-studio__pick-cta tactile"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={22} strokeWidth={2} />
              <span>Choose Photo from Gallery</span>
              <small>Crop shape &amp; add sticker text</small>
            </button>
          ) : previewDataUrl ? (
            <img
              src={previewDataUrl}
              alt="Transparent sticker preview"
              className="sticker-studio__preview-img"
              draggable={false}
            />
          ) : null}
        </div>

        {studioTab === 'photo' && loadedImg && (
          <>
            <div className="sticker-studio__photo-tools">
              <button
                type="button"
                className="crew-chat-drawer__pill tactile"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={12} strokeWidth={2.2} />
                <span>Change Photo</span>
              </button>
              <button
                type="button"
                className={`crew-chat-drawer__pill tactile ${
                  removeWhiteBg ? 'crew-chat-drawer__pill--active' : ''
                }`}
                onClick={() => {
                  triggerFeedback('toggle');
                  setRemoveWhiteBg((v) => !v);
                }}
              >
                <Scissors size={12} strokeWidth={2.2} />
                <span>Remove Light BG</span>
              </button>
            </div>

            <div className="sticker-studio__slider-row">
              <span className="gk-field__label">ZOOM</span>
              <input
                type="range"
                min={1}
                max={2.6}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--brand-matcha)' }}
              />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
                Drag photo to position
              </span>
            </div>

            <div className="crew-chat-drawer__pills">
              {CUT_SHAPES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`crew-chat-drawer__pill ${
                    cutShape === s.id ? 'crew-chat-drawer__pill--active' : ''
                  }`}
                  onClick={() => {
                    triggerFeedback('tap');
                    setCutShape(s.id);
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </>
        )}

        {studioTab === 'emoji' && (
          <div className="crew-chat-creator__emoji-strip">
            {CUSTOM_STICKER_EMOJIS.map((em) => (
              <button
                key={em}
                type="button"
                className={`crew-chat-creator__emoji-chip ${
                  emoji === em ? 'crew-chat-creator__emoji-chip--active' : ''
                }`}
                onClick={() => {
                  triggerFeedback('tap');
                  setEmoji(em);
                }}
              >
                {em}
              </button>
            ))}
          </div>
        )}

        {/* Shared Text + Theme Overlay */}
        <input
          type="text"
          className="crew-chat-creator__input"
          placeholder={
            studioTab === 'photo'
              ? 'Optional text on sticker (max 22 chars)...'
              : 'Sticker text (e.g. GASKEUN!)'
          }
          value={caption}
          maxLength={22}
          onChange={(e) => setCaption(e.target.value)}
        />

        <div className="crew-chat-drawer__pills">
          {CUSTOM_STICKER_THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`crew-chat-drawer__pill ${
                !outlineOnly && themeId === t.id ? 'crew-chat-drawer__pill--active' : ''
              }`}
              onClick={() => {
                triggerFeedback('tap');
                setOutlineOnly(false);
                setThemeId(t.id);
              }}
            >
              {t.label}
            </button>
          ))}
          {studioTab === 'photo' && (
            <>
              <button
                type="button"
                className={`crew-chat-drawer__pill ${
                  outlineOnly ? 'crew-chat-drawer__pill--active' : ''
                }`}
                onClick={() => {
                  triggerFeedback('tap');
                  setOutlineOnly((v) => !v);
                }}
              >
                Outline
              </button>
              <button
                type="button"
                className="crew-chat-drawer__pill"
                onClick={() => {
                  triggerFeedback('tap');
                  setTextPos((p) => (p === 'bottom' ? 'top' : 'bottom'));
                }}
              >
                Text: {textPos === 'bottom' ? 'Bottom' : 'Top'}
              </button>
            </>
          )}
        </div>

        <Button
          variant="matcha"
          size="lg"
          fullWidth
          disabled={!canSave}
          onClick={handleSave}
        >
          Save &amp; Send Sticker
        </Button>
      </div>
    </LiquidBottomSheet>
  );
}
