import { useState, type FormEvent } from 'react';
import { BedDouble, Bike, Check, Plus, Trash2, UserPlus } from 'lucide-react';
import { Avatar, Badge, Button, ConfirmDialog, CornerOrb, Input } from '../../components/atoms';
import type {
  MemberRole,
  MemberStatus,
  StayLodging,
  StayRoom,
  TrainPassInfo,
  TransportMode,
  TransportPod,
  TripMember,
} from '../../types/trip';
import '../../components/organisms/sheets.css';

const SWATCHES = [
  { bg: '#E3EDE6', color: '#2D4A42' },
  { bg: '#E9DFD3', color: '#6C4E31' },
  { bg: '#F2DEE2', color: '#8B3646' },
  { bg: '#F4EAD5', color: '#8C5D18' },
  { bg: '#E2E8F2', color: '#354F73' },
  { bg: '#DCECE7', color: '#226451' },
  { bg: '#EDE4F2', color: '#5D3E78' },
  { bg: '#E8EFE2', color: '#3E6230' },
];

/* ==========================================================================
   1. Train Pass Editor Sheet
   ========================================================================== */

export interface TrainPassEditorSheetProps {
  open: boolean;
  initial?: TrainPassInfo;
  onSave: (info: TrainPassInfo) => void;
  onClose: () => void;
}

export function TrainPassEditorSheet({
  open,
  initial,
  onSave,
  onClose,
}: TrainPassEditorSheetProps) {
  const [trainName, setTrainName] = useState(initial?.trainName ?? 'KA Bengawan (Economy)');
  const [outboundCode, setOutboundCode] = useState(initial?.outboundCode ?? 'KA 246');
  const [outboundRoute, setOutboundRoute] = useState(initial?.outboundRoute ?? 'PSE → PWS');
  const [outboundDate, setOutboundDate] = useState(initial?.outboundDate ?? '');
  const [outboundTime, setOutboundTime] = useState(initial?.outboundTime ?? '09:14 – 18:20 WIB');
  const [returnRoute, setReturnRoute] = useState(initial?.returnRoute ?? 'LPN → PSE');
  const [returnDate, setReturnDate] = useState(initial?.returnDate ?? '');
  const [returnTime, setReturnTime] = useState(initial?.returnTime ?? '00:26 – 08:20 WIB');

  if (!open) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSave({
      trainName: trainName.trim() || 'Train Pass',
      outboundCode: outboundCode.trim(),
      outboundRoute: outboundRoute.trim() || 'Origin → Dest',
      outboundDate: outboundDate.trim(),
      outboundTime: outboundTime.trim(),
      returnRoute: returnRoute.trim(),
      returnDate: returnDate.trim(),
      returnTime: returnTime.trim(),
    });
    onClose();
  };

  return (
    <div className="gk-sheet-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="gk-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="gk-sheet__handle" />
        <div className="gk-sheet__head">
          <div>
            <h3 className="gk-sheet__title">Edit Train Pass</h3>
            <p className="gk-sheet__sub">Boarding details for the crew</p>
          </div>
          <CornerOrb kind="close" ariaLabel="Close train editor" onClick={onClose} />
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="create-two-col">
            <Input
              id="tp-name"
              label="Train / Transit"
              value={trainName}
              onChange={(e) => setTrainName(e.target.value)}
            />
            <Input
              id="tp-code"
              label="Code"
              placeholder="KA 246"
              value={outboundCode}
              onChange={(e) => setOutboundCode(e.target.value)}
            />
          </div>

          <div className="create-two-col">
            <Input
              id="tp-out-route"
              label="Outbound Route"
              placeholder="PSE → PWS"
              value={outboundRoute}
              onChange={(e) => setOutboundRoute(e.target.value)}
            />
            <Input
              id="tp-out-time"
              label="Outbound Time"
              placeholder="09:14 – 18:20"
              value={outboundTime}
              onChange={(e) => setOutboundTime(e.target.value)}
            />
          </div>
          <Input
            id="tp-out-date"
            label="Outbound Date"
            placeholder="Thu, Feb 11, 2027"
            value={outboundDate}
            onChange={(e) => setOutboundDate(e.target.value)}
          />

          <div className="create-two-col">
            <Input
              id="tp-ret-route"
              label="Return Route"
              placeholder="LPN → PSE"
              value={returnRoute}
              onChange={(e) => setReturnRoute(e.target.value)}
            />
            <Input
              id="tp-ret-time"
              label="Return Time"
              placeholder="00:26 – 08:20"
              value={returnTime}
              onChange={(e) => setReturnTime(e.target.value)}
            />
          </div>
          <Input
            id="tp-ret-date"
            label="Return Date"
            placeholder="Mon, Feb 15, 2027"
            value={returnDate}
            onChange={(e) => setReturnDate(e.target.value)}
          />

          <Button type="submit" variant="matcha" size="lg" fullWidth>
            Save Train Pass
          </Button>
        </form>
      </div>
    </div>
  );
}

