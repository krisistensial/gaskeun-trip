# `Planning/04_Usability_Testing_Plan.md`

> **Metadata Dokumen**
> * **Nama Produk:** GASKEUN! (`gaskeun-trip`) — *Multi-Trip Group Travel Hub*
> * **Versi Dokumen:** `v1.0.0` (Tahap 4: Prototyping & Usability Testing)
> * **Status:** *Living Document* (Menjadi gerbang validasi sebelum masuk Tahap 5: Visual Design & *Liquid Glass*)
> * **Acuan Dokumen:** `Planning/01_User_Research_Persona_Journey.md` (`v1.1.0`), `Planning/02_Information_Architecture_dan_User_Flow.md` (`v1.0.0`), `Planning/03_Wireframe_Spec_dan_Layout_Rules.md` (`v1.0.0`)
> * **Prinsip Uji:** *5-User Rule* (menguji ke 3–5 orang rombongan sudah menangkap ±85% masalah *usability* sebelum desain visual & kode produksi dibangun).

---

## 1. Tujuan & Batasan Uji Coba (*Test Objectives*)

Uji coba ini dilakukan pada **Low-Fidelity Interactive Prototype** (baik di *Figcraft Page 2* maupun *grayscale HTML wireframe*) untuk memvalidasi **5 hal kritis** tanpa bias warna atau estetika:

1. **Kejelasan Hierarki & Anti-Penuh-Sesak:** Apakah pengguna bisa menemukan informasi penting dalam ≤ 2 ketukan (*taps*) tanpa merasa layar HP penuh sesak?
2. **Ergonomi Layar Sempit (`360 × 800 px`):** Apakah *Floating Bottom Nav* 5 menu (`Beranda`, `Rencana`, `Keuangan`, `Tim`, `Checklist`) dan 4 sub-tab Keuangan (`Kas`, `Danus`, `Keluar`, `Pribadi`) terbaca utuh tanpa terpotong atau turun ke 2 baris?
3. **Keamanan *View Mode* vs *Edit Mode*:** Apakah pengguna paham kapan mereka hanya membaca dan kapan harus menyalakan tombol `Edit Mode` untuk mengubah jadwal/kas (sementara data pribadi di *Layer 2* tetap bisa diubah bebas)?
4. **Ketahanan *Offline* & Eksekusi Lapangan:** Apakah *Road Captain* bisa melihat patokan lokasi *offline* saat sinyal hilang, dan apakah pengguna bisa menemukan Info Tiket KA Bengawan langsung dari *Beranda* saat di stasiun?
5. **Kepercayaan pada *Sync WA* (Dual-Layer Isolation):** Apakah pengguna memahami dengan jelas bahwa *Import JSON* dari grup WA tidak akan menghapus *To-Do Pribadi*, *Catatan Pribadi*, dan *Foto Sampul* lokal mereka?

---

## 2. Profil Partisipan Uji Coba (3–5 Orang Rombongan)

Pilih perwakilan dari ke-3 persona yang sudah dipetakan pada Tahap 1 agar sudut pandangnya seimbang:

| Slot | Peran / Persona | Rekomendasi Penguji (Studi Kasus Pilot) | Fokus Pengamatan Utama |
| --- | --- | --- | --- |
| **P1** | *Trip Architect & Bendahara* (Admin) | Kris Ombo / Chika | Kelancaran *Edit Mode*, *toggle* Valen, catat setoran & talangan, validasi hari tutup, dan *Export JSON*. |
| **P2** | *Road Captain / Driver* | Rani / Kak Mayang / Jason | Kecepatan akses *Now & Next*, tombol 1-tap GMaps, keterbacaan *Fallback Offline* di layar HP, dan formasi 5 motor. |
| **P3** | *Road Captain / Driver* (Layar HP Kecil) | Elano / Louis | Uji keterbacaan pada layar sempit (`360px`), cek status DP `< Rp200rb`, dan akses cepat tiket kereta dari *Beranda*. |
| **P4** | *Casual Traveler / Passenger* | Anggi / Kak Dora | Kesan *First Look* (ganti foto sampul), cek sisa kekurangan bayar, centang *To-Do Pribadi*, dan *Import JSON* tanpa bingung. |
| **P5** | *Tentative / External Tester* *(Opsional)* | Valen / Teman di luar trip | Uji *mental model* orang baru saat melihat aplikasi pertama kali tanpa konteks sebelumnya (uji fleksibilitas *multi-trip*). |

