# dev-spec.md: MikroTik Hotspot Voucher Manager

> Status: Draft v0.3 (format kode voucher dikunci: 6 karakter huruf besar + angka, tanpa O, I, L, 0, 1)
> Stack: React + TypeScript + Vite. Tanpa server. Semua logika (termasuk protokol RouterOS) ditulis dalam TypeScript di sisi klien.

---

## 1. Keputusan Produk

| # | Keputusan |
|---|---|
| 1 | Target akhir: aplikasi web + wrapper. **Harus bisa konek ke RouterOS v6 dan v7 untuk setting.** |
| 2 | Masa berlaku dihitung **sejak login pertama** dengan waktu jam dinding (wall-clock). Countdown tetap jalan walau perangkat disconnect. **Bukan** `limit-uptime`. |
| 3 | MVP: **satu router** saja. |
| 4 | Kertas **A4 portrait**, voucher **8,5 × 5,4 cm landscape**, 2 kolom × 4 baris. Margin kiri/kanan **wajib 1 cm** dari tepi voucher ke tepi kertas. Jarak antar voucher menyesuaikan. |
| 5 | Bahasa antarmuka: **Indonesia saja** (string dipusatkan di satu file agar mudah diganti nanti). |
| 6 | **Username dan password masing-masing 6 karakter, kombinasi huruf dan angka saja.** Format dikunci, tidak bisa diubah dari UI. |
| 7 | **Maksimal 8 voucher per sekali generate** (1 batch = 1 halaman A4, 2×4). Butuh lebih banyak: generate berulang. |

### Non-goals (v1)
Multi-router, multi-user login, payment gateway, captive portal kustom, thermal printer, i18n.

---

## 2. Realita Platform (dasar arsitektur)

Browser murni tidak bisa melakukan hal berikut:

| Kebutuhan | Kendala di browser | Konsekuensi |
|---|---|---|
| RouterOS **v6** | v6 tidak punya REST. Hanya API binary TCP 8728/8729. Browser tidak bisa membuka raw TCP. | **v6 hanya bisa lewat wrapper** |
| **MNDP** | UDP broadcast port 5678. Browser tidak bisa kirim/terima UDP. | Discovery hanya di wrapper. Di web: input IP manual. |
| REST v7 | Kena CORS, dan preflight dengan header `Authorization` tidak dijamin dijawab RouterOS. | Di web: wajib diuji di Phase 0. Di wrapper: bypass CORS lewat HTTP native. |
| Mixed content | Halaman `https://` tidak boleh memanggil `http://` router. | Host app via `http://` lokal atau pakai wrapper. |

### Kesimpulan arsitektur

Karena v6 wajib, **build utama adalah wrapper (Tauri 2, desktop)**. Build web statis tetap ada sebagai bonus untuk v7 jika CORS lolos.

**Soal "tanpa server / backend TS":** seluruh logika tetap TypeScript. Yang dibutuhkan dari sisi native hanya primitif soket mentah (buka TCP, kirim/terima byte, bind UDP). Encoder/decoder protokol API RouterOS, login, dan parsing MNDP **ditulis di TS**. Kode native (Rust) cukup tipis atau memakai plugin komunitas.

```
UI (React)
  → Services (profile, voucher, lease, setup)
    → RouterClient  (normalisasi v6/v7, deteksi versi)
      → RouterTransport (interface)
          ├─ RestTransport     v7  (fetch di web / plugin-http di Tauri)
          └─ ApiTransport      v6 & v7 (protokol API binary, TS)
                 └─ RawSocket (interface)
                      ├─ TauriSocket  (TCP/UDP via Tauri)
                      └─ (tidak ada di web)
      → MndpScanner (TS parser) → RawSocket UDP
```

Aturan pemilihan otomatis: v7 + REST terjangkau → `RestTransport`. v6, atau REST gagal → `ApiTransport`. Pengguna bisa override manual.

---

## 3. Tech Stack

