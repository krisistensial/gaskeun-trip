import { useState, type FormEvent } from 'react';
import { ArrowRight, Plus } from 'lucide-react';
import { Button, GlassCard } from '../../components/atoms';
import { normalizeTripCode } from '../../services/tripFactory';
import type { SharedTrip } from '../../types/trip';
import './gate.css';

export interface LandingGateScreenProps {
  savedTrips: SharedTrip[];
  initialCode?: string;
  onJoinCode: (code: string) => Promise<boolean>;
  onOpenCreate: () => void;
}

export function LandingGateScreen({
  savedTrips,
  initialCode = '',
  onJoinCode,
  onOpenCreate,
}: LandingGateScreenProps) {
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cleaned = normalizeTripCode(code);
    if (cleaned.length < 3) {
      setError('Enter a valid trip code (e.g. BALI-27)');
      return;
    }
    setBusy(true);
    setError('');
    const ok = await onJoinCode(cleaned);
    setBusy(false);
    if (!ok) {
      setError(`Trip code "${cleaned}" not found on this device.`);
    }
  };

  return (
    <section className="gate-screen" aria-label="Join a trip">
      <div className="gate-center-hero">
        <div className="gate-brand">
          <div className="gate-emblem" aria-hidden="true">
            <img
              src={`${import.meta.env.BASE_URL}pwa-192x192.png`}
              alt=""
              className="gate-emblem__img"
              width={68}
              height={68}
              decoding="async"
            />
          </div>
          <h1 className="gate-wordmark">GASKEUN!</h1>
          <p className="gate-tagline">Group trips, beautifully organized.</p>
        </div>

        <GlassCard variant="spotlight" padding="lg" className="gate-code-card">
          <form onSubmit={handleSubmit} className="gate-code-card">
            <label
              htmlFor="trip-code-input"
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: 'var(--text-secondary)',
              }}
            >
              ENTER TRIP CODE
            </label>

            <div className="gate-code-input-wrap">
              <input
                id="trip-code-input"
                className="gate-code-input"
                value={code}
                placeholder="e.g. BALI-27"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => {
                  setCode(normalizeTripCode(e.target.value));
                  setError('');
                }}
              />
              <button
                type="submit"
                className="gate-code-go"
                aria-label="Join trip"
                disabled={busy}
              >
                <ArrowRight size={20} strokeWidth={2} />
              </button>
            </div>

            {error ? (
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-coral)' }}>
                {error}
              </span>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Enter the code shared by your crew
              </span>
            )}
          </form>
        </GlassCard>

        <Button
          variant="glass"
          size="lg"
          fullWidth
          leftIcon={<Plus size={18} strokeWidth={2} />}
          onClick={onOpenCreate}
        >
          Create New Trip
        </Button>

        {savedTrips.length > 0 && (
          <div
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
            }}
            aria-label="Your saved trips"
          >
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: 'var(--text-muted)',
              }}
            >
              YOUR TRIPS
            </span>
            <div className="gate-saved-pills">
              {savedTrips.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="gate-saved-chip tactile"
                  onClick={() => void onJoinCode(t.code)}
                >
                  <span>{t.title}</span>
                  <span style={{ opacity: 0.65 }}>{t.code}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="gate-footer-note">No sign-up needed · Private to your crew</p>
    </section>
  );
}
