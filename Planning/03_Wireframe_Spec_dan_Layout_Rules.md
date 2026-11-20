# `Planning/03_Wireframe_Spec_dan_Layout_Rules.md`

> **Metadata Dokumen**
> * **Nama Produk:** GASKEUN! (`gaskeun-trip`) — *Multi-Trip Group Travel Hub*
> * **Versi Dokumen:** `v1.0.0` (Tahap 3: Ideate & Wireframing)
> * **Status:** *Living Document* (Acuan pembuatan *Low-Fi Wireframe* di Figcraft sebelum masuk *Prototyping* & *Visual Design*)
> * **Aturan Fase Ini:** **100% Grayscale / Box-Model Polos.** Dilarang memasukkan palet warna brand, efek *liquid glass / blur*, gradien foto, atau ilustrasi final pada tahap ini agar evaluasi murni menguji keterbacaan, kepadatan informasi, dan alur jempol (*thumb zone*).

---

## 1. Standar Kanvas, Grid, & Aturan Anti-Penuh-Sesak (*Layout Rules*)

Agar tampilan tetap lega (*airy*) namun tajam menyampaikan informasi pada layar HP maupun desktop, seluruh *frame* di Figcraft wajib mengikuti aturan metrik berikut:

### A. Ukuran Kanvas (*Breakpoints*)

| Target Perangkat | Lebar Frame Figcraft | Grid Kolom | Margin Kiri–Kanan | Gutter (Jarak Antar Kolom) | Catatan Perilaku Responsif |
| --- | --- | --- | --- | --- | --- |
| **Mobile Minimum (Wajib Lolos Uji)** | `360 × 800 px` | 4 kolom | `16 px` | `12 px` | Batas kritis teks tidak boleh terpotong / turun 2 baris sembarangan. |
| **Mobile Standar (Kanvas Utama)** | `390 × 844 px` | 4 kolom | `16 px` | `12 px` | Acuan utama *preview* di Figcraft. |
| **Mobile Besar** | `430 × 932 px` | 4 kolom | `20 px` | `12 px` | Ruang napas tambahan di sisi luar. |
| **Tablet / Desktop** | `1280 × 800 px` | *Centered Shell* (`max-width: 480 px`) atau *Split 2-Column* (`max-width: 960 px`) | Auto | `24 px` | Navigasi bawah berubah menjadi *Floating Rail* atau tetap terpusat di kontainer *mobile-app feel*. |

### B. Skala Jarak (*Spacing*) & Ergonomi Jempol (*Thumb Zone*)

* **Base Unit:** Kelipatan `4 px` (`4, 8, 12, 16, 20, 24, 32 px`).
* **Jarak Antar Blok/Section:** Minimal `24 px` (menciptakan batas visual yang tegas tanpa perlu banyak garis pemisah).
* **Padding Internal Kartu:** Minimal `16 px` di semua sisi.
* **Minimum Touch Target:** Semua tombol, *pill*, ikon *collapse*, dan *toggle* wajib memiliki area sentuh minimal `44 × 44 px` (aman disentuh saat berhenti di pinggir jalan naik motor).
* **Batas Kepadatan (*Density Budget*):**
  * Maksimal **3 titik data (*data points*)** per kartu ringkas di halaman daftar (contoh kartu *rundown*: `Jam + Judul`, `Badge Kategori + Estimasi Harga`, `1 Baris Catatan/Warning`). Detail alamat, patokan *offline*, dan tombol navigasi dibuka via *Bottom Sheet*.
  * Setiap blok panjang (RAB Tetap, Formasi Motor, Pembagian Kamar, Recap Hari Ini) wajib memiliki tombol **`[Chevron v/^]`** agar bisa di-*collapse/hide* oleh pengguna.
  * **Safe Bottom Clearance:** Semua halaman wajib memiliki *padding* bawah minimal `96 px` agar konten terbawah tidak tertutup *Floating Bottom Nav*.

---

## 2. Anatomi Kerangka Global (*Persistent Shell*)

Kerangka ini muncul konsisten di seluruh 5 Tab utama:

