/**
 * Semua teks UI dalam bahasa Indonesia
 * Satu sumber kebenaran untuk memudahkan perubahan/terjemahan nanti
 */

export const strings = {
  // Nama aplikasi
  appName: 'MikroTik Hotspot Voucher Manager',
  appShortName: 'Voucher Manager',

  // Menu navigasi
  nav: {
    dashboard: 'Dashboard',
    voucher: 'Voucher',
    paket: 'Paket',
    profil: 'Profil',
    perangkat: 'Perangkat',
    penjualanOnline: 'Penjualan Online',
    setupRouter: 'Setup Router',
    pengaturan: 'Pengaturan',
  },

  // Status koneksi
  connection: {
    connected: 'Terhubung',
    connecting: 'Menyambung…',
    disconnected: 'Terputus',
    notConnected: 'Belum terhubung',
    reconnect: 'Sambungkan ulang',
  },

  // Tombol umum
  button: {
    save: 'Simpan',
    cancel: 'Batal',
    delete: 'Hapus',
    close: 'Tutup',
    edit: 'Ubah',
    create: 'Buat',
    download: 'Unduh',
    print: 'Cetak',
    retry: 'Coba lagi',
    back: 'Kembali',
    next: 'Lanjut',
    confirm: 'Konfirmasi',
    search: 'Cari',
    filter: 'Filter',
    reset: 'Reset',
    refresh: 'Perbarui',
    view: 'Lihat',
    copy: 'Salin',
    export: 'Ekspor',
    import: 'Impor',
  },

  // Label form umum
  form: {
    name: 'Nama',
    description: 'Deskripsi',
    host: 'Host',
    port: 'Port',
    username: 'Username',
    password: 'Password',
    status: 'Status',
    actions: 'Aksi',
    created: 'Dibuat',
    updated: 'Diperbarui',
    date: 'Tanggal',
    time: 'Waktu',
    required: 'Wajib diisi',
    optional: 'Opsional',
  },

  // Status umum
  status: {
    active: 'Aktif',
    inactive: 'Tidak aktif',
    new: 'Baru',
    expired: 'Kedaluwarsa',
    loading: 'Memuat…',
    success: 'Berhasil',
    error: 'Gagal',
    empty: 'Kosong',
  },

  // Pesan umum
  message: {
    saveSuccess: 'Berhasil disimpan',
    deleteSuccess: 'Berhasil dihapus',
    copySuccess: 'Berhasil disalin',
    error: 'Terjadi kesalahan',
    noData: 'Tidak ada data',
    confirmDelete: 'Yakin ingin menghapus?',
  },

  // Unit
  units: {
    minute: 'menit',
    minutes: 'menit',
    hour: 'jam',
    hours: 'jam',
    day: 'hari',
    days: 'hari',
    week: 'minggu',
    weeks: 'minggu',
    month: 'bulan',
    months: 'bulan',
  },

  // Tema
  theme: {
    light: 'Terang',
    dark: 'Gelap',
    toggle: 'Ubah tema',
  },

  // Sidebar
  sidebar: {
    collapse: 'Ciutkan menu',
    expand: 'Bentangkan menu',
  },
} as const;

export default strings;
