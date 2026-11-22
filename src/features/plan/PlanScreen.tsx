import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowUpRight, CalendarPlus, FileSpreadsheet } from 'lucide-react';
import {
  Badge,
  Button,
  CornerOrb,
  DayPill,
  EmptyState,
  GlassCard,
  TrailDot,
} from '../../components/atoms';
import { exportTripToExcel } from '../../services/excelExporter';
import { formatCompactIDR } from '../../services/ledger';
import { toggleStopDoneStatus } from '../../services/permissions';
import { isClosedOnDate } from '../../services/planUtils';
import type {
  PlanItem,
  PlanItemStatus,
  PlanItemType,
  RouteTarget,
  SharedTrip,
  TripDay,
} from '../../types/trip';
import {
  ARC_BASE_X,
  ARC_BULGE,
  ARC_HEIGHT,
  ARC_MAX_X,
  ARC_WIDTH,
  buildDottedArcPath,
  getArcX,
} from './arcMath';
import { PlanDetailEditScreen } from './PlanDetailEditScreen';
import './plan.css';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOTTED_ARC_PATH = buildDottedArcPath(10, 56);
const DOT_HALF_SIZE = 14; // .trail-item__dot is 28x28 -> center offset = 14px
const DOT_TOP_OFFSET = 18; // .trail-item__dot top: 18px -> center Y = rowTop + 32px

function formatEstimate(cost?: number): string {
  if (cost === undefined) return '—';
  if (cost === 0) return 'Free';
  return formatCompactIDR(cost);
}

function formatStopType(type: PlanItemType): string {
  if (type === 'transit') return 'Transit';
  if (type === 'activity') return 'Activity';
  return 'Place';
}

function getLocalTodayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function parseMinutes(hhmm?: string): number {
  if (!hhmm) return -1;
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return -1;
  return h * 60 + m;
}

/**
 * Resolves the effective display status of each stop on the selected day:
 * - Explicit manual `done` or `active` always wins.
 * - On the actual trip date (`day.date === today`), highlights the stop matching
 *   the device's local clock as `active`.
 */
function resolveEffectiveStatuses(
  items: PlanItem[],
  dayDate?: string,
): Map<string, PlanItemStatus> {
  const result = new Map<string, PlanItemStatus>();
  const hasExplicitActive = items.some((i) => i.status === 'active');
  const isToday = Boolean(dayDate && dayDate === getLocalTodayIso());
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  let autoActiveId: string | null = null;
  if (isToday && !hasExplicitActive) {
    for (let i = 0; i < items.length; i += 1) {
      const stop = items[i];
      if (stop.status === 'done' || stop.status === 'idea') continue;
      const startM = parseMinutes(stop.startTime);
      const nextStart = items[i + 1] ? parseMinutes(items[i + 1].startTime) : 24 * 60;
      const endM = stop.endTime ? parseMinutes(stop.endTime) : nextStart;
      if (startM >= 0 && nowMins >= startM && nowMins < Math.max(startM + 30, endM)) {
        autoActiveId = stop.id;
        break;
      }
    }
  }

  for (const item of items) {
    if (item.status === 'done') {
      result.set(item.id, 'done');
    } else if (item.status === 'active' || item.id === autoActiveId) {
      result.set(item.id, 'active');
    } else {
      result.set(item.id, item.status);
    }
  }
  return result;
}

export interface PlanScreenProps {
  trip: SharedTrip;
  canEdit: boolean;
  onRequestUnlockPin: () => void;
  onOpenRoute: (target: RouteTarget) => void;
  onUpdateTrip: (updater: (prev: SharedTrip) => SharedTrip, toastMsg?: string) => void;
}

