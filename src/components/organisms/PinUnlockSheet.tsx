import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { Button, LiquidBottomSheet } from '../atoms';
import { triggerFeedback } from '../../services/feedback';
import { verifyCrewEditPin } from '../../services/permissions';
import type { SharedTrip } from '../../types/trip';
import './sheets.css';

export interface PinUnlockSheetProps {
  open: boolean;
  trip: Pick<SharedTrip, 'code' | 'crewPinHash' | 'crewEditPin'>;
  onUnlocked: () => void;
  onClose: () => void;
}

export function PinUnlockSheet({
  open,
  trip,
  onUnlocked,
  onClose,
}: PinUnlockSheetProps) {
  const [digits, setDigits] = useState<string[]>(['', '', '', '']);
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (open) {
      setDigits(['', '', '', '']);
      setShowPin(false);
      setError('');
      window.setTimeout(() => inputRefs.current[0]?.focus(), 80);
    }
  }, [open]);

  if (!open) return null;

  const submitPin = async (pinStr: string) => {
    setChecking(true);
    setError('');
    const ok = await verifyCrewEditPin(trip, pinStr);
    setChecking(false);
    if (ok) {
      triggerFeedback('success');
      onUnlocked();
    } else {
      triggerFeedback('warning');
      setError('Incorrect 4-digit PIN. Please try again.');
      setDigits(['', '', '', '']);
      inputRefs.current[0]?.focus();
    }
  };

  const handleDigitChange = (index: number, raw: string) => {
    const clean = raw.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = clean;
    setDigits(next);
    setError('');

    if (clean && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }
    const full = next.join('');
    if (full.length === 4) {
      void submitPin(full);
    }
  };

  const handleKeyDown = (index: number, key: string) => {
    if (key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  return (
    <LiquidBottomSheet
      open={open}
      title="Unlock Crew Editing"
      subtitle="Enter the 4-digit PIN from your trip host"
      onClose={onClose}
    >
      <div className="gk-pin-row">
        {digits.map((val, i) => (
          <input
            key={i}
            ref={(el) => {
              inputRefs.current[i] = el;
            }}
            type={showPin ? 'text' : 'password'}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            placeholder="•"
            value={val}
            aria-label={`PIN digit ${i + 1}`}
            className="gk-pin-box"
            onChange={(e) => handleDigitChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e.key)}
          />
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
        <button
          type="button"
          className="gk-pin-visibility-btn tactile"
          onClick={() => setShowPin((v) => !v)}
        >
          {showPin ? <EyeOff size={13.5} strokeWidth={2} /> : <Eye size={13.5} strokeWidth={2} />}
          <span>{showPin ? 'Hide PIN' : 'Show PIN'}</span>
        </button>
      </div>

      {error && <p className="gk-pin-error">{error}</p>}

      <Button
        variant="matcha"
        size="lg"
        fullWidth
        disabled={checking || digits.join('').length < 4}
        leftIcon={<Lock size={16} strokeWidth={2} />}
        onClick={() => void submitPin(digits.join(''))}
      >
        {checking ? 'Verifying...' : 'Unlock Editing'}
      </Button>
    </LiquidBottomSheet>
  );
}
