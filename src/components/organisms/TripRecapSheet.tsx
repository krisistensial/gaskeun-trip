import { useMemo, useState } from 'react';
import { Award, Download, Share2, Sparkles } from 'lucide-react';
import { Badge, Button, LiquidBottomSheet } from '../atoms';
import { formatCompactIDR } from '../../services/ledger';
import { buildTripRecapData, renderTripRecapStoryPng } from '../../services/tripRecap';
import { triggerFeedback } from '../../services/feedback';
import type { AlbumPhoto, ChatMessage, ChatPoll, SharedTrip } from '../../types/trip';

export interface TripRecapSheetProps {
  open: boolean;
  trip: SharedTrip;
  messages: ChatMessage[];
  polls?: ChatPoll[];
  albumPhotos?: AlbumPhoto[];
  onNotify?: (msg: string, tone?: 'success' | 'info' | 'error') => void;
  onClose: () => void;
}

export function TripRecapSheet({
  open,
  trip,
  messages,
  polls = [],
  albumPhotos = [],
  onNotify,
  onClose,
}: TripRecapSheetProps) {
  const [exporting, setExporting] = useState(false);

  const recap = useMemo(
    () => buildTripRecapData({ trip, messages, polls, albumPhotos }),
    [trip, messages, polls, albumPhotos],
  );

  const handleExportStory = async (preferShare: boolean) => {
    setExporting(true);
    triggerFeedback('tap');
    try {
      const { blob, dataUrl } = await renderTripRecapStoryPng(recap);
      const fileName = `${recap.tripCode.toLowerCase()}-recap-story.png`;

      if (
        preferShare &&
        typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function'
      ) {
        const file = new File([blob], fileName, { type: 'image/png' });
        if (!navigator.canShare || navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: `${recap.tripTitle} Recap`,
            text: `${recap.tripTitle} · ${recap.daysCount} days, ${recap.stopsDone} stops done!`,
            files: [file],
          });
          triggerFeedback('success');
          return;
        }
      }

      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = fileName;
      link.click();
      triggerFeedback('success');
      onNotify?.('9:16 Trip Recap story PNG saved!', 'success');
    } catch {
      triggerFeedback('warning');
      onNotify?.('Could not export recap card right now', 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <LiquidBottomSheet
      open={open}
      title="Trip Recap"
      subtitle={`${recap.tripTitle} · ${recap.isTripCompleted ? 'Wrapped' : 'Live Preview'}`}
      onClose={onClose}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* 9:16 Story Preview Card */}
        <div
          style={{
            borderRadius: 28,
            padding: 18,
            background: 'linear-gradient(155deg, #1E3A32 0%, #345F53 52%, #E3EDE6 100%)',
            color: '#FFFFFF',
            boxShadow: '0 20px 44px rgba(24, 36, 32, 0.22)',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Badge tone="amber" icon={<Sparkles size={11} strokeWidth={2.2} />}>
              GASKEUN WRAPPED · {recap.tripCode}
            </Badge>
            <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.85 }}>9:16 STORY</span>
          </div>

          <div>
            <h3
              style={{
                margin: 0,
                fontFamily: 'var(--font-serif-hero, "Playfair Display", serif)',
                fontSize: 28,
                lineHeight: 1.08,
                color: '#FFFFFF',
              }}
            >
              {recap.tripTitle}
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, opacity: 0.84 }}>
              {recap.tripSubtitle}
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 10,
            }}
          >
            {[
              { label: 'DAYS & CREW', val: `${recap.daysCount}d`, sub: `${recap.crewCount} riders` },
              {
                label: 'STOPS DONE',
                val: `${recap.stopsDone}/${recap.totalStops}`,
                sub: 'Itinerary trail',
              },
              {
                label: 'SHARED SPEND',
                val: formatCompactIDR(recap.totalSpent),
                sub: `Pool ${formatCompactIDR(recap.poolCollected)}`,
              },
              {
                label: 'MEMORIES',
                val: `${recap.photosCount}`,
                sub: `${recap.messagesCount} msgs · ${recap.pollsCount} polls`,
              },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  borderRadius: 20,
                  padding: '12px 13px',
                  background: 'rgba(255, 255, 255, 0.92)',
                  color: 'var(--text-primary)',
                }}
              >
                <div
                  style={{
                    fontSize: 9.5,
                    fontWeight: 800,
                    letterSpacing: '0.06em',
                    color: 'var(--brand-matcha)',
                  }}
                >
                  {item.label}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-serif-hero, "Playfair Display", serif)',
                    fontSize: 24,
                    fontWeight: 700,
                    lineHeight: 1.15,
                    marginTop: 2,
                  }}
                >
                  {item.val}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {item.sub}
                </div>
              </div>
            ))}
          </div>

          {/* Crew Awards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {recap.badges.map((b) => (
              <div
                key={b.label}
                style={{
                  borderRadius: 16,
                  padding: '9px 12px',
                  background: 'rgba(255, 255, 255, 0.9)',
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <Award size={15} strokeWidth={2.1} color="#D4841D" />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 9.5,
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        color: '#9A5F16',
                      }}
                    >
                      {b.label}
                    </div>
                    <div
                      style={{
                        fontSize: 13.5,
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {b.winner}
                    </div>
                  </div>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0 }}>
                  {b.detail}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            variant="glass"
            size="lg"
            fullWidth
            disabled={exporting}
            leftIcon={<Download size={16} strokeWidth={2} />}
            onClick={() => void handleExportStory(false)}
          >
            Save PNG
          </Button>
          <Button
            variant="matcha"
            size="lg"
            fullWidth
            disabled={exporting}
            leftIcon={<Share2 size={16} strokeWidth={2} />}
            onClick={() => void handleExportStory(true)}
          >
            {exporting ? 'Rendering...' : 'Share Story'}
          </Button>
        </div>
      </div>
    </LiquidBottomSheet>
  );
}
