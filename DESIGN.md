# design.md: MikroTik Hotspot Voucher Manager

> Status: Draft v0.2 · Pelengkap `dev-spec.md` v0.3
> Cakupan: prinsip desain, token visual, layout aplikasi, rancangan layar, komponen, state, aksesibilitas, dan desain voucher cetak.
> Bahasa UI: Indonesia saja (semua teks di `src/strings/id.ts`).
> Keputusan visual: voucher memakai **Desain D "Harga Menonjol"**, header hitam, aksen **hijau**, merek **WIFI TKJ**.

---

## 1. Prinsip Desain

1. **Alat kerja, bukan dekorasi.** Pengguna adalah operator warnet/RT-RW net. Prioritas: cepat, jelas, minim klik.
2. **Aman secara default.** Aksi destruktif (hapus batch, kick, uninstall script) selalu minta konfirmasi dengan menyebut dampaknya.
3. **Status router selalu terlihat.** Terhubung/putus dan versi RouterOS tampil permanen di header.
4. **Jujur soal batasan.** Jika fitur tidak tersedia (misal v6 di build web), jelaskan alasannya dan arahkan ke solusi, jangan disembunyikan.
5. **Desktop-first.** Target utama Tauri desktop (≥1024 px). Web tetap responsif sampai 768 px. Layar lebih kecil: tabel berubah jadi kartu.
6. **Preview = hasil cetak.** Pratinjau PDF memakai renderer dan konstanta yang sama dengan file akhir.

---

## 2. Token Visual

### 2.1 Warna (mapping ke variabel shadcn/Tailwind)

| Token | Light | Dark | Pakai untuk |
|---|---|---|---|
| `--background` | `#F8FAFC` | `#0B1220` | latar halaman |
| `--card` | `#FFFFFF` | `#111A2E` | kartu, panel |
| `--border` | `#E2E8F0` | `#22304A` | garis, input |
| `--foreground` | `#0F172A` | `#E6EDF7` | teks utama |
| `--muted-foreground` | `#64748B` | `#94A3B8` | teks sekunder |
| `--primary` | `#15803D` | `#4ADE80` | tombol utama, link, fokus |
| `--primary-foreground` | `#FFFFFF` | `#052E16` | teks di atas primary |
| `--success` | `#15803D` | `#4ADE80` | terhubung, berhasil |
| `--warning` | `#B45309` | `#FBBF24` | peringatan (NTP mati, shared-users ≠ 1) |
| `--destructive` | `#B91C1C` | `#F87171` | hapus, kick, error |
| `--info` | `#1D4ED8` | `#60A5FA` | catatan informasi |

Aturan:
- Kontras teks ≥ 4.5:1.
- Karena `--primary` dan `--success` sama-sama hijau, **status tidak boleh hanya warna**: selalu sertakan ikon dan teks (`● Terhubung`, `✔ OK`). Tombol primary dibedakan dari badge status lewat bentuk (tombol solid, badge outline/dot).

### 2.2 Tipografi

| Peran | Font | Ukuran / berat |
|---|---|---|
| UI | Inter (self-host, tanpa CDN) | 14 px normal |
| Judul halaman | Inter | 24 px / 600 |
| Judul kartu | Inter | 16 px / 600 |
| Label form | Inter | 13 px / 500 |
| Kode voucher, IP, MAC | JetBrains Mono (self-host) | 13–14 px |
| Teks kecil | Inter | 12 px |

### 2.3 Spasi, bentuk, elevasi

- Skala spasi: 4, 8, 12, 16, 24, 32, 48 px.
- Radius: 6 px (input/tombol), 10 px (kartu), 999 px (badge).
- Elevasi: kartu hanya border 1 px, bayangan lembut hanya untuk dialog dan dropdown.
- Ikon: `lucide-react`, 16/20 px, stroke 1.75.
- Animasi: 120–180 ms, hormati `prefers-reduced-motion`.

---

## 3. Layout Aplikasi