```text
+---------------------------------------------------+
| [Trip: Solo-Jogja 27 v]      [View] [Sync] [Off]  |  <- Top Bar (Height: 56px, Sticky)
+---------------------------------------------------+
|                                                   |
|              AREA KONTEN SCROLLABLE               |  <- Padding samping 16px,
|         (Berubah sesuai Tab aktif 1 s.d 5)        |     Padding bawah 96px
|                                                   |
+---------------------------------------------------+
|   ( [Beranda] [Rencana] [Uang] [Tim] [Cek] )  (+) |  <- Floating Pill Nav (Height: 60px)
+---------------------------------------------------+     *(+) HANYA muncul saat Edit Mode ON*
```

### Spesifikasi Kontrol Global:

1. **Top Bar (`56 px`):**
   * **Kiri:** *Trip Switcher Pill* (teks terpotong elipsis `...` jika > 18 karakter). Klik membuka *Bottom Sheet* Daftar Trip & tombol `+ Buat Trip Baru`.
   * **Kanan:**
     * **Mode Toggle Pill:** Default `[🔒 View]`. Saat diklik berubah menjadi `[✏️ Edit ON]` (dalam *wireframe*: border tebal 2px + latar abu-abu gelap) dan memunculkan banner tipis di bawah *Top Bar* bertuliskan `"Mode Edit Aktif — Perubahan tersimpan lokal. Jangan lupa Sync WA."`
     * **Sync WA Button (`44×44 px`):** Ikon `[⇄]` untuk membuka *Bottom Sheet* Export/Import JSON.
     * **Offline Indicator (`28×28 px`):** Titik status `[● Offline Ready]` / `[○ Syncing]`.

2. **Floating Bottom Nav (`60 px`, margin bawah `16 px`):**
   * Berisi tepat **5 item** dengan label 1 kata pendek agar muat di `360 px`:
     1. `Beranda`
     2. `Rencana`
     3. `Keuangan` *(atau `Dana` jika sempit)*
     4. `Tim`
     5. `Checklist`
   * **Contextual FAB `(+)` (`52×52 px`):** Tersembunyi total di *View Mode*. Saat *Edit Mode ON*, muncul di sisi kanan atas *Bottom Nav* untuk aksi tambah cepat sesuai tab aktif (di Rencana → `+ Agenda`; di Keuangan → `+ Catat Setoran/Keluar`; di Checklist → `+ Tugas`).

---

## 3. Spesifikasi Wireframe per Layar (5 Tab Utama)

### LAYAR 1: TAB BERANDA (*First Look Hero & Smart Focus*)

Dirancang agar *first look* tidak langsung menembak pengguna dengan tabel angka, melainkan *visual hook* foto penuh, lalu diikuti blok informasi yang bisa di-*scroll* dan di-*collapse*.

```text
+---------------------------------------------------+
| [Trip: Solo-Jogja 27 v]      [View] [Sync] [Off]  |
+===================================================+
|                                                   |
|           [ PLACEHOLDER FOTO SAMPUL ]             |  <- Blok 1: Hero Full-Bleed
|        (Tinggi: 52% - 58% tinggi layar)           |     (±420px di layar 800px)
|                                           [Foto]  |  <- Tombol ganti foto lokal (Layer 2)
|  -----------------------------------------------  |
|  GOES TO SOLO-JOGJA 2027                          |  <- Judul Utama (H1, max 2 baris)
|  Kam-Min, 11-14 Feb 2027 · 9-10 Peserta           |  <- Subjudul ringkas
|  +---------------------------------------------+  |
|  | [!] H-14: DEADLINE VALEN & DP 200RB         |  |  <- Countdown Pill Dinamis
|  |     05 Des 2026 · 14 Hari 08 Jam lagi   [>] |  |     (Klik -> Lihat semua milestone)
|  +---------------------------------------------+  |
+===================================================+  <- Garis transisi fade (di Fase 5)
|                                                   |
|  [ QUICK ACCESS STRIP — Horizontal Scroll ]       |  <- Blok 2: Akses Instan (Stasiun/Lapangan)
|  +--------------+ +--------------+ +-----------+  |
|  | [Tiket KA]   | | [Foto Bareng]| | [Kontak]  |  |  <- Wajib ada kartu Tiket KA Bengawan
|  | 09.14 Senen  | | Buka Folder  | | PIC & Dar |  |     langsung di sini (buka Bottom Sheet)
|  +--------------+ +--------------+ +-----------+  |
|                                                   |
|  [ SMART PHASE CARD ]          [Mode: Pra-Trip v] |  <- Blok 3: Adaptif (Pra-Trip / Hari-H)
|  +---------------------------------------------+  |     (Bisa di-switch manual utk simulasi)
|  | *Jika PRA-TRIP:*                            |  |
|  | KECUKUPAN BUDGET                         [^]|  |  <- Collapsible
|  | Kas Wajib : [========----] Rp2,48jt / 6,3jt |  |
|  | Dana Usaha: [=-----------] Rp33,5rb / 1,2jt |  |
|  | Info: 3 orang belum capai DP Rp200rb    [>] |  |
|  +---------------------------------------------+  |
|  | *Jika HARI-H (Auto/Manual):*                |  |
|  | SEDANG BERLANGSUNG (NOW)                    |  |
|  | 08.30 - Goa Maria Ganjuran (Bantul)         |  |
|  | SELANJUTNYA (NEXT)                          |  |
|  | 11.30 - Gua Maria Jurang Metes (Sedayu)     |  |
|  | [ 1-Tap Rute GMaps ]  [ Patokan Offline ]   |  |
|  +---------------------------------------------+  |
|                                                   |
|  [ RECAP HARI INI & RENCANA BESOK ]         [v]   |  <- Blok 4: Default Collapsed di Pra-Trip,
|  (Terbuka otomatis saat Hari-H)                   |     Expanded saat Hari-H
+---------------------------------------------------+
```

