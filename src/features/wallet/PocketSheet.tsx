import { useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, ConfirmDialog, Input, LiquidBottomSheet } from '../../components/atoms';
import { formatCompactIDR, formatIDR, type BudgetPocketSummary } from '../../services/ledger';
import { triggerFeedback } from '../../services/feedback';
import type { BudgetPocket, PocketAllocation } from '../../types/trip';
import './wallet.css';

const POCKET_EMOJIS = ['🛵', '🏠', '🍜', '⛽', '🎟️', '☕', '📸', '🛡️', '🎉', '💸'] as const;
const QUICK_POCKET_NAMES = [
  { emoji: '🛵', name: 'Transport & Fuel' },
  { emoji: '🏠', name: 'Stay & Lodging' },
  { emoji: '🍜', name: 'Meals & Coffee' },
  { emoji: '🎟️', name: 'Tickets & Entry' },
  { emoji: '🛡️', name: 'Emergency Fund' },
] as const;

export interface PocketSheetProps {
  open: boolean;
  editingSummary: BudgetPocketSummary | null;
  poolUnallocated: number;
  fundraiseUnallocated: number;
  onSave: (pocket: BudgetPocket, isNew: boolean) => void;
  onDelete: (pocketId: string) => void;
  onClose: () => void;
}

export function PocketSheet({
  open,
  editingSummary,
  poolUnallocated,
  fundraiseUnallocated,
  onSave,
  onDelete,
  onClose,
}: PocketSheetProps) {
  const existing = editingSummary?.pocket ?? null;
  const maxPoolAvailable = Math.max(
    0,
    poolUnallocated + (editingSummary?.allocatedFromPool ?? 0),
  );
  const maxFundraiseAvailable = Math.max(
    0,
    fundraiseUnallocated + (editingSummary?.allocatedFromFundraise ?? 0),
  );

  const [emoji, setEmoji] = useState<string>(() => existing?.emoji ?? '🛵');
  const [name, setName] = useState<string>(() => existing?.name ?? '');
  const [fromPoolRaw, setFromPoolRaw] = useState<string>(() =>
    editingSummary && editingSummary.allocatedFromPool > 0
      ? String(editingSummary.allocatedFromPool)
      : '',
  );
  const [fromFundraiseRaw, setFromFundraiseRaw] = useState<string>(() =>
    editingSummary && editingSummary.allocatedFromFundraise > 0
      ? String(editingSummary.allocatedFromFundraise)
      : '',
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!open) return null;

  const fromPool = Number(fromPoolRaw.replace(/\D/g, '')) || 0;
  const fromFundraise = Number(fromFundraiseRaw.replace(/\D/g, '')) || 0;
  const totalAllocated = fromPool + fromFundraise;

  const poolExceeded = fromPool > maxPoolAvailable;
  const fundraiseExceeded = fromFundraise > maxFundraiseAvailable;
  const canSubmit =
    name.trim().length > 0 &&
    totalAllocated > 0 &&
    !poolExceeded &&
    !fundraiseExceeded;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    const now = new Date().toISOString();
    const isNew = !existing;
    const id = existing?.id ?? `pkt-${Date.now().toString(36)}`;
    const allocations: PocketAllocation[] = [];

    if (fromPool > 0) {
      allocations.push({
        id: `${id}-pool`,
        source: 'pool',
        amount: fromPool,
        createdAt: now,
      });
    }
    if (fromFundraise > 0) {
      allocations.push({
        id: `${id}-fundraise`,
        source: 'fundraise',
        amount: fromFundraise,
        createdAt: now,
      });
    }

    const nextPocket: BudgetPocket = {
      id,
      name: name.trim(),
      emoji,
      allocations,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    triggerFeedback('success');
    onSave(nextPocket, isNew);
    onClose();
  };

  return (
    <LiquidBottomSheet
      open={open}
      title={existing ? 'Edit Budget Pocket' : 'New Budget Pocket'}
      subtitle="Allocate exact balances from Crew Pool and/or Fundraise"
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!existing && (
          <div>
            <div className="gk-field__label" style={{ marginBottom: 6 }}>
              QUICK PRESETS
            </div>
            <div className="payer-strip">
              {QUICK_POCKET_NAMES.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  className="payer-chip tactile"
                  onClick={() => {
                    triggerFeedback('tap');
                    setEmoji(preset.emoji);
                    setName(preset.name);
                  }}
                >
                  <span>{preset.emoji}</span>
                  <span>{preset.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="gk-field__label" style={{ marginBottom: 6 }}>
            ICON
          </div>
          <div className="payer-strip">
            {POCKET_EMOJIS.map((em) => (
              <button
                key={em}
                type="button"
                className={`pocket-emoji-pill tactile ${emoji === em ? 'pocket-emoji-pill--active' : ''}`}
                onClick={() => {
                  triggerFeedback('tap');
                  setEmoji(em);
                }}
              >
                {em}
              </button>
            ))}
          </div>
        </div>

        <Input
          id="pocket-name"
          label="Pocket Name"
          placeholder="e.g. Transport & Fuel"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        {/* Source 1: Crew Pool Allocation */}
        <div className="pocket-source-box">
          <div className="pocket-source-box__head">
            <span className="gk-field__label">FROM CREW POOL (IDR)</span>
            <span className="pocket-source-box__avail">
              Free: {formatIDR(maxPoolAvailable)}
            </span>
          </div>
          <div className="pocket-source-box__row">
            <span className="pocket-source-box__rp">Rp</span>
            <input
              aria-label="Allocation from Crew Pool"
              inputMode="numeric"
              className="pocket-source-box__input"
              placeholder="0"
              value={fromPool > 0 ? fromPool.toLocaleString('en-US') : ''}
              onChange={(e) => setFromPoolRaw(e.target.value.replace(/\D/g, ''))}
            />
            {maxPoolAvailable > 0 && (
              <button
                type="button"
                className="pocket-max-btn tactile"
                onClick={() => setFromPoolRaw(String(maxPoolAvailable))}
              >
                Max
              </button>
            )}
          </div>
          <div className="pocket-quick-adds">
            {[100_000, 250_000, 500_000].map((step) => (
              <button
                key={step}
                type="button"
                className="pocket-add-chip tactile"
                onClick={() =>
                  setFromPoolRaw(String(Math.min(maxPoolAvailable, fromPool + step)))
                }
              >
                +{formatCompactIDR(step).replace('Rp ', '')}
              </button>
            ))}
            {fromPool > 0 && (
              <button
                type="button"
                className="pocket-add-chip tactile"
                onClick={() => setFromPoolRaw('')}
              >
                Clear
              </button>
            )}
          </div>
          {poolExceeded && (
            <div className="pocket-error-text">
              Exceeds unallocated Crew Pool ({formatIDR(maxPoolAvailable)} available)
            </div>
          )}
        </div>

        {/* Source 2: Fundraise Allocation */}
        <div className="pocket-source-box">
          <div className="pocket-source-box__head">
            <span className="gk-field__label">FROM FUNDRAISE (IDR)</span>
            <span className="pocket-source-box__avail">
              Free: {formatIDR(maxFundraiseAvailable)}
            </span>
          </div>
          <div className="pocket-source-box__row">
            <span className="pocket-source-box__rp">Rp</span>
            <input
              aria-label="Allocation from Fundraise"
              inputMode="numeric"
              className="pocket-source-box__input"
              placeholder="0"
              value={fromFundraise > 0 ? fromFundraise.toLocaleString('en-US') : ''}
              onChange={(e) => setFromFundraiseRaw(e.target.value.replace(/\D/g, ''))}
            />
            {maxFundraiseAvailable > 0 && (
              <button
                type="button"
                className="pocket-max-btn tactile"
                onClick={() => setFromFundraiseRaw(String(maxFundraiseAvailable))}
              >
                Max
              </button>
            )}
          </div>
          <div className="pocket-quick-adds">
            {[25_000, 50_000, 100_000].map((step) => (
              <button
                key={step}
                type="button"
                className="pocket-add-chip tactile"
                onClick={() =>
                  setFromFundraiseRaw(
                    String(Math.min(maxFundraiseAvailable, fromFundraise + step)),
                  )
                }
              >
                +{formatCompactIDR(step).replace('Rp ', '')}
              </button>
            ))}
            {fromFundraise > 0 && (
              <button
                type="button"
                className="pocket-add-chip tactile"
                onClick={() => setFromFundraiseRaw('')}
              >
                Clear
              </button>
            )}
          </div>
          {fundraiseExceeded && (
            <div className="pocket-error-text">
              Exceeds unallocated Fundraise ({formatIDR(maxFundraiseAvailable)} available)
            </div>
          )}
        </div>

        {/* Live Accounting Summary */}
        <div className="pocket-total-summary">
          <div>
            <div className="gk-field__label">POCKET TOTAL BALANCE</div>
            <div className="pocket-total-summary__sub">
              Pool {formatCompactIDR(fromPool)} + Fundraise {formatCompactIDR(fromFundraise)}
            </div>
          </div>
          <div className="pocket-total-summary__val">{formatIDR(totalAllocated)}</div>
        </div>

        {editingSummary && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Already spent from this pocket: <strong>{formatIDR(editingSummary.spent)}</strong> ·
            Remaining after save: <strong>{formatIDR(totalAllocated - editingSummary.spent)}</strong>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          {existing && (
            <Button
              variant="danger"
              size="lg"
              aria-label="Delete pocket"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={17} strokeWidth={2} />
            </Button>
          )}
          <Button type="submit" variant="matcha" size="lg" fullWidth disabled={!canSubmit}>
            {existing ? 'Save Pocket' : 'Create Pocket'}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={confirmDelete}
        title={`Remove "${existing?.name}"?`}
        description="Allocated funds return to Unallocated Cash, and any past expenses remain in Spent history."
        confirmLabel="Remove"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (existing) onDelete(existing.id);
          setConfirmDelete(false);
          onClose();
        }}
      />
    </LiquidBottomSheet>
  );
}
