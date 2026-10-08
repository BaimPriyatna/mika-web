# tasks.md: MikroTik Hotspot Voucher Manager

> Status: Draft v1.0
> Mengikuti roadmap DEV-SPEC.md §11 dan kriteria penerimaan §12

---

## Phase 0: Spike & Riset Teknis (3–5 hari)

### Task 0.1: Setup Proyek Awal
**Estimasi:** 1 hari  
**Dependencies:** —  
**Sub-tasks:**
- [x] 0.1.1 Install dependencies dasar: `react-router-dom`, `@tanstack/react-query`, `zustand`, `zod`, `react-hook-form`
- [x] 0.1.2 Setup Tailwind CSS: `tailwindcss`, `postcss`, `autoprefixer`, config
- [~] 0.1.3 Init shadcn/ui: install CLI dan setup komponen dasar (button, input, dialog)
- [x] 0.1.4 Install dependencies storage & crypto: `dexie`, `crypto-js` atau library MD5 kecil
- [x] 0.1.5 Install dependencies PDF: `pdf-lib`, `qrcode`
- [x] 0.1.6 Buat struktur folder sesuai DEV-SPEC.md §4: `src/app/`, `src/core/`, `src/features/`, `src/strings/`
- [x] 0.1.7 Setup Vitest + Testing Library: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`
- [x] 0.1.8 Buat `src/strings/id.ts` untuk semua teks UI (Indonesia)

**Acceptance Criteria:**
- Dependencies terinstall, build berjalan tanpa error
- Folder structure sesuai spec
- Tailwind config dan shadcn/ui siap pakai

---

### Task 0.2: Spike REST v7 (CORS & Preflight)
**Estimasi:** 1 hari  
**Dependencies:** 0.1  
**Sub-tasks:**
- [~] 0.2.1 Buat halaman test sederhana dengan form input (host, port, user, pass)
- [~] 0.2.2 Implementasi `fetch` ke `http://<router>/rest/system/resource` dengan Basic Auth
- [~] 0.2.3 Test CORS: cek preflight `OPTIONS`, header `Authorization`
- [~] 0.2.4 Dokumentasikan hasil: apakah REST v7 bisa dari browser tanpa proxy?
- [~] 0.2.5 Test ke router v7 asli, catat perilaku CORS dan preflight

**Acceptance Criteria:**
- Hasil terdokumentasi: REST v7 bisa/tidak dari browser
- Jika tidak bisa, catat error spesifik (CORS policy, preflight)
- Menentukan: apakah build web memerlukan proxy atau hanya untuk Tauri

---

### Task 0.3: Spike TCP API v6 (Tauri Plugin)
**Estimasi:** 2 hari  
**Dependencies:** 0.1  
**Sub-tasks:**
- [~] 0.3.1 Research Tauri plugin TCP: cari `tauri-plugin-tcp` atau alternatif
- [~] 0.3.2 Buat PoC: Tauri command untuk `open_tcp(host, port)`, `write(bytes)`, `read()`
- [~] 0.3.3 Implementasi encoder API binary sederhana: encode panjang word (1–5 byte) + word
- [~] 0.3.4 Test login plain ke router v6/v7: `/login` dengan `=name=` dan `=password=`
- [~] 0.3.5 Parse response: `!done` (sukses) atau `!trap` (gagal)
- [~] 0.3.6 Test baca `/system/resource/print`
- [~] 0.3.7 Dokumentasikan hasil: API v6 bisa lewat Tauri TCP

**Acceptance Criteria:**
- Tauri bisa buka TCP socket dan kirim/terima byte
- Login API plain berhasil ke router v6/v7
- Bisa baca `/system/resource` dan parse response
- Dokumentasi API binary codec untuk Task 1.3

---

### Task 0.4: Spike UDP MNDP (Discovery)
**Estimasi:** 1 hari  
**Dependencies:** 0.3  
**Sub-tasks:**
- [x] 0.4.1 Research UDP MNDP protocol & TLVs (port 5678, broadcast probe)
- [x] 0.4.2 Buat PoC: bind UDP port 5678, kirim MNDP probe (broadcast)
- [x] 0.4.3 Parse paket MNDP (TLV): MAC, identity, versi, platform, IP, board, uptime
- [x] 0.4.4 Dokumentasikan hasil: daftar router terdeteksi dengan info lengkap

**Acceptance Criteria:**
- Backend TS bisa bind UDP dan broadcast ke port 5678
- Router MikroTik terdeteksi dengan identity, IP, dan versi
- Parser MNDP TLV berfungsi

---

## Phase 1: Fondasi (5–7 hari)

### Task 1.1: Scaffold Aplikasi & Routing
**Estimasi:** 1 hari  
**Dependencies:** 0.1  
**Sub-tasks:**
- [x] 1.1.1 Setup React Router: routes untuk `/`, `/voucher`, `/paket`, `/profil`, `/perangkat`, `/setup`, `/pengaturan`
- [x] 1.1.2 Buat layout utama: `AppLayout` dengan header, sidebar, konten
- [x] 1.1.3 Buat `Header` component: logo, nama router, status koneksi, toggle tema, menu
- [x] 1.1.4 Buat `Sidebar` component: menu navigasi dengan ikon (lucide-react)
- [x] 1.1.5 Setup TanStack Query: `QueryClientProvider` di root
- [x] 1.1.6 Setup Zustand store untuk state router config

**Acceptance Criteria:**
- Routing berfungsi, navigasi antar halaman smooth
- Layout responsif dengan sidebar yang bisa diciutkan
- Header menampilkan placeholder status koneksi

---

### Task 1.2: Interface & Abstraksi Transport
**Estimasi:** 2 hari  
**Dependencies:** 0.2, 0.3  
**Sub-tasks:**
- [x] 1.2.1 Buat `src/core/router/transport.ts`: interface `RouterTransport` (connect, disconnect, print, add, set, remove, call)
- [x] 1.2.2 Buat `src/core/router/rest.ts`: implementasi `RestTransport` untuk v7 dengan `fetch`
- [x] 1.2.3 Buat raw socket & TCP client di `server/binary-client.ts`
- [x] 1.2.4 Buat REST client di `server/rest-client.ts`
- [x] 1.2.5 Buat `src/core/router/errors.ts`: custom error types (NetworkError, AuthError, CorsBlockedError, dll)

**Acceptance Criteria:**
- Interface transport jelas dan konsisten
- `RestTransport` & `BinaryRouterClient` bisa konek dan baca `/system/resource`
- Abstraksi siap untuk komunikasi MikroTik

---

