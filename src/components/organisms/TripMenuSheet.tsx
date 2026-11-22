import { useRef } from 'react';
import {
  Download,
  FileSpreadsheet,
  KeyRound,
  Link2,
  Lock,
  LogOut,
  Settings2,
  Upload,
  Users,
} from 'lucide-react';
import { Badge, LiquidBottomSheet } from '../atoms';
import type { SharedTrip } from '../../types/trip';
import './sheets.css';

export type HomePhase = 'pre-trip' | 'on-trip';

export interface TripMenuSheetProps {
  open: boolean;
  trip: SharedTrip;
  phase: HomePhase;
  canEdit: boolean;
  activeMemberName: string;
  onPhaseChange: (phase: HomePhase) => void;
  onRequestUnlock: () => void;
  onLockEditing: () => void;
  onOpenTripSettings: () => void;
  onCopyInvite: () => void;
  onSwitchProfile: () => void;
  onSwitchTrip: () => void;
  onExportExcel: () => void;
  onExportJson: () => void;
  onImportJson: (file: File) => void;
  onClose: () => void;
}

export function TripMenuSheet({
  open,
  trip,
  phase,
  canEdit,
  activeMemberName,
  onPhaseChange,
  onRequestUnlock,
  onLockEditing,
  onOpenTripSettings,
  onCopyInvite,
  onSwitchProfile,
  onSwitchTrip,
  onExportExcel,
  onExportJson,
  onImportJson,
  onClose,
}: TripMenuSheetProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <LiquidBottomSheet
      open={open}
      title={trip.title}
      subtitle={
        <>
          Code {trip.code} · Joined as <strong>{activeMemberName}</strong>
        </>
      }
      onClose={onClose}
    >
      {/* Adaptive Home Focus Switcher */}
        <div className="gk-seg-pill" role="tablist" aria-label="Trip focus">
          <button
            type="button"
            role="tab"
            aria-selected={phase === 'pre-trip'}
            className={`gk-seg-pill__btn ${phase === 'pre-trip' ? 'gk-seg-pill__btn--active' : ''}`}
            onClick={() => onPhaseChange('pre-trip')}
          >
            Countdown View
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={phase === 'on-trip'}
            className={`gk-seg-pill__btn ${phase === 'on-trip' ? 'gk-seg-pill__btn--active' : ''}`}
            onClick={() => onPhaseChange('on-trip')}
          >
            Live Trail View
          </button>
        </div>

        <div className="gk-menu-list">
          <button
            type="button"
            className="gk-menu-item"
            onClick={() => {
              onClose();
              if (canEdit) onLockEditing();
              else onRequestUnlock();
            }}
          >
            <span className="gk-menu-item__left">
              <span className="gk-menu-item__icon">
                {canEdit ? <Lock size={18} strokeWidth={1.8} /> : <KeyRound size={18} strokeWidth={1.8} />}
              </span>
              <span>
                <div className="gk-menu-item__title">
                  {canEdit ? 'Lock Crew Editing' : 'Unlock Crew Editing'}
                </div>
                <div className="gk-menu-item__sub">
                  {canEdit ? 'Return to safe read-only view' : 'Enter 4-digit PIN to edit shared data'}
                </div>
              </span>
            </span>
            <Badge tone={canEdit ? 'mint' : 'neutral'}>{canEdit ? 'Unlocked' : 'Locked'}</Badge>
          </button>

          <button
            type="button"
            className="gk-menu-item"
            onClick={() => {
              onClose();
              onOpenTripSettings();
            }}
          >
            <span className="gk-menu-item__left">
              <span className="gk-menu-item__icon">
                <Settings2 size={18} strokeWidth={1.8} />
              </span>
              <span>
                <div className="gk-menu-item__title">Trip Settings</div>
                <div className="gk-menu-item__sub">
                  Trip name, targets, milestone &amp; invite link
                </div>
              </span>
            </span>
            {!canEdit && <Badge tone="neutral">PIN</Badge>}
          </button>

          <button
            type="button"
            className="gk-menu-item"
            onClick={() => {
              onCopyInvite();
              onClose();
            }}
          >
            <span className="gk-menu-item__left">
              <span className="gk-menu-item__icon">
                <Link2 size={18} strokeWidth={1.8} />
              </span>
              <span>
                <div className="gk-menu-item__title">Copy Invite Link</div>
                <div className="gk-menu-item__sub">Share code {trip.code} via WhatsApp</div>
              </span>
            </span>
          </button>

          <button
            type="button"
            className="gk-menu-item"
            onClick={() => {
              onExportExcel();
              onClose();
            }}
          >
            <span className="gk-menu-item__left">
              <span className="gk-menu-item__icon">
                <FileSpreadsheet size={18} strokeWidth={1.8} />
              </span>
              <span>
                <div className="gk-menu-item__title">Export Trip (.xlsx)</div>
                <div className="gk-menu-item__sub">
                  Itinerary, Wallet &amp; Crew workbook (3 sheets)
                </div>
              </span>
            </span>
          </button>

          <button
            type="button"
            className="gk-menu-item"
            onClick={() => {
              onExportJson();
              onClose();
            }}
          >
            <span className="gk-menu-item__left">
              <span className="gk-menu-item__icon">
                <Download size={18} strokeWidth={1.8} />
              </span>
              <span>
                <div className="gk-menu-item__title">Export Shared Backup (.json)</div>
                <div className="gk-menu-item__sub">Personal notes &amp; cover stay private</div>
              </span>
            </span>
          </button>

          <button
            type="button"
            className="gk-menu-item"
            onClick={() => fileInputRef.current?.click()}
          >
            <span className="gk-menu-item__left">
              <span className="gk-menu-item__icon">
                <Upload size={18} strokeWidth={1.8} />
              </span>
              <span>
                <div className="gk-menu-item__title">Import Shared Backup (.json)</div>
                <div className="gk-menu-item__sub">Updates group schedule &amp; pool only</div>
              </span>
            </span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                onImportJson(file);
                e.target.value = '';
                onClose();
              }
            }}
          />

          <button
            type="button"
            className="gk-menu-item"
            onClick={() => {
              onClose();
              onSwitchProfile();
            }}
          >
            <span className="gk-menu-item__left">
              <span className="gk-menu-item__icon">
                <Users size={18} strokeWidth={1.8} />
              </span>
              <span>
                <div className="gk-menu-item__title">Switch Profile</div>
                <div className="gk-menu-item__sub">Change who is browsing on this phone</div>
              </span>
            </span>
          </button>

          <button
            type="button"
            className="gk-menu-item"
            onClick={() => {
              onClose();
              onSwitchTrip();
            }}
          >
            <span className="gk-menu-item__left">
              <span className="gk-menu-item__icon">
                <LogOut size={18} strokeWidth={1.8} />
              </span>
              <span>
                <div className="gk-menu-item__title">Switch or Create Trip</div>
                <div className="gk-menu-item__sub">Return to Trip Code gate</div>
              </span>
            </span>
          </button>
        </div>
    </LiquidBottomSheet>
  );
}