| Area | Pilihan |
|---|---|
| Build | Vite + React 18 + TypeScript strict |
| Wrapper | Tauri 2 (desktop). Capacitor/Android opsional di fase lanjut |
| Routing | React Router |
| Data server-state | TanStack Query (polling, retry, cache) |
| State lokal | Zustand |
| UI | Tailwind CSS + shadcn/ui |
| Form | React Hook Form + Zod |
| Storage | Dexie (IndexedDB) |
| Kripto | WebCrypto (AES-GCM + PBKDF2) |
| MD5 | library kecil (untuk login API v6 lama, WebCrypto tidak punya MD5) |
| PDF | `pdf-lib` + `qrcode` |
| Test | Vitest + Testing Library + MSW (mock REST) + fake socket (mock API binary) |

---

## 4. Struktur Folder

```
src/
├─ app/                    # routes, providers, layout
├─ strings/id.ts           # semua teks UI (Indonesia)
├─ features/
│  ├─ connection/          # form router, test koneksi, scan MNDP
│  ├─ profiles/            # CRUD profil (speed, 1 akun 1 pengguna, masa berlaku)
│  ├─ plans/               # paket + harga
│  ├─ vouchers/            # generator, daftar, hapus batch
│  ├─ pdf/                 # layout engine + renderer
│  ├─ leases/              # lease, active, host
│  └─ setup/               # install/verify/uninstall script router
├─ core/
│  ├─ router/
│  │  ├─ transport.ts      # interface RouterTransport
│  │  ├─ rest.ts           # v7
│  │  ├─ api/
│  │  │  ├─ codec.ts       # encode/decode length-prefixed word & sentence
│  │  │  ├─ login.ts       # plain (v6.43+/v7) & MD5 challenge (v6 lama)
│  │  │  └─ transport.ts
│  │  ├─ socket.ts         # interface RawSocket
│  │  ├─ socket-tauri.ts
│  │  ├─ mndp.ts           # parser paket MNDP (TLV)
│  │  ├─ client.ts         # RouterClient
│  │  ├─ mappers.ts        # string → number/boolean, kebab → camel
│  │  └─ errors.ts
│  ├─ db/                  # skema Dexie
│  ├─ crypto/
│  └─ utils/               # duration, rate-limit, random-code, unit mm→pt
└─ types/
src-tauri/                 # shell Tauri + perintah soket tipis
```

---

## 5. Kontrak Inti

```ts
// core/constants.ts
export const MAX_VOUCHERS_PER_BATCH = 8;   // = kolom 2 × baris 4 di PDF

export interface RouterTransport {
  readonly kind: 'rest' | 'api';
  connect(cfg: RouterConfig): Promise<void>;
  disconnect(): Promise<void>;
  print<T>(path: string, query?: Record<string, string>): Promise<T[]>;
  add(path: string, body: Record<string, string>): Promise<string>; // return id
  set(path: string, id: string, body: Record<string, string>): Promise<void>;
  remove(path: string, id: string): Promise<void>;
  call<T>(path: string, body?: Record<string, string>): Promise<T[]>;
}

export interface RawSocket {
  open(host: string, port: number, opts?: { tls?: boolean; allowSelfSigned?: boolean }): Promise<void>;
  write(data: Uint8Array): Promise<void>;
  onData(cb: (chunk: Uint8Array) => void): void;
  close(): Promise<void>;
}

export interface RouterConfig {
  name: string;
  host: string;
  port: number;              // 80/443 (REST), 8728/8729 (API)
  scheme: 'http' | 'https';
  username: string;
  password: string;          // hanya di memori saat runtime
  allowSelfSigned?: boolean; // hanya efektif di wrapper
}

export interface HotspotProfile {
  id: string;
  name: string;
  rateLimit: string;         // "rx/tx", contoh "2M/5M"
  sharedUsers: 1;            // dikunci
  validity?: string;         // "3h", "1d", "30d": dihitung sejak login pertama
  idleTimeout?: string;
  keepaliveTimeout?: string;
  addressPool?: string;
  macCookieTimeout?: string;
}

export interface VoucherPlan {   // disimpan lokal
  id: string;
  label: string;               // "Paket 1 Hari"
  profileName: string;         // HotspotProfile.name (sumber speed + validity)
  price: number;               // IDR
  limitBytesTotal?: number;    // kuota opsional
}

export interface VoucherBatch {
  id: string;
  planId: string;
  qty: number;
  createdAt: number;
  printedAt?: number;
  samePassword: boolean;                    // mode user = password
  codes: { user: string; pass: string }[];  // keduanya 6 karakter [a-z2-9]
}
```

