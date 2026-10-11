/**
 * Halaman Manajemen Batch Voucher
 * Sesuai KEPUTUSAN TERBARU §2, §3, §9 dan DESIGN.md §4.5
 */

import { Fragment, useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { strings } from '../../strings/id';
import {
  Calendar,
  Filter,
  Package,
  Plus,
  Printer,
  Search,
  Eye,
  EyeOff,
  Trash2,
  Copy,
  Check,
  AlertTriangle,
  RotateCcw,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from '../../components/ui/dialog';
import { VoucherGenerateDialog } from '../../features/vouchers/VoucherGenerateDialog';
import {
  generateMultiPlanBatch,
  PartialBatchError,
  getAllBatches,
  deleteBatch,
  deleteExpiredBatches,
  deleteVoucherAccount,
  getBatchStatusMap,
  type AccountInfo,
  type BatchStatusDetail,
  type VoucherBatch,
} from '../../features/vouchers/voucher-service';
import { getAllPlans, type VoucherPlan } from '../../features/plans/plan-service';
import { useRouterStore } from '../../stores/router-store';

export function Voucher() {
  const navigate = useNavigate();
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [batches, setBatches] = useState<VoucherBatch[]>([]);
  const [plans, setPlans] = useState<VoucherPlan[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter states (DESIGN.md §4.5)
  const [filterPlan, setFilterPlan] = useState<string>('all');
  const [filterDate, setFilterDate] = useState<'all' | 'today' | '7days' | '30days'>('all');
  const [filterPrinted, setFilterPrinted] = useState<'all' | 'printed' | 'unprinted'>('all');

  // Detail & Delete Dialog states
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusMap, setStatusMap] = useState<Record<string, BatchStatusDetail> | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [accountToDelete, setAccountToDelete] = useState<{ batchId: string; user: string } | null>(null);
  const [showDeleteBatchDialog, setShowDeleteBatchDialog] = useState<VoucherBatch | null>(null);
  const [showDeleteExpiredDialog, setShowDeleteExpiredDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Detail modal password visibility & copy feedback
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const routerClient = useRouterStore(state => state.client);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [batchesData, plansData] = await Promise.all([
        getAllBatches(),
        getAllPlans(),
      ]);
      setBatches(batchesData);
      setPlans(plansData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Status akun (Baru/Aktif/Kedaluwarsa) dibaca dari router dengan satu kali baca per putaran
  const loadStatuses = useCallback(async () => {
    if (!routerClient || batches.length === 0) {
      setStatusMap(null);
      return;
    }
    setStatusMap(await getBatchStatusMap(routerClient, batches));
  }, [routerClient, batches]);

  useEffect(() => {
    loadStatuses();
    const timer = setInterval(() => {
      if (!document.hidden) loadStatuses();
    }, 30000);
    return () => clearInterval(timer);
  }, [loadStatuses]);

  const handleGenerate = async (items: Array<{ planId: string; qty: number }>) => {
    if (!routerClient) {
      throw new Error('Router tidak terhubung');
    }

    let batch;
    try {
      batch = await generateMultiPlanBatch(routerClient, items);
    } catch (error) {
      if (error instanceof PartialBatchError) {
        // Voucher yang berhasil sudah tersimpan: segarkan daftar lalu tampilkan error ke pengguna
        await loadData();
      }
      throw error;
    }
    await loadData();
    // Buka langsung ke preview cetak sesuai KEPUTUSAN TERBARU §9
    navigate(`/voucher/cetak/${batch.id}`);
  };

  const handleDeleteBatch = async (batchId: string, localOnly = false) => {
    if (!localOnly && !routerClient) {
      setDeleteError('Router tidak terhubung, jadi akun di router belum bisa dihapus.');
      return;
    }
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await deleteBatch(localOnly ? null : routerClient, batchId, { localOnly });
      if (!res.removedLocal) {
        setDeleteError(
          `Gagal menghapus ${res.failed.length} akun di router (${res.failed[0].error}). ` +
            'Riwayat batch belum dihapus, coba lagi.'
        );
        return;
      }
      setShowDeleteBatchDialog(null);
      setExpandedId(null);
      await loadData();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Gagal menghapus batch');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteAccount = async (batchId: string, user: string, localOnly = false) => {
    if (!localOnly && !routerClient) {
      setDeleteError('Router tidak terhubung, jadi akun di router belum bisa dihapus.');
      return;
    }
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await deleteVoucherAccount(localOnly ? null : routerClient, batchId, user, { localOnly });
      setAccountToDelete(null);
      if (res.batchDeleted) setExpandedId(null);
      await loadData();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Gagal menghapus akun');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteExpired = async () => {
    if (!routerClient) return;
    setIsDeleting(true);
    try {
      await deleteExpiredBatches(routerClient);
      setShowDeleteExpiredDialog(false);
      await loadData();
    } catch (err) {
      console.error('Failed to delete expired batches:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const copyText = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleCopyAllCodes = (batch: VoucherBatch) => {
    copyText(
      `all:${batch.id}`,
      batch.codes.map(c => `${c.user}:${c.pass}`).join('\n')
    );
  };

  const togglePasswordVisibility = (username: string) => {
    setVisiblePasswords(prev => ({
      ...prev,
      [username]: !prev[username],
    }));
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const getPlanLabel = (planId: string) => {
    const plan = plans.find(p => p.id === planId);
    return plan?.label || 'Unknown';
  };

  const getBatchPlanLabels = (batch: VoucherBatch): string[] => {
    if (batch.items && batch.items.length > 0) {
      return batch.items.map(item => getPlanLabel(item.planId));
    }
    if (batch.planId) {
      return [getPlanLabel(batch.planId)];
    }
    return ['Unknown'];
  };

  const getBatchQty = (batch: VoucherBatch): number => {
    if (batch.codes && batch.codes.length > 0) {
      return batch.codes.length;
    }
    if (batch.items) {
      return batch.items.reduce((sum, item) => sum + item.qty, 0);
    }
    return batch.qty || 0;
  };

  // Filter logic (DESIGN.md §4.5)
  const filteredBatches = useMemo(() => {
    return batches.filter(b => {
      // 1. Filter Paket
      if (filterPlan !== 'all') {
        const hasPlan = (b.items && b.items.some(i => i.planId === filterPlan)) || b.planId === filterPlan;
        if (!hasPlan) return false;
      }

      // 2. Filter Status Cetak
      if (filterPrinted === 'printed' && !b.printedAt) return false;
      if (filterPrinted === 'unprinted' && b.printedAt) return false;

      // 3. Filter Tanggal
      if (filterDate !== 'all') {
        const now = Date.now();
        const diffDays = (now - b.createdAt) / (1000 * 60 * 60 * 24);
        if (filterDate === 'today' && diffDays > 1) return false;
        if (filterDate === '7days' && diffDays > 7) return false;
        if (filterDate === '30days' && diffDays > 30) return false;
      }

      return true;
    });
  }, [batches, filterPlan, filterPrinted, filterDate]);

  const renderAccountStatus = (info?: AccountInfo) => {
    if (!info) {
      return <span className="text-gray-400">—</span>;
    }
    if (info.status === 'expired') {
      return (
        <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
          ✖ Kedaluwarsa
        </span>
      );
    }
    if (info.status === 'new') {
      return (
        <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300">
          ● Baru
        </span>
      );
    }
    const left =
      info.validityMinutes !== undefined && info.usedMinutes !== undefined
        ? Math.max(0, info.validityMinutes - info.usedMinutes)
        : null;
    return (
      <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300">
        ▶ Aktif{left !== null ? ` · sisa ${left} mnt` : ''}
      </span>
    );
  };

  const resetFilters = () => {
    setFilterPlan('all');
    setFilterDate('all');
    setFilterPrinted('all');
  };

  return (
    <div className="space-y-6">
      {/* Header dengan tombol aksi - DESIGN.md §4.5 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {strings.nav.voucher}
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Riwayat batch voucher (maksimal 8 per halaman A4) dan cetak PDF
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDeleteExpiredDialog(true)}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 border-red-200 dark:border-red-900 text-xs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Hapus Batch Kedaluwarsa
          </Button>

          <Button onClick={() => setShowGenerateDialog(true)} className="gap-2 bg-green-600 hover:bg-green-700 text-white">
            <Plus className="w-4 h-4" />
            Buat Batch
          </Button>
        </div>
      </div>

      {/* Generate Dialog */}
      <VoucherGenerateDialog
        open={showGenerateDialog}
        onOpenChange={setShowGenerateDialog}
        plans={plans}
        onGenerate={handleGenerate}
      />

      {/* Filter Toolbar - DESIGN.md §4.5 */}
      <div className="bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-xs">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
            <Filter className="w-3.5 h-3.5 text-gray-500" />
            <span>Filter:</span>
          </div>

          {/* Filter Paket Dropdown */}
          <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-900 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-800 text-xs">
            <Package className="w-3.5 h-3.5 text-gray-500" />
            <select
              value={filterPlan}
              onChange={e => setFilterPlan(e.target.value)}
              className="bg-transparent border-none text-gray-900 dark:text-gray-100 focus:outline-none cursor-pointer"
            >
              <option value="all">Semua Paket</option>
              {plans.map(p => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Filter Tanggal Dropdown */}
          <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-900 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-800 text-xs">
            <Calendar className="w-3.5 h-3.5 text-gray-500" />
            <select
              value={filterDate}
              onChange={e => setFilterDate(e.target.value as 'all' | 'today' | '7days' | '30days')}
              className="bg-transparent border-none text-gray-900 dark:text-gray-100 focus:outline-none cursor-pointer"
            >
              <option value="all">Semua Tanggal</option>
              <option value="today">Hari Ini</option>
              <option value="7days">7 Hari Terakhir</option>
              <option value="30days">30 Hari Terakhir</option>
            </select>
          </div>

          {/* Filter Status Cetak Dropdown */}
          <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-900 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-800 text-xs">
            <Printer className="w-3.5 h-3.5 text-gray-500" />
            <select
              value={filterPrinted}
              onChange={e => setFilterPrinted(e.target.value as 'all' | 'printed' | 'unprinted')}
              className="bg-transparent border-none text-gray-900 dark:text-gray-100 focus:outline-none cursor-pointer"
            >
              <option value="all">Semua Status Cetak</option>
              <option value="printed">Sudah Dicetak</option>
              <option value="unprinted">Belum Dicetak</option>
            </select>
          </div>

          {(filterPlan !== 'all' || filterDate !== 'all' || filterPrinted !== 'all') && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 hover:underline font-medium ml-1"
            >
              <RotateCcw className="w-3 h-3" />
              Reset Filter
            </button>
          )}

          <div className="ml-auto text-xs text-gray-500 font-medium">
            Menampilkan {filteredBatches.length} dari {batches.length} batch
          </div>
        </div>
      </div>

      {/* Tabel Batch Voucher - DESIGN.md §4.5 */}
      <div className="bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-gray-200 dark:border-gray-800 bg-gray-50/75 dark:bg-gray-900/50">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Tanggal
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Paket
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Jumlah (Maks 8)
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Dicetak?
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-900 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                    Memuat data batch…
                  </td>
                </tr>
              ) : filteredBatches.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
                        <Search className="w-8 h-8 text-gray-400" />
                      </div>
                      <div>
                        <p className="text-gray-900 dark:text-gray-100 font-semibold mb-1">
                          {batches.length === 0 ? 'Belum Ada Batch Voucher' : 'Tidak Ada Batch yang Cocok'}
                        </p>
                        <p className="text-xs text-gray-500 max-w-sm mx-auto">
                          {batches.length === 0
                            ? 'Buat batch pertama Anda untuk mulai mencetak voucher dan menjualnya ke pengguna hotspot.'
                            : 'Coba ubah kriteria filter pencarian atau reset filter untuk melihat semua batch.'}
                        </p>
                      </div>
                      {batches.length === 0 ? (
                        <Button onClick={() => setShowGenerateDialog(true)} className="mt-2 bg-green-600 hover:bg-green-700 text-white">
                          <Plus className="w-4 h-4" />
                          Buat Batch Pertama
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={resetFilters} className="mt-2">
                          Reset Filter
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredBatches.map(batch => {
                  const planLabels = getBatchPlanLabels(batch);
                  const batchQty = getBatchQty(batch);
                  const isMultiPlan = planLabels.length > 1;

                  const batchStatus = batch.id ? statusMap?.[batch.id] : undefined;
                  const isExpanded = expandedId === batch.id;

                  return (
                    <Fragment key={batch.id}>
                    <tr
                      className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : batch.id ?? null)}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100 text-xs">
                        {formatDate(batch.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-900 dark:text-gray-100">
                        {isMultiPlan ? (
                          <div className="flex flex-wrap gap-1">
                            {planLabels.map((lbl, idx) => (
                              <Badge key={idx} variant="secondary" className="text-[10px]">
                                {lbl}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="font-medium">{planLabels[0]}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-900 dark:text-gray-100 font-mono">
                        {batchQty} voucher
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {batchStatus ? (
                          <div className="flex flex-wrap gap-1">
                            {batchStatus.newCount > 0 && (
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300">
                                Baru {batchStatus.newCount}
                              </span>
                            )}
                            {batchStatus.activeCount > 0 && (
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300">
                                Aktif {batchStatus.activeCount}
                              </span>
                            )}
                            {batchStatus.expiredCount > 0 && (
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                                Kedaluwarsa {batchStatus.expiredCount}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                            title="Status dari router belum tersedia"
                          >
                            {batchQty} akun · status belum dimuat
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {batch.printedAt ? (
                          <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400 font-medium text-xs">
                            ✔ Sudah
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-gray-400 text-xs">
                            Belum
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            title={isExpanded ? 'Tutup isi batch' : 'Lihat isi batch'}
                            onClick={e => {
                              e.stopPropagation();
                              setExpandedId(isExpanded ? null : batch.id ?? null);
                            }}
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                            )}
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            title="Cetak PDF"
                            onClick={e => {
                              e.stopPropagation();
                              navigate(`/voucher/cetak/${batch.id}`);
                            }}
                          >
                            <Printer className="w-4 h-4 text-green-600 dark:text-green-400" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            title="Hapus Batch"
                            onClick={e => {
                              e.stopPropagation();
                              setDeleteError(null);
                              setShowDeleteBatchDialog(batch);
                            }}
                            className="hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-gray-50/60 dark:bg-gray-900/30">
                        <td colSpan={6} className="px-4 py-3">
                          <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                              Isi batch: {batch.codes.length} akun
                              {!batchStatus && (
                                <span className="font-normal text-gray-500">
                                  {' '}· status router belum tersedia (router terputus?)
                                </span>
                              )}
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCopyAllCodes(batch)}
                              className="gap-1.5 text-xs"
                            >
                              {copiedKey === `all:${batch.id}` ? (
                                <Check className="w-3.5 h-3.5 text-green-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                              {copiedKey === `all:${batch.id}` ? 'Tersalin' : 'Salin Semua'}
                            </Button>
                          </div>

                          <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead className="bg-gray-50 dark:bg-gray-900 text-gray-500">
                                <tr>
                                  <th className="px-3 py-2 text-left font-medium w-8">No</th>
                                  <th className="px-3 py-2 text-left font-medium">Username</th>
                                  <th className="px-3 py-2 text-left font-medium">Password</th>
                                  <th className="px-3 py-2 text-left font-medium">Paket</th>
                                  <th className="px-3 py-2 text-left font-medium">Status</th>
                                  <th className="px-3 py-2 text-right font-medium">Aksi</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 dark:divide-gray-900">
                                {batch.codes.map((code, idx) => {
                                  const isPassVisible = !!visiblePasswords[code.user];
                                  return (
                                    <tr key={code.user}>
                                      <td className="px-3 py-2 text-gray-400 font-mono">{idx + 1}</td>
                                      <td className="px-3 py-2 font-mono font-bold tracking-wide text-gray-900 dark:text-gray-100">
                                        {code.user}
                                      </td>
                                      <td className="px-3 py-2 font-mono font-bold tracking-wide text-gray-900 dark:text-gray-100">
                                        <span className="inline-flex items-center gap-1.5">
                                          {isPassVisible ? code.pass : '••••••'}
                                          <button
                                            type="button"
                                            title={isPassVisible ? 'Sembunyikan password' : 'Tampilkan password'}
                                            onClick={() => togglePasswordVisibility(code.user)}
                                            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded"
                                          >
                                            {isPassVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                          </button>
                                        </span>
                                      </td>
                                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                                        {getPlanLabel(code.planId)}
                                      </td>
                                      <td className="px-3 py-2">
                                        {renderAccountStatus(batchStatus?.accounts[code.user])}
                                      </td>
                                      <td className="px-3 py-2 text-right whitespace-nowrap">
                                        <button
                                          type="button"
                                          title="Salin username:password"
                                          onClick={() => copyText(`one:${batch.id}:${code.user}`, `${code.user}:${code.pass}`)}
                                          className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded"
                                        >
                                          {copiedKey === `one:${batch.id}:${code.user}` ? (
                                            <Check className="w-4 h-4 text-green-600" />
                                          ) : (
                                            <Copy className="w-4 h-4" />
                                          )}
                                        </button>
                                        <button
                                          type="button"
                                          title="Hapus akun ini"
                                          onClick={() => {
                                            setDeleteError(null);
                                            setAccountToDelete({ batchId: batch.id!, user: code.user });
                                          }}
                                          className="p-1.5 text-red-400 hover:text-red-600 rounded"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dialog Konfirmasi Hapus Single Batch */}
      <Dialog open={!!showDeleteBatchDialog} onOpenChange={() => setShowDeleteBatchDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader onClose={() => setShowDeleteBatchDialog(null)}>
            <DialogTitle className="text-red-600 dark:text-red-400">
              Hapus Batch Voucher?
            </DialogTitle>
            <DialogDescription>
              Menghapus {showDeleteBatchDialog?.codes.length} user voucher dari router dan riwayat lokal.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-3">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Akun hotspot batch ini dan sesi aktifnya di router MikroTik akan dihapus permanen.
            </p>
            {!routerClient && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Router tidak terhubung. Kamu hanya bisa menghapus riwayat lokal; akun yang masih ada di router tidak ikut terhapus.
              </p>
            )}
            {deleteError && (
              <p className="text-xs text-red-600 dark:text-red-400">{deleteError}</p>
            )}
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteBatchDialog(null)}>
              Batal
            </Button>
            {(deleteError || !routerClient) && (
              <Button
                variant="outline"
                disabled={isDeleting}
                onClick={() => showDeleteBatchDialog?.id && handleDeleteBatch(showDeleteBatchDialog.id, true)}
              >
                Hapus riwayat saja
              </Button>
            )}
            <Button
              onClick={() => showDeleteBatchDialog?.id && handleDeleteBatch(showDeleteBatchDialog.id)}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? 'Menghapus…' : 'Hapus Batch'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Konfirmasi Hapus Satu Akun */}
      <Dialog open={!!accountToDelete} onOpenChange={() => setAccountToDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader onClose={() => setAccountToDelete(null)}>
            <DialogTitle className="text-red-600 dark:text-red-400">
              Hapus Akun {accountToDelete?.user}?
            </DialogTitle>
            <DialogDescription>
              Akun ini diputus dari sesi aktif dan dihapus dari router serta dari batch.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-3">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Voucher yang sudah dicetak dengan akun ini tidak akan bisa dipakai lagi. Jika ini akun terakhir, batch ikut dihapus.
            </p>
            {!routerClient && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Router tidak terhubung. Hanya riwayat lokal yang bisa dihapus.
              </p>
            )}
            {deleteError && <p className="text-xs text-red-600 dark:text-red-400">{deleteError}</p>}
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAccountToDelete(null)}>
              Batal
            </Button>
            {(deleteError || !routerClient) && (
              <Button
                variant="outline"
                disabled={isDeleting}
                onClick={() => accountToDelete && handleDeleteAccount(accountToDelete.batchId, accountToDelete.user, true)}
              >
                Hapus riwayat saja
              </Button>
            )}
            <Button
              onClick={() => accountToDelete && handleDeleteAccount(accountToDelete.batchId, accountToDelete.user)}
              disabled={isDeleting || !routerClient}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? 'Menghapus…' : 'Hapus Akun'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Konfirmasi Hapus Batch Kedaluwarsa (DESIGN.md §4.5) */}
      <Dialog open={showDeleteExpiredDialog} onOpenChange={setShowDeleteExpiredDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader onClose={() => setShowDeleteExpiredDialog(false)}>
            <DialogTitle className="text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Hapus Batch Kedaluwarsa
            </DialogTitle>
            <DialogDescription>
              Pembersihan massal batch yang seluruh vouchernya telah habis masa berlakunya.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-3">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Tindakan ini akan memeriksa seluruh batch dan menghapus batch yang <strong>semua vouchernya sudah kedaluwarsa</strong> dari riwayat.
            </p>
            <p className="text-xs text-gray-500">
              User dan scheduler yang masih tersisa di router untuk batch kedaluwarsa ini ikut dibersihkan. Riwayat yang dihapus tidak bisa dikembalikan.
            </p>
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteExpiredDialog(false)}>
              Batal
            </Button>
            <Button
              onClick={handleDeleteExpired}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? 'Membersihkan…' : 'Hapus Batch Kedaluwarsa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
