import { useState, type FormEvent } from 'react';
import { Lock, Trash2 } from 'lucide-react';
import { Avatar, Button, ConfirmDialog, Input, LiquidBottomSheet } from '../../components/atoms';
import type { Transaction, TransactionPocket, TripMember } from '../../types/trip';
import './wallet.css';

export type TxComposerMode = 'pool' | 'fundraise' | 'expense' | 'personal';

export interface AddTransactionSheetProps {
  open: boolean;
  tripId: string;
  members: TripMember[];
  initialMode: TxComposerMode;
  editingTx: Transaction | null;
  defaultMemberId?: string;
  onSaveShared: (tx: Transaction, isNew: boolean) => void;
  onSavePersonal: (tx: Transaction, isNew: boolean) => void;
  onDeleteShared: (txId: string) => void;
  onDeletePersonal: (txId: string) => void;
  onClose: () => void;
}

function inferMode(tx: Transaction | null, fallback: TxComposerMode): TxComposerMode {
  if (!tx) return fallback;
  if (tx.pocket === 'personal') return 'personal';
  if (tx.direction === 'out') return 'expense';
  return tx.pocket === 'fundraise' ? 'fundraise' : 'pool';
}

export function AddTransactionSheet({
  open,
  tripId,
  members,
  initialMode,
  editingTx,
  defaultMemberId,
  onSaveShared,
  onSavePersonal,
  onDeleteShared,
  onDeletePersonal,
  onClose,
}: AddTransactionSheetProps) {
  const [mode, setMode] = useState<TxComposerMode>(() => inferMode(editingTx, initialMode));
  const [amountRaw, setAmountRaw] = useState<string>(() =>
    editingTx ? String(editingTx.amount) : '',
  );
  const [title, setTitle] = useState<string>(() => editingTx?.title ?? '');
  const [date, setDate] = useState<string>(
    () => editingTx?.date ?? new Date().toISOString().slice(0, 10),
  );
  const [note, setNote] = useState<string>(() => editingTx?.note ?? '');
  const [memberId, setMemberId] = useState<string>(
    () => editingTx?.memberId ?? defaultMemberId ?? members[0]?.id ?? '',
  );
  const [expenseSource, setExpenseSource] = useState<'pool' | 'fundraise'>(() =>
    editingTx?.pocket === 'fundraise' ? 'fundraise' : 'pool',
  );
  const [paidOutOfPocket, setPaidOutOfPocket] = useState<boolean>(() =>
    Boolean(editingTx?.paidOutOfPocket),
  );
  const [paidByMemberId, setPaidByMemberId] = useState<string>(
    () => editingTx?.paidByMemberId ?? defaultMemberId ?? members[0]?.id ?? '',
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!open) return null;

  const numericAmount = Number(amountRaw.replace(/\D/g, '')) || 0;
  const formattedAmount = numericAmount > 0 ? numericAmount.toLocaleString('en-US') : '';

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (numericAmount <= 0) return;

    const now = new Date().toISOString();
    const isNew = !editingTx;
    const id = editingTx?.id ?? `tx-${Date.now().toString(36)}`;

    if (mode === 'personal') {
      const tx: Transaction = {
        id,
        tripId,
        direction: 'out',
        pocket: 'personal',
        title: title.trim() || 'Personal Treat',
        amount: numericAmount,
        date,
        note: note.trim() || undefined,
        createdAt: editingTx?.createdAt ?? now,
        updatedAt: now,
      };
      onSavePersonal(tx, isNew);
      onClose();
      return;
    }

    const pocket: TransactionPocket =
      mode === 'pool' ? 'pool' : mode === 'fundraise' ? 'fundraise' : expenseSource;
    const direction = mode === 'expense' ? 'out' : 'in';

    const selectedMember = members.find((m) => m.id === memberId);
    const defaultTitle =
      mode === 'pool'
        ? `Pool Deposit (${selectedMember?.name ?? 'Crew'})`
        : mode === 'fundraise'
          ? 'Fundraise Entry'
          : 'Group Expense';

    const tx: Transaction = {
      id,
      tripId,
      direction,
      pocket,
      title: title.trim() || defaultTitle,
      amount: numericAmount,
      date,
      memberId: mode === 'pool' ? memberId : undefined,
      paidOutOfPocket: mode === 'expense' ? paidOutOfPocket : undefined,
      paidByMemberId: mode === 'expense' && paidOutOfPocket ? paidByMemberId : undefined,
      reimbursed: mode === 'expense' && paidOutOfPocket ? Boolean(editingTx?.reimbursed) : undefined,
      note: note.trim() || undefined,
      createdAt: editingTx?.createdAt ?? now,
      updatedAt: now,
    };

    onSaveShared(tx, isNew);
    onClose();
  };

  return (
    <LiquidBottomSheet
      open={open}
      title={editingTx ? 'Edit Transaction' : 'Add Transaction'}
      subtitle={
        mode === 'personal' ? 'Saved locally on this device only' : 'Synced to shared trip ledger'
      }
      onClose={onClose}
    >
      {/* 4-Way Segmented Type Pill */}
        {!editingTx && (
          <div className="tx-seg-4" role="tablist" aria-label="Transaction type">
            {(
              [
                { id: 'pool', label: 'Pool' },
                { id: 'fundraise', label: 'Fundraise' },
                { id: 'expense', label: 'Expense' },
                { id: 'personal', label: 'Personal' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={mode === opt.id}
                className={`tx-seg-4__btn ${mode === opt.id ? 'tx-seg-4__btn--active' : ''}`}
                onClick={() => setMode(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Large Amount Input */}
          <div className="tx-amount-box">
            <span className="gk-field__label">AMOUNT</span>
            <div className="tx-amount-row">
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 22,
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                }}
              >
                Rp
              </span>
              <input
                aria-label="Amount in IDR"
                inputMode="numeric"
                className="tx-amount-input"
                placeholder="100,000"
                value={formattedAmount}
                onChange={(e) => setAmountRaw(e.target.value.replace(/\D/g, ''))}
              />
            </div>
          </div>

          {/* Contextual Fields */}
          {mode === 'pool' && (
            <div>
              <div className="gk-field__label" style={{ marginBottom: 6 }}>
                CONTRIBUTOR
              </div>
              <div className="payer-strip">
                {members.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`payer-chip tactile ${memberId === m.id ? 'payer-chip--active' : ''}`}
                    onClick={() => setMemberId(m.id)}
                  >
                    <Avatar
                      initials={m.initials}
                      name={m.name}
                      src={m.avatarDataUrl}
                      size="sm"
                      bg={memberId === m.id ? '#E3EDE6' : m.avatarBg}
                      color={memberId === m.id ? '#2D4A42' : m.avatarColor}
                    />
                    <span>{m.status === 'tentative' ? `${m.name}?` : m.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="create-two-col">
            <Input
              id="tx-title"
              label={mode === 'pool' ? 'Deposit Label' : 'Title'}
              placeholder={
                mode === 'pool'
                  ? 'Pool Deposit #2'
                  : mode === 'fundraise'
                    ? 'Snack Pre-Order'
                    : mode === 'expense'
                      ? 'Fuel 5 Motorbikes'
                      : 'Soto Triwindu'
              }
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Input
              id="tx-date"
              label="Date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {mode === 'expense' && (
            <>
              <div>
                <div className="gk-field__label" style={{ marginBottom: 6 }}>
                  FUND SOURCE
                </div>
                <div className="create-two-col">
                  <button
                    type="button"
                    className={`wallet-subtab tactile ${expenseSource === 'pool' ? 'wallet-subtab--active' : ''}`}
                    style={{ height: 38 }}
                    onClick={() => setExpenseSource('pool')}
                  >
                    Pool
                  </button>
                  <button
                    type="button"
                    className={`wallet-subtab tactile ${expenseSource === 'fundraise' ? 'wallet-subtab--active' : ''}`}
                    style={{ height: 38 }}
                    onClick={() => setExpenseSource('fundraise')}
                  >
                    Fundraise
                  </button>
                </div>
              </div>

              <div className="tx-toggle-row">
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>Paid out of pocket?</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Track reimbursement for the payer
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={paidOutOfPocket}
                  className={`tx-switch ${paidOutOfPocket ? 'tx-switch--on' : ''}`}
                  onClick={() => setPaidOutOfPocket((v) => !v)}
                >
                  <span className="tx-switch__thumb" />
                </button>
              </div>

              {paidOutOfPocket && (
                <div>
                  <div className="gk-field__label" style={{ marginBottom: 6 }}>
                    PAID BY
                  </div>
                  <div className="payer-strip">
                    {members.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={`payer-chip tactile ${paidByMemberId === m.id ? 'payer-chip--active' : ''}`}
                        onClick={() => setPaidByMemberId(m.id)}
                      >
                        <Avatar
                          initials={m.initials}
                          name={m.name}
                          src={m.avatarDataUrl}
                          size="sm"
                          bg={paidByMemberId === m.id ? '#E3EDE6' : m.avatarBg}
                          color={paidByMemberId === m.id ? '#2D4A42' : m.avatarColor}
                        />
                        <span>{m.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {mode === 'personal' && (
            <div className="privacy-pill">
              <Lock size={13} strokeWidth={2} color="var(--brand-matcha)" />
              <span>Private ledger — never shared with the group</span>
            </div>
          )}

          <Input
            id="tx-note"
            label="Note (Optional)"
            placeholder="Cash, QRIS, receipt note..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            {editingTx && (
              <Button
                variant="danger"
                size="lg"
                aria-label="Delete transaction"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={17} strokeWidth={2} />
              </Button>
            )}
            <Button
              type="submit"
              variant="matcha"
              size="lg"
              fullWidth
              disabled={numericAmount <= 0}
            >
              {editingTx ? 'Update Transaction' : 'Save Transaction'}
            </Button>
          </div>
        </form>

        <ConfirmDialog
          open={confirmDelete}
          title="Delete this transaction?"
          description="Balances will immediately recalculate after deleting this entry."
          confirmLabel="Delete"
          destructive
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            if (editingTx) {
              if (editingTx.pocket === 'personal') onDeletePersonal(editingTx.id);
              else onDeleteShared(editingTx.id);
            }
            setConfirmDelete(false);
            onClose();
          }}
        />
    </LiquidBottomSheet>
  );
}
