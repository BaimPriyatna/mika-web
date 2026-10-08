import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Printer,
  Download,
  Sliders,
  CheckCircle2,
  FileCheck,
  Eye,
  RefreshCw,
  Plus,
  HelpCircle,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react';
import { db, type VoucherBatch, type VoucherPlan } from '../../core/db/schema';
import { getAllPlans } from '../../features/plans/plan-service';
import {
  generateVoucherPDF,
  generateCalibrationPDF,
  downloadPDF,
  pdfBytesToDataUrl,
} from '../../features/pdf/voucher-renderer';
import type { VoucherData, PdfOptions } from '../../features/pdf/types';
import { getAppSettings, saveAppSettings } from '../../features/settings/settings-service';
import { markBatchAsPrinted } from '../../features/vouchers/voucher-service';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogBody,
} from '../../components/ui/dialog';

export function CetakVoucher() {
  const { batchId } = useParams<{ batchId: string }>();
  const navigate = useNavigate();

  const [batch, setBatch] = useState<VoucherBatch | null>(null);
  const [plans, setPlans] = useState<VoucherPlan[]>([]);
  const [loading, setLoading] = useState(true);

  // Print controls
  const [inkSaver, setInkSaver] = useState(false);
  const [showCutLines, setShowCutLines] = useState(true);
  const [offsetX, setOffsetX] = useState(0.0);
  const [offsetY, setOffsetY] = useState(0.0);
  const [brandName, setBrandName] = useState('WIFI TKJ');
  const [loginUrl, setLoginUrl] = useState('http://hotspot.local/login');

  // Preview state
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(100); // 75, 100, 125, etc.

  // Confirmation dialog state after print/download
  const [showMarkPrintedDialog, setShowMarkPrintedDialog] = useState(false);
  const [isMarkChecked, setIsMarkChecked] = useState(true);
  const [isMarking, setIsMarking] = useState(false);

  const prevPdfUrlRef = useRef<string | null>(null);

  // Load batch, plans, and settings
  const loadData = useCallback(async () => {
    if (!batchId) return;
    try {
      setLoading(true);
      const [batchData, plansData, settings] = await Promise.all([
        db.batches.get(batchId),
        getAllPlans(),
        getAppSettings(),
      ]);

      if (!batchData) {
        setRenderError('Batch tidak ditemukan');
        return;
      }

      setBatch(batchData);
      setPlans(plansData);
      setInkSaver(settings.inkSaver);
      setShowCutLines(settings.showCutLines);
      setOffsetX(settings.offsetX);
      setOffsetY(settings.offsetY);
      setBrandName(settings.brandName);
      setLoginUrl(settings.loginUrl);
    } catch (err) {
      console.error('Failed to load batch data:', err);
      setRenderError('Gagal memuat data batch.');
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Map batch codes to VoucherData array
  const voucherDataList: VoucherData[] = useMemo(() => {
    if (!batch) return [];

    const planMap = new Map<string, VoucherPlan>();
    for (const p of plans) {
      if (p.id) planMap.set(p.id, p);
    }

    return batch.codes.slice(0, 8).map(code => {
      const plan = planMap.get(code.planId);
      const planLabel = plan?.label || 'Hotspot';
      const price = plan?.price || 0;

      // Derivasi teks durasi dari label paket atau profil
      const durationUpper = planLabel.toUpperCase();
      const validityText = planLabel.toLowerCase();

      return {
        username: code.user,
        password: code.pass,
        planLabel,
        price,
        duration: durationUpper,
        validity: validityText,
        speed: 'Akses Penuh',
        loginUrl,
      };
    });
  }, [batch, plans, loginUrl]);

  // Generate PDF preview
  const generatePreview = useCallback(async () => {
    if (voucherDataList.length === 0) return;

    try {
      setIsRendering(true);
      setRenderError(null);

      const options: PdfOptions = {
        brandName,
        loginUrl,
        inkSaver,
        showCutLines,
        offsetX,
        offsetY,
      };

      const pdfBytes = await generateVoucherPDF(voucherDataList, options);
      const newUrl = pdfBytesToDataUrl(pdfBytes);

      // Clean up previous blob URL
      if (prevPdfUrlRef.current) {
        URL.revokeObjectURL(prevPdfUrlRef.current);
      }
      prevPdfUrlRef.current = newUrl;
      setPdfUrl(newUrl);
    } catch (err) {
      console.error('Failed to render PDF preview:', err);
      setRenderError(err instanceof Error ? err.message : 'Gagal membuat pratinjau PDF');
    } finally {
      setIsRendering(false);
    }
  }, [voucherDataList, brandName, loginUrl, inkSaver, showCutLines, offsetX, offsetY]);

  // Re-generate preview when options change (with debounce)
  useEffect(() => {
    const timer = setTimeout(() => {
      generatePreview();
    }, 200);

    return () => clearTimeout(timer);
  }, [generatePreview]);

  // Clean up blob URL on unmount
  useEffect(() => {
    return () => {
      if (prevPdfUrlRef.current) {
        URL.revokeObjectURL(prevPdfUrlRef.current);
      }
    };
  }, []);

  // Handle Unduh PDF
  const handleDownload = async () => {
    if (voucherDataList.length === 0 || !batch) return;

    try {
      const options: PdfOptions = {
        brandName,
        loginUrl,
        inkSaver,
        showCutLines,
        offsetX,
        offsetY,
      };

      const pdfBytes = await generateVoucherPDF(voucherDataList, options);
      downloadPDF(pdfBytes, `voucher-${batch.id}.pdf`);

      // Persist settings preferences
      await saveAppSettings({
        inkSaver,
        showCutLines,
        offsetX,
        offsetY,
      });

      // Prompt to mark printed if not yet printed
      if (!batch.printedAt) {
        setShowMarkPrintedDialog(true);
      }
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  // Handle Cetak Langsung (via hidden iframe)
  const handlePrint = async () => {
    if (!pdfUrl || !batch) return;

    try {
      // Save settings
      await saveAppSettings({
        inkSaver,
        showCutLines,
        offsetX,
        offsetY,
      });

      // Create hidden iframe for direct print
      let printFrame = document.getElementById('pdf-print-frame') as HTMLIFrameElement;
      if (!printFrame) {
        printFrame = document.createElement('iframe');
        printFrame.id = 'pdf-print-frame';
        printFrame.style.position = 'fixed';
        printFrame.style.right = '0';
        printFrame.style.bottom = '0';
        printFrame.style.width = '0';
        printFrame.style.height = '0';
        printFrame.style.border = 'none';
        document.body.appendChild(printFrame);
      }

      printFrame.src = pdfUrl;
      printFrame.onload = () => {
        setTimeout(() => {
          printFrame.contentWindow?.focus();
          printFrame.contentWindow?.print();
        }, 100);
      };

      if (!batch.printedAt) {
        setShowMarkPrintedDialog(true);
      }
    } catch (err) {
      console.error('Print trigger failed:', err);
    }
  };

  // Handle Halaman Kalibrasi
  const handleDownloadCalibration = async () => {
    try {
      const calibBytes = await generateCalibrationPDF({ offsetX, offsetY });
      downloadPDF(calibBytes, 'kalibrasi-printer-a4.pdf');
    } catch (err) {
      console.error('Failed to generate calibration page:', err);
    }
  };

  // Handle Mark as Printed confirmation
  const handleConfirmMarkPrinted = async () => {
    if (!batchId || !batch) return;
    try {
      setIsMarking(true);
      if (isMarkChecked) {
        await markBatchAsPrinted(batchId);
        setBatch({ ...batch, printedAt: Date.now() });
      }
      setShowMarkPrintedDialog(false);
    } catch (err) {
      console.error('Failed to mark batch:', err);
    } finally {
      setIsMarking(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(timestamp));
  };

  const getBatchPlanSummary = () => {
    if (!batch) return '';
    const planMap = new Map<string, VoucherPlan>();
    plans.forEach(p => p.id && planMap.set(p.id, p));

    if (batch.items && batch.items.length > 0) {
      return batch.items.map(item => {
        const p = planMap.get(item.planId);
        return p?.label || 'Paket';
      }).join(', ');
    }
    return 'Hotspot Voucher';
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <RefreshCw className="w-8 h-8 animate-spin text-green-600" />
        <p className="text-sm text-gray-500">Menyiapkan dokumen PDF voucher…</p>
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="max-w-md mx-auto mt-12 p-6 bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 text-center space-y-4">
        <p className="text-sm text-red-600 dark:text-red-400 font-semibold">
          {renderError || 'Batch voucher tidak ditemukan'}
        </p>
        <Button onClick={() => navigate('/voucher')} variant="outline" className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Daftar Voucher
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header & Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-800 pb-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/voucher')}
            className="text-gray-600 dark:text-gray-400 -ml-2"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Voucher
          </Button>

          <div className="h-4 w-px bg-gray-200 dark:bg-gray-800" />

          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Printer className="w-5 h-5 text-green-600" />
              Cetak Voucher
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
              Batch: {formatDate(batch.createdAt)} · {getBatchPlanSummary()} · {batch.codes.length} voucher · 1 halaman
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {batch.printedAt && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Sudah Dicetak
            </span>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/voucher')}
            className="gap-1.5 text-xs text-green-600 dark:text-green-400 border-green-200 dark:border-green-900 hover:bg-green-50"
          >
            <Plus className="w-3.5 h-3.5" />
            Generate Lagi
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            disabled={isRendering || !pdfUrl}
            className="gap-1.5 text-xs"
          >
            <Download className="w-3.5 h-3.5" />
            Unduh PDF
          </Button>

          <Button
            onClick={handlePrint}
            disabled={isRendering || !pdfUrl}
            className="gap-1.5 text-xs bg-green-600 hover:bg-green-700 text-white font-medium"
          >
            <Printer className="w-3.5 h-3.5" />
            Cetak
          </Button>
        </div>
      </div>

      {/* Main Content: Controls + PDF Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Side: Controls Panel (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          {/* Card: Opsi Desain & Tinta */}
          <div className="bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-gray-500" />
              Opsi Cetak
            </h3>

            <div className="space-y-3 pt-1">
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={inkSaver}
                  onChange={e => setInkSaver(e.target.checked)}
                  className="mt-0.5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                />
                <div className="text-xs">
                  <span className="font-medium text-gray-900 dark:text-gray-100 block">
                    Mode Hemat Tinta
                  </span>
                  <span className="text-gray-500 block mt-0.5">
                    Menghilangkan header blok hitam, hanya garis bawah hitam (hemat toner).
                  </span>
                </div>
              </label>

              <div className="h-px bg-gray-100 dark:bg-gray-900" />

              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showCutLines}
                  onChange={e => setShowCutLines(e.target.checked)}
                  className="mt-0.5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                />
                <div className="text-xs">
                  <span className="font-medium text-gray-900 dark:text-gray-100 block">
                    Garis Potong (Gunting)
                  </span>
                  <span className="text-gray-500 block mt-0.5">
                    Garis putus-putus abu-abu 0,3 pt di sekeliling tiap voucher.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Card: Offset Printer & Kalibrasi */}
          <div className="bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Offset Printer
              </h3>
              <span className="text-[10px] text-gray-400 font-mono">
                Satuan: mm
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-gray-600 dark:text-gray-400 mb-1 font-medium">
                  Offset X (Geser H/V)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.5"
                    value={offsetX}
                    onChange={e => setOffsetX(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 border border-gray-300 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-900 font-mono focus:ring-1 focus:ring-green-600"
                  />
                  <span className="absolute right-2.5 top-1.5 text-gray-400 pointer-events-none">mm</span>
                </div>
              </div>

              <div>
                <label className="block text-gray-600 dark:text-gray-400 mb-1 font-medium">
                  Offset Y (Vertikal)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.5"
                    value={offsetY}
                    onChange={e => setOffsetY(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 border border-gray-300 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-900 font-mono focus:ring-1 focus:ring-green-600"
                  />
                  <span className="absolute right-2.5 top-1.5 text-gray-400 pointer-events-none">mm</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-900/60 rounded-lg text-xs border border-gray-100 dark:border-gray-800">
              <span className="text-gray-600 dark:text-gray-400">Margin Kiri & Kanan</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1">
                🔒 10 mm (Tetap)
              </span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadCalibration}
              className="w-full gap-2 text-xs border-dashed text-gray-700 dark:text-gray-300"
            >
              <FileCheck className="w-3.5 h-3.5 text-blue-600" />
              Unduh Halaman Kalibrasi
            </Button>
          </div>

          {/* Card: Petunjuk Skala Cetak */}
          <div className="p-4 bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-xs space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-emerald-900 dark:text-emerald-200">
              <HelpCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              Penting saat mencetak di printer:
            </div>
            <ul className="list-disc list-inside text-emerald-800 dark:text-emerald-300 space-y-1 pl-1 text-[11px] leading-relaxed">
              <li>Pilih skala <strong>100% / "Actual size"</strong> di dialog print.</li>
              <li>Jangan pilih "Fit to page" atau "Sesuaikan halaman".</li>
              <li>Satu lembar A4 memuat tepat <strong>8 voucher (85 × 54 mm)</strong>.</li>
            </ul>
          </div>
        </div>

        {/* Right Side: Pratinjau Dokumen A4 (8 cols) */}
        <div className="lg:col-span-8 space-y-3">
          <div className="flex items-center justify-between text-xs text-gray-500 px-1">
            <div className="flex items-center gap-2">
              <Eye className="w-3.5 h-3.5 text-gray-400" />
              <span className="font-medium text-gray-700 dark:text-gray-300">
                Pratinjau Halaman A4 (Desain D: 85 × 54 mm, 2 × 4)
              </span>
              {isRendering && (
                <span className="text-[10px] text-green-600 animate-pulse flex items-center gap-1">
                  <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                  Memperbarui…
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setZoomLevel(prev => Math.max(50, prev - 25))}
                title="Perkecil"
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-gray-600 dark:text-gray-300"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="px-1.5 text-[11px] font-mono font-medium">
                {zoomLevel}%
              </span>
              <button
                type="button"
                onClick={() => setZoomLevel(prev => Math.min(175, prev + 25))}
                title="Perbesar"
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-gray-600 dark:text-gray-300"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel(100)}
                title="Reset Zoom"
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-gray-600 dark:text-gray-300"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Paper View Container */}
          <div className="bg-gray-100 dark:bg-gray-900/60 rounded-xl border border-gray-200 dark:border-gray-800 p-4 sm:p-6 flex justify-center overflow-auto max-h-[750px]">
            {renderError ? (
              <div className="flex flex-col items-center justify-center p-12 text-center text-red-500">
                <p className="text-sm font-semibold">{renderError}</p>
                <Button size="sm" onClick={generatePreview} className="mt-3">
                  Coba Lagi
                </Button>
              </div>
            ) : pdfUrl ? (
              <div
                style={{
                  width: `${(210 * 3.78 * zoomLevel) / 100}px`,
                  minHeight: `${(297 * 3.78 * zoomLevel) / 100}px`,
                  transition: 'width 0.2s ease',
                }}
                className="bg-white shadow-xl rounded-sm overflow-hidden border border-gray-300 dark:border-gray-700 relative"
              >
                {/* Visual margin ruler indicators on the top/left preview */}
                <div className="absolute top-0 left-0 w-full h-1 bg-green-500/30 pointer-events-none" />
                <iframe
                  src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                  title="Pratinjau Voucher PDF"
                  className="w-full h-full min-h-[720px] border-none"
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-16 text-gray-400">
                <RefreshCw className="w-6 h-6 animate-spin text-green-600 mb-2" />
                <p className="text-xs">Memuat pratinjau...</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Dialog: Mark as Printed */}
      <Dialog open={showMarkPrintedDialog} onOpenChange={setShowMarkPrintedDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader onClose={() => setShowMarkPrintedDialog(false)}>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              Tandai Batch Sudah Dicetak?
            </DialogTitle>
            <DialogDescription>
              Catatan status cetak membantu Anda membedakan batch voucher yang telah dicetak fisik ke kertas.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <label className="flex items-start gap-3 p-3 bg-green-50/60 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={isMarkChecked}
                onChange={e => setIsMarkChecked(e.target.checked)}
                className="mt-0.5 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <div className="text-xs">
                <span className="font-semibold text-gray-900 dark:text-gray-100 block">
                  Tandai batch ini sebagai "Sudah Dicetak"
                </span>
                <span className="text-gray-500 block mt-0.5">
                  Batch akan bertanda centang hijau pada tabel riwayat voucher.
                </span>
              </div>
            </label>
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMarkPrintedDialog(false)}>
              Batal
            </Button>
            <Button
              onClick={handleConfirmMarkPrinted}
              disabled={isMarking}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {isMarking ? 'Menyimpan…' : 'Simpan Status'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