```
┌───────────────────────────────────────────────────────────────────┐
│ Header: [Logo] Nama Router · v7.15 · ● Terhubung    [Tema] [Menu] │
├──────────────┬────────────────────────────────────────────────────┤
│ Sidebar 232px│  Konten (maks 1200px, padding 24px)                │
│              │                                                    │
│  Dashboard   │  Judul halaman              [Aksi utama]           │
│  Voucher     │  ────────────────────────────────────────────────  │
│  Paket       │  ...                                               │
│  Profil      │                                                    │
│  Perangkat   │                                                    │
│  Setup Router│                                                    │
│  Pengaturan  │                                                    │
└──────────────┴────────────────────────────────────────────────────┘
```

- Sidebar bisa diciutkan jadi ikon (64 px). Di <1024 px berubah jadi drawer.
- Header menampilkan badge status koneksi: `● Terhubung` (hijau), `● Menyambung…` (kuning), `● Terputus` (merah, dengan tombol "Sambungkan ulang").
- Jika belum ada router: semua menu kecuali Pengaturan dikunci dan pengguna diarahkan ke layar Koneksi.
- Banner global di atas konten (maks 1 sekaligus, urut prioritas): koneksi putus → NTP router tidak sinkron → script masa berlaku belum terpasang.

### Navigasi

| Menu | Rute | Isi |
|---|---|---|
| Dashboard | `/` | ringkasan |
| Voucher | `/voucher` | daftar batch, buat batch, cetak |
| Paket | `/paket` | paket + harga |
| Profil | `/profil` | speed, 1 akun 1 pengguna, masa berlaku |
| Perangkat | `/perangkat` | DHCP lease, hotspot aktif, host |
| Setup Router | `/setup` | script/scheduler masa berlaku, cek NTP |
| Pengaturan | `/pengaturan` | router, tampilan voucher, backup |

---

## 4. Rancangan Layar

### 4.1 Koneksi Router (onboarding)

```
┌ Hubungkan ke Router ──────────────────────────────┐
│ [ Pindai MNDP ]  (hanya di aplikasi desktop)      │
│  ○ RB951 · 192.168.88.1 · v6.48   [Pilih]         │
│  ○ hAP ax · 192.168.88.2  · v7.15 [Pilih]         │
│ ───────────── atau isi manual ──────────────────  │
│ Nama           [ Hotspot Utama            ]       │
│ IP / Host      [ 192.168.88.1             ]       │
│ Metode         (•) Otomatis ( ) REST ( ) API      │
│ Port           [ 8728 ]   [ ] Pakai TLS           │
│ Username       [ vm-admin ]                       │
│ Password       [ ••••••••  ] 👁                    │
│ [ ] Izinkan sertifikat self-signed (hanya desktop)│
│ ⚠ API port 8728 tidak terenkripsi. Disarankan 8729│
│                                                   │
│ [ Tes Koneksi ]                  [ Simpan & Masuk]│
└───────────────────────────────────────────────────┘
```

- Hasil tes: kartu hijau "Terhubung: RouterOS 6.48.6 · RB951Ui · uptime 3h 12m" atau kartu merah dengan penyebab dan solusi (lihat §6.4).
- Pertama kali: dialog **Buat passphrase** untuk enkripsi kredensial (dengan penjelasan: "Passphrase tidak bisa dipulihkan").
- Setiap peluncuran: dialog **Masukkan passphrase** untuk membuka kredensial.
- Tautan bantuan: "Cara membuat user router khusus" (panel yang bisa disalin perintahnya).

### 4.2 Dashboard

