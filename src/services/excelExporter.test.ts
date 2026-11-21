import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import seedData from '../data/seed-solo-jogja-2027.json';
import type { SharedTrip } from '../types/trip';
import { buildTripWorkbook, notesToPlainText, stripHtmlToPlainText } from './excelExporter';

const pilotTrip = seedData as unknown as SharedTrip;

describe('Excel Exporter (.xlsx) — 3 Sheets & HTML Stripping', () => {
  it('strips HTML tags cleanly into readable plain text', () => {
    const html = '<h2>Morning Loop</h2><p>Meet at <b>07:15</b> &amp; bring <i>cash</i><br/>Rp 10k</p>';
    expect(stripHtmlToPlainText(html)).toBe('Morning Loop\nMeet at 07:15 & bring cash\nRp 10k');
  });

  it('formats RichNoteBlock checklist & bullets cleanly for Excel cells', () => {
    const text = notesToPlainText([
      { id: '1', kind: 'h2', text: '<strong>Checklist</strong>' },
      { id: '2', kind: 'checklist', text: 'Top up <em>5 bikes</em>', checked: true },
      { id: '3', kind: 'checklist', text: 'Order Soto Triwindu', checked: false },
      { id: '4', kind: 'bullet', text: 'Bring rain poncho' },
    ]);
    expect(text).toBe('Checklist\n[x] Top up 5 bikes\n[ ] Order Soto Triwindu\n- Bring rain poncho');
  });

  it('builds a valid 3-sheet workbook (Itinerary, Wallet, Crew & Stay) offline', () => {
    const wb = buildTripWorkbook(pilotTrip);
    expect(wb.SheetNames).toEqual(['Itinerary', 'Wallet', 'Crew & Stay']);

    const itineraryRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Itinerary']);
    expect(itineraryRows.length).toBe(pilotTrip.itinerary.length);
    const ganjuran = itineraryRows.find((r) => r.Title === 'Goa Maria Ganjuran');
    expect(ganjuran).toBeDefined();
    expect(ganjuran?.Start).toBe('08:30');

    const walletRows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Wallet'], { header: 1 });
    const flatWallet = walletRows.flat().map(String);
    expect(flatWallet).toContain('Pool Collected (IN)');
    expect(flatWallet).toContain('2480000');
    expect(flatWallet).toContain('Fuel 5 Bikes (Solo)');

    const crewRows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Crew & Stay'], { header: 1 });
    const flatCrew = crewRows.flat().map(String);
    expect(flatCrew).toContain('Sans Stay Sheva Solo (Surakarta)');
    expect(flatCrew).toContain('Bedja Homestay Jogja (Yogyakarta)');
  });
});