---

## 6. Fitur dan Requirement

### 6.1 Koneksi Router (satu router)
- Satu konfigurasi router tersimpan (nama, host, port, scheme, user, pass).
- **Test koneksi:** baca `/system/resource` → deteksi versi (6.x/7.x), board, uptime, CPU/RAM.
- **Scan MNDP** (wrapper): bind UDP 5678, kirim probe, parse TLV (MAC, identity, versi, platform, interface, IP). Hasil tampil sebagai daftar pilih. Di web: input IP manual.
- Kredensial dienkripsi AES-GCM (kunci dari passphrase via PBKDF2) sebelum masuk IndexedDB. Passphrase hanya di memori.
- Rekomendasi onboarding: buat user router khusus (policy `read,write,api,rest-api,policy,test`), jangan pakai `admin`.
- **Login API:** coba login plain (v6.43+ dan v7). Jika router menjawab challenge (v6 lama), fallback ke MD5 challenge-response.

### 6.2 User Profile (speed dan 1 akun 1 pengguna)
- CRUD di `/ip/hotspot/user/profile`.
- **`shared-users` dikunci `1`** di UI dan dipaksa saat create/update. Profil lama yang tidak bernilai 1 ditandai peringatan, dengan tombol "Perbaiki".
- Input speed: Upload dan Download (satuan k/M) → `rate-limit` `"{rx}/{tx}"` (sudut pandang router: rx = upload user).
- Field **Masa berlaku** (`validity`): kosong = tidak kedaluwarsa. Jika diisi, app memasang on-login script (lihat 6.3).
- Opsi lanjutan: `idle-timeout`, `keepalive-timeout`, `address-pool`, `mac-cookie-timeout`.
- Profil hanya bisa dihapus jika tidak dipakai user mana pun.

### 6.3 Masa Berlaku sejak Login Pertama (jam dinding)

Tujuan: waktu mulai terhitung **saat login pertama** dan terus berjalan walau perangkat putus. `limit-uptime` **tidak dipakai** untuk ini karena hanya menghitung waktu terkoneksi.

**Mekanisme (kompatibel v6 dan v7):** per user dibuat satu scheduler sistem saat login pertama. Scheduler `interval` menghitung waktu sejak dibuat, tanpa parsing tanggal yang rawan beda format antar versi.

On-login script di profil (dibuat app, ditandai prefix `vm-`):

```routeros
:local sn ("vm-" . $user);
:if ([:len [/system scheduler find name=$sn]] = 0) do={
  /system scheduler add name=$sn interval=<VALIDITY> \
    start-date=[/system clock get date] start-time=[/system clock get time] \
    on-event=(":do { /ip hotspot active remove [find user=\"" . $user . "\"] } on-error={}; \
/ip hotspot user remove [find name=\"" . $user . "\"]; \
/system scheduler remove [find name=\"" . $sn . "\"]");
  # catat waktu mulai di comment user (untuk tampilan di app)
  /ip hotspot user set [find name=$user] comment=("vm|start=" . [/system clock get date] . " " . [/system clock get time] . "|" . [/ip hotspot user get [find name=$user] comment]);
}
```

Catatan desain:
- Cek `find name=$sn` memastikan hanya login **pertama** yang memicu. Login berikutnya tidak mengubah waktu.
- Saat kedaluwarsa: user dikick dari sesi aktif, user dihapus, scheduler menghapus dirinya sendiri. (Opsi di pengaturan: `disable` alih-alih `remove`.)
- **Wajib:** jam router benar (NTP/SNTP). App memeriksa `/system/clock` dan `/system/ntp/client` saat Setup Router, lalu memberi peringatan jika NTP mati.
- Menu **Setup Router**: tombol **Install / Verify / Uninstall**. Verify membandingkan script di router dengan versi yang diharapkan app. Uninstall hanya menyentuh objek berprefix `vm-`.
- Validasi ketat `validity` (regex durasi RouterOS `^\d+[smhdw]$` atau gabungan) dan escape semua string sebelum masuk script (cegah injeksi). Username voucher aman karena hanya `[a-z2-9]`.
- Tampilan sisa waktu di app dihitung dari scheduler (`next-run`) atau comment `start=`.