---

## 3. Protokol & Metode Pelaksanaan (*Test Protocol*)

* **Durasi per Sesi:** 15–20 menit per orang (bisa tatap muka atau *screen-share* WhatsApp/Discord dari HP masing-masing).
* **Metode:** *Moderated Think-Aloud* — minta penguji menyuarakan apa yang mereka pikirkan saat mencari tombol (*"Saya kira tiketnya di sini..."*, *"Kok ini tidak bisa diklik?"*).
* **Aturan Moderator:** Dilarang memberi petunjuk (*"Klik tombol atas kanan"*). Biarkan penguji mencoba dulu selama 30 detik; jika benar-benar buntu, catat sebagai *Friction Point* baru beri arahan minimal.
* **Perangkat Uji:** Minimal 1 perangkat/viewport `360 × 800 px` (Android standar) dan 1 perangkat `390 × 844 px` (iPhone/Android modern).

---

## 4. Daftar 7 Skenario Tugas Uji Coba (*Task Scenarios*)

Setiap skenario memiliki **Konteks Nyata**, **Kriteria Sukses**, **Target Waktu**, dan **Titik Rawan Bingung** yang wajib diamati:

### Task 1 — *First Look*, Ganti Foto Sampul, & Cek Kecukupan Budget (Pra-Trip)

* **Skenario untuk Penguji:** "Kamu baru buka aplikasi ini untuk pertama kali. Coba ganti foto sampul di halaman awal dengan fotomu sendiri, lalu cek apakah total kas wajib sekarang sudah cukup kalau Valen jadi ikut."
* **Alur Ideal:** Beranda → Klik ikon `[Foto]` di sudut Hero (Layer 2 lokal) → Pindah ke Tab `Keuangan` → Sub-tab `Kas` → Aktifkan *toggle* `Simulasi Valen Ikut (10 Org)` → Lihat perubahan target dari Rp6,3jt ke Rp7,0jt.
* **Target Waktu:** `< 45 detik`.
* **Titik Rawan Bingung:** Apakah penguji mengira ganti foto harus menyalakan `Edit Mode` dulu? Apakah *toggle* Valen mudah terlihat tanpa harus *scroll* terlalu jauh?

### Task 2 — Validasi Hari Tutup saat Memindah Referensi ke Rundown (*Edit Mode*)

* **Skenario untuk Penguji:** "Kamu ingin memasukkan 'Warung Pojok Mbak Yuni' dari daftar referensi IG ke jadwal sarapan Hari 3 (Sabtu). Coba tambahkan dan lihat apa yang terjadi."
* **Alur Ideal:** Tab `Rencana` → Nyalakan `[Edit Mode]` di *Top Bar* → Pilih Sub-tab `Bank Referensi` → Cari *Warung Pojok Mbak Yuni* → Klik `[+ Ke Rundown]` → Pilih Hari 3 (Sabtu) → Sistem memunculkan **Warning Banner (Tutup Sabtu–Minggu)** → Penguji memindahkan ke Hari 2 (Jumat) atau membatalkan.
* **Target Waktu:** `< 60 detik`.
* **Titik Rawan Bingung:** Apakah penguji sadar tombol edit tersembunyi karena masih di `View Mode`? Apakah pesan peringatan hari tutup cukup menonjol?

### Task 3 — Akses Cepat Tiket Kereta di Stasiun (Uji *Quick Access Strip*)

* **Skenario untuk Penguji:** "Kamu sudah sampai di Stasiun Pasar Senen dan terburu-buru mau cek jam berangkat KA Bengawan serta jam kereta pulang dari Jogja. Cari infonya secepat mungkin dari halaman depan."
* **Alur Ideal:** Dari Tab `Beranda` → *Scroll* tipis ke *Quick Access Strip* → Klik kartu `[Tiket KA]` → *Bottom Sheet* Info Tiket langsung terbuka (KA Bengawan 09.14 WIB & Pulang 00.26 WIB).
* **Target Waktu:** `< 15 detik` (≤ 2 ketukan).
* **Titik Rawan Bingung:** Apakah penguji malah lari ke Tab `Tim` atau `Rencana` karena kartu `[Tiket KA]` di Beranda kurang mencolok?

