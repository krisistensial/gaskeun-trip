/* ==========================================================================
   GASKEUN! Multi-Trip & Unified Ledger TypeScript Schema
   ========================================================================== */

export type DockTabId = 'home' | 'plan' | 'wallet' | 'album' | 'prep';

export type TripEditScope = 'crew' | 'plan' | 'wallet' | 'prep';

export type MemberRole = 'driver' | 'passenger';
export type MemberStatus = 'confirmed' | 'tentative';

export interface TripMember {
  id: string;
  name: string;
  initials: string;
  avatarBg: string;
  avatarColor: string;
  avatarDataUrl?: string;
  /** Optional 4-digit numeric passcode protecting this crew profile from accidental login */
  passcode?: string;
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

/**
 * Indonesian Right-Hand Drive (RHD) Car Cabin Seating:
 * - Front row: max 1 person per seat (`frontLeft` Co-Pilot, `frontRight` Driver)
 * - Middle & Back rows: unlimited passenger arrays
 */
export interface CarSeats {
  frontLeft?: string;
  frontRight?: string;
  middle: string[];
  back: string[];
}

export interface TransportPod {
  id: string;
  mode: TransportMode;
  label: string;
  vehicleModel?: string; // e.g. "Vario 125", "Scoopy", "Innova Zenix"
  plateNumber?: string;  // Optional vehicle license plate (e.g. "B 1234 XYZ")
  roleNote?: string;     // e.g. "Lead", "Sweep"
  meta?: string;         // legacy display fallback
  trainLayout?: TrainCarLayout;
  carSeats?: CarSeats;
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
export type FundSourceKind = 'pool' | 'fundraise';

export interface PocketAllocation {
  id: string;
  source: FundSourceKind;
  /** Positive integer in IDR sourced from Pool or Fundraise */
  amount: number;
  note?: string;
  createdAt: string;
}

export interface BudgetPocket {
  id: string;
  name: string;
  emoji: string;
  targetAmount?: number;
  allocations: PocketAllocation[];
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  tripId: string;
  direction: TransactionDirection;
  pocket: TransactionPocket;
  /** Optional custom BudgetPocket ID when an Expense OUT spends from an allocated pocket */
  budgetPocketId?: string;
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
  /** Higher-resolution URL (w4096 for crisp Lightbox) */
  fullUrl?: string;
  /** Original file download URL (Drive uc?export=download or local dataUrl) */
  downloadUrl?: string;
  source: 'drive' | 'local';
  createdAt: string;
}

export type ContentPlatform = 'instagram' | 'tiktok' | 'youtube' | 'pinterest' | 'web';
export type ContentIdeaStatus = 'to-shoot' | 'shot';

export interface ContentIdea {
  id: string;
  title: string;
  referenceUrl: string;
  platform: ContentPlatform;
  notes?: string;
  thumbnailUrl?: string;
  status: ContentIdeaStatus;
  showInPlan: boolean;
  dayId?: string;
  time?: string; // "HH:mm"
  createdBy: string; // memberId
  createdAt: string;
}

export type EditLogCategory =
  | 'plan'
  | 'wallet'
  | 'crew'
  | 'prep'
  | 'album'
  | 'settings'
  | 'general';

export interface EditLogEntry {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  category: EditLogCategory;
  timestamp: string; // ISO
}

export interface OnlinePresenceUser {
  memberId: string;
  name: string;
  initials: string;
  avatarDataUrl?: string;
  avatarBg: string;
  avatarColor: string;
  isGuest?: boolean;
  joinedAt: string;
}

export type ChatMessageKind = 'text' | 'sticker';

export interface ChatReplyPreview {
  id: string;
  senderName: string;
  kind: ChatMessageKind;
  text: string;
  stickerId?: string;
  stickerUrl?: string;
}

export interface ChatMessage {
  id: string;
  tripCode: string;
  senderId: string;
  senderName: string;
  kind: ChatMessageKind;
  text: string;
  stickerId?: string;
  stickerUrl?: string;
  replyTo?: ChatReplyPreview;
  /** Map from emoji character to array of member IDs who reacted */
  reactions: Record<string, string[]>;
  createdAt: string; // ISO
  deleted?: boolean;
}

export interface ChatReadReceipt {
  memberId: string;
  lastReadAt: string; // ISO
  lastMessageId?: string;
}

export interface ChatPollOption {
  id: string;
  label: string;
  voterIds: string[];
}

export interface ChatPoll {
  id: string;
  tripCode: string;
  question: string;
  options: ChatPollOption[];
  allowMultiple?: boolean;
  createdBy: string;
  createdByName: string;
  createdAt: string; // ISO
  closed?: boolean;
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
  /** Host-customizable 4-digit Crew Editing PIN synced in Layer 1 (never leaked in non-host UI) */
  crewEditPin?: string;
  /** Host-designated editors allowed to edit shared trip data (legacy/derived summary) */
  editorMemberIds?: string[];
  /** Granular per-member module edit scopes configured by Host ('crew' | 'plan' | 'wallet' | 'prep') */
  memberPermissions?: Record<string, TripEditScope[]>;
  /** Shared Home Hero cover photo URL (Layer 1 — synced across all crew devices via Supabase) */
  coverPhotoUrl?: string;
  /** Legacy alias for coverPhotoUrl kept for backward compatibility with older snapshots */
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
  /** Virtual fund-accounting envelopes funded by Pool and/or Fundraise allocations */
  budgetPockets?: BudgetPocket[];
  groupPrep: PrepTask[];
  /** Shared trip content inspiration board (IG Reels, TikTok, Shorts, etc.) */
  contentIdeas?: ContentIdea[];
  /** Recent shared edit audit trail (Layer 1, capped at 80 entries, Host-viewable) */
  editLog?: EditLogEntry[];
  /** Fallback synced crew chat cache (primary durable table is `trip_messages` when deployed) */
  chatMessages?: ChatMessage[];
  /** Quick Crew Polls synced via Realtime Broadcast + Layer 1 */
  chatPolls?: ChatPoll[];
  /** Currently pinned message ID in Crew Chat */
  pinnedChatMessageId?: string;
  /** Per-member read receipts (`Seen by`) synced via Realtime Broadcast + Layer 1 */
  chatReadReceipts?: Record<string, ChatReadReceipt>;
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
