import { useMemo, useState } from 'react';
import { Check, ChevronRight, Lock, Plus, Wallet as WalletIcon } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  CornerOrb,
  EmptyState,
  GlassCard,
  LiquidBottomSheet,
} from '../../components/atoms';
import {
  calculateLedger,
  calculatePersonalTotal,
  formatCompactIDR,
  formatIDR,
  markTransactionSettled,
  type MemberContributionSummary,
} from '../../services/ledger';
import type { SharedTrip, Transaction } from '../../types/trip';
import { AddTransactionSheet, type TxComposerMode } from './AddTransactionSheet';
import './wallet.css';

type WalletTab = 'pool' | 'fundraise' | 'spent' | 'personal';
type SpentFilter = 'all' | 'reimburse' | 'pool' | 'fundraise';

export interface WalletScreenProps {
  trip: SharedTrip;
  personalTransactions: Transaction[];
  canEdit: boolean;
  onOpenMenu: () => void;
  onRequestUnlockPin: () => void;
  onUpdateTrip: (updater: (prev: SharedTrip) => SharedTrip, toastMsg?: string) => void;
  onUpsertPersonalTx: (tx: Transaction, isNew: boolean) => void;
  onDeletePersonalTx: (txId: string) => void;
}

export function WalletScreen({
  trip,
  personalTransactions,
  canEdit,
  onOpenMenu,
  onRequestUnlockPin,
  onUpdateTrip,
  onUpsertPersonalTx,
  onDeletePersonalTx,
}: WalletScreenProps) {
  const [subTab, setSubTab] = useState<WalletTab>('pool');
  const [spentFilter, setSpentFilter] = useState<SpentFilter>('all');
  const [composer, setComposer] = useState<{
    open: boolean;
    mode: TxComposerMode;
    editing: Transaction | null;
    defaultMemberId?: string;
  }>({ open: false, mode: 'expense', editing: null });
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const ledger = useMemo(() => calculateLedger(trip), [trip]);
  const personalTotal = useMemo(
    () => calculatePersonalTotal(personalTransactions),
    [personalTransactions],
  );
  const memberById = useMemo(
    () => new Map(trip.members.map((m) => [m.id, m])),
    [trip.members],
  );

  const selectedMemberSummary: MemberContributionSummary | undefined = selectedMemberId
    ? ledger.memberContributions.find((c) => c.member.id === selectedMemberId)
    : undefined;

  const fundraiseEntries = useMemo(
    () =>
      trip.transactions
        .filter((tx) => tx.pocket === 'fundraise' && tx.direction === 'in')
        .sort((a, b) => b.date.localeCompare(a.date)),
    [trip.transactions],
  );

  const spentEntries = useMemo(() => {
    return trip.transactions
      .filter((tx) => tx.direction === 'out' && (tx.pocket === 'pool' || tx.pocket === 'fundraise'))
      .filter((tx) => {
        if (spentFilter === 'all') return true;
        if (spentFilter === 'reimburse') return Boolean(tx.paidOutOfPocket && !tx.reimbursed);
        return tx.pocket === spentFilter;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [trip.transactions, spentFilter]);

  const guardSharedEdit = (fn: () => void) => {
    if (!canEdit) {
      onRequestUnlockPin();
      return;
    }
    fn();
  };

  const handleOpenFab = () => {
    const mode: TxComposerMode =
      subTab === 'personal'
        ? 'personal'
        : subTab === 'fundraise'
          ? 'fundraise'
          : subTab === 'spent'
            ? 'expense'
            : 'pool';

    if (mode === 'personal') {
      setComposer({ open: true, mode: 'personal', editing: null });
      return;
    }
    guardSharedEdit(() => setComposer({ open: true, mode, editing: null }));
  };

  const handleSaveSharedTx = (tx: Transaction, isNew: boolean) => {
    onUpdateTrip(
      (prev) => ({
        ...prev,
        transactions: isNew
          ? [tx, ...prev.transactions]
          : prev.transactions.map((t) => (t.id === tx.id ? tx : t)),
      }),
      isNew ? 'Transaction saved' : 'Transaction updated',
    );
  };

  const handleDeleteSharedTx = (txId: string) => {
    onUpdateTrip(
      (prev) => ({
        ...prev,
        transactions: prev.transactions.filter((t) => t.id !== txId),
      }),
      'Transaction deleted',
    );
  };

  const handleMarkSettled = (txId: string) => {
    guardSharedEdit(() => {
      onUpdateTrip(
        (prev) => ({
          ...prev,
          transactions: markTransactionSettled(prev.transactions, txId),
        }),
        'Marked Settled — balance stays unchanged',
      );
    });
  };

  const handleToggleTentative = () => {
    onUpdateTrip(
      (prev) => ({
        ...prev,
        financeConfig: {
          ...prev.financeConfig,
          includeTentative: !prev.financeConfig.includeTentative,
        },
      }),
      trip.financeConfig.includeTentative
        ? 'Tentative riders excluded from target'
        : 'Tentative riders included in target',
    );
  };

  return (
    <div className="wallet-root">
      {/* Header + Corner Orb */}
      <header className="wallet-header">
        <h1 className="wallet-title">Wallet</h1>
        <CornerOrb kind="menu" ariaLabel="Trip menu" onClick={onOpenMenu} />
      </header>

      {/* 4 Sub-Tab Pills */}
      <div className="wallet-subtabs" role="tablist" aria-label="Wallet pockets">
        {(
          [
            { id: 'pool', label: 'Pool' },
            { id: 'fundraise', label: 'Fundraise' },
            { id: 'spent', label: 'Spent' },
            { id: 'personal', label: 'Personal' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={subTab === tab.id}
            className={`wallet-subtab tactile ${subTab === tab.id ? 'wallet-subtab--active' : ''}`}
            onClick={() => setSubTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* SUB-TAB 1: POOL (06_Wallet_Pool) */}
      {subTab === 'pool' && (
        <>
          <GlassCard variant="spotlight" padding="lg">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="gk-field__label">
                SHARED POOL · {formatCompactIDR(trip.financeConfig.poolTargetPerPerson)} EACH
              </span>
              <Badge tone="matcha">{ledger.poolProgressPct}%</Badge>
            </div>
            <div className="wallet-hero-num">{formatIDR(ledger.poolCollected)}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
              of {formatIDR(ledger.poolTarget)} target ({ledger.activeMemberCount} riders)
            </div>
            <div className="wallet-progress-track">
              <div
                className="wallet-progress-fill"
                style={{ width: `${ledger.poolProgressPct}%` }}
              />
            </div>

            {/* Interactive Crew Avatar Strip (Tap tentative rider to recalculate split) */}
            <div className="snap-peek-row">
              {trip.members.map((m) => {
                const isTentative = m.status === 'tentative';
                return (
                  <Avatar
                    key={m.id}
                    initials={m.initials}
                    name={m.name}
                    showLabel
                    size="sm"
                    bg={m.avatarBg}
                    color={m.avatarColor}
                    variant={
                      isTentative
                        ? trip.financeConfig.includeTentative
                          ? 'selected'
                          : 'tentative'
                        : 'solid'
                    }
                    onClick={isTentative ? handleToggleTentative : () => setSelectedMemberId(m.id)}
                  />
                );
              })}
            </div>
          </GlassCard>

          {/* Fluid Row-as-Progress-Bar List */}
          <div className="pool-member-list">
            {ledger.topContributors.map((entry) => (
              <button
                key={entry.member.id}
                type="button"
                className="pool-member-row tactile"
                onClick={() => setSelectedMemberId(entry.member.id)}
              >
                <div
                  className="pool-member-row__fill"
                  style={{ width: `${entry.progressPct}%` }}
                />
                <span className="pool-member-row__left">
                  <Avatar
                    initials={entry.member.initials}
                    size="sm"
                    bg={entry.member.avatarBg}
                    color={entry.member.avatarColor}
                    variant={entry.member.status === 'tentative' ? 'tentative' : 'solid'}
                  />
                  <span>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                      {entry.member.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {entry.progressPct}% · {entry.depositCount}{' '}
                      {entry.depositCount === 1 ? 'deposit' : 'deposits'}
                    </div>
                  </span>
                </span>

                <span className="pool-member-row__right">
                  <span
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 15,
                      fontWeight: 600,
                      color: entry.paidPool > 0 ? 'var(--brand-forest)' : 'var(--accent-amber)',
                    }}
                  >
                    {formatCompactIDR(entry.paidPool)}
                  </span>
                  <ChevronRight size={15} strokeWidth={2} color="var(--text-muted)" />
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* SUB-TAB 2: FUNDRAISE (06b_Wallet_Fundraise) */}
      {subTab === 'fundraise' && (
        <>
          <GlassCard variant="spotlight" padding="lg">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="gk-field__label">FUNDRAISE PROGRESS</span>
              <Badge tone="matcha">{ledger.fundraiseProgressPct}% of goal</Badge>
            </div>
            <div className="wallet-hero-num">{formatIDR(ledger.fundraiseCollected)}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
              of {formatIDR(ledger.fundraiseTarget)} target
            </div>
            <div className="wallet-progress-track">
              <div
                className="wallet-progress-fill"
                style={{ width: `${Math.max(4, ledger.fundraiseProgressPct)}%` }}
              />
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
              {fundraiseEntries.length} logged {fundraiseEntries.length === 1 ? 'entry' : 'entries'} · Left:{' '}
              {formatIDR(ledger.fundraiseLeft)}
            </div>
          </GlassCard>

          <div className="tx-list">
            {fundraiseEntries.length === 0 ? (
              <EmptyState
                icon={<WalletIcon size={22} strokeWidth={1.8} />}
                title="No fundraise entries yet"
                description="Tap + to log pre-order profit or group fundraising income."
              />
            ) : (
              fundraiseEntries.map((tx) => (
                <GlassCard
                  key={tx.id}
                  variant="clear"
                  padding="md"
                  interactive
                  className="tx-card"
                  onClick={() =>
                    guardSharedEdit(() =>
                      setComposer({ open: true, mode: 'fundraise', editing: tx }),
                    )
                  }
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{tx.title}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                      {tx.date}
                      {tx.note ? ` · ${tx.note}` : ''}
                    </div>
                  </div>
                  <span className="tx-amt tx-amt--in">+{formatCompactIDR(tx.amount)}</span>
                </GlassCard>
              ))
            )}
          </div>
        </>
      )}

      {/* SUB-TAB 3: SPENT & REIMBURSE (06c_Wallet_Spent) */}
      {subTab === 'spent' && (
        <>
          <div className="wallet-mini-grid">
            <GlassCard variant="clear" padding="sm">
              <div className="gk-field__label">POOL LEFT</div>
              <div className="wallet-mini-val">{formatCompactIDR(ledger.poolLeft)}</div>
            </GlassCard>
            <GlassCard variant="clear" padding="sm">
              <div className="gk-field__label">FUNDRAISE LEFT</div>
              <div className="wallet-mini-val">{formatCompactIDR(ledger.fundraiseLeft)}</div>
            </GlassCard>
          </div>

          <div className="plan-filter-row">
            {(
              [
                { id: 'all', label: 'All' },
                {
                  id: 'reimburse',
                  label: `Reimburse (${ledger.pendingReimburseItems.length})`,
                },
                { id: 'pool', label: 'Pool' },
                { id: 'fundraise', label: 'Fundraise' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                className={`plan-chip tactile ${spentFilter === f.id ? 'plan-chip--active' : ''}`}
                onClick={() => setSpentFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="tx-list">
            {spentEntries.length === 0 ? (
              <EmptyState
                icon={<WalletIcon size={22} strokeWidth={1.8} />}
                title="No expenses here"
                description="Tap + to log fuel, parking, food, or shared deposits."
              />
            ) : (
              spentEntries.map((tx) => {
                const payer = tx.paidByMemberId ? memberById.get(tx.paidByMemberId) : undefined;
                const isUnpaid = Boolean(tx.paidOutOfPocket && !tx.reimbursed);
                return (
                  <GlassCard
                    key={tx.id}
                    variant="clear"
                    padding="md"
                    interactive
                    className="tx-card"
                    onClick={() =>
                      guardSharedEdit(() =>
                        setComposer({ open: true, mode: 'expense', editing: tx }),
                      )
                    }
                  >
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{tx.title}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                        {tx.paidOutOfPocket
                          ? `Paid by ${payer?.name ?? 'Crew'}`
                          : 'Direct from fund'}{' '}
                        · {tx.pocket === 'pool' ? 'Pool' : 'Fundraise'}
                      </div>
                      {isUnpaid && (
                        <div style={{ marginTop: 8 }}>
                          <Button
                            variant="matcha"
                            size="sm"
                            leftIcon={<Check size={13} strokeWidth={2.2} />}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMarkSettled(tx.id);
                            }}
                          >
                            Mark Settled
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="tx-card__right">
                      <span className={`tx-amt ${isUnpaid ? 'tx-amt--unpaid' : 'tx-amt--out'}`}>
                        -{formatCompactIDR(tx.amount)}
                      </span>
                      {isUnpaid ? (
                        <Badge tone="amber">Unpaid</Badge>
                      ) : (
                        <Badge tone="mint" icon={<Check size={11} strokeWidth={2.4} />}>
                          Settled
                        </Badge>
                      )}
                    </div>
                  </GlassCard>
                );
              })
            )}
          </div>
        </>
      )}

      {/* SUB-TAB 4: PERSONAL LOCAL LEDGER (06d_Wallet_Personal) */}
      {subTab === 'personal' && (
        <>
          <div className="privacy-pill">
            <Lock size={13} strokeWidth={2} color="var(--brand-matcha)" />
            <span>Saved on this device only</span>
          </div>

          <GlassCard variant="spotlight" padding="lg">
            <span className="gk-field__label">PERSONAL SPEND</span>
            <div className="wallet-hero-num">{formatIDR(personalTotal)}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {personalTransactions.length}{' '}
              {personalTransactions.length === 1 ? 'item' : 'items'} · Visible only to you
            </div>
          </GlassCard>

          <div className="tx-list">
            {personalTransactions.length === 0 ? (
              <EmptyState
                icon={<Lock size={20} strokeWidth={1.8} />}
                title="No personal treats yet"
                description="Log snacks, coffee, or souvenirs privately on this phone."
                action={
                  <Button
                    variant="matcha"
                    size="sm"
                    onClick={() => setComposer({ open: true, mode: 'personal', editing: null })}
                  >
                    Add Personal Item
                  </Button>
                }
              />
            ) : (
              personalTransactions.map((tx) => (
                <GlassCard
                  key={tx.id}
                  variant="clear"
                  padding="md"
                  interactive
                  className="tx-card"
                  onClick={() =>
                    setComposer({ open: true, mode: 'personal', editing: tx })
                  }
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{tx.title}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                      {tx.date}
                      {tx.note ? ` · ${tx.note}` : ''}
                    </div>
                  </div>
                  <span className="tx-amt tx-amt--out">{formatCompactIDR(tx.amount)}</span>
                </GlassCard>
              ))
            )}
          </div>
        </>
      )}

      {/* Floating Glass (+) Button above Dock */}
      <CornerOrb
        kind="add"
        size="lg"
        ariaLabel="Add transaction"
        className="floating-glass-fab"
        onClick={handleOpenFab}
      />

      {/* Member Pool IN Deposit History Drill-Down Sheet */}
      <LiquidBottomSheet
        open={Boolean(selectedMemberSummary)}
        title={selectedMemberSummary?.member.name}
        subtitle={
          selectedMemberSummary
            ? `Paid ${formatIDR(selectedMemberSummary.paidPool)} of ${formatIDR(selectedMemberSummary.targetPool)}`
            : undefined
        }
        onClose={() => setSelectedMemberId(null)}
      >
        {selectedMemberSummary && (
          <>
            <div className="tx-list" style={{ marginBottom: 14 }}>
              {selectedMemberSummary.deposits.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 8px' }}>
                  No deposits recorded yet.
                </p>
              ) : (
                selectedMemberSummary.deposits.map((tx) => (
                  <button
                    key={tx.id}
                    type="button"
                    className="gk-menu-item"
                    onClick={() => {
                      setSelectedMemberId(null);
                      guardSharedEdit(() =>
                        setComposer({ open: true, mode: 'pool', editing: tx }),
                      );
                    }}
                  >
                    <div>
                      <div className="gk-menu-item__title">{tx.title}</div>
                      <div className="gk-menu-item__sub">
                        {tx.date}
                        {tx.note ? ` · ${tx.note}` : ''}
                      </div>
                    </div>
                    <span className="tx-amt tx-amt--in">+{formatCompactIDR(tx.amount)}</span>
                  </button>
                ))
              )}
            </div>

            <Button
              variant="matcha"
              size="lg"
              fullWidth
              leftIcon={<Plus size={16} strokeWidth={2} />}
              onClick={() => {
                const mid = selectedMemberSummary.member.id;
                setSelectedMemberId(null);
                guardSharedEdit(() =>
                  setComposer({
                    open: true,
                    mode: 'pool',
                    editing: null,
                    defaultMemberId: mid,
                  }),
                );
              }}
            >
              Add Deposit for {selectedMemberSummary.member.name}
            </Button>
          </>
        )}
      </LiquidBottomSheet>

      {/* Smart Add / Edit Transaction Sheet (06e_Add_Transaction) */}
      <AddTransactionSheet
        key={`tx-${composer.open ? `${composer.mode}-${composer.editing?.id ?? 'new'}-${composer.defaultMemberId ?? ''}` : 'closed'}`}
        open={composer.open}
        tripId={trip.id}
        members={trip.members}
        initialMode={composer.mode}
        editingTx={composer.editing}
        defaultMemberId={composer.defaultMemberId}
        onSaveShared={handleSaveSharedTx}
        onSavePersonal={onUpsertPersonalTx}
        onDeleteShared={handleDeleteSharedTx}
        onDeletePersonal={onDeletePersonalTx}
        onClose={() => setComposer((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
}
