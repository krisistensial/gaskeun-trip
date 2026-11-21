# `Planning/05_Architecture_Auth_Sync_dan_Schema.md`

> **Metadata Dokumen**
> * **Nama Produk:** GASKEUN! (`gaskeun-trip`) — *Multi-Trip Group Travel Hub*
> * **Versi Dokumen:** `v1.0.0` (Tahap 5: System Architecture, Auth, Sync & Complete Data Schema)
> * **Stack:** Vite + React + TypeScript + PWA (`vite-plugin-pwa` Workbox) + IndexedDB (`idb`) + Supabase (Optional Live Sync) + SheetJS (`xlsx`) + Leaflet
> * **Visual Contract:** [DESIGN.md](../DESIGN.md) `v2.0.0` — Option 2A Crystal Liquid, Zero Top Bar, 100% English UI Copy, Self-Hosted Fonts (`Fredoka` + `Plus Jakarta Sans`)

---

## 1. Arsitektur Offline-First & Dual-Layer Storage

GASKEUN! berjalan 100% tanpa sinyal internet (mode pesawat di kereta/lembah ziarah) dengan pemisahan ketat antara **Layer 1 (Shared Trip Data)** dan **Layer 2 (Local Personal Data)** di IndexedDB (`gaskeun-db`):

| Layer | Object Store (`idb`) | Isi Data | Perilaku Saat Cloud Sync / Import JSON |
| --- | --- | --- | --- |
| **Layer 1 — Shared Trip** | `shared_trips` + `offline_queue` | Metadata trip, Crew & Transport Pods, Homestay & Room slots, Itinerary Days & Items (Rich-Text Notes + verified Maps links), Reference Ideas, Shared Ledger Transactions (`pool` & `fundraise` `IN`/`OUT`), Group Prep tasks, Album link. | Disinkronkan ke Supabase (bila online) atau ditimpa selektif saat **Import JSON** dari WhatsApp setelah konfirmasi pratinjau. |
| **Layer 2 — Local Personal** | `local_personal` | Foto sampul lokal terkompresi (`coverBlob`, WebP/JPEG `< 300KB`), `personalTransactions` (Kantong 3), `personalPrep` (packing pribadi), `activeMemberId`, preferensi UI lokal. | **ISOLASI MUTLAK.** Tidak pernah dikirim ke cloud, tidak pernah ikut ter-export ke JSON WA, dan tidak pernah tertimpa saat Import JSON. |

### Strategi Offline Queue (`offline_queue`)
Setiap mutasi pada Layer 1 saat perangkat offline:
1. Langsung diterapkan secara optimistik ke `shared_trips` di IndexedDB (UI terasa instan).
2. Dicatat sebagai operasi terurut (`id`, `tripId`, `entity`, `action`, `payload`, `timestamp`) di `offline_queue`.
3. Saat koneksi kembali (`window.online` / reconnect), antrean dikirim secara berurutan ke Supabase (`upsert` dengan `updated_at` last-write-wins per entitas) lalu dibersihkan.

### Self-Hosted Assets & Fonts (Zero CDN Dependency)
* Tipografi `Fredoka` (`500, 600, 700`) dan `Plus Jakarta Sans` (`400, 500, 600, 700`) dibundel lokal menggunakan `@fontsource/fredoka` dan `@fontsource/plus-jakarta-sans` di `src/main.tsx`.
* Tidak ada `<link href="https://fonts.googleapis.com/...">` sehingga teks tetap konsisten 100% saat Airplane Mode.
* `vite-plugin-pwa` melakukan precache seluruh JS, CSS, WOFF2, dan aset statis di `public/assets/`.

---

## 2. Alur Akses Tanpa Login (`Join Code`, `Create Trip`, & `Crew PIN`)

### A. `00a_Landing_Gate` — Join Code
* Tidak ada login email/password. Pengguna cukup memasukkan kode 6–10 karakter (mis. `SOLO-27`) atau membuka tautan undangan `?code=SOLO-27`.
* Validasi mengecek `shared_trips` lokal terlebih dahulu (instan offline), lalu mencoba fetch dari Supabase bila online dan kode belum tersimpan lokal.

