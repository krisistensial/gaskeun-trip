# `Planning/01_User_Research_Persona_Journey.md`

> **Metadata Dokumen**
> * **Nama Produk:** GASKEUN! (`gaskeun-trip`) — *Multi-Trip Group Travel Hub*
> * **Versi Dokumen:** `v1.1.0` (Tahap 1: Discover & Research + Addendum Arsitektur & Lapangan)
> * **Status:** *Living Document* (Terbuka untuk iterasi & penambahan *use-case* trip baru)
> * **Studi Kasus Pilot:** *Goes to Solo–Jogja* (11–14 Februari 2027, 4H3M, 9–10 Peserta)
> * **Target Platform:** *Mobile-First Web App* (PWA — *Offline-First*, Responsif di Desktop)

---

## 1. Visi Produk & Dual-Phase Lifecycle

**GASKEUN!** bukan sekadar halaman jadwal statis, melainkan pusat komando perjalanan kelompok yang fleksibel (dapat digunakan untuk banyak *trip* berbeda), dapat diubah langsung oleh pengguna tanpa menyentuh IDE, serta tetap berjalan 100% tanpa sinyal internet.

Berdasarkan pola perilaku rombongan, aplikasi ini harus melayani **2 Fase Penggunaan (Dual-Phase Lifecycle)** yang sangat berbeda kebutuhannya:

1. **Fase A — Pra-Keberangkatan (*Planning & Funding Mode*):**
   * Fokus pada pengumpulan referensi destinasi (misalnya dari 11 tautan Instagram), penyusunan *itinerary*, pemantauan kecukupan *budget* (apakah target Rp700.000/orang dan dana usaha Rp1–1,2 juta sudah tercapai), serta pencatatan dinamis jika ada peserta yang baru menyetor atau perlu menambah baris/tabel pengeluaran baru.

2. **Fase B — Hari-H & Pasca-Trip (*On-Trip & Memory Mode*):**
   * Fokus pada eksekusi cepat di lapangan: melihat *rundown* hari ini, *recap* hari ini, rencana besok, posisi tujuan saat ini & selanjutnya, *1-tap direct link* rute Google Maps, akses folder foto bersama, serta *to-do list* bersama maupun pribadi.

---

## 2. Identifikasi Masalah (*Pain Points*) & Konteks Lapangan

Dari analisis alur persiapan perjalanan kelompok (studi kasus Solo–Jogja 2027), ditemukan 6 masalah utama yang harus diselesaikan oleh desain UI/UX:

| Kategori | Masalah di Lapangan (*Pain Points*) | Dampak ke Pengguna |
| --- | --- | --- |
| **Fragmentasi Informasi** | Jadwal kereta, daftar penginapan, 11 referensi IG, dan tabel patungan tersebar di grup WhatsApp, Google Docs, dan catatan pribadi. | Peserta sering bertanya ulang hal yang sama ("Kita naik kereta jam berapa?", "Hotelnya di mana?"). |
| **Koneksi Tidak Stabil** | Perjalanan KA Bengawan (±9 jam) dan lokasi ziarah seperti Goa Maria Ganjuran atau lembah Jurang Metes rawan kehilangan sinyal. | *Itinerary* dan informasi penting tidak bisa dibuka saat dibutuhkan di lokasi. |
| **Kompleksitas Keuangan** | Ada 3 pos dana terpisah (Kas Wajib Rp700rb/org, Dana Usaha target Rp1–1,2jt, dan Dana Pribadi) ditambah variabel peserta tentatif (Valen). | Bendahara kesulitan memperbarui status setoran secara transparan tanpa buka laptop/Excel. |
| **Navigasi Konvoi Motor** | Rombongan memakai 5 motor (7 *driver*, 2 penumpang wajib: Anggi & Kak Dora) di kota yang belum familier. | Rawan terpisah di jalan jika tidak ada tombol cepat (*1-tap*) menuju rute Google Maps tujuan berikutnya. |
| **Overload Informasi di Layar HP** | Memaksakan seluruh jadwal 4 hari, harga, dan catatan jam tutup (misal Pasar Mustokoweni buka khusus Sabtu minggu ke-2) dalam satu layar. | Layar terasa penuh sesak (*cluttered*), melelahkan mata, dan pengguna malas membaca. |
| **Kaku & Tidak Bisa Diedit Cepat** | Website statis mengharuskan *developer* masuk IDE setiap kali ada perubahan jam, penambahan baris pembayaran, atau penggantian foto sampul. | Aplikasi cepat usang dan tidak bisa dipakai untuk rencana liburan berikutnya. |

---

## 3. User Personas (Profil Pengguna Rombongan)

