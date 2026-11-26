import { useRef, useState, type FormEvent } from 'react';
import {
  Bell,
  BellOff,
  Camera,
  Check,
  ChevronRight,
  Cloud,
  CloudOff,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  History,
  KeyRound,
  Link2,
  Lock,
  LogOut,
  MessageCircle,
  RefreshCw,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  Upload,
  Users,
  Volume2,
} from 'lucide-react';
import { Avatar, Badge, Button, ConfirmDialog, LiquidBottomSheet } from '../atoms';
import { ImageSourceSheet } from './ImageSourceSheet';
import { PhotoCropperSheet } from './PhotoCropperSheet';
import {
  formatEditLogCategoryLabel,
  formatRelativeLogTime,
} from '../../services/activityLog';
import {
  getFeedbackPreferences,
  playRotarySoundDemo,
  setHapticsEnabled,
  setSoundEnabled,
  triggerFeedback,
} from '../../services/feedback';
import {
  getDeviceNotificationPermission,
  getDeviceNotificationsEnabled,
  requestDeviceNotificationPermission,
  setDeviceNotificationsEnabled,
  tryShowDeviceNotification,
} from '../../services/notifications';
import {
  dispatchBackgroundPushDetailed,
  ensureWebPushSubscription,
  removeWebPushSubscription,
  verifyActivePushServiceWorker,
} from '../../services/pushNotifications';
import { uploadSharedImage } from '../../services/mediaUploader';
import {
  TRIP_EDIT_SCOPE_META,
  changeOwnPasscode,
  formatMemberAccessLabel,
  getMemberEditScopes,
  isValidPasscode,
  memberHasPasscode,
  normalizePasscode,
} from '../../services/permissions';
import { isCloudSyncConfigured } from '../../services/supabaseSync';
import type { CroppedImageResult } from '../../services/photoCrop';
import type {
  EditLogCategory,
  SharedTrip,
  TripEditScope,
  TripMember,
} from '../../types/trip';
import './sheets.css';

export type HomePhase = 'pre-trip' | 'on-trip';

export interface TripMenuSheetProps {
  open: boolean;
  trip: SharedTrip;
  phase: HomePhase;
  canEdit: boolean;
  hasEditRights?: boolean;
  viewOnlyMode?: boolean;
  isHost: boolean;
  activeMember?: TripMember;
  activeMemberName: string;
  lastSyncedAt?: string | null;
  lastSyncError?: string | null;
  isSyncingCloud?: boolean;
  unreadChatCount?: number;
  onForceSync?: () => void;
  onOpenChat?: () => void;
  onOpenRecap?: () => void;
  onToggleViewOnlyMode?: (next: boolean) => void;
  onPhaseChange: (phase: HomePhase) => void;
  onUpdateActiveAvatar: (avatarDataUrl: string) => void;
  onSetMemberPasscode: (memberId: string, passcode: string | undefined, toastMsg?: string) => void;
  onToggleMemberScope: (memberId: string, scope: TripEditScope) => void;
  onClearEditLog?: () => void;
  onOpenTripSettings: () => void;
  onCopyInvite: () => void;
  onSwitchProfile: () => void;
  onLeaveTrip: () => void;
  onExportExcel: () => void;
  onExportJson: () => void;
  onImportJson: (file: File) => void;
  onNotify?: (message: string, tone?: 'success' | 'info' | 'error') => void;
  onClose: () => void;
}

