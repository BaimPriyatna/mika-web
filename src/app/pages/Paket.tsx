/**
 * Halaman Paket Voucher
 * CRUD paket + preset cepat
 * Sesuai DESIGN.md §4.4
 */

import { useState, useEffect } from 'react';
import { Package, Plus, Zap, Loader2, AlertCircle } from 'lucide-react';
import { strings } from '../../strings/id';
import { Button } from '../../components/ui/button';
import { PlanCard } from '../../features/plans/PlanCard';
import { PlanFormDialog } from '../../features/plans/PlanFormDialog';
import { PresetDialog } from '../../features/plans/PresetDialog';
import {
  getAllPlans,
  createPlan,
  updatePlan,
  deletePlan,
  type VoucherPlan,
} from '../../features/plans/plan-service';
import { createProfile, getProfiles, getProfileByName } from '../../features/profiles/profile-service';
import { useRouterStore } from '../../stores/router-store';

export function Paket() {
  const { client } = useRouterStore();
  const [plans, setPlans] = useState<VoucherPlan[]>([]);
  const [profiles, setProfiles] = useState<Array<{ name: string; rateLimit?: string; validity?: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Dialog states
  const [showFormDialog, setShowFormDialog] = useState(false);
  const [editingPlan, setEditingPlan] = useState<VoucherPlan | undefined>();
  const [showPresetDialog, setShowPresetDialog] = useState(false);
  const [presetType, setPresetType] = useState<'1h' | '3h' | '1d' | '1w' | '1m' | null>(null);

  // Load data
  useEffect(() => {
    loadData();
  }, [client]);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Load plans dari IndexedDB
      const loadedPlans = await getAllPlans();
      setPlans(loadedPlans);

      // Load profiles dari router jika terkoneksi
      if (client) {
        const loadedProfiles = await getProfiles(client);
        setProfiles(loadedProfiles);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal memuat data';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreatePlan = async (data: {
    label: string;
    profileName: string;
    price: number;
    limitBytesTotal?: number;
  }) => {
    await createPlan(data.label, data.profileName, data.price, data.limitBytesTotal);
    await loadData();
  };

  const handleUpdatePlan = async (data: {
    label: string;
    profileName: string;
    price: number;
    limitBytesTotal?: number;
  }) => {
    if (!editingPlan?.id) return;
    await updatePlan(editingPlan.id, data);
    await loadData();
    setEditingPlan(undefined);
  };

  const handleDeletePlan = async (plan: VoucherPlan) => {
    if (!plan.id) return;

    // Konfirmasi
    const confirmed = window.confirm(
      `Yakin ingin menghapus paket "${plan.label}"?\n\n` +
      `Paket yang sudah digunakan oleh batch tidak bisa dihapus.`
    );

    if (!confirmed) return;

    try {
      await deletePlan(plan.id);
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menghapus paket';
      alert(message);
    }
  };

  const handleOpenPreset = (type: '1h' | '3h' | '1d' | '1w' | '1m') => {
    setPresetType(type);
    setShowPresetDialog(true);
  };

  const handleCreateFromPreset = async (data: {
    label: string;
    profileName: string;
    uploadSpeed: string;
    downloadSpeed: string;
    validity: string;
    price: number;
  }) => {
    if (!client) {
      throw new Error('Router belum terhubung');
    }

    // Cek apakah profil sudah ada
    const existingProfile = await getProfileByName(client, data.profileName);

    // Jika profil belum ada, buat profil dulu
    if (!existingProfile) {
      await createProfile(client, {
        name: data.profileName,
        uploadSpeed: data.uploadSpeed,
        downloadSpeed: data.downloadSpeed,
        validity: data.validity,
      });
    }

    // Buat paket
    await createPlan(data.label, data.profileName, data.price);
    await loadData();
  };

  // Hitung jumlah voucher per paket
  const getVoucherCount = (_planId: string) => {
    // TODO: Query batches untuk hitung voucher
    return 0;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-red-900 dark:text-red-100 mb-1">Gagal memuat data</h3>
            <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
            <Button onClick={loadData} variant="outline" className="mt-3" size="sm">
              Coba Lagi
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header dengan tombol - DESIGN.md §4.4 */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          {strings.nav.paket}
        </h1>
        <Button
          onClick={() => {
            setEditingPlan(undefined);
            setShowFormDialog(true);
          }}
        >
          <Plus className="w-4 h-4" />
          Buat Paket
        </Button>
      </div>

      {/* Tombol preset - DESIGN.md §4.4 */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Preset Cepat:
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleOpenPreset('1h')}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 text-sm rounded-md transition-colors"
          >
            1 Jam
          </button>
          <button
            onClick={() => handleOpenPreset('3h')}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 text-sm rounded-md transition-colors"
          >
            3 Jam
          </button>
          <button
            onClick={() => handleOpenPreset('1d')}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 text-sm rounded-md transition-colors"
          >
            1 Hari
          </button>
          <button
            onClick={() => handleOpenPreset('1w')}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 text-sm rounded-md transition-colors"
          >
            1 Minggu
          </button>
          <button
            onClick={() => handleOpenPreset('1m')}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 text-sm rounded-md transition-colors"
          >
            1 Bulan
          </button>
        </div>
      </div>

      {/* Grid paket atau empty state */}
      {plans.length === 0 ? (
        <div className="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-12">
          <div className="flex flex-col items-center text-center max-w-md mx-auto">
            <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-900 flex items-center justify-center mb-4">
              <Package className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Belum ada paket
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Buat paket pertama Anda untuk mengatur harga dan durasi voucher. Gunakan preset untuk
              memulai dengan cepat.
            </p>
            <Button onClick={() => setShowFormDialog(true)}>
              <Plus className="w-4 h-4" />
              Buat Paket Pertama
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map(plan => {
            const profile = profiles.find(p => p.name === plan.profileName);
            return (
              <PlanCard
                key={plan.id}
                plan={plan}
                profile={profile}
                voucherCount={getVoucherCount(plan.id!)}
                onEdit={() => {
                  setEditingPlan(plan);
                  setShowFormDialog(true);
                }}
                onDelete={() => handleDeletePlan(plan)}
              />
            );
          })}
        </div>
      )}

      {/* Dialogs */}
      <PlanFormDialog
        open={showFormDialog}
        onOpenChange={open => {
          setShowFormDialog(open);
          if (!open) setEditingPlan(undefined);
        }}
        plan={editingPlan}
        profiles={profiles}
        onSave={editingPlan ? handleUpdatePlan : handleCreatePlan}
      />

      <PresetDialog
        open={showPresetDialog}
        onOpenChange={setShowPresetDialog}
        presetType={presetType}
        onConfirm={handleCreateFromPreset}
      />
    </div>
  );
}