Untuk memastikan tata letak nyaman bagi semua anggota, pengguna dikelompokkan menjadi **3 Persona Utama**:

### Persona 1: *The Trip Architect & Bendahara* (Admin / Power User)

* **Representasi:** Kris Ombo, Chika (Pengelola rencana, jadwal, dan kas).
* **Kebutuhan Utama:**
  * Memasukkan referensi tujuan baru dan menyusun *itinerary* langsung dari HP/laptop tanpa membuka IDE.
  * Memantau kecukupan *budget*, mengubah status peserta tentatif (misal *toggle* Valen ikut/tidak), serta menambah baris/tabel pembayaran baru kapan saja.
  * Membagikan pembaruan data terbaru ke grup WhatsApp agar HP peserta lain ikut ter-update.
* **Frustrasi:** Harus menjawab pertanyaan berulang dan repot merekap ulang angka setiap kali ada teman yang menyicil setoran.

### Persona 2: *The Road Captain & Driver* (Eksekutor Lapangan)

* **Representasi:** Rani, Kak Mayang, Jason, Elano, Louis (Pengendara 5 unit motor).
* **Kebutuhan Utama:**
  * Saat Hari-H, hanya butuh melihat **"Sekarang di mana & setelah ini ke mana?"** tanpa harus *scroll* panjang.
  * Tombol pintas **langsung buka rute Google Maps** (*direct deep-link*) dengan ukuran tombol besar yang mudah ditekan saat berhenti di pinggir jalan.
  * Peringatan cepat terkait jam tutup tempat atau kondisi parkir motor.
* **Frustrasi:** Tampilan web yang terlalu padat, huruf terlalu kecil, atau butuh banyak klik hanya untuk mencari alamat tujuan berikutnya.

### Persona 3: *The Casual Traveler & Passenger* (Pengguna Santai)

* **Representasi:** Anggi, Kak Dora (Penumpang wajib), Valen (Tentatif).
* **Kebutuhan Utama:**
  * Tampilan awal (*first look*) yang estetik, seru, dan membangun *hype* liburan (ada foto sampul yang bisa disimpan/diganti, *countdown* menuju Hari-H).
  * Mengecek sisa kekurangan bayar pribadinya dengan cepat, mencentang *to-do list / packing* pribadi, melihat rencana besok, dan mengakses **folder foto bersama** saat/setelah trip.
* **Frustrasi:** Tampilan kaku seperti *spreadsheet* kantor yang membosankan.

---

## 4. User Journey Map (End-to-End: H-90 s.d. Pasca Hari-H)

| Fase Perjalanan | Aktivitas Utama Pengguna | Emosi & Ekspektasi | Hambatan (*Pain Points*) | Peluang Solusi UI/UX di GASKEUN! |
| --- | --- | --- | --- | --- |
| **1. Pra-Trip: Brainstorming & Nabung** *(Sekarang – Nov 2026)* | Memasukkan ide kuliner/wisata, cek progres setoran Rp700rb & dana usaha. | Antusias, ingin lihat rencana makin matang & transparan. | Ide IG tercecer; bingung apakah dana sudah cukup. | **Mode Planning:** Tabel setoran dinamis (bisa tambah baris/data), *progress bar* 3 kantong dana, bank referensi destinasi. |
| **2. Milestone Kritis: Deadline & War Tiket** *(Des 2026)* | Konfirmasi final Valen (awal Des), *war* tiket KA Bengawan H-45 (27 & 30 Des pukul 23.50 WIB). | Tegang, takut lupa jam *war* tiket atau dana DP kurang. | Lupa jadwal buka tiket 00.00 WIB; peserta belum setor minimal Rp200rb. | **Hero Countdown Dinamis:** Pengingat otomatis berganti sesuai *milestone* terdekat + indikator siapa yang belum mencapai batas DP. |
| **3. Persiapan Akhir (H-7)** | Cek pembagian 5 motor, 2 kamar + *extra bed*, dan *packing* barang. | Mulai sibuk, takut ada barang penting tertinggal. | Lupa bawa barang kelompok vs pribadi; lupa pasangan boncengan. | **Dual Checklist:** Tab terpisah *To-Do Pribadi* (lokal HP) & *To-Do Bersama*, plus kartu formasi motor & kamar. |
| **4. Hari-H: On-Trip** *(11–14 Feb 2027)* | Cek *rundown* hari ini, tujuan saat ini & berikutnya, buka rute GMaps, *recap* harian, cek rencana besok. | Lelah di jalan tapi senang; butuh info serba instan & *offline*. | Sinyal hilang di kereta/Gua Maria; layar HP silau & penuh sesak. | **Mode Hari-H (Smart Focus):** Kartu *Now & Next* di paling atas, tombol 1-tap GMaps, *collapsible sections* agar layar lega, 100% *offline*. |
| **5. Pasca-Trip** *(15 Feb 2027+)* | Mengakses folder foto bersama, melihat *recap* pengeluaran akhir, membuat *trip* baru. | Nostalgia, ingin menyimpan kenangan & merencanakan trip berikutnya. | Link Google Drive/Photos tenggelam di chat WA. | **Memory Hub & Multi-Trip:** Kartu akses cepat **Folder Foto Bersama**, arsip *recap* trip, dan tombol `+ Buat Trip Baru`. |

