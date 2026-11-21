import { useEffect, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { Button, CornerOrb } from '../atoms';
import { verifyPin } from '../../services/tripFactory';
import './sheets.css';

export interface PinUnlockSheetProps {
  open: boolean;
  tripCode: string;
  expectedHash: string;
  onUnlocked: () => void;
  onClose: () => void;
}

export function PinUnlockSheet({
  open,
  tripCode,
  expectedHash,
  onUnlocked,
  onClose,
}: PinUnlockSheetProps) {
  const [digits, setDigits] = useState<string[]>(['', '', '', '']);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (open) {
      setDigits(['', '', '', '']);
      setError('');
      window.setTimeout(() => inputRefs.current[0]?.focus(), 80);
    }
  }, [open]);

  if (!open) return null;

  const submitPin = async (pinStr: string) => {
    setChecking(true);
    setError('');
    const ok = await verifyPin(pinStr, expectedHash);
    setChecking(false);
    if (ok) {
      onUnlocked();
    } else {
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
    <div className="gk-sheet-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="gk-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="gk-sheet__handle" />
        <div className="gk-sheet__head">
          <div>
            <h3 className="gk-sheet__title">Unlock Crew Editing</h3>
            <p className="gk-sheet__sub">
              Enter the 4-digit PIN for <strong>{tripCode}</strong>
            </p>
          </div>
          <CornerOrb kind="close" ariaLabel="Close PIN dialog" onClick={onClose} />
        </div>

        <div className="gk-pin-row">
          {digits.map((val, i) => (
            <input
              key={i}
              ref={(el) => {
                inputRefs.current[i] = el;
              }}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={val}
              aria-label={`PIN digit ${i + 1}`}
              className="gk-pin-box"
              onChange={(e) => handleDigitChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e.key)}
            />
          ))}
        </div>

        {error && <p className="gk-pin-error">{error}</p>}

        {tripCode === 'SOLO-27' && (
          <p
            style={{
              margin: '0 0 14px',
              textAlign: 'center',
              fontSize: 11.5,
              color: 'var(--text-muted)',
            }}
          >
            Pilot trip default PIN: <strong>1234</strong>
          </p>
        )}

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
      </div>
    </div>
  );
}
