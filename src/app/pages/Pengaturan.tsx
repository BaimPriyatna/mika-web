import { strings } from '../../strings/id';
import { Database, FileText, Lock, Printer, Wifi, Radio, Server, CheckCircle2, Unplug, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useRouterStore } from '../../stores/router-store';

function RouterSettingsTab() {
  const {
    connectionStatus,
    systemResource,
    overview,
    config,
    setModalOpen,
    disconnect,
    fetchOverview,
  } = useRouterStore();

  const isConnected = connectionStatus === 'connected';

  return (
    <div className="bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 p-6 shadow-2xs space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Koneksi Router MikroTik
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Status dan konfigurasi integrasi dengan MikroTik RouterOS
          </p>
        </div>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg shadow-xs transition-colors"
        >
          <Radio className="w-3.5 h-3.5" />
          {isConnected ? 'Ganti / Konfigurasi' : 'Pindai & Hubungkan'}
        </button>
      </div>

      {/* Connection status badge card */}
      <div
        className={`p-4 rounded-xl border flex items-center justify-between ${
          isConnected
            ? 'bg-green-50/60 dark:bg-green-950/20 border-green-200 dark:border-green-800'
            : 'bg-gray-50 dark:bg-gray-900/40 border-gray-200 dark:border-gray-800'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`p-2.5 rounded-lg ${
              isConnected
                ? 'bg-green-600 text-white'
                : 'bg-gray-200 dark:bg-gray-800 text-gray-500'
            }`}
          >
            <Server className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                {isConnected
                  ? overview?.resource?.identity || systemResource?.boardName || 'Router Terhubung'
                  : 'Belum Terhubung ke Router'}
              </span>
              {isConnected && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300">
                  <CheckCircle2 className="w-3 h-3" />
                  Online
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {isConnected && systemResource
                ? `RouterOS v${systemResource.version} (${systemResource.architecture}) · Uptime: ${systemResource.uptime}`
                : 'Pindai router melalui MNDP atau masukkan IP router MikroTik secara manual'}
            </p>
          </div>
        </div>

        {isConnected && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchOverview()}
              title="Perbarui Data"
              className="p-2 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => disconnect()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 bg-white dark:bg-gray-900 hover:bg-red-50 dark:hover:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-lg transition-colors"
            >
              <Unplug className="w-3.5 h-3.5" />
              Putuskan
            </button>
          </div>
        )}
      </div>

      {/* Details Table */}
      {isConnected && (
        <div className="border border-gray-200 dark:border-gray-800 rounded-lg divide-y divide-gray-100 dark:divide-gray-800 text-xs">
          <div className="flex justify-between p-3">
            <span className="text-gray-500">Host / IP</span>
            <span className="font-mono font-medium text-gray-900 dark:text-gray-100">
              {overview?.config?.host || config?.host || '—'}
            </span>
          </div>
          <div className="flex justify-between p-3">
            <span className="text-gray-500">Port & Protokol</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {overview?.config?.port || config?.port || 8728} (
              {overview?.config?.protocol?.toUpperCase() || 'API'})
            </span>
          </div>
          <div className="flex justify-between p-3">
            <span className="text-gray-500">Username Login</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {overview?.config?.username || config?.username || 'admin'}
            </span>
          </div>
          <div className="flex justify-between p-3">
            <span className="text-gray-500">Pengguna Hotspot Aktif</span>
            <span className="font-semibold text-green-600 dark:text-green-400">
              {overview?.activeHotspotUsersCount ?? 0} user
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function Pengaturan() {
  const [activeTab, setActiveTab] = useState<'router' | 'voucher' | 'print' | 'backup' | 'security'>('router');

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
        {strings.nav.pengaturan}
      </h1>

      {/* Sub-tab navigation - DESIGN.md §4.9 */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800 mb-6">
        <button
          onClick={() => setActiveTab('router')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'router'
              ? 'border-green-600 text-green-600 dark:text-green-400'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
          }`}
        >
          <Wifi className="w-4 h-4" />
          Router
        </button>
        <button
          onClick={() => setActiveTab('voucher')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'voucher'
              ? 'border-green-600 text-green-600 dark:text-green-400'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
          }`}
        >
          <FileText className="w-4 h-4" />
          Tampilan Voucher
        </button>
        <button
          onClick={() => setActiveTab('print')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'print'
              ? 'border-green-600 text-green-600 dark:text-green-400'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
          }`}
        >
          <Printer className="w-4 h-4" />
          Cetak
        </button>
        <button
          onClick={() => setActiveTab('backup')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'backup'
              ? 'border-green-600 text-green-600 dark:text-green-400'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
          }`}
        >
          <Database className="w-4 h-4" />
          Backup
        </button>
        <button
          onClick={() => setActiveTab('security')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'security'
              ? 'border-green-600 text-green-600 dark:text-green-400'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
          }`}
        >
          <Lock className="w-4 h-4" />
          Keamanan
        </button>
      </div>

      {/* Tab Router */}
      {activeTab === 'router' && (
        <RouterSettingsTab />
      )}

      {/* Tab Tampilan Voucher */}
      {activeTab === 'voucher' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form */}
          <div className="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Pengaturan Tampilan
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Nama Merek
                </label>
                <input
                  type="text"
                  defaultValue="WIFI TKJ"
                  maxLength={16}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-950 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                />
                <p className="text-xs text-gray-500 mt-1">Maksimal 16 karakter</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  URL Login
                </label>
                <input
                  type="text"
                  placeholder="http://192.168.88.1/login"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-950 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                />
                <p className="text-xs text-gray-500 mt-1">Akan ditampilkan sebagai QR code</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Catatan Kaki
                </label>
                <input
                  type="text"
                  placeholder="1 akun untuk 1 perangkat"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-950 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                />
              </div>
              <div className="pt-2">
                <button className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-medium transition-colors">
                  {strings.button.save}
                </button>
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Pratinjau Voucher (Desain D)
            </h2>
            <div className="aspect-[85/54] border-2 border-gray-300 dark:border-gray-700 rounded-md bg-white p-4 text-xs">
              <div className="h-full flex items-center justify-center text-gray-400">
                Preview voucher live akan muncul di sini
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Header hitam · Aksen hijau · Ukuran 85 × 54 mm
            </p>
          </div>
        </div>
      )}

      {/* Tab Cetak */}
      {activeTab === 'print' && (
        <div className="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Pengaturan Cetak
          </h2>
          <div className="space-y-4 max-w-2xl">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Margin Vertikal (mm)
                </label>
                <input
                  type="number"
                  defaultValue="15"
                  step="0.5"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-950 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                />
                <p className="text-xs text-gray-500 mt-1">Default: 15 mm</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Margin Horizontal (mm)
                </label>
                <input
                  type="number"
                  defaultValue="10"
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-gray-100 dark:bg-gray-900 text-sm text-gray-500 cursor-not-allowed"
                />
                <p className="text-xs text-gray-500 mt-1">🔒 Terkunci: 10 mm</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Offset Printer X (mm)
                </label>
                <input
                  type="number"
                  defaultValue="0"
                  step="0.5"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-950 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Offset Printer Y (mm)
                </label>
                <input
                  type="number"
                  defaultValue="0"
                  step="0.5"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-950 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                />
              </div>
            </div>
            <div className="pt-2">
              <button className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-medium transition-colors">
                {strings.button.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab Backup */}
      {activeTab === 'backup' && (
        <div className="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Backup & Restore
          </h2>
          <div className="space-y-6 max-w-2xl">
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-900/30 rounded-lg">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                <span className="font-medium">⚠️ Peringatan:</span> Data tersimpan lokal di browser. Bersihkan cache browser = data hilang. Backup secara berkala.
              </p>
            </div>
            
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Ekspor Data</h3>
              <div className="flex items-center gap-3">
                <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 text-gray-700 dark:text-gray-300 rounded-md font-medium transition-colors">
                  <Database className="w-4 h-4" />
                  {strings.button.export} JSON
                </button>
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <input type="checkbox" className="rounded border-gray-300 dark:border-gray-700" />
                  Enkripsi dengan passphrase
                </label>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Impor Data</h3>
              <div className="flex items-center gap-3">
                <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 text-gray-700 dark:text-gray-300 rounded-md font-medium transition-colors">
                  <Database className="w-4 h-4" />
                  {strings.button.import} JSON
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Akan mengganti semua data yang ada. Tidak dapat dibatalkan.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab Keamanan */}
      {activeTab === 'security' && (
        <div className="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Keamanan
          </h2>
          <div className="space-y-6 max-w-2xl">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Passphrase</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Passphrase digunakan untuk mengenkripsi kredensial router yang tersimpan lokal.
              </p>
              <button className="px-4 py-2 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 text-gray-700 dark:text-gray-300 rounded-md font-medium transition-colors">
                Ganti Passphrase
              </button>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Sesi</h3>
              <button className="flex items-center gap-2 px-4 py-2 border border-red-300 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-900/10 text-red-600 dark:text-red-400 rounded-md font-medium transition-colors">
                <Lock className="w-4 h-4" />
                Kunci Aplikasi Sekarang
              </button>
              <p className="text-xs text-gray-500 mt-2">
                Menghapus passphrase dari memori. Anda harus memasukkan passphrase lagi untuk membuka aplikasi.
              </p>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Password Voucher</h3>
              <label className="flex items-center gap-3">
                <input type="checkbox" className="rounded border-gray-300 dark:border-gray-700" />
                <div>
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    Simpan password voucher terenkripsi
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Password akan dienkripsi sebelum disimpan di database lokal
                  </p>
                </div>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
