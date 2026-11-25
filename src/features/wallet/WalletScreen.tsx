import { useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronRight,
  Lock,
  Plus,
  SlidersHorizontal,
  Trash2,
  Wallet as WalletIcon,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  CornerOrb,
  EmptyState,
  GlassCard,
  LiquidBottomSheet,
} from '../../components/atoms';
import { useHorizontalScrollFade } from '../../hooks/useHorizontalScrollFade';
import {
  calculateLedger,
  calculatePersonalTotal,
  formatCompactIDR,
  formatIDR,
  markTransactionSettled,
  type BudgetPocketSummary,
  type MemberContributionSummary,
} from '../../services/ledger';
import { triggerFeedback } from '../../services/feedback';
import type { BudgetPocket, SharedTrip, Transaction } from '../../types/trip';
import { AddTransactionSheet, type TxComposerMode } from './AddTransactionSheet';
import { PocketSheet } from './PocketSheet';
import { WalletHostToolsSheet } from './WalletHostToolsSheet';
import './wallet.css';

type WalletTab = 'combined' | 'pool' | 'fundraise' | 'spent' | 'personal';
type SpentFilter = 'all' | 'reimburse' | 'pockets' | 'pool' | 'fundraise';

export interface WalletScreenProps {
  trip: SharedTrip;
  personalTransactions: Transaction[];
  canEdit: boolean;
  isHost?: boolean;
  viewOnlyMode?: boolean;
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
  isHost = false,
  viewOnlyMode = false,
  onOpenMenu,
  onRequestUnlockPin,
  onUpdateTrip,
  onUpsertPersonalTx,
  onDeletePersonalTx,
}: WalletScreenProps) {
  const [subTab, setSubTab] = useState<WalletTab>('combined');
  const [spentFilter, setSpentFilter] = useState<SpentFilter>('all');
  const subtabsRef = useRef<HTMLDivElement | null>(null);
  const subtabsFade = useHorizontalScrollFade(subtabsRef, [subTab]);

  const [composer, setComposer] = useState<{
    open: boolean;
    mode: TxComposerMode;
    editing: Transaction | null;
    defaultMemberId?: string;
    defaultBudgetPocketId?: string;
  }>({ open: false, mode: 'expense', editing: null });
  const [pocketSheet, setPocketSheet] = useState<{
    open: boolean;
    editing: BudgetPocketSummary | null;
  }>({ open: false, editing: null });
  const [hostToolsOpen, setHostToolsOpen] = useState(false);
  const [confirmDeleteTx, setConfirmDeleteTx] = useState<Transaction | null>(null);
  const [confirmDeletePocket, setConfirmDeletePocket] = useState<BudgetPocket | null>(null);
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
  const pocketById = useMemo(
    () => new Map((trip.budgetPockets ?? []).map((p) => [p.id, p])),
    [trip.budgetPockets],
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
        if (spentFilter === 'pockets') return Boolean(tx.budgetPocketId && pocketById.has(tx.budgetPocketId));
        return tx.pocket === spentFilter && !tx.budgetPocketId;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [trip.transactions, spentFilter, pocketById]);

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
    triggerFeedback('success');
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
    triggerFeedback('warning');
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
      triggerFeedback('success');
      onUpdateTrip(
        (prev) => ({
          ...prev,
          transactions: markTransactionSettled(prev.transactions, txId),
        }),
        'Marked Settled — balance stays unchanged',
      );
    });
  };

  const handleSavePocket = (pocket: BudgetPocket, isNew: boolean) => {
    onUpdateTrip(
      (prev) => {
        const current = prev.budgetPockets ?? [];
        const nextPockets = isNew
          ? [...current, pocket]
          : current.map((p) => (p.id === pocket.id ? pocket : p));
        return { ...prev, budgetPockets: nextPockets };
      },
      isNew ? `${pocket.name} pocket created` : `${pocket.name} pocket updated`,
    );
  };

  const handleDeletePocket = (pocketId: string) => {
    triggerFeedback('warning');
    onUpdateTrip(
      (prev) => ({
        ...prev,
        budgetPockets: (prev.budgetPockets ?? []).filter((p) => p.id !== pocketId),
        transactions: prev.transactions.map((tx) =>
          tx.budgetPocketId === pocketId ? { ...tx, budgetPocketId: undefined } : tx,
        ),
      }),
      'Budget pocket removed — funds returned to Unallocated',
    );
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
      {/* Header + Host Controls + Corner Orb */}
      <header className="wallet-header">
        <h1 className="wallet-title">Wallet</h1>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {isHost && canEdit && (
            <CornerOrb
              kind="custom"
              ariaLabel="Host ledger controls and balance editor"
              icon={<SlidersHorizontal size={18} strokeWidth={1.9} />}
              onClick={() => {
                triggerFeedback('tap');
                setHostToolsOpen(true);
              }}
            />
          )}
          <CornerOrb kind="menu" ariaLabel="Trip menu" onClick={onOpenMenu} />
        </div>
      </header>

      {/* 5 Sub-Tab Pills (Combined Treasury · Pool · Fundraise · Spent · Personal) */}
      <div
        ref={subtabsRef}
        className="wallet-subtabs"
        data-fade={subtabsFade.dataFade}
        role="tablist"
        aria-label="Wallet pockets"
      >
        {(
          [
            { id: 'combined', label: 'Combined' },
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

      {/* SUB-TAB 0: COMBINED TREASURY & BUDGET POCKETS */}
      {subTab === 'combined' && (
        <>
          <GlassCard variant="spotlight" padding="lg">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="gk-field__label">COMBINED TREASURY · POOL + FUNDRAISE</span>
              <Badge tone="matcha">{ledger.pockets.length} pockets</Badge>
            </div>
            <div className="wallet-hero-num">{formatIDR(ledger.combinedNetBalance)}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
              Total In: <strong>{formatCompactIDR(ledger.combinedCollected)}</strong> · Total Spent:{' '}
              <strong>{formatCompactIDR(ledger.totalSpent)}</strong>
            </div>

            <div className="treasury-source-grid">
              <div className="treasury-source-tile">
                <span className="gk-field__label">CREW POOL</span>
                <div className="treasury-source-tile__val">
                  {formatCompactIDR(ledger.poolCollected)}
                </div>
                <div className="treasury-source-tile__sub">
                  Free: {formatCompactIDR(ledger.poolUnallocated)} · Alloc:{' '}
                  {formatCompactIDR(ledger.poolAllocated)}
                </div>
              </div>

              <div className="treasury-source-tile">
                <span className="gk-field__label">FUNDRAISE</span>
                <div className="treasury-source-tile__val">
                  {formatCompactIDR(ledger.fundraiseCollected)}
                </div>
                <div className="treasury-source-tile__sub">
                  Free: {formatCompactIDR(ledger.fundraiseUnallocated)} · Alloc:{' '}
                  {formatCompactIDR(ledger.fundraiseAllocated)}
                </div>
              </div>
            </div>

            <div className="treasury-unallocated-pill">
              <span>Unallocated Cash (Ready to Assign)</span>
              <strong>{formatIDR(ledger.combinedUnallocated)}</strong>
            </div>
          </GlassCard>

          <div className="pocket-section-head">
            <div>
              <div className="gk-field__label">BUDGET POCKETS</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                Allocate Combined funds into custom purpose envelopes
              </div>
            </div>
            {canEdit && (
              <Button
                variant="matcha"
                size="sm"
                leftIcon={<Plus size={14} strokeWidth={2.2} />}
                onClick={() =>
                  guardSharedEdit(() => setPocketSheet({ open: true, editing: null }))
                }
              >
                New Pocket
              </Button>
            )}
          </div>

          {ledger.pockets.length === 0 ? (
            <EmptyState
              icon={<WalletIcon size={22} strokeWidth={1.8} />}
              title="No budget pockets yet"
              description="Create pockets like Transport, Stay, or Food and choose exactly how much comes from Pool vs Fundraise."
              action={
                canEdit ? (
                  <Button
                    variant="matcha"
                    size="sm"
                    leftIcon={<Plus size={14} strokeWidth={2.2} />}
                    onClick={() =>
                      guardSharedEdit(() => setPocketSheet({ open: true, editing: null }))
                    }
                  >
                    Create First Pocket
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="tx-list">
              {ledger.pockets.map((summary) => (
                <GlassCard
                  key={summary.pocket.id}
                  variant="clear"
                  padding="md"
                  className="pocket-card"
                >
                  <div className="pocket-card__top">
                    <div className="pocket-card__title-wrap">
                      <span className="pocket-card__emoji">{summary.pocket.emoji}</span>
                      <div style={{ minWidth: 0 }}>
                        <div className="pocket-card__name">{summary.pocket.name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                          Spent {formatCompactIDR(summary.spent)} of{' '}
                          {formatCompactIDR(summary.allocatedTotal)}
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div
                        className={`tx-amt ${summary.isOverBudget ? 'tx-amt--out' : 'tx-amt--in'}`}
                      >
                        {formatCompactIDR(summary.remaining)}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 600 }}>
                        {summary.isOverBudget ? 'Overbudget' : 'Remaining'}
                      </div>
                    </div>
                  </div>

                  {/* Transparent Accounting Source Breakdown */}
                  <div className="pocket-card__sources">
                    {summary.allocatedFromPool > 0 && (
                      <span className="pocket-origin-pill">
                        Pool: {formatCompactIDR(summary.allocatedFromPool)}
                      </span>
                    )}
                    {summary.allocatedFromFundraise > 0 && (
                      <span className="pocket-origin-pill">
                        Fundraise: {formatCompactIDR(summary.allocatedFromFundraise)}
                      </span>
                    )}
                    <span className="pocket-origin-pill">
                      Total: {formatCompactIDR(summary.allocatedTotal)}
                    </span>
                  </div>

                  <div className="wallet-progress-track" style={{ margin: '2px 0' }}>
                    <div
                      className="wallet-progress-fill"
                      style={{
                        width: `${Math.min(100, summary.progressPct)}%`,
                        background: summary.isOverBudget
                          ? 'var(--accent-coral)'
                          : 'var(--brand-matcha)',
                      }}
                    />
                  </div>

                  {canEdit && (
                    <div className="pocket-card__actions">
                      <button
                        type="button"
                        className="tx-inline-del-btn tactile"
                        aria-label={`Delete ${summary.pocket.name} pocket`}
                        onClick={() => {
                          triggerFeedback('warning');
                          setConfirmDeletePocket(summary.pocket);
                        }}
                      >
                        <Trash2 size={14} strokeWidth={2} />
                      </button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          guardSharedEdit(() =>
                            setPocketSheet({ open: true, editing: summary }),
                          )
                        }
                      >
                        Allocate
                      </Button>
                      <Button
                        variant="matcha"
                        size="sm"
                        onClick={() =>
                          guardSharedEdit(() =>
                            setComposer({
                              open: true,
                              mode: 'expense',
                              editing: null,
                              defaultBudgetPocketId: summary.pocket.id,
                            }),
                          )
                        }
                      >
                        Spend
                      </Button>
                    </div>
                  )}
                </GlassCard>
              ))}
            </div>
          )}
        </>
      )}

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
                    src={m.avatarDataUrl}
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
                    name={entry.member.name}
                    src={entry.member.avatarDataUrl}
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
                    className={entry.paidPool > 0 ? 'tx-amt tx-amt--in' : 'tx-amt'}
                    style={{
                      fontSize: 15,
                      color: entry.paidPool > 0 ? 'var(--accent-mint)' : 'var(--accent-amber)',
                    }}
                  >
                    {entry.paidPool > 0 ? `+${formatCompactIDR(entry.paidPool)}` : 'Rp 0'}
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
                  onClick={() => {
                    if (!canEdit) return;
                    setComposer({ open: true, mode: 'fundraise', editing: tx });
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{tx.title}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                      {tx.date}
                      {tx.note ? ` · ${tx.note}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span className="tx-amt tx-amt--in">+{formatCompactIDR(tx.amount)}</span>
                    {canEdit && (
                      <button
                        type="button"
                        className="tx-inline-del-btn tactile"
                        aria-label={`Delete ${tx.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerFeedback('warning');
                          setConfirmDeleteTx(tx);
                        }}
                      >
                        <Trash2 size={14} strokeWidth={2} />
                      </button>
                    )}
                  </div>
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
                ...(ledger.pockets.length > 0
                  ? ([{ id: 'pockets', label: 'Pockets' }] as const)
                  : []),
                { id: 'pool', label: 'Pool Direct' },
                { id: 'fundraise', label: 'Fundraise' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                className={`plan-chip tactile ${spentFilter === f.id ? 'plan-chip--active' : ''}`}
                onClick={() => {
                  triggerFeedback('tap');
                  setSpentFilter(f.id);
                }}
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
                const linkedPocket = tx.budgetPocketId ? pocketById.get(tx.budgetPocketId) : undefined;
                const sourceLabel = linkedPocket
                  ? `${linkedPocket.emoji} ${linkedPocket.name}`
                  : tx.pocket === 'pool'
                    ? 'Pool'
                    : 'Fundraise';
                const isUnpaid = Boolean(tx.paidOutOfPocket && !tx.reimbursed);
                return (
                  <GlassCard
                    key={tx.id}
                    variant="clear"
                    padding="md"
                    interactive
                    className="tx-card"
                    onClick={() => {
                      if (!canEdit) return;
                      setComposer({ open: true, mode: 'expense', editing: tx });
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{tx.title}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                        {tx.paidOutOfPocket
                          ? `Paid by ${payer?.name ?? 'Crew'}`
                          : 'Direct from fund'}{' '}
                        · {sourceLabel}
                      </div>
                      {isUnpaid && canEdit && (
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
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span className={`tx-amt ${isUnpaid ? 'tx-amt--unpaid' : 'tx-amt--out'}`}>
                          -{formatCompactIDR(tx.amount)}
                        </span>
                        {canEdit && (
                          <button
                            type="button"
                            className="tx-inline-del-btn tactile"
                            aria-label={`Delete ${tx.title}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              triggerFeedback('warning');
                              setConfirmDeleteTx(tx);
                            }}
                          >
                            <Trash2 size={14} strokeWidth={2} />
                          </button>
                        )}
                      </div>
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
                  !viewOnlyMode ? (
                    <Button
                      variant="matcha"
                      size="sm"
                      onClick={() => setComposer({ open: true, mode: 'personal', editing: null })}
                    >
                      Add Personal Item
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              personalTransactions.map((tx) => (
                <GlassCard
                  key={tx.id}
                  variant="clear"
                  padding="md"
                  interactive={!viewOnlyMode}
                  className="tx-card"
                  onClick={() => {
                    if (viewOnlyMode) return;
                    setComposer({ open: true, mode: 'personal', editing: tx });
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{tx.title}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                      {tx.date}
                      {tx.note ? ` · ${tx.note}` : ''}
                    </div>
                  </div>
                  <span className="tx-amt tx-amt--out">-{formatCompactIDR(tx.amount)}</span>
                </GlassCard>
              ))
            )}
          </div>
        </>
      )}

      {/* Floating Glass (+) Button — hidden in View-Only Mode, Editor-only on shared tabs */}
      {!viewOnlyMode && (subTab === 'personal' || canEdit) && (
        <CornerOrb
          kind="add"
          size="lg"
          ariaLabel="Add transaction"
          className="floating-glass-fab"
          onClick={handleOpenFab}
        />
      )}

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
                  <div
                    key={tx.id}
                    className="gk-menu-item"
                    style={{ cursor: canEdit ? 'pointer' : 'default' }}
                    onClick={() => {
                      if (!canEdit) return;
                      setSelectedMemberId(null);
                      setComposer({ open: true, mode: 'pool', editing: tx });
                    }}
                  >
                    <div>
                      <div className="gk-menu-item__title">{tx.title}</div>
                      <div className="gk-menu-item__sub">
                        {tx.date}
                        {tx.note ? ` · ${tx.note}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span className="tx-amt tx-amt--in">+{formatCompactIDR(tx.amount)}</span>
                      {canEdit && (
                        <button
                          type="button"
                          className="tx-inline-del-btn tactile"
                          aria-label={`Delete ${tx.title}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            triggerFeedback('warning');
                            setConfirmDeleteTx(tx);
                          }}
                        >
                          <Trash2 size={14} strokeWidth={2} />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {canEdit && (
              <Button
                variant="matcha"
                size="lg"
                fullWidth
                leftIcon={<Plus size={16} strokeWidth={2} />}
                onClick={() => {
                  const mid = selectedMemberSummary.member.id;
                  setSelectedMemberId(null);
                  setComposer({
                    open: true,
                    mode: 'pool',
                    editing: null,
                    defaultMemberId: mid,
                  });
                }}
              >
                Add Deposit for {selectedMemberSummary.member.name}
              </Button>
            )}
          </>
        )}
      </LiquidBottomSheet>

      {/* Smart Add / Edit Transaction Sheet (06e_Add_Transaction) */}
      <AddTransactionSheet
        key={`tx-${composer.open ? `${composer.mode}-${composer.editing?.id ?? 'new'}-${composer.defaultMemberId ?? ''}-${composer.defaultBudgetPocketId ?? ''}` : 'closed'}`}
        open={composer.open}
        tripId={trip.id}
        members={trip.members}
        pockets={ledger.pockets}
        poolUnallocated={ledger.poolUnallocated}
        fundraiseUnallocated={ledger.fundraiseUnallocated}
        initialMode={composer.mode}
        editingTx={composer.editing}
        defaultMemberId={composer.defaultMemberId}
        defaultBudgetPocketId={composer.defaultBudgetPocketId}
        onSaveShared={handleSaveSharedTx}
        onSavePersonal={(tx, isNew) => {
          triggerFeedback('success');
          onUpsertPersonalTx(tx, isNew);
        }}
        onDeleteShared={handleDeleteSharedTx}
        onDeletePersonal={(id) => {
          triggerFeedback('warning');
          onDeletePersonalTx(id);
        }}
        onClose={() => setComposer((prev) => ({ ...prev, open: false }))}
      />

      <PocketSheet
        key={`pkt-${pocketSheet.open ? pocketSheet.editing?.pocket.id ?? 'new' : 'closed'}`}
        open={pocketSheet.open}
        editingSummary={pocketSheet.editing}
        poolUnallocated={ledger.poolUnallocated}
        fundraiseUnallocated={ledger.fundraiseUnallocated}
        onSave={handleSavePocket}
        onDelete={handleDeletePocket}
        onClose={() => setPocketSheet({ open: false, editing: null })}
      />

      <WalletHostToolsSheet
        key={`host-tools-${hostToolsOpen ? 'open' : 'closed'}`}
        open={hostToolsOpen}
        trip={trip}
        ledger={ledger}
        onUpdateTrip={onUpdateTrip}
        onClose={() => setHostToolsOpen(false)}
      />

      <ConfirmDialog
        open={Boolean(confirmDeleteTx)}
        title={`Delete "${confirmDeleteTx?.title ?? 'transaction'}"?`}
        description="Balances will immediately recalculate after removing this transaction."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDeleteTx(null)}
        onConfirm={() => {
          if (confirmDeleteTx) {
            handleDeleteSharedTx(confirmDeleteTx.id);
          }
          setConfirmDeleteTx(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(confirmDeletePocket)}
        title={`Delete "${confirmDeletePocket?.name ?? 'pocket'}"?`}
        description="Allocated cash returns to Unallocated Cash, while any past expenses stay in Spent history."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDeletePocket(null)}
        onConfirm={() => {
          if (confirmDeletePocket) {
            handleDeletePocket(confirmDeletePocket.id);
          }
          setConfirmDeletePocket(null);
        }}
      />
    </div>
  );
}
