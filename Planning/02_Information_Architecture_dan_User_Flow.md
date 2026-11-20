# `Planning/02_Information_Architecture_dan_User_Flow.md`

> **Metadata Dokumen**
> * **Nama Produk:** GASKEUN! (`gaskeun-trip`) — *Multi-Trip Group Travel Hub*
> * **Versi Dokumen:** `v1.0.0` (Tahap 2: Define & Information Architecture)
> * **Status:** *Living Document* (Acuan utama pembuatan *Low-Fi Wireframe* di Figcraft)
> * **Prinsip Utama:** *Mobile-First*, *Progressive Disclosure*, *Dual-Layer Data*, *Safe View-First*

---

## 1. Problem Statement & Prinsip Arsitektur

### Problem Statement

> *"Rombongan perjalanan kelompok (9–10 orang) kesulitan memantau jadwal, rute konvoi motor, status patungan 3 kantong dana, dan pengeluaran lapangan secara terpusat di layar HP—terutama saat sinyal hilang—tanpa membuat tampilan penuh sesak atau berisiko merusak data bersama maupun catatan pribadi saat saling berbagi pembaruan."*

### 4 Pilar Prinsip Struktur Informasi

1. **Progressive Disclosure (Anti Penuh Sesak):** Layar awal hanya menampilkan *visual hook*, judul, dan 1–2 metrik terpenting. Detail panjang (alamat, catatan parkir, rincian RAB, daftar peserta) disembunyikan di balik *accordion*, *sub-tab*, atau *bottom sheet* yang bisa di-*expand/collapse*.
2. **Safe View-First (View vs Edit Mode):** Secara *default*, seluruh tombol hapus, geser jadwal, dan form edit disembunyikan. Pengguna baru melihat kontrol edit setelah mengaktifkan tombol kunci **`[Edit Mode]`** di pojok atas.
3. **Dual-Layer Data Isolation:** Data kelompok (*Shared*) dan data pribadi (*Local*) dipisahkan secara tegas di tingkat penyimpanan agar *sync* via WhatsApp tidak pernah menghapus data pribadi pengguna.
4. **Dual-Phase Adaptive Home:** Halaman Beranda beradaptasi dengan konteks waktu—menonjolkan *Countdown* & Progres Dana saat Pra-Trip, serta menonjolkan kartu **Now, Next & Tomorrow** saat Hari-H.

---

## 2. Arsitektur Data Dual-Layer (*Shared* vs *Local*)

Pemisahan ini menjadi kontrak mutlak bagi desain UI maupun *developer* saat membangun fitur *Export/Import JSON*:

| Lapisan Data | Penyimpanan Teknis | Cakupan Data | Perilaku Saat *Import JSON* dari WA |
| --- | --- | --- | --- |
| **Layer 1: Shared Trip Data** *(Milik Rombongan)* | `localStorage` (JSON terstruktur per `tripId`) | Profil trip, *Milestones*, *Rundown Final*, *Bank Referensi*, Kas Wajib (Kantong 1), Dana Usaha (Kantong 2), Log Kas Keluar & Talangan, Formasi Motor & Kamar, *To-Do Bersama*, Link Folder Foto Bersama. | **DITIMPA / DIPERBARUI** sesuai file JSON terbaru (dengan konfirmasi pratinjau versi/waktu update). |
| **Layer 2: Local Personal Data** *(Milik HP Masing-Masing)* | `localStorage` (teks) + `IndexedDB` (blob foto terkompresi) | **Foto Sampul (*First Look Hero*)**, *To-Do Pribadi*, Catatan Pengeluaran Pribadi (Kantong 3), Preferensi *collapse/hide* tab, Tema Kaca (*Light/Dark*). | **TIDAK TERSENTUH (AMAN 100%)**. Tidak ikut ter-export saat membagikan data trip ke grup WA. |

---

## 3. Sitemap & Hierarki Navigasi (*Mobile-First*)