export function TripMenuSheet({
  open,
  trip,
  phase,
  hasEditRights = false,
  viewOnlyMode = false,
  isHost,
  activeMember,
  activeMemberName,
  lastSyncedAt,
  lastSyncError,
  isSyncingCloud = false,
  unreadChatCount = 0,
  onForceSync,
  onOpenChat,
  onOpenRecap,
  onToggleViewOnlyMode,
  onPhaseChange,
  onUpdateActiveAvatar,
  onSetMemberPasscode,
  onToggleMemberScope,
  onClearEditLog,
  onOpenTripSettings,
  onCopyInvite,
  onSwitchProfile,
  onLeaveTrip,
  onExportExcel,
  onExportJson,
  onImportJson,
  onNotify,
  onClose,
}: TripMenuSheetProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarSourceOpen, setAvatarSourceOpen] = useState(false);
  const [showEditorsList, setShowEditorsList] = useState(false);
  const [showMyPasscode, setShowMyPasscode] = useState(false);
  const [activityLogOpen, setActivityLogOpen] = useState(false);
  const [logFilter, setLogFilter] = useState<'all' | EditLogCategory>('all');
  const [confirmClearLog, setConfirmClearLog] = useState(false);
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

  // Local device multisensory preferences (Haptics + Web Audio + Phone Notifications)
  const [feedbackPrefs, setFeedbackPrefs] = useState(() => getFeedbackPreferences());
  const [notifEnabled, setNotifEnabled] = useState(() => getDeviceNotificationsEnabled());
  const [notifPermission, setNotifPermission] = useState(() =>
    getDeviceNotificationPermission(),
  );

  const resetLocalPanels = () => {
    setShowEditorsList(false);
    setShowMyPasscode(false);
    setActivityLogOpen(false);
    setLogFilter('all');
    setConfirmClearLog(false);
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
      triggerFeedback('warning');
      setOwnPinError(res.error || 'Could not update passcode');
      setOwnShakeCount((c) => c + 1);
      return;
    }
    triggerFeedback('success');
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
      triggerFeedback('warning');
      setOwnPinError(res.error || 'Current passcode is incorrect');
      setOwnShakeCount((c) => c + 1);
      return;
    }
    triggerFeedback('warning');
    onSetMemberPasscode(activeMember.id, undefined, 'Passcode removed');
    setCurrentPin('');
    setNewPin('');
    setOwnPinError('');
    setShowMyPasscode(false);
  };

  const handleHostSavePin = (member: TripMember) => {
    if (!isValidPasscode(hostPinValue)) return;
    triggerFeedback('success');
    onSetMemberPasscode(member.id, hostPinValue, `Passcode set for ${member.name}`);
    setHostPinTargetId(null);
    setHostPinValue('');
    setHostShowPin(false);
  };

  const roleAccessText = formatMemberAccessLabel(trip, activeMember?.id ?? null);
  const activeEditorCount = trip.members.filter(
    (m) => m.isCreator || getMemberEditScopes(trip, m.id).length > 0,
  ).length;
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
            onClick={() => activeMember && setAvatarSourceOpen(true)}
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
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 3 }}>
              <Badge tone={roleAccessText === 'Member' ? 'neutral' : 'mint'}>{roleAccessText}</Badge>
              {viewOnlyMode && hasEditRights && (
                <Badge tone="amber" icon={<Eye size={10} strokeWidth={2.2} />}>
                  View-Only
                </Badge>
              )}
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
            onClick={() => setAvatarSourceOpen(true)}
          >
            Photo
          </Button>
        )}
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
        {/* Host & Editor Only: Clean Trip-Day View-Only Mode Toggle */}
        {hasEditRights && onToggleViewOnlyMode && (
          <button
            type="button"
            role="switch"
            aria-checked={viewOnlyMode}
            className="gk-menu-item"
            onClick={() => onToggleViewOnlyMode(!viewOnlyMode)}
          >
            <span className="gk-menu-item__left">
              <span
                className="gk-menu-item__icon"
                style={
                  viewOnlyMode
                    ? { background: 'var(--accent-amber-soft)', color: '#9A5F16' }
                    : undefined
                }
              >
                <Eye size={18} strokeWidth={1.8} />
              </span>
              <span>
                <div className="gk-menu-item__title">View-Only Mode</div>
                <div className="gk-menu-item__sub">
                  Hide edit controls (Drive upload &amp; chat stay active)
                </div>
              </span>
            </span>
            <span
              className={`menu-toggle-switch ${viewOnlyMode ? 'menu-toggle-switch--amber' : ''}`}
              aria-hidden="true"
            >
              <span className="menu-toggle-switch__knob" />
            </span>
          </button>
        )}

        {/* Local Sensory Feedback Preferences (Haptics + Subtle Glassy UI Sounds) */}
        <button
          type="button"
          role="switch"
          aria-checked={feedbackPrefs.hapticsEnabled}
          className="gk-menu-item"
          onClick={() => {
            const next = !feedbackPrefs.hapticsEnabled;
            const updated = setHapticsEnabled(next);
            setFeedbackPrefs(updated);
            if (next) {
              triggerFeedback('toggle', { forceHaptic: true });
            }
          }}
        >
          <span className="gk-menu-item__left">
            <span className="gk-menu-item__icon">
              <Smartphone size={18} strokeWidth={1.8} />
            </span>
            <span>
              <div className="gk-menu-item__title">Haptic Feedback</div>
              <div className="gk-menu-item__sub">
                Gentle vibration on taps, toggles &amp; saves
              </div>
            </span>
          </span>
          <span
            className={`menu-toggle-switch ${feedbackPrefs.hapticsEnabled ? 'menu-toggle-switch--on' : ''}`}
            aria-hidden="true"
          >
            <span className="menu-toggle-switch__knob" />
          </span>
        </button>

        <button
          type="button"
          role="switch"
          aria-checked={feedbackPrefs.soundEnabled}
          className="gk-menu-item"
          onClick={() => {
            const next = !feedbackPrefs.soundEnabled;
            const updated = setSoundEnabled(next);
            setFeedbackPrefs(updated);
            if (next) {
              triggerFeedback('toggle', { forceHaptic: true });
              playRotarySoundDemo();
            } else {
              triggerFeedback('tap');
            }
          }}
        >
          <span className="gk-menu-item__left">
            <span className="gk-menu-item__icon">
              <Volume2 size={18} strokeWidth={1.8} />
            </span>
            <span>
              <div className="gk-menu-item__title">Subtle UI Sounds</div>
              <div className="gk-menu-item__sub">
                Soft glassy tones for actions &amp; alerts
              </div>
            </span>
          </span>
          <span
            className={`menu-toggle-switch ${feedbackPrefs.soundEnabled ? 'menu-toggle-switch--on' : ''}`}
            aria-hidden="true"
          >
            <span className="menu-toggle-switch__knob" />
          </span>
        </button>

        {/* Device / Phone Push Alert Preferences */}
        <button
          type="button"
          role="switch"
          aria-checked={notifPermission === 'granted' && notifEnabled}
          className="gk-menu-item"
          onClick={() => {
            if (notifPermission === 'unsupported') {
              triggerFeedback('warning');
              onNotify?.(
                'On iPhone/iPad, open via Safari -> Share -> Add to Home Screen first for alerts.',
                'info',
              );
              return;
            }
            if (notifPermission === 'denied') {
              triggerFeedback('warning');
              onNotify?.(
                'Blocked in browser — allow Notifications in your site settings.',
                'error',
              );
              return;
            }
            if (notifPermission === 'default') {
              triggerFeedback('tap');
              void requestDeviceNotificationPermission().then((res) => {
                setNotifPermission(res.permission);
                setNotifEnabled(res.granted);
                if (res.granted) {
                  void ensureWebPushSubscription(trip.code, activeMember?.id ?? 'guest');
                  onNotify?.(
                    res.shown
                      ? 'Phone notifications active! Check your notification shade.'
                      : res.error || 'Permission granted',
                    'success',
                  );
                } else {
                  onNotify?.(res.error || 'Notification permission declined', 'info');
                }
              });
              return;
            }
            const next = !notifEnabled;
            setDeviceNotificationsEnabled(next);
            setNotifEnabled(next);
            if (next) {
              triggerFeedback('toggle', { forceHaptic: true });
              void ensureWebPushSubscription(trip.code, activeMember?.id ?? 'guest').then(
                (pushRes) => {
                  void tryShowDeviceNotification({
                    title: 'GASKEUN! Notifications On',
                    body: pushRes.ok
                      ? 'Background push is active on this phone.'
                      : 'Local alerts on. Check background push setup.',
                    tag: `gaskeun-test-${Date.now()}`,
                  }).then((r) => {
                    if (pushRes.ok) {
                      onNotify?.(
                        r.ok
                          ? 'Background push active! Check your notification shade.'
                          : 'Background push registered on this device.',
                        'success',
                      );
                    } else {
                      onNotify?.(
                        pushRes.error
                          ? `Push setup issue: ${pushRes.error}`
                          : `Background push status: ${pushRes.status}`,
                        'info',
                      );
                    }
                  });
                },
              );
            } else {
              triggerFeedback('tap');
              void removeWebPushSubscription();
              onNotify?.('Phone notifications paused', 'info');
            }
          }}
        >
          <span className="gk-menu-item__left">
            <span className="gk-menu-item__icon">
              {notifPermission === 'granted' && notifEnabled ? (
                <Bell size={18} strokeWidth={1.85} />
              ) : (
                <BellOff size={18} strokeWidth={1.8} />
              )}
            </span>
            <span>
              <div className="gk-menu-item__title">Phone Notifications</div>
              <div className="gk-menu-item__sub">
                {notifPermission === 'unsupported'
                  ? 'iOS Safari: add to Home Screen first'
                  : notifPermission === 'denied'
                    ? 'Blocked — allow in browser site settings'
                    : notifPermission === 'granted'
                      ? notifEnabled
                        ? 'Alerting for Crew Chat & shared updates'
                        : 'Paused on this device'
                      : 'Tap to allow Crew Chat & trip alerts'}
              </div>
            </span>
          </span>
          <span
            className={`menu-toggle-switch ${
              notifPermission === 'granted' && notifEnabled ? 'menu-toggle-switch--on' : ''
            }`}
            aria-hidden="true"
          >
            <span className="menu-toggle-switch__knob" />
          </span>
        </button>

        {notifPermission === 'granted' && notifEnabled && (
          <button
            type="button"
            className="gk-menu-item tactile"
            onClick={() => {
              triggerFeedback('tap');
              const memberId = activeMember?.id ?? 'guest';
              onNotify?.('Checking Service Worker & Push...', 'info');
              void verifyActivePushServiceWorker().then((swCheck) => {
                if (!swCheck.pushCapable) {
                  onNotify?.(
                    `Old/inactive SW (${swCheck.state ?? 'none'}). Close & reopen app once, then retry.`,
                    'error',
                  );
                  return;
                }
                void ensureWebPushSubscription(trip.code, memberId).then((subRes) => {
                  if (!subRes.ok) {
                    onNotify?.(
                      subRes.error
                        ? `Push registration failed: ${subRes.error}`
                        : `Push status: ${subRes.status}`,
                      'error',
                    );
                    return;
                  }
                  onNotify?.(
                    `SW ${swCheck.version} OK — sending server push in 3s...`,
                    'info',
                  );
                  let receivedBySw = false;
                  const onSwDebug = (ev: MessageEvent) => {
                    const msg = ev.data as { type?: string; phase?: string; error?: string } | null;
                    if (msg?.type !== 'GASKEUN_PUSH_DEBUG') return;
                    if (msg.phase === 'received') {
                      receivedBySw = true;
                      onNotify?.('FCM push received by device SW!', 'success');
                    } else if (msg.phase === 'error') {
                      onNotify?.(`SW notification error: ${msg.error || 'unknown'}`, 'error');
                    }
                  };
                  if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.addEventListener('message', onSwDebug);
                  }
                  window.setTimeout(() => {
                    void dispatchBackgroundPushDetailed({
                      tripCode: trip.code,
                      senderId: memberId,
                      targetMemberId: memberId,
                      title: `${trip.title || trip.code} • Test Push`,
                      body: 'Background push is working on this phone!',
                      tag: `test-push-${Date.now()}`,
                      renotify: true,
                      openChat: true,
                      forceShow: true,
                    }).then((pushRes) => {
                      if (!pushRes.ok || (pushRes.sent ?? 0) === 0) {
                        onNotify?.(
                          pushRes.error || `Server sent 0/${pushRes.totalTargets ?? 0}`,
                          'error',
                        );
                      } else {
                        onNotify?.(
                          `Server sent ${pushRes.sent}/${pushRes.totalTargets ?? pushRes.sent} — waiting for FCM...`,
                          'info',
                        );
                        window.setTimeout(() => {
                          if ('serviceWorker' in navigator) {
                            navigator.serviceWorker.removeEventListener('message', onSwDebug);
                          }
                          if (!receivedBySw && document.visibilityState === 'visible') {
                            onNotify?.(
                              'Server sent OK, but FCM did not reach phone (check DNS/VPN/Chrome Push).',
                              'error',
                            );
                          }
                        }, 6000);
                      }
                    });
                  }, 3000);
                });
              });
            }}
          >
            <span className="gk-menu-item__left">
              <span className="gk-menu-item__icon">
                <Bell size={18} strokeWidth={1.85} />
              </span>
              <span>
                <div className="gk-menu-item__title">Send Test Background Push</div>
                <div className="gk-menu-item__sub">
                  Checks SW + sends server push in 3s
                </div>
              </span>
            </span>
            <ChevronRight size={17} strokeWidth={1.85} color="var(--text-muted)" />
          </button>
        )}

        {notifPermission === 'granted' && notifEnabled && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -4, paddingRight: 4 }}>
            <button
              type="button"
              className="crew-chat-drawer__pill tactile"
              style={{
                padding: '4px 11px',
                borderRadius: 999,
                background: 'var(--brand-matcha-soft)',
                color: 'var(--brand-forest)',
                fontSize: 11,
                fontWeight: 700,
              }}
              onClick={() => {
                triggerFeedback('tap');
                void tryShowDeviceNotification({
                  title: 'GASKEUN! Test Notification',
                  body: `Live alert test for ${trip.title}`,
                  tag: `gaskeun-manual-${Date.now()}`,
                }).then((r) => {
                  onNotify?.(
                    r.ok
                      ? 'Test alert sent to your notification bar!'
                      : r.error || 'Blocked by OS/browser',
                    r.ok ? 'success' : 'error',
                  );
                });
              }}
            >
              Send Test Notification
            </button>
          </div>
        )}

        {onOpenChat && (
          <button
            type="button"
            className="gk-menu-item tactile"
            onClick={() => {
              triggerFeedback('tap');
              onClose();
              onOpenChat();
            }}
          >
            <span className="gk-menu-item__left">
              <span
                className="gk-menu-item__icon"
                style={{
                  background: 'var(--brand-matcha-soft)',
                  color: 'var(--brand-forest)',
                }}
              >
                <MessageCircle size={18} strokeWidth={1.85} />
              </span>
              <span>
                <div className="gk-menu-item__title">Crew Chat</div>
                <div className="gk-menu-item__sub">
                  Text, stickers &amp; emoji reactions
                </div>
              </span>
            </span>
            {unreadChatCount > 0 ? (
              <Badge tone="coral">
                {unreadChatCount > 99 ? '99+' : `${unreadChatCount} new`}
              </Badge>
            ) : (
              <Badge tone="neutral">Open</Badge>
            )}
          </button>
        )}

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
              <div
                className="gk-menu-item__sub"
                style={lastSyncError && !isSyncingCloud ? { color: 'var(--accent-coral)' } : undefined}
              >
                {isSyncingCloud
                  ? 'Syncing with Supabase...'
                  : lastSyncError
                    ? `Sync failed · ${lastSyncError}`
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
                    Assign module edit rights &amp; member passcodes
                  </div>
                </span>
              </span>
              <Badge tone="matcha">
                {Math.max(1, activeEditorCount)} active
              </Badge>
            </button>

            {showEditorsList && (
              <div className="menu-crew-panel">
                {trip.members.map((m) => {
                  const isCreator = Boolean(m.isCreator);
                  const memberScopes = getMemberEditScopes(trip, m.id);
                  const memberSummary = formatMemberAccessLabel(trip, m.id);
                  const hasPin = memberHasPasscode(m);
                  const isSettingHostPin = hostPinTargetId === m.id;

                  return (
                    <div key={m.id} className="menu-crew-row-card">
                      <div className="menu-crew-row-top">
                        <div className="menu-crew-member-btn">
                          <Avatar
                            initials={m.initials}
                            name={m.name}
                            src={m.avatarDataUrl}
                            size="sm"
                            bg={m.avatarBg}
                            color={m.avatarColor}
                          />
                          <div style={{ minWidth: 0 }}>
                            <div className="menu-crew-member-name">
                              {m.name}
                              {hasPin && (
                                <Lock
                                  size={11}
                                  strokeWidth={2.2}
                                  color="var(--brand-matcha)"
                                  style={{ marginLeft: 5, verticalAlign: '-1px' }}
                                />
                              )}
                            </div>
                            <div className="menu-crew-member-meta">{memberSummary}</div>
                          </div>
                        </div>

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

                          {isCreator && <Badge tone="matcha">Host</Badge>}
                        </div>
                      </div>

                      {!isCreator && (
                        <div className="menu-scope-row" role="group" aria-label={`Module permissions for ${m.name}`}>
                          {TRIP_EDIT_SCOPE_META.map((meta) => {
                            const active = memberScopes.includes(meta.scope);
                            return (
                              <button
                                key={meta.scope}
                                type="button"
                                aria-pressed={active}
                                className={`menu-scope-chip tactile ${
                                  active ? 'menu-scope-chip--on' : ''
                                }`}
                                onClick={() => {
                                  triggerFeedback('tap');
                                  onToggleMemberScope(m.id, meta.scope);
                                }}
                              >
                                {active && <Check size={11} strokeWidth={2.6} />}
                                <span>{meta.shortLabel}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}

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

            {/* Host-Only: Shared Edit Activity Log */}
            <button
              type="button"
              className="gk-menu-item"
              onClick={() => {
                triggerFeedback('tap');
                setLogFilter('all');
                setActivityLogOpen(true);
              }}
            >
              <span className="gk-menu-item__left">
                <span className="gk-menu-item__icon">
                  <History size={18} strokeWidth={1.8} />
                </span>
                <span>
                  <div className="gk-menu-item__title">Activity Log</div>
                  <div className="gk-menu-item__sub">
                    See who edited the trip and when
                  </div>
                </span>
              </span>
              <Badge tone="neutral">{(trip.editLog ?? []).length}</Badge>
            </button>
          </>
        )}

        {/* Trip Settings (Host Only, hidden in View-Only Mode) */}
        {isHost && !viewOnlyMode && (
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

        {onOpenRecap && (
          <button
            type="button"
            className="gk-menu-item"
            onClick={() => {
              resetLocalPanels();
              onClose();
              onOpenRecap();
            }}
          >
            <span className="gk-menu-item__left">
              <span className="gk-menu-item__icon">
                <Sparkles size={18} strokeWidth={1.8} />
              </span>
              <span>
                <div className="gk-menu-item__title">Trip Recap (Wrapped)</div>
                <div className="gk-menu-item__sub">
                  9:16 story summary &amp; crew awards PNG
                </div>
              </span>
            </span>
          </button>
        )}

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

      {/* Host-Only Activity Log Bottom Sheet */}
      {isHost && (
        <LiquidBottomSheet
          open={activityLogOpen}
          title="Activity Log"
          subtitle="Recent shared edits · Host only"
          onClose={() => setActivityLogOpen(false)}
        >
          {(() => {
            const allEntries = trip.editLog ?? [];
            const filtered =
              logFilter === 'all'
                ? allEntries
                : allEntries.filter((e) => e.category === logFilter);
            const memberById = new Map(trip.members.map((m) => [m.id, m]));

            return (
              <div className="activity-log-wrap">
                <div className="activity-log-filters" role="tablist" aria-label="Filter activity log">
                  {(
                    [
                      { id: 'all', label: 'All' },
                      { id: 'plan', label: 'Plan' },
                      { id: 'wallet', label: 'Wallet' },
                      { id: 'crew', label: 'Crew' },
                      { id: 'prep', label: 'Prep' },
                      { id: 'album', label: 'Album' },
                      { id: 'settings', label: 'Settings' },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      role="tab"
                      aria-selected={logFilter === f.id}
                      className={`activity-log-chip tactile ${
                        logFilter === f.id ? 'activity-log-chip--active' : ''
                      }`}
                      onClick={() => {
                        triggerFeedback('tap');
                        setLogFilter(f.id);
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {filtered.length === 0 ? (
                  <p className="activity-log-empty">
                    {allEntries.length === 0
                      ? 'No edits recorded yet. Shared changes by Host & Editors will appear here.'
                      : 'No edits in this category yet.'}
                  </p>
                ) : (
                  <div className="activity-log-list">
                    {filtered.map((entry) => {
                      const actor = memberById.get(entry.actorId);
                      const initials =
                        actor?.initials || entry.actorName.slice(0, 1).toUpperCase() || 'G';
                      return (
                        <div key={entry.id} className="activity-log-row">
                          <Avatar
                            initials={initials}
                            name={entry.actorName}
                            src={actor?.avatarDataUrl}
                            size="sm"
                            bg={actor?.avatarBg ?? '#EAEFED'}
                            color={actor?.avatarColor ?? '#546860'}
                          />
                          <div className="activity-log-row__body">
                            <div className="activity-log-row__head">
                              <span className="activity-log-row__actor">{entry.actorName}</span>
                              <span className="activity-log-row__cat">
                                {formatEditLogCategoryLabel(entry.category)}
                              </span>
                            </div>
                            <div className="activity-log-row__action">{entry.action}</div>
                            <div className="activity-log-row__time">
                              {formatRelativeLogTime(entry.timestamp)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {allEntries.length > 0 && onClearEditLog && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<Trash2 size={13.5} strokeWidth={2} />}
                      onClick={() => setConfirmClearLog(true)}
                    >
                      Clear Log
                    </Button>
                  </div>
                )}
              </div>
            );
          })()}
        </LiquidBottomSheet>
      )}

      <ConfirmDialog
        open={confirmClearLog}
        title="Clear activity log?"
        description="This removes the edit history list for this trip. Trip itinerary, wallet, and crew data stay untouched."
        confirmLabel="Clear Log"
        destructive
        onCancel={() => setConfirmClearLog(false)}
        onConfirm={() => {
          setConfirmClearLog(false);
          onClearEditLog?.();
        }}
      />

      <ImageSourceSheet
        open={avatarSourceOpen}
        title="Profile Photo"
        cameraFacing="user"
        onPick={(file) => setCropFile(file)}
        onInvalidFile={(msg) => onNotify?.(msg, 'error')}
        onClose={() => setAvatarSourceOpen(false)}
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
