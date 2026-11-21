import { useMemo, useState } from 'react';
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
import { isClosedOnDate } from '../../services/planUtils';
import type {
  PlanItem,
  PlanItemType,
  RichNoteBlock,
  RouteTarget,
  SharedTrip,
  TripDay,
} from '../../types/trip';
import { PlanDetailEditScreen } from './PlanDetailEditScreen';
import './plan.css';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatEstimate(cost?: number): string {
  if (cost === undefined) return '—';
  if (cost === 0) return 'Free';
  return formatCompactIDR(cost);
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

  const activeEditingItem = draftNewStop
    ? draftNewStop
    : editingStopId
      ? trip.itinerary.find((i) => i.id === editingStopId) ?? null
      : null;

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
    };
    setDraftNewStop(fresh);
    setEditingStopId(null);
  };

  const handleQuickPersistNotes = (itemId: string, notes: RichNoteBlock[]) => {
    onUpdateTrip((prev) => ({
      ...prev,
      itinerary: prev.itinerary.map((i) => (i.id === itemId ? { ...i, notes } : i)),
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
        onRequestUnlockPin={onRequestUnlockPin}
        onOpenRoute={onOpenRoute}
        onQuickPersistNotes={handleQuickPersistNotes}
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

      {/* Vertical Day Strip + Dashed + Day */}
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
        <DayPill variant="add" onClick={handleAddDay} />
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
            {f === 'all' ? 'All' : f === 'transit' ? 'Transit' : f === 'place' ? 'Place' : 'Activity'}
          </button>
        ))}
      </div>

      {/* Content: Trail (03a) or Clean 3-Column Table (03b) */}
      {dayItems.length === 0 ? (
        <EmptyState
          icon={<CalendarPlus size={22} strokeWidth={1.8} />}
          title={`No stops for ${dayLabelStr}`}
          description="Tap the floating + button to add a place, transit leg, or group activity."
          action={
            <Button variant="matcha" size="sm" onClick={handleAddNewStop}>
              Add First Stop
            </Button>
          }
        />
      ) : viewMode === 'trail' ? (
        <div className="trail-list">
          <div className="trail-rail" aria-hidden="true" />
          {dayItems.map((stop) => {
            const closedCheck = isClosedOnDate(stop.closedDays, selectedDay?.date);

            return (
              <div key={stop.id} className="trail-item">
                <div className="trail-item__dot">
                  <TrailDot
                    status={
                      stop.status === 'done'
                        ? 'done'
                        : stop.status === 'active'
                          ? 'active'
                          : 'upcoming'
                    }
                  />
                </div>

                {stop.status === 'done' ? (
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
                ) : stop.status === 'active' ? (
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
                        <span>Now · {stop.type}</span>
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
                        <Badge tone="matcha">{stop.type}</Badge>
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
                        {stop.endTime ? `–${stop.endTime}` : ''} · {stop.type}
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
                      <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
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

      {/* Floating Glass (+) Button above Dock */}
      <CornerOrb
        kind="add"
        size="lg"
        ariaLabel="Add itinerary stop"
        className="floating-glass-fab"
        onClick={handleAddNewStop}
      />
    </div>
  );
}
