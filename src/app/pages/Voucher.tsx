import { useState, useEffect } from 'react';
import { strings } from '../../strings/id';
import { Calendar, ChevronDown, Filter, Package, Plus, Printer, Search, Eye, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { VoucherGenerateDialog } from '../../features/vouchers/VoucherGenerateDialog';
import { generateMultiPlanBatch, getAllBatches, type VoucherBatch } from '../../features/vouchers/voucher-service';
import { getAllPlans, type VoucherPlan } from '../../features/plans/plan-service';
import { useRouterStore } from '../../stores/router-store';

export function Voucher() {
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [batches, setBatches] = useState<VoucherBatch[]>([]);
  const [plans, setPlans] = useState<VoucherPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const routerClient = useRouterStore(state => state.client);

  // Load batches and plans
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
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
  };

  const handleGenerate = async (items: Array<{ planId: string; qty: number }>, samePassword: boolean) => {
    if (!routerClient) {
      throw new Error('Router tidak terhubung');
    }

    const batch = await generateMultiPlanBatch(routerClient, items, samePassword);
    
    // Reload batches
    await loadData();
    
    // TODO: Navigate to print preview
    console.log('Batch created:', batch.id);
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

  // Helper: dapatkan label paket untuk batch (support multi-paket)
  const getBatchPlanLabels = (batch: VoucherBatch): string[] => {
    // Prioritas: items array (format baru), fallback ke legacy planId
    if (batch.items && batch.items.length > 0) {
      return batch.items.map(item => getPlanLabel(item.planId));
    }
    if (batch.planId) {
      return [getPlanLabel(batch.planId)];
    }
    return ['Unknown'];
  };

  // Helper: total voucher dalam batch
  const getBatchQty = (batch: VoucherBatch): number => {
    if (batch.codes && batch.codes.length > 0) {
      return batch.codes.length;
    }
    if (batch.items) {
      return batch.items.reduce((sum, item) => sum + item.qty, 0);
    }
    return batch.qty || 0;
  };

  return (
    <div>
      {/* Header dengan tombol aksi - DESIGN.md §4.5 */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          {strings.nav.voucher}
        </h1>
        <Button onClick={() => setShowGenerateDialog(true)}>
          <Plus className="w-4 h-4" />
          Buat Batch
        </Button>
      </div>

      {/* Generate Dialog */}
      <VoucherGenerateDialog
        open={showGenerateDialog}
        onOpenChange={setShowGenerateDialog}
        plans={plans}
        onGenerate={handleGenerate}
      />

      {/* Filter - DESIGN.md §4.5 */}
      <div className="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-4 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{strings.button.filter}:</span>
          </div>

          {/* Filter Paket */}
          <div className="relative">
            <button className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded-md text-sm hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
              <Package className="w-4 h-4" />
              <span>Semua paket</span>
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {/* Filter Tanggal */}
          <div className="relative">
            <button className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded-md text-sm hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
              <Calendar className="w-4 h-4" />
              <span>7 hari terakhir</span>
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {/* Filter Status Cetak */}
          <div className="relative">
            <button className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded-md text-sm hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
              <Printer className="w-4 h-4" />
              <span>Semua</span>
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          <button className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
            {strings.button.reset}
          </button>

          <div className="ml-auto text-sm text-gray-500">
            Menampilkan 0 dari 0 batch
          </div>
        </div>
      </div>

      {/* Tabel batch - DESIGN.md §4.5 */}
      <div className="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  <input type="checkbox" className="rounded border-gray-300 dark:border-gray-700" disabled />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Tanggal
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Paket
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Jumlah
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Dicetak?
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    Memuat...
                  </td>
                </tr>
              ) : batches.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
                        <Search className="w-8 h-8 text-gray-400" />
                      </div>
                      <div>
                        <p className="text-gray-900 dark:text-gray-100 font-medium mb-1">
                          Belum ada batch voucher
                        </p>
                        <p className="text-sm text-gray-500">
                          Buat batch pertama Anda untuk mulai menjual voucher
                        </p>
                      </div>
                      <Button onClick={() => setShowGenerateDialog(true)} className="mt-2">
                        <Plus className="w-4 h-4" />
                        Buat Batch Pertama
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                batches.map((batch) => {
                  const planLabels = getBatchPlanLabels(batch);
                  const batchQty = getBatchQty(batch);
                  const isMultiPlan = planLabels.length > 1;

                  return (
                  <tr
                    key={batch.id}
                    className="border-b border-gray-200 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 dark:border-gray-700"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                      {formatDate(batch.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                      {isMultiPlan ? (
                        <div className="space-y-1">
                          {planLabels.map((label, i) => (
                            <div key={i} className="flex items-center gap-1.5">
                              <Badge variant="secondary" className="text-xs">
                                {label}
                              </Badge>
                              {batch.items?.[i] && (
                                <span className="text-xs text-gray-500">
                                  × {batch.items[i].qty}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span>{planLabels[0]}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                      {batchQty}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary">Baru {batchQty}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {batch.printedAt ? (
                        <Badge variant="default">Sudah</Badge>
                      ) : (
                        <Badge variant="outline">Belum</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm">
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Printer className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Trash2 className="w-4 h-4" />
                        </Button>
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
    </div>
  );
}
