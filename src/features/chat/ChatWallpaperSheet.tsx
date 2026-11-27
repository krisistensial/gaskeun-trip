import { useEffect, useState } from 'react';
import { Check, ImagePlus, RotateCcw, Sparkles } from 'lucide-react';
import { Button, LiquidBottomSheet, type ToastTone } from '../../components/atoms';
import { ImageSourceSheet } from '../../components/organisms/ImageSourceSheet';
import { PhotoCropperSheet } from '../../components/organisms/PhotoCropperSheet';
import {
  CHAT_WALLPAPER_PRESETS,
  clampWallpaperOpacity,
  getChatWallpaperPreset,
  normalizeChatWallpaper,
} from '../../services/chat';
import { triggerFeedback } from '../../services/feedback';
import { uploadSharedImage } from '../../services/mediaUploader';
import type { CroppedImageResult } from '../../services/photoCrop';
import type { ChatWallpaperConfig, SharedTrip } from '../../types/trip';

export interface ChatWallpaperSheetProps {
  open: boolean;
  trip: SharedTrip;
  onApplyWallpaper: (wallpaper: ChatWallpaperConfig | undefined) => void;
  onToggleChatHistory?: (allow: boolean) => void;
  onNotify?: (message: string, tone?: ToastTone) => void;
  onClose: () => void;
}