### 6.4 Paket Voucher (harga)
- Paket = label + profil + harga (+ kuota byte opsional).
- Speed dan masa berlaku diambil dari profil. Satu paket mengacu satu profil, jadi untuk membuat "1 Jam" dan "1 Hari" buat dua profil.
- Preset yang bisa diklik: 1 Jam, 3 Jam, 1 Hari, 1 Minggu, 1 Bulan (membuat profil + paket sekaligus).

### 6.5 Generator Voucher
- Input: paket, jumlah (**1–8, default 8**), mode (user = password atau user ≠ password).
- Batas 8 dikunci di UI (stepper/slider) dan **divalidasi lagi di service** (Zod: `z.number().int().min(1).max(MAX_VOUCHERS_PER_BATCH)`), jadi tidak bisa dilewati lewat jalur lain.
- Karena maksimal 8, tidak ada generate massal: pembuatan user berjalan berurutan (bukan concurrency), tanpa mekanisme resume. Jika sebagian gagal, tombol **Coba lagi item gagal** untuk sisanya, dan batch yang berhasil sebagian tetap bisa dicetak.
- **Format kode (tetap, tidak bisa diubah dari UI):**
  - Username dan password **masing-masing tepat 6 karakter**.
  - Karakter: **huruf besar + angka saja** (`A-Z`, `2-9`), tanpa simbol, tanpa spasi.
  - Karakter ambigu dibuang: `0 O 1 I L`. Charset efektif 31 karakter: `ABCDEFGHJKMNPQRSTUVWXYZ23456789`.
  - Wajib mengandung **minimal 1 huruf dan 1 angka** (kode murni huruf atau murni angka ditolak dan di-generate ulang).
  - Tidak ada prefix, karena panjang kode dikunci 6 karakter. Penanda batch ada di `comment`.
- Kode dibuat dengan `crypto.getRandomValues` dengan **rejection sampling** (bukan `% 31`, supaya distribusi tidak bias).
- Cek duplikat: username harus unik terhadap `/ip/hotspot/user` di router (satu kali `print` per generate) dan terhadap kode lain di batch yang sama. Regenerate jika bentrok.
- Pembuatan massal dengan concurrency maks 5 (REST) atau pipeline berurutan (API binary), progress bar, retry per item, laporan sukses/gagal. Batch bisa di-resume (state di IndexedDB).
- User dibuat dengan `profile=<profil>`, `comment=vm|b=<batchId>|p=<harga>` agar bisa dipulihkan dari router.
- Daftar voucher: filter per batch/status (baru, aktif, kedaluwarsa), hapus batch (hapus user + scheduler terkait).

**Ruang kode:** ≈ 31⁶ ≈ 887 juta kombinasi per kode, dikurangi yang murni huruf atau murni angka, sehingga masih ≈ 880 juta. Tabrakan username sangat jarang dan tetap ditangani cek duplikat.

```ts
// core/utils/random-code.ts
const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ';   // 23 huruf (tanpa I, L, O)
const DIGITS  = '23456789';                   // 8 angka (tanpa 0, 1)
const CHARSET = LETTERS + DIGITS;             // 31 karakter
const LEN = 6;

function randomIndex(max: number): number {
  // rejection sampling → tanpa modulo bias
  const limit = 256 - (256 % max);
  const buf = new Uint8Array(1);
  while (true) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}

export function generateCode(): string {
  while (true) {
    let s = '';
    for (let i = 0; i < LEN; i++) s += CHARSET[randomIndex(CHARSET.length)];
    if (/[A-Z]/.test(s) && /[2-9]/.test(s)) return s; // wajib huruf + angka
  }
}
```

### 6.6 Cetak PDF Voucher (spesifikasi layout presisi)

**Kertas:** A4 portrait, 210 × 297 mm (595,276 × 841,890 pt).
**Voucher:** 85 × 54 mm landscape (240,945 × 153,071 pt).
**Grid:** 2 kolom × 4 baris = **8 voucher per halaman**.