### B. `00b_Who_Are_You` — Profile Picker & Optional 4-Digit Crew PIN
* Pengguna memilih profilnya (`Kris`, `Rani`, ..., `Valen?`, atau `Guest`) yang disimpan ke `local_personal.activeMemberId`.
* **Default = View Mode (Aman di Jalan):** Semua anggota dapat melihat jadwal, membuka rute Maps, mencentang `Personal Prep`, dan mencatat `Personal` expenses di HP masing-masing tanpa PIN.
* **Unlock Crew Editing (4-Digit PIN):** Untuk mengubah data bersama (edit itinerary, catat setoran/pengeluaran bersama, ubah formasi motor/kamar), pengguna mengetuk tautan kaca `Unlock Crew Editing (4-digit PIN)`. PIN disimpan dalam bentuk hash SHA-256 ringan (`crewPinHash`) pada metadata trip.

### C. `00c_Create_Trip` — Create New Trip Flow (Addendum)
Saat pengguna mengetuk **`+ Create New Trip`** di `00a_Landing_Gate`:
1. **Required Fields:**
   * `Trip Name` (contoh: `Bali Escape`)
   * `Start Date + Time` (contoh: `2027-05-01T08:00`)
   * `End Date` (contoh: `2027-05-04`) — sistem otomatis men-generate deretan `TripDay` sesuai rentang tanggal.
   * `Creator Name` (otomatis menjadi anggota pertama di `members` dan `activeMemberId`).
   * `4-Digit Crew Edit PIN` (wajib 4 digit angka untuk melindungi suntingan data bersama).
2. **Optional Fields:**
   * `Target Pool per Person` (default `0`, bisa diisi kapan saja).
   * `Target Fundraise` (default `0`).
   * `Custom Trip Code` (mis. `BALI-27`; bila dikosongkan, sistem otomatis menghasilkan kode unik 6 karakter seperti `GSK-492`).
3. **Output:**
   * Menyimpan trip baru ke `shared_trips` (dan ke Supabase jika online).
   * Menampilkan layar/sheet konfirmasi berisi **Trip Code** siap salin + **Invite Link** (`https://<host>/gaskeun-trip/?code=<CODE>`) siap kirim ke WhatsApp.

---

## 3. Kontrak Ledger Keuangan (`Transaction IN / OUT`)

Seluruh arus kas pada **Wallet** menggunakan satu skema transaksi terpadu (`Transaction`) agar transparan, dapat diaudit, dan bebas *double deduction*.

### A. Model Transaksi
```ts
export type TransactionDirection = 'in' | 'out';
export type TransactionPocket = 'pool' | 'fundraise' | 'personal';

export interface Transaction {
  id: string;
  tripId: string;
  direction: TransactionDirection; // 'in' = pemasukan, 'out' = pengeluaran
  pocket: TransactionPocket;       // 'pool' | 'fundraise' | 'personal'
  title: string;
  amount: number;                  // selalu positif (IDR integer)
  date: string;                    // ISO date/timestamp
  memberId?: string;               // wajib untuk Pool IN (penyetor)
  paidOutOfPocket?: boolean;       // khusus Expense OUT (talangan)
  paidByMemberId?: string;         // anggota yang menalangi
  reimbursed?: boolean;            // true jika talangan sudah diganti dari kas
  note?: string;
  createdAt: string;
  updatedAt: string;
}
```

### B. Aturan Kalkulasi Murni (`src/services/ledger.ts`)
1. **Pool Target (`poolTarget`):**
   * Dihitung dari `activeMembers.length * trip.finance.poolTargetPerPerson`.
   * Anggota dengan status `tentative` (mis. `Valen?`) hanya dihitung saat `includeTentative === true` (di-toggle dari Interactive Crew Avatar Strip).
2. **Pool Collected (`poolCollected`):**
   * Penjumlahan seluruh transaksi dengan `pocket === 'pool' && direction === 'in'`.
   * Setoran per anggota (`paidPool` di daftar `Pool` & grafik `Top Contributors`) dihitung dinamis dari agregasi transaksi `Pool IN` milik `memberId` tersebut — tidak pernah menyimpan angka total duplikat yang mudah tidak sinkron.
3. **Fundraise Collected (`fundraiseCollected`):**
   * Penjumlahan seluruh transaksi dengan `pocket === 'fundraise' && direction === 'in'`.
