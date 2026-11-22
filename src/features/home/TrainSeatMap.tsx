import { Pencil, Trash2 } from 'lucide-react';
import { Avatar, Badge, Button, GlassCard } from '../../components/atoms';
import type { TrainCarLayout, TransportPod, TransportSlot, TripMember } from '../../types/trip';
import './home.css';

export function buildTrainSlotsForLayout(
  layout: TrainCarLayout,
  existingSlots: TransportSlot[] = [],
): TransportSlot[] {
  const existingByRole = new Map(existingSlots.map((s) => [s.role.toUpperCase(), s]));
  const cols = layout.format === '3-2' ? ['A', 'B', 'C', 'D', 'E'] : ['A', 'B', 'C', 'D'];
  const start = Math.max(1, Math.min(30, layout.startRow));
  const end = Math.max(start, Math.min(start + 12, layout.endRow));
  const result: TransportSlot[] = [];

  for (let row = start; row <= end; row += 1) {
    for (const col of cols) {
      const code = `${row}${col}`;
      const prev = existingByRole.get(code);
      result.push({
        role: code,
        memberId: prev?.memberId ?? null,
        lockedPassenger: prev?.lockedPassenger,
      });
    }
  }
  return result;
}

/**
 * Pure Smart Assign / Auto-Swap helper for KAI Train Seats.
 * Guarantees no crew member ever occupies 2 seats simultaneously:
 * - Assigning `memberId` who already sits in `existingIdx` swaps `existingIdx`
 *   with `targetSlotIndex` (2-way swap if target was occupied, clean move if empty).
 * - Passing `null` clears `targetSlotIndex`.
 */
export function assignOrSwapTrainSeat(
  slots: TransportSlot[],
  targetSlotIndex: number,
  memberId: string | null,
): TransportSlot[] {
  if (targetSlotIndex < 0 || targetSlotIndex >= slots.length) return slots;
  const next = slots.map((s) => ({ ...s }));

  if (!memberId) {
    next[targetSlotIndex].memberId = null;
    return next;
  }

  const existingIdx = next.findIndex((s) => s.memberId === memberId);
  if (existingIdx === targetSlotIndex) return next;

  const previousOccupant = next[targetSlotIndex].memberId;
  next[targetSlotIndex].memberId = memberId;

  if (existingIdx >= 0) {
    next[existingIdx].memberId = previousOccupant;
  }

  return next;
}

function inferLayout(pod: TransportPod): TrainCarLayout {
  if (pod.trainLayout) return pod.trainLayout;
  const rowNums = pod.slots
    .map((s) => Number(s.role.match(/^(\d+)/)?.[1] ?? NaN))
    .filter((n) => !Number.isNaN(n));
  const hasE = pod.slots.some((s) => s.role.toUpperCase().endsWith('E'));
  const startRow = rowNums.length > 0 ? Math.min(...rowNums) : 10;
  const endRow = rowNums.length > 0 ? Math.max(...rowNums) : startRow + 2;
  return {
    format: hasE ? '3-2' : '2-2',
    carNumber: 'Coach 1',
    startRow,
    endRow,
    facingRows: false,
  };
}

export interface TrainSeatMapProps {
  pod: TransportPod;
  memberById: Map<string, TripMember>;
  editingCrew: boolean;
  onTapSeat: (slotIndex: number, seatCode: string) => void;
  onEditLayout: () => void;
  onDeletePod: () => void;
}

export function TrainSeatMap({
  pod,
  memberById,
  editingCrew,
  onTapSeat,
  onEditLayout,
  onDeletePod,
}: TrainSeatMapProps) {
  const layout = inferLayout(pod);
  const leftCols = layout.format === '3-2' ? ['A', 'B', 'C'] : ['A', 'B'];
  const rightCols = layout.format === '3-2' ? ['D', 'E'] : ['C', 'D'];
  const rows: number[] = [];
  for (let r = layout.startRow; r <= layout.endRow; r += 1) {
    rows.push(r);
  }

  // Strip duplicate coach/car suffix from title if user typed it
  const cleanTitle = pod.label.replace(/\s*·\s*(Car|Coach)\s*\w+$/i, '').trim() || pod.label;

  const slotIndexByCode = new Map<string, number>();
  pod.slots.forEach((slot, idx) => {
    slotIndexByCode.set(slot.role.toUpperCase(), idx);
  });

  const renderSeat = (rowNum: number, col: string) => {
    const code = `${rowNum}${col}`;
    const idx = slotIndexByCode.get(code);
    const slot = idx !== undefined ? pod.slots[idx] : undefined;
    const member = slot?.memberId ? memberById.get(slot.memberId) : undefined;
    const isTentative = member?.status === 'tentative';

    return (
      <button
        key={code}
        type="button"
        className={[
          'kai-seat',
          member ? 'kai-seat--occupied' : 'kai-seat--open',
          editingCrew ? 'kai-seat--editable tactile' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => {
          if (!editingCrew || idx === undefined) return;
          onTapSeat(idx, code);
        }}
        aria-label={`Seat ${code}${member ? `, ${member.name}` : ', Open'}`}
      >
        <span className="kai-seat__code">{code}</span>
        {member ? (
          <>
            <Avatar
              initials={member.initials}
              name={member.name}
              src={member.avatarDataUrl}
              size="sm"
              bg={member.avatarBg}
              color={member.avatarColor}
              variant={isTentative ? 'tentative' : 'solid'}
            />
            <span className="kai-seat__name">
              {isTentative ? `${member.name}?` : member.name}
            </span>
          </>
        ) : (
          <span className="kai-seat__empty">{editingCrew ? '+' : 'Open'}</span>
        )}
      </button>
    );
  };

  return (
    <GlassCard variant="clear" padding="md" className="kai-car-card">
      {/* Train Car Header — single clean Coach badge, zero duplication */}
      <div className="kai-car-head">
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 17,
                fontWeight: 600,
              }}
            >
              {cleanTitle}
            </span>
            <Badge tone="matcha">{layout.carNumber}</Badge>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>
            Layout {layout.format} · Rows {layout.startRow}–{layout.endRow}
          </div>
        </div>

        {editingCrew && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Button variant="danger" size="sm" onClick={onDeletePod} aria-label="Remove train car">
              <Trash2 size={13} strokeWidth={2} />
            </Button>
            <Button
              variant="glass"
              size="sm"
              leftIcon={<Pencil size={12} strokeWidth={2} />}
              onClick={onEditLayout}
            >
              Layout
            </Button>
          </div>
        )}
      </div>

      {/* Clean Column Headers: A B C | Aisle | D E (zero WINDOW labels) */}
      <div className={`kai-grid kai-grid--${layout.format} kai-col-headers`}>
        {leftCols.map((c) => (
          <span key={`lh-${c}`} className="kai-col-tag">
            {c}
          </span>
        ))}
        <span className="kai-aisle-head">Aisle</span>
        {rightCols.map((c) => (
          <span key={`rh-${c}`} className="kai-col-tag">
            {c}
          </span>
        ))}
      </div>

      {/* Clean KAI Seat Rows (zero facing arrows or facing text) */}
      <div className="kai-rows">
        {rows.map((rowNum) => (
          <div key={rowNum} className={`kai-grid kai-grid--${layout.format}`}>
            {leftCols.map((col) => renderSeat(rowNum, col))}

            <div className="kai-aisle-cell" aria-label={`Row ${rowNum}`}>
              <span className="kai-aisle-num">{rowNum}</span>
            </div>

            {rightCols.map((col) => renderSeat(rowNum, col))}
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