```
┌ Router ──────┐ ┌ Pengguna Aktif ┐ ┌ CPU / RAM ──┐ ┌ NTP ────────┐
│ RB951 v6.48  │ │      12        │ │ 8% · 41%    │ │ ✔ Sinkron   │
│ Uptime 3h    │ │ dari 340 user  │ │             │ │ 14:02 WIB   │
└──────────────┘ └────────────────┘ └─────────────┘ └─────────────┘
┌ Voucher (per status) ────────────┐ ┌ Aksi cepat ───────────────┐
│ Baru 220 · Aktif 12 · Kedaluwarsa │ │ [ + Buat Voucher ]        │
│ 108      (bar bertumpuk)         │ │ [ Cetak batch terakhir ]  │
└──────────────────────────────────┘ └───────────────────────────┘
```

Auto-refresh 10 detik, berhenti saat tab tidak aktif.

### 4.3 Profil

Tabel: Nama · Speed (↑/↓) · Masa berlaku · Pengguna per akun · Dipakai oleh · Aksi.

- Kolom **Pengguna per akun** selalu menampilkan `1`. Jika profil di router bernilai lain: badge kuning "Bukan 1" + tombol **Perbaiki**.
- Hapus dinonaktifkan jika profil masih dipakai, dengan tooltip "Dipakai oleh 34 user".

Dialog **Buat/Ubah Profil**:

```
Nama profil        [ 1hari-2mbps ]
Kecepatan
  Upload           [ 1 ] [ M ▾ ]
  Download         [ 2 ] [ M ▾ ]       → rate-limit: 1M/2M
Masa berlaku       [ 1 ] [ hari ▾ ]  ⓘ Dihitung sejak login pertama
                   dan terus berjalan walau perangkat terputus.
Pengguna per akun  [ 1 ]  🔒 Dikunci: 1 akun untuk 1 perangkat
▸ Lanjutan  (idle-timeout, keepalive-timeout, address-pool, mac-cookie-timeout)
[ Batal ]                                           [ Simpan ]
```

Satuan masa berlaku: menit, jam, hari, minggu. Pratinjau nilai RouterOS ditampilkan kecil (`1d`).

### 4.4 Paket

Kartu grid (3 kolom): label, harga besar (`Rp 5.000`), speed, masa berlaku, jumlah voucher tersedia. Tombol **Ubah**, **Hapus**.

- Tombol **Preset**: 1 Jam, 3 Jam, 1 Hari, 1 Minggu, 1 Bulan. Membuat profil dan paket sekaligus, dengan harga yang bisa diedit dulu di dialog.
- Paket mengacu satu profil. Jika profil dihapus, paket menampilkan badge merah "Profil hilang".

### 4.5 Voucher

**Daftar batch** (tabel): Tanggal · Paket · Jumlah (maks 8) · Status (Baru n / Aktif n / Kedaluwarsa n) · Dicetak? · Aksi (Lihat, Cetak, Hapus).

Karena 1 batch = maksimal 8 voucher, jumlah batch akan cepat bertambah. Daftar dilengkapi:

- **Filter** (di atas tabel, tersimpan selama sesi):
  - **Paket**: dropdown, "Semua paket" atau salah satu paket.
  - **Tanggal**: rentang (Hari ini, 7 hari, 30 hari, Kustom).
  - **Status cetak**: Semua · Sudah dicetak · Belum dicetak.
  - Tombol **Reset filter** dan hitungan hasil ("Menampilkan 12 dari 47 batch").
- **Pilih banyak**: kotak centang per baris dan "pilih semua hasil filter". Saat ada yang dipilih, muncul bilah aksi: **Hapus terpilih**.
- **Hapus batch kedaluwarsa** (aksi massal, tombol di kanan atas tabel):
  - Menghapus semua batch yang **seluruh vouchernya sudah kedaluwarsa**.
  - Dialog konfirmasi menyebut dampak dan angkanya, contoh: "Menghapus 18 batch (144 voucher kedaluwarsa) dari riwayat. User dan scheduler yang masih tersisa di router untuk batch ini ikut dibersihkan. Riwayat tidak bisa dikembalikan."
  - Tombol konfirmasi berlabel "Hapus 18 batch" (destruktif, merah).