### Task 1.3: Codec API Binary & Login
**Estimasi:** 2 hari  
**Dependencies:** 1.2, 0.3  
**Sub-tasks:**
- [x] 1.3.1 Buat `server/binary-protocol.ts`: encode/decode length-prefixed word
- [x] 1.3.2 Implementasi sentence encoder: array word → byte stream dengan word kosong di akhir
- [x] 1.3.3 Implementasi sentence decoder: byte stream → array word, deteksi `!done`, `!trap`, `!re`
- [x] 1.3.4 Buat login handler: login plain (v6.43+/v7) dan MD5 challenge (v6 lama)
- [x] 1.3.5 Implementasi MD5 challenge-response: `/login` dengan challenge
- [x] 1.3.6 Buat `server/binary-client.ts`: implementasi Binary Client dengan socket TCP/TLS
- [x] 1.3.7 Unit tests untuk codec & parser (passing 100%)

**Acceptance Criteria:**
- Codec encode/decode word dengan panjang variabel (1–5 byte) berfungsi
- Login plain berhasil ke v7 dan v6.43+
- Login MD5 challenge berhasil ke v6 lama
- Unit test untuk codec (encode/decode, edge case panjang)

---

### Task 1.4: RouterClient & Version Detection
**Estimasi:** 1 hari  
**Dependencies:** 1.2, 1.3  
**Sub-tasks:**
- [x] 1.4.1 Buat `server/router-manager.ts` & `src/core/router/client.ts`
- [x] 1.4.2 Implementasi auto-detection: coba Binary API & REST secara otomatis
- [x] 1.4.3 Baca `/system/resource` setelah connect: deteksi versi (6.x/7.x), board, uptime, architecture
- [x] 1.4.4 Buat `src/core/router/mappers.ts`: konversi string → number/boolean, normalisasi field
- [x] 1.4.5 Handle error terperinci (auth, network, connection refused)

**Acceptance Criteria:**
- `RouterClient` bisa connect dengan auto-detection transport
- Versi RouterOS terdeteksi dan tersimpan
- Mapper konversi data string RouterOS ke tipe TypeScript

---

### Task 1.5: Halaman Koneksi Router
**Estimasi:** 2 hari  
**Dependencies:** 1.1, 1.4  
**Sub-tasks:**
- [x] 1.5.1 Buat UI ConnectionModal: form host, port, metode (Otomatis/REST/API), username, password
- [x] 1.5.2 Integrasi dengan `RouterManager`: tombol "Hubungkan Router" panggil API backend dan baca resource
- [x] 1.5.3 Tampilkan hasil koneksi: status online, nama router, versi RouterOS, uptime
- [x] 1.5.4 Simpan config terakhir di storage lokal
- [x] 1.5.5 Header dan Dashboard langsung menampilkan info router real-time
- [x] 1.5.6 Error handling dengan pesan jelas (Auth, Network, Connection refused)

**Acceptance Criteria:**
- Form koneksi lengkap dan responsive
- Integrasi ke backend berjalan lancar
- Error handling dengan pesan jelas (CORS, Auth, Network)

---

## Phase 2: Profil, Paket, Setup Router (7–10 hari)

### Task 2.1: CRUD Profil Hotspot
**Estimasi:** 3 hari  
**Dependencies:** 1.4, 1.5  
**Sub-tasks:**
- [~] 2.1.1 Buat service `src/features/profiles/profile-service.ts`: fungsi `listProfiles`, `createProfile`, `updateProfile`, `deleteProfile`
- [~] 2.1.2 Implementasi `listProfiles`: baca `/ip/hotspot/user/profile`, filter profil dengan `shared-users != 1` (badge peringatan)
- [~] 2.1.3 Buat UI tabel profil: kolom Nama, Speed (↑/↓), Masa berlaku, Pengguna per akun, Dipakai oleh, Aksi
- [~] 2.1.4 Buat dialog "Buat/Ubah Profil": form dengan React Hook Form + Zod
- [~] 2.1.5 Input speed: Upload/Download (angka + satuan k/M) → konversi ke `rate-limit` `"{rx}/{tx}"`
- [~] 2.1.6 Input masa berlaku: angka + satuan (menit/jam/hari/minggu) → konversi ke format RouterOS (`30m`, `1d`, dll)
- [~] 2.1.7 Field `shared-users` terkunci di `1`, tidak bisa diubah (tampil sebagai 🔒)
- [~] 2.1.8 Tombol "Perbaiki" untuk profil dengan `shared-users != 1`: set ke 1
- [~] 2.1.9 Opsi lanjutan (collapsible): `idle-timeout`, `keepalive-timeout`, `address-pool`, `mac-cookie-timeout`
- [~] 2.1.10 Hapus profil: cek apakah dipakai user (`/ip/hotspot/user print`), disable tombol jika dipakai

**Acceptance Criteria:**
- List profil tampil dengan data dari router
- Create/update profil berhasil dengan `shared-users=1`
- Rate-limit ter-convert dengan benar (misal 1M/2M)
- Validasi masa berlaku (format RouterOS)
- Delete profil hanya jika tidak dipakai
- Unit test: konversi rate-limit, duration

---

### Task 2.2: CRUD Paket Voucher
**Estimasi:** 2 hari  
**Dependencies:** 2.1  
**Sub-tasks:**
- [~] 2.2.1 Buat schema Dexie untuk tabel `plans`: id, label, profileName, price, limitBytesTotal (opsional)
- [~] 2.2.2 Buat service `src/features/plans/plan-service.ts`: CRUD lokal dengan Dexie
- [~] 2.2.3 Buat UI grid kartu paket: label, harga (besar), speed, masa berlaku, jumlah voucher
- [~] 2.2.4 Dialog "Buat/Ubah Paket": pilih profil (dropdown dari list profil), input harga, label
- [~] 2.2.5 Tombol "Preset": 1 Jam, 3 Jam, 1 Hari, 1 Minggu, 1 Bulan (buat profil + paket sekaligus dengan dialog konfirmasi harga)
- [~] 2.2.6 Badge "Profil hilang" jika profil di router sudah dihapus
- [~] 2.2.7 Hapus paket: hapus dari Dexie (tidak ada validasi, karena hanya data lokal)

**Acceptance Criteria:**
- Paket tersimpan lokal di Dexie
- CRUD paket berfungsi
- Preset membuat profil di router dan paket di lokal
- Harga terformat `Rp 5.000` (titik ribuan)

---

