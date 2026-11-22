import { useState } from 'react';
import { Lock, UserRound } from 'lucide-react';
import { Avatar, Button, ConfirmDialog, CornerOrb } from '../../components/atoms';
import type { SharedTrip } from '../../types/trip';
import './gate.css';

export interface WhoAreYouScreenProps {
  trip: SharedTrip;
  selectedMemberId: string | null;
  canEdit: boolean;
  onSelectProfile: (memberId: string) => void;
  onRequestUnlockPin: () => void;
  onBack: () => void;
}

export function WhoAreYouScreen({
  trip,
  selectedMemberId,
  canEdit,
  onSelectProfile,
  onRequestUnlockPin,
  onBack,
}: WhoAreYouScreenProps) {
  const [pendingPick, setPendingPick] = useState<{ id: string; name: string } | null>(null);

  return (
    <section className="gate-screen" aria-label="Choose your profile">
      <div>
        {/* Clean Back Orb only — redundant trip code badge removed */}
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
                onClick={() => setPendingPick({ id: member.id, name: member.name })}
              >
                <Avatar
                  initials={member.initials}
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
            onClick={() => setPendingPick({ id: 'guest', name: 'Guest' })}
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

      {/* Crystal Liquid Profile Join Confirmation */}
      <ConfirmDialog
        open={Boolean(pendingPick)}
        title={pendingPick ? `Join as ${pendingPick.name}?` : ''}
        description={`You'll enter ${trip.title} as ${pendingPick?.name ?? 'Guest'}. You can switch profiles anytime from the menu.`}
        cancelLabel="Cancel"
        confirmLabel="Continue →"
        onCancel={() => setPendingPick(null)}
        onConfirm={() => {
          if (pendingPick) {
            const targetId = pendingPick.id;
            setPendingPick(null);
            onSelectProfile(targetId);
          }
        }}
      />
    </section>
  );
}