- **Urutan default**: terbaru di atas. Kolom Tanggal dan Dicetak bisa disortir.
- **Kosong**: jika filter tidak menghasilkan apa pun, tampilkan "Tidak ada batch yang cocok" dengan tombol **Reset filter**.

**Wizard Buat Batch** (dialog 2 langkah):

1. **Paket & jumlah**: pilih paket, jumlah voucher dengan stepper **1–8** (default 8), dan Mode (User = Password / Berbeda).
   - Teks bantu: "Maksimal 8 voucher per generate, sesuai 1 halaman A4. Butuh lebih banyak? Generate lagi."
   - Format kode ditampilkan terkunci: `🔒 6 karakter, huruf besar + angka (tanpa O, I, L, 0, 1)`, dengan pratinjau 3 contoh kode.
2. **Konfirmasi & buat**: ringkasan "Membuat 8 voucher Paket 1 Hari (Rp 5.000) = total nilai Rp 40.000". Tombol **Buat & Pratinjau Cetak**.

**Progress pembuatan**: bar kecil dengan hitungan `5/8`, `aria-live="polite"`. Tidak ada fitur resume, jadi tidak ada teks "Lanjutkan batch yang belum selesai". Jika ada item gagal, tampil daftar gagal dengan tombol **Coba lagi item gagal**. Batch yang berhasil sebagian tetap bisa dicetak.

**Setelah generate:** langsung ke layar Cetak PDF (§4.6) dengan pratinjau satu halaman, dan tombol **Generate lagi** (mengulang dengan paket dan mode yang sama dalam satu klik).

**Detail batch**: tabel kode (password disamarkan, tombol mata), filter status, tombol **Cetak PDF**, **Salin semua**, **Hapus batch** (konfirmasi: "Menghapus 8 user dan scheduler terkait dari router").

### 4.6 Cetak PDF

Satu batch selalu tercetak di **satu halaman A4** (maksimal 8 voucher, 2 kolom × 4 baris).

```
┌ Cetak Voucher ──────────────────────────────────────────────┐
│ Batch: 06 Okt 14:02 · Paket 1 Hari · 8 voucher · 1 halaman  │
│ ☐ Mode hemat tinta   ☐ Garis potong                         │
│ ┌──────── Pratinjau (A4) ──────────┐   Offset printer        │
│ │  [vcr]      [vcr]                │   X [ 0.0 ] mm          │
│ │  [vcr]      [vcr]                │   Y [ 0.0 ] mm          │
│ │  [vcr]      [vcr]                │   [ Halaman kalibrasi ] │
│ │  [vcr]      [vcr]                │                         │
│ └──────────────────────────────────┘   Zoom                  │
│ ⓘ Cetak dengan skala 100% / "Actual size".                  │
│ [ Unduh PDF ]                                  [ Cetak ]     │
└─────────────────────────────────────────────────────────────┘
```

- Tidak ada kontrol **Rentang**, teks **Halaman: n**, atau navigasi `◀ 1 / n ▶`, karena hasilnya selalu 1 halaman.
- Baris ringkasan batch memakai format: `Batch: 06 Okt 14:02 · Paket 1 Hari · 8 voucher · 1 halaman`.
- Jika voucher kurang dari 8, slot terisi dari kiri-atas (kiri ke kanan, lalu ke bawah). Slot kosong dibiarkan **kosong** tanpa garis potong, dan tetap berada di koordinat layout penuh sehingga kertas sisa bisa dimasukkan lagi ke printer.
- Margin kiri/kanan **10 mm tetap**: tidak ada input untuk mengubahnya. Tampilkan sebagai teks terkunci 🔒.
- Pratinjau menampilkan penggaris tipis di tepi untuk menunjukkan 10 mm.
- Setelah cetak/unduh: tanya "Tandai batch sudah dicetak?" (default centang).
- Halaman kalibrasi: kotak 85 × 54 mm, penggaris margin 10 mm, instruksi "ukur dengan penggaris".

### 4.7 Perangkat