### Task 2.3: Script Masa Berlaku (On-Login & Scheduler)
**Estimasi:** 3 hari  
**Dependencies:** 2.1  
**Sub-tasks:**
- [~] 2.3.1 Buat template script on-login di `src/features/setup/templates/on-login-script.ts`
- [~] 2.3.2 Script: cek scheduler `vm-<user>`, jika belum ada buat dengan `interval=<validity>` dan `on-event` hapus user + scheduler
- [~] 2.3.3 Script: catat waktu mulai di comment user (`vm|start=<date> <time>|...`)
- [~] 2.3.4 Escape semua variable user di script (cegah injeksi)
- [~] 2.3.5 Buat fungsi `installScript(routerClient, profileName, validity)`: tambah script ke profil di field `on-login`
- [~] 2.3.6 Buat fungsi `verifyScript(routerClient, profileName)`: cek apakah script di router sama dengan template
- [~] 2.3.7 Buat fungsi `uninstallScript(routerClient, profileName)`: hapus script dari profil, hapus semua scheduler `vm-*`

**Acceptance Criteria:**
- Script on-login ter-install di profil
- Scheduler ter-create saat login pertama
- User kedaluwarsa dan terhapus tepat `validity` setelah login pertama (test: login, tunggu, cek user terhapus)
- Login kedua tidak mereset waktu mulai (test: login, logout, login lagi, cek scheduler tetap sama)
- Verify mendeteksi perbedaan script
- Uninstall hanya hapus objek prefix `vm-`

---

### Task 2.4: Halaman Setup Router (Checklist & NTP)
**Estimasi:** 2 hari  
**Dependencies:** 2.3  
**Sub-tasks:**
- [~] 2.4.1 Buat UI checklist: Koneksi API, Hotspot server, Jam & NTP, Script masa berlaku, Scheduler pembersih
- [~] 2.4.2 Implementasi cek NTP: baca `/system/ntp/client` (v7) atau `/system/ntp/client` (v6), status `enabled` dan `synced`
- [~] 2.4.3 Tampilkan peringatan jika NTP tidak aktif/sinkron dengan solusi
- [~] 2.4.4 Tombol "Pasang Semua": install script ke semua profil yang punya `validity`
- [~] 2.4.5 Dialog sebelum install: tampilkan isi script (read-only, bisa disalin) dan daftar objek yang dibuat (prefix `vm-`)
- [~] 2.4.6 Tombol "Verifikasi": cek semua script dan scheduler, tampilkan diff jika berbeda
- [~] 2.4.7 Tombol "Copot": hapus semua script dari profil dan hapus scheduler/script dengan prefix `vm-`

**Acceptance Criteria:**
- Checklist menampilkan status setiap item dengan ikon (✔, ⚠, ✖)
- NTP status ter-cek dan peringatan tampil jika mati
- Script ter-install ke profil dengan konfirmasi
- Verify mendeteksi perbedaan
- Uninstall hanya hapus objek `vm-*`

---

## Phase 3: Generator Voucher (5–7 hari)

### Task 3.1: Random Code Generator (6 Karakter)
**Estimasi:** 2 hari  
**Dependencies:** —  
**Sub-tasks:**
- [~] 3.1.1 Buat `src/core/utils/random-code.ts`: fungsi `generateCode()` dengan charset `a-z2-9` (tanpa 0, o, 1, l, i)
- [~] 3.1.2 Implementasi rejection sampling untuk distribusi uniform (tanpa modulo bias)
- [~] 3.1.3 Validasi: kode harus 6 karakter, minimal 1 huruf dan 1 angka (re-generate jika tidak)
- [~] 3.1.4 Unit test: 10.000 kode, cek panjang, charset, aturan huruf+angka
- [~] 3.1.5 Unit test distribusi: chi-square test untuk uniformity (opsional, tapi baik untuk verify)
- [~] 3.1.6 Buat konstanta `MAX_VOUCHERS_PER_BATCH = 8` di `src/core/constants.ts`

**Acceptance Criteria:**
- Semua kode tepat 6 karakter, hanya `[a-z2-9]`
- Tidak ada kode murni huruf atau murni angka
- Distribusi karakter uniform (test 10.000 sample)
- Test pass 100%

---

### Task 3.2: Service Generator Voucher
**Estimasi:** 2 hari  
**Dependencies:** 2.2, 3.1  
**Sub-tasks:**
- [~] 3.2.1 Buat schema Dexie untuk tabel `batches`: id, planId, qty, createdAt, printedAt, samePassword, codes[]
- [~] 3.2.2 Buat `src/features/vouchers/voucher-service.ts`: fungsi `generateBatch(planId, qty, samePassword)`
- [~] 3.2.3 Validasi input: qty harus 1–8 (Zod: `z.number().int().min(1).max(8)`)
- [~] 3.2.4 Generate kode: loop `qty` kali, panggil `generateCode()` untuk username dan password
- [~] 3.2.5 Cek duplikat: baca `/ip/hotspot/user` (sekali per batch), cek username tidak bentrok dengan user existing dan kode lain di batch
- [~] 3.2.6 Jika bentrok, re-generate sampai unik (maks 10 retry per kode, throw error jika gagal)
- [~] 3.2.7 Mode `samePassword=true`: generate satu password, pakai untuk semua user
- [~] 3.2.8 Buat user di router: `/ip/hotspot/user/add` dengan `name`, `password`, `profile`, `comment=vm|b=<batchId>|p=<price>`
- [~] 3.2.9 Progress tracking: state lokal untuk `currentIndex / total`, update setiap user berhasil
- [~] 3.2.10 Simpan batch ke Dexie setelah semua berhasil (atau sebagian jika ada yang gagal)

**Acceptance Criteria:**
- Generate 1–8 voucher tanpa duplikat
- Generate 9+ ditolak dengan error validation
- Mode user=password berfungsi
- User ter-create di router dengan profile dan comment yang benar
- Batch tersimpan di Dexie dengan kode
- Test: generate 5 batch (40 voucher) berturut-turut, tidak ada username kembar

---

### Task 3.3: UI Wizard Buat Batch
**Estimasi:** 2 hari  
**Dependencies:** 3.2  
**Sub-tasks:**
- [~] 3.3.1 Buat dialog 2 langkah: (1) Paket & jumlah, (2) Konfirmasi & buat
- [~] 3.3.2 Langkah 1: pilih paket (dropdown), stepper jumlah (1–8, default 8), radio mode (User=Password / Berbeda)
- [~] 3.3.3 Teks bantu: "Maksimal 8 voucher per generate, sesuai 1 halaman A4. Butuh lebih banyak? Generate lagi."
- [~] 3.3.4 Tampilkan format kode terkunci: `🔒 6 karakter, huruf besar + angka (tanpa O, I, L, 0, 1)`, dengan pratinjau 3 contoh kode (call `generateCode()` 3x)
- [~] 3.3.5 Langkah 2: ringkasan "Membuat 8 voucher Paket 1 Hari (Rp 5.000) = total nilai Rp 40.000"
- [~] 3.3.6 Tombol "Buat & Pratinjau Cetak": panggil `generateBatch()`, tampilkan progress bar
- [~] 3.3.7 Progress bar: `aria-live="polite"`, tampilkan `5/8`, tidak memblokir navigasi
- [~] 3.3.8 Jika ada item gagal: tampilkan daftar gagal dengan tombol "Coba lagi item gagal"
- [~] 3.3.9 Setelah selesai: redirect ke layar Cetak PDF (Task 4.3) dengan batch ID
- [~] 3.3.10 Tombol "Generate lagi" di layar cetak: buka dialog dengan paket dan mode yang sama