### A. Kerangka Global (*Persistent Shell*)

* **Top Bar (Transparan / *Liquid Glass* di atas Hero, *sticky* saat *scroll*):**
  * **Kiri:** *Trip Switcher Pill* (Nama Trip aktif + panah dropdown untuk pindah trip atau `+ Buat Trip Baru`).
  * **Kanan:** 3 ikon ringkas:
    1. `[Toggle Mode: View / Edit]` (Ikon gembok/pensil — menyala jelas saat *Edit Mode* aktif).
    2. `[Sync WA]` (Membuka *Bottom Sheet* Export/Import JSON).
    3. `[Info Offline]` (Indikator kecil status siap *offline*).

* **Bottom Navigation Bar (*Floating Glass Pill* — 5 Menu Utama):**
  1. **Beranda** (*Home / Hub*)
  2. **Rencana** (*Rundown & Bank Referensi*)
  3. **Keuangan** (*3 Kantong & Log Pengeluaran*)
  4. **Tim** (*Motor, Kamar & Tiket*)
  5. **Checklist** (*To-Do Bersama & Pribadi*)
  * *(Khusus saat **Edit Mode ON**: muncul tombol melayang `+` / Quick Action FAB di samping pill navigasi untuk menambah agenda, setoran, atau pengeluaran cepat).*

---

### B. Rincian Struktur Konten per Tab

#### Tab 1: Beranda (*The Visual Hook & Smart Focus*)

Dirancang *scrollable* dengan ruang napas lega (mengadopsi gaya *editorial photo-first* yang memudar ke permukaan kaca transparan):

1. **Blok 1 — *First Look* Customizable Hero (Full-Bleed):**
   * Foto sampul pilihan user (tersimpan lokal di `IndexedDB`, bisa diganti via tombol kecil `[Ganti Foto]` saat *Edit Mode* atau klik ikon kamera).
   * Judul Trip besar, tanggal (`11–14 Feb 2027`), dan **Countdown Pill Dinamis** (otomatis menyorot *milestone* terdekat: Deadline Valen awal Des → War Tiket Berangkat 27 Des → War Tiket Pulang 30 Des → Hari-H 11 Feb).

2. **Blok 2 — *Phase Switcher Card* (Bisa di-*collapse*):**
   * *Saat Pra-Trip:* Kartu **Ringkasan Kecukupan Budget** (bar progres Kas Wajib & Dana Usaha + status berapa orang belum DP Rp200rb).
   * *Saat Hari-H:* Kartu **Now & Next** (Sedang berlangsung sekarang + Tujuan berikutnya dengan tombol besar **`[Rute GMaps]`** + patokan alamat *offline*), plus *collapsible* **Recap Hari Ini** & **Rencana Besok**.

3. **Blok 3 — *Quick Access Strip* (Horizontal Scroll):**
   * Kartu pintas ke **Folder Foto Bersama** (link Google Photos/Drive), **Info Kereta (KA Bengawan PP)**, dan **Kontak Darurat/PIC**.

#### Tab 2: Rencana (*Itinerary & Bank Referensi*)

Menggunakan **2 Sub-Tab** di bagian atas agar *rundown* resmi tidak tercampur dengan ide mentah:

* **Sub-Tab 2A — Rundown Final (Timeline View):**
  * *Day Pill Selector:* `[Hari 1]` `[Hari 2]` `[Hari 3]` `[Hari 4]` (bisa di-*hide* atau *collapse* per sesi pagi/siang/malam).
  * *Kartu Agenda (Timeline):* Jam di kiri, kartu kaca di kanan berisi Nama Tempat, *Badge* Kategori (`Ziarah`, `Kuliner`, `Transit`), Estimasi Harga, dan *Warning Pill* jika ada catatan khusus (misal: *"Pasar Mustokoweni hanya buka Sabtu minggu ke-2"*).
  * *Detail Expandable (Klik Kartu → Bottom Sheet):* Menampilkan **Tombol 1-Tap Google Maps**, serta **Blok Fallback Offline** (Alamat singkat, patokan lokasi seperti *"gang dekat Ngarsopuro"* atau *"jalur setapak lembah"*, dan info parkir motor).