Tab: **DHCP Lease** · **Hotspot Aktif** · **Host**. Di atas tabel: kotak pencarian (IP/MAC/host/user), indikator "Diperbarui 3 dtk lalu", tombol jeda auto-refresh.

| Tab | Kolom | Aksi baris |
|---|---|---|
| DHCP Lease | IP · MAC · Hostname · Server · Status · Terakhir terlihat | Jadikan statis, Blokir |
| Hotspot Aktif | User · IP · MAC · Uptime · Sisa masa berlaku · ↓/↑ | **Kick** |
| Host | IP · MAC · Status · Autentikasi | — |

- Sorting di semua kolom. Kolom IP diurutkan secara numerik.
- Kick: konfirmasi ringan (popover "Putuskan user X?"). Blokir: dialog dengan penjelasan dampak.
- Sisa masa berlaku: `2j 14m` dengan warna kuning jika < 1 jam, merah jika < 10 menit.

### 4.8 Setup Router

Daftar cek (checklist) dengan status tiap item dan tombol aksi:

```
✔ Koneksi API/REST              OK (API, v6.48.6)
✔ Hotspot server ditemukan      hotspot1 pada ether2
⚠ Jam & NTP                     NTP tidak aktif · Masa berlaku bisa meleset   [ Panduan ]
✖ Script masa berlaku           Belum terpasang                               [ Pasang ]
✖ Scheduler pembersih           Belum terpasang                               [ Pasang ]
```

- Tombol **Pasang Semua / Verifikasi / Copot**. Sebelum pasang: dialog menampilkan isi script (read-only, bisa disalin) dan daftar objek yang akan dibuat (semua berprefix `vm-`).
- **Copot** hanya menyentuh objek berprefix `vm-`, dan teks konfirmasi menyebut itu.
- Hasil Verifikasi menunjukkan diff jika script di router berbeda dari versi app.

### 4.9 Pengaturan

Sub-tab: **Router** · **Tampilan Voucher** · **Cetak** · **Backup** · **Keamanan**.

- **Tampilan Voucher**: nama merek (nilai awal **WIFI TKJ**, maks 16 karakter), URL login (dengan pratinjau QR), catatan kaki. Pratinjau voucher live (desain D) di sisi kanan. Warna voucher dikunci mengikuti desain (header hitam, aksen hijau).
- **Cetak**: `marginY` (default 15 mm, tampil `gapY` hasil hitung), offset printer X/Y. Peringatan jika `gapY < 0`.
- **Backup**: Ekspor/Impor JSON (opsi enkripsi). Peringatan "Data tersimpan lokal; bersihkan browser = data hilang."
- **Keamanan**: ganti passphrase, kunci aplikasi sekarang, simpan password voucher terenkripsi (toggle).

---

## 5. Desain Voucher (cetak): Desain D "Harga Menonjol"

Ukuran **85 × 54 mm landscape**. Semua koordinat dalam mm dari pojok kiri-atas voucher (`t` = jarak dari atas).

```
 0                                          85
 ┌──────────────────────────────────────────┐ 0
 │ WIFI TKJ                    Paket 1 Hari │  header hitam (tinggi 17)
 │ Rp 5.000                         1 HARI  │  harga 22 pt · durasi 14 pt hijau
 ├──────────────────────────────────────────┤ 17
 │ USERNAME      PASSWORD        ┌────────┐ │
 │ k7m2xq        p9d4ba          │        │ │
 │ ─────────────────────────     │   QR   │ │  QR 20×20, x=61, t=22
 │ Berlaku 1 hari sejak login    │        │ │
 │ pertama                       └────────┘ │
 │ Kecepatan 2 Mbps          Scan untuk login│
 │ 1 akun untuk 1 perangkat                 │
 └──────────────────────────────────────────┘ 54
```

