import { useMemo, useRef, useState, type PointerEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
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

const WALLET_TABS: ReadonlyArray<{ id: WalletTab; label: string }> = [
  { id: 'combined', label: 'Combined' },
  { id: 'pool', label: 'Pool' },
  { id: 'fundraise', label: 'Fundraise' },
  { id: 'spent', label: 'Spent' },
  { id: 'personal', label: 'Personal' },
];

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

const walletTabVariants = {
  enter: (dir: 'left' | 'right' | 'none') => ({
    x: dir === 'left' ? 44 : dir === 'right' ? -44 : 0,
    opacity: dir === 'none' ? 1 : 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] as const },
  },
  exit: (dir: 'left' | 'right' | 'none') => ({
    x: dir === 'left' ? -44 : dir === 'right' ? 44 : 0,
    opacity: 0,
    transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

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
  const [slideDir, setSlideDir] = useState<'left' | 'right' | 'none'>('none');
  const [spentFilter, setSpentFilter] = useState<SpentFilter>('all');
  const subtabsRef = useRef<HTMLDivElement | null>(null);
  const subtabBtnRefs = useRef<Partial<Record<WalletTab, HTMLButtonElement | null>>>({});
  const swipeFollowRef = useRef<HTMLDivElement | null>(null);
  const subtabsFade = useHorizontalScrollFade(subtabsRef, [subTab]);
  const swipeRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startAt: number;
    locked: boolean;
    offsetX: number;
  }>({
    pointerId: -1,
    startX: 0,
    startY: 0,
    startAt: 0,
    locked: false,
    offsetX: 0,
  });

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

  const resetSwipeFollow = (animateBack: boolean) => {
    const el = swipeFollowRef.current;
    if (!el) return;
    el.style.transition = animateBack
      ? 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease'
      : 'none';
    el.style.transform = 'translate3d(0, 0, 0)';
    el.style.opacity = '1';
  };

  const selectWalletTab = (next: WalletTab, explicitDir?: 'left' | 'right') => {
    if (next === subTab) return;
    const prevIdx = WALLET_TABS.findIndex((t) => t.id === subTab);
    const nextIdx = WALLET_TABS.findIndex((t) => t.id === next);
    setSlideDir(explicitDir ?? (nextIdx > prevIdx ? 'left' : 'right'));
    setSubTab(next);
    requestAnimationFrame(() => {
      const container = subtabsRef.current;
      const btn = subtabBtnRefs.current[next];
      if (container && btn) {
        const targetLeft = btn.offsetLeft - container.clientWidth / 2 + btn.clientWidth / 2;
        container.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
      }
    });
  };

  const handleStagePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button > 0) return;
    const target = e.target as Element | null;
    if (
      target?.closest('.snap-peek-row, .wallet-subtabs, .plan-filter-row, input, textarea')
    ) {
      return;
    }
    resetSwipeFollow(false);
    swipeRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startAt: performance.now(),
      locked: false,
      offsetX: 0,
    };
  };

  const handleStagePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const s = swipeRef.current;
    if (s.pointerId !== e.pointerId) return;

    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;

    if (!s.locked) {
      if (Math.abs(dy) > 14) {
        s.pointerId = -1;
        return;
      }
      if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.35) {
        s.locked = true;
      } else {
        return;
      }
    }

    const idx = WALLET_TABS.findIndex((t) => t.id === subTab);
    const atLeftEdge = idx === 0 && dx > 0;
    const atRightEdge = idx === WALLET_TABS.length - 1 && dx < 0;
    const atEdge = atLeftEdge || atRightEdge;
    const raw = dx * (atEdge ? 0.14 : 0.36);
    const offset = atEdge ? Math.max(-18, Math.min(18, raw)) : Math.max(-44, Math.min(44, raw));
    s.offsetX = offset;

    const el = swipeFollowRef.current;
    if (el) {
      el.style.transition = 'none';
      el.style.transform = `translate3d(${offset}px, 0, 0)`;
      el.style.opacity = atEdge ? '1' : String(Math.max(0.88, 1 - Math.abs(offset) / 360));
    }
  };

  const handleStagePointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    const s = swipeRef.current;
    if (s.pointerId !== e.pointerId) return;
    const wasLocked = s.locked;
    const dx = e.clientX - s.startX;
    const elapsed = Math.max(16, performance.now() - s.startAt);
    const vx = Math.abs(dx) / elapsed;
    s.pointerId = -1;
    s.locked = false;

    if (!wasLocked) return;

    const idx = WALLET_TABS.findIndex((t) => t.id === subTab);
    const passed = Math.abs(dx) >= 44 || (Math.abs(dx) >= 24 && vx >= 0.35);

    if (passed && dx < 0 && idx < WALLET_TABS.length - 1) {
      resetSwipeFollow(false);
      triggerFeedback('tick');
      selectWalletTab(WALLET_TABS[idx + 1].id, 'left');
      return;
    }
    if (passed && dx > 0 && idx > 0) {
      resetSwipeFollow(false);
      triggerFeedback('tick');
      selectWalletTab(WALLET_TABS[idx - 1].id, 'right');
      return;
    }

    resetSwipeFollow(true);
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

      {/* 5 Sub-Tab Pills (Combined · Pool · Fundraise · Spent · Personal) */}
      <div
        ref={subtabsRef}
        className="wallet-subtabs"
        data-fade={subtabsFade.dataFade}
        role="tablist"
        aria-label="Wallet pockets"
      >
        {WALLET_TABS.map((tab) => (
          <button
            key={tab.id}
            ref={(el) => {
              subtabBtnRefs.current[tab.id] = el;
            }}
            type="button"
            role="tab"
            aria-selected={subTab === tab.id}
            className={`wallet-subtab tactile ${subTab === tab.id ? 'wallet-subtab--active' : ''}`}
            onClick={() => {
              triggerFeedback('tap');
              selectWalletTab(tab.id);
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Horizontally Swipeable Tab Content Stage */}
      <div
        className="wallet-swipe-stage"
        onPointerDown={handleStagePointerDown}
        onPointerMove={handleStagePointerMove}
        onPointerUp={handleStagePointerEnd}
        onPointerCancel={handleStagePointerEnd}
      >
        <div ref={swipeFollowRef} className="wallet-swipe-follow">
          <AnimatePresence mode="popLayout" custom={slideDir} initial={false}>
            <motion.div
              key={subTab}
              custom={slideDir}
              variants={walletTabVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="wallet-tab-panel"
            >
      {/* SUB-TAB 0: COMBINED TREASURY & BUDGET POCKETS */}
      {subTab === 'combined' && (
        <>
          <GlassCard variant="spotlight" padding="lg">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="gk-field__label">COMBINED BALANCE</span>
              <Badge tone="matcha">
                {ledger.pockets.length} {ledger.pockets.length === 1 ? 'pocket' : 'pockets'}
              </Badge>
            </div>
            <div className="wallet-hero-num">{formatIDR(ledger.combinedNetBalance)}</div>
            <div className="treasury-inline-stats">
              <span>In {formatCompactIDR(ledger.combinedCollected)}</span>
              <span>·</span>
              <span>Spent {formatCompactIDR(ledger.totalSpent)}</span>
              <span>·</span>
              <strong>Free {formatCompactIDR(ledger.combinedUnallocated)}</strong>
            </div>

            {ledger.combinedNetBalance > 0 && (
              <div className="treasury-alloc-track" aria-hidden="true">
                <div
                  className="treasury-alloc-fill"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round(
                        (Math.max(0, ledger.totalPocketRemaining) /
                          Math.max(1, ledger.combinedNetBalance)) *
                          100,
                      ),
                    )}%`,
                  }}
                />
              </div>
            )}

            <div className="treasury-split-row">
              <button
                type="button"
                className="treasury-split-col tactile"
                onClick={() => {
                  triggerFeedback('tap');
                  selectWalletTab('pool', 'left');
                }}
              >
                <span className="gk-field__label">CREW POOL</span>
                <div className="treasury-split-col__val">
                  {formatCompactIDR(ledger.poolCollected)}
                </div>
                <div className="treasury-split-col__sub">
                  Free {formatCompactIDR(ledger.poolUnallocated)}
                </div>
              </button>

              <span className="treasury-split-divider" aria-hidden="true" />

              <button
                type="button"
                className="treasury-split-col tactile"
                onClick={() => {
                  triggerFeedback('tap');
                  selectWalletTab('fundraise', 'left');
                }}
              >
                <span className="gk-field__label">FUNDRAISE</span>
                <div className="treasury-split-col__val">
                  {formatCompactIDR(ledger.fundraiseCollected)}
                </div>
                <div className="treasury-split-col__sub">
                  Free {formatCompactIDR(ledger.fundraiseUnallocated)}
                </div>
              </button>
            </div>
          </GlassCard>

          <div className="pocket-section-head">
            <span className="gk-field__label">POCKETS</span>
            {canEdit && (
              <Button
                variant="matcha"
                size="sm"
                leftIcon={<Plus size={14} strokeWidth={2.2} />}
                onClick={() =>
                  guardSharedEdit(() => setPocketSheet({ open: true, editing: null }))
                }
              >
                New
              </Button>
            )}
          </div>

          {ledger.pockets.length === 0 ? (
            <EmptyState
              icon={<WalletIcon size={22} strokeWidth={1.8} />}
              title="No budget pockets yet"
              description="Split combined cash into pockets like Transport, Stay, or Food and see exact Pool vs Fundraise sources."
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
              {ledger.pockets.map((summary) => {
                const originParts: string[] = [];
                if (summary.allocatedFromPool > 0) {
                  originParts.push(`Pool ${formatCompactIDR(summary.allocatedFromPool)}`);
                }
                if (summary.allocatedFromFundraise > 0) {
                  originParts.push(
                    `Fundraise ${formatCompactIDR(summary.allocatedFromFundraise)}`,
                  );
                }

                return (
                  <GlassCard
                    key={summary.pocket.id}
                    variant="clear"
                    padding="md"
                    interactive={canEdit}
                    className="pocket-card"
                    onClick={() => {
                      if (!canEdit) return;
                      setPocketSheet({ open: true, editing: summary });
                    }}
                  >
                    <div className="pocket-card__top">
                      <div className="pocket-card__title-wrap">
                        <span className="pocket-card__emoji">{summary.pocket.emoji}</span>
                        <div style={{ minWidth: 0 }}>
                          <div className="pocket-card__name">{summary.pocket.name}</div>
                          <div className="pocket-card__origin">
                            {originParts.join(' · ') || 'No allocation'}
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div
                          className={`tx-amt ${summary.isOverBudget ? 'tx-amt--out' : 'tx-amt--in'}`}
                        >
                          {formatCompactIDR(summary.remaining)}
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 600 }}>
                          Spent {formatCompactIDR(summary.spent)} /{' '}
                          {formatCompactIDR(summary.allocatedTotal)}
                        </div>
                      </div>
                    </div>

                    <div className="wallet-progress-track" style={{ height: 7, margin: '2px 0' }}>
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
                      <div
                        className="pocket-card__actions"
                        onClick={(e) => e.stopPropagation()}
                      >
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
                );
              })}
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
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

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