* **Sub-Tab 2B — Bank Referensi / Wishlist:**
  * Menampung seluruh referensi riset (seperti 11 tautan IG) dengan filter status: `[Semua]` `[Masuk Rundown]` `[Cadangan]` `[Di Luar Rute]`.
  * *Smart Closed-Day Validation:* Jika pengguna (dalam *Edit Mode*) memindahkan tempat dari *Bank Referensi* ke hari tertentu di *Rundown* yang bertabrakan dengan hari tutupnya (misal: memasukkan *Warung Pojok Mbak Yuni* ke Hari 3 Sabtu, atau *Lotek Pak Mul* ke Hari 4 Minggu), sistem memunculkan *banner* peringatan sebelum disimpan.

#### Tab 3: Keuangan (*3 Kantong Dana & Log Lapangan*)

Menggunakan **4 Sub-Tab Ringkas** (*pill switcher*):

* **Sub-Tab 3A — Kas Wajib (Kantong 1):**
  * Kartu Total Terkumpul vs Target + **Toggle Simulasi `[Valen Ikut: YA / TIDAK]`** (target otomatis berubah Rp6.300.000 ↔ Rp7.000.000).
  * *Collapsible RAB Tetap:* Rincian Kereta PP, KRL, Hotel Solo & Jogja + *extra bed*, 5 Motor + Bensin + Parkir.
  * Daftar 10 Peserta dengan *progress bar* individual (dalam *Edit Mode*, bisa klik peserta untuk tambah cicilan atau tambah baris peserta baru).

* **Sub-Tab 3B — Dana Usaha (Kantong 2):**
  * *Progress Bar* dari saldo awal **Rp33.500** menuju target **Rp1.000.000 – Rp1.200.000**, lengkap dengan daftar pemasukan *fundraising*.

* **Sub-Tab 3C — Log Kas Keluar & Talangan (Hari-H):**
  * Daftar pengeluaran aktual di lapangan (bensin, parkir, makan bersama, lilin/donasi) yang otomatis memotong saldo Kantong 1 atau Kantong 2.
  * Menampilkan label **`[Sumber: Kas]`** atau **`[Talangan: Nama Peserta]`** beserta status **`[Belum Diganti / Lunas]`** agar bendahara mudah merekap di akhir trip.

* **Sub-Tab 3D — Catatan Pribadi (Kantong 3 — Lokal HP):**
  * Catatan jajan & oleh-oleh pribadi yang 100% tersimpan lokal dan tidak ikut ter-export ke grup WA.

#### Tab 4: Tim & Logistik (*Motor, Kamar & Tiket*)

* **Bagian A — Formasi 5 Motor (Collapsible):** 5 kartu slot motor dengan penanda visual otomatis untuk penumpang wajib (**Anggi** & **Kak Dora**) dan *pool* 7 *driver*.
* **Bagian B — Pembagian Kamar (Collapsible):** Kartu **Sans Stay Sheva Solo** (2 Kamar + *extra bed*, 1 malam) dan **Bedja Homestay Jogja** (2 Kamar + *extra bed*, 2 malam) beserta daftar penghuni & patokan alamat *offline*.
* **Bagian C — Ringkasan Tiket & Transit:** Jadwal KA Bengawan (09.14–18.20), KRL Solo–Jogja, dan Kereta Pulang (00.26–08.20).

#### Tab 5: Checklist (*Dual To-Do*)

