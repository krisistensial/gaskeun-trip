import { useState, type FormEvent } from 'react';
import { Check, ChevronDown, ChevronUp, Copy, Link2, Settings2 } from 'lucide-react';
import { Badge, Button, Input, LiquidBottomSheet } from '../atoms';
import { buildInviteUrl } from '../../services/tripFactory';
import type { SharedTrip } from '../../types/trip';
import './sheets.css';

export interface TripSettingsSheetProps {
  open: boolean;
  trip: SharedTrip;
  onSave: (patch: {
    title: string;
    subtitle: string;
    departureAt: string;
    poolTargetPerPerson: number;
    fundraiseTarget: number;
    minimumDpPerPerson: number;
    gdriveFolderUrl: string;
    gdriveScriptUrl: string;
  }) => void;
  onCopyText: (text: string, label: string) => void;
  onClose: () => void;
}

function splitDeparture(iso: string): { date: string; time: string } {
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (m) return { date: m[1], time: m[2] };
  return { date: '2027-02-11', time: '09:14' };
}

export function TripSettingsSheet({
  open,
  trip,
  onSave,
  onCopyText,
  onClose,
}: TripSettingsSheetProps) {
  const dep = splitDeparture(trip.departureAt);
  const [title, setTitle] = useState(trip.title);
  const [subtitle, setSubtitle] = useState(trip.subtitle);
  const [depDate, setDepDate] = useState(dep.date);
  const [depTime, setDepTime] = useState(dep.time);
  const [poolPerPerson, setPoolPerPerson] = useState(
    String(trip.financeConfig.poolTargetPerPerson),
  );
  const [fundraiseGoal, setFundraiseGoal] = useState(
    String(trip.financeConfig.fundraiseTarget),
  );
  const [minDp, setMinDp] = useState(
    String(trip.financeConfig.minimumDpPerPerson ?? 200000),
  );
  const [showDriveConfig, setShowDriveConfig] = useState(false);
  const [gdriveFolderUrl, setGdriveFolderUrl] = useState(
    trip.gdriveFolderUrl ?? trip.albumUrl ?? '',
  );
  const [gdriveScriptUrl, setGdriveScriptUrl] = useState(trip.gdriveScriptUrl ?? '');
  const [copiedWhich, setCopiedWhich] = useState<'code' | 'link' | null>(null);

  if (!open) return null;

  const inviteUrl = buildInviteUrl(trip.code);

  const handleCopy = (which: 'code' | 'link') => {
    const value = which === 'code' ? trip.code : inviteUrl;
    onCopyText(value, which === 'code' ? `Trip code ${trip.code}` : 'Invite link');
    setCopiedWhich(which);
    window.setTimeout(() => setCopiedWhich(null), 1800);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSave({
      title: title.trim() || trip.title,
      subtitle: subtitle.trim() || trip.subtitle,
      departureAt: `${depDate}T${depTime || '08:00'}:00+07:00`,
      poolTargetPerPerson: Math.max(0, Number(poolPerPerson.replace(/\D/g, '')) || 0),
      fundraiseTarget: Math.max(0, Number(fundraiseGoal.replace(/\D/g, '')) || 0),
      minimumDpPerPerson: Math.max(0, Number(minDp.replace(/\D/g, '')) || 0),
      gdriveFolderUrl: gdriveFolderUrl.trim(),
      gdriveScriptUrl: gdriveScriptUrl.trim(),
    });
    onClose();
  };

  return (
    <LiquidBottomSheet
      open={open}
      title="Trip Settings"
      subtitle="Edit trip identity, targets & invite access"
      onClose={onClose}
    >
      {/* Shareable Trip Code & Invite Link */}
        <div
          style={{
            padding: 14,
            borderRadius: 22,
            background: 'rgba(227, 237, 230, 0.55)',
            marginBottom: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="gk-field__label">TRIP CODE &amp; INVITE</span>
            <Badge tone="matcha">{trip.code}</Badge>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              variant="glass"
              size="sm"
              fullWidth
              leftIcon={
                copiedWhich === 'code' ? (
                  <Check size={14} strokeWidth={2} />
                ) : (
                  <Copy size={14} strokeWidth={1.8} />
                )
              }
              onClick={() => handleCopy('code')}
            >
              {copiedWhich === 'code' ? 'Code Copied' : 'Copy Code'}
            </Button>
            <Button
              variant="glass"
              size="sm"
              fullWidth
              leftIcon={
                copiedWhich === 'link' ? (
                  <Check size={14} strokeWidth={2} />
                ) : (
                  <Link2 size={14} strokeWidth={1.8} />
                )
              }
              onClick={() => handleCopy('link')}
            >
              {copiedWhich === 'link' ? 'Link Copied' : 'Copy Invite Link'}
            </Button>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input
            id="ts-title"
            label="Trip Name"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Input
            id="ts-subtitle"
            label="Date & Tagline"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
          />

          <div className="create-two-col">
            <Input
              id="ts-dep-date"
              label="Countdown Date"
              type="date"
              value={depDate}
              onChange={(e) => setDepDate(e.target.value)}
            />
            <Input
              id="ts-dep-time"
              label="Departure Time"
              type="time"
              value={depTime}
              onChange={(e) => setDepTime(e.target.value)}
            />
          </div>

          <div className="create-two-col">
            <Input
              id="ts-pool"
              label="Pool / Person (IDR)"
              inputMode="numeric"
              value={poolPerPerson}
              onChange={(e) => setPoolPerPerson(e.target.value.replace(/\D/g, ''))}
            />
            <Input
              id="ts-fundraise"
              label="Fundraise Goal"
              inputMode="numeric"
              value={fundraiseGoal}
              onChange={(e) => setFundraiseGoal(e.target.value.replace(/\D/g, ''))}
            />
          </div>

          <Input
            id="ts-mindp"
            label="Minimum Deposit Milestone (IDR)"
            inputMode="numeric"
            value={minDp}
            onChange={(e) => setMinDp(e.target.value.replace(/\D/g, ''))}
          />

          {/* Optional Collapsible Google Drive Album Sync */}
          <button
            type="button"
            className="create-optional-toggle tactile"
            onClick={() => setShowDriveConfig((v) => !v)}
          >
            <span>Optional: Google Drive Album Sync</span>
            {showDriveConfig ? (
              <ChevronUp size={16} strokeWidth={2} />
            ) : (
              <ChevronDown size={16} strokeWidth={2} />
            )}
          </button>

          {showDriveConfig && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Input
                id="ts-gdrive-folder"
                label="Google Drive Folder URL"
                placeholder="https://drive.google.com/drive/folders/..."
                value={gdriveFolderUrl}
                onChange={(e) => setGdriveFolderUrl(e.target.value)}
              />
              <Input
                id="ts-gdrive-script"
                label="Apps Script Sync URL"
                placeholder="https://script.google.com/macros/s/.../exec"
                hint="Deploy scripts/gdrive-apps-script.gs to enable direct uploads."
                value={gdriveScriptUrl}
                onChange={(e) => setGdriveScriptUrl(e.target.value)}
              />
            </div>
          )}

          <Button
            type="submit"
            variant="matcha"
            size="lg"
            fullWidth
            leftIcon={<Settings2 size={16} strokeWidth={2} />}
          >
            Save Trip Settings
          </Button>
        </form>
    </LiquidBottomSheet>
  );
}
