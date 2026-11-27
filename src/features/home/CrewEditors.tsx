import { useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  BedDouble,
  Bike,
  Car,
  Check,
  ImagePlus,
  Plus,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  Input,
  LiquidBottomSheet,
} from '../../components/atoms';
import { ImageSourceSheet } from '../../components/organisms/ImageSourceSheet';
import { PhotoCropperSheet } from '../../components/organisms/PhotoCropperSheet';
import { normalizeCarSeats, toggleStayRoomMember } from '../../services/crewSwap';
import { uploadSharedImage } from '../../services/mediaUploader';
import type { CroppedImageResult } from '../../services/photoCrop';
import type {
  MemberRole,
  MemberStatus,
  SharedTrip,
  StayLodging,
  StayRoom,
  TrainCarLayout,
  TrainPassInfo,
  Transaction,
  TransportMode,
  TransportPod,
  TripMember,
} from '../../types/trip';
import { buildTrainSlotsForLayout } from './TrainSeatMap';
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
   1. Train Pass Editor Sheet (with Optional + Train Photo Upload)
   ========================================================================== */

export interface TrainPassEditorSheetProps {
  open: boolean;
  trip: SharedTrip;
  uploaderName: string;
  initial?: TrainPassInfo;
  onSave: (info: TrainPassInfo) => void;
  onClose: () => void;
}

export function TrainPassEditorSheet({
  open,
  trip,
  uploaderName,
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
  const [trainPhotoDataUrl, setTrainPhotoDataUrl] = useState<string | undefined>(
    initial?.trainPhotoDataUrl,
  );
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [imageSourceOpen, setImageSourceOpen] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const handleCroppedTrainPhoto = async (cropped: CroppedImageResult) => {
    setCropFile(null);
    setTrainPhotoDataUrl(cropped.dataUrl);
    setUploadingPhoto(true);
    try {
      const uploaded = await uploadSharedImage(cropped, {
        kind: 'train',
        trip,
        caption: trainName.trim() || 'Train Pass',
        uploaderName,
        fileName: 'train-pass.jpg',
      });
      setTrainPhotoDataUrl(uploaded.url || cropped.dataUrl);
    } catch {
      setTrainPhotoDataUrl(cropped.dataUrl);
    } finally {
      setUploadingPhoto(false);
    }
  };

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
      trainPhotoDataUrl,
    });
    onClose();
  };

  return (
    <LiquidBottomSheet
      open={open}
      title="Edit Train Pass"
      subtitle="Boarding details & train photo"
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Optional + Train Photo Upload */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="cover-drop-strip tactile"
            onClick={() => setImageSourceOpen(true)}
          >
            {trainPhotoDataUrl ? (
              <img
                src={trainPhotoDataUrl}
                alt="Train preview"
                style={{ width: '100%', height: 112, objectFit: 'cover', display: 'block' }}
              />
            ) : (
              <>
                <ImagePlus size={16} strokeWidth={1.8} />
                <span>+ Train Photo</span>
              </>
            )}
          </button>
          {trainPhotoDataUrl && (
            <button
              type="button"
              aria-label="Remove train photo"
              onClick={() => setTrainPhotoDataUrl(undefined)}
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                width: 28,
                height: 28,
                borderRadius: 14,
                background: 'rgba(24, 36, 32, 0.72)',
                color: '#FFFFFF',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={14} strokeWidth={2.2} />
            </button>
          )}
        </div>
        {uploadingPhoto && (
          <div style={{ fontSize: 11.5, color: 'var(--brand-matcha)', fontWeight: 600 }}>
            Uploading train photo...
          </div>
        )}

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

        <Button type="submit" variant="matcha" size="lg" fullWidth disabled={uploadingPhoto}>
          Save Train Pass
        </Button>
      </form>

      <ImageSourceSheet
        open={imageSourceOpen}
        title="Train Pass Photo"
        onPick={(file) => setCropFile(file)}
        onClose={() => setImageSourceOpen(false)}
      />

      <PhotoCropperSheet
        open={Boolean(cropFile)}
        file={cropFile}
        preset="train-photo"
        onCancel={() => setCropFile(null)}
        onConfirm={(res) => void handleCroppedTrainPhoto(res)}
      />
    </LiquidBottomSheet>
  );
}