| Elemen | Posisi (mm) | Gaya |
|---|---|---|
| Tepi voucher | radius 2,5 | garis 0,6 pt `#E2E8F0` |
| Header | tinggi 17, sudut atas membulat | solid hitam `#111827` |
| Merek "WIFI TKJ" | x=4, t=5,5 | 6,5 pt, abu-terang `#94A3B8` |
| Label paket | kanan (4 dari tepi), t=5,5 | 6,5 pt, abu-terang |
| Harga | x=4, t=14 | **22 pt bold putih** |
| Durasi | kanan (4 dari tepi), t=14 | **14 pt bold hijau `#4ADE80`** |
| Label USERNAME / PASSWORD | x=4 / x=31, t=22 | 6 pt, abu `#64748B` |
| Nilai username / password | x=4 / x=31, t=28 | 14 pt mono bold (6 karakter ≈ 18 mm, muat di kolom 26 mm) |
| Garis pemisah | x=4 sampai 56, t=32 | 0,5 pt `#E2E8F0` |
| Masa berlaku | x=4, t=37 | 6,5 pt: "Berlaku 1 hari sejak login pertama" |
| Kecepatan | x=4, t=41,5 | 6,5 pt abu: "Kecepatan 2 Mbps" |
| Catatan | x=4, t=50,5 | 6,5 pt abu: "1 akun untuk 1 perangkat" |
| QR | x=61, t=22, 20×20 | quiet zone 1,5 mm, koreksi level M, hitam di atas putih |
| Keterangan QR | tengah di x=71, t=45,5 | 6 pt abu: "Scan untuk login" |

Aturan:
- Ukuran font minimum **6 pt** agar terbaca setelah cetak.
- **Mode berwarna:** header hitam, durasi hijau, selebihnya putih/abu.
- **Mode hemat tinta:** tanpa blok header. Header diganti garis bawah hitam 0,6 pt, merek/harga/durasi berwarna hitam, durasi tanpa warna hijau.
- Merek diambil dari pengaturan (nilai awal `WIFI TKJ`), dipotong dengan elipsis jika lebih dari lebar yang tersedia. Teks panjang tidak dibungkus ke baris baru.
- Harga ikut format `Rp 5.000`; jika harga ≥ `Rp 100.000` ukuran font turun otomatis ke 18 pt agar tidak menabrak durasi.
- Garis potong putus-putus (opsional) 0,3 pt abu pada tepi voucher.
- Tata letak halaman (A4, 2×4, margin X 10 mm tetap, `gapY` otomatis) mengikuti `dev-spec.md` §6.6. Tidak boleh ada perbedaan antara preview dan PDF.

---

## 6. Komponen dan Pola

### 6.1 Komponen inti (shadcn/ui + kustom)

`Button`, `Input`, `Select`, `Switch`, `Dialog`, `AlertDialog`, `Tabs`, `Table` (+ sort, sticky header), `Badge`, `Tooltip`, `Toast`, `Progress`, `Skeleton`, `Banner` (kustom), `StatusDot` (kustom), `CopyField` (kustom: nilai mono + tombol salin), `DurationInput` (angka + satuan), `SpeedInput` (angka + k/M), `PdfPreview` (kustom).

### 6.2 Umpan balik

| Situasi | Pola |
|---|---|
| Aksi sukses singkat | Toast 3 dtk |
| Operasi panjang (batch) | Progress inline, tidak memblokir navigasi |
| Error yang bisa ditindaklanjuti | Kartu/Banner dengan penyebab + langkah solusi |
| Aksi destruktif | AlertDialog, tombol destruktif merah, label tombol menyebut aksi ("Hapus 100 voucher") |

### 6.3 State wajib di setiap layar data

- **Memuat**: skeleton (bukan spinner penuh halaman).
- **Kosong**: ilustrasi sederhana + satu tombol aksi ("Belum ada paket. Buat dari preset").
- **Error**: pesan + tombol "Coba lagi".
- **Terputus**: data terakhir tetap tampil dengan label "Data lama · terputus", aksi tulis dinonaktifkan.