export function PlanScreen({
  trip,
  canEdit,
  onRequestUnlockPin,
  onOpenRoute,
  onUpdateTrip,
}: PlanScreenProps) {
  const [viewMode, setViewMode] = useState<'trail' | 'table'>('trail');
  const [selectedDayId, setSelectedDayId] = useState<string>(
    trip.days.find((d) => d.id === 'day-3')?.id ?? trip.days[0]?.id ?? 'day-1',
  );
  const [typeFilter, setTypeFilter] = useState<'all' | PlanItemType>('all');
  const [editingStopId, setEditingStopId] = useState<string | null>(null);
  const [draftNewStop, setDraftNewStop] = useState<PlanItem | null>(null);

  const arcStickyRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const dotRefs = useRef<Map<string, HTMLElement>>(new Map());
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const selectedDay = trip.days.find((d) => d.id === selectedDayId) ?? trip.days[0];
  const dayLabelStr = selectedDay?.isIdeas
    ? 'Ideas'
    : `${selectedDay?.dayLabel ?? ''} ${selectedDay?.dateNum ?? ''}`.trim();

  const allDayItems = useMemo(
    () =>
      trip.itinerary
        .filter((item) => item.dayId === selectedDay?.id)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [trip.itinerary, selectedDay?.id],
  );

  const dayItems = useMemo(
    () => allDayItems.filter((item) => typeFilter === 'all' || item.type === typeFilter),
    [allDayItems, typeFilter],
  );

  const effectiveStatusMap = useMemo(
    () => resolveEffectiveStatuses(dayItems, selectedDay?.date),
    [dayItems, selectedDay?.date],
  );

  const activeEditingItem = draftNewStop
    ? draftNewStop
    : editingStopId
      ? trip.itinerary.find((i) => i.id === editingStopId) ?? null
      : null;

  /**
   * 60fps rAF Arc Geometry Sync:
   * Reads the fixed sticky 520px dotted rail's live viewport position and places
   * every TrailDot center at exact `(getArcX(u), y)` directly ON the dotted path,
   * while sliding each card horizontally with an exact fixed gap from its dot.
   */
  const syncArcPositions = useCallback(() => {
    const stickyEl = arcStickyRef.current;
    if (!stickyEl) return;
    const stickyRect = stickyEl.getBoundingClientRect();
    const halfH = ARC_HEIGHT / 2;
    const railCenterY = stickyRect.top + halfH;

    for (const stop of dayItems) {
      const rowEl = rowRefs.current.get(stop.id);
      const dotEl = dotRefs.current.get(stop.id);
      const cardEl = cardRefs.current.get(stop.id);
      if (!rowEl || !dotEl || !cardEl) continue;

      const rowRect = rowEl.getBoundingClientRect();
      const dotCenterY = rowRect.top + DOT_TOP_OFFSET + DOT_HALF_SIZE;
      const u = (dotCenterY - railCenterY) / halfH;
      const exactX = getArcX(u);
      const curveNorm = (exactX - ARC_BASE_X) / ARC_BULGE; // 0 at edges -> 1 at arc apex

      dotEl.style.transform = `translate3d(${(exactX - DOT_HALF_SIZE).toFixed(2)}px, 0, 0)`;

      const cardShiftX = exactX - ARC_MAX_X; // 0 at apex -> -28px at top/bottom edges
      const cardScale = 0.965 + curveNorm * 0.035;
      cardEl.style.transform = `translate3d(${cardShiftX.toFixed(2)}px, 0, 0) scale(${cardScale.toFixed(4)})`;
    }
  }, [dayItems]);

  useEffect(() => {
    if (viewMode !== 'trail' || activeEditingItem || dayItems.length === 0) return;

    let rafId = 0;
    const scheduleSync = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        syncArcPositions();
      });
    };

    // Initial alignment right after DOM paint
    syncArcPositions();
    const initRaf = window.requestAnimationFrame(syncArcPositions);

    window.addEventListener('scroll', scheduleSync, { passive: true });
    window.addEventListener('resize', scheduleSync, { passive: true });

    return () => {
      window.cancelAnimationFrame(initRaf);
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', scheduleSync);
      window.removeEventListener('resize', scheduleSync);
    };
  }, [viewMode, activeEditingItem, dayItems, syncArcPositions]);

  const handleAddDay = () => {
    if (!canEdit) {
      onRequestUnlockPin();
      return;
    }
    const datedDays = trip.days.filter((d) => !d.isIdeas && d.date);
    const last = datedDays[datedDays.length - 1];
    const nextDateObj = last ? new Date(`${last.date}T00:00:00`) : new Date();
    nextDateObj.setDate(nextDateObj.getDate() + 1);
    const iso = `${nextDateObj.getFullYear()}-${String(nextDateObj.getMonth() + 1).padStart(2, '0')}-${String(nextDateObj.getDate()).padStart(2, '0')}`;
    const newDay: TripDay = {
      id: `day-${Date.now().toString(36)}`,
      date: iso,
      dayLabel: WEEKDAYS[nextDateObj.getDay()],
      dateNum: String(nextDateObj.getDate()),
      city: last?.city || 'Trip',
    };

    onUpdateTrip((prev) => {
      const ideasIdx = prev.days.findIndex((d) => d.isIdeas);
      const nextDays = [...prev.days];
      if (ideasIdx >= 0) nextDays.splice(ideasIdx, 0, newDay);
      else nextDays.push(newDay);
      return { ...prev, days: nextDays, endDate: iso };
    }, `Added ${newDay.dayLabel} ${newDay.dateNum}`);
    setSelectedDayId(newDay.id);
  };

  const handleAddNewStop = () => {
    if (!canEdit) {
      onRequestUnlockPin();
      return;
    }
    const fresh: PlanItem = {
      id: `it-${Date.now().toString(36)}`,
      dayId: selectedDay?.id ?? trip.days[0]?.id ?? 'day-1',
      type: 'place',
      title: '',
      startTime: '09:00',
      locationHint: '',
      address: '',
      status: selectedDay?.isIdeas ? 'idea' : 'upcoming',
      notes: [],
      notesHtml: '',
    };
    setDraftNewStop(fresh);
    setEditingStopId(null);
  };

  const handleToggleStopDone = (stop: PlanItem) => {
    if (!canEdit) return;
    const nextStatus = toggleStopDoneStatus(stop.status);
    onUpdateTrip(
      (prev) => ({
        ...prev,
        itinerary: prev.itinerary.map((i) =>
          i.id === stop.id ? { ...i, status: nextStatus } : i,
        ),
      }),
      nextStatus === 'done' ? `Marked "${stop.title}" done` : `Marked "${stop.title}" upcoming`,
    );
  };

  const handleQuickPersistNotesHtml = (itemId: string, notesHtml: string) => {
    onUpdateTrip((prev) => ({
      ...prev,
      itinerary: prev.itinerary.map((i) => (i.id === itemId ? { ...i, notesHtml } : i)),
    }));
  };

  const handleSaveStop = (updated: PlanItem) => {
    onUpdateTrip((prev) => {
      const exists = prev.itinerary.some((i) => i.id === updated.id);
      return {
        ...prev,
        itinerary: exists
          ? prev.itinerary.map((i) => (i.id === updated.id ? updated : i))
          : [...prev.itinerary, updated],
      };
    }, 'Itinerary stop saved');
    setSelectedDayId(updated.dayId);
    setDraftNewStop(null);
    setEditingStopId(null);
  };

  const handleDeleteStop = (itemId: string) => {
    onUpdateTrip(
      (prev) => ({ ...prev, itinerary: prev.itinerary.filter((i) => i.id !== itemId) }),
      'Stop deleted',
    );
    setDraftNewStop(null);
    setEditingStopId(null);
  };

  const openStopRoute = (stop: PlanItem) => {
    onOpenRoute({
      title: stop.title,
      subtitle: stop.locationHint,
      address: stop.address,
      parkingNote: stop.parkingNote,
      mapsUrl: stop.mapsUrl,
      coords: stop.coords,
      dayLabel: dayLabelStr,
      dayItems: allDayItems,
      focusedItemId: stop.id,
    });
  };

  if (activeEditingItem) {
    return (
      <PlanDetailEditScreen
        key={activeEditingItem.id}
        item={activeEditingItem}
        days={trip.days}
        dayItems={allDayItems}
        isNew={Boolean(draftNewStop)}
        canEdit={canEdit}
        onOpenRoute={onOpenRoute}
        onQuickPersistNotesHtml={handleQuickPersistNotesHtml}
        onSave={handleSaveStop}
        onDelete={handleDeleteStop}
        onBack={() => {
          setDraftNewStop(null);
          setEditingStopId(null);
        }}
      />
    );
  }

  return (
    <div className="plan-root">
      {/* Header: Plan + 2-Option V4 Switcher (Trail | Table) */}
      <header className="plan-header">
        <h1 className="plan-title">Plan</h1>
        <div className="plan-view-switch" role="tablist" aria-label="Plan view mode">
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'trail'}
            className={`plan-view-btn ${viewMode === 'trail' ? 'plan-view-btn--active' : ''}`}
            onClick={() => setViewMode('trail')}
          >
            Trail
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'table'}
            className={`plan-view-btn ${viewMode === 'table' ? 'plan-view-btn--active' : ''}`}
            onClick={() => setViewMode('table')}
          >
            Table
          </button>
        </div>
      </header>

      {/* Vertical Day Strip + Dashed + Day (Editors Only) */}
      <div className="plan-day-strip" role="tablist" aria-label="Trip days">
        {trip.days.map((day) => (
          <DayPill
            key={day.id}
            variant={day.isIdeas ? 'ideas' : 'day'}
            dayLabel={day.dayLabel}
            dateNum={day.dateNum}
            active={selectedDay?.id === day.id}
            onClick={() => setSelectedDayId(day.id)}
          />
        ))}
        {canEdit && <DayPill variant="add" onClick={handleAddDay} />}
      </div>

      {/* Category Filter Pills */}
      <div className="plan-filter-row" role="tablist" aria-label="Stop type filter">
        {(['all', 'transit', 'place', 'activity'] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={`plan-chip tactile ${typeFilter === f ? 'plan-chip--active' : ''}`}
            onClick={() => setTypeFilter(f)}
          >
            {f === 'all' ? 'All' : formatStopType(f)}
          </button>
        ))}
      </div>

      {/* Content: Fixed Dotted Circular Arc Trail (03a) or Clean 3-Column Table (03b) */}
      {dayItems.length === 0 ? (
        <EmptyState
          icon={<CalendarPlus size={22} strokeWidth={1.8} />}
          title={`No stops for ${dayLabelStr}`}
          description={
            canEdit
              ? 'Tap the floating + button to add a place, transit leg, or group activity.'
              : 'No stops planned for this day yet.'
          }
          action={
            canEdit ? (
              <Button variant="matcha" size="sm" onClick={handleAddNewStop}>
                Add First Stop
              </Button>
            ) : undefined
          }
        />
      ) : viewMode === 'trail' ? (
        <div className="trail-list">
          {/* Fixed 520px Sticky Dotted Circular Arc Rail (Identical for 1, 4, or 10 stops) */}
          <div className="trail-arc-layer" aria-hidden="true">
            <div ref={arcStickyRef} className="trail-arc-sticky">
              <svg
                className="trail-arc-svg"
                width={ARC_WIDTH}
                height={ARC_HEIGHT}
                viewBox={`0 0 ${ARC_WIDTH} ${ARC_HEIGHT}`}
              >
                <path
                  d={DOTTED_ARC_PATH}
                  fill="none"
                  stroke="rgba(74, 116, 104, 0.42)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray="1 10"
                />
              </svg>
            </div>
          </div>

          {dayItems.map((stop) => {
            const closedCheck = isClosedOnDate(stop.closedDays, selectedDay?.date);
            const effStatus = effectiveStatusMap.get(stop.id) ?? stop.status;
            const dotStatus =
              effStatus === 'done' ? 'done' : effStatus === 'active' ? 'active' : 'upcoming';
            const typeLabel = formatStopType(stop.type);

            return (
              <div
                key={stop.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(stop.id, el);
                  else rowRefs.current.delete(stop.id);
                }}
                className="trail-item"
              >
                {canEdit ? (
                  <button
                    ref={(el) => {
                      if (el) dotRefs.current.set(stop.id, el);
                      else dotRefs.current.delete(stop.id);
                    }}
                    type="button"
                    className="trail-item__dot trail-item__dot--btn"
                    aria-label={
                      effStatus === 'done'
                        ? `Mark ${stop.title} upcoming`
                        : `Mark ${stop.title} done`
                    }
                    onClick={() => handleToggleStopDone(stop)}
                  >
                    <TrailDot status={dotStatus} />
                  </button>
                ) : (
                  <div
                    ref={(el) => {
                      if (el) dotRefs.current.set(stop.id, el);
                      else dotRefs.current.delete(stop.id);
                    }}
                    className="trail-item__dot"
                  >
                    <TrailDot status={dotStatus} />
                  </div>
                )}

                <div
                  ref={(el) => {
                    if (el) cardRefs.current.set(stop.id, el);
                    else cardRefs.current.delete(stop.id);
                  }}
                  className="trail-item__card-wrap"
                >
                  {effStatus === 'done' ? (
                    <GlassCard
                      variant="clear"
                      padding="sm"
                      interactive
                      className="trail-past-card"
                      onClick={() => setEditingStopId(stop.id)}
                    >
                      <span className="trail-past-title">
                        {stop.startTime} · {stop.title}
                      </span>
                      <Badge tone="mint">Done</Badge>
                    </GlassCard>
                  ) : effStatus === 'active' ? (
                    <GlassCard
                      variant="spotlight"
                      padding="lg"
                      interactive
                      className="spotlight-now"
                      onClick={() => setEditingStopId(stop.id)}
                    >
                      <div className="spotlight-now__top">
                        <span className="spotlight-live-tag">
                          <span className="spotlight-live-dot" aria-hidden="true" />
                          <span>Now · {typeLabel}</span>
                        </span>
                        <span className="spotlight-time">{stop.startTime}</span>
                      </div>
                      <div>
                        <h2 className="spotlight-place">{stop.title}</h2>
                        <p className="spotlight-hint">{stop.locationHint}</p>
                      </div>
                      <div className="spotlight-footer">
                        {closedCheck.closed ? (
                          <Badge tone="coral" icon={<AlertTriangle size={12} strokeWidth={2} />}>
                            Closed {closedCheck.weekdayName?.slice(0, 3)}
                          </Badge>
                        ) : (
                          <span />
                        )}
                        {(stop.type === 'place' || stop.type === 'transit') && (
                          <Button
                            variant="matcha"
                            size="sm"
                            rightIcon={<ArrowUpRight size={14} strokeWidth={2} />}
                            onClick={(e) => {
                              e.stopPropagation();
                              openStopRoute(stop);
                            }}
                          >
                            Route
                          </Button>
                        )}
                      </div>
                    </GlassCard>
                  ) : (
                    <GlassCard
                      variant="clear"
                      padding="md"
                      interactive
                      onClick={() => setEditingStopId(stop.id)}
                    >
                      <div className="trail-upcoming-head">
                        <span className="trail-upcoming-meta">
                          {stop.startTime}
                          {stop.endTime ? `–${stop.endTime}` : ''} · {typeLabel}
                        </span>
                        {closedCheck.closed ? (
                          <Badge tone="coral" icon={<AlertTriangle size={11} strokeWidth={2} />}>
                            Closed
                          </Badge>
                        ) : stop.type === 'place' || stop.type === 'transit' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            rightIcon={<ArrowUpRight size={13} strokeWidth={2} />}
                            onClick={(e) => {
                              e.stopPropagation();
                              openStopRoute(stop);
                            }}
                          >
                            Route
                          </Button>
                        ) : null}
                      </div>
                      <h3 className="trail-upcoming-title">{stop.title}</h3>
                      {stop.locationHint && (
                        <p
                          style={{
                            margin: '3px 0 0',
                            fontSize: 12,
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {stop.locationHint}
                        </p>
                      )}
                      {stop.specialScheduleNote && (
                        <div style={{ marginTop: 6 }}>
                          <Badge tone="amber">{stop.specialScheduleNote}</Badge>
                        </div>
                      )}
                    </GlassCard>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* 03b_Plan_Table — Strictly 3 columns: TIME | AGENDA | EST. + Export .xlsx */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <GlassCard variant="clear" padding="none">
            <div
              className="plan-table-row"
              style={{
                paddingTop: 10,
                paddingBottom: 8,
                borderBottom: '1px solid var(--hairline)',
                cursor: 'default',
              }}
            >
              <span className="gk-field__label">TIME</span>
              <span className="gk-field__label">AGENDA</span>
              <span className="gk-field__label" style={{ textAlign: 'right' }}>
                EST.
              </span>
            </div>
            {dayItems.map((stop) => (
              <button
                key={stop.id}
                type="button"
                className="plan-table-row tactile"
                onClick={() => setEditingStopId(stop.id)}
              >
                <span className="plan-table-time">{stop.startTime}</span>
                <span
                  style={{
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    textDecoration: stop.status === 'done' ? 'line-through' : undefined,
                    opacity: stop.status === 'done' ? 0.65 : 1,
                  }}
                >
                  {stop.title}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    textAlign: 'right',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatEstimate(stop.costEstimate)}
                </span>
              </button>
            ))}
          </GlassCard>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="glass"
              size="sm"
              leftIcon={<FileSpreadsheet size={14} strokeWidth={1.8} />}
              rightIcon={<ArrowUpRight size={13} strokeWidth={2} />}
              onClick={() => exportTripToExcel(trip)}
            >
              Export .xlsx
            </Button>
          </div>
        </div>
      )}

      {/* Floating Glass (+) Button above Dock (Editors Only) */}
      {canEdit && (
        <CornerOrb
          kind="add"
          size="lg"
          ariaLabel="Add itinerary stop"
          className="floating-glass-fab"
          onClick={handleAddNewStop}
        />
      )}
    </div>
  );
}
