import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, KeyRound, Lock, UserRound } from 'lucide-react';
import { Avatar, Button, CornerOrb, LiquidBottomSheet } from '../../components/atoms';
import { triggerFeedback } from '../../services/feedback';
import {
  isValidPasscode,
  memberHasPasscode,
  normalizePasscode,
  verifyMemberPasscode,
} from '../../services/permissions';
import type { SharedTrip, TripMember } from '../../types/trip';
import './gate.css';

export interface WhoAreYouScreenProps {
  trip: SharedTrip;
  selectedMemberId: string | null;
  onSelectProfile: (memberId: string, opts?: { justSetPasscode?: boolean }) => void;
  onSetMemberPasscode: (memberId: string, passcode: string | undefined, toastMsg?: string) => void;
  onBack: () => void;
}

export function WhoAreYouScreen({
  trip,
  selectedMemberId,
  onSelectProfile,
  onSetMemberPasscode,
  onBack,
}: WhoAreYouScreenProps) {
  const [pendingPickId, setPendingPickId] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [showOptionalSetup, setShowOptionalSetup] = useState(false);
  const [pinError, setPinError] = useState('');
  const [shakeCount, setShakeCount] = useState(0);

  const pendingMember: TripMember | undefined =
    pendingPickId && pendingPickId !== 'guest'
      ? trip.members.find((m) => m.id === pendingPickId)
      : undefined;
  const pendingName = pendingPickId === 'guest' ? 'Guest' : pendingMember?.name ?? '';
  const pendingRequiresPin = memberHasPasscode(pendingMember);

  const openProfileSheet = (id: string) => {
    setPendingPickId(id);
    setPinInput('');
    setShowPin(false);
    setShowOptionalSetup(false);
    setPinError('');
    setShakeCount(0);
  };

  const closeProfileSheet = () => {
    setPendingPickId(null);
    setPinInput('');
    setShowPin(false);
    setShowOptionalSetup(false);
    setPinError('');
  };

  const triggerPinError = (msg: string) => {
    setPinError(msg);
    setShakeCount((c) => c + 1);
  };

  const handleConfirmJoin = (e?: FormEvent) => {
    e?.preventDefault();
    if (!pendingPickId) return;

    let justSetPasscode = false;
    if (pendingMember) {
      if (pendingRequiresPin) {
        if (!isValidPasscode(pinInput)) {
          triggerFeedback('warning');
          triggerPinError('Enter your 4-digit passcode');
          return;
        }
        if (!verifyMemberPasscode(pendingMember, pinInput)) {
          triggerFeedback('warning');
          triggerPinError('Incorrect passcode. Ask your host to reset it.');
          setPinInput('');
          return;
        }
      } else if (showOptionalSetup && pinInput.length > 0) {
        if (!isValidPasscode(pinInput)) {
          triggerFeedback('warning');
          triggerPinError('Enter all 4 digits, or clear to continue without a passcode');
          return;
        }
        onSetMemberPasscode(pendingMember.id, pinInput, 'Personal 4-digit passcode saved');
        justSetPasscode = true;
      }
    }

    triggerFeedback('success');
    const chosen = pendingPickId;
    closeProfileSheet();
    onSelectProfile(chosen, { justSetPasscode });
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
            const hasPin = memberHasPasscode(member);
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
                onClick={() => openProfileSheet(member.id)}
              >
                {hasPin && (
                  <span
                    className={`crew-pick-card__lock ${
                      isSelected ? 'crew-pick-card__lock--selected' : ''
                    }`}
                    aria-label="Passcode protected"
                  >
                    <Lock size={10.5} strokeWidth={2.3} />
                  </span>
                )}
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
            onClick={() => openProfileSheet('guest')}
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

      <p className="gate-footer-note">Tap your profile to continue</p>

      {/* Crystal Liquid Profile Join Confirmation + 4-Digit Passcode Guard */}
      <LiquidBottomSheet
        open={Boolean(pendingPickId)}
        title={pendingName ? `Join as ${pendingName}?` : ''}
        subtitle={trip.title}
        onClose={closeProfileSheet}
      >
        <form onSubmit={handleConfirmJoin}>
          <div className="who-sheet-body">
            {pendingMember ? (
              <>
                <Avatar
                  initials={pendingMember.initials}
                  name={pendingMember.name}
                  src={pendingMember.avatarDataUrl}
                  size="xl"
                  bg={pendingMember.avatarBg}
                  color={pendingMember.avatarColor}
                  variant="selected"
                />

                {/* Required 4-Digit Passcode Prompt for Locked Profiles */}
                {pendingRequiresPin ? (
                  <div
                    key={shakeCount}
                    className={`who-pin-card ${shakeCount > 0 ? 'who-pin-shake' : ''}`}
                  >
                    <label htmlFor="who-passcode-input" className="gk-field__label">
                      4-DIGIT PASSCODE
                    </label>
                    <div
                      className={`who-pin-shell ${pinError ? 'who-pin-shell--error' : ''}`}
                    >
                      <Lock size={15} strokeWidth={2} color="var(--brand-matcha)" />
                      <input
                        id="who-passcode-input"
                        type={showPin ? 'text' : 'password'}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={4}
                        autoComplete="one-time-code"
                        placeholder="••••"
                        value={pinInput}
                        className="who-pin-input"
                        onFocus={(e) => {
                          const target = e.currentTarget;
                          window.setTimeout(() => {
                            target.scrollIntoView({ block: 'center', behavior: 'smooth' });
                          }, 120);
                        }}
                        onChange={(e) => {
                          setPinError('');
                          setPinInput(normalizePasscode(e.target.value));
                        }}
                      />
                      <button
                        type="button"
                        className="who-pin-eye"
                        aria-label={showPin ? 'Hide passcode' : 'Show passcode'}
                        onClick={() => setShowPin((s) => !s)}
                      >
                        {showPin ? <EyeOff size={16} strokeWidth={1.9} /> : <Eye size={16} strokeWidth={1.9} />}
                      </button>
                    </div>
                    {pinError ? (
                      <p className="who-pin-error">{pinError}</p>
                    ) : (
                      <p className="who-pin-hint">
                        Enter your personal code to sign in as {pendingMember.name}
                      </p>
                    )}
                  </div>
                ) : (
                  /* Optional First-Time Passcode Lock for Unlocked Profiles */
                  <div className="who-pin-optional-wrap">
                    {!showOptionalSetup ? (
                      <button
                        type="button"
                        className="who-pin-optional-toggle tactile"
                        onClick={() => setShowOptionalSetup(true)}
                      >
                        <KeyRound size={13.5} strokeWidth={2} />
                        <span>Set 4-digit passcode (optional)</span>
                      </button>
                    ) : (
                      <div
                        key={shakeCount}
                        className={`who-pin-card ${shakeCount > 0 ? 'who-pin-shake' : ''}`}
                      >
                        <div className="who-pin-optional-head">
                          <label htmlFor="who-opt-passcode" className="gk-field__label">
                            SET 4-DIGIT PASSCODE (OPTIONAL)
                          </label>
                          <button
                            type="button"
                            className="who-pin-skip"
                            onClick={() => {
                              setShowOptionalSetup(false);
                              setPinInput('');
                              setPinError('');
                            }}
                          >
                            Skip
                          </button>
                        </div>
                        <div
                          className={`who-pin-shell ${pinError ? 'who-pin-shell--error' : ''}`}
                        >
                          <Lock size={15} strokeWidth={2} color="var(--brand-matcha)" />
                          <input
                            id="who-opt-passcode"
                            type={showPin ? 'text' : 'password'}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={4}
                            placeholder="••••"
                            value={pinInput}
                            className="who-pin-input"
                            onFocus={(e) => {
                              const target = e.currentTarget;
                              window.setTimeout(() => {
                                target.scrollIntoView({ block: 'center', behavior: 'smooth' });
                              }, 120);
                            }}
                            onChange={(e) => {
                              setPinError('');
                              setPinInput(normalizePasscode(e.target.value));
                            }}
                          />
                          <button
                            type="button"
                            className="who-pin-eye"
                            aria-label={showPin ? 'Hide passcode' : 'Show passcode'}
                            onClick={() => setShowPin((s) => !s)}
                          >
                            {showPin ? <EyeOff size={16} strokeWidth={1.9} /> : <Eye size={16} strokeWidth={1.9} />}
                          </button>
                        </div>
                        {pinError ? (
                          <p className="who-pin-error">{pinError}</p>
                        ) : (
                          <p className="who-pin-hint">
                            Keeps others from tapping your profile by mistake
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
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
            <Button variant="glass" size="lg" onClick={closeProfileSheet}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="matcha"
              size="lg"
              disabled={pendingRequiresPin && pinInput.length < 4}
            >
              Continue
            </Button>
          </div>
        </form>
      </LiquidBottomSheet>
    </section>
  );
}
