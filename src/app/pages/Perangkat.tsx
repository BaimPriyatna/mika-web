/**
 * Halaman Monitoring Perangkat & Lease
 * Sesuai DESIGN.md §4.7 & DEV-SPEC.md §6.7
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Wifi,
  Search,
  Pause,
  Play,
  RefreshCw,
  Server,
  UserX,
  ShieldAlert,
  ShieldCheck,
  Clock,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Lock,
  Radio,
  AlertCircle,
  Activity,
  HardDrive,
} from 'lucide-react';
import { strings } from '../../strings/id';
import { useRouterStore } from '../../stores/router-store';
import {
  listDhcpLeases,
  listHotspotActive,
  listHotspotHost,
  kickActiveUser,
  makeLeaseStatic,
  blockLease,
  unblockLease,
  formatBytes,
  type ActiveUserWithValidity,
} from '../../features/leases/lease-service';
import type { DhcpLease, HotspotHost } from '../../core/router/types';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogBody,
} from '../../components/ui/dialog';

type TabType = 'dhcp' | 'hotspot' | 'host';

/**
 * Helper untuk sorting IP secara numerik (oktet demi oktet)
 */
function compareIps(ipA?: string, ipB?: string): number {
  if (!ipA) return -1;
  if (!ipB) return 1;
  const partsA = ipA.split('.').map(n => parseInt(n, 10));
  const partsB = ipB.split('.').map(n => parseInt(n, 10));

  for (let i = 0; i < 4; i++) {
    const a = partsA[i] || 0;
    const b = partsB[i] || 0;
    if (a !== b) return a - b;
  }
  return 0;
}