export function ChatWallpaperSheet({
  open,
  trip,
  onApplyWallpaper,
  onToggleChatHistory,
  onNotify,
  onClose,
}: ChatWallpaperSheetProps) {
  const [presetId, setPresetId] = useState<string>(
    trip.chatWallpaper?.imageUrl
      ? 'custom'
      : trip.chatWallpaper?.presetId ?? 'default',
  );
  const [customImageUrl, setCustomImageUrl] = useState<string>(
    trip.chatWallpaper?.imageUrl ?? '',
  );
  const [opacity, setOpacity] = useState<number>(
    clampWallpaperOpacity(trip.chatWallpaper?.opacity ?? 0.65),
  );
  const [allowHistory, setAllowHistory] = useState<boolean>(
    trip.chatHistoryForNewMembers !== false,
  );
  const [sourceOpen, setSourceOpen] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPresetId(
      trip.chatWallpaper?.imageUrl
        ? 'custom'
        : trip.chatWallpaper?.presetId ?? 'default',
    );
    setCustomImageUrl(trip.chatWallpaper?.imageUrl ?? '');
    setOpacity(clampWallpaperOpacity(trip.chatWallpaper?.opacity ?? 0.65));
    setAllowHistory(trip.chatHistoryForNewMembers !== false);
  }, [open, trip.chatWallpaper, trip.chatHistoryForNewMembers]);

  const activePreset = getChatWallpaperPreset(presetId);
  const hasVisualWallpaper =
    (presetId === 'custom' && Boolean(customImageUrl)) ||
    (presetId !== 'default' && Boolean(activePreset && activePreset.layerBg !== 'none'));

  const handlePhotoCropped = async (cropped: CroppedImageResult) => {
    setCropFile(null);
    setUploading(true);
    try {
      const uploaded = await uploadSharedImage(cropped, {
        kind: 'chat-wallpaper',
        trip,
        caption: `${trip.title} Chat Wallpaper`,
        fileName: `chat-wallpaper-${Date.now().toString(36)}.jpg`,
      });
      setCustomImageUrl(uploaded.url);
      setPresetId('custom');
      if (opacity < 0.35) setOpacity(0.65);
      triggerFeedback('success');
      if (uploaded.source === 'local') {
        onNotify?.(
          uploaded.reason
            ? `Wallpaper ready (${uploaded.reason})`
            : 'Wallpaper ready (saved locally)',
          'info',
        );
      } else {
        onNotify?.('Wallpaper photo uploaded', 'success');
      }
    } catch {
      onNotify?.('Could not process wallpaper image', 'info');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = () => {
    const nextWallpaper =
      presetId === 'custom' && customImageUrl
        ? normalizeChatWallpaper({ imageUrl: customImageUrl, opacity })
        : normalizeChatWallpaper({ presetId, opacity });

    onApplyWallpaper(nextWallpaper);
    if (
      onToggleChatHistory &&
      allowHistory !== (trip.chatHistoryForNewMembers !== false)
    ) {
      onToggleChatHistory(allowHistory);
    }
    triggerFeedback('success');
    onClose();
  };

  const handleReset = () => {
    triggerFeedback('tap');
    setPresetId('default');
    setCustomImageUrl('');
    setOpacity(0.65);
  };

  const opacityPercent = Math.round(opacity * 100);

  return (
    <>
      <LiquidBottomSheet
        open={open}
        title="Chat Wallpaper & Access"
        subtitle="Host settings synced to all crew members"
        onClose={onClose}
      >
        <div className="crew-chat-wp-sheet">
          {/* Live WhatsApp-Style Mini Preview */}
          <div className="crew-chat-wp-preview" aria-label="Live wallpaper preview">
            {hasVisualWallpaper && (
              <div
                className="crew-chat-wp-preview__bg"
                style={
                  presetId === 'custom' && customImageUrl
                    ? {
                        backgroundImage: `url(${customImageUrl})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        opacity,
                      }
                    : {
                        backgroundImage: activePreset?.layerBg,
                        backgroundSize: activePreset?.layerSize ?? 'cover',
                        opacity,
                      }
                }
              />
            )}
            <div className="crew-chat-wp-preview__content">
              <div className="crew-chat-wp-preview__bubble crew-chat-wp-preview__bubble--other">
                <span className="crew-chat-wp-preview__sender">Crew</span>
                <span>Ready for our roadtrip? 🛵</span>
              </div>
              <div className="crew-chat-wp-preview__bubble crew-chat-wp-preview__bubble--own">
                <span>GASKEUN! See you at the station ✨</span>
              </div>
            </div>
          </div>

          {/* Preset Swatches & Custom Photo Upload */}
          <div className="crew-chat-wp-section">
            <div className="crew-chat-wp-section__head">
              <span className="gk-field__label">WALLPAPER THEME</span>
              <button
                type="button"
                className="crew-chat-wp-upload-btn tactile"
                disabled={uploading}
                onClick={() => {
                  triggerFeedback('tap');
                  setSourceOpen(true);
                }}
              >
                <ImagePlus size={14} strokeWidth={2.1} />
                <span>{uploading ? 'Uploading...' : 'Upload Photo'}</span>
              </button>
            </div>

            <div className="crew-chat-wp-grid">
              {CHAT_WALLPAPER_PRESETS.map((preset) => {
                const selected = presetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    className={`crew-chat-wp-swatch tactile ${
                      selected ? 'crew-chat-wp-swatch--active' : ''
                    }`}
                    onClick={() => {
                      triggerFeedback('tap');
                      setPresetId(preset.id);
                    }}
                  >
                    <span
                      className="crew-chat-wp-swatch__tile"
                      style={{
                        background: preset.swatchBg,
                        backgroundSize: preset.layerSize ?? 'cover',
                      }}
                    >
                      {selected && (
                        <span className="crew-chat-wp-swatch__check">
                          <Check size={12} strokeWidth={2.8} />
                        </span>
                      )}
                    </span>
                    <span className="crew-chat-wp-swatch__label">{preset.label}</span>
                  </button>
                );
              })}

              {customImageUrl && (
                <button
                  type="button"
                  className={`crew-chat-wp-swatch tactile ${
                    presetId === 'custom' ? 'crew-chat-wp-swatch--active' : ''
                  }`}
                  onClick={() => {
                    triggerFeedback('tap');
                    setPresetId('custom');
                  }}
                >
                  <span
                    className="crew-chat-wp-swatch__tile"
                    style={{
                      backgroundImage: `url(${customImageUrl})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                  >
                    {presetId === 'custom' && (
                      <span className="crew-chat-wp-swatch__check">
                        <Check size={12} strokeWidth={2.8} />
                      </span>
                    )}
                  </span>
                  <span className="crew-chat-wp-swatch__label">Custom Photo</span>
                </button>
              )}
            </div>
          </div>

          {/* Clarity / Transparency Slider (WhatsApp-style) */}
          <div className="crew-chat-wp-slider-card">
            <div className="crew-chat-wp-slider-head">
              <span className="crew-chat-wp-slider-title">Wallpaper Clarity</span>
              <span className="crew-chat-wp-slider-val">
                {hasVisualWallpaper ? `${opacityPercent}%` : 'Default'}
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              disabled={!hasVisualWallpaper}
              value={opacityPercent}
              aria-label="Wallpaper clarity percentage"
              className="crew-chat-wp-range"
              onChange={(e) => setOpacity(clampWallpaperOpacity(Number(e.target.value) / 100))}
            />
            <div className="crew-chat-wp-slider-hints">
              <span>Softer</span>
              <span>Balanced</span>
              <span>Full Vivid</span>
            </div>
          </div>

          {/* Host Toggle: New Crew Chat History */}
          {onToggleChatHistory && (
            <div className="crew-chat-wp-history-row">
              <div className="crew-chat-wp-history-copy">
                <span className="crew-chat-wp-history-title">New Crew Chat History</span>
                <span className="crew-chat-wp-history-sub">
                  {allowHistory
                    ? 'Newly added crew can read earlier chat messages.'
                    : 'Newly added crew only see messages sent after they joined.'}
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={allowHistory}
                aria-label="Allow newly added crew to see earlier chat history"
                className={`menu-toggle-switch ${allowHistory ? 'menu-toggle-switch--on' : ''}`}
                onClick={() => {
                  triggerFeedback('toggle');
                  setAllowHistory((v) => !v);
                }}
              >
                <span className="menu-toggle-switch__knob" />
              </button>
            </div>
          )}

          {/* Action Row */}
          <div className="crew-chat-wp-actions">
            <Button
              variant="glass"
              size="md"
              leftIcon={<RotateCcw size={15} strokeWidth={2} />}
              onClick={handleReset}
            >
              Reset
            </Button>
            <Button
              variant="matcha"
              size="md"
              fullWidth
              disabled={uploading}
              leftIcon={<Sparkles size={15} strokeWidth={2} />}
              onClick={handleSave}
            >
              Apply for Crew
            </Button>
          </div>
        </div>
      </LiquidBottomSheet>

      <ImageSourceSheet
        open={sourceOpen}
        title="Chat Wallpaper Photo"
        onPick={(file) => setCropFile(file)}
        onClose={() => setSourceOpen(false)}
      />

      <PhotoCropperSheet
        open={Boolean(cropFile)}
        file={cropFile}
        preset="chat-wallpaper"
        onCancel={() => setCropFile(null)}
        onConfirm={(res) => void handlePhotoCropped(res)}
      />
    </>
  );
}