* **Aksi Kartu `[Tiket KA]` di *Quick Access Strip*:** Saat diklik, langsung membuka *Bottom Sheet* **Info Tiket & Transit** (KA Bengawan berangkat 09.14 Pasar Senen → ±18.20 Purwosari, KRL Solo–Jogja Rp8.000, Kereta pulang 00.26 Jogja → 08.20 Pasar Senen, plus slot tempel kode *booking* KAI) tanpa memaksa pengguna berpindah ke Tab 4.
* **Catatan Data Pilot:** *Countdown Pill* otomatis merotasi 4 *milestone* dari Master Brief (Awal Des 2026 Deadline Valen & DP Rp200rb → 27 Des 23.50 War Tiket Berangkat H-45 → 30 Des 23.50 War Tiket Pulang H-45 → 11 Feb 09.14 Hari-H).

---

### LAYAR 2: TAB RENCANA (*Rundown Timeline & Bank Referensi*)

Memisahkan jadwal resmi dari *wishlist* mentah agar tidak membingungkan di lapangan.

```text
+---------------------------------------------------+
| [Trip: Solo-Jogja 27 v]      [View] [Sync] [Off]  |
+---------------------------------------------------+
|  [  Rundown Final (14)  |  Bank Referensi (22) ]  |  <- Segmented Control (2 Sub-Tab)
+---------------------------------------------------+
|  *Tampilan Sub-Tab 2A: RUNDOWN FINAL*             |
|  [H1 Kam] [H2 Jum] [H3 Sab] [H4 Min]              |  <- Day Pill Selector (1 baris)
|  Filter: [Semua] [Ziarah] [Kuliner] [Transit]     |  <- Horizontal Scrollable Chip
|                                                   |
|  -- PAGI (06.30 - 11.30) ------------------- [^]  |  <- Collapsible per Sesi Waktu
|  06.30 | +-------------------------------------+  |
|    |   | | [Kuliner] Soto Sapi Pak Parno       |  |  <- Kartu Timeline (Max 3 data points)
|    |   | | Est. Rp15rb-25rb · Prawirotaman     |  |
|    |   | | [!] Cepat habis, antre pagi     [>] |  |  <- Klik -> Buka Bottom Sheet Detail
|    |   | +-------------------------------------+  |
|  08.30 | +-------------------------------------+  |
|    |   | | [Ziarah #2] Goa Maria Ganjuran      |  |
|    |   | | HTM Gratis · Bambanglipuro, Bantul  |  |
|    |   | | [ 1-Tap GMaps ]  [ Detail/Offline ] |  |  <- Quick action khusus agenda utama
|    |   | +-------------------------------------+  |
|  -- SIANG (11.30 - 17.00) ------------------ [v]  |  <- Bisa di-collapse agar tidak penuh
+---------------------------------------------------+
```

