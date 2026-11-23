# AGENTS.md — GASKEUN! Project Rules & Architecture Guide

> **App:** GASKEUN! Group Travel PWA (`vite-plugin-pwa`, dynamic base path: `/` on Vercel via `process.env.VERCEL` or `VITE_BASE_PATH`, `/gaskeun-trip/` on GitHub Pages; SPA fallback in `vercel.json`).
> **Pilot Trip:** `SOLO-27` (Solo – Jogja, Feb 11–14, 2027 · Default Crew PIN: `1234`).
> **Current Baseline:** MVP Complete (Sprints 1–4) + HP Field-Test Polish Batches 1–8.9 (UI/UX, Auto-Swap & Vercel).

---

## 1. Non-Negotiable Design Rules (Read `DESIGN.md` First)

- **Visual DNA:** Light Liquid Glass (Option 2A Crystal Liquid) floating over a soft **Ambient Mesh Canvas** (`#F6F8F5` + blurred Matcha/Sunlight/Mint blobs), Matcha/Sage palette (`#4A7468` / `#2D4A42` / `#E3EDE6`), soft squircles (`24–32px`), self-hosted offline fonts (`Fredoka`, `Plus Jakarta Sans`, `Playfair Display`).
- **100% English UI Copy:** Zero bilingual mixing and zero system-jargon strings (never print labels like "Day-H Mode", "Layer 1/2", "Offline Fallback", "1-Tap GMaps", or "Edit Mode").
- **Anti-Chrome & Scale Contrast:**
  - **Zero Top Bar** — hero photography runs edge-to-edge under the status bar.
  - **Floating Glass Dock** — 5 single-word tabs (`Home`, `Plan`, `Wallet`, `Album`, `Prep`); auto-hides whenever a sheet, dialog, lightbox, or detail screen is active via `OverlayContext` (`useRegisterOverlay`).
  - **No Generic Widgets** — avoid HTML `<select>` dropdowns when avatar/pill pickers fit, avoid uniform card walls, and use crisp scale contrast.
- **Portaled Overlays:** Modals, sheets, lightboxes, and toasts render via `createPortal(..., document.body)` so fixed positioning is never trapped by ancestor `backdrop-filter` / `transform`.

---

## 2. Architecture & Data Isolation

- **Dual-Layer IndexedDB (`src/services/db.ts`):**
  - **Layer 1 (`SharedTrip`):** Shared itinerary, crew (including optional 4-digit `passcode`), transport pods, stays, `pool`/`fundraise` transactions, `groupPrep`, `contentIdeas`, shared Home Hero `coverPhotoUrl`, and shared UI asset URLs. Synced across devices via Supabase RLS RPC, Realtime (`postgres_changes` on `shared_trips`), mount/focus/visibility auto-pull, manual `Sync` pill, and offline mutation queue (`src/services/supabaseSync.ts`) plus Layer-1 JSON backup.
  - **Layer 2 (`LocalPersonalData`):** Strictly local per-device `personalTransactions`, `personalPrep`, and pending local album photos. Never overwritten by shared sync or JSON import.
- **Permissions (`src/services/permissions.ts`):** Host (`isCreator`), host-designated `editorMemberIds`, or 4-digit Crew PIN SHA-256 unlock grant shared edit access (`canEditTrip`). Personal Wallet & Personal Prep remain PIN-free for all crew.
- **Unified Ledger (`src/services/ledger.ts`):** Single IN/OUT ledger across `pool`, `fundraise`, and `personal` pockets with anti-double-deduction for out-of-pocket reimbursements.

---

## 3. Field-Test Polish Patterns (Batches 1–8)

- **Content Ideas & Amber Plan Rundown Cards (Batch 8 — `AlbumScreen.tsx`, `ContentIdeaSheet.tsx`, `PlanScreen.tsx`, `contentIdeas.ts`):**
  - Layer-1 `SharedTrip.contentIdeas?: ContentIdea[]` (minimalist schema: `title`, `referenceUrl`, `platform`, `notes?`, `thumbnailUrl?`, `status: 'to-shoot' | 'shot'`, `showInPlan`, `dayId?`, `time?`, `createdBy`, `createdAt`).
  - `Album` header includes a `Photos | Ideas` segmented pill switcher (no new Dock icon). `Ideas` shows `All | To Shoot | Shot` filters, minimalist cards with `Watch ↗` + 1-tap `To Shoot` ↔ `Shot ✓` toggle, and `+ Idea` modal (`ContentIdeaSheet`) with auto platform detection, YouTube auto-thumbnails, optional screenshot upload via `uploadSharedImage(..., { kind: 'idea' })` (stored in Supabase `trip-assets` bucket, never Google Drive), `Show in Plan Rundown` Day/Time picker, red `Delete` on left, and Matcha `Save Idea` on right.
  - Ideas with `showInPlan: true` merge chronologically into `Plan → Trail` and `Plan → Table` (with a `Content` filter pill) styled in distinct **Warm Amber Glass** (`--accent-amber`) with Amber `TrailDot`, warm scrim if thumbnail exists, direct `Watch ↗`, and two-way synced `To Shoot` / `Shot ✓` toggle.