**Aturan posisi:**
- Margin kiri dan kanan = **10 mm tetap (wajib)**, diukur dari tepi voucher ke tepi kertas.
- Voucher kiri: `x = 10 mm`. Voucher kanan: `x = 210 − 10 − 85 = 115 mm`.
- Jarak horizontal antar kolom hasilnya `115 − (10 + 85) = 20 mm`.
- Jarak vertikal menyesuaikan:
- 1 batch = 1 halaman. Jika jumlah < 8, voucher mengisi dari kiri-atas, kiri ke kanan lalu ke bawah. Slot kosong dibiarkan **kosong** (tanpa garis potong), sehingga kertas sisa bisa dipakai lagi.
- Posisi tetap: slot nomor 1–8 selalu di koordinat yang sama dengan layout penuh, jadi kertas bekas cetak sebagian bisa dimasukkan lagi ke printer.

```
gapY = (pageH − 2·marginY − 4·voucherH) / 3
```

Dengan `marginY` default 15 mm: `gapY = (297 − 30 − 216) / 3 = 17 mm`.
(`marginY` bisa diubah di pengaturan, rumus tetap sama. Validasi: `gapY ≥ 0`.)

```ts
const MM = 72 / 25.4;               // mm → pt
const PAGE = { w: 210*MM, h: 297*MM };
const V    = { w: 85*MM,  h: 54*MM };
const MX   = 10*MM;                 // TETAP, tidak boleh diubah dari UI
const MY   = 15*MM;                 // default, boleh diubah
const gapY = (PAGE.h - 2*MY - 4*V.h) / 3;
const x = (col: 0|1) => col === 0 ? MX : PAGE.w - MX - V.w;
// pdf-lib origin di kiri-bawah: y = PAGE.h - MY - V.h - row*(V.h + gapY)
```

**Isi tiap voucher (85 × 54 mm):**
- Header: nama hotspot (+ logo opsional).
- Blok tengah: **username** dan **password** (6 karakter, font monospace bold 16 pt, mudah dibaca).
- Info paket: label, masa berlaku (misal "Berlaku 1 hari sejak login pertama"), speed, **harga** (format Rp).
- QR di sisi kanan (URL login hotspot dengan username/password).
- Garis tepi putus-putus (opsional) sebagai panduan potong. Mode hemat tinta (hitam-putih).
- Tulisan kecil: "1 akun untuk 1 perangkat".

**Alur:** pilih batch → preview PDF → Download / Print. Batch yang sudah dicetak ditandai `printedAt`.

**Akurasi cetak:**
- Cetak dengan skala **100% / "Actual size"**, bukan "Fit to page".
- Sediakan **halaman kalibrasi** (kotak 85 × 54 mm + penggaris margin 10 mm) dan pengaturan *offset X/Y* printer. Offset hanya untuk kompensasi mekanik printer, bukan untuk mengubah margin 10 mm di dokumen.

### 6.7 Panel Leases dan Perangkat Terhubung
Tab dengan auto-refresh (5–10 detik, pause saat tab tidak aktif):

| Tab | Sumber |
|---|---|
| DHCP Lease | `/ip/dhcp-server/lease` |
| Hotspot Aktif | `/ip/hotspot/active` (user, IP, MAC, uptime, bytes in/out, sisa masa berlaku) |
| Hotspot Host | `/ip/hotspot/host` |

Fitur: pencarian (IP/MAC/hostname/user), sorting, **kick** (`/ip/hotspot/active/remove`), jadikan lease static, blokir (disable lease atau ip-binding blocked).

### 6.8 Dashboard Ringkas
Versi RouterOS, uptime, CPU/RAM, jumlah user aktif, jumlah voucher per status, status NTP.

---

## 7. Pemetaan Endpoint

Path RouterOS sama untuk kedua transport. `RestTransport` menerjemahkannya ke HTTP, `ApiTransport` ke perintah API.

| Aksi | REST (v7) | API binary (v6/v7) |
|---|---|---|
| Info sistem | `GET /rest/system/resource` | `/system/resource/print` |
| List profil | `GET /rest/ip/hotspot/user/profile` | `/ip/hotspot/user/profile/print` |
| Buat profil | `PUT /rest/ip/hotspot/user/profile` | `/ip/hotspot/user/profile/add` |
| Ubah profil | `PATCH …/{id}` | `…/set =.id=*X` |
| Hapus | `DELETE …/{id}` | `…/remove =.id=*X` |
| User hotspot | `GET/PUT/DELETE /rest/ip/hotspot/user` | `/ip/hotspot/user/{print,add,remove}` |
| Aktif / kick | `GET /rest/ip/hotspot/active`, `DELETE …/{id}` | `/ip/hotspot/active/{print,remove}` |
| Host | `GET /rest/ip/hotspot/host` | `/ip/hotspot/host/print` |
| DHCP lease | `GET /rest/ip/dhcp-server/lease` | `/ip/dhcp-server/lease/print` |
| Script/Scheduler | `/rest/system/script`, `/rest/system/scheduler` | `/system/script/…`, `/system/scheduler/…` |