### Task 4 — Eksekusi *Road Captain* Hari-H & *Offline Fallback*

* **Skenario untuk Penguji:** "Sekarang hari Sabtu (Hari 3), kalian baru selesai dari Goa Maria Ganjuran dan mau lanjut ke Gua Maria Jurang Metes, tapi sinyal HP mendadak hilang. Cari tahu patokan jalan dan info parkirnya."
* **Alur Ideal:** Beranda (Mode Hari-H) → Lihat kartu `Now & Next` → Klik `[Patokan Offline]` atau klik kartu *Jurang Metes* di Tab `Rencana` → *Bottom Sheet* menampilkan blok *Fallback Offline* (alamat Dusun Metes Sedayu, jalur setapak lembah, parkir Rp2rb–5rb).
* **Target Waktu:** `< 25 detik`.
* **Titik Rawan Bingung:** Apakah label `[Patokan Offline]` langsung dipahami fungsinya? Apakah teks alamat & catatan parkir cukup besar dibaca sambil berdiri?

### Task 5 — Mencatat Pengeluaran Lapangan & Uang Talangan (Hari-H)

* **Skenario untuk Penguji:** "Di Solo, kamu baru saja bayar bensin 5 motor sebesar Rp100.000 pakai uang pribadi dulu (talangan), rencananya nanti diganti dari Kas Wajib. Coba catat pengeluarannya."
* **Alur Ideal:** Tab `Keuangan` → Nyalakan `[Edit Mode]` → Pilih Sub-tab `Keluar` → Klik FAB `(+)` atau `[+ Catat Pengeluaran]` → Isi Rp100.000, pilih sumber `Kas`, nyalakan *toggle* `Uang Talangan` → Pilih nama peserta → Simpan.
* **Target Waktu:** `< 50 detik`.
* **Titik Rawan Bingung:** Apakah penguji bingung membedakan sub-tab `Kas` (pemasukan setoran) vs `Keluar` (pengeluaran kas)?

### Task 6 — *Sync* Data via WhatsApp & Uji Rasa Aman Data Pribadi

* **Skenario untuk Penguji:** *"Bendahara baru kirim kode update jadwal & setoran di grup WA. Kamu sudah capek-capek mencentang barang bawaan pribadimu dan pasang foto sampul favorit. Coba impor data dari WA—apakah kamu yakin data pribadimu tidak hilang?"*
* **Alur Ideal:** Klik ikon `[Sync]` di *Top Bar* → *Bottom Sheet Sync WA* terbuka → Pilih tab `Import` → Baca teks jaminan *"Hanya memperbarui Data Bersama (Layer 1). Foto sampul, To-Do Pribadi, & Catatan Pribadi (Layer 2) tetap AMAN"* → Klik konfirmasi.
* **Target Waktu:** `< 30 detik`.
* **Titik Rawan Bingung:** Apakah bahasa *Layer 1 / Layer 2* terlalu teknis untuk peserta non-IT? *(Catatan: di UI final sebaiknya ditulis **"Data Rombongan"** vs **"Data Pribadimu di HP ini"**).*

### Task 7 — Uji Ergonomi Layar Sempit (`360px`) & *Progressive Disclosure*

* **Skenario untuk Penguji:** "Coba buka Tab Keuangan dan Tab Tim di layar HP `360px`. Tutup (collapse) bagian RAB Tetap, lalu lihat daftar peserta dan formasi 5 motor."
* **Alur Ideal:** Cek secara visual & klik semua 5 menu di *Floating Bottom Nav* (`Beranda`, `Rencana`, `Keuangan`, `Tim`, `Checklist`) dan 4 sub-tab `Keuangan` (`Kas`, `Danus`, `Keluar`, `Pribadi`), lalu klik ikon `[v/^]` untuk *collapse/expand*.
* **Kriteria Wajib Lolos:**
  * Tidak ada teks yang terpotong (*clipped*), bertabrakan, atau turun ke 2 baris pada lebar `360px`.
  * Area sentuh semua tombol & *chevron collapse* terasa nyaman (tidak sering salah pencet tombol sebelahnya).