export function Perangkat() {
  const { client, connectionStatus, setModalOpen } = useRouterStore();
  const isConnected = connectionStatus === 'connected';

  const [activeTab, setActiveTab] = useState<TabType>('hotspot');
  const [searchQuery, setSearchQuery] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());
  const [secondsAgo, setSecondsAgo] = useState(0);

  // Data states
  const [dhcpLeases, setDhcpLeases] = useState<DhcpLease[]>([]);
  const [hotspotActive, setHotspotActive] = useState<ActiveUserWithValidity[]>([]);
  const [hotspotHosts, setHotspotHosts] = useState<HotspotHost[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sorting state
  const [sortField, setSortField] = useState<string>('address');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  // Action Dialogs state
  const [kickTarget, setKickTarget] = useState<ActiveUserWithValidity | null>(null);
  const [isKicking, setIsKicking] = useState(false);

  const [blockTarget, setBlockTarget] = useState<DhcpLease | null>(null);
  const [isBlocking, setIsBlocking] = useState(false);

  const [staticTarget, setStaticTarget] = useState<DhcpLease | null>(null);
  const [isMakingStatic, setIsMakingStatic] = useState(false);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch all device data
  const fetchData = useCallback(async (isBackground = false) => {
    if (!client) return;

    try {
      if (!isBackground) setLoading(true);
      else setRefreshing(true);
      setError(null);

      const [leases, active, hosts] = await Promise.all([
        listDhcpLeases(client),
        listHotspotActive(client),
        listHotspotHost(client),
      ]);

      setDhcpLeases(leases);
      setHotspotActive(active);
      setHotspotHosts(hosts);
      setLastUpdated(Date.now());
      setSecondsAgo(0);
    } catch (err) {
      console.error('Failed to fetch device data:', err);
      setError(err instanceof Error ? err.message : 'Gagal mengambil data dari router.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [client]);

  // Initial load
  useEffect(() => {
    if (isConnected) {
      fetchData(false);
    }
  }, [isConnected, fetchData]);

  // Auto-refresh interval (10 seconds)
  useEffect(() => {
    if (!isConnected || !autoRefresh) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      // Pause if tab is hidden / not active
      if (document.hidden) return;
      fetchData(true);
    }, 10000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isConnected, autoRefresh, fetchData]);

  // Update seconds ago ticker every second
  useEffect(() => {
    const ticker = setInterval(() => {
      const diff = Math.floor((Date.now() - lastUpdated) / 1000);
      setSecondsAgo(diff);
    }, 1000);

    return () => clearInterval(ticker);
  }, [lastUpdated]);

  // Action: Kick active user
  const handleConfirmKick = async () => {
    if (!client || !kickTarget) return;

    try {
      setIsKicking(true);
      await kickActiveUser(client, kickTarget['.id']);
      setKickTarget(null);
      await fetchData(true);
    } catch (err) {
      console.error('Failed to kick user:', err);
      alert('Gagal memutuskan user: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsKicking(false);
    }
  };

  // Action: Make lease static
  const handleConfirmMakeStatic = async () => {
    if (!client || !staticTarget) return;

    try {
      setIsMakingStatic(true);
      await makeLeaseStatic(client, staticTarget['.id']);
      setStaticTarget(null);
      await fetchData(true);
    } catch (err) {
      console.error('Failed to make static:', err);
      alert('Gagal mengubah ke statis: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsMakingStatic(false);
    }
  };

  // Action: Block / Unblock lease
  const handleConfirmBlock = async () => {
    if (!client || !blockTarget) return;

    try {
      setIsBlocking(true);
      const isCurrentlyBlocked = blockTarget.disabled === 'true' || blockTarget.status === 'blocked';
      if (isCurrentlyBlocked) {
        await unblockLease(client, blockTarget);
      } else {
        await blockLease(client, blockTarget);
      }
      setBlockTarget(null);
      await fetchData(true);
    } catch (err) {
      console.error('Failed to block/unblock device:', err);
      alert('Gagal mengubah status blokir: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsBlocking(false);
    }
  };

  // Handle Sort Click
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // Filtered & Sorted DHCP Leases
  const filteredDhcp = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const data = dhcpLeases.filter(l => {
      if (!q) return true;
      return (
        (l.address && l.address.toLowerCase().includes(q)) ||
        (l['mac-address'] && l['mac-address'].toLowerCase().includes(q)) ||
        (l.hostname && l.hostname.toLowerCase().includes(q)) ||
        (l.server && l.server.toLowerCase().includes(q))
      );
    });

    data.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'address') {
        cmp = compareIps(a.address, b.address);
      } else if (sortField === 'mac') {
        cmp = (a['mac-address'] || '').localeCompare(b['mac-address'] || '');
      } else if (sortField === 'hostname') {
        cmp = (a.hostname || '').localeCompare(b.hostname || '');
      } else if (sortField === 'status') {
        cmp = (a.status || '').localeCompare(b.status || '');
      }
      return sortAsc ? cmp : -cmp;
    });

    return data;
  }, [dhcpLeases, searchQuery, sortField, sortAsc]);

  // Filtered & Sorted Hotspot Active
  const filteredActive = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const data = hotspotActive.filter(a => {
      if (!q) return true;
      return (
        (a.user && a.user.toLowerCase().includes(q)) ||
        (a.address && a.address.toLowerCase().includes(q)) ||
        (a['mac-address'] && a['mac-address'].toLowerCase().includes(q))
      );
    });

    data.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'address') {
        cmp = compareIps(a.address, b.address);
      } else if (sortField === 'user') {
        cmp = (a.user || '').localeCompare(b.user || '');
      } else if (sortField === 'mac') {
        cmp = (a['mac-address'] || '').localeCompare(b['mac-address'] || '');
      } else if (sortField === 'uptime') {
        cmp = (a.uptime || '').localeCompare(b.uptime || '');
      } else if (sortField === 'remaining') {
        cmp = (a.remainingMinutes || 0) - (b.remainingMinutes || 0);
      }
      return sortAsc ? cmp : -cmp;
    });

    return data;
  }, [hotspotActive, searchQuery, sortField, sortAsc]);

  // Filtered & Sorted Hotspot Hosts
  const filteredHosts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const data = hotspotHosts.filter(h => {
      if (!q) return true;
      return (
        (h.address && h.address.toLowerCase().includes(q)) ||
        (h['mac-address'] && h['mac-address'].toLowerCase().includes(q)) ||
        (h.server && h.server.toLowerCase().includes(q))
      );
    });

    data.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'address') {
        cmp = compareIps(a.address, b.address);
      } else if (sortField === 'mac') {
        cmp = (a['mac-address'] || '').localeCompare(b['mac-address'] || '');
      } else if (sortField === 'server') {
        cmp = (a.server || '').localeCompare(b.server || '');
      }
      return sortAsc ? cmp : -cmp;
    });

    return data;
  }, [hotspotHosts, searchQuery, sortField, sortAsc]);

  if (!isConnected) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {strings.nav.perangkat}
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Pantau lease DHCP, user hotspot aktif, dan host jaringan secara real-time.
          </p>
        </div>

        <div className="p-8 bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 text-center max-w-lg mx-auto space-y-4">
          <div className="w-14 h-14 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center mx-auto">
            <Radio className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Router Belum Terhubung
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Hubungkan aplikasi dengan router MikroTik untuk memantau perangkat yang terhubung dan mengelola sesi aktif.
            </p>
          </div>
          <Button onClick={() => setModalOpen(true)} className="bg-green-600 hover:bg-green-700 text-white gap-2">
            <Radio className="w-4 h-4" />
            Pindai & Hubungkan Router
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Subtitle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <HardDrive className="w-6 h-6 text-green-600" />
            {strings.nav.perangkat}
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
            Monitoring perangkat terhubung, lease DHCP, dan sesi hotspot aktif
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 flex items-center gap-1.5 font-mono">
            <Clock className="w-3.5 h-3.5 text-gray-400" />
            Diperbarui {secondsAgo} dtk lalu
          </span>

          <button
            type="button"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`p-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 transition-colors ${
              autoRefresh
                ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800'
                : 'bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-800'
            }`}
            title={autoRefresh ? 'Jeda auto-refresh' : 'Mulai auto-refresh'}
          >
            {autoRefresh ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{autoRefresh ? 'Otomatis' : 'Jeda'}</span>
          </button>

          <button
            type="button"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 text-gray-600 dark:text-gray-400 transition-colors"
            title="Segarkan data sekarang"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-green-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tabs Navigation & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-800 pb-3">
        {/* Sub-tab buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab('hotspot');
              setSortField('address');
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'hotspot'
                ? 'bg-green-600 text-white shadow-xs'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-900'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            Hotspot Aktif ({hotspotActive.length})
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('dhcp');
              setSortField('address');
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'dhcp'
                ? 'bg-green-600 text-white shadow-xs'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-900'
            }`}
          >
            <Wifi className="w-3.5 h-3.5" />
            DHCP Lease ({dhcpLeases.length})
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('host');
              setSortField('address');
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'host'
                ? 'bg-green-600 text-white shadow-xs'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-900'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            Host ({hotspotHosts.length})
          </button>
        </div>

        {/* Search input */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Cari IP, MAC, user, hostname…"
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 focus:ring-1 focus:ring-green-600"
          />
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-400 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Table Container */}
      <div className="bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          {/* TAB 1: HOTSPOT AKTIF */}
          {activeTab === 'hotspot' && (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-gray-200 dark:border-gray-800 bg-gray-50/75 dark:bg-gray-900/50">
                <tr>
                  <th
                    onClick={() => handleSort('user')}
                    className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-400 cursor-pointer select-none hover:text-gray-900"
                  >
                    <div className="flex items-center gap-1">
                      User Hotspot
                      {sortField === 'user' ? (sortAsc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('address')}
                    className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-400 cursor-pointer select-none hover:text-gray-900"
                  >
                    <div className="flex items-center gap-1">
                      IP Address
                      {sortField === 'address' ? (sortAsc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('mac')}
                    className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-400 cursor-pointer select-none hover:text-gray-900"
                  >
                    <div className="flex items-center gap-1">
                      MAC Address
                      {sortField === 'mac' ? (sortAsc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('uptime')}
                    className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-400 cursor-pointer select-none hover:text-gray-900"
                  >
                    <div className="flex items-center gap-1">
                      Uptime
                      {sortField === 'uptime' ? (sortAsc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('remaining')}
                    className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-400 cursor-pointer select-none hover:text-gray-900"
                  >
                    <div className="flex items-center gap-1">
                      Sisa Masa Berlaku
                      {sortField === 'remaining' ? (sortAsc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                    </div>
                  </th>
                  <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">
                    Traffic (↓ Download / ↑ Upload)
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-400">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-900">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                      Memuat data sesi hotspot aktif…
                    </td>
                  </tr>
                ) : filteredActive.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                      <div className="flex flex-col items-center gap-2">
                        <Activity className="w-8 h-8 text-gray-300" />
                        <p className="font-semibold text-gray-700 dark:text-gray-300">
                          Tidak ada pengguna hotspot yang sedang aktif
                        </p>
                        <p className="text-[11px] text-gray-400">
                          {searchQuery ? 'Coba ubah kata kunci pencarian.' : 'User akan muncul di sini begitu login dengan voucher.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredActive.map(active => {
                    const isCritical = active.validityLevel === 'critical';
                    const isWarning = active.validityLevel === 'warning';

                    return (
                      <tr key={active['.id']} className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-gray-900 dark:text-gray-100">
                          {active.user}
                        </td>
                        <td className="px-4 py-3 font-mono text-gray-800 dark:text-gray-200">
                          {active.address}
                        </td>
                        <td className="px-4 py-3 font-mono text-gray-500 text-[11px]">
                          {active['mac-address']}
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                          {active.uptime}
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {active.formattedRemaining ? (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                isCritical
                                  ? 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400'
                                  : isWarning
                                  ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400'
                                  : 'bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400'
                              }`}
                            >
                              <Clock className="w-3 h-3" />
                              {active.formattedRemaining}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-[11px]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-gray-600 dark:text-gray-400">
                          ↓ {formatBytes(active['bytes-out'])} · ↑ {formatBytes(active['bytes-in'])}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setKickTarget(active)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 border-red-200 dark:border-red-900 text-xs gap-1.5 h-7"
                          >
                            <UserX className="w-3.5 h-3.5" />
                            Kick
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}

          {/* TAB 2: DHCP LEASE */}
          {activeTab === 'dhcp' && (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-gray-200 dark:border-gray-800 bg-gray-50/75 dark:bg-gray-900/50">
                <tr>
                  <th
                    onClick={() => handleSort('address')}
                    className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-400 cursor-pointer select-none hover:text-gray-900"
                  >
                    <div className="flex items-center gap-1">
                      IP Address
                      {sortField === 'address' ? (sortAsc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('mac')}
                    className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-400 cursor-pointer select-none hover:text-gray-900"
                  >
                    <div className="flex items-center gap-1">
                      MAC Address
                      {sortField === 'mac' ? (sortAsc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('hostname')}
                    className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-400 cursor-pointer select-none hover:text-gray-900"
                  >
                    <div className="flex items-center gap-1">
                      Hostname Perangkat
                      {sortField === 'hostname' ? (sortAsc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                    </div>
                  </th>
                  <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">
                    Server
                  </th>
                  <th
                    onClick={() => handleSort('status')}
                    className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-400 cursor-pointer select-none hover:text-gray-900"
                  >
                    <div className="flex items-center gap-1">
                      Tipe & Status
                      {sortField === 'status' ? (sortAsc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                    </div>
                  </th>
                  <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">
                    Terakhir Terlihat
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-400">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-900">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                      Memuat data DHCP lease…
                    </td>
                  </tr>
                ) : filteredDhcp.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                      <div className="flex flex-col items-center gap-2">
                        <Wifi className="w-8 h-8 text-gray-300" />
                        <p className="font-semibold text-gray-700 dark:text-gray-300">
                          Tidak ada DHCP Lease yang ditemukan
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredDhcp.map(lease => {
                    const isDynamic = lease.dynamic === 'true';
                    const isBlocked = lease.disabled === 'true' || lease.status === 'blocked';

                    return (
                      <tr key={lease['.id']} className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                        <td className="px-4 py-3 font-mono font-medium text-gray-900 dark:text-gray-100">
                          {lease.address}
                        </td>
                        <td className="px-4 py-3 font-mono text-gray-500 text-[11px]">
                          {lease['mac-address']}
                        </td>
                        <td className="px-4 py-3 text-gray-800 dark:text-gray-200">
                          {lease.hostname || <span className="text-gray-400 italic">Tanpa nama</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-500 font-mono text-[11px]">
                          {lease.server || 'default'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge variant={isDynamic ? 'secondary' : 'default'} className="text-[10px]">
                              {isDynamic ? 'Dinamis' : 'Statis'}
                            </Badge>
                            {isBlocked ? (
                              <Badge variant="destructive" className="text-[10px]">
                                Diblokir
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-green-700 dark:text-green-400 border-green-200">
                                {lease.status || 'bound'}
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-[11px]">
                          {lease['last-seen'] || lease['expires-after'] || '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {isDynamic && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setStaticTarget(lease)}
                                className="text-xs h-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200"
                                title="Jadikan lease ini permanen/statis"
                              >
                                <Lock className="w-3.5 h-3.5 mr-1" />
                                Jadikan Statis
                              </Button>
                            )}

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setBlockTarget(lease)}
                              className={`text-xs h-7 gap-1 ${
                                isBlocked
                                  ? 'text-green-600 hover:text-green-700 border-green-200'
                                  : 'text-red-600 hover:text-red-700 border-red-200'
                              }`}
                            >
                              {isBlocked ? (
                                <>
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                  Buka Blokir
                                </>
                              ) : (
                                <>
                                  <ShieldAlert className="w-3.5 h-3.5" />
                                  Blokir
                                </>
                              )}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}

          {/* TAB 3: HOST */}
          {activeTab === 'host' && (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-gray-200 dark:border-gray-800 bg-gray-50/75 dark:bg-gray-900/50">
                <tr>
                  <th
                    onClick={() => handleSort('address')}
                    className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-400 cursor-pointer select-none hover:text-gray-900"
                  >
                    <div className="flex items-center gap-1">
                      IP Address
                      {sortField === 'address' ? (sortAsc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('mac')}
                    className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-400 cursor-pointer select-none hover:text-gray-900"
                  >
                    <div className="flex items-center gap-1">
                      MAC Address
                      {sortField === 'mac' ? (sortAsc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                    </div>
                  </th>
                  <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">
                    To-Address
                  </th>
                  <th
                    onClick={() => handleSort('server')}
                    className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-400 cursor-pointer select-none hover:text-gray-900"
                  >
                    <div className="flex items-center gap-1">
                      Server Hotspot
                      {sortField === 'server' ? (sortAsc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                    </div>
                  </th>
                  <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">
                    Autentikasi & Status
                  </th>
                  <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">
                    Uptime
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-400">
                    Traffic (In / Out)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-900">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                      Memuat daftar host hotspot…
                    </td>
                  </tr>
                ) : filteredHosts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                      <div className="flex flex-col items-center gap-2">
                        <Server className="w-8 h-8 text-gray-300" />
                        <p className="font-semibold text-gray-700 dark:text-gray-300">
                          Tidak ada host hotspot yang terdeteksi
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredHosts.map(host => {
                    const isAuthorized = host.authorized === 'true';

                    return (
                      <tr key={host['.id']} className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                        <td className="px-4 py-3 font-mono font-medium text-gray-900 dark:text-gray-100">
                          {host.address}
                        </td>
                        <td className="px-4 py-3 font-mono text-gray-500 text-[11px]">
                          {host['mac-address']}
                        </td>
                        <td className="px-4 py-3 font-mono text-gray-400 text-[11px]">
                          {host['to-address'] || host.address}
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                          {host.server}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              isAuthorized
                                ? 'bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400'
                                : 'bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400'
                            }`}
                          >
                            {isAuthorized ? 'Terautentikasi' : 'Belum Login'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {host.uptime || '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-[11px] text-gray-600 dark:text-gray-400">
                          {formatBytes(host['bytes-in'])} / {formatBytes(host['bytes-out'])}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* DIALOG 1: KICK USER AKTIF */}
      <Dialog open={!!kickTarget} onOpenChange={() => setKickTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader onClose={() => setKickTarget(null)}>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <UserX className="w-5 h-5 text-red-500" />
              Putuskan Pengguna Hotspot?
            </DialogTitle>
            <DialogDescription>
              Koneksi aktif user akan diputus seketika dari router MikroTik.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-3">
            <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-lg text-xs space-y-1 text-red-800 dark:text-red-300">
              <p>User: <strong className="font-mono">{kickTarget?.user}</strong></p>
              <p>IP: <strong className="font-mono">{kickTarget?.address}</strong> ({kickTarget?.['mac-address']})</p>
              <p>Uptime: {kickTarget?.uptime}</p>
            </div>
            <p className="text-xs text-gray-500">
              Pengguna harus memasukkan kembali kode voucher untuk dapat tersambung internet.
            </p>
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" onClick={() => setKickTarget(null)}>
              Batal
            </Button>
            <Button
              onClick={handleConfirmKick}
              disabled={isKicking}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isKicking ? 'Memutuskan…' : 'Putuskan (Kick)'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG 2: JADIKAN LEASE STATIS */}
      <Dialog open={!!staticTarget} onOpenChange={() => setStaticTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader onClose={() => setStaticTarget(null)}>
            <DialogTitle className="flex items-center gap-2 text-blue-600">
              <Lock className="w-5 h-5 text-blue-500" />
              Jadikan Lease Statis?
            </DialogTitle>
            <DialogDescription>
              Mengunci IP address ini secara permanen untuk MAC address perangkat.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-3">
            <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg text-xs space-y-1 text-blue-800 dark:text-blue-300">
              <p>IP Address: <strong className="font-mono">{staticTarget?.address}</strong></p>
              <p>MAC: <strong className="font-mono">{staticTarget?.['mac-address']}</strong></p>
              <p>Hostname: {staticTarget?.hostname || 'Tanpa nama'}</p>
            </div>
            <p className="text-xs text-gray-500">
              Perangkat ini akan selalu mendapatkan IP address yang sama setiap kali terhubung ke jaringan.
            </p>
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" onClick={() => setStaticTarget(null)}>
              Batal
            </Button>
            <Button
              onClick={handleConfirmMakeStatic}
              disabled={isMakingStatic}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isMakingStatic ? 'Mengunci…' : 'Jadikan Statis'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG 3: BLOKIR / BUKA BLOKIR PERANGKAT */}
      <Dialog open={!!blockTarget} onOpenChange={() => setBlockTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader onClose={() => setBlockTarget(null)}>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-500" />
              {blockTarget?.disabled === 'true' || blockTarget?.status === 'blocked'
                ? 'Buka Blokir Perangkat?'
                : 'Blokir Akses Perangkat?'}
            </DialogTitle>
            <DialogDescription>
              {blockTarget?.disabled === 'true' || blockTarget?.status === 'blocked'
                ? 'Mengizinkan kembali perangkat ini untuk mengakses jaringan dan hotspot.'
                : 'Mencegah perangkat ini mendapatkan akses internet melalui DHCP dan hotspot.'}
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-3">
            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg text-xs space-y-1 text-gray-700 dark:text-gray-300">
              <p>IP Address: <strong className="font-mono">{blockTarget?.address}</strong></p>
              <p>MAC: <strong className="font-mono">{blockTarget?.['mac-address']}</strong></p>
              <p>Hostname: {blockTarget?.hostname || 'Tanpa nama'}</p>
            </div>
            <p className="text-xs text-gray-500">
              Tindakan ini akan mengupdate tabel lease dan aturan IP binding MikroTik.
            </p>
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockTarget(null)}>
              Batal
            </Button>
            <Button
              onClick={handleConfirmBlock}
              disabled={isBlocking}
              className={
                blockTarget?.disabled === 'true' || blockTarget?.status === 'blocked'
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-red-600 hover:bg-red-700 text-white'
              }
            >
              {isBlocking
                ? 'Menyimpan…'
                : blockTarget?.disabled === 'true' || blockTarget?.status === 'blocked'
                ? 'Buka Blokir'
                : 'Blokir Perangkat'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
