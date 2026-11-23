import { useRef, useState, type FormEvent } from 'react';
import {
  Camera,
  Check,
  Cloud,
  CloudOff,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  KeyRound,
  Link2,
  Lock,
  LogOut,
  RefreshCw,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Upload,
  Users,
} from 'lucide-react';
import { Avatar, Badge, Button, ConfirmDialog, LiquidBottomSheet } from '../atoms';
import { PhotoCropperSheet } from './PhotoCropperSheet';
import { uploadSharedImage } from '../../services/mediaUploader';
import {
  changeOwnPasscode,
  isValidPasscode,
  memberHasPasscode,
  normalizePasscode,
  type TripAccessRole,
} from '../../services/permissions';
import { isCloudSyncConfigured } from '../../services/supabaseSync';
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
  lastSyncedAt?: string | null;
  isSyncingCloud?: boolean;
  onForceSync?: () => void;
  onPhaseChange: (phase: HomePhase) => void;
  onUpdateActiveAvatar: (avatarDataUrl: string) => void;
  onSetMemberPasscode: (memberId: string, passcode: string | undefined, toastMsg?: string) => void;
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
  lastSyncedAt,
  isSyncingCloud = false,
  onForceSync,
  onPhaseChange,
  onUpdateActiveAvatar,
  onSetMemberPasscode,
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
  const [showMyPasscode, setShowMyPasscode] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);

  // Self-service My Passcode form state
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [showOwnPins, setShowOwnPins] = useState(false);
  const [ownPinError, setOwnPinError] = useState('');
  const [ownShakeCount, setOwnShakeCount] = useState(0);

  // Host per-member Set PIN & Reset PIN confirmation state
  const [hostPinTargetId, setHostPinTargetId] = useState<string | null>(null);
  const [hostPinValue, setHostPinValue] = useState('');
  const [hostShowPin, setHostShowPin] = useState(false);
  const [confirmResetMember, setConfirmResetMember] = useState<TripMember | null>(null);

  const resetLocalPanels = () => {
    setShowEditorsList(false);
    setShowMyPasscode(false);
    setCurrentPin('');
    setNewPin('');
    setOwnPinError('');
    setShowOwnPins(false);
    setHostPinTargetId(null);
    setHostPinValue('');
    setConfirmResetMember(null);
  };

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

  const activeHasPasscode = memberHasPasscode(activeMember);

  const handleSaveOwnPasscode = (e: FormEvent) => {
    e.preventDefault();
    if (!activeMember) return;
    const res = changeOwnPasscode(trip, activeMember.id, currentPin, newPin);
    if (!res.ok) {
      setOwnPinError(res.error || 'Could not update passcode');
      setOwnShakeCount((c) => c + 1);
      return;
    }
    onSetMemberPasscode(
      activeMember.id,
      newPin,
      activeHasPasscode ? 'Passcode updated' : '4-digit passcode set',
    );
    setCurrentPin('');
    setNewPin('');
    setOwnPinError('');
    setShowMyPasscode(false);
  };

  const handleRemoveOwnPasscode = () => {
    if (!activeMember) return;
    const res = changeOwnPasscode(trip, activeMember.id, currentPin, undefined);
    if (!res.ok) {
      setOwnPinError(res.error || 'Current passcode is incorrect');
      setOwnShakeCount((c) => c + 1);
      return;
    }
    onSetMemberPasscode(activeMember.id, undefined, 'Passcode removed');
    setCurrentPin('');
    setNewPin('');
    setOwnPinError('');
    setShowMyPasscode(false);
  };

  const handleHostSavePin = (member: TripMember) => {
    if (!isValidPasscode(hostPinValue)) return;
    onSetMemberPasscode(member.id, hostPinValue, `Passcode set for ${member.name}`);
    setHostPinTargetId(null);
    setHostPinValue('');
    setHostShowPin(false);
  };

  const editorIds = new Set(trip.editorMemberIds ?? []);
  const cloudConfigured = isCloudSyncConfigured();
  const deviceOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
  const cloudConnected = cloudConfigured && deviceOnline;

  const formattedLastSync = (() => {
    if (!lastSyncedAt) return null;
    const d = new Date(lastSyncedAt);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  })();

  return (
    <LiquidBottomSheet
      open={open}
      title="Profile & Settings"
      subtitle={`${trip.title} · Code ${trip.code}`}
      onClose={() => {
        resetLocalPanels();
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <Badge tone={roleLabel === 'Viewer' ? 'neutral' : 'mint'}>{roleLabel}</Badge>
              {activeMember && activeHasPasscode && (
                <Badge tone="matcha" icon={<Lock size={10} strokeWidth={2.2} />}>
                  PIN On
                </Badge>
              )}
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
        {/* Cloud Sync Status & Force Pull Row */}
        <div
          className="gk-menu-item"
          style={{ cursor: 'default', paddingTop: 10, paddingBottom: 10 }}
          aria-label="Cloud sync status"
        >
          <span className="gk-menu-item__left">
            <span
              className="gk-menu-item__icon"
              style={
                cloudConnected
                  ? { background: 'var(--accent-mint-soft)', color: 'var(--accent-mint)' }
                  : undefined
              }
            >
              {cloudConnected ? (
                <Cloud size={17} strokeWidth={1.9} />
              ) : (
                <CloudOff size={17} strokeWidth={1.9} />
              )}
            </span>
            <span>
              <div className="gk-menu-item__title">Cloud Sync</div>
              <div className="gk-menu-item__sub">
                {isSyncingCloud
                  ? 'Syncing with Supabase...'
                  : cloudConnected
                    ? formattedLastSync
                      ? `Synced · ${formattedLastSync}`
                      : 'Connected · Supabase'
                    : cloudConfigured
                      ? 'Device offline · Queued locally'
                      : 'Offline / Local only'}
              </div>
            </span>
          </span>
          {cloudConfigured && onForceSync ? (
            <Button
              variant="glass"
              size="sm"
              disabled={isSyncingCloud || !deviceOnline}
              leftIcon={
                <RefreshCw
                  size={13}
                  strokeWidth={2}
                  style={
                    isSyncingCloud ? { animation: 'gaskeun-spin 0.9s linear infinite' } : undefined
                  }
                />
              }
              onClick={onForceSync}
            >
              Sync
            </Button>
          ) : (
            <Badge tone={cloudConnected ? 'mint' : cloudConfigured ? 'amber' : 'neutral'}>
              {cloudConnected ? 'Supabase' : cloudConfigured ? 'Offline' : 'Local'}
            </Badge>
          )}
        </div>

        {/* Self-Service: My Passcode (for logged-in crew member) */}
        {activeMember && (
          <>
            <button
              type="button"
              className="gk-menu-item"
              onClick={() => {
                setOwnPinError('');
                setCurrentPin('');
                setNewPin('');
                setShowMyPasscode((v) => !v);
              }}
            >
              <span className="gk-menu-item__left">
                <span className="gk-menu-item__icon">
                  <Lock size={18} strokeWidth={1.8} />
                </span>
                <span>
                  <div className="gk-menu-item__title">My Passcode</div>
                  <div className="gk-menu-item__sub">
                    {activeHasPasscode
                      ? 'Change or remove your 4-digit profile PIN'
                      : 'Add a 4-digit code to protect your profile'}
                  </div>
                </span>
              </span>
              <Badge tone={activeHasPasscode ? 'mint' : 'neutral'}>
                {activeHasPasscode ? 'Protected' : 'Off'}
              </Badge>
            </button>

            {showMyPasscode && (
              <form
                key={ownShakeCount}
                className={`menu-pin-panel ${ownShakeCount > 0 ? 'who-pin-shake' : ''}`}
                onSubmit={handleSaveOwnPasscode}
              >
                {activeHasPasscode && (
                  <div className="menu-pin-field">
                    <label htmlFor="own-current-pin" className="gk-field__label">
                      CURRENT PASSCODE
                    </label>
                    <div className="menu-pin-shell">
                      <input
                        id="own-current-pin"
                        type={showOwnPins ? 'text' : 'password'}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={4}
                        placeholder="••••"
                        value={currentPin}
                        className="menu-pin-input"
                        onChange={(e) => {
                          setOwnPinError('');
                          setCurrentPin(normalizePasscode(e.target.value));
                        }}
                      />
                      <button
                        type="button"
                        className="menu-pin-eye"
                        aria-label={showOwnPins ? 'Hide passcodes' : 'Show passcodes'}
                        onClick={() => setShowOwnPins((s) => !s)}
                      >
                        {showOwnPins ? <EyeOff size={15} strokeWidth={1.9} /> : <Eye size={15} strokeWidth={1.9} />}
                      </button>
                    </div>
                  </div>
                )}

                <div className="menu-pin-field">
                  <label htmlFor="own-new-pin" className="gk-field__label">
                    {activeHasPasscode ? 'NEW 4-DIGIT PASSCODE' : 'SET 4-DIGIT PASSCODE'}
                  </label>
                  <div className="menu-pin-shell">
                    <input
                      id="own-new-pin"
                      type={showOwnPins ? 'text' : 'password'}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={4}
                      placeholder="••••"
                      value={newPin}
                      className="menu-pin-input"
                      onChange={(e) => {
                        setOwnPinError('');
                        setNewPin(normalizePasscode(e.target.value));
                      }}
                    />
                    {!activeHasPasscode && (
                      <button
                        type="button"
                        className="menu-pin-eye"
                        aria-label={showOwnPins ? 'Hide passcode' : 'Show passcode'}
                        onClick={() => setShowOwnPins((s) => !s)}
                      >
                        {showOwnPins ? <EyeOff size={15} strokeWidth={1.9} /> : <Eye size={15} strokeWidth={1.9} />}
                      </button>
                    )}
                  </div>
                </div>

                {ownPinError && <p className="menu-pin-error">{ownPinError}</p>}

                <div className="menu-pin-actions">
                  {activeHasPasscode && (
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={currentPin.length < 4}
                      onClick={handleRemoveOwnPasscode}
                    >
                      Remove PIN
                    </Button>
                  )}
                  <Button
                    type="submit"
                    variant="matcha"
                    size="sm"
                    fullWidth={!activeHasPasscode}
                    disabled={
                      newPin.length < 4 || (activeHasPasscode && currentPin.length < 4)
                    }
                  >
                    {activeHasPasscode ? 'Update PIN' : 'Save Passcode'}
                  </Button>
                </div>
              </form>
            )}
          </>
        )}

        {/* Host-Only: Manage Editors & Crew Passcodes */}
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
                  <div className="gk-menu-item__title">Crew Access &amp; Editors</div>
                  <div className="gk-menu-item__sub">
                    Manage editors and set or reset member passcodes
                  </div>
                </span>
              </span>
              <Badge tone="matcha">
                {Math.max(1, editorIds.size)} active
              </Badge>
            </button>

            {showEditorsList && (
              <div className="menu-crew-panel">
                {trip.members.map((m) => {
                  const isCreator = Boolean(m.isCreator);
                  const isEd = isCreator || editorIds.has(m.id);
                  const hasPin = memberHasPasscode(m);
                  const isSettingHostPin = hostPinTargetId === m.id;

                  return (
                    <div key={m.id} className="menu-crew-row-card">
                      <div className="menu-crew-row-top">
                        <button
                          type="button"
                          disabled={isCreator}
                          onClick={() => onToggleEditorMember(m.id)}
                          className="menu-crew-member-btn"
                          style={{ opacity: isCreator ? 0.9 : 1 }}
                        >
                          <Avatar
                            initials={m.initials}
                            name={m.name}
                            src={m.avatarDataUrl}
                            size="sm"
                            bg={m.avatarBg}
                            color={m.avatarColor}
                          />
                          <span className="menu-crew-member-name">
                            {m.name}
                            {hasPin && (
                              <Lock
                                size={11}
                                strokeWidth={2.2}
                                color="var(--brand-matcha)"
                                style={{ marginLeft: 5, verticalAlign: '-1px' }}
                              />
                            )}
                          </span>
                        </button>

                        <div className="menu-crew-controls">
                          {hasPin ? (
                            <button
                              type="button"
                              className="menu-pin-chip menu-pin-chip--reset tactile"
                              onClick={() => setConfirmResetMember(m)}
                            >
                              <RotateCcw size={11} strokeWidth={2.2} />
                              <span>Reset PIN</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="menu-pin-chip tactile"
                              onClick={() => {
                                setHostPinTargetId(isSettingHostPin ? null : m.id);
                                setHostPinValue('');
                                setHostShowPin(false);
                              }}
                            >
                              <KeyRound size={11} strokeWidth={2.2} />
                              <span>Set PIN</span>
                            </button>
                          )}

                          {isCreator ? (
                            <Badge tone="matcha">Host</Badge>
                          ) : (
                            <button
                              type="button"
                              aria-label={isEd ? `Remove ${m.name} as editor` : `Make ${m.name} an editor`}
                              onClick={() => onToggleEditorMember(m.id)}
                              className={`menu-editor-check ${isEd ? 'menu-editor-check--on' : ''}`}
                            >
                              {isEd && <Check size={13} strokeWidth={2.6} />}
                            </button>
                          )}
                        </div>
                      </div>

                      {isSettingHostPin && (
                        <div className="menu-host-pin-inline">
                          <div className="menu-pin-shell menu-pin-shell--compact">
                            <input
                              type={hostShowPin ? 'text' : 'password'}
                              inputMode="numeric"
                              pattern="[0-9]*"
                              maxLength={4}
                              placeholder="4 digits"
                              aria-label={`Set 4-digit passcode for ${m.name}`}
                              value={hostPinValue}
                              className="menu-pin-input menu-pin-input--compact"
                              onChange={(e) => setHostPinValue(normalizePasscode(e.target.value))}
                            />
                            <button
                              type="button"
                              className="menu-pin-eye"
                              aria-label={hostShowPin ? 'Hide passcode' : 'Show passcode'}
                              onClick={() => setHostShowPin((s) => !s)}
                            >
                              {hostShowPin ? <EyeOff size={14} strokeWidth={1.9} /> : <Eye size={14} strokeWidth={1.9} />}
                            </button>
                          </div>
                          <Button
                            variant="matcha"
                            size="sm"
                            disabled={hostPinValue.length < 4}
                            onClick={() => handleHostSavePin(m)}
                          >
                            Save
                          </Button>
                        </div>
                      )}
                    </div>
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
              resetLocalPanels();
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
              resetLocalPanels();
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
            resetLocalPanels();
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
            resetLocalPanels();
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
            resetLocalPanels();
            onClose();
          }}
        >
          <span className="gk-menu-item__left">
            <span className="gk-menu-item__icon">
              <Download size={18} strokeWidth={1.8} />
            </span>
            <span>
              <div className="gk-menu-item__title">Export Shared Backup (.json)</div>
              <div className="gk-menu-item__sub">Personal wallet &amp; prep stay private</div>
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
              resetLocalPanels();
              onClose();
            }
          }}
        />

        <button
          type="button"
          className="gk-menu-item"
          onClick={() => {
            resetLocalPanels();
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
            resetLocalPanels();
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

      <ConfirmDialog
        open={Boolean(confirmResetMember)}
        title={confirmResetMember ? `Reset ${confirmResetMember.name}'s PIN?` : ''}
        description={
          confirmResetMember
            ? `${confirmResetMember.name} will be able to sign in without a passcode and set a new one anytime.`
            : ''
        }
        confirmLabel="Reset PIN"
        destructive
        onCancel={() => setConfirmResetMember(null)}
        onConfirm={() => {
          if (confirmResetMember) {
            onSetMemberPasscode(
              confirmResetMember.id,
              undefined,
              `${confirmResetMember.name}'s passcode reset`,
            );
          }
          setConfirmResetMember(null);
        }}
      />
    </LiquidBottomSheet>
  );
}
