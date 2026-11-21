import { useState, type FormEvent } from 'react';
import { ArrowRight, Check, ChevronDown, ChevronUp, Copy, Sparkles } from 'lucide-react';
import { Badge, Button, CornerOrb, GlassCard, Input } from '../../components/atoms';
import { buildInviteUrl, buildNewTrip, normalizeTripCode } from '../../services/tripFactory';
import type { SharedTrip } from '../../types/trip';
import './gate.css';

export interface CreateTripScreenProps {
  onCreated: (trip: SharedTrip) => Promise<void>;
  onOpenTrip: (trip: SharedTrip) => void;
  onCopyInvite: (url: string) => void;
  onBack: () => void;
}

export function CreateTripScreen({
  onCreated,
  onOpenTrip,
  onCopyInvite,
  onBack,
}: CreateTripScreenProps) {
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('2027-05-01');
  const [startTime, setStartTime] = useState('08:00');
  const [endDate, setEndDate] = useState('2027-05-04');
  const [creatorName, setCreatorName] = useState('');
  const [crewPin, setCrewPin] = useState('');

  const [showOptional, setShowOptional] = useState(false);
  const [poolTarget, setPoolTarget] = useState('');
  const [fundraiseTarget, setFundraiseTarget] = useState('');
  const [customCode, setCustomCode] = useState('');

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [createdTrip, setCreatedTrip] = useState<SharedTrip | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Give your trip a name (e.g. Bali Escape).');
      return;
    }
    if (!creatorName.trim()) {
      setError('Enter your name so we can add you as trip host.');
      return;
    }
    if (!/^\d{4}$/.test(crewPin)) {
      setError('Crew Edit PIN must be exactly 4 digits.');
      return;
    }
    if (endDate < startDate) {
      setError('End date must be on or after the start date.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const trip = await buildNewTrip({
        title,
        startDate,
        startTime,
        endDate,
        creatorName,
        crewPin,
        poolTargetPerPerson: poolTarget ? Number(poolTarget.replace(/\D/g, '')) : 0,
        fundraiseTarget: fundraiseTarget ? Number(fundraiseTarget.replace(/\D/g, '')) : 0,
        customCode: customCode || undefined,
      });
      await onCreated(trip);
      setCreatedTrip(trip);
    } catch {
      setError('Could not create trip. Try a different custom code.');
    } finally {
      setBusy(false);
    }
  };

  if (createdTrip) {
    const inviteUrl = buildInviteUrl(createdTrip.code);
    return (
      <section className="gate-screen" aria-label="Trip created">
        <div className="gate-center-hero">
          <GlassCard variant="spotlight" padding="lg" style={{ width: '100%', textAlign: 'center' }}>
            <Badge tone="mint" icon={<Sparkles size={12} strokeWidth={2} />}>
              Trip Ready
            </Badge>
            <div className="create-success-code">{createdTrip.code}</div>
            <p style={{ margin: '0 0 16px', fontSize: 13.5, color: 'var(--text-secondary)' }}>
              <strong>{createdTrip.title}</strong> · {createdTrip.subtitle}
            </p>

            <div className="create-link-box">{inviteUrl}</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
              <Button
                variant="glass"
                size="md"
                fullWidth
                leftIcon={copied ? <Check size={16} strokeWidth={2} /> : <Copy size={16} strokeWidth={1.8} />}
                onClick={() => {
                  onCopyInvite(inviteUrl);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? 'Invite Link Copied' : 'Copy Invite Link'}
              </Button>
              <Button
                variant="matcha"
                size="lg"
                fullWidth
                rightIcon={<ArrowRight size={18} strokeWidth={2} />}
                onClick={() => onOpenTrip(createdTrip)}
              >
                Open Trip Hub
              </Button>
            </div>
          </GlassCard>
        </div>
      </section>
    );
  }

  return (
    <section className="gate-screen" aria-label="Create new trip">
      <div>
        <div className="gate-nav-row">
          <CornerOrb kind="back" ariaLabel="Back to landing" onClick={onBack} />
          <Badge tone="neutral">New Trip</Badge>
        </div>

        <div className="gate-page-head">
          <h1 className="gate-page-title">Create New Trip</h1>
          <p className="gate-page-sub">Set your dates and a 4-digit crew PIN to start.</p>
        </div>

        <GlassCard variant="clear" padding="lg">
          <form className="create-form" onSubmit={handleSubmit}>
            <Input
              id="create-trip-name"
              label="Trip Name"
              placeholder="e.g. Bali Escape"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            <div className="create-two-col">
              <Input
                id="create-start-date"
                label="Start Date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <Input
                id="create-start-time"
                label="Start Time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>

            <Input
              id="create-end-date"
              label="End Date"
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
            />

            <div className="create-two-col">
              <Input
                id="create-creator"
                label="Your Name"
                placeholder="e.g. Kris"
                value={creatorName}
                onChange={(e) => setCreatorName(e.target.value)}
              />
              <Input
                id="create-pin"
                label="4-Digit Crew PIN"
                type="password"
                inputMode="numeric"
                maxLength={4}
                placeholder="1234"
                value={crewPin}
                onChange={(e) => setCrewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              />
            </div>

            <button
              type="button"
              className="create-optional-toggle tactile"
              onClick={() => setShowOptional((v) => !v)}
            >
              <span>Optional: Budget Targets &amp; Custom Code</span>
              {showOptional ? <ChevronUp size={16} strokeWidth={2} /> : <ChevronDown size={16} strokeWidth={2} />}
            </button>

            {showOptional && (
              <div className="create-form">
                <div className="create-two-col">
                  <Input
                    id="create-pool-target"
                    label="Pool / Person (IDR)"
                    inputMode="numeric"
                    placeholder="700000"
                    value={poolTarget}
                    onChange={(e) => setPoolTarget(e.target.value.replace(/\D/g, ''))}
                  />
                  <Input
                    id="create-fund-target"
                    label="Fundraise Goal"
                    inputMode="numeric"
                    placeholder="1200000"
                    value={fundraiseTarget}
                    onChange={(e) => setFundraiseTarget(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
                <Input
                  id="create-custom-code"
                  label="Custom Trip Code"
                  placeholder="BALI-27 (auto if empty)"
                  value={customCode}
                  onChange={(e) => setCustomCode(normalizeTripCode(e.target.value))}
                />
              </div>
            )}

            {error && (
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-coral)' }}>
                {error}
              </span>
            )}

            <Button type="submit" variant="matcha" size="lg" fullWidth disabled={busy}>
              {busy ? 'Creating Trip...' : 'Generate Trip Code'}
            </Button>
          </form>
        </GlassCard>
      </div>
    </section>
  );
}
