/**
 * Voucher PDF renderer
 * Sesuai DESIGN.md §5 - Desain D "Harga Menonjol"
 */

import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';
import type { VoucherData, PdfOptions } from './types';
import {
  A4_WIDTH_MM,
  A4_HEIGHT_MM,
  VOUCHER_WIDTH_MM,
  VOUCHER_HEIGHT_MM,
  COLS,
  ROWS,
  MARGIN_X_MM,
  MARGIN_Y_MM,
  VOUCHER_LAYOUT,
  COLOR_MODE,
  mmToPt,
} from './constants';
import { generateQRCode, buildLoginUrl } from './qr-generator';

/**
 * Hitung gapY antara voucher
 */
function calculateGapY(marginY: number): number {
  const totalVoucherHeight = ROWS * VOUCHER_HEIGHT_MM;
  const totalMarginY = marginY * 2;
  const availableSpace = A4_HEIGHT_MM - totalVoucherHeight - totalMarginY;
  const gapY = availableSpace / (ROWS - 1);
  return gapY;
}

/**
 * Hitung gapX antara voucher
 */
function calculateGapX(): number {
  const totalVoucherWidth = COLS * VOUCHER_WIDTH_MM;
  const totalMarginX = MARGIN_X_MM * 2;
  const availableSpace = A4_WIDTH_MM - totalVoucherWidth - totalMarginX;
  const gapX = availableSpace / (COLS - 1);
  return gapX;
}

/**
 * Dapatkan posisi voucher di halaman
 */
function getVoucherPosition(
  index: number,
  marginY: number,
  offsetX: number,
  offsetY: number
): { x: number; y: number } {
  const row = Math.floor(index / COLS);
  const col = index % COLS;
  
  const gapX = calculateGapX();
  const gapY = calculateGapY(marginY);
  
  // Koordinat dari kiri-bawah (PDF coordinate system)
  const x = MARGIN_X_MM + col * (VOUCHER_WIDTH_MM + gapX) + offsetX;
  const y = A4_HEIGHT_MM - MARGIN_Y_MM - (row + 1) * VOUCHER_HEIGHT_MM - row * gapY + offsetY;
  
  return { x: mmToPt(x), y: mmToPt(y) };
}

/**
 * Parse hex color ke RGB
 */
function parseColor(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { r: 0, g: 0, b: 0 };
  
  return {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255,
  };
}

/**
 * Format harga
 */
function formatPrice(price: number): string {
  return `Rp ${price.toLocaleString('id-ID')}`;
}

/**
 * Render satu voucher
 */
