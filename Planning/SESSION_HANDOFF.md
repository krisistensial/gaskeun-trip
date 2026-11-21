# `Planning/SESSION_HANDOFF.md` — MVP Completion Handoff

> **Status:** MVP Complete (Sprints 1–4 Delivered & Verified)
> **Live Base Path:** `/gaskeun-trip/` (GitHub Pages via `.github/workflows/deploy.yml`)
> **Pilot Trip:** `SOLO-27` (Solo – Jogja, Feb 11–14, 2027 · Default Crew PIN: `1234`)

---

## Delivered Architecture & Sprints

| Sprint | Scope Delivered | Key Files |
| --- | --- | --- |
| **Design & Planning** | User Research (`v1.1.0`), IA & Flows, Wireframe Spec, Usability Plan, `DESIGN.md` (`v2.0.0` Option 2A Crystal Liquid), `05_Architecture_Auth_Sync_dan_Schema.md`, FigCraft V4 + Additions (`gaskeun-trip.figcraft`) | `DESIGN.md`, `Planning/*`, `gaskeun-trip.figcraft` |
| **Sprint 1 — Foundation** | Vite + React + TS + `vite-plugin-pwa`, self-hosted `@fontsource` fonts, CSS tokens & Ambient Mesh, 11 Atomic components + `ExpandingGlassDock`, Dual-Layer `idb`, Unified Ledger engine, Solo–Jogja pilot seed | `src/styles/*`, `src/components/atoms/*`, `src/components/organisms/ExpandingGlassDock.tsx`, `src/services/db.ts`, `src/services/ledger.ts` |
| **Sprint 2 — Gate & Home** | `00a_Landing_Gate`, `00b_Who_Are_You`, `00c_Create_Trip`, Crew 4-digit PIN auth, Adaptive Home (`Countdown` / `Live Trail`), full Crew/Pod/Stay/Train Pass editors, `TripSettingsSheet`, Layer-1 JSON backup | `src/features/gate/*`, `src/features/home/*`, `src/components/organisms/*` |
| **Sprint 3 — Plan & Wallet** | `Plan` (`Trail | Table`, 3-col Table, `+ Day`), `04_Plan_Detail_Edit` (`A⋮` color, persistent rich-text checklists, Maps validator, closed-day detector), unified `RouteMapView` (Leaflet + SVG Schematic Offline Trail), `Wallet` (4 sub-tabs + `06e_Add_Transaction`, PIN-free Personal) | `src/features/plan/*`, `src/features/wallet/*`, `src/services/planUtils.ts` |
| **Sprint 4 — MVP Closing** | `Prep` (`Personal` local PIN-free & `Group` shared with PIC), `Album` (Masonry Grid, Lightbox, Canvas compression, GDrive Apps Script bridge + local fallback), 3-sheet `.xlsx` exporter, Supabase RLS RPC sync + offline mutation queue, Setup Guide & GitHub Pages CI/CD | `src/features/prep/*`, `src/features/album/*`, `src/services/excelExporter.ts`, `src/services/gdriveAlbum.ts`, `src/services/supabaseSync.ts`, `scripts/*`, `docs/SETUP_CLOUD_SYNC.md` |

---

## Verification Checklist
- **Unit Tests:** `npm test` covers Unified Ledger (`Pool`/`Fundraise` anti-double-deduction + idempotency), `mapsValidator` & `closedDays`, `TripFactory` & Crew PIN SHA-256 verification, 3-sheet `.xlsx` export + HTML stripping, and Layer-1/Layer-2 sync isolation.
- **Offline PWA:** `vite-plugin-pwa` precaches all JS, CSS, self-hosted fonts, and icons (`dist/sw.js`).
- **Cloud Activation (Optional):** Follow `docs/SETUP_CLOUD_SYNC.md` to run `scripts/supabase-schema.sql`, set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in GitHub Actions Secrets, and deploy `scripts/gdrive-apps-script.gs`.