4. **Spent & Remaining Balances (`poolLeft`, `fundraiseLeft`):**
   * `poolSpent` = jumlah semua transaksi `pocket === 'pool' && direction === 'out'`.
   * `fundraiseSpent` = jumlah semua transaksi `pocket === 'fundraise' && direction === 'out'`.
   * `poolLeft = poolCollected - poolSpent`
   * `fundraiseLeft = fundraiseCollected - fundraiseSpent`
5. **Anti Double-Deduction untuk Talangan (`Mark Settled ✓`):**
   * Saat pengeluaran lapangan dicatat dengan `paidOutOfPocket: true`, transaksi `OUT` tersebut **langsung memotong** `poolLeft` atau `fundraiseLeft` satu kali saat dibuat, dan masuk ke daftar `Pending Reimburse` (`reimbursed === false`).
   * Saat bendahara menekan tombol **`Mark Settled ✓`**, sistem **HANYA mengubah `reimbursed: true`** (tanpa membuat transaksi `OUT` kedua dan tanpa memotong saldo lagi).
6. **Drill-Down & CRUD Aman:**
   * Mengetuk baris anggota di sub-tab **`Pool`** membuka *sheet* riwayat cicilan `Pool IN` milik anggota tersebut (kronologis tanggal + nominal + tombol `+ Add Deposit`).
   * Mengetuk transaksi mana pun (`Pool IN`, `Fundraise IN`, `Spent OUT`, maupun `Personal`) membuka mode **Edit** & **Delete** yang selalu dilindungi **`ConfirmDialog`**.

---

## 4. Schema Multi-Trip Lengkap (`src/types/trip.ts`)

Struktur inti yang tersimpan pada `SharedTrip`:
* `id`, `code`, `title`, `subtitle`, `startDate`, `endDate`, `departureAt`, `crewPinHash`, `albumUrl`, `updatedAt`.
* `members: TripMember[]` (`id`, `name`, `initials`, `avatarColor`, `avatarBg`, `role: 'driver' | 'passenger'`, `status: 'confirmed' | 'tentative'`, `isCreator?`).
* `days: TripDay[]` (`id`, `date`, `dayLabel`, `dateNum`, `city`, `isIdeas?`).
* `itinerary: PlanItem[]` (`id`, `dayId`, `type: 'place' | 'transit' | 'activity'`, `title`, `startTime`, `endTime?`, `locationHint`, `address`, `parkingNote?`, `mapsUrl?`, `mapsVerified?`, `coords?: [number, number]`, `closedDays?: number[]`, `costEstimate?`, `notesBlocks: RichNoteBlock[]`, `status: 'planned' | 'done' | 'idea'`).
* `transportPods: TransportPod[]` (`id`, `mode: 'bike' | 'train' | 'car'`, `label`, `slots: { role: string; memberId: string | null; lockedPassenger?: boolean }[]`, `meta?`).
* `stays: StayLodging[]` (`id`, `name`, `city`, `checkIn`, `checkOut`, `address`, `mapsUrl?`, `rooms: { id: string; label: string; memberIds: string[]; hasExtraBed?: boolean }[]`).
* `transactions: Transaction[]` (khusus `pool` & `fundraise`; `personal` disimpan di `Layer 2`).
* `groupPrep: PrepTask[]` (`id`, `title`, `done`, `assigneeId?`, `category?`).
* `financeConfig`: `{ poolTargetPerPerson, fundraiseTarget, includeTentative, currency: 'IDR' }`.

---

## 5. Rencana Integrasi Cloud & Export (Sprint Berikutnya)

* **Supabase Tables (Optional Live Sync):** `trips` (`code PK`, `payload JSONB`, `updated_at TIMESTAMPTZ`) — skema dokumen tunggal per trip agar sinkronisasi offline queue & fallback JSON WA identik 1:1.
* **Export / Import JSON WA:** Tombol ekspor hanya menserialisasi `SharedTrip` (Layer 1) dengan `schemaVersion: 1`.
* **Export Excel (`xlsx`):** Menghasilkan workbook multi-sheet (`Itinerary`, `Wallet_Pool`, `Wallet_Spent`, `Crew_Logistics`) langsung di browser tanpa server.