* **Tampilan Sub-Tab 2B (*Bank Referensi / Wishlist*):**
  * *Filter Status (1 baris scrollable):* `[Semua]` `[Masuk Rundown]` `[Cadangan]` `[Luar Rute]`.
  * Setiap kartu menampilkan: Nama Tempat, Kota/Area, *Badge* Status, Estimasi Harga, dan *Tag* Hari Tutup (contoh: `Tutup Sab-Min` pada *Warung Pojok Mbak Yuni*, `Buka Sab Mg 2&4` pada *Pasar Mustokoweni*, atau `Luar Rute: Blitar` pada *Gua Maria Sendangrejo*).
  * **Di Edit Mode:** Muncul tombol `[+ Ke Rundown]` yang langsung memicu *validasi hari tutup* (Flow A).
* **Bottom Sheet Detail Lokasi (Saat Kartu Agenda Diklik):**
  * Bagian 1: Nama, Jam Operasional, Estimasi Harga, Kapasitas (misal: *"Cukup lega untuk 9 orang"*).
  * Bagian 2: **Tombol Besar `[Buka Rute di Google Maps]`** (`Height: 48px`, lebar penuh).
  * Bagian 3 (**Blok Fallback Offline** — selalu tampil jelas): Alamat singkat, patokan jalan (misal: *"di gang dekat Ngarsopuro"* atau *"jalan kaki menuruni jalur setapak lembah"*), dan catatan parkir motor.

---

### LAYAR 3: TAB KEUANGAN (*3 Kantong Dana & Log Lapangan*)

Menerapkan catatan review #1: label sub-tab ringkas 1 kata dalam satu baris *pill* agar tidak pernah patah ke 2 baris di layar `360 px`.

```text
+---------------------------------------------------+
| [Trip: Solo-Jogja 27 v]      [View] [Sync] [Off]  |
+---------------------------------------------------+
|  [  Kas  ] [ Danus ] [ Keluar ] [ Pribadi ]       |  <- 4 Sub-Tab Pill 1 Baris (Fit 360px,
+---------------------------------------------------+     + overflow-x: auto sebagai pengaman)
|  *Tampilan Sub-Tab 3A: KAS (Kantong 1)*           |
|  +---------------------------------------------+  |
|  | TOTAL KAS WAJIB TERKUMPUL                   |  |
|  | Rp 2.480.000  /  Rp 6.300.000 (39%)         |  |
|  | [==========--------------------------]      |  |
|  | Kurang: Rp 3.820.000 · Patokan Rp700rb/org  |  |
|  | ------------------------------------------- |  |
|  | Simulasi Valen Ikut (10 Org):     ( O-- )   |  |  <- Toggle Simulasi Tentatif
|  +---------------------------------------------+  |
|                                                   |
|  [ RINCIAN RAB TETAP (Rp 6.061.000) ]       [v]   |  <- Default Collapsed (Anti penuh sesak)
|  (Isi: Hotel Solo & Jogja + Extra Bed, 5 Motor,   |
|   Bensin, Parkir, KA Bengawan PP, KRL)            |
|                                                   |
|  DAFTAR SETORAN PESERTA (10)     [Filter: Semua]  |
|  +---------------------------------------------+  |
|  | 1. Kris Ombo [Driver]        Rp 555.000     |  |
|  |    [================----]    Kurang 145rb   |  |
|  +---------------------------------------------+  |
|  | 4. Kak Dora [Penumpang]      Rp 350.000     |  |
|  |    [==========----------]    Kurang 350rb   |  |
|  +---------------------------------------------+  |
|  | 9. Louis [Driver] [!] <DP    Rp 0           |  |  <- Badge [! <DP] utk < Rp200rb
|  |    [--------------------]    Kurang 700rb   |  |
|  +---------------------------------------------+  |
|  *(Edit Mode: Klik baris -> Catat Cicilan;        |
|    Tombol "+ Tambah Peserta / Baris" di bawah)*   |
+---------------------------------------------------+
```