/* ==========================================================================
   2. Crew Members Manager Sheet (Add / Edit / Remove)
   ========================================================================== */

export interface CrewMembersSheetProps {
  open: boolean;
  members: TripMember[];
  onSaveMember: (member: TripMember, isNew: boolean) => void;
  onDeleteMember: (memberId: string) => void;
  onClose: () => void;
}

export function CrewMembersSheet({
  open,
  members,
  onSaveMember,
  onDeleteMember,
  onClose,
}: CrewMembersSheetProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState<MemberRole>('driver');
  const [status, setStatus] = useState<MemberStatus>('confirmed');
  const [swatchIdx, setSwatchIdx] = useState(0);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (!open) return null;

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setRole('driver');
    setStatus('confirmed');
    setSwatchIdx(members.length % SWATCHES.length);
  };

  const startEdit = (m: TripMember) => {
    setEditingId(m.id);
    setName(m.name);
    setRole(m.role);
    setStatus(m.status);
    const idx = SWATCHES.findIndex((s) => s.bg === m.avatarBg);
    setSwatchIdx(idx >= 0 ? idx : 0);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const sw = SWATCHES[swatchIdx] ?? SWATCHES[0];
    const existing = editingId ? members.find((m) => m.id === editingId) : undefined;
    const member: TripMember = {
      id: existing?.id ?? `m-${Date.now().toString(36)}`,
      name: trimmed,
      initials: trimmed.slice(0, 1).toUpperCase(),
      avatarBg: sw.bg,
      avatarColor: sw.color,
      role,
      status,
      isCreator: existing?.isCreator,
    };
    onSaveMember(member, !existing);
    resetForm();
  };

  const deleteTarget = confirmDeleteId ? members.find((m) => m.id === confirmDeleteId) : undefined;

  return (
    <div className="gk-sheet-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="gk-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="gk-sheet__handle" />
        <div className="gk-sheet__head">
          <div>
            <h3 className="gk-sheet__title">Manage Crew ({members.length})</h3>
            <p className="gk-sheet__sub">Add, edit, or mark riders as tentative</p>
          </div>
          <CornerOrb kind="close" ariaLabel="Close crew manager" onClick={onClose} />
        </div>

        {/* Add / Edit Member Form */}
        <form
          onSubmit={handleSubmit}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            padding: 14,
            borderRadius: 22,
            background: 'rgba(227, 237, 230, 0.45)',
            marginBottom: 14,
          }}
        >
          <Input
            id="crew-name-input"
            label={editingId ? 'Edit Member Name' : 'New Member Name'}
            placeholder="e.g. Bima"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`mode-chip ${role === 'driver' ? 'mode-chip--active' : ''}`}
              onClick={() => setRole('driver')}
            >
              Driver
            </button>
            <button
              type="button"
              className={`mode-chip ${role === 'passenger' ? 'mode-chip--active' : ''}`}
              onClick={() => setRole('passenger')}
            >
              Passenger
            </button>
            <button
              type="button"
              className={`mode-chip ${status === 'confirmed' ? 'mode-chip--active' : ''}`}
              onClick={() => setStatus('confirmed')}
            >
              Confirmed
            </button>
            <button
              type="button"
              className={`mode-chip ${status === 'tentative' ? 'mode-chip--active' : ''}`}
              onClick={() => setStatus('tentative')}
            >
              Tentative?
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {SWATCHES.map((s, idx) => (
              <button
                key={s.bg}
                type="button"
                aria-label={`Avatar color ${idx + 1}`}
                onClick={() => setSwatchIdx(idx)}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: s.bg,
                  border:
                    swatchIdx === idx
                      ? '2.5px solid var(--brand-matcha)'
                      : '1.5px solid #FFFFFF',
                }}
              />
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              type="submit"
              variant="matcha"
              size="md"
              fullWidth
              leftIcon={editingId ? <Check size={15} strokeWidth={2} /> : <UserPlus size={15} strokeWidth={2} />}
            >
              {editingId ? 'Update Member' : 'Add Member'}
            </Button>
            {editingId && (
              <Button variant="glass" size="md" onClick={resetForm}>
                Cancel
              </Button>
            )}
          </div>
        </form>

        {/* Existing Crew List */}
        <div className="gk-menu-list">
          {members.map((m) => (
            <div
              key={m.id}
              className="gk-menu-item"
              style={{ cursor: 'default' }}
            >
              <button
                type="button"
                className="gk-menu-item__left"
                style={{ flex: 1, textAlign: 'left' }}
                onClick={() => startEdit(m)}
              >
                <Avatar
                  initials={m.initials}
                  size="sm"
                  bg={m.avatarBg}
                  color={m.avatarColor}
                  variant={
                    m.status === 'tentative'
                      ? 'tentative'
                      : m.role === 'passenger'
                        ? 'passenger'
                        : 'solid'
                  }
                />
                <span>
                  <div className="gk-menu-item__title">
                    {m.status === 'tentative' ? `${m.name}?` : m.name}
                  </div>
                  <div className="gk-menu-item__sub">
                    {m.role === 'passenger' ? 'Passenger' : 'Driver'} ·{' '}
                    {m.status === 'tentative' ? 'Tentative' : 'Confirmed'}
                  </div>
                </span>
              </button>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Badge tone="neutral" onClick={() => startEdit(m)} style={{ cursor: 'pointer' }}>
                  Edit
                </Badge>
                {members.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Remove ${m.name}`}
                    onClick={() => setConfirmDeleteId(m.id)}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 15,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--accent-coral)',
                      background: 'var(--accent-coral-soft)',
                    }}
                  >
                    <Trash2 size={14} strokeWidth={2} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <ConfirmDialog
          open={Boolean(deleteTarget)}
          title={`Remove ${deleteTarget?.name ?? 'member'}?`}
          description="They will be unassigned from bikes, train seats, and hotel rooms. Existing deposit history stays preserved."
          confirmLabel="Remove"
          destructive
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={() => {
            if (confirmDeleteId) onDeleteMember(confirmDeleteId);
            setConfirmDeleteId(null);
            if (editingId === confirmDeleteId) resetForm();
          }}
        />
      </div>
    </div>
  );
}

/* ==========================================================================
   3. Add Transport Pod Sheet (Bike / Train / Car)
   ========================================================================== */

export interface AddPodSheetProps {
  open: boolean;
  defaultMode: TransportMode;
  existingCount: number;
  onAdd: (pod: TransportPod) => void;
  onClose: () => void;
}

export function AddPodSheet({
  open,
  defaultMode,
  existingCount,
  onAdd,
  onClose,
}: AddPodSheetProps) {
  const [mode, setMode] = useState<TransportMode>(defaultMode);
  const [label, setLabel] = useState('');
  const [meta, setMeta] = useState('');
  const [seatCount, setSeatCount] = useState('2');

  if (!open) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const count = Math.max(1, Math.min(12, Number(seatCount) || 2));
    const slots =
      mode === 'bike'
        ? [
            { role: 'Driver', memberId: null },
            { role: 'Rider', memberId: null },
          ]
        : Array.from({ length: count }, (_, idx) => ({
            role: mode === 'train' ? `Seat ${idx + 1}` : idx === 0 ? 'Driver' : `Seat ${idx + 1}`,
            memberId: null,
          }));

    onAdd({
      id: `pod-${mode}-${Date.now().toString(36)}`,
      mode,
      label:
        label.trim() ||
        (mode === 'bike'
          ? `Bike ${existingCount + 1}`
          : mode === 'train'
            ? `Train Car ${existingCount + 1}`
            : `Car ${existingCount + 1}`),
      meta: meta.trim() || undefined,
      slots,
    });
    setLabel('');
    setMeta('');
    onClose();
  };

  return (
    <div className="gk-sheet-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="gk-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="gk-sheet__handle" />
        <div className="gk-sheet__head">
          <div>
            <h3 className="gk-sheet__title">Add Transport Pod</h3>
            <p className="gk-sheet__sub">Add a motorbike, train car, or rental car</p>
          </div>
          <CornerOrb kind="close" ariaLabel="Close add pod" onClick={onClose} />
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['bike', 'train', 'car'] as TransportMode[]).map((m) => (
              <button
                key={m}
                type="button"
                className={`mode-chip ${mode === m ? 'mode-chip--active' : ''}`}
                onClick={() => {
                  setMode(m);
                  setSeatCount(m === 'bike' ? '2' : m === 'car' ? '6' : '4');
                }}
              >
                {m === 'bike' ? 'Motorbike' : m === 'train' ? 'Train Seats' : 'Car'}
              </button>
            ))}
          </div>

          <Input
            id="pod-label"
            label="Label"
            placeholder={mode === 'bike' ? 'Bike 6' : mode === 'train' ? 'KA Bengawan · Car 4' : 'Innova 1'}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />

          <div className="create-two-col">
            <Input
              id="pod-meta"
              label="Note / Model"
              placeholder={mode === 'bike' ? 'Vario 125' : 'Facing seats'}
              value={meta}
              onChange={(e) => setMeta(e.target.value)}
            />
            {mode !== 'bike' && (
              <Input
                id="pod-seats"
                label="Slots"
                inputMode="numeric"
                value={seatCount}
                onChange={(e) => setSeatCount(e.target.value.replace(/\D/g, ''))}
              />
            )}
          </div>

          <Button type="submit" variant="matcha" size="lg" fullWidth leftIcon={<Bike size={16} strokeWidth={2} />}>
            Add Transport Pod
          </Button>
        </form>
      </div>
    </div>
  );
}

/* ==========================================================================
   4. Stay & Rooms Editor Sheet (Add / Edit / Remove)
   ========================================================================== */

export interface StayEditorSheetProps {
  open: boolean;
  initial: StayLodging | null;
  members: TripMember[];
  onSave: (stay: StayLodging, isNew: boolean) => void;
  onDelete?: (stayId: string) => void;
  onClose: () => void;
}

export function StayEditorSheet({
  open,
  initial,
  members,
  onSave,
  onDelete,
  onClose,
}: StayEditorSheetProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [city, setCity] = useState(initial?.city ?? '');
  const [checkIn, setCheckIn] = useState(initial?.checkIn ?? '');
  const [checkOut, setCheckOut] = useState(initial?.checkOut ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [mapsUrl, setMapsUrl] = useState(initial?.mapsUrl ?? '');
  const [rooms, setRooms] = useState<StayRoom[]>(
    initial?.rooms ?? [
      { id: `rm-${Date.now().toString(36)}-1`, label: 'Room 1', memberIds: [], hasExtraBed: false },
    ],
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!open) return null;

  const toggleMemberInRoom = (roomId: string, memberId: string) => {
    setRooms((prev) =>
      prev.map((rm) => {
        if (rm.id !== roomId) return rm;
        const exists = rm.memberIds.includes(memberId);
        return {
          ...rm,
          memberIds: exists
            ? rm.memberIds.filter((id) => id !== memberId)
            : [...rm.memberIds, memberId],
        };
      }),
    );
  };

  const addRoom = () => {
    setRooms((prev) => [
      ...prev,
      {
        id: `rm-${Date.now().toString(36)}-${prev.length + 1}`,
        label: `Room ${prev.length + 1}`,
        memberIds: [],
        hasExtraBed: false,
      },
    ]);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(
      {
        id: initial?.id ?? `stay-${Date.now().toString(36)}`,
        name: name.trim(),
        city: city.trim(),
        checkIn: checkIn.trim() || 'Check-in TBD',
        checkOut: checkOut.trim() || 'Check-out TBD',
        address: address.trim(),
        mapsUrl: mapsUrl.trim() || undefined,
        rooms,
      },
      !initial,
    );
    onClose();
  };

  return (
    <div className="gk-sheet-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="gk-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="gk-sheet__handle" />
        <div className="gk-sheet__head">
          <div>
            <h3 className="gk-sheet__title">{initial ? 'Edit Stay' : 'Add Stay'}</h3>
            <p className="gk-sheet__sub">Homestay details &amp; room assignments</p>
          </div>
          <CornerOrb kind="close" ariaLabel="Close stay editor" onClick={onClose} />
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="create-two-col">
            <Input
              id="stay-name"
              label="Homestay / Hotel"
              placeholder="Bedja Homestay"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              id="stay-city"
              label="City"
              placeholder="Yogyakarta"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>

          <div className="create-two-col">
            <Input
              id="stay-in"
              label="Check-In"
              placeholder="Fri, Feb 12 · 17:00"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
            />
            <Input
              id="stay-out"
              label="Check-Out"
              placeholder="Sun, Feb 14 · 12:00"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
            />
          </div>

          <Input
            id="stay-addr"
            label="Address / Landmark"
            placeholder="Prawirotaman Area"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />

          <Input
            id="stay-maps"
            label="Google Maps Link"
            placeholder="https://maps.app.goo.gl/..."
            value={mapsUrl}
            onChange={(e) => setMapsUrl(e.target.value)}
          />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
            <span className="gk-field__label">Rooms ({rooms.length})</span>
            <Button variant="glass" size="sm" leftIcon={<Plus size={13} strokeWidth={2} />} onClick={addRoom}>
              Add Room
            </Button>
          </div>

          {rooms.map((rm) => (
            <div
              key={rm.id}
              style={{
                padding: 12,
                borderRadius: 20,
                background: 'rgba(255, 255, 255, 0.72)',
                border: '1px solid rgba(255, 255, 255, 0.94)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  value={rm.label}
                  onChange={(e) =>
                    setRooms((prev) =>
                      prev.map((r) => (r.id === rm.id ? { ...r, label: e.target.value } : r)),
                    )
                  }
                  style={{
                    flex: 1,
                    border: 'none',
                    background: 'transparent',
                    fontWeight: 700,
                    fontSize: 13,
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  className={`mode-chip ${rm.hasExtraBed ? 'mode-chip--active' : ''}`}
                  style={{ height: 26, padding: '0 10px', fontSize: 11 }}
                  onClick={() =>
                    setRooms((prev) =>
                      prev.map((r) =>
                        r.id === rm.id ? { ...r, hasExtraBed: !r.hasExtraBed } : r,
                      ),
                    )
                  }
                >
                  + Extra bed
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {members.map((m) => {
                  const selected = rm.memberIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleMemberInRoom(rm.id, m.id)}
                      style={{
                        height: 28,
                        padding: '0 10px',
                        borderRadius: 14,
                        fontSize: 11.5,
                        fontWeight: 600,
                        background: selected ? 'var(--brand-matcha)' : 'rgba(227, 237, 230, 0.65)',
                        color: selected ? '#FFFFFF' : 'var(--brand-forest)',
                      }}
                    >
                      {m.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <Button type="submit" variant="matcha" size="lg" fullWidth leftIcon={<BedDouble size={16} strokeWidth={2} />}>
              Save Stay
            </Button>
            {initial && onDelete && (
              <Button variant="danger" size="lg" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={17} strokeWidth={2} />
              </Button>
            )}
          </div>
        </form>

        <ConfirmDialog
          open={confirmDelete}
          title={`Delete ${initial?.name ?? 'stay'}?`}
          description="This removes the stay and its room assignments from the shared trip."
          confirmLabel="Delete"
          destructive
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            if (initial && onDelete) onDelete(initial.id);
            setConfirmDelete(false);
            onClose();
          }}
        />
      </div>
    </div>
  );
}