**Acceptance Criteria:**
- Wizard 2 langkah jelas dan mudah
- Stepper maksimal 8, tidak bisa lebih
- Progress bar tampil dengan hitungan
- Batch gagal sebagian tetap bisa dicetak
- Redirect otomatis ke pratinjau cetak

---

### Task 3.4: Daftar Batch & Filter
**Estimasi:** 1 hari  
**Dependencies:** 3.2  
**Sub-tasks:**
- [~] 3.4.1 Buat UI tabel batch: kolom Tanggal, Paket, Jumlah (maks 8), Status (Baru n / Aktif n / Kedaluwarsa n), Dicetak?, Aksi
- [~] 3.4.2 Implementasi filter: Paket (dropdown), Tanggal (Hari ini / 7 hari / 30 hari / Kustom), Status cetak (Semua / Sudah / Belum)
- [~] 3.4.3 Simpan filter di session storage (Zustand persist)
- [~] 3.4.4 Tombol "Reset filter" dan hitungan "Menampilkan 12 dari 47 batch"
- [~] 3.4.5 Pilih banyak: checkbox per baris dan "pilih semua hasil filter"
- [~] 3.4.6 Bilah aksi saat ada yang dipilih: "Hapus terpilih" (konfirmasi dengan jumlah)
- [~] 3.4.7 Tombol "Hapus batch kedaluwarsa": dialog konfirmasi dengan dampak ("Menghapus 18 batch (144 voucher)...")
- [~] 3.4.8 Sorting: kolom Tanggal dan Dicetak bisa disortir (default terbaru di atas)
- [~] 3.4.9 State kosong setelah filter: "Tidak ada batch yang cocok" + tombol Reset

**Acceptance Criteria:**
- Tabel batch tampil dengan data dari Dexie
- Filter berfungsi dan tersimpan di session
- Pilih banyak dan hapus massal berfungsi
- Hapus batch kedaluwarsa hanya hapus batch yang semua vouchernya kedaluwarsa
- Sorting berfungsi

---

### Task 3.5: Detail Batch & Hapus
**Estimasi:** 1 hari  
**Dependencies:** 3.2  
**Sub-tasks:**
- [~] 3.5.1 Buat halaman detail batch: tabel kode (username, password disamarkan, tombol mata)
- [~] 3.5.2 Filter status voucher di detail: Semua / Baru / Aktif / Kedaluwarsa
- [~] 3.5.3 Tombol "Salin semua": copy semua kode ke clipboard (format `username:password\n`)
- [~] 3.5.4 Tombol "Cetak PDF": redirect ke layar cetak (Task 4.3)
- [~] 3.5.5 Tombol "Hapus batch": dialog konfirmasi "Menghapus 8 user dan scheduler terkait dari router"
- [~] 3.5.6 Implementasi hapus: loop hapus user (`/ip/hotspot/user/remove`) dan scheduler (`/system/scheduler/remove name=vm-<user>`)
- [~] 3.5.7 Hapus batch dari Dexie setelah semua terhapus dari router

**Acceptance Criteria:**
- Detail batch tampil dengan semua kode
- Password disamarkan dengan tombol toggle visibility
- Salin semua ke clipboard berfungsi
- Hapus batch menghapus user dan scheduler dari router

---

## Phase 4: PDF Layout & Cetak (5–7 hari)

### Task 4.1: Layout Engine & Konstanta (85×54mm, 2×4, Margin 10mm)
**Estimasi:** 2 hari  
**Dependencies:** —  
**Sub-tasks:**
- [~] 4.1.1 Buat `src/features/pdf/voucher-template.ts`: konstanta BRAND, COLORS, VOUCHER, LAYOUT_D (sesuai DESIGN.md §5)
- [~] 4.1.2 Definisikan koordinat voucher Desain D: header (h=17), merek (x=4, t=5.5), harga (x=4, t=14, size=22), durasi (xRight=4, t=14, size=14), dll
- [~] 4.1.3 Buat `src/core/utils/units.ts`: konversi mm → pt (`const MM = 72 / 25.4`)
- [~] 4.1.4 Buat `src/features/pdf/layout.ts`: fungsi `calculateLayout(marginY)` untuk hitung `gapY` dan posisi grid 2×4
- [~] 4.1.5 Formula: `gapY = (pageH - 2*marginY - 4*voucherH) / 3`, validasi `gapY >= 0`
- [~] 4.1.6 Fungsi posisi voucher: `getVoucherPosition(row, col, marginY)` return `{x, y}` (origin kiri-bawah pdf-lib)
- [~] 4.1.7 Unit test: cek posisi dengan marginY default (15mm), cek validasi marginY (gapY < 0 throw error)

**Acceptance Criteria:**
- Konstanta layout sesuai DESIGN.md §5
- Layout 2×4 dengan margin kiri/kanan 10mm tetap
- `gapY` otomatis dari marginY
- Unit test posisi pass

---

### Task 4.2: PDF Renderer (pdf-lib + QR)
**Estimasi:** 3 hari  
**Dependencies:** 4.1, 3.2  
**Sub-tasks:**
- [~] 4.2.1 Buat `src/features/pdf/renderer.ts`: fungsi `renderVoucherPdf(batch, plan, settings)`
- [~] 4.2.2 Load font: embed Inter (regular, bold) dan JetBrains Mono
- [~] 4.2.3 Create page A4 portrait (210×297mm)
- [~] 4.2.4 Loop voucher (maks 8): hitung posisi dengan `getVoucherPosition(row, col)`, draw voucher
- [~] 4.2.5 Draw voucher: background (header hitam jika mode berwarna, putih jika hemat tinta), border, radius
- [~] 4.2.6 Draw teks: merek, label paket, harga (22pt bold putih), durasi (14pt bold hijau `#4ADE80`)
- [~] 4.2.7 Draw username/password: label (6pt abu), nilai (14pt mono bold, 6 karakter)
- [~] 4.2.8 Draw garis pemisah (0.5pt), info masa berlaku, kecepatan, catatan
- [~] 4.2.9 Generate QR code (20×20mm): URL login dengan `?username=X&password=Y`, embed sebagai PNG
- [~] 4.2.10 QR posisi (x=61, t=22), quiet zone 1.5mm, koreksi level M
- [~] 4.2.11 Draw caption QR: "Scan untuk login" (6pt abu)
- [~] 4.2.12 Garis potong opsional (putus-putus 0.3pt abu) jika `settings.showCutLines`
- [~] 4.2.13 Mode hemat tinta: header tanpa blok hitam, hanya garis bawah, semua teks hitam (tanpa hijau)
- [~] 4.2.14 Return `pdfDoc.save()` sebagai `Uint8Array`