---

## 5. Analisis Referensi Visual & Pola Interaksi

Berdasarkan dua referensi visual yang dipilih, berikut ekstraksi pola desain yang akan menjadi dasar penyusunan *Information Architecture* (Tahap 2) dan *Design System* (Tahap 5):

### A. Ekstraksi dari Referensi 1 — *Playful Glassmorphic Productivity Hub*

* **Lapisan Transparan (*Glass / Liquid Glass*):** Kartu konten menggunakan efek kaca buram semi-transparan di atas latar belakang hangat/foto, menciptakan kedalaman visual (*depth*) tanpa terasa berat.
* **Lini Masa Vertikal (*Timeline View*):** Jam berada di sisi kiri, kartu agenda berada di sisi kanan dengan *pill badge* kategori dan avatar peserta—sangat cocok untuk *Rundown* Hari-H.
* **Navigasi Bawah Melayang (*Floating Pill Nav*):** Menu bawah berbentuk kapsul melayang dengan tombol aksi cepat (`+`) terpisah di sisi kanan, mudah dijangkau jempol.
* **Form Input Ringkas (*Bottom Sheet*):** Saat menambah agenda atau data baru, muncul *sheet* dengan *toggle* (`Personal` / `Team`), pemilih jam, dan *pill* prioritas—sangat cocok untuk fitur tambah data tanpa IDE.
* **Nuansa *Fun* & *Micro-Interactions*:** Kehadiran ilustrasi/karakter kecil dan *progress bar* harian membuat aplikasi terasa hidup dan tidak kaku.

### B. Ekstraksi dari Referensi 2 — *Editorial Photo-First Landing*

* **First Look Berbasis Foto Penuh (*Customizable Hero*):** Layar pertama langsung disambut foto/gambar pilihan pengguna (*full-bleed*) yang bisa diganti dan disimpan, lengkap dengan judul besar yang kuat (*visual hook*).
* **Gradasi Transparan ke Putih (*Seamless Fade*):** Transisi mulus dari area foto ke permukaan putih/transparan saat pengguna mulai melakukan *scroll*, menjaga keterbacaan teks tetap maksimal.
* **Ruang Bernapas (*Generous Whitespace* & *Scrollable Storytelling*):** Tidak memaksakan semua informasi tampil dalam satu layar; setiap blok punya judul, *hook* singkat, dan detailnya bisa dibuka/disembunyikan (*progressive disclosure*).

### C. Perbandingan Kompetitor (*Competitor Benchmark*)

| Fitur Kunci | Wanderlog | Notion | Splitwise | **GASKEUN! (Target Kita)** |
| --- | --- | --- | --- | --- |
| **100% Offline Tanpa Login Ribet** | Terbatas (Berbayar) | Sering gagal *sync* | Terbatas | **Ya (PWA + LocalStorage)** |
| **Sistem 3 Kantong Dana + Tabel Dinamis** | Tidak | Manual & berat di HP | Hanya *split bill* | **Ya (Bawaan & Fleksibel)** |
| **First Look Foto + Liquid Glass Fun UI** | Standar | Kaku / Dokumen | Kaku / Tabel | **Ya (Editorial + Glass UI)** |
| **Dual Mode (Pre-Trip vs Hari-H Now/Next)** | Tidak | Manual | Tidak | **Ya (Otomatis / Switchable)** |

---

## 6. Matriks Prioritas Fitur (MoSCoW)

Untuk menjaga agar pengembangan tetap fokus dan tidak melebar di luar kendali:

* **MUST HAVE (Wajib Ada di MVP):**
  1. **First Look Customizable Hero:** Foto sampul pilihan user (bisa diunggah/simpan) + Judul Trip + *Countdown* dinamis.
  2. **Multi-Trip & Offline-First:** Bisa ganti/buat *trip* baru, jalan tanpa sinyal, serta *Export/Import JSON* via WA.
  3. **Mode Hari-H (*Now, Next & Tomorrow*):** Sorotan agenda saat ini & selanjutnya, *recap* hari ini, rencana besok, dan tombol *direct link* rute Google Maps.
  4. **Keuangan Dinamis (3 Kantong Dana):** Cek kecukupan *budget*, *toggle* peserta tentatif, serta kemampuan menambah baris/tabel/data pembayaran langsung di UI.
  5. **Dual To-Do List & Folder Foto Bersama:** *Checklist* bersama vs pribadi, plus tautan tersemat (*pinned card*) ke folder foto bersama (Google Photos/Drive).
  6. **Progressive Disclosure UI:** Bagian/tab bisa di-*collapse/hide*, *scrollable* lega, dengan animasi *hover/click* yang halus.

* **SHOULD HAVE (Sangat Dianjurkan):**
  * Pembagian formasi 5 motor & 2 kamar interaktif.
  * Filter kategori pada *rundown* (Ziarah, Kuliner, Transit) & *badge* peringatan jam tutup.
  * Integrasi peta mini (*embedded map preview*) atau rangkuman rute harian.

* **COULD HAVE (Opsional / Fase Lanjutan):**
  * Pemilihan tema warna kaca (*Light Frosted Glass* vs *Warm Dark Glass*).
  * Ekspor ringkasan *itinerary* ke format gambar/PDF siap kirim WA.

* **WON'T HAVE (Di Luar Scope MVP):**
  * *Real-time chat* di dalam aplikasi (tetap gunakan WhatsApp).
  * *Payment gateway* otomatis atau *backend database* berbayar.

---

## 7. Aturan Pemeliharaan (*Living Document Protocol*)

* Setiap kali ada kebutuhan baru dari rombongan (atau saat aplikasi dipakai untuk *trip* baru di luar Solo–Jogja), tambahkan poin baru di bagian **Persona / Pain Points / MoSCoW** dan naikkan nomor versi (`v1.0.0` → `v1.1.0`).
* Tidak ada data spesifik *Solo–Jogja* yang boleh dikunci mati sebagai aturan sistem; seluruh data Solo–Jogja di dokumen ini hanya bertindak sebagai **Studi Kasus Pilot**.

---

## 8. Addendum `v1.1.0`: Aturan Kritis Arsitektur & Lapangan

* **Aturan 1 — Pemisahan *Shared Trip Data* vs *Local Personal Data*:** Proses *Import JSON* dari WhatsApp hanya menimpa *Shared Trip Data* (jadwal, kas wajib, dana usaha, formasi motor/kamar) dan **dilarang keras** menimpa *Local Personal Data* (To-Do Pribadi, foto sampul lokal, catatan pengeluaran pribadi). Foto sampul lokal wajib dikompresi otomatis (atau disimpan di `IndexedDB`) agar tidak menabrak batas `localStorage` (~5 MB).
* **Aturan 2 — Log Pengeluaran Lapangan (*Kas Keluar & Talangan*):** Tab Keuangan di MoSCoW (*Must Have*) diperluas mencakup **Log Kas Keluar** yang mengurangi saldo Kantong 1/Kantong 2 secara otomatis, lengkap dengan kolom *siapa yang menalangi* (untuk bensin 5 motor, parkir, makan bersama, atau donasi).
* **Aturan 3 — Bank Referensi (*Wishlist*) & Validasi Hari Tutup:** Memisahkan **Bank Referensi Destinasi** (berstatus `Masuk Rundown`, `Cadangan`, atau `Di Luar Rute` seperti #1 Gua Maria Sendangrejo Blitar) dari *Rundown Final*, dilengkapi peringatan otomatis jika destinasi bertabrakan dengan hari tutupnya (misal: Warung Pojok Mbak Yuni tutup Sabtu–Minggu, Warung Lotek Pak Mul tutup Minggu, atau Pasar Mustokoweni yang hanya buka Sabtu minggu ke-2 & ke-4).
* **Aturan 4 — *Offline Fallback* untuk *Road Captain*:** Kartu agenda pada Mode Hari-H wajib menampilkan alamat singkat, patokan lokasi, dan catatan parkir motor secara *offline* sebagai cadangan jika sinyal hilang di lembah/perjalanan (seperti jalur menuju Gua Maria Jurang Metes) dan Google Maps gagal memuat rute.
* **Aturan 5 — *View Mode* vs *Edit Mode*:** Tampilan *default* adalah **View Mode** (bersih, aman dari salah sentuh saat di jalan). Perubahan jadwal, penambahan baris kas, atau edit formasi hanya aktif saat pengguna menyalakan **Edit Mode Toggle**.