* **Sub-Tab `Danus` (Kantong 2):** Kartu progres dari saldo awal `Rp33.500` menuju target `Rp1.000.000 – Rp1.200.000` + daftar pemasukan *fundraising* (bisa tambah baris di *Edit Mode*).
* **Sub-Tab `Keluar` (Log Kas Keluar & Talangan):**
  * Ringkasan 2 kotak kecil sejajar: `[Sisa Kas Wajib]` dan `[Sisa Danus]` (otomatis terpotong).
  * *Filter:* `[Semua]` `[Belum Diganti (Talangan)]` `[Dari Kas]` `[Dari Danus]`.
  * Kartu transaksi menampilkan: Keterangan (misal *Bensin 5 motor Solo*), Nominal, Sumber Kantong, dan *Badge* `[Talangan: Kris · Belum Diganti]` atau `[Lunas]`.
* **Sub-Tab `Pribadi` (Kantong 3 — Layer 2 Lokal):**
  * Banner kecil info: *"🔒 Hanya tersimpan di HP-mu. Tidak ikut terkirim saat Sync WA."*
  * Total pengeluaran pribadi + daftar jajan/oleh-oleh pribadi (bisa ditambah kapan saja **meski Edit Mode OFF**, karena ini data lokal milik sendiri).

---

### LAYAR 4: TAB TIM & LOGISTIK (*Motor, Kamar, & Tiket*)

Seluruh bagian menggunakan kartu *collapsible* agar pengguna bisa langsung melompat ke informasi yang dicari.

```text
+---------------------------------------------------+
| [Trip: Solo-Jogja 27 v]      [View] [Sync] [Off]  |
+---------------------------------------------------+
|  [ FORMASI 5 MOTOR ]                        [^]   |  <- Bagian A (Collapsible)
|  Status: 7 Driver · 2 Penumpang Wajib (Anggi,     |
|          Kak Dora) · 1 Tentatif (Valen)           |
|  +----------------------+ +--------------------+  |  <- Grid 2 Kolom (Compact)
|  | MOTOR 1              | | MOTOR 2            |  |
|  | Drv: [Pilih/Kris]    | | Drv: [Pilih/Rani]  |  |
|  | Pnp: [Anggi (Wajib)] | | Pnp: [Kak Dora (W)]|  |
|  +----------------------+ +--------------------+  |
|  (Lanjut Motor 3, 4, 5 ...)                       |
|                                                   |
|  [ PEMBAGIAN KAMAR & PENGINAPAN ]           [^]   |  <- Bagian B (Collapsible)
|  +---------------------------------------------+  |
|  | SOLO (1 Malam - Kam 11 Feb)                 |  |
|  | Sans Stay Sheva Solo · Rp596rb (2 Kmr+XBed) |  |
|  | Kamar 1: [Belum diisi]  Kamar 2: [Belum]    |  |
|  | [ Rute GMaps ]  [ Alamat Offline ]          |  |
|  +---------------------------------------------+  |
|  | JOGJA (2 Malam - Jum-Sab 12-13 Feb)         |  |
|  | Bedja Homestay · Rp1.403rb (2 Kmr+XBed)     |  |
|  | Kamar 1: [Belum diisi]  Kamar 2: [Belum]    |  |
|  | [ Rute GMaps ]  [ Alamat Offline ]          |  |
|  +---------------------------------------------+  |
|                                                   |
|  [ JADWAL TIKET KERETA & TRANSIT ]          [v]   |  <- Bagian C (Sinkron dgn Quick Access
|  (KA Bengawan Berangkat, KRL, Kereta Pulang)      |     Tiket di Beranda)
+---------------------------------------------------+
```

---

### LAYAR 5: TAB CHECKLIST (*Dual To-Do*)

