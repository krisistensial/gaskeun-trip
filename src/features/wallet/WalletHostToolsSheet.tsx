import { useState, type FormEvent } from 'react';
import { RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { Button, ConfirmDialog, Input, LiquidBottomSheet } from '../../components/atoms';
import {
  formatCompactIDR,
  formatIDR,
  type LedgerSummary,
} from '../../services/ledger';
import { triggerFeedback } from '../../services/feedback';
import type { SharedTrip, Transaction } from '../../types/trip';
import './wallet.css';

export interface WalletHostToolsSheetProps {
  open: boolean;
  trip: SharedTrip;
  ledger: LedgerSummary;
  onUpdateTrip: (updater: (prev: SharedTrip) => SharedTrip, toastMsg?: string) => void;
  onClose: () => void;
}

type ResetScope = 'pockets' | 'expenses' | 'all';

export function WalletHostToolsSheet({
  open,
  trip,
  ledger,
  onUpdateTrip,
  onClose,
}: WalletHostToolsSheetProps) {
  const [poolTargetRaw, setPoolTargetRaw] = useState(
    String(trip.financeConfig.poolTargetPerPerson || 0),
  );
  const [fundraiseGoalRaw, setFundraiseGoalRaw] = useState(
    String(trip.financeConfig.fundraiseTarget || 0),
  );
  const [desiredPoolCollectedRaw, setDesiredPoolCollectedRaw] = useState(
    String(ledger.poolCollected),
  );
  const [desiredFundraiseCollectedRaw, setDesiredFundraiseCollectedRaw] = useState(
    String(ledger.fundraiseCollected),
  );
  const [resetScope, setResetScope] = useState<ResetScope | null>(null);

  if (!open) return null;

  const nextPoolTarget = Number(poolTargetRaw.replace(/\D/g, '')) || 0;
  const nextFundraiseGoal = Number(fundraiseGoalRaw.replace(/\D/g, '')) || 0;
  const targetPoolCollected = Number(desiredPoolCollectedRaw.replace(/\D/g, '')) || 0;
  const targetFundraiseCollected =
    Number(desiredFundraiseCollectedRaw.replace(/\D/g, '')) || 0;

  const poolDelta = targetPoolCollected - ledger.poolCollected;
  const fundraiseDelta = targetFundraiseCollected - ledger.fundraiseCollected;

  const handleSaveTargets = (e: FormEvent) => {
    e.preventDefault();
    triggerFeedback('success');
    onUpdateTrip(
      (prev) => ({
        ...prev,
        financeConfig: {
          ...prev.financeConfig,
          poolTargetPerPerson: nextPoolTarget,
          fundraiseTarget: nextFundraiseGoal,
        },
      }),
      'Wallet targets updated',
    );
    onClose();
  };

  const handleApplyBalanceAdjustments = () => {
    if (poolDelta === 0 && fundraiseDelta === 0) return;

    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const additions: Transaction[] = [];

    if (poolDelta !== 0) {
      additions.push({
        id: `tx-adj-pool-${Date.now().toString(36)}`,
        tripId: trip.id,
        direction: poolDelta > 0 ? 'in' : 'out',
        pocket: 'pool',
        title: 'Host Pool Balance Adjustment',
        amount: Math.abs(poolDelta),
        date: today,
        note: `Adjusted Pool from ${formatCompactIDR(ledger.poolCollected)} to ${formatCompactIDR(targetPoolCollected)}`,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (fundraiseDelta !== 0) {
      additions.push({
        id: `tx-adj-fr-${Date.now().toString(36)}`,
        tripId: trip.id,
        direction: fundraiseDelta > 0 ? 'in' : 'out',
        pocket: 'fundraise',
        title: 'Host Fundraise Balance Adjustment',
        amount: Math.abs(fundraiseDelta),
        date: today,
        note: `Adjusted Fundraise from ${formatCompactIDR(ledger.fundraiseCollected)} to ${formatCompactIDR(targetFundraiseCollected)}`,
        createdAt: now,
        updatedAt: now,
      });
    }

    triggerFeedback('success');
    onUpdateTrip(
      (prev) => ({
        ...prev,
        transactions: [...additions, ...prev.transactions],
      }),
      'Shared balance adjusted by Host',
    );
    onClose();
  };

  const handleConfirmReset = () => {
    if (!resetScope) return;
    triggerFeedback('warning');

    if (resetScope === 'pockets') {
      onUpdateTrip(
        (prev) => ({
          ...prev,
          budgetPockets: [],
          transactions: prev.transactions.map((tx) => ({
            ...tx,
            budgetPocketId: undefined,
          })),
        }),
        'All budget pockets cleared',
      );
    } else if (resetScope === 'expenses') {
      onUpdateTrip(
        (prev) => ({
          ...prev,
          transactions: prev.transactions.filter((tx) => tx.direction !== 'out'),
        }),
        'All shared expenses cleared',
      );
    } else {
      onUpdateTrip(
        (prev) => ({
          ...prev,
          transactions: [],
          budgetPockets: [],
        }),
        'Shared test ledger reset to Rp 0',
      );
    }

    setResetScope(null);
    onClose();
  };

  return (
    <LiquidBottomSheet
      open={open}
      title="Host Ledger Controls"
      subtitle="Edit balances, targets, or clear trial/test entries cleanly"
      onClose={onClose}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="privacy-pill">
          <ShieldCheck size={14} strokeWidth={2.1} color="var(--brand-matcha)" />
          <span>Host Only — Personal local spend stays untouched</span>
        </div>

        {/* Section 1: Adjust Pool & Fundraise Balances Directly */}
        <div className="pocket-source-box">
          <div className="gk-field__label">EDIT REALIZED / STARTING BALANCES</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
            Enter your desired Pool or Fundraise cash-in total to reconcile immediately.
          </div>

          <div className="create-two-col">
            <Input
              id="host-pool-bal"
              label={`Pool Total (${formatCompactIDR(ledger.poolCollected)})`}
              inputMode="numeric"
              value={desiredPoolCollectedRaw}
              onChange={(e) => setDesiredPoolCollectedRaw(e.target.value.replace(/\D/g, ''))}
            />
            <Input
              id="host-fr-bal"
              label={`Fundraise Total (${formatCompactIDR(ledger.fundraiseCollected)})`}
              inputMode="numeric"
              value={desiredFundraiseCollectedRaw}
              onChange={(e) =>
                setDesiredFundraiseCollectedRaw(e.target.value.replace(/\D/g, ''))
              }
            />
          </div>

          <Button
            variant="matcha"
            size="md"
            fullWidth
            disabled={poolDelta === 0 && fundraiseDelta === 0}
            onClick={handleApplyBalanceAdjustments}
          >
            {poolDelta === 0 && fundraiseDelta === 0
              ? 'Balances Already Match'
              : `Apply Balance Adjustment (${formatIDR(poolDelta + fundraiseDelta)})`}
          </Button>
        </div>

        {/* Section 2: Update Targets */}
        <form onSubmit={handleSaveTargets} className="pocket-source-box">
          <div className="gk-field__label">WALLET TARGETS</div>
          <div className="create-two-col">
            <Input
              id="host-pool-target"
              label="Pool / Person (IDR)"
              inputMode="numeric"
              value={poolTargetRaw}
              onChange={(e) => setPoolTargetRaw(e.target.value.replace(/\D/g, ''))}
            />
            <Input
              id="host-fr-target"
              label="Fundraise Goal (IDR)"
              inputMode="numeric"
              value={fundraiseGoalRaw}
              onChange={(e) => setFundraiseGoalRaw(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <Button type="submit" variant="ghost" size="md" fullWidth>
            Save Targets
          </Button>
        </form>

        {/* Section 3: Reset Trial / Test Entries */}
        <div className="pocket-source-box">
          <div className="gk-field__label" style={{ color: 'var(--accent-coral)' }}>
            CLEAN UP TRIAL / TEST DATA
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Button
              variant="ghost"
              size="md"
              fullWidth
              leftIcon={<Trash2 size={15} strokeWidth={2} />}
              disabled={(trip.budgetPockets?.length ?? 0) === 0}
              onClick={() => setResetScope('pockets')}
            >
              Delete All Budget Pockets ({trip.budgetPockets?.length ?? 0})
            </Button>

            <Button
              variant="ghost"
              size="md"
              fullWidth
              leftIcon={<Trash2 size={15} strokeWidth={2} />}
              disabled={!trip.transactions.some((tx) => tx.direction === 'out')}
              onClick={() => setResetScope('expenses')}
            >
              Delete All Expenses (Keep Deposits)
            </Button>

            <Button
              variant="danger"
              size="md"
              fullWidth
              leftIcon={<RotateCcw size={15} strokeWidth={2} />}
              disabled={
                trip.transactions.length === 0 && (trip.budgetPockets?.length ?? 0) === 0
              }
              onClick={() => setResetScope('all')}
            >
              Reset All Shared Wallet Data to Rp 0
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(resetScope)}
        title={
          resetScope === 'pockets'
            ? 'Delete all budget pockets?'
            : resetScope === 'expenses'
              ? 'Delete all shared expenses?'
              : 'Reset entire shared wallet?'
        }
        description={
          resetScope === 'pockets'
            ? 'All custom pockets will be removed and funds returned to Unallocated Cash.'
            : resetScope === 'expenses'
              ? 'All shared Expense OUT entries will be removed while Pool & Fundraise deposits remain.'
              : 'All shared Pool, Fundraise, Expense transactions, and Budget Pockets will be deleted on all devices. Personal Wallet stays private.'
        }
        confirmLabel="Confirm Reset"
        destructive
        onCancel={() => setResetScope(null)}
        onConfirm={handleConfirmReset}
      />
    </LiquidBottomSheet>
  );
}
