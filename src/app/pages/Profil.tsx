/**
 * Halaman Profil Hotspot
 * Wajib terkoneksi dengan router MikroTik
 * Polling auto-refresh 5-10 detik, pause saat tab tidak aktif
 * CRUD profil: buat, edit, hapus, perbaiki shared-users
 * Sesuai DESIGN.md §4.3 dan DEV-SPEC.md §6.2
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  AlertCircle,
  ArrowUpDown,
  Clock,
  Edit2,
  Loader2,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  User,
  Wifi,
  Wrench,
  Zap,
} from 'lucide-react';
import { strings } from '../../strings/id';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { ProfileFormDialog } from '../../features/profiles/ProfileFormDialog';
import {
  getProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
  fixProfileSharedUsers,
} from '../../features/profiles/profile-service';
import type { HotspotProfile, HotspotUser } from '../../core/router/types';
import { useRouterStore } from '../../stores/router-store';

// Polling interval: 7 detik (dalam rentang 5-10 detik sesuai dev-spec)
const POLL_INTERVAL_MS = 7000;

export function Profil() {
  const { client, connectionStatus, setModalOpen } = useRouterStore();

  const [profiles, setProfiles] = useState<HotspotProfile[]>([]);
  const [userCounts, setUserCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  // Dialog states
  const [showFormDialog, setShowFormDialog] = useState(false);
  const [editingProfile, setEditingProfile] = useState<HotspotProfile | undefined>();
  const [deletingProfile, setDeletingProfile] = useState<HotspotProfile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [fixingProfileId, setFixingProfileId] = useState<string | null>(null);

  // Refs untuk polling
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isVisibleRef = useRef(true);

  const isConnected = connectionStatus === 'connected' && !!client;

  // Load profiles from router
  const loadProfiles = useCallback(async (silent = false) => {
    if (!client) {
      setProfiles([]);
      setUserCounts({});
      setIsLoading(false);
      return;
    }

    if (!silent) {
      setIsRefreshing(true);
    }

    try {
      // Load profiles and users in parallel
      const [profileData, usersData] = await Promise.all([
        getProfiles(client),
        client.print<HotspotUser>('/ip/hotspot/user'),
      ]);

      // Count users per profile
      const counts: Record<string, number> = {};
      for (const user of usersData) {
        const profileName = user.profile || 'default';
        counts[profileName] = (counts[profileName] || 0) + 1;
      }

      setProfiles(profileData);
      setUserCounts(counts);
      setError(null);
      setLastUpdated(Date.now());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal memuat profil';
      setError(message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [client]);

  // Initial load when connected
  useEffect(() => {
    if (isConnected) {
      setIsLoading(true);
      loadProfiles();
    } else {
      setProfiles([]);
      setUserCounts({});
      setIsLoading(false);
      setError(null);
    }
  }, [isConnected, loadProfiles]);

  // Auto-refresh polling with pause when tab not active
  useEffect(() => {
    if (!isConnected) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Visibility change handler - pause when tab not active
    const handleVisibilityChange = () => {
      isVisibleRef.current = !document.hidden;
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Polling interval
    intervalRef.current = setInterval(() => {
      if (isVisibleRef.current) {
        loadProfiles(true); // silent refresh
      }
    }, POLL_INTERVAL_MS);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isConnected, loadProfiles]);

  // Handle create/edit
  const handleSave = async (data: {
    name: string;
    uploadSpeed: string;
    downloadSpeed: string;
    validity?: string;
    idleTimeout?: string;
    keepaliveTimeout?: string;
    addressPool?: string;
    macCookieTimeout?: string;
  }) => {
    if (!client) {
      throw new Error('Router tidak terhubung');
    }

    if (editingProfile) {
      // Mode edit
      await updateProfile(client, editingProfile['.id'], data);
    } else {
      // Mode create
      await createProfile(client, data);
    }

    // Reload profiles
    await loadProfiles();
    setEditingProfile(undefined);
  };

  // Handle delete
  const handleDelete = async () => {
    if (!deletingProfile || !client) return;

    setIsDeleting(true);

    try {
      await deleteProfile(client, deletingProfile['.id']);
      await loadProfiles();
      setDeletingProfile(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menghapus profil';
      setError(message);
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle fix shared-users
  const handleFixSharedUsers = async (profile: HotspotProfile) => {
    if (!client) return;

    setFixingProfileId(profile['.id']);

    try {
      await fixProfileSharedUsers(client, profile['.id']);
      await loadProfiles();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal memperbaiki profil';
      setError(message);
    } finally {
      setFixingProfileId(null);
    }
  };

  // Handle manual refresh
  const handleRefresh = () => {
    loadProfiles();
  };

  // Format helpers
  const formatSpeed = (rateLimit?: string) => {
    if (!rateLimit) return '-';
    const parts = rateLimit.split('/');
    if (parts.length === 2) {
      return `${parts[0]} / ${parts[1]}`;
    }
    return rateLimit;
  };

  const formatValidity = (profile: HotspotProfile) => {
    const validity = profile['session-timeout'] || profile.validity;
    if (!validity || validity === 'none') return 'Tidak terbatas';
    const match = validity.match(/^(\d+)([smhdw])$/);
    if (!match) return validity;

    const [, num, unit] = match;
    const units: Record<string, string> = {
      s: 'detik', m: 'menit', h: 'jam', d: 'hari', w: 'minggu',
    };
    return `${num} ${units[unit] || unit}`;
  };

  const formatLastUpdated = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 5) return 'baru saja';
    if (seconds < 60) return `${seconds} dtk lalu`;
    return `${Math.floor(seconds / 60)} mnt lalu`;
  };

  // If not connected, show connection prompt
  if (!isConnected) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {strings.nav.profil}
          </h1>
        </div>

        <div className="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-12">
          <div className="flex flex-col items-center text-center max-w-md mx-auto">
            <div className="w-20 h-20 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mb-4">
              <Wifi className="w-10 h-10 text-amber-500 dark:text-amber-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Router belum terhubung
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Profil hotspot disimpan di router MikroTik. Hubungkan ke router terlebih dahulu
              untuk membuat, mengubah, atau melihat profil.
            </p>
            <Button onClick={() => setModalOpen(true)}>
              <Wifi className="w-4 h-4" />
              Hubungkan Router
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header dengan tombol - DESIGN.md §4.3 */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          {strings.nav.profil}
        </h1>
        <div className="flex items-center gap-2">
          {/* Last updated indicator */}
          {lastUpdated && (
            <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">
              Diperbarui {formatLastUpdated(lastUpdated)}
            </span>
          )}
          {/* Manual refresh */}
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing || isLoading}
            title="Perbarui data"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
          {/* Create */}
          <Button
            onClick={() => {
              setEditingProfile(undefined);
              setShowFormDialog(true);
            }}
          >
            <Plus className="w-4 h-4" />
            Buat Profil
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-medium text-red-900 dark:text-red-100 mb-1">Terjadi kesalahan</h3>
              <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
              <Button onClick={handleRefresh} variant="outline" size="sm" className="mt-2">
                <RefreshCw className="w-3.5 h-3.5" />
                Coba Lagi
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Tabel profil - DESIGN.md §4.3 */}
      <div className="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  <div className="flex items-center gap-1 cursor-pointer hover:text-gray-900 dark:hover:text-gray-200">
                    Nama
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  <div className="flex items-center gap-1">
                    <Zap className="w-3 h-3" />
                    Speed (↑/↓)
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Masa Berlaku
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  <div className="flex items-center gap-1">
                    <User className="w-3 h-3" />
                    Pengguna per Akun
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Dipakai oleh
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto" />
                    <p className="text-sm text-gray-500 mt-2">Memuat profil dari router...</p>
                  </td>
                </tr>
              ) : profiles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
                        <Shield className="w-8 h-8 text-gray-400" />
                      </div>
                      <div>
                        <p className="text-gray-900 dark:text-gray-100 font-medium mb-1">
                          Belum ada profil hotspot
                        </p>
                        <p className="text-sm text-gray-500 max-w-md mx-auto">
                          Profil menentukan kecepatan, masa berlaku, dan batasan akses untuk voucher.
                          Buat profil pertama untuk mulai.
                        </p>
                      </div>
                      <Button
                        onClick={() => {
                          setEditingProfile(undefined);
                          setShowFormDialog(true);
                        }}
                        className="mt-2"
                      >
                        <Plus className="w-4 h-4" />
                        Buat Profil Pertama
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                profiles.map((profile) => {
                  const userCount = userCounts[profile.name] || 0;
                  const sharedUsers = profile['shared-users'];
                  const isSharedUsersValid = sharedUsers === '1';
                  const isFixing = fixingProfileId === profile['.id'];

                  return (
                    <tr
                      key={profile['.id']}
                      className="border-b border-gray-200 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
                    >
                      {/* Nama */}
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm font-medium text-gray-900 dark:text-gray-100">
                          {profile.name}
                        </span>
                      </td>
                      {/* Speed */}
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-700 dark:text-gray-300 font-mono">
                          {formatSpeed(profile['rate-limit'])}
                        </span>
                      </td>
                      {/* Masa Berlaku */}
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {formatValidity(profile)}
                        </span>
                      </td>
                      {/* Pengguna per Akun */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {sharedUsers || '1'}
                          </span>
                          {isSharedUsersValid ? (
                            <Badge variant="default">OK</Badge>
                          ) : (
                            <div className="flex items-center gap-1">
                              <Badge variant="warning">Bukan 1</Badge>
                              <button
                                onClick={() => handleFixSharedUsers(profile)}
                                disabled={isFixing}
                                className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-md border border-amber-200 dark:border-amber-800 transition-colors disabled:opacity-50"
                                title="Perbaiki shared-users ke 1"
                              >
                                {isFixing ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Wrench className="w-3 h-3" />
                                )}
                                Perbaiki
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                      {/* Dipakai oleh */}
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {userCount > 0 ? (
                            <>
                              <span className="font-medium text-gray-900 dark:text-gray-100">
                                {userCount}
                              </span>{' '}
                              user
                            </>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </span>
                      </td>
                      {/* Aksi */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditingProfile(profile);
                              setShowFormDialog(true);
                            }}
                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                            title="Ubah profil"
                          >
                            <Edit2 className="w-4 h-4 text-gray-500" />
                          </button>
                          <button
                            onClick={() => setDeletingProfile(profile)}
                            disabled={userCount > 0}
                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title={userCount > 0 ? `Dipakai oleh ${userCount} user` : 'Hapus profil'}
                          >
                            <Trash2 className="w-4 h-4 text-gray-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Form Dialog */}
      <ProfileFormDialog
        open={showFormDialog}
        onOpenChange={open => {
          setShowFormDialog(open);
          if (!open) setEditingProfile(undefined);
        }}
        profile={editingProfile}
        onSave={handleSave}
      />

      {/* Delete Confirmation Dialog */}
      {deletingProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div
            className="bg-white dark:bg-gray-950 rounded-lg shadow-lg w-full max-w-md border border-gray-200 dark:border-gray-800"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20">
                  <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Hapus Profil
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Yakin ingin menghapus profil{' '}
                    <span className="font-mono font-medium text-gray-900 dark:text-gray-100">
                      {deletingProfile.name}
                    </span>
                    ?
                  </p>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 mb-4">
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  Profil akan dihapus dari router MikroTik. Jika profil masih dipakai oleh user,
                  penghapusan akan gagal.
                </p>
              </div>
              <div className="flex items-center justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => setDeletingProfile(null)}
                  disabled={isDeleting}
                >
                  Batal
                </Button>
                <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Menghapus...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Hapus
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