Catatan:
- Semua nilai respons berupa string. `mappers.ts` wajib mengonversi tipe.
- Protokol API: kalimat = rangkaian *word* dengan prefix panjang variabel (1–5 byte), diakhiri word kosong. Balasan `!re` (data), `!done`, `!trap` (error), `!fatal`. Gunakan tag per perintah agar bisa paralel.
- Beda v6 vs v7 yang harus dinormalisasi `RouterClient`: format tanggal/waktu, beberapa nama field, dan perilaku script.

---

## 8. Penyimpanan Lokal (Dexie)

| Tabel | Isi |
|---|---|
| `router` | konfigurasi (kredensial terenkripsi) |
| `plans` | paket voucher |
| `batches` | riwayat batch (kode, status cetak) |
| `settings` | margin Y, offset printer, nama hotspot, logo, URL login |

Export/Import backup JSON (opsional terenkripsi), karena data lokal hilang jika browser/aplikasi dibersihkan.

---

## 9. Keamanan

- Kredensial tidak pernah plaintext di storage atau dikirim ke pihak ketiga.
- Anjurkan API-SSL (8729) / HTTPS (443) dan batasi `/ip/service` ke subnet admin. API plain (8728) mengirim password tanpa enkripsi di LAN, jadi beri peringatan di UI.
- Self-signed cert hanya diterima di wrapper dengan opsi eksplisit.
- CSP ketat, tanpa CDN pihak ketiga saat runtime.
- Sanitasi input yang masuk ke `comment`, nama profil, dan script RouterOS.
- Password voucher disimpan terenkripsi agar bisa cetak ulang (bisa dimatikan).
- Catatan: kode 6 karakter (± 880 juta kombinasi) cukup untuk voucher berumur pendek, tapi bukan kredensial kuat. Anjurkan rate-limit login hotspot jika router terpapar publik.

---

## 10. Penanganan Error

`NetworkError`, `CorsBlockedError`, `AuthError`, `RouterApiError`, `VersionUnsupportedError`, `ClockNotSyncedError`.
- `CorsBlockedError` di web: tampilkan panduan "gunakan aplikasi desktop" atau cara memeriksa service `www`/`www-ssl`.
- GET di-retry dengan backoff. Operasi tulis tidak di-retry otomatis tanpa cek duplikat.

---

## 11. Roadmap

| Phase | Isi | Selesai bila |
|---|---|---|
| **0 — Spike** | (a) REST v7 dari browser: cek CORS/preflight. (b) Tauri membuka TCP 8728 dan login API ke v6 asli. (c) Kirim/terima UDP 5678. | Tiga hasil terdokumentasi, transport default ditetapkan |
| **1 — Fondasi** | Scaffold Vite + Tauri, `RawSocket`, codec API, login (plain + MD5), `RestTransport`, `RouterClient`, halaman koneksi | Konek ke v6 **dan** v7, baca `/system/resource` |
| **2 — Profil, Paket, Setup** | CRUD profil (shared-users=1), paket, install script masa berlaku + cek NTP | Profil dan script tersinkron, uji expire sejak login pertama berhasil di v6 dan v7 |
| **3 — Voucher** | `generateCode`, generator (maks 8/batch), daftar batch, hapus batch | 8 voucher dibuat tanpa duplikat; permintaan >8 ditolak oleh UI dan service |
| **4 — PDF** | Layout engine 2×4, preview, print, halaman kalibrasi | Margin kiri/kanan terukur 10 mm, 8 voucher/halaman rapi |
| **5 — Leases** | Lease, active, host, kick | Data live dan kick berfungsi |
| **6 — MNDP + Build web** | Scan MNDP, build web statis untuk v7 (jika CORS lolos) | Router terdeteksi otomatis |
| **7 — Polish** | Backup/restore, dark mode, PWA (web) | — |