async function renderVoucher(
  page: PDFPage,
  voucher: VoucherData,
  position: { x: number; y: number },
  options: PdfOptions,
  fonts: {
    regular: PDFFont;
    bold: PDFFont;
    mono: PDFFont;
  }
): Promise<void> {
  const { x, y } = position;
  const w = mmToPt(VOUCHER_WIDTH_MM);
  const h = mmToPt(VOUCHER_HEIGHT_MM);
  
  const layout = VOUCHER_LAYOUT;
  const colorMode = options.inkSaver ? COLOR_MODE.inkSaver : COLOR_MODE.full;
  
  // Border
  const borderColor = parseColor(layout.borderColor);
  page.drawRectangle({
    x,
    y,
    width: w,
    height: h,
    borderColor: rgb(borderColor.r, borderColor.g, borderColor.b),
    borderWidth: layout.borderWidth,
  });
  
  // Header background (jika bukan ink saver mode)
  if (!options.inkSaver && colorMode.headerBg) {
    const headerBg = parseColor(colorMode.headerBg);
    page.drawRectangle({
      x,
      y: y + h - mmToPt(layout.headerHeight),
      width: w,
      height: mmToPt(layout.headerHeight),
      color: rgb(headerBg.r, headerBg.g, headerBg.b),
    });
  } else {
    // Ink saver mode: garis bawah header
    const lineColor = parseColor('#000000');
    page.drawLine({
      start: { x, y: y + h - mmToPt(layout.headerHeight) },
      end: { x: x + w, y: y + h - mmToPt(layout.headerHeight) },
      thickness: 0.6,
      color: rgb(lineColor.r, lineColor.g, lineColor.b),
    });
  }
  
  // Brand name
  const brandColor = options.inkSaver ? parseColor('#000000') : parseColor(layout.brandColor);
  page.drawText(options.brandName, {
    x: x + mmToPt(layout.brandX),
    y: y + h - mmToPt(layout.brandY) - layout.brandSize,
    size: layout.brandSize,
    font: fonts.regular,
    color: rgb(brandColor.r, brandColor.g, brandColor.b),
  });
  
  // Plan label (kanan)
  const planLabelColor = options.inkSaver ? parseColor('#000000') : parseColor(layout.planLabelColor);
  const planLabelWidth = fonts.regular.widthOfTextAtSize(voucher.planLabel, layout.planLabelSize);
  page.drawText(voucher.planLabel, {
    x: x + w - mmToPt(layout.planLabelMarginRight) - planLabelWidth,
    y: y + h - mmToPt(layout.planLabelY) - layout.planLabelSize,
    size: layout.planLabelSize,
    font: fonts.regular,
    color: rgb(planLabelColor.r, planLabelColor.g, planLabelColor.b),
  });
  
  // Price
  const priceText = formatPrice(voucher.price);
  const priceSize = voucher.price >= 100000 ? layout.priceSizeLarge : layout.priceSize;
  const priceColor = options.inkSaver ? parseColor('#000000') : parseColor(layout.priceColor);
  page.drawText(priceText, {
    x: x + mmToPt(layout.priceX),
    y: y + h - mmToPt(layout.priceY) - priceSize,
    size: priceSize,
    font: fonts.bold,
    color: rgb(priceColor.r, priceColor.g, priceColor.b),
  });
  
  // Duration (kanan)
  const durationColor = options.inkSaver 
    ? parseColor('#000000')
    : parseColor(colorMode.durationColor!);
  const durationWidth = fonts.bold.widthOfTextAtSize(voucher.duration, layout.durationSize);
  page.drawText(voucher.duration, {
    x: x + w - mmToPt(layout.durationMarginRight) - durationWidth,
    y: y + h - mmToPt(layout.durationY) - layout.durationSize,
    size: layout.durationSize,
    font: fonts.bold,
    color: rgb(durationColor.r, durationColor.g, durationColor.b),
  });
  
  // USERNAME label
  const labelColor = parseColor(layout.labelColor);
  page.drawText('USERNAME', {
    x: x + mmToPt(layout.usernameX),
    y: y + h - mmToPt(layout.labelY) - layout.labelSize,
    size: layout.labelSize,
    font: fonts.regular,
    color: rgb(labelColor.r, labelColor.g, labelColor.b),
  });
  
  // PASSWORD label
  page.drawText('PASSWORD', {
    x: x + mmToPt(layout.passwordX),
    y: y + h - mmToPt(layout.labelY) - layout.labelSize,
    size: layout.labelSize,
    font: fonts.regular,
    color: rgb(labelColor.r, labelColor.g, labelColor.b),
  });
  
  // Username value
  page.drawText(voucher.username, {
    x: x + mmToPt(layout.usernameX),
    y: y + h - mmToPt(layout.valueY) - layout.valueSize,
    size: layout.valueSize,
    font: fonts.mono,
    color: rgb(0, 0, 0),
  });
  
  // Password value
  page.drawText(voucher.password, {
    x: x + mmToPt(layout.passwordX),
    y: y + h - mmToPt(layout.valueY) - layout.valueSize,
    size: layout.valueSize,
    font: fonts.mono,
    color: rgb(0, 0, 0),
  });
  
  // Separator line
  const separatorColor = parseColor(layout.separatorColor);
  page.drawLine({
    start: {
      x: x + mmToPt(layout.separatorStart),
      y: y + h - mmToPt(layout.separatorY),
    },
    end: {
      x: x + mmToPt(layout.separatorEnd),
      y: y + h - mmToPt(layout.separatorY),
    },
    thickness: layout.separatorWidth,
    color: rgb(separatorColor.r, separatorColor.g, separatorColor.b),
  });
  
  // Validity text
  const validityText = `Berlaku ${voucher.validity} sejak login pertama`;
  const detailColor = parseColor(layout.detailColor);
  page.drawText(validityText, {
    x: x + mmToPt(4),
    y: y + h - mmToPt(layout.validityY) - layout.detailSize,
    size: layout.detailSize,
    font: fonts.regular,
    color: rgb(detailColor.r, detailColor.g, detailColor.b),
  });
  
  // Speed text
  const speedText = `Kecepatan ${voucher.speed}`;
  page.drawText(speedText, {
    x: x + mmToPt(4),
    y: y + h - mmToPt(layout.speedY) - layout.detailSize,
    size: layout.detailSize,
    font: fonts.regular,
    color: rgb(detailColor.r, detailColor.g, detailColor.b),
  });
  
  // Note text
  const noteText = '1 akun untuk 1 perangkat';
  page.drawText(noteText, {
    x: x + mmToPt(4),
    y: y + h - mmToPt(layout.noteY) - layout.detailSize,
    size: layout.detailSize,
    font: fonts.regular,
    color: rgb(detailColor.r, detailColor.g, detailColor.b),
  });
  
  // QR Code
  try {
    const loginUrl = buildLoginUrl(options.loginUrl, voucher.username, voucher.password);
    const qrDataUrl = await generateQRCode(loginUrl, 200);
    const qrImageBytes = await fetch(qrDataUrl).then(res => res.arrayBuffer());
    const qrImage = await page.doc.embedPng(qrImageBytes);
    
    const qrSize = mmToPt(layout.qrSize);
    page.drawImage(qrImage, {
      x: x + mmToPt(layout.qrX),
      y: y + h - mmToPt(layout.qrY) - qrSize,
      width: qrSize,
      height: qrSize,
    });
  } catch (err) {
    console.error('Failed to embed QR code:', err);
  }
  
  // QR caption
  const qrCaption = 'Scan untuk login';
  const qrCaptionWidth = fonts.regular.widthOfTextAtSize(qrCaption, layout.qrCaptionSize);
  const qrCenterX = layout.qrX + layout.qrSize / 2;
  page.drawText(qrCaption, {
    x: x + mmToPt(qrCenterX) - qrCaptionWidth / 2,
    y: y + h - mmToPt(layout.qrCaptionY) - layout.qrCaptionSize,
    size: layout.qrCaptionSize,
    font: fonts.regular,
    color: rgb(detailColor.r, detailColor.g, detailColor.b),
  });
  
  // Cut lines (optional)
  if (options.showCutLines) {
    const cutColor = parseColor(layout.cutLineColor);
    const dashPattern = layout.cutLineDash;
    
    // Top
    page.drawLine({
      start: { x, y: y + h },
      end: { x: x + w, y: y + h },
      thickness: layout.cutLineWidth,
      color: rgb(cutColor.r, cutColor.g, cutColor.b),
      dashArray: dashPattern,
    });
    
    // Bottom
    page.drawLine({
      start: { x, y },
      end: { x: x + w, y },
      thickness: layout.cutLineWidth,
      color: rgb(cutColor.r, cutColor.g, cutColor.b),
      dashArray: dashPattern,
    });
    
    // Left
    page.drawLine({
      start: { x, y },
      end: { x, y: y + h },
      thickness: layout.cutLineWidth,
      color: rgb(cutColor.r, cutColor.g, cutColor.b),
      dashArray: dashPattern,
    });
    
    // Right
    page.drawLine({
      start: { x: x + w, y },
      end: { x: x + w, y: y + h },
      thickness: layout.cutLineWidth,
      color: rgb(cutColor.r, cutColor.g, cutColor.b),
      dashArray: dashPattern,
    });
  }
}

