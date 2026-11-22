import { ArrowDown, ArrowUp, Pencil, Trash2 } from 'lucide-react';
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
    carNumber: pod.label.includes('Car') ? pod.label.split('·').pop()?.trim() || 'Car 1' : 'Car 1',
    startRow,
    endRow,
    facingRows: true,
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
      {/* Train Car Header */}
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
              {pod.label}
            </span>
            <Badge tone="matcha">{layout.carNumber}</Badge>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>
            Layout {layout.format} · Rows {layout.startRow}–{layout.endRow}
            {layout.facingRows ? ' · Facing rows' : ''}
          </div>
        </div>

        {editingCrew && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Button
              variant="glass"
              size="sm"
              leftIcon={<Pencil size={12} strokeWidth={2} />}
              onClick={onEditLayout}
            >
              Layout
            </Button>
            <Button variant="danger" size="sm" onClick={onDeletePod}>
              <Trash2 size={13} strokeWidth={2} />
            </Button>
          </div>
        )}
      </div>

      {/* Column Headers with Window / Aisle Labels */}
      <div className={`kai-grid kai-grid--${layout.format} kai-col-headers`}>
        <span className="kai-window-tag">Window</span>
        {leftCols.slice(1).map((c) => (
          <span key={`lh-${c}`} className="kai-col-tag">
            {c}
          </span>
        ))}
        <span className="kai-aisle-head">Aisle</span>
        {rightCols.slice(0, -1).map((c) => (
          <span key={`rh-${c}`} className="kai-col-tag">
            {c}
          </span>
        ))}
        <span className="kai-window-tag">Window</span>
      </div>

      {/* Seat Rows */}
      <div className="kai-rows">
        {rows.map((rowNum, rowIndex) => {
          const isFacingDown = layout.facingRows && rowIndex % 2 === 0;
          const showFacingPairDivider =
            layout.facingRows && rowIndex % 2 === 0 && rowIndex < rows.length - 1;

          return (
            <div key={rowNum} className="kai-row-group">
              <div className={`kai-grid kai-grid--${layout.format}`}>
                {leftCols.map((col) => renderSeat(rowNum, col))}

                <div className="kai-aisle-cell" aria-label={`Row ${rowNum}`}>
                  <span className="kai-aisle-num">{rowNum}</span>
                  {layout.facingRows && (
                    <span className="kai-facing-arrow" aria-hidden="true">
                      {isFacingDown ? (
                        <ArrowDown size={11} strokeWidth={2.2} />
                      ) : (
                        <ArrowUp size={11} strokeWidth={2.2} />
                      )}
                    </span>
                  )}
                </div>

                {rightCols.map((col) => renderSeat(rowNum, col))}
              </div>

              {showFacingPairDivider && (
                <div className="kai-facing-strip" aria-hidden="true">
                  <span>Facing seats</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}
