import type * as XlsxType from 'xlsx';
import { normalizeCarSeats } from './crewSwap';
import { calculateLedger, formatIDRNumber } from './ledger';
import type { RichNoteBlock, SharedTrip } from '../types/trip';

/**
 * Strips any HTML tags & collapses excess whitespace into clean plain text
 * for Excel cells.
 */
export function stripHtmlToPlainText(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function notesToPlainText(notes: RichNoteBlock[]): string {
  if (!Array.isArray(notes) || notes.length === 0) return '';
  return notes
    .map((block) => {
      const clean = stripHtmlToPlainText(block.text);
      if (!clean) return '';
      if (block.kind === 'checklist') return `${block.checked ? '[x]' : '[ ]'} ${clean}`;
      if (block.kind === 'bullet') return `- ${clean}`;
      return clean;
    })
    .filter(Boolean)
    .join('\n');
}

/**
 * Pure SheetJS workbook builder (100% client-side & offline, loaded lazily via dynamic import).
 * Produces 3 structured sheets:
 *   1. Itinerary
 *   2. Wallet
 *   3. Crew & Stay
 */
export async function buildTripWorkbook(trip: SharedTrip): Promise<XlsxType.WorkBook> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const dayById = new Map(trip.days.map((d) => [d.id, d]));
  const memberById = new Map(trip.members.map((m) => [m.id, m]));
  const ledger = calculateLedger(trip);

  /* --- Sheet 1: Itinerary --- */
  const sortedItinerary = [...trip.itinerary].sort((a, b) => {
    const dayA = dayById.get(a.dayId)?.date || '9999-99-99';
    const dayB = dayById.get(b.dayId)?.date || '9999-99-99';
    if (dayA !== dayB) return dayA.localeCompare(dayB);
    return a.startTime.localeCompare(b.startTime);
  });

  const itineraryRows = sortedItinerary.map((item) => {
    const day = dayById.get(item.dayId);
    const dayLabel = day?.isIdeas ? 'Ideas' : `${day?.dayLabel ?? ''} ${day?.dateNum ?? ''}`.trim();
    return {
      Day: dayLabel,
      Date: day?.date || '',
      Start: item.startTime,
      End: item.endTime || '',
      Type: item.type.toUpperCase(),
      Title: stripHtmlToPlainText(item.title),
      Notes:
        (item.notesHtml ? stripHtmlToPlainText(item.notesHtml) : notesToPlainText(item.notes)) ||
        stripHtmlToPlainText(item.locationHint),
      'Est. Cost (IDR)': item.costEstimate ?? 0,
      'Maps URL': item.mapsUrl || '',
    };
  });

  const wsItinerary = XLSX.utils.json_to_sheet(
    itineraryRows.length > 0
      ? itineraryRows
      : [
          {
            Day: '',
            Date: '',
            Start: '',
            End: '',
            Type: '',
            Title: 'No itinerary items yet',
            Notes: '',
            'Est. Cost (IDR)': 0,
            'Maps URL': '',
          },
        ],
  );
  wsItinerary['!cols'] = [
    { wch: 10 },
    { wch: 12 },
    { wch: 8 },
    { wch: 8 },
    { wch: 10 },
    { wch: 30 },
    { wch: 42 },
    { wch: 15 },
    { wch: 34 },
  ];
  XLSX.utils.book_append_sheet(wb, wsItinerary, 'Itinerary');

  /* --- Sheet 2: Wallet --- */
  const pocketById = new Map((trip.budgetPockets ?? []).map((p) => [p.id, p]));
  const walletAoA: (string | number)[][] = [
    ['WALLET SUMMARY', '', '', '', ''],
    ['Metric', 'Amount (IDR)', 'Notes', '', ''],
    ['Combined Collected (Pool + Fundraise)', ledger.combinedCollected, '', '', ''],
    ['Combined Net Cash Balance', ledger.combinedNetBalance, 'Inflows minus all expenses', '', ''],
    ['Unallocated Cash (Ready to Assign)', ledger.combinedUnallocated, `Pool Rp ${formatIDRNumber(ledger.poolUnallocated)} + Fundraise Rp ${formatIDRNumber(ledger.fundraiseUnallocated)}`, '', ''],
    ['Pool Target', ledger.poolTarget, `${ledger.activeMemberCount} active riders`, '', ''],
    ['Pool Collected (IN)', ledger.poolCollected, `${ledger.poolProgressPct}% of target`, '', ''],
    ['Pool Allocated to Pockets', ledger.poolAllocated, `Free: Rp ${formatIDRNumber(ledger.poolUnallocated)}`, '', ''],
    ['Pool Direct Spent (OUT)', ledger.poolSpent, '', '', ''],
    ['Fundraise Target', ledger.fundraiseTarget, '', '', ''],
    ['Fundraise Collected (IN)', ledger.fundraiseCollected, `${ledger.fundraiseProgressPct}% of goal`, '', ''],
    ['Fundraise Allocated to Pockets', ledger.fundraiseAllocated, `Free: Rp ${formatIDRNumber(ledger.fundraiseUnallocated)}`, '', ''],
    ['Total Spent (Direct + Pockets)', ledger.totalSpent, '', '', ''],
    ['Pending Reimburse', ledger.pendingReimburseTotal, `${ledger.pendingReimburseItems.length} unpaid`, '', ''],
    [],
    ['BUDGET POCKETS (ALLOCATED ENVELOPES)', '', '', '', ''],
    ['Pocket', 'From Pool (IDR)', 'From Fundraise (IDR)', 'Spent (IDR)', 'Remaining (IDR)'],
    ...(ledger.pockets.length > 0
      ? ledger.pockets.map((p) => [
          `${p.pocket.emoji} ${p.pocket.name}`,
          p.allocatedFromPool,
          p.allocatedFromFundraise,
          p.spent,
          p.remaining,
        ])
      : [['No custom pockets created yet', 0, 0, 0, 0]]),
    [],
    ['MEMBER POOL CONTRIBUTIONS', '', '', '', ''],
    ['Member', 'Status', 'Paid (IDR)', 'Remaining (IDR)', ''],
    ...ledger.memberContributions.map((c) => [
      c.member.name,
      c.member.status,
      c.paidPool,
      c.remainingPool,
      '',
    ]),
    [],
    ['FUNDRAISE LOG (IN)', '', '', '', ''],
    ['Date', 'Title', 'Amount (IDR)', 'Note', ''],
    ...trip.transactions
      .filter((tx) => tx.pocket === 'fundraise' && tx.direction === 'in')
      .map((tx) => [tx.date, tx.title, tx.amount, tx.note || '', '']),
    [],
    ['EXPENSES & REIMBURSEMENTS (OUT)', '', '', '', ''],
    ['Date', 'Title', 'Amount (IDR)', 'Pocket / Status', ''],
    ...trip.transactions
      .filter((tx) => tx.direction === 'out' && (tx.pocket === 'pool' || tx.pocket === 'fundraise'))
      .map((tx) => {
        const payer = tx.paidByMemberId ? memberById.get(tx.paidByMemberId)?.name : undefined;
        const customPocket = tx.budgetPocketId ? pocketById.get(tx.budgetPocketId) : undefined;
        const sourceLabel = customPocket
          ? `${customPocket.emoji} ${customPocket.name}`
          : tx.pocket.toUpperCase();
        const status = tx.paidOutOfPocket
          ? `${sourceLabel} · Paid by ${payer ?? 'Crew'} (${tx.reimbursed ? 'Settled' : 'Unpaid'})`
          : `${sourceLabel} · Direct`;
        return [tx.date, tx.title, tx.amount, status, ''];
      }),
  ];

  const wsWallet = XLSX.utils.aoa_to_sheet(walletAoA);
  wsWallet['!cols'] = [{ wch: 28 }, { wch: 22 }, { wch: 22 }, { wch: 24 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsWallet, 'Wallet');

  /* --- Sheet 3: Crew & Stay --- */
  const crewAoA: (string | number)[][] = [
    ['CREW ROSTER', '', '', ''],
    ['Name', 'Role', 'Status', ''],
    ...trip.members.map((m) => [m.name, m.role, m.status, '']),
    [],
    ['TRANSPORT PODS', '', '', ''],
    ['Mode', 'Pod', 'Meta', 'Assigned Riders'],
    ...trip.transportPods.map((pod) => {
      let assigned = pod.slots
        .map((s) => `${s.role}: ${s.memberId ? memberById.get(s.memberId)?.name ?? 'Open' : 'Open'}`)
        .join(' | ');
      if (pod.mode === 'car') {
        const seats = normalizeCarSeats(pod);
        const nameOf = (id?: string) => (id ? memberById.get(id)?.name ?? id : 'Open');
        assigned = [
          `Driver: ${nameOf(seats.frontRight)}`,
          `Front Left: ${nameOf(seats.frontLeft)}`,
          `Middle: ${seats.middle.length > 0 ? seats.middle.map((id) => nameOf(id)).join(', ') : 'Empty'}`,
          `Back: ${seats.back.length > 0 ? seats.back.map((id) => nameOf(id)).join(', ') : 'Empty'}`,
        ].join(' | ');
      }
      return [pod.mode.toUpperCase(), pod.label, pod.meta || '', assigned];
    }),
    [],
    ['HOMESTAYS & ROOMS', '', '', ''],
    ['Stay', 'Schedule', 'Room', 'Guests'],
    ...trip.stays.flatMap((stay) =>
      stay.rooms.map((room) => [
        `${stay.name} (${stay.city})`,
        `${stay.checkIn} -> ${stay.checkOut}`,
        `${room.label}${room.hasExtraBed ? ' + Extra bed' : ''}`,
        room.memberIds.map((id) => memberById.get(id)?.name ?? id).join(', '),
      ]),
    ),
  ];

  const wsCrew = XLSX.utils.aoa_to_sheet(crewAoA);
  wsCrew['!cols'] = [{ wch: 26 }, { wch: 26 }, { wch: 24 }, { wch: 44 }];
  XLSX.utils.book_append_sheet(wb, wsCrew, 'Crew & Stay');

  return wb;
}

export async function exportTripToExcel(trip: SharedTrip): Promise<void> {
  const [XLSX, wb] = await Promise.all([import('xlsx'), buildTripWorkbook(trip)]);
  const safeCode = trip.code.toLowerCase().replace(/[^a-z0-9-]/g, '') || 'trip';
  XLSX.writeFile(wb, `gaskeun-${safeCode}.xlsx`);
}