/**
 * Generate PDF untuk batch voucher
 * @param vouchers - Array voucher data (max 8)
 * @param options - PDF options
 * @returns PDF bytes
 */
export async function generateVoucherPDF(
  vouchers: VoucherData[],
  options: PdfOptions
): Promise<Uint8Array> {
  if (vouchers.length === 0) {
    throw new Error('Tidak ada voucher untuk dicetak');
  }
  
  if (vouchers.length > 8) {
    throw new Error('Maksimal 8 voucher per halaman');
  }
  
  // Create PDF document
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([mmToPt(A4_WIDTH_MM), mmToPt(A4_HEIGHT_MM)]);
  
  // Embed fonts
  const regularFont = await pdfDoc.embedFont('Helvetica');
  const boldFont = await pdfDoc.embedFont('Helvetica-Bold');
  const monoFont = await pdfDoc.embedFont('Courier-Bold');
  
  const fonts = {
    regular: regularFont,
    bold: boldFont,
    mono: monoFont,
  };
  
  // Render each voucher
  for (let i = 0; i < vouchers.length; i++) {
    const position = getVoucherPosition(
      i,
      MARGIN_Y_MM,
      options.offsetX,
      options.offsetY
    );
    
    await renderVoucher(page, vouchers[i], position, options, fonts);
  }
  
  // Serialize to bytes
  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}

