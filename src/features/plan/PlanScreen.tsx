import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowUpRight, CalendarPlus } from 'lucide-react';
import {
  Badge,
  Button,
  CornerOrb,
  DayPill,
  EmptyState,
  GlassCard,
  TrailDot,
} from '../../components/atoms';
import type { PlanItem, PlanItemType, SharedTrip, TripDay } from '../../types/trip';
import { PlanDetailEditScreen } from './PlanDetailEditScreen';
import { RouteMapView } from './RouteMapView';
import './plan.css';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface PlanScreenProps {
  trip: SharedTrip;
  canEdit: boolean;
  onRequestUnlockPin: () => void;
  onUpdateTrip: (updater: (prev: SharedTrip) => SharedTrip, toastMsg?: string) => void;
}

export function PlanScreen({
  trip,
  canEdit,
  onRequestUnlockPin,
  onUpdateTrip,
}: PlanScreenProps) {
  const [viewMode, setViewMode] = useState<'trail' | 'table' | 'map'>('trail');
  const [selectedDayId, setSelectedDayId] = useState<string>(
    trip.days.find((d) => d.id === 'day-3')?.id ?? trip.days[0]?.id ?? 'day-1',
  );
  const [typeFilter, setTypeFilter] = useState<'all' | PlanItemType>('all');
  const [editingStop, setEditingStop] = useState<{ item: PlanItem; isNew: boolean } | null>(null);

  const selectedDay = trip.days.find((d) => d.id === selectedDayId) ?? trip.days[0];
  const dayOfWeek = selectedDay?.date ? new Date(`${selectedDay.date}T00:00:00`).getDay() : -1;

  const dayItems = useMemo(() => {
    return trip.itinerary
      .filter((item) => item.dayId === selectedDay?.id)
      .filter((item) => typeFilter === 'all' || item.type === typeFilter)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [trip.itinerary, selectedDay?.id, typeFilter]);

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
    setEditingStop({ item: fresh, isNew: true });
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
    setEditingStop(null);
  };

  const handleDeleteStop = (itemId: string) => {
    onUpdateTrip(
      (prev) => ({ ...prev, itinerary: prev.itinerary.filter((i) => i.id !== itemId) }),
      'Stop deleted',
    );
    setEditingStop(null);
  };

  if (editingStop) {
    return (
      <PlanDetailEditScreen
        item={editingStop.item}
        days={trip.days}
        isNew={editingStop.isNew}
        canEdit={canEdit}
        onRequestUnlockPin={onRequestUnlockPin}
        onSave={handleSaveStop}
        onDelete={handleDeleteStop}
        onBack={() => setEditingStop(null)}
      />
    );
  }

  return (
    <div className="plan-root">
      {/* Header: Plan + Trail | Table | Map Switcher */}
      <header className="plan-header">
        <h1 className="plan-title">Plan</h1>
        <div className="plan-view-switch" role="tablist" aria-label="Plan view mode">
          {(['trail', 'table', 'map'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={viewMode === m}
              className={`plan-view-btn ${viewMode === m ? 'plan-view-btn--active' : ''}`}
              onClick={() => setViewMode(m)}
            >
              {m === 'trail' ? 'Trail' : m === 'table' ? 'Table' : 'Route'}
            </button>
          ))}
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

      {/* View Content */}
      {viewMode === 'map' ? (
        <RouteMapView
          dayLabel={selectedDay?.isIdeas ? 'Ideas' : `${selectedDay?.dayLabel} ${selectedDay?.dateNum}`}
          items={dayItems}
          onSelectItem={(item) => setEditingStop({ item, isNew: false })}
        />
      ) : dayItems.length === 0 ? (
        <EmptyState
          icon={<CalendarPlus size={22} strokeWidth={1.8} />}
          title={`No stops for ${selectedDay?.isIdeas ? 'Ideas' : `${selectedDay?.dayLabel} ${selectedDay?.dateNum}`}`}
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
            const isClosedConflict =
              dayOfWeek >= 0 &&
              Array.isArray(stop.closedDays) &&
              stop.closedDays.includes(dayOfWeek);

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
                    onClick={() => setEditingStop({ item: stop, isNew: false })}
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
                    onClick={() => setEditingStop({ item: stop, isNew: false })}
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
                      {isClosedConflict ? (
                        <Badge tone="coral" icon={<AlertTriangle size={12} strokeWidth={2} />}>
                          Closed today
                        </Badge>
                      ) : (
                        <Badge tone="matcha">{stop.parkingNote ? 'Parking info' : stop.type}</Badge>
                      )}
                      {stop.mapsUrl && (
                        <Button
                          variant="matcha"
                          size="sm"
                          rightIcon={<ArrowUpRight size={14} strokeWidth={2} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(stop.mapsUrl, '_blank', 'noopener,noreferrer');
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
                    onClick={() => setEditingStop({ item: stop, isNew: false })}
                  >
                    <div className="trail-upcoming-head">
                      <span className="trail-upcoming-meta">
                        {stop.startTime}
                        {stop.endTime ? `–${stop.endTime}` : ''} · {stop.type}
                      </span>
                      {isClosedConflict && (
                        <Badge tone="coral" icon={<AlertTriangle size={11} strokeWidth={2} />}>
                          Closed
                        </Badge>
                      )}
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
        <GlassCard variant="clear" padding="none">
          {dayItems.map((stop) => (
            <button
              key={stop.id}
              type="button"
              className="plan-table-row tactile"
              onClick={() => setEditingStop({ item: stop, isNew: false })}
            >
              <span className="plan-table-time">{stop.startTime}</span>
              <span style={{ minWidth: 0 }}>
                <div
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
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: 'var(--text-secondary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {stop.locationHint}
                </div>
              </span>
              <Badge tone={stop.status === 'active' ? 'mint' : 'neutral'}>{stop.type}</Badge>
            </button>
          ))}
        </GlassCard>
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