**Acceptance Criteria:**
- PDF ter-generate dengan 8 voucher (atau kurang) dalam layout 2×4
- Margin kiri/kanan terukur 10mm (test dengan ruler di PDF viewer)
- Semua teks terbaca (min 6pt), tidak ada yang terpotong
- QR code scannable dengan camera phone
- Mode hemat tinta berfungsi (tanpa blok hitam)
- Font size harga turun otomatis jika ≥ Rp 100.000

---

### Task 4.3: UI Pratinjau & Cetak
**Estimasi:** 2 hari  
**Dependencies:** 4.2  
**Sub-tasks:**
- [~] 4.3.1 Buat halaman `/voucher/cetak/:batchId` dengan pratinjau PDF
- [~] 4.3.2 Render PDF ke canvas atau embed sebagai blob URL (`URL.createObjectURL`)
- [~] 4.3.3 Header: "Batch: 06 Okt 14:02 · Paket 1 Hari · 8 voucher · 1 halaman"
- [~] 4.3.4 Kontrol: checkbox "Mode hemat tinta", "Garis potong"
- [~] 4.3.5 Offset printer: input X/Y (default 0.0mm), tombol "Halaman kalibrasi"
- [~] 4.3.6 Halaman kalibrasi: PDF dengan kotak 85×54mm, penggaris margin 10mm, instruksi
- [~] 4.3.7 Tombol "Unduh PDF": download dengan nama `voucher-<batchId>.pdf`
- [~] 4.3.8 Tombol "Cetak": `window.print()` dengan media query `@media print { scale: 100% }`
- [~] 4.3.9 Setelah cetak/unduh: dialog "Tandai batch sudah dicetak?" (default centang), update `printedAt` di Dexie
- [~] 4.3.10 Re-generate pratinjau saat toggle mode hemat tinta atau garis potong

**Acceptance Criteria:**
- Pratinjau tampil dengan PDF yang benar (1 halaman)
- Mode hemat tinta toggle berfungsi
- Offset printer menambah margin sesuai input (test: offset 5mm, cek posisi voucher)
- Halaman kalibrasi ter-generate dengan ukuran tepat
- Cetak dengan skala 100% menghasilkan voucher 85×54mm (ukur dengan penggaris fisik)
- Batch ditandai dicetak setelah konfirmasi

---

## Phase 5: Panel Leases & Perangkat (3–5 hari)

### Task 5.1: Service Leases & Auto-Refresh
**Estimasi:** 2 hari  
**Dependencies:** 1.4  
**Sub-tasks:**
- [~] 5.1.1 Buat `src/features/leases/lease-service.ts`: fungsi `listDhcpLeases()`, `listHotspotActive()`, `listHotspotHost()`
- [~] 5.1.2 Setup TanStack Query dengan `refetchInterval` (10 detik), pause saat tab tidak aktif (`refetchOnWindowFocus`)
- [~] 5.1.3 Implementasi `listDhcpLeases()`: baca `/ip/dhcp-server/lease`, map field (IP, MAC, hostname, server, status, last-seen)
- [~] 5.1.4 Implementasi `listHotspotActive()`: baca `/ip/hotspot/active`, map field (user, IP, MAC, uptime, bytes in/out)
- [~] 5.1.5 Hitung sisa masa berlaku dari scheduler: baca `/system/scheduler` untuk `vm-<user>`, ambil `next-run` atau hitung dari comment `start=`
- [~] 5.1.6 Implementasi `listHotspotHost()`: baca `/ip/hotspot/host`, map field
- [~] 5.1.7 Fungsi `kickUser(id)`: panggil `/ip/hotspot/active/remove =.id=<id>`

**Acceptance Criteria:**
- List DHCP lease, hotspot active, host berfungsi
- Data auto-refresh setiap 10 detik
- Sisa masa berlaku terhitung dari scheduler (format `2j 14m`)
- Kick user berfungsi

---

### Task 5.2: UI Panel Perangkat (Tab, Tabel, Kick)
**Estimasi:** 2 hari  
**Dependencies:** 5.1  
**Sub-tasks:**
- [~] 5.2.1 Buat halaman `/perangkat` dengan tab: DHCP Lease, Hotspot Aktif, Host
- [~] 5.2.2 Tabel DHCP Lease: kolom IP, MAC, Hostname, Server, Status, Terakhir terlihat, Aksi (Jadikan statis, Blokir)
- [~] 5.2.3 Tabel Hotspot Aktif: kolom User, IP, MAC, Uptime, Sisa masa berlaku, ↓/↑ (bytes), Aksi (Kick)
- [~] 5.2.4 Tabel Host: kolom IP, MAC, Status, Autentikasi
- [~] 5.2.5 Kotak pencarian di atas tabel: filter IP/MAC/hostname/user (client-side)
- [~] 5.2.6 Indikator "Diperbarui 3 dtk lalu" dengan tombol jeda auto-refresh (pause query)
- [~] 5.2.7 Sorting di semua kolom (client-side), kolom IP diurutkan numerik (bukan string)
- [~] 5.2.8 Tombol "Kick" di baris hotspot aktif: popover konfirmasi ringan "Putuskan user X?", panggil `kickUser()`
- [~] 5.2.9 Kolom sisa masa berlaku: warna kuning jika < 1 jam, merah jika < 10 menit
- [~] 5.2.10 State loading (skeleton) dan error (retry)

**Acceptance Criteria:**
- Tab switching smooth
- Tabel tampil dengan data dari router
- Pencarian filter berfungsi
- Sorting berfungsi (termasuk IP numerik)
- Kick user berhasil dan tabel refresh otomatis
- Auto-refresh bisa di-pause/resume
- Warna sisa masa berlaku sesuai threshold

---

### Task 5.3: Fitur Lanjutan (Statis, Blokir) — Opsional
**Estimasi:** 1 hari  
**Dependencies:** 5.2  
**Sub-tasks:**
- [~] 5.3.1 Implementasi "Jadikan statis": update lease dengan `make-static=yes`
- [~] 5.3.2 Implementasi "Blokir": disable lease atau buat ip-binding dengan `blocked=yes`
- [~] 5.3.3 Dialog konfirmasi dengan penjelasan dampak