/**
 * Download PDF
 */
export function downloadPDF(pdfBytes: Uint8Array, filename: string): void {
  const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  
  URL.revokeObjectURL(url);
}

/**
 * Generate data URL untuk preview
 */
export function pdfBytesToDataUrl(pdfBytes: Uint8Array): string {
  const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
  return URL.createObjectURL(blob);
}

/**
 * Generate PDF halaman kalibrasi printer
 * Sesuai Task 4.3.6 & DESIGN.md §4.6
 */
export async function generateCalibrationPDF(offset: { offsetX?: number; offsetY?: number } = {}): Promise<Uint8Array> {
  const offsetX = offset.offsetX || 0;
  const offsetY = offset.offsetY || 0;

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([mmToPt(A4_WIDTH_MM), mmToPt(A4_HEIGHT_MM)]);

  const regularFont = await pdfDoc.embedFont('Helvetica');
  const boldFont = await pdfDoc.embedFont('Helvetica-Bold');
  const monoFont = await pdfDoc.embedFont('Courier-Bold');

  const pageW = mmToPt(A4_WIDTH_MM);
  const pageH = mmToPt(A4_HEIGHT_MM);

  // Judul & Header
  page.drawText('HALAMAN KALIBRASI PRINTER (A4)', {
    x: mmToPt(20),
    y: pageH - mmToPt(25),
    size: 16,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1),
  });

  page.drawText('MikroTik Hotspot Voucher Manager · Cetak pada Skala 100% / Actual Size', {
    x: mmToPt(20),
    y: pageH - mmToPt(32),
    size: 9,
    font: regularFont,
    color: rgb(0.4, 0.4, 0.4),
  });

  // Garis batas Margin Kiri (10 mm tetap)
  const leftMarginX = mmToPt(MARGIN_X_MM + offsetX);
  page.drawLine({
    start: { x: leftMarginX, y: mmToPt(10) },
    end: { x: leftMarginX, y: pageH - mmToPt(10) },
    thickness: 1,
    color: rgb(0.1, 0.4, 0.8),
  });

  page.drawText('<-- 10 mm (Margin Kiri) -->', {
    x: leftMarginX + mmToPt(2),
    y: pageH - mmToPt(40),
    size: 8,
    font: boldFont,
    color: rgb(0.1, 0.4, 0.8),
  });

  // Garis batas Margin Kanan (10 mm tetap)
  const rightMarginX = mmToPt(A4_WIDTH_MM - MARGIN_X_MM + offsetX);
  page.drawLine({
    start: { x: rightMarginX, y: mmToPt(10) },
    end: { x: rightMarginX, y: pageH - mmToPt(10) },
    thickness: 1,
    color: rgb(0.1, 0.4, 0.8),
  });

  page.drawText('<-- 10 mm (Margin Kanan) -->', {
    x: rightMarginX - mmToPt(45),
    y: pageH - mmToPt(40),
    size: 8,
    font: boldFont,
    color: rgb(0.1, 0.4, 0.8),
  });

  // Posisi kotak kalibrasi (slot voucher 1: baris 0, kolom 0)
  const pos0 = getVoucherPosition(0, MARGIN_Y_MM, offsetX, offsetY);
  const boxW = mmToPt(VOUCHER_WIDTH_MM);
  const boxH = mmToPt(VOUCHER_HEIGHT_MM);

  // Gambar Kotak Uji Voucher (85 x 54 mm)
  page.drawRectangle({
    x: pos0.x,
    y: pos0.y,
    width: boxW,
    height: boxH,
    borderColor: rgb(0.15, 0.15, 0.15),
    borderWidth: 1.5,
    color: rgb(0.97, 0.98, 0.99),
  });

  // Crosshair tengah kotak
  page.drawLine({
    start: { x: pos0.x + boxW / 2 - mmToPt(5), y: pos0.y + boxH / 2 },
    end: { x: pos0.x + boxW / 2 + mmToPt(5), y: pos0.y + boxH / 2 },
    thickness: 0.5,
    color: rgb(0.5, 0.5, 0.5),
  });
  page.drawLine({
    start: { x: pos0.x + boxW / 2, y: pos0.y + boxH / 2 - mmToPt(5) },
    end: { x: pos0.x + boxW / 2, y: pos0.y + boxH / 2 + mmToPt(5) },
    thickness: 0.5,
    color: rgb(0.5, 0.5, 0.5),
  });

  page.drawText('KOTAK UJI UKURAN VOUCHER', {
    x: pos0.x + mmToPt(5),
    y: pos0.y + boxH - mmToPt(10),
    size: 11,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1),
  });

  page.drawText('Lebar harus tepat: 85,0 mm', {
    x: pos0.x + mmToPt(5),
    y: pos0.y + boxH - mmToPt(18),
    size: 9,
    font: monoFont,
    color: rgb(0.2, 0.5, 0.2),
  });

  page.drawText('Tinggi harus tepat: 54,0 mm', {
    x: pos0.x + mmToPt(5),
    y: pos0.y + boxH - mmToPt(25),
    size: 9,
    font: monoFont,
    color: rgb(0.2, 0.5, 0.2),
  });

  page.drawText(`Offset Aktif: X = ${offsetX.toFixed(1)} mm, Y = ${offsetY.toFixed(1)} mm`, {
    x: pos0.x + mmToPt(5),
    y: pos0.y + boxH - mmToPt(34),
    size: 8,
    font: regularFont,
    color: rgb(0.3, 0.3, 0.3),
  });

  // Kotak kedua di sebelah kanan (slot voucher 2: baris 0, kolom 1)
  const pos1 = getVoucherPosition(1, MARGIN_Y_MM, offsetX, offsetY);
  page.drawRectangle({
    x: pos1.x,
    y: pos1.y,
    width: boxW,
    height: boxH,
    borderColor: rgb(0.6, 0.6, 0.6),
    borderWidth: 1,
    borderDashArray: [4, 4],
  });

  page.drawText('Slot Voucher #2 (85 x 54 mm)', {
    x: pos1.x + mmToPt(8),
    y: pos1.y + boxH / 2,
    size: 10,
    font: boldFont,
    color: rgb(0.4, 0.4, 0.4),
  });

  // Kotak Petunjuk Kalibrasi di bagian bawah
  const guideY = mmToPt(75);
  page.drawRectangle({
    x: mmToPt(20),
    y: guideY,
    width: pageW - mmToPt(40),
    height: mmToPt(65),
    borderColor: rgb(0.8, 0.8, 0.8),
    borderWidth: 1,
    color: rgb(0.98, 0.98, 0.98),
  });

  page.drawText('PANDUAN KALIBRASI & PENGUKURAN:', {
    x: mmToPt(25),
    y: guideY + mmToPt(55),
    size: 10,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1),
  });

  const instructions = [
    '1. Pastikan mencetak dengan skala 100% ("Ukuran sebenarnya" / "Actual size"). Jangan pilih "Fit to page".',
    '2. Ukur kotak uji di atas dengan penggaris fisik presisi (milimeter). Panjang harus 85 mm, tinggi 54 mm.',
    '3. Ukur jarak dari tepi kiri kertas ke garis vertikal biru: harus tepat 10 mm.',
    '4. Jika posisi cetak bergeser pada printer Anda:',
    '   - Terlalu ke kanan: masukkan nilai minus pada Offset X (misal: -1.5 mm)',
    '   - Terlalu ke kiri: masukkan nilai plus pada Offset X (misal: +1.5 mm)',
    '   - Terlalu ke bawah: masukkan nilai plus pada Offset Y (misal: +2.0 mm)',
    '   - Terlalu ke atas: masukkan nilai minus pada Offset Y (misal: -2.0 mm)',
  ];

  instructions.forEach((line, idx) => {
    page.drawText(line, {
      x: mmToPt(25),
      y: guideY + mmToPt(45) - idx * mmToPt(5.5),
      size: 7.5,
      font: regularFont,
      color: rgb(0.2, 0.2, 0.2),
    });
  });

  // Footer
  page.drawText('MikroTik Hotspot Voucher Manager · Dicetak pada: ' + new Date().toLocaleDateString('id-ID'), {
    x: mmToPt(20),
    y: mmToPt(15),
    size: 7,
    font: regularFont,
    color: rgb(0.6, 0.6, 0.6),
  });

  return await pdfDoc.save();
}

