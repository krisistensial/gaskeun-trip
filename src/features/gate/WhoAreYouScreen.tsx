import { useRef, useState } from 'react';
import { Camera, Lock, UserRound } from 'lucide-react';
import { Avatar, Button, CornerOrb, LiquidBottomSheet } from '../../components/atoms';
import { compressAvatarSquare } from '../../services/tripFactory';
import type { SharedTrip, TripMember } from '../../types/trip';
import './gate.css';

export interface WhoAreYouScreenProps {
  trip: SharedTrip;
  selectedMemberId: string | null;
  canEdit: boolean;
  onSelectProfile: (memberId: string) => void;
  onUpdateMemberAvatar: (memberId: string, avatarDataUrl: string) => void;
  onRequestUnlockPin: () => void;
  onBack: () => void;
}

export function WhoAreYouScreen({
  trip,
  selectedMemberId,
  canEdit,
  onSelectProfile,
  onUpdateMemberAvatar,
  onRequestUnlockPin,
  onBack,
}: WhoAreYouScreenProps) {
  const [pendingPickId, setPendingPickId] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const pendingMember: TripMember | undefined =
    pendingPickId && pendingPickId !== 'guest'
      ? trip.members.find((m) => m.id === pendingPickId)
      : undefined;
  const pendingName = pendingPickId === 'guest' ? 'Guest' : pendingMember?.name ?? '';

  const handleAvatarFile = async (file: File) => {
    if (!pendingMember) return;
    try {
      const dataUrl = await compressAvatarSquare(file, 256);
      onUpdateMemberAvatar(pendingMember.id, dataUrl);
    } catch {
      // ignore invalid image
    }
  };

  return (
    <section className="gate-screen" aria-label="Choose your profile">
      <div>
        <div className="gate-nav-row">
          <CornerOrb kind="back" ariaLabel="Back to trip code" onClick={onBack} />
        </div>

        <div className="gate-page-head">
          <h1 className="gate-page-title">Who&apos;s joining?</h1>
          <p className="gate-page-sub">
            {trip.title} · {trip.subtitle.split('·')[0].trim()}
          </p>
        </div>

        <div className="crew-pick-grid">
          {trip.members.map((member) => {
            const isSelected = selectedMemberId === member.id;
            const isTentative = member.status === 'tentative';
            return (
              <button
                key={member.id}
                type="button"
                className={[
                  'crew-pick-card',
                  isSelected ? 'crew-pick-card--selected' : '',
                  !isSelected && isTentative ? 'crew-pick-card--tentative' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setPendingPickId(member.id)}
              >
                <Avatar
                  initials={member.initials}
                  name={member.name}
                  src={member.avatarDataUrl}
                  size="md"
                  bg={isSelected ? '#E3EDE6' : member.avatarBg}
                  color={isSelected ? '#2D4A42' : member.avatarColor}
                  variant={member.role === 'passenger' ? 'passenger' : 'solid'}
                />
                <span className="crew-pick-card__name">
                  {isTentative ? `${member.name}?` : member.name}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            className={`crew-pick-card ${selectedMemberId === 'guest' ? 'crew-pick-card--selected' : ''}`}
            onClick={() => setPendingPickId('guest')}
          >
            <span
              className="gk-avatar gk-avatar--md gk-avatar--solid"
              style={{
                backgroundColor: selectedMemberId === 'guest' ? '#E3EDE6' : '#EAEFED',
                color: selectedMemberId === 'guest' ? '#2D4A42' : '#546860',
              }}
            >
              <UserRound size={18} strokeWidth={1.8} />
            </span>
            <span className="crew-pick-card__name">Guest</span>
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Button
          variant="glass"
          size="lg"
          fullWidth
          leftIcon={<Lock size={16} strokeWidth={1.8} />}
          onClick={onRequestUnlockPin}
        >
          {canEdit ? 'Crew Editing Unlocked' : 'Unlock Crew Editing (4-digit PIN)'}
        </Button>
        <p className="gate-footer-note">Tap your profile to continue</p>
      </div>

      {/* Crystal Liquid Profile Join Confirmation + Optional Face Photo Upload */}
      <LiquidBottomSheet
        open={Boolean(pendingPickId)}
        title={pendingName ? `Join as ${pendingName}?` : ''}
        subtitle={trip.title}
        onClose={() => setPendingPickId(null)}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            padding: '6px 0 18px',
          }}
        >
          {pendingMember ? (
            <>
              <button
                type="button"
                className="tactile"
                onClick={() => avatarInputRef.current?.click()}
                style={{
                  position: 'relative',
                  display: 'inline-flex',
                  borderRadius: '50%',
                }}
                aria-label="Add or change profile photo"
              >
                <Avatar
                  initials={pendingMember.initials}
                  name={pendingMember.name}
                  src={pendingMember.avatarDataUrl}
                  size="xl"
                  bg={pendingMember.avatarBg}
                  color={pendingMember.avatarColor}
                  variant="selected"
                />
                <span
                  style={{
                    position: 'absolute',
                    right: -2,
                    bottom: -2,
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    background: 'var(--brand-matcha)',
                    color: '#FFFFFF',
                    border: '2px solid #FFFFFF',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Camera size={13} strokeWidth={2} />
                </span>
              </button>
              <Button
                variant="glass"
                size="sm"
                leftIcon={<Camera size={13} strokeWidth={2} />}
                onClick={() => avatarInputRef.current?.click()}
              >
                {pendingMember.avatarDataUrl ? 'Change photo' : 'Add photo'}
              </Button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    void handleAvatarFile(f);
                    e.target.value = '';
                  }
                }}
              />
            </>
          ) : (
            <span
              className="gk-avatar gk-avatar--xl gk-avatar--solid"
              style={{ backgroundColor: '#EAEFED', color: '#546860' }}
            >
              <UserRound size={30} strokeWidth={1.8} />
            </span>
          )}
        </div>

        <div className="gk-dialog__actions">
          <Button variant="glass" size="lg" onClick={() => setPendingPickId(null)}>
            Cancel
          </Button>
          <Button
            variant="matcha"
            size="lg"
            onClick={() => {
              if (pendingPickId) {
                const chosen = pendingPickId;
                setPendingPickId(null);
                onSelectProfile(chosen);
              }
            }}
          >
            Continue
          </Button>
        </div>
      </LiquidBottomSheet>
    </section>
  );
}
