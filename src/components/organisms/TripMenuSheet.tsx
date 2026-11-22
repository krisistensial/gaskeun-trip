import { useRef, useState } from 'react';
import {
  Camera,
  Check,
  Download,
  FileSpreadsheet,
  KeyRound,
  Link2,
  Lock,
  LogOut,
  Settings2,
  ShieldCheck,
  Upload,
  Users,
} from 'lucide-react';
import { Avatar, Badge, Button, LiquidBottomSheet } from '../atoms';
import { PhotoCropperSheet } from './PhotoCropperSheet';
import { uploadSharedImage } from '../../services/mediaUploader';
import type { TripAccessRole } from '../../services/permissions';
import type { CroppedImageResult } from '../../services/photoCrop';
import type { SharedTrip, TripMember } from '../../types/trip';
import './sheets.css';

export type HomePhase = 'pre-trip' | 'on-trip';

export interface TripMenuSheetProps {
  open: boolean;
  trip: SharedTrip;
  phase: HomePhase;
  canEdit: boolean;
  isHost: boolean;
  pinUnlocked: boolean;
  roleLabel: TripAccessRole;
  activeMember?: TripMember;
  activeMemberName: string;
  onPhaseChange: (phase: HomePhase) => void;
  onUpdateActiveAvatar: (avatarDataUrl: string) => void;
  onToggleEditorMember: (memberId: string) => void;
  onRequestUnlock: () => void;
  onLockEditing: () => void;
  onOpenTripSettings: () => void;
  onCopyInvite: () => void;
  onSwitchProfile: () => void;
  onLeaveTrip: () => void;
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
  isHost,
  pinUnlocked,
  roleLabel,
  activeMember,
  activeMemberName,
  onPhaseChange,
  onUpdateActiveAvatar,
  onToggleEditorMember,
  onRequestUnlock,
  onLockEditing,
  onOpenTripSettings,
  onCopyInvite,
  onSwitchProfile,
  onLeaveTrip,
  onExportExcel,
  onExportJson,
  onImportJson,
  onClose,
}: TripMenuSheetProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [showEditorsList, setShowEditorsList] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);

  const handleCroppedAvatar = async (cropped: CroppedImageResult) => {
    setCropFile(null);
    const uploaded = await uploadSharedImage(cropped, {
      kind: 'avatar',
      trip,
      caption: activeMemberName,
      uploaderName: activeMemberName,
      fileName: `avatar-${activeMemberName.toLowerCase()}.jpg`,
    });
    onUpdateActiveAvatar(uploaded.url);
  };

  const editorIds = new Set(trip.editorMemberIds ?? []);

  return (
    <LiquidBottomSheet
      open={open}
      title="Profile & Settings"
      subtitle={`${trip.title} · Code ${trip.code}`}
      onClose={() => {
        setShowEditorsList(false);
        onClose();
      }}
    >
      {/* Active Profile Card (Face Photo + Role Badge + Change Photo) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: 14,
          borderRadius: 24,
          background: 'rgba(227, 237, 230, 0.55)',
          border: '1px solid rgba(255, 255, 255, 0.92)',
          marginBottom: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            className="tactile"
            disabled={!activeMember}
            onClick={() => activeMember && avatarInputRef.current?.click()}
            style={{ position: 'relative', display: 'inline-flex', borderRadius: '50%' }}
            aria-label="Update profile photo"
          >
            <Avatar
              initials={activeMember?.initials ?? 'G'}
              name={activeMemberName}
              src={activeMember?.avatarDataUrl}
              size="lg"
              bg={activeMember?.avatarBg ?? '#EAEFED'}
              color={activeMember?.avatarColor ?? '#546860'}
              variant="selected"
            />
            {activeMember && (
              <span
                style={{
                  position: 'absolute',
                  right: -2,
                  bottom: -2,
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  background: 'var(--brand-matcha)',
                  color: '#FFFFFF',
                  border: '2px solid #FFFFFF',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Camera size={11} strokeWidth={2.2} />
              </span>
            )}
          </button>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600 }}>
              {activeMemberName}
            </div>
            <div style={{ marginTop: 3 }}>
              <Badge tone={roleLabel === 'Viewer' ? 'neutral' : 'mint'}>{roleLabel}</Badge>
            </div>
          </div>
        </div>

        {activeMember && (
          <Button
            variant="glass"
            size="sm"
            onClick={() => avatarInputRef.current?.click()}
          >
            Photo
          </Button>
        )}
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setCropFile(f);
              e.target.value = '';
            }
          }}
        />
      </div>

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
        {/* Host-Only: Manage Editors */}
        {isHost && (
          <>
            <button
              type="button"
              className="gk-menu-item"
              onClick={() => setShowEditorsList((v) => !v)}
            >
              <span className="gk-menu-item__left">
                <span className="gk-menu-item__icon">
                  <ShieldCheck size={18} strokeWidth={1.8} />
                </span>
                <span>
                  <div className="gk-menu-item__title">Manage Editors</div>
                  <div className="gk-menu-item__sub">
                    Choose who can edit shared trip data
                  </div>
                </span>
              </span>
              <Badge tone="matcha">
                {Math.max(1, editorIds.size)} active
              </Badge>
            </button>

            {showEditorsList && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  padding: 10,
                  borderRadius: 20,
                  background: 'rgba(227, 237, 230, 0.45)',
                }}
              >
                {trip.members.map((m) => {
                  const isCreator = Boolean(m.isCreator);
                  const isEd = isCreator || editorIds.has(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={isCreator}
                      onClick={() => onToggleEditorMember(m.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        borderRadius: 16,
                        background: 'rgba(255, 255, 255, 0.78)',
                        opacity: isCreator ? 0.85 : 1,
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
                        <Avatar
                          initials={m.initials}
                          name={m.name}
                          src={m.avatarDataUrl}
                          size="sm"
                          bg={m.avatarBg}
                          color={m.avatarColor}
                        />
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</span>
                      </span>
                      {isCreator ? (
                        <Badge tone="matcha">Host</Badge>
                      ) : (
                        <span
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 8,
                            border: '1.6px solid var(--brand-matcha)',
                            background: isEd ? 'var(--brand-matcha)' : 'transparent',
                            color: '#FFFFFF',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {isEd && <Check size={13} strokeWidth={2.6} />}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Trip Settings (Visible to Host & Designated Editors) */}
        {canEdit && (
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
                  Trip name, subtitle, targets &amp; Drive sync
                </div>
              </span>
            </span>
          </button>
        )}

        {/* Subtle Crew PIN Unlock for Viewers (or Lock if unlocked via PIN) */}
        {(!canEdit || (pinUnlocked && !isHost)) && (
          <button
            type="button"
            className="gk-menu-item"
            onClick={() => {
              onClose();
              if (pinUnlocked) onLockEditing();
              else onRequestUnlock();
            }}
          >
            <span className="gk-menu-item__left">
              <span className="gk-menu-item__icon">
                {pinUnlocked ? (
                  <Lock size={18} strokeWidth={1.8} />
                ) : (
                  <KeyRound size={18} strokeWidth={1.8} />
                )}
              </span>
              <span>
                <div className="gk-menu-item__title">
                  {pinUnlocked ? 'Lock Crew Editing' : 'Unlock with Crew PIN'}
                </div>
                <div className="gk-menu-item__sub">
                  {pinUnlocked
                    ? 'Return to clean viewer mode'
                    : 'Enter 4-digit PIN for temporary edit access'}
                </div>
              </span>
            </span>
          </button>
        )}

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
            onLeaveTrip();
          }}
        >
          <span className="gk-menu-item__left">
            <span
              className="gk-menu-item__icon"
              style={{ background: 'var(--accent-coral-soft)', color: 'var(--accent-coral)' }}
            >
              <LogOut size={18} strokeWidth={1.8} />
            </span>
            <span>
              <div className="gk-menu-item__title" style={{ color: 'var(--accent-coral)' }}>
                Log Out / Leave Trip
              </div>
              <div className="gk-menu-item__sub">Return to Landing Gate (backups stay safe)</div>
            </span>
          </span>
        </button>
      </div>
      <PhotoCropperSheet
        open={Boolean(cropFile)}
        file={cropFile}
        preset="avatar"
        onCancel={() => setCropFile(null)}
        onConfirm={(res) => void handleCroppedAvatar(res)}
      />
    </LiquidBottomSheet>
  );
}