**Acceptance Criteria:**
- Lease bisa dijadikan statis
- Blokir MAC berfungsi

---

## Phase 6: MNDP Discovery & Build Web (3–5 hari)

### Task 6.1: MNDP Scanner (UDP Discovery)
**Estimasi:** 2 hari  
**Dependencies:** 0.4, 1.5  
**Sub-tasks:**
- [x] 6.1.1 Buat `server/mndp.ts`: fungsi `parseMndpPacket(buffer)` untuk parse TLV (MAC, identity, versi, platform, IP, board, uptime)
- [x] 6.1.2 Implementasi TLV parser: loop byte, baca type (u16) dan length (u16), extract value
- [x] 6.1.3 Buat fungsi `scanMndp(timeout = 3500)` return Promise<DiscoveredDevice[]>
- [x] 6.1.4 Bind UDP port 5678 (broadcast mode), kirim probe broadcast ke 255.255.255.255:5678
- [x] 6.1.5 Listen response selama `timeout`, parse setiap paket, collect devices
- [x] 6.1.6 Return daftar device dengan dedup (MAC unik)
- [x] 6.1.7 Integrasi di modal koneksi: tombol "Pindai Otomatis (MNDP)"
- [x] 6.1.8 Tampilkan hasil scan: list device dengan radio button, identity, IP, versi, board, dan tombol pilih

**Acceptance Criteria:**
- Scan MNDP berhasil deteksi router di jaringan lokal
- Daftar device tampil dengan info lengkap
- Pilih device isi form koneksi otomatis (IP, port default)

---

### Task 6.2: Conditional Build (Web vs Tauri)
**Estimasi:** 1 hari  
**Dependencies:** 6.1  
**Sub-tasks:**
- [~] 6.2.1 Setup Vite config: environment variable `VITE_PLATFORM` (web / tauri)
- [~] 6.2.2 Conditional import: `RawSocket` hanya di Tauri, di web throw error atau return null
- [~] 6.2.3 UI conditional: tombol "Pindai MNDP", "Izinkan sertifikat self-signed" hanya di Tauri
- [~] 6.2.4 Build script: `vite build` (web), `npm run tauri build` (desktop)
- [~] 6.2.5 Test build web: hanya REST transport, input IP manual, tidak ada scan MNDP
- [~] 6.2.6 Banner di build web: "RouterOS v6 tidak didukung di versi web. Gunakan aplikasi desktop."

**Acceptance Criteria:**
- Build web statis berjalan tanpa error (hanya REST)
- Build Tauri mendukung API binary dan MNDP
- Conditional rendering berfungsi

---

### Task 6.3: PWA (Opsional untuk Web)
**Estimasi:** 1 hari  
**Dependencies:** 6.2  
**Sub-tasks:**
- [~] 6.3.1 Install `vite-plugin-pwa`
- [~] 6.3.2 Setup manifest.json: nama, ikon, theme_color, background_color
- [~] 6.3.3 Service worker: cache static assets, network-first untuk API
- [~] 6.3.4 Offline fallback: tampilkan halaman "Tidak tersambung" saat offline

**Acceptance Criteria:**
- PWA installable di browser
- Offline fallback berfungsi

---

## Phase 7: Polish & MVP Finalisasi (5–7 hari)

### Task 7.1: Dashboard Ringkas
**Estimasi:** 2 hari  
**Dependencies:** 2.1, 3.2, 5.1  
**Sub-tasks:**
- [~] 7.1.1 Buat halaman `/` (dashboard) dengan grid kartu
- [~] 7.1.2 Kartu Router: nama, versi, board, uptime (dari `/system/resource`)
- [~] 7.1.3 Kartu Pengguna Aktif: jumlah dari `listHotspotActive()`, tampilkan "12 dari 340 user"
- [~] 7.1.4 Kartu CPU/RAM: dari `/system/resource`
- [~] 7.1.5 Kartu NTP: status sinkron (dari `/system/ntp/client`), waktu saat ini
- [~] 7.1.6 Kartu Voucher per status: Baru n, Aktif n, Kedaluwarsa n (hitung dari Dexie + `/ip/hotspot/user` + scheduler)
- [~] 7.1.7 Bar chart bertumpuk untuk status voucher (opsional: Recharts)
- [~] 7.1.8 Kartu Aksi cepat: tombol "Buat Voucher", "Cetak batch terakhir"
- [~] 7.1.9 Auto-refresh 10 detik (seperti leases), berhenti saat tab tidak aktif

**Acceptance Criteria:**
- Dashboard menampilkan semua info penting
- Data live dengan auto-refresh
- Aksi cepat berfungsi

---

### Task 7.2: Pengaturan (Tampilan Voucher, Backup)
**Estimasi:** 2 hari  
**Dependencies:** 4.2  
**Sub-tasks:**
- [~] 7.2.1 Buat halaman `/pengaturan` dengan sub-tab: Router, Tampilan Voucher, Cetak, Backup, Keamanan
- [~] 7.2.2 Tab "Router": edit config router (nama, host, port), tombol "Tes Koneksi", "Putuskan"
- [~] 7.2.3 Tab "Tampilan Voucher": input nama merek (default "WIFI TKJ", maks 16 karakter), URL login, catatan kaki
- [~] 7.2.4 Pratinjau voucher live di sisi kanan (re-render saat input berubah)
- [~] 7.2.5 Tab "Cetak": input `marginY` (default 15mm), offset printer X/Y, tampilkan `gapY` hasil hitung
- [~] 7.2.6 Peringatan jika `gapY < 0` ("Margin terlalu besar, voucher akan tumpang tindih")
- [~] 7.2.7 Tab "Backup": tombol "Ekspor Data" (download JSON), tombol "Impor Data" (upload JSON)
- [~] 7.2.8 Implementasi ekspor: ambil semua data Dexie (plans, batches, settings), serialize ke JSON
- [~] 7.2.9 Implementasi impor: parse JSON, validasi schema (Zod), insert ke Dexie
- [~] 7.2.10 Peringatan: "Data tersimpan lokal; bersihkan browser = data hilang"
- [~] 7.2.11 Tab "Keamanan": tombol "Ganti passphrase", "Kunci aplikasi sekarang", toggle "Simpan password voucher terenkripsi"

**Acceptance Criteria:**
- Pengaturan router bisa diubah dan tes ulang
- Nama merek voucher dan URL login bisa diubah dengan pratinjau live
- Margin cetak bisa diubah dengan validasi `gapY`
- Backup/restore berfungsi (test: ekspor, clear Dexie, impor, data kembali)
- Ganti passphrase berfungsi (re-encrypt kredensial dengan passphrase baru)

