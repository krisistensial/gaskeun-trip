import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  Compass,
  Crown,
  Database,
  MapPin,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import seedData from './data/seed-solo-jogja-2027.json';
import {
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  CornerOrb,
  DayPill,
  EmptyState,
  GlassCard,
  Input,
  Toast,
  TrailDot,
  type ToastTone,
} from './components/atoms';
import { ExpandingGlassDock } from './components/organisms/ExpandingGlassDock';
import { ensureSeedTrip, getLocalPersonal } from './services/db';
import {
  calculateLedger,
  formatCompactIDR,
  formatIDR,
  markTransactionSettled,
} from './services/ledger';
import type { DockTabId, SharedTrip } from './types/trip';
import './App.css';

const initialTrip = seedData as unknown as SharedTrip;

export default function App() {
  const [trip, setTrip] = useState<SharedTrip>(initialTrip);
  const [activeTab, setActiveTab] = useState<DockTabId>('home');
  const [activeDayId, setActiveDayId] = useState<string>('day-3');
  const [dbReady, setDbReady] = useState<boolean>(false);
  const [localPrepCount, setLocalPrepCount] = useState<number>(0);

  const [mapsLink, setMapsLink] = useState('maps.app.goo.gl/triwindu-solo');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toast, setToast] = useState<{ open: boolean; message: string; tone: ToastTone }>({
    open: false,
    message: '',
    tone: 'success',
  });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const seeded = await ensureSeedTrip(initialTrip);
        const local = await getLocalPersonal(seeded.id);
        if (active) {
          setTrip(seeded);
          setLocalPrepCount(local.personalPrep.length);
          setDbReady(true);
        }
      } catch {
        if (active) setDbReady(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const ledger = useMemo(() => calculateLedger(trip), [trip]);

  const fuelTx = trip.transactions.find((tx) => tx.id === 'tx-out-fuel-solo');
  const isFuelSettled = Boolean(fuelTx?.reimbursed);

  const showToast = (message: string, tone: ToastTone = 'success') => {
    setToast({ open: true, message, tone });
  };

  const handleToggleTentative = () => {
    setTrip((prev) => {
      const nextInclude = !prev.financeConfig.includeTentative;
      showToast(
        nextInclude
          ? 'Valen included — Pool target updated to Rp 7,000,000'
          : 'Valen excluded — Pool target updated to Rp 6,300,000',
        'info',
      );
      return {
        ...prev,
        financeConfig: {
          ...prev.financeConfig,
          includeTentative: nextInclude,
        },
      };
    });
  };

  const handleToggleFuelSettled = () => {
    setTrip((prev) => {
      if (isFuelSettled) {
        return {
          ...prev,
          transactions: prev.transactions.map((tx) =>
            tx.id === 'tx-out-fuel-solo' ? { ...tx, reimbursed: false } : tx,
          ),
        };
      }
      return {
        ...prev,
        transactions: markTransactionSettled(prev.transactions, 'tx-out-fuel-solo'),
      };
    });
    showToast(
      isFuelSettled
        ? 'Reimbursement reset to Unpaid'
        : 'Marked Settled — Pool Left unchanged (zero double deduction)',
      'success',
    );
  };

  return (
    <div className="app-viewport">
      {/* Ambient Mesh Backdrop */}
      <div className="ambient-mesh" aria-hidden="true">
        <div className="ambient-blob ambient-blob--matcha" />
        <div className="ambient-blob ambient-blob--sunlight" />
        <div className="ambient-blob ambient-blob--mint" />
      </div>

      <main className="app-shell">
        <div className="showcase-stack">
          {/* Zero Top Bar — Direct Editorial Header + Corner Orb */}
          <header className="showcase-header">
            <div>
              <h1 className="showcase-title">GASKEUN!</h1>
              <p className="showcase-sub">
                Sprint 1 Foundation · Active Dock: <strong>{activeTab}</strong>
              </p>
            </div>
            <CornerOrb
              kind="menu"
              ariaLabel="Quick menu"
              onClick={() =>
                showToast(
                  dbReady
                    ? `IndexedDB dual-layer ready (${localPrepCount} local prep items)`
                    : 'Running with in-memory pilot seed',
                  'info',
                )
              }
            />
          </header>

          {/* 1. Live Ledger Engine & Solo–Jogja Seed Verification */}
          <section aria-label="Solo-Jogja Ledger Calculator">
            <div className="showcase-section-head">
              <h2 className="showcase-section-title">Solo–Jogja Ledger</h2>
              <Badge tone="mint" icon={<Database size={12} strokeWidth={2} />}>
                {dbReady ? 'IDB Ready' : 'Seeded'}
              </Badge>
            </div>

            <GlassCard variant="spotlight" padding="lg">
              <div className="showcase-section-head" style={{ marginBottom: 4 }}>
                <span className="showcase-eyebrow">
                  Shared Pool · {ledger.activeMemberCount} Riders
                </span>
                <Badge tone="matcha">{ledger.poolProgressPct}%</Badge>
              </div>

              <div className="ledger-big-num">{formatIDR(ledger.poolCollected)}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                of {formatIDR(ledger.poolTarget)} target ({formatCompactIDR(trip.financeConfig.poolTargetPerPerson)} each)
              </div>

              <div className="ledger-bar-track" aria-hidden="true">
                <div
                  className="ledger-bar-fill"
                  style={{ width: `${ledger.poolProgressPct}%` }}
                />
              </div>

              {/* Interactive Crew Avatar Strip (Tap Valen? to toggle target) */}
              <div className="snap-peek-row" style={{ marginBottom: 14 }}>
                {trip.members.slice(0, 5).map((member) => (
                  <Avatar
                    key={member.id}
                    initials={member.initials}
                    name={member.name}
                    showLabel
                    size="sm"
                    bg={member.avatarBg}
                    color={member.avatarColor}
                    variant={member.role === 'passenger' ? 'passenger' : 'solid'}
                  />
                ))}
                {(() => {
                  const valen = trip.members.find((m) => m.id === 'm-valen');
                  if (!valen) return null;
                  return (
                    <Avatar
                      initials={valen.initials}
                      name={valen.name}
                      showLabel
                      size="sm"
                      bg={valen.avatarBg}
                      color={valen.avatarColor}
                      variant={trip.financeConfig.includeTentative ? 'selected' : 'tentative'}
                      onClick={handleToggleTentative}
                    />
                  );
                })()}
              </div>

              <div className="ledger-mini-grid">
                <GlassCard variant="clear" padding="sm">
                  <div className="showcase-eyebrow">Pool Left</div>
                  <div className="ledger-mini-val">{formatIDR(ledger.poolLeft)}</div>
                </GlassCard>
                <GlassCard variant="clear" padding="sm">
                  <div className="showcase-eyebrow">Fundraise Left</div>
                  <div className="ledger-mini-val">{formatIDR(ledger.fundraiseLeft)}</div>
                </GlassCard>
              </div>

              {/* Anti-Double-Deduction Interactive Check */}
              <div className="reimburse-row">
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Fuel 5 Bikes (Solo)</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                    -Rp 100k · Paid by Kris · Pending: {formatIDR(ledger.pendingReimburseTotal)}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={isFuelSettled ? 'glass' : 'matcha'}
                  leftIcon={
                    isFuelSettled ? (
                      <RotateCcw size={13} strokeWidth={2} />
                    ) : (
                      <Check size={14} strokeWidth={2.2} />
                    )
                  }
                  onClick={handleToggleFuelSettled}
                >
                  {isFuelSettled ? 'Settled' : 'Mark Settled'}
                </Button>
              </div>

              {/* Top 5 Contributors Fluid Rows */}
              <div className="contrib-list">
                {ledger.topContributors.slice(0, 5).map((entry, idx) => (
                  <div key={entry.member.id} className="contrib-row">
                    <div
                      className="contrib-row__fill"
                      style={{ width: `${entry.progressPct}%` }}
                    />
                    <div className="contrib-row__left">
                      {idx === 0 && (
                        <Crown size={14} strokeWidth={2} color="var(--accent-amber)" />
                      )}
                      <span className="contrib-row__name">{entry.member.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {entry.progressPct}%
                      </span>
                    </div>
                    <div className="contrib-row__right">
                      <span className="contrib-row__amt">
                        {formatCompactIDR(entry.paidPool)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          </section>

          {/* 2. Vertical Day Pills & Trail Dots (360px Fit Check) */}
          <section aria-label="Day Pills and Trail Dots">
            <div className="showcase-section-head">
              <h2 className="showcase-section-title">Day Pills &amp; Trail Dots</h2>
              <Badge tone="neutral">360px Safe</Badge>
            </div>

            <div className="day-strip-grid">
              {trip.days.map((day) => (
                <DayPill
                  key={day.id}
                  variant={day.isIdeas ? 'ideas' : 'day'}
                  dayLabel={day.dayLabel}
                  dateNum={day.dateNum}
                  active={activeDayId === day.id}
                  onClick={() => setActiveDayId(day.id)}
                />
              ))}
              <DayPill
                variant="add"
                onClick={() => showToast('New day capsule tapped', 'info')}
              />
            </div>

            <GlassCard variant="clear" padding="sm" style={{ marginTop: 10 }}>
              <div className="trail-demo-row">
                <div className="trail-demo-item">
                  <TrailDot status="done" />
                  <span>Done</span>
                </div>
                <div className="trail-demo-item">
                  <TrailDot status="active" />
                  <span>Active Now</span>
                </div>
                <div className="trail-demo-item">
                  <TrailDot status="upcoming" />
                  <span>Upcoming</span>
                </div>
              </div>
            </GlassCard>
          </section>

          {/* 3. Glass Surfaces, Buttons, Orbs & Inputs */}
          <section aria-label="Atomic Showcase">
            <div className="showcase-section-head">
              <h2 className="showcase-section-title">Crystal Liquid Atoms</h2>
              <Badge tone="matcha" icon={<Sparkles size={12} strokeWidth={2} />}>
                Option 2A
              </Badge>
            </div>

            <div className="surface-grid" style={{ marginBottom: 12 }}>
              <GlassCard variant="clear" padding="sm">
                <div className="showcase-eyebrow">Clear</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Standard glass card</div>
              </GlassCard>
              <GlassCard variant="spotlight" padding="sm">
                <div className="showcase-eyebrow">Spotlight</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Luminous hero focus</div>
              </GlassCard>
              <GlassCard variant="elevated" padding="sm">
                <div className="showcase-eyebrow">Elevated</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Dock &amp; modal layer</div>
              </GlassCard>
              <GlassCard variant="tinted" padding="sm">
                <div className="showcase-eyebrow">Tinted</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Soft sage accent</div>
              </GlassCard>
            </div>

            <GlassCard variant="clear" padding="md">
              <div className="showcase-eyebrow" style={{ marginBottom: 10 }}>
                Buttons &amp; Corner Orbs
              </div>
              <div className="pill-wrap-row" style={{ marginBottom: 14 }}>
                <Button
                  variant="matcha"
                  size="sm"
                  rightIcon={<ArrowUpRight size={14} strokeWidth={2} />}
                  onClick={() => showToast('Opening Google Maps route', 'success')}
                >
                  Route
                </Button>
                <Button variant="forest" size="sm" onClick={() => showToast('Forest CTA tapped', 'info')}>
                  Forest
                </Button>
                <Button variant="glass" size="sm" onClick={() => showToast('Glass action tapped', 'info')}>
                  Glass
                </Button>
                <Button variant="ghost" size="sm" onClick={() => showToast('Ghost action tapped', 'info')}>
                  Ghost
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  leftIcon={<Trash2 size={13} strokeWidth={2} />}
                  onClick={() => setDialogOpen(true)}
                >
                  Delete
                </Button>
              </div>

              <div className="pill-wrap-row" style={{ marginBottom: 16 }}>
                <CornerOrb kind="back" ariaLabel="Back" onClick={() => showToast('Back orb', 'info')} />
                <CornerOrb kind="menu" ariaLabel="Menu" onClick={() => showToast('Menu orb', 'info')} />
                <CornerOrb kind="close" ariaLabel="Close" onClick={() => showToast('Close orb', 'info')} />
                <CornerOrb kind="add" size="lg" ariaLabel="Add item" onClick={() => showToast('Floating Add orb', 'success')} />
                <Badge tone="mint">Settled</Badge>
                <Badge tone="amber">Unpaid</Badge>
                <Badge tone="coral">Closed Sun</Badge>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Input
                  id="maps-link-verified"
                  label="Google Maps Link"
                  value={mapsLink}
                  onChange={(e) => setMapsLink(e.target.value)}
                  leftIcon={<MapPin size={16} strokeWidth={1.8} />}
                  status={mapsLink.includes('maps') ? 'verified' : 'error'}
                  errorMessage={
                    mapsLink.includes('maps') ? undefined : 'Paste a valid Google Maps link'
                  }
                />
                <Input
                  id="error-demo"
                  label="Error State Preview"
                  defaultValue="SOLO-99"
                  errorMessage="Trip code not found on this device"
                />
              </div>
            </GlassCard>
          </section>

          {/* 4. Empty State Preview */}
          <EmptyState
            icon={<Compass size={22} strokeWidth={1.8} />}
            title="No personal expenses yet"
            description="Snacks and souvenirs logged here stay private on this device."
            action={
              <Button
                variant="glass"
                size="sm"
                onClick={() => showToast('Add personal entry ready in Sprint 3', 'info')}
              >
                Add First Treat
              </Button>
            }
          />
        </div>
      </main>

      {/* Live Expanding Glass Dock V4 */}
      <ExpandingGlassDock activeTab={activeTab} onChange={setActiveTab} />

      {/* ConfirmDialog & Toast Atoms */}
      <ConfirmDialog
        open={dialogOpen}
        title="Delete this transaction?"
        description="This removes the entry from the shared ledger and recalculates balances immediately."
        confirmLabel="Delete"
        destructive
        onCancel={() => setDialogOpen(false)}
        onConfirm={() => {
          setDialogOpen(false);
          showToast('Confirmation dialog verified', 'error');
        }}
      />

      <Toast
        open={toast.open}
        message={toast.message}
        tone={toast.tone}
        onClose={() => setToast((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
}
