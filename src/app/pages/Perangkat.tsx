import { strings } from '../../strings/id';
import { HardDrive, Pause, Play, Search, Wifi } from 'lucide-react';
import { useState } from 'react';

export function Perangkat() {
  const [activeTab, setActiveTab] = useState<'dhcp' | 'hotspot' | 'host'>('dhcp');
  const [autoRefresh, setAutoRefresh] = useState(true);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
        {strings.nav.perangkat}
      </h1>

      {/* Tab navigation - DESIGN.md §4.7 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800">
          <button
            onClick={() => setActiveTab('dhcp')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'dhcp'
                ? 'border-green-600 text-green-600 dark:text-green-400'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            DHCP Lease
          </button>
          <button
            onClick={() => setActiveTab('hotspot')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'hotspot'
                ? 'border-green-600 text-green-600 dark:text-green-400'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            Hotspot Aktif
          </button>
          <button
            onClick={() => setActiveTab('host')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'host'
                ? 'border-green-600 text-green-600 dark:text-green-400'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            Host
          </button>
        </div>
      </div>

      {/* Search dan auto-refresh - DESIGN.md §4.7 */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Cari IP, MAC, hostname, atau user..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-950 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <span>Diperbarui 3 dtk lalu</span>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-900 rounded transition-colors"
            title={autoRefresh ? 'Jeda auto-refresh' : 'Mulai auto-refresh'}
          >
            {autoRefresh ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Tabel - DESIGN.md §4.7 */}
      <div className="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
              <tr>
                {activeTab === 'dhcp' && (
                  <>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      IP Address
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      MAC Address
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      Hostname
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      Server
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      Terakhir Terlihat
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      Aksi
                    </th>
                  </>
                )}
                {activeTab === 'hotspot' && (
                  <>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      IP Address
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      MAC Address
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      Uptime
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      Sisa Masa Berlaku
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      ↓ / ↑
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      Aksi
                    </th>
                  </>
                )}
                {activeTab === 'host' && (
                  <>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      IP Address
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      MAC Address
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      Autentikasi
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={activeTab === 'host' ? 4 : 7} className="px-4 py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
                      {activeTab === 'dhcp' && <HardDrive className="w-8 h-8 text-gray-400" />}
                      {activeTab === 'hotspot' && <Wifi className="w-8 h-8 text-gray-400" />}
                      {activeTab === 'host' && <HardDrive className="w-8 h-8 text-gray-400" />}
                    </div>
                    <div>
                      <p className="text-gray-900 dark:text-gray-100 font-medium mb-1">
                        Tidak ada data
                      </p>
                      <p className="text-sm text-gray-500">
                        {activeTab === 'dhcp' && 'Tidak ada DHCP lease aktif di router'}
                        {activeTab === 'hotspot' && 'Tidak ada pengguna hotspot yang sedang online'}
                        {activeTab === 'host' && 'Tidak ada host yang terdeteksi di jaringan'}
                      </p>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
