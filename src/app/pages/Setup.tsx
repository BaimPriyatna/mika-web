import { strings } from '../../strings/id';
import { AlertTriangle, CheckCircle2, Download, Upload, XCircle } from 'lucide-react';

export function Setup() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
        {strings.nav.setupRouter}
      </h1>

      {/* Checklist status - DESIGN.md §4.8 */}
      <div className="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-6 mb-6">
        <div className="space-y-4">
          {/* Item 1: Koneksi - Success */}
          <div className="flex items-start gap-4 p-4 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-900/30">
            <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                Koneksi API/REST
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                OK (API, v6.48.6)
              </p>
            </div>
          </div>

          {/* Item 2: Hotspot - Success */}
          <div className="flex items-start gap-4 p-4 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-900/30">
            <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                Hotspot server ditemukan
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                hotspot1 pada ether2
              </p>
            </div>
          </div>

          {/* Item 3: NTP - Warning */}
          <div className="flex items-start gap-4 p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-900/30">
            <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                Jam & NTP
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                NTP tidak aktif · Masa berlaku bisa meleset
              </p>
              <button className="text-sm text-green-600 dark:text-green-400 hover:underline font-medium">
                Panduan
              </button>
            </div>
          </div>

          {/* Item 4: Script - Not installed */}
          <div className="flex items-start gap-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800">
            <XCircle className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                Script masa berlaku
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                Belum terpasang
              </p>
              <button className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-md font-medium transition-colors">
                Pasang
              </button>
            </div>
          </div>

          {/* Item 5: Scheduler - Not installed */}
          <div className="flex items-start gap-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800">
            <XCircle className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                Scheduler pembersih
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                Belum terpasang
              </p>
              <button className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-md font-medium transition-colors">
                Pasang
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tombol aksi - DESIGN.md §4.8 */}
      <div className="flex flex-wrap gap-3">
        <button className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-medium transition-colors">
          <Download className="w-4 h-4" />
          Pasang Semua
        </button>
        <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 text-gray-700 dark:text-gray-300 rounded-md font-medium transition-colors">
          <CheckCircle2 className="w-4 h-4" />
          Verifikasi
        </button>
        <button className="flex items-center gap-2 px-4 py-2 border border-red-300 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-900/10 text-red-600 dark:text-red-400 rounded-md font-medium transition-colors">
          <Upload className="w-4 h-4" />
          Copot
        </button>
      </div>

      {/* Info box */}
      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-900/30 rounded-lg">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          <span className="font-medium">ℹ️ Catatan:</span> Script dan scheduler yang dipasang akan memiliki prefix <code className="px-1.5 py-0.5 bg-white dark:bg-gray-950 rounded text-xs font-mono">vm-</code> untuk memudahkan identifikasi dan penghapusan.
        </p>
      </div>
    </div>
  );
}
