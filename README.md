# GASKEUN! (`gaskeun-trip`)

**Offline-first, mobile-first Liquid Glass group travel hub (PWA).**
Built with Vite, React 19, TypeScript, IndexedDB (`idb`), SheetJS (`xlsx`), Leaflet, Lucide icons, and self-hosted `@fontsource/fredoka` + `@fontsource/plus-jakarta-sans` fonts for full Airplane Mode reliability.

Pilot trip pre-seeded offline: **Solo – Jogja (`SOLO-27`)**, Feb 11–14, 2027 · Default Crew Edit PIN: `1234`.

---

## Key Features (MVP Complete)

- **Access Gate (No Login):** Join via Trip Code (`SOLO-27` or `?code=SOLO-27`), create new multi-day trips (`+ Create New Trip`), pick crew profile, and unlock shared edits with a 4-digit Crew PIN.
- **Adaptive Editorial Home:** Customizable local cover photo (auto-compressed in IndexedDB), live ticking countdown (`DD:HH:MM:SS`) / Live Trail `Now & Up Next` spotlight, Train Pass & Album bento tiles, Top Contributors bar chart, and full **Crew & Stay** manager (Crew CRUD with ledger safety guard, Bikes/Train/Car pods, Homestay rooms).
- **Plan (`Trail | Table`) + Route View:** Vertical Day Pills (+ dashed `+ Day`), inline Rich-Text Notes editor with top-sticky formatting toolbar (`A⋮` color picker, `H1/H2/Aa`, `B/I/U/S`, bullets, persistent checklists), Google Maps link verifier, closed-day conflict alerts, and unified **Route Map** with **SVG Schematic Offline Trail** fallback.
- **Unified Wallet Ledger (`Pool | Fundraise | Spent | Personal`):** Single `Transaction IN/OUT` engine with live tentative-member split toggle (`Valen?`), member deposit history drill-down, anti-double-deduction `Mark Settled ✓`, and PIN-free private **Personal** spend ledger.
- **Album (`07_Album_Gallery`) & Google Drive Bridge:** 2-column Masonry Gallery, day filters, full-screen Lightbox, client-side Canvas JPEG compression (`1600px`), Apps Script Drive upload (`scripts/gdrive-apps-script.gs`), and graceful local IndexedDB fallback.
- **Prep (`08_Prep_Tasks`):** Dual `Personal` (local, PIN-free) & `Group` (shared, PIN-protected with PIC avatar assignment) checklists with fluid progress bar.
- **Offline Export & Optional Cloud Sync:** 3-sheet Excel `.xlsx` export (`Itinerary`, `Wallet`, `Crew & Stay`), Dual-Layer JSON backup/restore, and optional Supabase Free-Tier sync + offline mutation queue (`docs/SETUP_CLOUD_SYNC.md`).

---

## Local Development

```bash
npm install
npm run dev      # http://localhost:5173/gaskeun-trip/
npm test         # Run Vitest suite
npm run build    # Type-check + Vite PWA production build
```

## Optional Cloud Sync & Google Drive Setup
See [docs/SETUP_CLOUD_SYNC.md](docs/SETUP_CLOUD_SYNC.md) (<= 5 minutes).