- **Access Gate & Per-Member Passcode Guard (Batch 7 — `WhoAreYouScreen.tsx`, `TripMenuSheet.tsx`, `permissions.ts`):**
  - Optional 4-digit `passcode?: string` per `TripMember` in Layer 1 (`SharedTrip.members`).
  - Subtle `Lock` badge on protected crew cards; `Join as [Name]?` verifies 4-digit passcode (numeric keypad, masked with eye toggle, shake + error on mismatch) or offers optional first-time lock for unprotected profiles.
  - Self-service **`My Passcode`** (set/update/remove after verifying current PIN) and Host-only **`Crew Access & Editors`** (`Set PIN` / confirmed `Reset PIN`). Auto-restored sessions never re-prompt for PIN until `Switch Profile`.
- **Home (`src/features/home/`):**
  - **Large Editorial Hero Countdown (Batch 7):** Boxless magazine-scale Playfair serif countdown elevated & centered over hero photo (`DAYS` `clamp(112px, 34vw, 156px)`, `HOURS/MINS/SECS` `clamp(34px, 10vw, 46px)`), crisp white text + soft dark scrim over custom cover photos (`home-hero--photo`) and deep Matcha `#1E3A32` without a cover photo.
  - KAI 3–2 / 2–2 Train Seat Map with one-tap seat swap (`TrainSeatMap.tsx`), editable Crew/Pods/Stays/Train Pass.
  - **Full-Bleed Gradient Photo Cards & Zero Boxed Inset Photos (Batches 6, 8.7 & 8.9):** `Now` Spotlight, all `Plan` stop states, `TRAIN PASS` Home tile, `Train Pass` Detail sheet, and `Stay / Homestay` cards render photos edge-to-edge (`position: absolute; inset: 0; object-fit: cover; z-index: 0`) with smooth directional/diagonal gradient scrims + CSS `mask-image` blending so foreground typography stays crisp, card dimensions never expand, and zero boxed inset photos exist. Cover uploads in `PlanDetailEditScreen` show instant preview and auto-persist on existing stops (`onQuickPersistCover`) as well as on `Save Stop`.
  - **Dynamic Home `ALBUM` Collage (Batch 8.9 — `HomeScreen.tsx`, `home.css`, `App.tsx`):** Equal-height paired with `TRAIN PASS` (`align-items: stretch; min-height: 126px`), rendering up to 4 latest non-asset Album photos (preloaded from cached/live Google Drive + local Album photos) as an adaptive full-bleed mosaic (`1` full, `2` split, `3` 1+2 mosaic, `4` 2×2 grid) with soft top-left gradient scrim and count pill, falling back to the fanned polaroid empty state (`"Tap to add photos"`).
  - **Auto-Swap Motorbikes & Anti-Duplicate Stay Rooms (Batch 8.9 — `src/services/crewSwap.ts`):** Selecting an already-assigned rider in `Assign Rider` (`HomeScreen.tsx`) automatically swaps them with the current slot's rider (across bikes or opposite slot on the same bike) and shows a clear swap/move toast without ever creating duplicate assignments. `StayEditorSheet` (`CrewEditors.tsx`) uses `toggleStayRoomMember` so adding a crew member to a room automatically removes them from any other room in the same homestay.
- **Plan (`src/features/plan/`):**
  - Frozen header + 60fps rAF **Dotted Circular C-Arc Trail** (`arcMath.ts`) with magnetic center snap & depth scale/dimming, 3-column Table + 3-sheet `.xlsx` export (`excelExporter.ts`), unified `RouteMapView` (Leaflet + offline SVG trail), seamless `contentEditable` notes, and **Full-Bleed Photo Cards** matching non-photo card dimensions.