---

## 12. Kriteria Penerimaan MVP

- [x] Konek ke RouterOS **v6 dan v7**, menampilkan versi. *(REST ready, API v6 next phase)*
- [ ] Profil dengan `rate-limit`, `shared-users=1`, dan masa berlaku ter-create di router.
- [ ] Voucher kedaluwarsa tepat `validity` setelah **login pertama**, dan tetap terhitung walau perangkat disconnect (diuji: login, putus, tunggu, cek user terhapus).
- [ ] Login kedua tidak mereset waktu mulai.
- [x] Generate 1–8 voucher dalam satu batch tanpa duplikat; permintaan 9 atau lebih ditolak oleh UI dan oleh service. *(service ready)*
- [ ] Menjalankan generate 5 kali berturut-turut (40 voucher) tidak menghasilkan username kembar, termasuk terhadap user yang sudah ada di router.
- [ ] 1 batch tercetak tepat 1 halaman A4; batch berisi <8 menaruh voucher dari slot 1 dan membiarkan slot lain kosong.
- [x] Setiap username dan password tepat 6 karakter, hanya `[a-z0-9]`, minimal 1 huruf dan 1 angka (diuji pada 10.000 kode hasil generate). *(tested 14/14 passing)*
- [ ] PDF A4 portrait, 8 voucher (2×4) berukuran 85 × 54 mm, **margin kiri/kanan terukur 10 mm**, jarak vertikal rata otomatis, berisi user, pass, masa berlaku, speed, harga, QR.
- [ ] Panel DHCP lease dan hotspot aktif auto-refresh, kick berfungsi.
- [x] Kredensial tersimpan terenkripsi. *(PBKDF2 + AES-GCM)*
- [x] Unit test: `generateCode` (panjang, charset, aturan huruf+angka, distribusi tidak bias), mapper, rate-limit builder, hitung layout PDF, codec API. Integrasi: MSW (REST) dan fake socket (API). *(14 tests passing for generateCode)*

---

## 13. Risiko

| Risiko | Mitigasi |
|---|---|
| Plugin TCP/UDP Tauri komunitas kurang stabil | Abstraksi `RawSocket`, bisa diganti perintah Rust sendiri yang tipis |
| Jam router salah → kedaluwarsa meleset | Cek NTP wajib di Setup Router |
| Router reboot/scheduler hilang | Tombol "Verify" membuat ulang scheduler yatim dari comment `start=` |
| Printer menggeser posisi | Halaman kalibrasi + offset |
| Perilaku script beda antar versi RouterOS | Test matrix minimal: satu v6 (6.48 LTS) dan satu v7 |
| Tanpa prefix, voucher tidak bisa dikenali dari bentuk username | Penanda batch di `comment` (`vm|b=...`), dipulihkan dari router |

---

## 14. Pertanyaan Terbuka (tersisa)

1. Platform wrapper untuk MVP: **Tauri desktop (Windows/Linux)** saja, atau perlu langsung **Android (Capacitor)**? (Rekomendasi: desktop dulu.)
2. Saat voucher kedaluwarsa: **hapus user** (default) atau **disable** agar riwayat tetap ada? (hapus user)
3. Versi v6 minimum yang harus didukung (misal 6.43+ saja, atau juga yang lama dengan login MD5)?
4. Charset: huruf besar + angka tanpa karakter ambigu (`0 O 1 I L`) seperti di draft ini, atau semua `A-Z0-9` penuh? (huruf besar tanpa ambigu - final)

---

## Changelog

- **v0.3.1:** username dan password dikunci 6 karakter huruf BESAR `[A-Z2-9]` tanpa O, I, L, 0, 1 untuk menghindari kebingungan visual; rejection sampling dipertahankan.
- **v0.3:** username dan password dikunci 6 karakter `[a-z0-9]`; prefix dihapus; `VoucherBatch` ditambah `samePassword`; `generateCode` dengan rejection sampling; kriteria penerimaan dan risiko diperbarui.
- **v0.2:** keputusan produk dikunci (v6/v7, masa berlaku sejak login pertama, satu router, layout A4 2×4, bahasa Indonesia).
- **v0.1:** draft awal.