```text
+---------------------------------------------------+
| [Trip: Solo-Jogja 27 v]      [View] [Sync] [Off]  |
+---------------------------------------------------+
|  [  Pribadi (Lokal)  |  Bersama (Shared)  ]       |  <- Segmented Control (2 Sub-Tab)
+---------------------------------------------------+
|  Progres: 4 / 12 Selesai [========------------]   |
|                                                   |
|  *Jika PRIBADI (Layer 2 — Bisa centang & tambah   |
|   kapan saja tanpa menyalakan Edit Mode):*        |
|  [x] KTP / Kartu Identitas (Wajib naik kereta)    |
|  [x] Powerbank & Kabel Charger                    |
|  [ ] Jas Hujan Ponco (Konvoi Motor)               |
|  [ ] Lotion Anti-Nyamuk & Alas Kaki Nyaman        |
|  +---------------------------------------------+  |
|  | + Tambah barang bawaan pribadi...    [Add]  |  |  <- Inline Quick Input
|  +---------------------------------------------+  |
|                                                   |
|  *Jika BERSAMA (Layer 1 — Centang & edit butuh    |
|   Edit Mode ON agar aman saat sync):*             |
|  [ ] War Tiket KA Berangkat (27 Des 23.50) [PIC]  |
|  [ ] Konfirmasi Extra Bed Hotel Solo & Jogja      |
|  [ ] Kotak P3K Rombongan                          |
+---------------------------------------------------+
```

---

## 4. Katalog *Bottom Sheet* & *System States* (Wajib Ada di Wireframe)

Untuk menghindari perpindahan halaman penuh yang membingungkan, seluruh form input dan detail menggunakan pola **Bottom Sheet** (muncul dari bawah, tinggi maks `85%` layar, punya *drag handle* di atas):

1. **Bottom Sheet — Trip Switcher & `+ Buat Trip Baru`:** Daftar trip tersimpan + tombol buat trip kosong (untuk fleksibilitas *multi-trip* di masa depan).
2. **Bottom Sheet — Sync WhatsApp (Export / Import JSON):**
   * Bagian Export: Tombol `[Unduh File .json]` dan `[Salin Teks Kode WA]`.
   * Bagian Import: Area tempel teks / pilih file + kotak peringatan tebal: *"Hanya memperbarui Data Bersama (Layer 1). Foto sampul, To-Do Pribadi, dan Catatan Pribadi (Layer 2) kamu tetap AMAN."*
3. **Bottom Sheet — Form Tambah/Edit (Kontekstual):**
   * *Form Agenda:* Input Jam, Nama, Kategori, Estimasi Harga, Link GMaps, **Blok Patokan Offline**, dan **Banner Peringatan Hari Tutup** (muncul otomatis jika bentrok).
   * *Form Kas Keluar & Talangan:* Nominal, Keterangan, Pilih Kantong (`Kas` / `Danus`), Toggle `[Uang Talangan?]` → Dropdown Nama Peserta.
4. **Empty State (Untuk Trip Baru Kosong):** Ilustrasi kotak sederhana + 1 kalimat ajakan + 1 tombol aksi (misal: *"Belum ada jadwal untuk trip ini. Nyalakan Mode Edit untuk mulai menyusun."*).

---

## 5. Panduan Setup Halaman di Figcraft (Tahap 3)

Agar kamu bisa langsung melihat, menggeser, dan mengedit tata letaknya di **Figcraft** secara terstruktur seperti proyek besar:

* **Page 1 — `01_Wireframe_LowFi` (Kerjakan Sekarang):**
  * Buat **5 Frame utama (`390 × 844 px`)**: `WF_01_Beranda_PreTrip`, `WF_01b_Beranda_HariH`, `WF_02_Rencana`, `WF_03_Keuangan`, `WF_04_Tim`, `WF_05_Checklist`.
  * Buat **1 Frame uji sempit (`360 × 800 px`)** khusus untuk `WF_03_Keuangan` guna memverifikasi 4 *pill* sub-tab (`Kas`, `Danus`, `Keluar`, `Pribadi`) tidak patah baris.
  * Buat **3 Frame Overlay (`390 × 600 px`)**: `BS_Detail_Lokasi_Offline`, `BS_Tiket_Kereta`, `BS_Sync_WA`.
  * Gunakan **hanya 4 warna wireframe**: `#FFFFFF` (kanvas), `#F2F2F2` (kotak kartu/placeholder), `#CCCCCC` (garis tepi/divider), dan `#222222` (teks & aksen aktif).
* **Page 2 — `02_Interactive_Prototype` (Tahap 4):** Hubungkan klik antar tab, *bottom sheet*, dan *toggle* setelah tata letak di Page 1 disetujui.
* **Page 3 — `03_Component_Library_&_Design_System` (Tahap 5):** Baru di sini kita menerapkan gaya **Editorial Photo-First + Liquid Glass / Glassmorphism** sesuai kedua referensimu.