---

### Task 7.3: Dark Mode
**Estimasi:** 1 hari  
**Dependencies:** 1.1  
**Sub-tasks:**
- [~] 7.3.1 Setup CSS variables untuk dark mode di `src/app/theme.css` (sesuai DESIGN.md §2.1)
- [~] 7.3.2 Buat hook `useTheme()` dengan Zustand: state `theme` ('light' | 'dark' | 'system')
- [~] 7.3.3 Toggle di header: ikon matahari/bulan, toggle antara light/dark/system
- [~] 7.3.4 Simpan preferensi di localStorage
- [~] 7.3.5 Apply dark class ke `<html>` untuk trigger CSS variables
- [~] 7.3.6 Test kontras warna WCAG AA di kedua mode

**Acceptance Criteria:**
- Dark mode toggle berfungsi
- Preferensi tersimpan dan ter-load saat peluncuran
- Kontras warna lolos WCAG AA di light dan dark

---

### Task 7.4: Error Handling Global & Toast
**Estimasi:** 1 hari  
**Dependencies:** 1.5, 2.1  
**Sub-tasks:**
- [~] 7.4.1 Buat komponen `Toast` (shadcn/ui sonner atau custom)
- [~] 7.4.2 Buat hook `useToast()` untuk trigger toast dari mana saja
- [~] 7.4.3 Error boundary React: tangkap error render, tampilkan fallback UI dengan tombol "Reload"
- [~] 7.4.4 Integrasi error handler di TanStack Query: `onError` tampilkan toast
- [~] 7.4.5 Pesan error user-friendly sesuai DESIGN.md §6.4: CorsBlockedError, AuthError, NetworkError, dll
- [~] 7.4.6 Kartu error dengan penyebab + solusi (misal: "Router tidak terjangkau" → "Cek IP, kabel, dan /ip service")

**Acceptance Criteria:**
- Toast muncul untuk sukses (3 detik) dan error
- Error boundary tangkap error dan tampilkan fallback
- Pesan error jelas dengan solusi yang actionable

---

### Task 7.5: Keyboard Shortcuts (Desktop)
**Estimasi:** 1 hari  
**Dependencies:** 1.1  
**Sub-tasks:**
- [~] 7.5.1 Install `@react-aria/interactions` atau custom hook untuk keyboard listener
- [~] 7.5.2 Implementasi `Ctrl+K`: open command palette (pencarian cepat rute + voucher)
- [~] 7.5.3 Implementasi `Ctrl+N`: buka dialog buat batch voucher
- [~] 7.5.4 Implementasi `Ctrl+P`: buka layar cetak untuk batch terpilih
- [~] 7.5.5 Implementasi `/`: fokus ke kotak pencarian tabel
- [~] 7.5.6 Implementasi `Ctrl+L`: kunci aplikasi (hapus passphrase dari memori, redirect ke unlock)
- [~] 7.5.7 Tampilkan hint keyboard di tooltip (misal tooltip tombol "Buat Voucher" tampilkan "Ctrl+N")

**Acceptance Criteria:**
- Semua shortcut berfungsi
- Command palette bisa cari rute dan voucher (fuzzy search)
- Hint keyboard tampil di tooltip

---

### Task 7.6: Aksesibilitas & WCAG AA
**Estimasi:** 1 hari  
**Dependencies:** 7.3, 7.4  
**Sub-tasks:**
- [~] 7.6.1 Audit kontras warna: semua teks lolos WCAG AA (4.5:1), test dengan tool (axe DevTools)
- [~] 7.6.2 Audit keyboard navigation: semua fungsi bisa dioperasikan dengan Tab, Enter, Esc
- [~] 7.6.3 Audit `aria-*`: dialog, table, status, progress bar, tab
- [~] 7.6.4 Test screen reader (NVDA/JAWS): navigasi, form, tabel, toast
- [~] 7.6.5 Focus ring 2px `--primary` selalu terlihat
- [~] 7.6.6 Target klik minimal 32×32px (desktop), 44×44px (mobile)
- [~] 7.6.7 Tidak mengandalkan warna saja: semua status punya ikon + teks (● Terhubung, ✔ OK)
- [~] 7.6.8 Test zoom 200%: semua konten masih terbaca dan fungsional

**Acceptance Criteria:**
- Audit axe DevTools tidak ada error critical
- Semua fungsi bisa dioperasikan dengan keyboard
- Screen reader bisa navigasi dan membaca konten dengan jelas
- Kontras lolos WCAG AA di light dan dark

---

### Task 7.7: Unit & Integration Test
**Estimasi:** 2 hari  
**Dependencies:** 3.1, 4.1, 5.1  
**Sub-tasks:**
- [~] 7.7.1 Unit test `generateCode()`: panjang, charset, aturan huruf+angka, 10.000 sample
- [~] 7.7.2 Unit test konversi: `rate-limit` (1M/2M), duration (1d, 3h), currency format (Rp 5.000)
- [~] 7.7.3 Unit test layout PDF: posisi voucher, margin 10mm, `gapY` calculation
- [~] 7.7.4 Unit test codec API binary: encode/decode word, panjang variabel (1–5 byte), edge case (0, 127, 16383, dll)
- [~] 7.7.5 Integration test REST: setup MSW mock server, test `listProfiles()`, `createProfile()`, error handling
- [~] 7.7.6 Integration test API binary: fake socket (buffer queue), test login, print, add, remove
- [~] 7.7.7 Test Dexie: CRUD plans, batches, kredensial encryption
- [~] 7.7.8 Coverage target: 70% (core utils dan router transport wajib 90%+)

**Acceptance Criteria:**
- Semua unit test pass
- Integration test REST dan API binary pass
- Coverage ≥ 70%

---

## Phase 8: MVP Validation & Bug Fix (3–5 hari)

### Task 8.1: Test End-to-End (Manual)
**Estimasi:** 2 hari  
**Dependencies:** Semua task sebelumnya  
**Sub-tasks:**
- [~] 8.1.1 Test flow onboarding: koneksi ke router v6 dan v7, passphrase, tes koneksi, simpan
- [~] 8.1.2 Test CRUD profil: buat profil dengan speed dan masa berlaku, verifikasi di router, hapus profil
- [~] 8.1.3 Test setup script: install script on-login, login user, cek scheduler ter-create, tunggu expire, cek user terhapus
- [~] 8.1.4 Test login kedua: login, logout, login lagi, cek scheduler tidak reset
- [~] 8.1.5 Test generate voucher: buat 8 voucher, cek tidak ada duplikat username, cek user ter-create di router
- [~] 8.1.6 Test generate massal: buat 5 batch (40 voucher) berturut-turut, cek tidak ada duplikat di semua batch
- [~] 8.1.7 Test PDF: cetak batch, ukur dengan penggaris fisik (voucher 85×54mm, margin 10mm)
- [~] 8.1.8 Test kick user: login dengan voucher, kick dari panel perangkat, cek user terputus
- [~] 8.1.9 Test backup/restore: ekspor data, clear Dexie, impor, cek semua data kembali
- [~] 8.1.10 Test dark mode: toggle, cek kontras, simpan preferensi, reload, cek preferensi ter-load

