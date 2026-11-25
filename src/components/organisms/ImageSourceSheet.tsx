import { useRef, type ChangeEvent } from 'react';
import { Camera, FolderOpen, Images } from 'lucide-react';
import { LiquidBottomSheet } from '../atoms';
import { triggerFeedback } from '../../services/feedback';
import { isSupportedImageFile } from '../../services/photoCrop';
import './sheets.css';

export interface ImageSourceSheetProps {
  open: boolean;
  title?: string;
  cameraFacing?: 'user' | 'environment';
  onPick: (file: File) => void;
  onInvalidFile?: (message: string) => void;
  onClose: () => void;
}

const HIDDEN_INPUT_STYLE = {
  position: 'absolute',
  width: 1,
  height: 1,
  opacity: 0,
  overflow: 'hidden',
  pointerEvents: 'none',
} as const;

/**
 * Unified Liquid Glass image source chooser for mobile & desktop:
 * - Photo Gallery (`accept="image/*"`) for quick recent photos
 * - My Files & Other Apps (no `accept` filter -> bypasses Android's Google-Photos-only
 *   Photo Picker so users can open File Saya, Samsung/local Gallery, Downloads, or Drive)
 * - Camera (`capture`) for taking a fresh photo directly
 */
export function ImageSourceSheet({
  open,
  title = 'Choose Image Source',
  cameraFacing = 'environment',
  onPick,
  onInvalidFile,
  onClose,
}: ImageSourceSheetProps) {
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const filesInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!isSupportedImageFile(file)) {
      triggerFeedback('warning');
      onInvalidFile?.('Please select an image file (JPG, PNG, WebP, or HEIC)');
      return;
    }
    triggerFeedback('tap');
    onPick(file);
  };

  return (
    <>
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        aria-hidden="true"
        tabIndex={-1}
        style={HIDDEN_INPUT_STYLE}
        onChange={handleFileChange}
      />
      <input
        ref={filesInputRef}
        type="file"
        aria-hidden="true"
        tabIndex={-1}
        style={HIDDEN_INPUT_STYLE}
        onChange={handleFileChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture={cameraFacing}
        aria-hidden="true"
        tabIndex={-1}
        style={HIDDEN_INPUT_STYLE}
        onChange={handleFileChange}
      />

      <LiquidBottomSheet
        open={open}
        title={title}
        subtitle="Pick from Gallery, My Files, or take a new photo"
        onClose={onClose}
      >
        <div className="gk-menu-list">
          <button
            type="button"
            className="gk-menu-item"
            onClick={() => {
              triggerFeedback('tap');
              galleryInputRef.current?.click();
              onClose();
            }}
          >
            <span className="gk-menu-item__left">
              <span className="gk-menu-item__icon">
                <Images size={18} strokeWidth={1.9} />
              </span>
              <span>
                <div className="gk-menu-item__title">Photo Gallery</div>
                <div className="gk-menu-item__sub">
                  Quick picker for recent photos &amp; albums
                </div>
              </span>
            </span>
          </button>

          <button
            type="button"
            className="gk-menu-item"
            onClick={() => {
              triggerFeedback('tap');
              filesInputRef.current?.click();
              onClose();
            }}
          >
            <span className="gk-menu-item__left">
              <span className="gk-menu-item__icon">
                <FolderOpen size={18} strokeWidth={1.9} />
              </span>
              <span>
                <div className="gk-menu-item__title">My Files &amp; Other Apps</div>
                <div className="gk-menu-item__sub">
                  Open File Saya, device Gallery folders, Downloads, or Drive
                </div>
              </span>
            </span>
          </button>

          <button
            type="button"
            className="gk-menu-item"
            onClick={() => {
              triggerFeedback('tap');
              cameraInputRef.current?.click();
              onClose();
            }}
          >
            <span className="gk-menu-item__left">
              <span className="gk-menu-item__icon">
                <Camera size={18} strokeWidth={1.9} />
              </span>
              <span>
                <div className="gk-menu-item__title">Camera</div>
                <div className="gk-menu-item__sub">Take a new photo now</div>
              </span>
            </span>
          </button>
        </div>
      </LiquidBottomSheet>
    </>
  );
}