- **Universal Photo Cropper & Google Drive Shared Media (Batches 5–6):**
  - `src/services/photoCrop.ts` + `PhotoCropperSheet.tsx`:
    - **Original Passthrough (Zero Quality Loss):** In `album` preset + `Original` ratio with `zoom === 1`, `pan === 0`, `rotation === 0`, and file size `<= 12 MB`, skips Canvas re-encoding and uploads native full-res pixels directly via `uploadSharedImage`. Falls back to `maxDim: 4096, quality: 0.94` if `> 12 MB`.
    - **High-Res Canvas Crop:** Cropped/zoomed/rotated album photos preserve native source resolution up to `4096 px` longest side (never upscaling) with `imageSmoothingQuality = 'high'` and JPEG `0.94`.
  - `src/services/gdriveAlbum.ts` + `src/services/mediaUploader.ts` + `supabase/schema.sql` + `scripts/gdrive-apps-script.gs`:
    - **Strict Channel Isolation & Resilient Shared Sync (Batches 8.5, 8.7–8.9):** Google Drive Apps Script is exclusively for `Album → Photos` (`kind: 'album'`). All UI assets (`hero`, `plan`, `stay`, `train`, `avatar`, `idea`) NEVER touch Google Drive — they convert base64 synchronously via `Uint8Array` -> `Blob` and upload to Supabase Storage public bucket `trip-assets` with unique filenames (`{tripCode}/{kind}-{timestamp}-{rand}.jpg`, `upsert: false`), returning a diagnostic `reason` when falling back to quota-safe compressed `dataUrl` (`<= 120 KB` cover / `<= 40 KB` avatar). Home Hero cover (`SharedTrip.coverPhotoUrl`, aligned with legacy `heroCoverUrl`) lives strictly in Layer 1 (`SharedTrip`), never in private Layer 2 storage, and syncs across devices automatically on mount, tab `visibilitychange`/`focus`, online reconnect, and Supabase Realtime (`postgres_changes` on `shared_trips`). `pullLatestSharedTrip` isolates offline-queue flush failures so they never block `SELECT` pulls, skips pre-pull flush on manual `force` sync, falls back from missing RPC (`PGRST202`) to direct `upsert` on push, and surfaces real diagnostic `errorMessage` strings in toasts and the `Cloud Sync` row of `TripMenuSheet` (alongside local-time last-sync status and the **`Sync`** pill). `Export Shared Backup (.json)` clarifies `"Personal wallet & prep stay private"`.
    - Frontend constructs sharp `w1200` grid URLs, `w4096` Lightbox URLs, and direct `uc?export=download` download URLs from Drive file IDs without requiring Apps Script re-deploy.
- **Calm Static `Now` Indicator (Batch 8.5):** `TrailDot` active state and `Now` Spotlight badge use a calm static Matcha `#4A7468` dot with a soft halo ring (no infinite pulsing/blinking animations).
- **Seamless Album Header & Dynamic Alpha-Mask Horizontal Sliders (Batch 8.6 — `useHorizontalScrollFade.ts`, `AlbumScreen.tsx`, `PlanScreen.tsx`):**
  - `Album → Photos` uses 3 non-colliding rows: Header (`Album` + `Photos | Ideas`), full-width edge-to-edge day filter strip (`All`, `Day 1`–`Day 4`), and a unified Liquid Glass Drive Status & Actions capsule (`Google Drive`, inline `Drive ↗` link, synced count, circular `RefreshCw` orb, and Matcha `Upload` CTA).
  - Horizontal pill sliders (`Album` day/idea filters & `Plan` `DayPill`/type filters) attach `useHorizontalScrollFade` (`data-fade="none | left | right | both"`) with pure CSS `mask-image` alpha fade so edges melt invisibly into the Ambient Mesh canvas.
- **Prep Safety Guard (Batch 6 — `src/features/prep/`):**
  - **Read-Only Default** on both `Personal` & `Group`: items display as non-editable text with only the checkbox active; no inline delete button or open quick-add box.
  - **`Edit` / `Done` Mode** (header toggle; always available on `Personal`, editor-only on `Group`) reveals `+ Add Item`, row Pencil (`Edit Prep Item` sheet), and row Trash icons.
  - **2-Step Verification** (`prepSafety.ts`): Delete requires Step 1 item preview (`Continue to Delete`) -> Step 2 explicit checkbox (`I confirm removing this item` + `Yes, Delete Permanently`). Editing an existing item requires Step 1 non-empty change -> Step 2 `Before -> After` diff review (`Confirm & Save`).
  - **Multi-Step Undo:** Independent 20-step LIFO stacks for `Personal` and `Group`, accessible via header `Undo` button and a 5-second floating `Undo` toast after every mutation.

---

## 4. Verification Before Commit

Always run both checks cleanly before committing:
```bash
npm test && npm run build
```