**Acceptance Criteria:**
- Semua flow utama berfungsi tanpa error
- Kriteria penerimaan MVP di DEV-SPEC.md §12 terpenuhi semua

---

### Task 8.2: Bug Triage & Fix
**Estimasi:** 2 hari  
**Dependencies:** 8.1  
**Sub-tasks:**
- [~] 8.2.1 Collect bug dari test manual, prioritas: critical → high → medium
- [~] 8.2.2 Fix critical bug: tidak bisa connect, duplikat username, PDF layout rusak
- [~] 8.2.3 Fix high bug: error handling tidak tampil, scheduler tidak expire tepat waktu
- [~] 8.2.4 Fix medium bug: UI glitch, teks terpotong, spacing tidak konsisten
- [~] 8.2.5 Regression test setelah fix

**Acceptance Criteria:**
- Semua critical dan high bug ter-fix
- Regression test pass

---

### Task 8.3: Performance Optimization
**Estimasi:** 1 hari  
**Dependencies:** 8.2  
**Sub-tasks:**
- [~] 8.3.1 Lighthouse audit: Performance, Accessibility, Best Practices, SEO (target ≥ 90 kecuali SEO)
- [~] 8.3.2 Lazy load komponen: route-based code splitting dengan `React.lazy()`
- [~] 8.3.3 Memoize komponen berat: `React.memo()` untuk tabel, card grid
- [~] 8.3.4 Debounce input pencarian (300ms)
- [~] 8.3.5 Optimize bundle size: analyze dengan `vite-plugin-bundle-analyzer`, tree-shake unused code

**Acceptance Criteria:**
- Lighthouse Performance ≥ 90
- Bundle size < 500KB (gzipped)
- First load < 2 detik (localhost)

---

## Phase 9: Documentation & Deployment (2–3 hari)

### Task 9.1: User Documentation (README)
**Estimasi:** 1 hari  
**Dependencies:** 8.3  
**Sub-tasks:**
- [~] 9.1.1 Update `README.md`: deskripsi aplikasi, fitur, screenshot, cara install
- [~] 9.1.2 Dokumentasi router setup: cara buat user khusus, policy yang dibutuhkan, enable API/REST
- [~] 9.1.3 Panduan cetak: skala 100%, halaman kalibrasi, offset printer
- [~] 9.1.4 Troubleshooting: CORS error, koneksi gagal, NTP tidak sinkron
- [~] 9.1.5 Dokumentasi API transport: kapan pakai REST vs API binary

**Acceptance Criteria:**
- README lengkap dan jelas
- User baru bisa setup router dan aplikasi dengan panduan README

---

### Task 9.2: Developer Documentation
**Estimasi:** 1 hari  
**Dependencies:** 8.3  
**Sub-tasks:**
- [~] 9.2.1 Dokumentasi arsitektur: diagram folder structure, data flow, transport abstraction
- [~] 9.2.2 Dokumentasi API: interface `RouterTransport`, `RawSocket`, cara extend untuk protocol baru
- [~] 9.2.3 Dokumentasi testing: cara run test, mock setup (MSW, fake socket)
- [~] 9.2.4 Dokumentasi build: cara build web vs Tauri, environment variable
- [~] 9.2.5 Contributing guide: code style, commit message, PR template

**Acceptance Criteria:**
- Developer baru bisa onboard dengan dokumentasi
- Arsitektur terdokumentasi dengan diagram

---

### Task 9.3: Tauri Build & Release
**Estimasi:** 1 hari  
**Dependencies:** 8.3  
**Sub-tasks:**
- [~] 9.3.1 Setup Tauri 2: `tauri.conf.json`, ikon, identifier, permissions (TCP, UDP, filesystem)
- [~] 9.3.2 Build desktop: Windows (`.exe`, `.msi`), Linux (`.AppImage`, `.deb`)
- [~] 9.3.3 Test instalasi di Windows dan Linux: install, run, connect to router, generate voucher, cetak PDF
- [~] 9.3.4 Setup auto-update (opsional): Tauri updater dengan GitHub releases
- [~] 9.3.5 Release v1.0.0: tag git, upload build ke GitHub Releases, changelog

**Acceptance Criteria:**
- Build Tauri berjalan di Windows dan Linux
- Instalasi dan run tanpa error
- Release v1.0.0 tersedia untuk download

---

## Summary & Acceptance Criteria MVP

**Total Estimasi:** 40–60 hari (8–12 minggu)

### Kriteria Penerimaan MVP (dari DEV-SPEC.md §12):
- ✅ Konek ke RouterOS v6 dan v7, menampilkan versi
- ✅ Profil dengan rate-limit, shared-users=1, dan masa berlaku ter-create di router
- ✅ Voucher kedaluwarsa tepat validity setelah login pertama, tetap terhitung walau disconnect
- ✅ Login kedua tidak mereset waktu mulai
- ✅ Generate 1–8 voucher tanpa duplikat; permintaan 9+ ditolak oleh UI dan service
- ✅ Generate 5 batch (40 voucher) berturut-turut tidak menghasilkan username kembar
- ✅ 1 batch = 1 halaman A4; batch <8 menaruh voucher dari slot 1, slot lain kosong
- ✅ Username dan password tepat 6 karakter [a-z0-9], minimal 1 huruf dan 1 angka (test 10.000 kode)
- ✅ PDF A4 portrait, 8 voucher (2×4) 85×54mm, margin kiri/kanan 10mm, jarak vertikal rata otomatis
- ✅ Panel DHCP lease dan hotspot aktif auto-refresh, kick berfungsi
- ✅ Kredensial tersimpan terenkripsi
- ✅ Unit test: generateCode, mapper, rate-limit, layout PDF, codec API; Integration test: MSW, fake socket

### Deliverables:
- Aplikasi desktop (Tauri) untuk Windows dan Linux
- Build web statis (opsional, hanya untuk v7 dengan REST)
- Dokumentasi user dan developer
- Unit + integration test dengan coverage ≥ 70%

---

**End of tasks.md**