### 6.4 Pesan error (contoh teks)

| Error | Judul | Solusi yang ditampilkan |
|---|---|---|
| `CorsBlockedError` | Browser memblokir koneksi ke router | Gunakan aplikasi desktop, atau aktifkan layanan `www`/`www-ssl` dan buka dari alamat yang diizinkan |
| `AuthError` | Username atau password salah | Periksa akun, pastikan group punya policy `api`/`rest-api` |
| `NetworkError` | Router tidak terjangkau | Cek IP, kabel, dan `/ip service` (port 8728/80 aktif dan tidak diblokir firewall) |
| `VersionUnsupportedError` | Versi RouterOS tidak didukung | Minimal v6.43 (atau sesuai keputusan di dev-spec) |
| `ClockNotSyncedError` | Jam router belum sinkron | Aktifkan NTP/SNTP client, lalu verifikasi ulang |

---

## 7. Aksesibilitas

- Seluruh fungsi bisa dioperasikan dengan keyboard. Urutan fokus mengikuti urutan visual. Cincin fokus 2 px `--primary` selalu terlihat.
- Dialog: fokus terkunci di dalam, `Esc` menutup (kecuali saat operasi berjalan), fokus kembali ke pemicu.
- Tabel memakai elemen semantik `<table>`, `<th scope>`, kolom yang bisa disortir memakai `aria-sort`.
- Status koneksi dan progress memakai `aria-live="polite"`.
- Target klik minimal 32 × 32 px (desktop).
- Tidak mengandalkan warna saja (ikon + teks pada semua status). Ini penting karena `--primary` dan `--success` sama-sama hijau.
- Mendukung zoom hingga 200% tanpa kehilangan fungsi.

---

## 8. Pintasan Keyboard (desktop)

| Pintasan | Aksi |
|---|---|
| `Ctrl+K` | Pencarian cepat (rute + voucher) |
| `Ctrl+N` | Buat batch voucher |
| `Ctrl+P` | Buka layar cetak untuk batch terpilih |
| `/` | Fokus ke kotak pencarian tabel |
| `Ctrl+L` | Kunci aplikasi (hapus passphrase dari memori) |

---

## 9. Responsif

| Lebar | Perilaku |
|---|---|
| ≥ 1280 px | Sidebar penuh, konten maks 1200 px |
| 1024–1279 px | Sidebar ikon + label, grid kartu 2 kolom |
| 768–1023 px | Sidebar jadi drawer, tabel tetap |
| < 768 px | Tabel jadi daftar kartu, dialog jadi layar penuh (build web/PWA) |

Layar Cetak PDF di <768 px: preview satu halaman, kontrol dipindah ke bawah.

---

## 10. Salinan Teks (aturan penulisan)

- Bahasa Indonesia baku tapi ringkas, sapaan netral (tanpa "Anda" berlebihan).
- Tombol berupa kata kerja: "Simpan", "Buat Voucher", "Pasang Script".
- Angka uang: `Rp 5.000` (titik ribuan). Tanggal: `06 Okt 2026, 14:02`. Durasi: `1 hari`, `3 jam`, `2j 14m` (ringkas di tabel).
- Istilah teknis RouterOS (`rate-limit`, `shared-users`) boleh muncul di teks kecil/tooltip untuk operator berpengalaman, tetapi label utama memakai bahasa sehari-hari ("Kecepatan", "Pengguna per akun").

---

## 11. Struktur Berkas Desain di Kode

```
src/
├─ app/theme.css                      # variabel CSS token §2 (light/dark)
├─ components/ui/                     # shadcn
├─ components/shared/                 # Banner, StatusDot, CopyField, DurationInput, SpeedInput
├─ features/pdf/voucher-template.ts   # koordinat & gaya §5 sebagai konstanta
└─ strings/id.ts                      # semua teks §6.4 dan §10
```

Aturan: koordinat voucher dan warna PDF didefinisikan sekali di `voucher-template.ts`, dipakai oleh renderer PDF dan komponen pratinjau di Pengaturan.