/* ==========================================================================
   2. Crew Members Manager Sheet (Add / Edit / Safe Remove)
   ========================================================================== */

export interface CrewMembersSheetProps {
  open: boolean;
  members: TripMember[];
  transactions: Transaction[];
  onSaveMember: (member: TripMember, isNew: boolean) => void;
  onDeleteMember: (memberId: string) => void;
  onClose: () => void;
}

export function CrewMembersSheet({
  open,
  members,
  transactions,
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
  const [blockedDeleteMsg, setBlockedDeleteMsg] = useState<string>('');

  const protectedMemberIds = useMemo(() => {
    const ids = new Set<string>();
    for (const tx of transactions) {
      if (tx.memberId) ids.add(tx.memberId);
      if (tx.paidByMemberId) ids.add(tx.paidByMemberId);
    }
    return ids;
  }, [transactions]);

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
      avatarDataUrl: existing?.avatarDataUrl,
      passcode: existing?.passcode,
      role,
      status,
      isCreator: existing?.isCreator,
      joinedAt: existing ? existing.joinedAt : new Date().toISOString(),
    };
    onSaveMember(member, !existing);
    resetForm();
  };

  const deleteTarget = confirmDeleteId ? members.find((m) => m.id === confirmDeleteId) : undefined;

  return (
    <LiquidBottomSheet
      open={open}
      title={`Manage Crew (${members.length})`}
      subtitle="Add, edit, or mark riders as tentative"
      onClose={onClose}
    >
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
                  swatchIdx === idx ? '2.5px solid var(--brand-matcha)' : '1.5px solid #FFFFFF',
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
            leftIcon={
              editingId ? (
                <Check size={15} strokeWidth={2} />
              ) : (
                <UserPlus size={15} strokeWidth={2} />
              )
            }
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

      {blockedDeleteMsg && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            padding: '10px 12px',
            borderRadius: 16,
            background: 'var(--accent-coral-soft)',
            color: 'var(--accent-coral)',
            fontSize: 12,
            fontWeight: 600,
            marginBottom: 12,
          }}
        >
          <AlertCircle size={16} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{blockedDeleteMsg}</span>
        </div>
      )}

      <div className="gk-menu-list">
        {members.map((m) => {
          const hasLedgerHistory = protectedMemberIds.has(m.id);
          return (
            <div key={m.id} className="gk-menu-item" style={{ cursor: 'default' }}>
              <button
                type="button"
                className="gk-menu-item__left"
                style={{ flex: 1, textAlign: 'left' }}
                onClick={() => {
                  setBlockedDeleteMsg('');
                  startEdit(m);
                }}
              >
                <Avatar
                  initials={m.initials}
                  name={m.name}
                  src={m.avatarDataUrl}
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
                    {hasLedgerHistory ? ' · Has ledger records' : ''}
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
                    onClick={() => {
                      if (hasLedgerHistory) {
                        setBlockedDeleteMsg(
                          `Cannot remove ${m.name} while they have Pool or Expense transactions. Delete or reassign their transactions in Wallet first.`,
                        );
                        return;
                      }
                      setBlockedDeleteMsg('');
                      setConfirmDeleteId(m.id);
                    }}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 15,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: hasLedgerHistory ? 'var(--text-muted)' : 'var(--accent-coral)',
                      background: hasLedgerHistory
                        ? 'rgba(136, 155, 147, 0.16)'
                        : 'var(--accent-coral-soft)',
                    }}
                  >
                    <Trash2 size={14} strokeWidth={2} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Remove ${deleteTarget?.name ?? 'member'}?`}
        description="They will be unassigned from bikes, train seats, and hotel rooms."
        confirmLabel="Remove"
        destructive
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={() => {
          if (confirmDeleteId) onDeleteMember(confirmDeleteId);
          setConfirmDeleteId(null);
          if (editingId === confirmDeleteId) resetForm();
        }}
      />
    </LiquidBottomSheet>
  );
}

/* ==========================================================================
   3. Unified Pod Editor Sheet (Add & Edit Bike / KAI Train Layout / Car)
   ========================================================================== */

export interface PodEditorSheetProps {
  open: boolean;
  initial: TransportPod | null;
  defaultMode: TransportMode;
  existingCount: number;
  onSave: (pod: TransportPod, isNew: boolean) => void;
  onDelete?: (podId: string) => void;
  onClose: () => void;
}

export function PodEditorSheet({
  open,
  initial,
  defaultMode,
  existingCount,
  onSave,
  onDelete,
  onClose,
}: PodEditorSheetProps) {
  const [mode, setMode] = useState<TransportMode>(initial?.mode ?? defaultMode);
  const [label, setLabel] = useState(initial?.label ?? '');
  const [vehicleModel, setVehicleModel] = useState(
    initial?.vehicleModel ?? (initial?.mode === 'bike' ? initial?.meta ?? '' : ''),
  );
  const [plateNumber, setPlateNumber] = useState(initial?.plateNumber ?? '');
  const [roleNote, setRoleNote] = useState(initial?.roleNote ?? '');

  // KAI Train Car Layout Fields
  const [trainFormat, setTrainFormat] = useState<'3-2' | '2-2'>(
    initial?.trainLayout?.format ?? '3-2',
  );
  const [carNumber, setCarNumber] = useState(initial?.trainLayout?.carNumber ?? 'Coach 3');
  const [startRow, setStartRow] = useState(String(initial?.trainLayout?.startRow ?? 10));
  const [endRow, setEndRow] = useState(String(initial?.trainLayout?.endRow ?? 12));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const isNew = !initial;

    if (mode === 'train') {
      const start = Math.max(1, Math.min(30, Number(startRow) || 1));
      const end = Math.max(start, Math.min(start + 12, Number(endRow) || start + 2));
      const layout: TrainCarLayout = {
        format: trainFormat,
        carNumber: carNumber.trim() || 'Coach 1',
        startRow: start,
        endRow: end,
        facingRows: false,
      };
      const slots = buildTrainSlotsForLayout(layout, initial?.slots ?? []);
      const pod: TransportPod = {
        id: initial?.id ?? `pod-train-${Date.now().toString(36)}`,
        mode: 'train',
        label: label.trim() || `Train Car ${existingCount + 1}`,
        meta: `${layout.carNumber} · ${layout.format}`,
        trainLayout: layout,
        slots,
      };
      onSave(pod, isNew);
      onClose();
      return;
    }

    if (mode === 'bike') {
      const modelClean = vehicleModel.trim();
      const roleClean = roleNote.trim();
      const metaDisplay = [roleClean, modelClean].filter(Boolean).join(' · ') || undefined;
      const pod: TransportPod = {
        id: initial?.id ?? `pod-bike-${Date.now().toString(36)}`,
        mode: 'bike',
        label: label.trim() || `Bike ${existingCount + 1}`,
        vehicleModel: modelClean || undefined,
        roleNote: roleClean || undefined,
        meta: metaDisplay,
        slots: initial?.slots ?? [
          { role: 'Driver', memberId: null },
          { role: 'Rider', memberId: null },
        ],
      };
      onSave(pod, isNew);
      onClose();
      return;
    }

    // Car pod (Indonesian RHD Cabin: Front Left + Driver + Unlimited Middle & Back Rows)
    const modelClean = vehicleModel.trim();
    const plateClean = plateNumber.trim().toUpperCase();
    const roleClean = roleNote.trim();
    const carSeats = initial
      ? normalizeCarSeats(initial)
      : { middle: [], back: [] };
    const pod: TransportPod = {
      id: initial?.id ?? `pod-car-${Date.now().toString(36)}`,
      mode: 'car',
      label: label.trim() || `Car ${existingCount + 1}`,
      vehicleModel: modelClean || undefined,
      plateNumber: plateClean || undefined,
      roleNote: roleClean || undefined,
      meta: [modelClean, plateClean, roleClean].filter(Boolean).join(' · ') || undefined,
      carSeats,
      slots: [],
    };
    onSave(pod, isNew);
    onClose();
  };

  return (
    <LiquidBottomSheet
      open={open}
      title={
        initial
          ? mode === 'train'
            ? 'Edit Train Car Layout'
            : `Edit ${initial.label}`
          : 'Add Transport Pod'
      }
      subtitle={
        mode === 'train'
          ? 'Configure KAI 3–2 / 2–2 seating & facing rows'
          : 'Vehicle name, model, and convoy role'
      }
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!initial && (
          <div style={{ display: 'flex', gap: 8 }}>
            {(['bike', 'train', 'car'] as TransportMode[]).map((m) => (
              <button
                key={m}
                type="button"
                className={`mode-chip ${mode === m ? 'mode-chip--active' : ''}`}
                onClick={() => setMode(m)}
              >
                {m === 'bike' ? 'Motorbike' : m === 'train' ? 'Train Car' : 'Car'}
              </button>
            ))}
          </div>
        )}

        <Input
          id="pod-label"
          label={mode === 'train' ? 'Train Name' : 'Pod Name'}
          placeholder={
            mode === 'bike' ? 'Bike 1' : mode === 'train' ? 'KA Bengawan' : 'Innova 1'
          }
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />

        {mode === 'train' ? (
          <>
            <div>
              <div className="gk-field__label" style={{ marginBottom: 6 }}>
                SEATING FORMAT
              </div>
              <div className="create-two-col">
                <button
                  type="button"
                  className={`wallet-subtab tactile ${trainFormat === '3-2' ? 'wallet-subtab--active' : ''}`}
                  style={{ height: 38 }}
                  onClick={() => setTrainFormat('3-2')}
                >
                  3–2 (A B C | D E)
                </button>
                <button
                  type="button"
                  className={`wallet-subtab tactile ${trainFormat === '2-2' ? 'wallet-subtab--active' : ''}`}
                  style={{ height: 38 }}
                  onClick={() => setTrainFormat('2-2')}
                >
                  2–2 (A B | C D)
                </button>
              </div>
            </div>

            <Input
              id="pod-car-num"
              label="Coach / Car Badge"
              placeholder="Coach 3 or EKO 3"
              value={carNumber}
              onChange={(e) => setCarNumber(e.target.value)}
            />

            <div className="create-two-col">
              <Input
                id="pod-row-start"
                label="Start Row"
                inputMode="numeric"
                value={startRow}
                onChange={(e) => setStartRow(e.target.value.replace(/\D/g, ''))}
              />
              <Input
                id="pod-row-end"
                label="End Row"
                inputMode="numeric"
                value={endRow}
                onChange={(e) => setEndRow(e.target.value.replace(/\D/g, ''))}
              />
            </div>
          </>
        ) : (
          <>
            <div className="create-two-col">
              <Input
                id="pod-model"
                label="Vehicle Model"
                placeholder={mode === 'bike' ? 'Vario 125, Scoopy, Beat' : 'Innova Zenix'}
                value={vehicleModel}
                onChange={(e) => setVehicleModel(e.target.value)}
              />
              <Input
                id="pod-role"
                label="Role / Note"
                placeholder="Lead, Sweep"
                value={roleNote}
                onChange={(e) => setRoleNote(e.target.value)}
              />
            </div>

            {mode === 'car' && (
              <Input
                id="pod-plate"
                label="Plate Number (Optional)"
                placeholder="B 1234 XYZ"
                value={plateNumber}
                onChange={(e) => setPlateNumber(e.target.value)}
              />
            )}
          </>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          {initial && onDelete && (
            <Button
              variant="danger"
              size="lg"
              aria-label="Delete transport pod"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={17} strokeWidth={2} />
            </Button>
          )}
          <Button
            type="submit"
            variant="matcha"
            size="lg"
            fullWidth
            leftIcon={mode === 'car' ? <Car size={16} strokeWidth={2} /> : <Bike size={16} strokeWidth={2} />}
          >
            {initial ? 'Save Changes' : mode === 'car' ? 'Add Car' : 'Add Transport Pod'}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={confirmDelete}
        title={`Remove ${initial?.label ?? 'pod'}?`}
        description="This removes this transport pod from Crew & Stay."
        confirmLabel="Remove"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (initial && onDelete) onDelete(initial.id);
          setConfirmDelete(false);
          onClose();
        }}
      />
    </LiquidBottomSheet>
  );
}

/* ==========================================================================
   4. Stay & Rooms Editor Sheet (with Optional + Stay Photo Upload)
   ========================================================================== */

export interface StayEditorSheetProps {
  open: boolean;
  trip: SharedTrip;
  uploaderName: string;
  initial: StayLodging | null;
  members: TripMember[];
  onSave: (stay: StayLodging, isNew: boolean) => void;
  onDelete?: (stayId: string) => void;
  onClose: () => void;
}

export function StayEditorSheet({
  open,
  trip,
  uploaderName,
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
  const [photoDataUrl, setPhotoDataUrl] = useState<string | undefined>(initial?.photoDataUrl);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [rooms, setRooms] = useState<StayRoom[]>(
    initial?.rooms ?? [
      {
        id: `rm-${Date.now().toString(36)}-1`,
        label: 'Room 1',
        memberIds: [],
        hasExtraBed: false,
      },
    ],
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [imageSourceOpen, setImageSourceOpen] = useState(false);

  const handleCroppedStayPhoto = async (cropped: CroppedImageResult) => {
    setCropFile(null);
    setPhotoDataUrl(cropped.dataUrl);
    setUploadingPhoto(true);
    try {
      const uploaded = await uploadSharedImage(cropped, {
        kind: 'stay',
        trip,
        caption: name.trim() || 'Stay',
        uploaderName,
        fileName: 'stay-cover.jpg',
      });
      setPhotoDataUrl(uploaded.url || cropped.dataUrl);
    } catch {
      setPhotoDataUrl(cropped.dataUrl);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const toggleMemberInRoom = (roomId: string, memberId: string) => {
    setRooms((prev) => toggleStayRoomMember(prev, roomId, memberId));
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
        photoDataUrl,
        rooms,
      },
      !initial,
    );
    onClose();
  };

  return (
    <LiquidBottomSheet
      open={open}
      title={initial ? 'Edit Stay' : 'Add Stay'}
      subtitle="Homestay photo, details & room assignments"
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Optional + Stay Photo Upload */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="cover-drop-strip tactile"
            onClick={() => setImageSourceOpen(true)}
          >
            {photoDataUrl ? (
              <img
                src={photoDataUrl}
                alt="Stay preview"
                style={{ width: '100%', height: 118, objectFit: 'cover', display: 'block' }}
              />
            ) : (
              <>
                <ImagePlus size={16} strokeWidth={1.8} />
                <span>+ Stay Photo</span>
              </>
            )}
          </button>
          {photoDataUrl && (
            <button
              type="button"
              aria-label="Remove stay photo"
              onClick={() => setPhotoDataUrl(undefined)}
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                width: 28,
                height: 28,
                borderRadius: 14,
                background: 'rgba(24, 36, 32, 0.72)',
                color: '#FFFFFF',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={14} strokeWidth={2.2} />
            </button>
          )}
        </div>
        {uploadingPhoto && (
          <div style={{ fontSize: 11.5, color: 'var(--brand-matcha)', fontWeight: 600 }}>
            Uploading stay photo...
          </div>
        )}

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

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 4,
          }}
        >
          <span className="gk-field__label">Rooms ({rooms.length})</span>
          <Button
            variant="glass"
            size="sm"
            leftIcon={<Plus size={13} strokeWidth={2} />}
            onClick={addRoom}
          >
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
          {initial && onDelete && (
            <Button
              variant="danger"
              size="lg"
              aria-label="Delete stay"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={17} strokeWidth={2} />
            </Button>
          )}
          <Button
            type="submit"
            variant="matcha"
            size="lg"
            fullWidth
            disabled={uploadingPhoto}
            leftIcon={<BedDouble size={16} strokeWidth={2} />}
          >
            Save Stay
          </Button>
        </div>
      </form>

      <ImageSourceSheet
        open={imageSourceOpen}
        title="Stay / Homestay Photo"
        onPick={(file) => setCropFile(file)}
        onClose={() => setImageSourceOpen(false)}
      />

      <PhotoCropperSheet
        open={Boolean(cropFile)}
        file={cropFile}
        preset="stay-cover"
        onCancel={() => setCropFile(null)}
        onConfirm={(res) => void handleCroppedStayPhoto(res)}
      />

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
    </LiquidBottomSheet>
  );
}
