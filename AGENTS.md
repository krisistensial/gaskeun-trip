# AGENTS.md — GASKEUN! Project Rules & Architecture Guide

> **App:** GASKEUN! Group Travel PWA (`vite-plugin-pwa`, base path `/gaskeun-trip/`, deployed via GitHub Pages).
> **Pilot Trip:** `SOLO-27` (Solo – Jogja, Feb 11–14, 2027 · Default Crew PIN: `1234`).
> **Current Baseline:** MVP Complete (Sprints 1–4) + HP Field-Test Polish Batches 1–7.

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
  - **Layer 1 (`SharedTrip`):** Shared itinerary, crew, transport pods, stays, `pool`/`fundraise` transactions, `groupPrep`, and shared media URLs. Synced via Supabase RLS RPC + offline mutation queue (`src/services/supabaseSync.ts`) and Layer-1 JSON backup.
  - **Layer 2 (`LocalPersonalData`):** Strictly local per-device `personalTransactions`, `personalPrep`, local cover blob cache, and pending local album photos. Never overwritten by shared sync or JSON import.
- **Permissions (`src/services/permissions.ts`):** Host (`isCreator`), host-designated `editorMemberIds`, or 4-digit Crew PIN SHA-256 unlock grant shared edit access (`canEditTrip`). Personal Wallet & Personal Prep remain PIN-free for all crew.
- **Unified Ledger (`src/services/ledger.ts`):** Single IN/OUT ledger across `pool`, `fundraise`, and `personal` pockets with anti-double-deduction for out-of-pocket reimbursements.

---

## 3. Field-Test Polish Patterns (Batches 1–7)

- **Access Gate & Per-Member Passcode Guard (Batch 7 — `WhoAreYouScreen.tsx`, `TripMenuSheet.tsx`, `permissions.ts`):**
  - Optional 4-digit `passcode?: string` per `TripMember` in Layer 1 (`SharedTrip.members`).
  - Subtle `Lock` badge on protected crew cards; `Join as [Name]?` verifies 4-digit passcode (numeric keypad, masked with eye toggle, shake + error on mismatch) or offers optional first-time lock for unprotected profiles.
  - Self-service **`My Passcode`** (set/update/remove after verifying current PIN) and Host-only **`Crew Access & Editors`** (`Set PIN` / confirmed `Reset PIN`). Auto-restored sessions never re-prompt for PIN until `Switch Profile`.
- **Home (`src/features/home/`):**
  - **Large Editorial Hero Countdown (Batch 7):** Boxless magazine-scale Playfair serif countdown elevated & centered over hero photo (`DAYS` `clamp(112px, 34vw, 156px)`, `HOURS/MINS/SECS` `clamp(34px, 10vw, 46px)`), crisp white text + soft dark scrim over custom cover photos (`home-hero--photo`) and deep Matcha `#1E3A32` without a cover photo.
  - KAI 3–2 / 2–2 Train Seat Map with one-tap seat swap (`TrainSeatMap.tsx`), editable Crew/Pods/Stays/Train Pass.
  - **Full-Bleed Photo Cards (Batch 6):** `Now` Spotlight card renders stop photos as `position: absolute; inset: 0; object-fit: cover` with dark gradient scrim (`z-index: 1`) and high-contrast white typography + frosted glass `Route` pill (`z-index: 2`) — never increases card height/width.
- **Plan (`src/features/plan/`):**
  - Frozen header + 60fps rAF **Dotted Circular C-Arc Trail** (`arcMath.ts`) with magnetic center snap & depth scale/dimming, 3-column Table + 3-sheet `.xlsx` export (`excelExporter.ts`), unified `RouteMapView` (Leaflet + offline SVG trail), seamless `contentEditable` notes, and **Full-Bleed Photo Cards** matching non-photo card dimensions.
- **Universal Photo Cropper & Google Drive Shared Media (Batches 5–6):**
  - `src/services/photoCrop.ts` + `PhotoCropperSheet.tsx`:
    - **Original Passthrough (Zero Quality Loss):** In `album` preset + `Original` ratio with `zoom === 1`, `pan === 0`, `rotation === 0`, and file size `<= 12 MB`, skips Canvas re-encoding and uploads native full-res pixels directly via `uploadSharedImage`. Falls back to `maxDim: 4096, quality: 0.94` if `> 12 MB`.
    - **High-Res Canvas Crop:** Cropped/zoomed/rotated album photos preserve native source resolution up to `4096 px` longest side (never upscaling) with `imageSmoothingQuality = 'high'` and JPEG `0.94`.
  - `src/services/gdriveAlbum.ts` + `src/services/mediaUploader.ts` + `scripts/gdrive-apps-script.gs`:
    - Non-album shared assets use `[ASSET-<kind>]` prefix so they stay out of the Album gallery.
    - Frontend constructs sharp `w1200` grid URLs, `w4096` Lightbox URLs, and direct `uc?export=download` download URLs from Drive file IDs without requiring Apps Script re-deploy.
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
