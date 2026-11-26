import type { AlbumPhoto, ChatMessage, ChatPoll, SharedTrip } from '../types/trip';
import { getStickerById } from './chat';
import { calculateLedger, formatCompactIDR } from './ledger';

export interface TripRecapBadge {
  label: string;
  winner: string;
  detail: string;
}

export interface TripRecapData {
  tripCode: string;
  tripTitle: string;
  tripSubtitle: string;
  isTripCompleted: boolean;
  daysCount: number;
  crewCount: number;
  stopsDone: number;
  totalStops: number;
  photosCount: number;
  totalSpent: number;
  poolCollected: number;
  messagesCount: number;
  pollsCount: number;
  topSticker?: { caption: string; emoji: string; count: number };
  topChatter?: { name: string; count: number };
  topContributor?: { name: string; paid: number };
  badges: TripRecapBadge[];
}

export function hasTripEnded(endDateIso: string, nowDate = new Date()): boolean {
  if (!endDateIso) return false;
  const endMs = Date.parse(`${endDateIso}T23:59:59+07:00`);
  if (!Number.isFinite(endMs)) return false;
  return nowDate.getTime() > endMs;
}

export function buildTripRecapData(params: {
  trip: SharedTrip;
  messages: readonly ChatMessage[];
  polls?: readonly ChatPoll[];
  albumPhotos?: readonly AlbumPhoto[];
  nowDate?: Date;
}): TripRecapData {
  const { trip, messages, polls = [], albumPhotos = [], nowDate = new Date() } = params;
  const datedDays = trip.days.filter((d) => !d.isIdeas);
  const scheduledStops = trip.itinerary.filter((i) => i.status !== 'idea');
  const stopsDone = scheduledStops.filter((i) => i.status === 'done').length;
  const ledger = calculateLedger(trip);

  const activeMessages = messages.filter((m) => !m.deleted);
  const msgCountByName = new Map<string, number>();
  const stickerCounts = new Map<string, { caption: string; emoji: string; count: number }>();

  for (const msg of activeMessages) {
    const sender = msg.senderName?.trim() || 'Crew';
    msgCountByName.set(sender, (msgCountByName.get(sender) ?? 0) + 1);

    if (msg.kind === 'sticker') {
      const builtIn = getStickerById(msg.stickerId);
      const caption = builtIn?.caption || msg.text || 'Sticker';
      const emoji = builtIn?.emoji || '✨';
      const key = `${caption}|${emoji}`;
      const prev = stickerCounts.get(key);
      stickerCounts.set(key, {
        caption,
        emoji,
        count: (prev?.count ?? 0) + 1,
      });
    }
  }

  let topChatter: { name: string; count: number } | undefined;
  for (const [name, count] of msgCountByName.entries()) {
    if (!topChatter || count > topChatter.count) {
      topChatter = { name, count };
    }
  }

  let topSticker: { caption: string; emoji: string; count: number } | undefined;
  for (const entry of stickerCounts.values()) {
    if (!topSticker || entry.count > topSticker.count) {
      topSticker = entry;
    }
  }

  const topPoolMember = ledger.topContributors[0];
  const topContributor =
    topPoolMember && topPoolMember.paidPool > 0
      ? { name: topPoolMember.member.name, paid: topPoolMember.paidPool }
      : undefined;

  const badges: TripRecapBadge[] = [];
  if (topContributor) {
    badges.push({
      label: 'Pool MVP',
      winner: topContributor.name,
      detail: `${formatCompactIDR(topContributor.paid)} contributed`,
    });
  }
  if (topChatter) {
    badges.push({
      label: 'Chat Legend',
      winner: topChatter.name,
      detail: `${topChatter.count} messages sent`,
    });
  }
  if (topSticker) {
    badges.push({
      label: 'Signature Sticker',
      winner: `${topSticker.emoji} ${topSticker.caption}`,
      detail: `Used ${topSticker.count}x in chat`,
    });
  }
  if (badges.length === 0) {
    badges.push({
      label: 'Convoy Crew',
      winner: `${trip.members.length} Riders`,
      detail: `${datedDays.length} trip days planned`,
    });
  }

  return {
    tripCode: trip.code,
    tripTitle: trip.title,
    tripSubtitle: trip.subtitle,
    isTripCompleted: hasTripEnded(trip.endDate, nowDate),
    daysCount: datedDays.length,
    crewCount: trip.members.length,
    stopsDone,
    totalStops: scheduledStops.length,
    photosCount: albumPhotos.length,
    totalSpent: ledger.totalSpent,
    poolCollected: ledger.poolCollected,
    messagesCount: activeMessages.length,
    pollsCount: polls.length,
    topSticker,
    topChatter,
    topContributor,
    badges,
  };
}

function drawRoundedPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Exports a crisp 1080x1920 (9:16 IG-Story-ready) Liquid Glass Recap PNG offline via Canvas.
 */
export async function renderTripRecapStoryPng(
  recap: TripRecapData,
): Promise<{ blob: Blob; dataUrl: string }> {
  const W = 1080;
  const H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  // Deep Matcha + Ambient Botanical Gradient Background
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#1B352E');
  grad.addColorStop(0.45, '#2E5449');
  grad.addColorStop(1, '#F3F6F1');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Soft Ambient Blobs
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#E0922B';
  ctx.beginPath();
  ctx.arc(880, 260, 260, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8BC4AE';
  ctx.beginPath();
  ctx.arc(180, 1460, 320, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Header Badge & Title
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  drawRoundedPanel(ctx, 84, 118, 300, 58, 29);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 24px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(`TRIP RECAP · ${recap.tripCode}`, 114, 156);

  ctx.font = '700 84px "Playfair Display", Georgia, serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(recap.tripTitle.slice(0, 20), 84, 290);

  ctx.font = '500 32px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
  ctx.fillText(recap.tripSubtitle.slice(0, 42), 84, 346);

  // 4 Hero Stat Glass Cards (2x2 Grid)
  const stats = [
    { label: 'TRIP DAYS', val: `${recap.daysCount}`, sub: `${recap.crewCount} crew riders` },
    { label: 'STOPS DONE', val: `${recap.stopsDone}/${recap.totalStops}`, sub: 'Itinerary progress' },
    { label: 'SHARED SPEND', val: formatCompactIDR(recap.totalSpent), sub: `Pool ${formatCompactIDR(recap.poolCollected)}` },
    { label: 'MEMORIES', val: `${recap.photosCount}`, sub: `${recap.messagesCount} chat msgs` },
  ];

  stats.forEach((st, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const x = 84 + col * 468;
    const y = 430 + row * 288;
    const w = 444;
    const h = 258;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    drawRoundedPanel(ctx, x, y, w, h, 36);
    ctx.fill();

    ctx.fillStyle = '#4A7468';
    ctx.font = '700 22px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(st.label, x + 36, y + 62);

    ctx.fillStyle = '#182420';
    ctx.font = '700 72px "Playfair Display", Georgia, serif';
    ctx.fillText(st.val, x + 36, y + 158);

    ctx.fillStyle = '#52665E';
    ctx.font = '600 24px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(st.sub, x + 36, y + 214);
  });

  // Awards Section
  ctx.fillStyle = '#1F332D';
  ctx.font = '800 24px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('CREW AWARDS', 84, 1085);

  recap.badges.slice(0, 3).forEach((badge, idx) => {
    const y = 1120 + idx * 176;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
    drawRoundedPanel(ctx, 84, y, W - 168, 148, 32);
    ctx.fill();

    ctx.fillStyle = '#E0922B';
    ctx.font = '800 22px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(badge.label.toUpperCase(), 124, y + 52);

    ctx.fillStyle = '#182420';
    ctx.font = '700 42px "Fredoka", "Plus Jakarta Sans", sans-serif';
    ctx.fillText(badge.winner.slice(0, 26), 124, y + 106);

    ctx.fillStyle = '#52665E';
    ctx.font = '600 24px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(badge.detail, 580, y + 102);
  });

  // Footer Brand
  ctx.fillStyle = '#2D4A42';
  ctx.font = '700 32px "Fredoka", sans-serif';
  ctx.fillText('GASKEUN!', 84, 1790);
  ctx.fillStyle = '#52665E';
  ctx.font = '500 24px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Group Travel Companion PWA', 84, 1832);

  const dataUrl = canvas.toDataURL('image/png');
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('PNG export failed'))),
      'image/png',
    );
  });
  return { blob, dataUrl };
}