---

## 5. Rubrik Penilaian & Klasifikasi Masalah (*Severity Matrix*)

Setiap temuan dari sesi uji coba dicatat menggunakan skala prioritas berikut:

| Tingkat | Kode | Definisi Masalah | Tindakan Wajib |
| --- | --- | --- | --- |
| **Kritis** | **P0 (Blocker)** | Pengguna gagal total menyelesaikan tugas, data pribadi berisiko tertimpa, atau elemen terpotong/tidak bisa diklik di `360px`. | **Wajib diperbaiki** sebelum boleh lanjut ke Tahap 5 (*Visual Design*). |
| **Tinggi** | **P1 (Major)** | Pengguna berhasil, tetapi butuh > 2x target waktu, salah masuk tab berkali-kali, atau bingung dengan istilah UI. | **Wajib diperbaiki** pada iterasi wireframe. |
| **Sedang** | **P2 (Minor)** | Hambatan kecil (misal posisi tombol kurang ergonomis, teks bisa dibuat lebih santai/jelas). | Diperbaiki saat penyusunan *Component Library* di Tahap 5. |
| **Rendah** | **P3 (Cosmetic)** | Saran tambahan atau preferensi gaya visual. | Masuk *backlog* Tahap 5 atau fase pasca-MVP. |

---

## 6. Template Log Hasil Uji & Iterasi (*Living Test Log*)

Isi tabel ini setelah uji coba dengan 3–5 teman selesai dilakukan:

### A. Ringkasan Metrik Keberhasilan

| Task | P1 (Admin) | P2 (Driver) | P3 (360px) | P4 (Passenger) | P5 (Opsional) | Tingkat Sukses | Rata-rata Waktu |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **T1. First Look & Simulasi Valen** | — | — | — | — | — | 0% | — |
| **T2. Validasi Hari Tutup (Edit)** | — | — | — | — | — | 0% | — |
| **T3. Akses Cepat Tiket KA** | — | — | — | — | — | 0% | — |
| **T4. Now/Next & Offline Fallback** | — | — | — | — | — | 0% | — |
| **T5. Catat Kas Keluar & Talangan** | — | — | — | — | — | 0% | — |
| **T6. Sync WA (Anti-Timpa Lokal)** | — | — | — | — | — | 0% | — |
| **T7. Uji 360px & Collapse** | — | — | — | — | — | 0% | — |

### B. Daftar Temuan & Keputusan Iterasi

| ID | Layar / Komponen | Severity | Deskripsi Temuan Penguji | Solusi Perubahan Wireframe | Status |
| --- | --- | --- | --- | --- | --- |
| `UT-01` | *Contoh: Floating Bottom Nav (360px)* | `P0` | *Label "Keuangan" mepet dengan "Checklist" di lebar 360px.* | *Ubah label jadi "Dana" atau kecilkan font ke 10px + gap 4px.* | `Pending Uji` |
| `UT-02` | *Contoh: Bottom Sheet Sync WA* | `P1` | *Istilah "Layer 1 / Layer 2" terasa terlalu teknis.* | *Ganti copywriting jadi "Data Rombongan" vs "Data Pribadimu".* | `Pending Uji` |

---

## 7. Kriteria *Gate-Pass* Menuju Tahap 5 (*Visual Design & Design System*)

Proyek **GASKEUN!** dinyatakan siap masuk ke **Tahap 5** (penerapan gaya **Editorial Photo-First + Liquid Glass / Glassmorphism** & pembuatan *Component Library* di Figcraft) apabila seluruh syarat berikut terpenuhi:

1. **Zero P0 Issues:** Seluruh kendala `P0` (terutama keterbacaan di `360px`, *Edit Mode*, dan isolasi data *Sync WA*) sudah teratasi.
2. **Task Success Rate ≥ 85%:** Minimal 6 dari 7 skenario berhasil diselesaikan penguji tanpa bantuan moderator.
3. **Struktur Terkunci:** Tidak ada lagi perubahan jumlah tab utama, sub-tab, maupun posisi *Quick Access* sehingga saat masuk *styling* di Figcraft kita fokus 100% pada estetika, animasi *hover/click*, dan *design tokens*.