* **Sub-Tab 5A — To-Do Bersama (*Shared*):** Tugas kelompok (misal: *war* tiket H-45, bawa P3K, konfirmasi *extra bed*) lengkap dengan nama PIC.
* **Sub-Tab 5B — To-Do Pribadi (*Local HP*):** Daftar barang bawaan pribadi yang dicentang mandiri dan aman dari timpaan *Import JSON*.

---

## 4. User Flows Detail (5 Skenario Kritis)

### Flow A: Pra-Trip — Memasukkan Referensi ke Rundown (+ Validasi Hari Tutup)

```text
[Buka Tab Rencana] -> [Aktifkan Edit Mode] -> [Pilih Sub-Tab Bank Referensi]
  -> [Pilih Tempat (misal: Warung Pojok Mbak Yuni)] -> [Klik "Masukkan ke Rundown"]
  -> [Pilih Hari & Jam (misal: Hari 3 - Sabtu, 08.00)]
  -> {SISTEM CEK HARI TUTUP}
      ├── Jika Cocok (Buka) -> Simpan ke Rundown -> Status referensi jadi "Masuk Rundown"
      └── Jika Bentrok (Tutup Sab-Min) -> Tampil Warning Banner ("Tutup di hari Sabtu!")
            ├── [Ubah ke Hari 2 (Jumat)] -> Simpan
            └── [Tetap Paksa Simpan] -> Simpan dengan badge peringatan merah
```

### Flow B: Hari-H — Eksekusi Cepat *Road Captain* (Online & Offline Fallback)

```text
[Buka Web (View Mode Default)] -> [Lihat Kartu "Now & Next" di Beranda]
  -> [Klik Tujuan Berikutnya] -> [Bottom Sheet Detail Terbuka]
  -> {KONDISI SINYAL HP}
      ├── Ada Sinyal -> Klik [1-Tap Rute GMaps] -> Langsung buka navigasi Google Maps
      └── Sinyal Hilang -> Baca Blok "Fallback Offline" (Alamat singkat, patokan jalan, info parkir motor)
```

### Flow C: Hari-H — Mencatat Pengeluaran Lapangan & Talangan

```text
[Buka Tab Keuangan] -> [Aktifkan Edit Mode] -> [Pilih Sub-Tab "Kas Keluar & Talangan"]
  -> [Klik "+ Catat Pengeluaran"] -> [Bottom Sheet Form Terbuka]
  -> [Isi: Nominal, Keterangan (misal: Bensin 5 motor), Pilih Sumber (Kantong 1 / Kantong 2)]
  -> [Toggle: "Dibayar Pakai Uang Talangan?" -> Pilih Nama Peserta]
  -> [Simpan] -> Saldo Kantong otomatis berkurang + muncul tagihan ganti talangan untuk Bendahara
```

### Flow D: Sync Data Antar Peserta via WhatsApp (Anti-Timpa Data Lokal)

```text
[Admin: Klik Ikon Sync WA] -> [Klik "Export Data Trip (.json)"]
  -> Sistem HANYA mengemas Layer 1 (Shared Trip Data) -> [Kirim file/kode ke Grup WA]
[Peserta Lain: Unduh/Salin dari WA] -> [Klik Ikon Sync WA] -> [Klik "Import Data Trip"]
  -> Tampil Modal Konfirmasi ("Update Jadwal & Kas versi 12 Feb? Data pribadi & foto sampulmu tetap aman.")
  -> [Konfirmasi] -> Layer 1 diperbarui, Layer 2 (To-Do Pribadi, Foto Sampul, Kantong 3) tetap utuh
```

### Flow E: Personalisasi *First Look* (Ganti Foto Sampul Lokal)

```text
[Beranda -> Klik Ikon Kamera di Sudut Hero] -> [Pilih Foto dari Galeri HP]
  -> Sistem otomatis kompresi gambar (max lebar 1200px, WebP/JPEG < 300KB)
  -> Simpan ke IndexedDB (Layer 2 Local) -> Foto sampul langsung berubah & tetap tampil saat offline
```