```ts
// src/features/pdf/voucher-template.ts  (Desain D, koordinat mm dari kiri-atas)
export const BRAND = { name: 'WIFI TKJ' } as const;

export const COLORS = {
  header: '#111827',      // hitam
  headerMuted: '#94A3B8', // merek & label paket di header
  accent: '#4ADE80',      // hijau: durasi
  ink: '#0F172A',
  muted: '#64748B',
  rule: '#E2E8F0',
  border: '#E2E8F0',
  white: '#FFFFFF',
} as const;

export const VOUCHER = { w: 85, h: 54, radius: 2.5 } as const;
export const MIN_FONT_PT = 6;

export const LAYOUT_D = {
  header:   { h: 17 },
  brand:    { x: 4, t: 5.5, size: 6.5 },
  plan:     { xRight: 4, t: 5.5, size: 6.5 },
  price:    { x: 4, t: 14, size: 22 },
  duration: { xRight: 4, t: 14, size: 14 },
  user:     { label: { x: 4,  t: 22, size: 6 }, value: { x: 4,  t: 28, size: 14 } },
  pass:     { label: { x: 31, t: 22, size: 6 }, value: { x: 31, t: 28, size: 14 } },
  divider:  { x1: 4, x2: 56, t: 32 },
  valid:    { x: 4, t: 37,   size: 6.5 },
  speed:    { x: 4, t: 41.5, size: 6.5 },
  note:     { x: 4, t: 50.5, size: 6.5 },
  qr:        { x: 61, t: 22, size: 20, quiet: 1.5 },
  qrCaption: { xCenter: 71, t: 45.5, size: 6 },
} as const;
```

---

## 12. Kriteria Penerimaan Desain

- [ ] Status koneksi dan versi RouterOS terlihat di semua layar.
- [ ] Field `shared-users` tidak bisa diubah dari UI mana pun.
- [ ] Preview PDF identik dengan PDF akhir (margin kiri/kanan 10 mm terlihat di penggaris preview).
- [ ] Semua state (memuat, kosong, error, terputus) ada di setiap layar data.
- [ ] Semua aksi destruktif memakai AlertDialog yang menyebut dampaknya.
- [ ] Kontras warna lolos WCAG AA di mode terang dan gelap.
- [ ] Seluruh alur MVP (konek → profil → paket → buat batch → cetak) bisa diselesaikan hanya dengan keyboard.
- [ ] Voucher memakai Desain D: header hitam, durasi hijau, merek WIFI TKJ, tidak ada teks di bawah 6 pt, tidak ada yang meluber dari kotak 85 × 54 mm.
- [ ] Wizard batch tidak memuat field prefix, panjang kode, atau charset (format kode terkunci 6 karakter).
- [ ] Status koneksi/berhasil tetap terbaca tanpa warna (ikon + teks), meski `--primary` dan `--success` sama-sama hijau.
- [ ] Stepper jumlah voucher tidak bisa melebihi 8, dan teks bantu menjelaskan alasannya.
- [ ] Setelah generate, pengguna sampai ke pratinjau cetak 1 halaman dalam satu langkah.

---

## 13. Pertanyaan Terbuka

1. Apakah voucher perlu menampilkan **sisa kuota**, atau cukup masa berlaku dan harga? (Desain D saat ini tanpa kuota.)
2. Mode gelap perlu di MVP, atau cukup mode terang dulu?
3. Logo: voucher D tidak memakai logo. Mau ditambah logo kecil di header, atau cukup teks "WIFI TKJ"?

---

## Changelog

- **v0.2:** voucher dikunci Desain D (header hitam, aksen durasi hijau, merek WIFI TKJ); warna utama aplikasi teal → hijau; wizard batch tanpa prefix dan format kode terkunci 6 karakter; menambah `voucher-template.ts`; aturan mode hemat tinta untuk D.
- **v0.1:** draft awal.