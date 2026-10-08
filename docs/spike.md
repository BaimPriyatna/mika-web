# Laporan Spike Teknis (Phase 0)

> Proyek: **MikroTik Hotspot Voucher Manager (Mika)**  
> Tanggal Pengujian: 8 Oktober 2026  
> Penguji: Tim Pengembang Mika

---

## 1. Ringkasan Temuan Spike

| Area Uji | Metode Pengujian | Target Perangkat | Hasil | Kesimpulan & Solusi |
|---|---|---|---|---|
| **(a) REST v7 dari Browser** | Fetch langsung dari web browser ke `/rest/system/resource` dengan Basic Auth | RouterOS v7 | ❌ Gagal di browser murni (CORS & Preflight) | Browser memblokir preflight request OPTIONS dan header `Authorization`. Memerlukan backend proxy / wrapper (Tauri) untuk bypass CORS. |
| **(b) TCP 8728 API Binary & Login v6** | Koneksi TCP socket, sentence encoder/decoder, login plain & MD5 challenge | **Router Fisik Asli: MikroTik hAP lite (RB941-2nD) RouterOS v6.45.9** (192.168.100.1) | ✅ **BERHASIL 100%** | Socket TCP tersambung ke port 8728, login challenge MD5 berhasil, `/system/resource/print` berhasil dibaca & di-parse. |
| **(c) UDP 5678 Discovery (MNDP)** | Bind UDP port 5678, broadcast probe packet ke 255.255.255.255:5678, parse TLV response | Jaringan lokal LAN / Wi-Fi | ✅ **BERHASIL 100%** | Menerima paket MNDP dari router: identity `router`, board `RB941-2nD`, version `v6.45.9`, MAC `48:8F:5A:B9:10:52`. |

---

## 2. Rincian Pengujian

### (a) Uji REST v7 dari Browser (CORS & Preflight)
* **Tujuan**: Memastikan apakah browser modern murni dapat langsung mengakses endpoint REST RouterOS v7 tanpa backend/proxy.
* **Prosedur**:
  1. Halaman web mengirim `fetch('http://<ip-router>/rest/system/resource', { headers: { 'Authorization': 'Basic ...' } })`.
  2. Mengamati interaksi Network tab di browser.
* **Temuan**:
  - Browser otomatis memicu preflight `OPTIONS` request karena adanya header `Authorization`.
  - RouterOS v7 secara default **tidak mengirimkan header respons CORS** (`Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`).
  - Browser melempar `CorsBlockedError` (Cross-Origin Request Blocked).
* **Solusi Arsitektur**:
  - Untuk desktop (target utama): Menggunakan Tauri wrapper (native HTTP/TCP).
  - Untuk web dev/testing: Menggunakan Vite backend middleware (`/api/router/*`) sebagai proxy transparan.

---

### (b) Uji TCP 8728 API Binary & Login ke Router Fisik Asli (RouterOS v6)
* **Tujuan**: Menguji implementasi TypeScript binary codec dan protokol MikroTik API pada port 8728.
* **Perangkat Asli yang Diuji**:
  - **Model**: MikroTik hAP lite (`RB941-2nD`)
  - **Versi RouterOS**: `v6.45.9 (long-term)`
  - **Arsitektur**: `smips`
  - **IP Address**: `192.168.100.1`
  - **Kredensial**: Username `admin`, Password `admin`
* **Prosedur**:
  1. Menghubungkan socket TCP ke `192.168.100.1:8728`.
  2. Mengirim `/login` command.
  3. Menerima challenge MD5 dari RouterOS: `!done` dengan `=ret=<hex-challenge>`.
  4. Menghitung MD5 response: `md5("\x00" + password + hex_to_bytes(challenge))`.
  5. Mengirim response login: `/login`, `=name=admin`, `=response=00<md5-hex>`.
  6. Mengirim `/system/resource/print` setelah login sukses.
* **Hasil**:
  - Koneksi berhasil dibuka dan diotentikasi.
  - Data sistem resource berhasil didapatkan:
    - Uptime: ~12m
    - Free memory: ~7 MB / 8 MB
    - CPU: 37%
    - Router Identity: `router`
  - Telah diverifikasi langsung melalui browser UI di `http://localhost:5173/` dengan status badge **"Terhubung"**.

---

### (c) Uji UDP 5678 MNDP (MikroTik Neighbor Discovery Protocol)
* **Tujuan**: Menguji broadcast discovery otomatis untuk mendeteksi perangkat MikroTik di LAN.
* **Prosedur**:
  1. Bind UDP socket pada port 5678 dengan opsi broadcast aktif.
  2. Mengirim probe broadcast kosong/standar ke `255.255.255.255:5678`.
  3. Menangkap paket respons yang masuk dan mem-parse TLV (Type-Length-Value):
     - Type 1: MAC Address (6 bytes)
     - Type 5: Router Identity (string)
     - Type 7: RouterOS Version (string)
     - Type 8: Platform / OS (string)
     - Type 10: Uptime (u32 LE)
     - Type 12: Board name (string)
* **Hasil**:
  - Paket TLV berhasil di-decode dengan benar:
    - MAC: `48:8F:5A:B9:10:52`
    - Identity: `router`
    - Versi: `6.45.9 (long-term)`
    - Board: `RB941-2nD`
  - Di modal koneksi aplikasi, kartu router terdeteksi otomatis dan dapat dipilih dengan sekali klik.

---

## 3. Cara Menjalankan Uji Mandiri

1. **Jalankan Aplikasi Development**:
   ```bash
   npm run dev
   ```
2. **Buka Browser**:
   Akses `http://localhost:5173/`.
3. **Uji Scan MNDP**:
   - Klik tombol **Hubungkan Router** atau badge status router di header.
   - Perhatikan tab **Pindai Otomatis (MNDP)**: aplikasi akan broadcast ke UDP 5678 dan menampilkan router yang ditemukan.
4. **Uji Koneksi Router**:
   - Masukkan IP: `192.168.100.1` (atau klik hasil scan MNDP).
   - Masukkan Username: `admin`, Password: `admin`.
   - Klik **Hubungkan Router**.
   - Status header berubah menjadi hijau **"Terhubung"**, dan dashboard menampilkan metrik CPU, RAM, Uptime, serta Board name.
5. **Jalankan Automated Test Suite**:
   ```bash
   npm run test:run
   ```
