/* ==========================================================================
   GASKEUN! Multi-Trip & Unified Ledger TypeScript Schema
   ========================================================================== */

export type DockTabId = 'home' | 'plan' | 'wallet' | 'album' | 'prep';

export type MemberRole = 'driver' | 'passenger';
export type MemberStatus = 'confirmed' | 'tentative';

export interface TripMember {
  id: string;
  name: string;
  initials: string;
  avatarBg: string;
  avatarColor: string;
  avatarDataUrl?: string;
  role: MemberRole;
  status: MemberStatus;
  isCreator?: boolean;
}

export interface TripDay {
  id: string;
  date: string;       // ISO YYYY-MM-DD (empty string for Ideas bucket)
  dayLabel: string;   // e.g. "Thu", "Fri", "Ideas"
  dateNum: string;    // e.g. "11", "12", ""
  city: string;
  isIdeas?: boolean;
}

export type PlanItemType = 'place' | 'transit' | 'activity';
export type PlanItemStatus = 'done' | 'active' | 'upcoming' | 'idea';

export interface RichNoteBlock {
  id: string;
  kind: 'h1' | 'h2' | 'paragraph' | 'bullet' | 'checklist';
  text: string;
  checked?: boolean;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  color?: string;
}

export interface RouteTarget {
  title: string;
  subtitle?: string;
  address?: string;
  parkingNote?: string;
  mapsUrl?: string;
  coords?: [number, number];
  dayLabel?: string;
  dayItems?: PlanItem[];
  focusedItemId?: string;
}

export interface PlanItem {
  id: string;
  dayId: string;
  type: PlanItemType;
  title: string;
  startTime: string;      // "08:30"
  endTime?: string;       // "11:30"
  locationHint: string;
  address: string;
  parkingNote?: string;
  mapsUrl?: string;
  mapsVerified?: boolean;
  coords?: [number, number];
  /** 0 = Sun, 1 = Mon, ..., 6 = Sat */
  closedDays?: number[];
  specialScheduleNote?: string;
  costEstimate?: number;
  status: PlanItemStatus;
  coverUrl?: string;
  notes: RichNoteBlock[];
  /** Seamless single-flow HTML notes edited via contentEditable */
  notesHtml?: string;
}

export type TransportMode = 'bike' | 'train' | 'car';

export interface TransportSlot {
  role: string; // e.g. "Driver", "Rider", "Seat 4A"
  memberId: string | null;
  lockedPassenger?: boolean;
}

export interface TrainCarLayout {
  format: '3-2' | '2-2';
  carNumber: string;
  startRow: number;
  endRow: number;
  facingRows: boolean;
}

export interface TransportPod {
  id: string;
  mode: TransportMode;
  label: string;
  vehicleModel?: string; // e.g. "Vario 125", "Scoopy", "Beat"
  roleNote?: string;     // e.g. "Lead", "Sweep"
  meta?: string;         // legacy display fallback
  trainLayout?: TrainCarLayout;
  slots: TransportSlot[];
}

export interface StayRoom {
  id: string;
  label: string;
  memberIds: string[];
  hasExtraBed?: boolean;
}

export interface StayLodging {
  id: string;
  name: string;
  city: string;
  checkIn: string;
  checkOut: string;
  address: string;
  mapsUrl?: string;
  photoDataUrl?: string;
  rooms: StayRoom[];
}

/* --- Unified Ledger Transaction Contract (IN / OUT) --- */

export type TransactionDirection = 'in' | 'out';
export type TransactionPocket = 'pool' | 'fundraise' | 'personal';

export interface Transaction {
  id: string;
  tripId: string;
  direction: TransactionDirection;
  pocket: TransactionPocket;
  title: string;
  /** Positive integer in IDR */
  amount: number;
  /** ISO date or timestamp */
  date: string;
  /** Required for Pool IN deposits */
  memberId?: string;
  /** True when an Expense OUT was fronted by a crew member */
  paidOutOfPocket?: boolean;
  paidByMemberId?: string;
  /** Flipping to true marks reimbursement settled WITHOUT deducting balance again */
  reimbursed?: boolean;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PrepTask {
  id: string;
  title: string;
  done: boolean;
  assigneeId?: string;
  category?: string;
}

export interface FinanceConfig {
  poolTargetPerPerson: number;
  fundraiseTarget: number;
  includeTentative: boolean;
  currency: 'IDR';
  minimumDpPerPerson?: number;
}

export interface TrainPassInfo {
  trainName: string;
  outboundCode: string;
  outboundRoute: string;
  outboundTime: string;
  outboundDate: string;
  returnRoute: string;
  returnTime: string;
  returnDate: string;
  trainPhotoDataUrl?: string;
}

export interface AlbumPhoto {
  id: string;
  tripId: string;
  dayId: string;
  dayLabel: string;
  caption: string;
  uploaderName: string;
  /** Data URL or remote thumbnail/image URL (w1200 for grid) */
  url: string;
  /** Higher-resolution URL (w2000 for Lightbox) */
  fullUrl?: string;
  source: 'drive' | 'local';
  createdAt: string;
}

export interface SharedTrip {
  schemaVersion: number;
  /** Internal seed revision for non-destructive pilot demo upgrades */
  seedVersion?: number;
  id: string;
  code: string;
  title: string;
  subtitle: string;
  startDate: string;
  endDate: string;
  departureAt: string; // ISO with timezone offset
  crewPinHash: string;
  /** Host-designated editors allowed to edit shared trip data without PIN */
  editorMemberIds?: string[];
  /** Shared Home Hero cover photo URL (Drive thumbnail URL or compressed dataUrl) */
  heroCoverUrl?: string;
  albumUrl: string;
  gdriveFolderUrl?: string;
  gdriveScriptUrl?: string;
  trainPass?: TrainPassInfo;
  financeConfig: FinanceConfig;
  members: TripMember[];
  days: TripDay[];
  itinerary: PlanItem[];
  transportPods: TransportPod[];
  stays: StayLodging[];
  /** Only 'pool' and 'fundraise' transactions belong in Layer 1 */
  transactions: Transaction[];
  groupPrep: PrepTask[];
  updatedAt: string;
}

/* --- Layer 2: Strictly Local Personal Data --- */

export interface LocalPersonalData {
  tripId: string;
  activeMemberId: string | null;
  coverBlob?: Blob | null;
  personalTransactions: Transaction[];
  personalPrep: PrepTask[];
  localAlbumPhotos?: AlbumPhoto[];
  updatedAt: string;
}

/* --- Offline Sync Queue Item --- */

export interface OfflineQueueItem {
  id: string;
  tripId: string;
  entity: 'trip' | 'itinerary' | 'transaction' | 'crew' | 'prep';
  action: 'upsert' | 'delete';
  payload: unknown;
  timestamp: string;
}

/* --- Create Trip Input (00c_Create_Trip) --- */

export interface CreateTripInput {
  title: string;
  startDate: string;
  startTime: string;
  endDate: string;
  creatorName: string;
  crewPin: string; // 4 digits
  poolTargetPerPerson?: number;
  fundraiseTarget?: number;
  customCode?: string;
}
