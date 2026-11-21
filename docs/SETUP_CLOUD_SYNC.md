# Cloud Sync & Google Drive Album Setup (<= 5 Minutes)

GASKEUN! runs **100% offline locally out of the box** using IndexedDB. Follow these two optional steps when you want live multi-device sync across your crew and shared Google Drive photo uploads.

---

## Part 1 — Supabase Free Tier (Live Multi-Device Sync)

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New Query**, paste the full contents of [`scripts/supabase-schema.sql`](../scripts/supabase-schema.sql), and click **Run**.
   - Creates table `shared_trips` with Row Level Security (RLS).
   - Allows read-only `SELECT` via `trip_code` and restricts all `INSERT`/`UPDATE` writes to the PIN-verified RPC `create_or_mutate_trip`.
3. Copy your **Project URL** and **Anon Public Key** from **Project Settings → API**.
4. **Local development:** create `.env.local` in the repo root:
   ```env
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
   ```
5. **GitHub Pages automatic deploy:** add those two keys under **GitHub Repo → Settings → Secrets and variables → Actions** (`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`). The workflow `.github/workflows/deploy.yml` injects them automatically during `npm run build`.

> **Privacy Guarantee:** Layer 2 (`local_personal`: local hero cover photo, Personal Wallet, Personal Prep, active profile) is **never** sent to Supabase and **never** overwritten during sync pulls.

---

## Part 2 — Google Drive Shared Album Bridge (Apps Script)

1. Create a shared folder in Google Drive and copy its **Folder ID** from the URL (`https://drive.google.com/drive/folders/<FOLDER_ID>`).
2. Open [script.google.com](https://script.google.com) → **New Project** and paste [`scripts/gdrive-apps-script.gs`](../scripts/gdrive-apps-script.gs).
3. Update `FOLDER_ID` and `CREW_PIN` (matching your trip's 4-digit Crew PIN).
4. Click **Deploy → New Deployment → Web App**:
   - **Execute as:** Me
   - **Who has access:** Anyone
5. Copy the deployed **Web App URL** (`https://script.google.com/macros/s/.../exec`).
6. Inside GASKEUN!, tap **`•••` → `Trip Settings` → `Album & Drive Sync`** and paste your **Google Drive Folder URL** and **Apps Script Sync URL**.

> If left blank (or while offline on the train), uploads automatically save locally to IndexedDB with a subtle `Local` badge so the Masonry Gallery always works without errors.
