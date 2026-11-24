import { Pencil, Plus, User, X } from 'lucide-react';
import { Avatar, Badge, Button, GlassCard } from '../../components/atoms';
import {
  countCarSeated,
  normalizeCarSeats,
  type CarBenchRow,
  type CarFrontSlot,
} from '../../services/crewSwap';
import type { TransportPod, TripMember } from '../../types/trip';

function SteeringWheelIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.2" />
      <path d="M5.2 10.5h4.7" />
      <path d="M14.1 10.5h4.7" />
      <path d="M12 14.2V21" />
    </svg>
  );
}

export interface CarCabinCardProps {
  pod: TransportPod;
  memberById: Map<string, TripMember>;
  canEdit: boolean;
  editingCrew: boolean;
  onTapFrontSeat: (slot: CarFrontSlot) => void;
  onTapBenchRow: (row: CarBenchRow) => void;
  onRemoveFromBench: (row: CarBenchRow, memberId: string) => void;
  onEditCar: () => void;
}

export function CarCabinCard({
  pod,
  memberById,
  canEdit,
  editingCrew,
  onTapFrontSeat,
  onTapBenchRow,
  onRemoveFromBench,
  onEditCar,
}: CarCabinCardProps) {
  const seats = normalizeCarSeats(pod);
  const totalSeated = countCarSeated(seats);

  const frontLeftMember = seats.frontLeft ? memberById.get(seats.frontLeft) : undefined;
  const frontRightMember = seats.frontRight ? memberById.get(seats.frontRight) : undefined;

  const subtitle =
    [pod.vehicleModel, pod.plateNumber, pod.roleNote].filter(Boolean).join(' · ') || pod.meta;

  const renderBench = (row: CarBenchRow, title: string, memberIds: string[]) => {
    const seatedMembers = memberIds
      .map((id) => memberById.get(id))
      .filter((m): m is TripMember => Boolean(m));

    return (
      <div
        className={`car-bench-box ${canEdit ? 'car-bench-box--interactive' : ''}`}
        role={canEdit ? 'button' : undefined}
        tabIndex={canEdit ? 0 : undefined}
        onClick={() => {
          if (canEdit) onTapBenchRow(row);
        }}
        onKeyDown={(e) => {
          if (!canEdit) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onTapBenchRow(row);
          }
        }}
      >
        <div className="car-bench-head">
          <div className="car-bench-title-group">
            <span className="car-bench-title">{title}</span>
            <span className="car-bench-count">{seatedMembers.length} seated</span>
          </div>
          {canEdit && (
            <button
              type="button"
              className="car-bench-add-btn tactile"
              aria-label={`Add riders to ${title}`}
              onClick={(e) => {
                e.stopPropagation();
                onTapBenchRow(row);
              }}
            >
              <Plus size={12.5} strokeWidth={2.4} />
              <span>Add</span>
            </button>
          )}
        </div>

        {seatedMembers.length > 0 ? (
          <div className="car-bench-chips">
            {seatedMembers.map((m) => {
              const isTentative = m.status === 'tentative';
              return (
                <span
                  key={m.id}
                  className="car-rider-chip"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Avatar
                    initials={m.initials}
                    name={m.name}
                    src={m.avatarDataUrl}
                    size="sm"
                    bg={m.avatarBg}
                    color={m.avatarColor}
                    variant={isTentative ? 'tentative' : 'solid'}
                  />
                  <span className="car-rider-chip__name">
                    {isTentative ? `${m.name}?` : m.name}
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      className="car-rider-chip__remove tactile"
                      aria-label={`Remove ${m.name} from ${title}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveFromBench(row, m.id);
                      }}
                    >
                      <X size={11} strokeWidth={2.5} />
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        ) : (
          <div className="car-bench-empty">
            {canEdit ? 'Tap + Add to seat riders (unlimited)' : 'No riders assigned'}
          </div>
        )}
      </div>
    );
  };

  return (
    <GlassCard variant="clear" padding="md" className="car-pod-card">
      {/* Car Header */}
      <div className="car-pod-head">
        <div className="car-pod-meta">
          <div className="car-pod-title-row">
            <h3 className="car-pod-title">{pod.label}</h3>
            <Badge tone="matcha">{totalSeated} seated</Badge>
          </div>
          {subtitle && <div className="car-pod-sub">{subtitle}</div>}
        </div>
        {(editingCrew || canEdit) && (
          <Button
            variant="glass"
            size="sm"
            leftIcon={<Pencil size={12} strokeWidth={2} />}
            onClick={onEditCar}
          >
            Edit
          </Button>
        )}
      </div>

      {/* Top-Down RHD Car Cabin Blueprint */}
      <div className="car-cabin-shell" aria-label={`${pod.label} cabin seating`}>
        {/* Curved Front Windshield Arc */}
        <div className="car-cabin-windshield" aria-hidden="true">
          <svg viewBox="0 0 260 26" preserveAspectRatio="none" className="car-cabin-windshield__svg">
            <path
              d="M 14 22 Q 130 2 246 22"
              fill="none"
              stroke="rgba(74, 116, 104, 0.34)"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            <path
              d="M 38 22 Q 130 9 222 22"
              fill="none"
              stroke="rgba(255, 255, 255, 0.85)"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
          <span className="car-cabin-windshield__tag">Front</span>
        </div>

        {/* Row 1 — Front Row (Left: Co-Pilot · Right: Indonesian RHD Driver) */}
        <div className="car-front-row">
          <button
            type="button"
            disabled={!canEdit}
            className={[
              'car-front-seat',
              frontLeftMember ? 'car-front-seat--occupied' : 'car-front-seat--open',
              canEdit ? 'tactile' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => canEdit && onTapFrontSeat('frontLeft')}
          >
            <div className="car-front-seat__top">
              <span className="car-front-seat__role">
                <User size={12.5} strokeWidth={2} />
                <span>Front Left</span>
              </span>
            </div>
            {frontLeftMember ? (
              <div className="car-front-seat__rider">
                <Avatar
                  initials={frontLeftMember.initials}
                  name={frontLeftMember.name}
                  src={frontLeftMember.avatarDataUrl}
                  size="sm"
                  bg={frontLeftMember.avatarBg}
                  color={frontLeftMember.avatarColor}
                  variant={frontLeftMember.status === 'tentative' ? 'tentative' : 'solid'}
                />
                <span className="car-front-seat__name">
                  {frontLeftMember.status === 'tentative'
                    ? `${frontLeftMember.name}?`
                    : frontLeftMember.name}
                </span>
              </div>
            ) : (
              <div className="car-front-seat__empty">
                {canEdit ? 'Tap to assign' : 'Open'}
              </div>
            )}
          </button>

          <button
            type="button"
            disabled={!canEdit}
            className={[
              'car-front-seat',
              'car-front-seat--driver',
              frontRightMember ? 'car-front-seat--occupied' : 'car-front-seat--open',
              canEdit ? 'tactile' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => canEdit && onTapFrontSeat('frontRight')}
          >
            <div className="car-front-seat__top">
              <span className="car-driver-pill">
                <SteeringWheelIcon size={12.5} />
                <span>Driver</span>
              </span>
            </div>
            {frontRightMember ? (
              <div className="car-front-seat__rider">
                <Avatar
                  initials={frontRightMember.initials}
                  name={frontRightMember.name}
                  src={frontRightMember.avatarDataUrl}
                  size="sm"
                  bg={frontRightMember.avatarBg}
                  color={frontRightMember.avatarColor}
                  variant={frontRightMember.status === 'tentative' ? 'tentative' : 'solid'}
                />
                <span className="car-front-seat__name">
                  {frontRightMember.status === 'tentative'
                    ? `${frontRightMember.name}?`
                    : frontRightMember.name}
                </span>
              </div>
            ) : (
              <div className="car-front-seat__empty">
                {canEdit ? 'Assign driver' : 'Open'}
              </div>
            )}
          </button>
        </div>

        {/* Row 2 — Middle Row (Full-Width Bench, Unlimited) */}
        {renderBench('middle', 'Middle Row', seats.middle)}

        {/* Row 3 — Back Row (Full-Width Bench, Unlimited) */}
        {renderBench('back', 'Back Row', seats.back)}
      </div>
    </GlassCard>
  );
}
