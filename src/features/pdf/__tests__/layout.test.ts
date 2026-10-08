import { describe, it, expect } from 'vitest';
import {
  mmToPt,
  ptToMm,
  A4_WIDTH_MM,
  A4_HEIGHT_MM,
  VOUCHER_WIDTH_MM,
  VOUCHER_HEIGHT_MM,
  COLS,
  ROWS,
  MAX_VOUCHERS,
  MARGIN_X_MM,
  MARGIN_Y_MM,
} from '../constants';
import { generateCalibrationPDF } from '../voucher-renderer';

describe('PDF Layout Engine (DESIGN.md §5 & DEV-SPEC.md §6.6)', () => {
  it('converts mm to pt correctly (72 / 25.4)', () => {
    expect(mmToPt(25.4)).toBeCloseTo(72, 4);
    expect(ptToMm(72)).toBeCloseTo(25.4, 4);
  });

  it('verifies standard dimensions according to Design D specification', () => {
    // A4 dimensions
    expect(A4_WIDTH_MM).toBe(210);
    expect(A4_HEIGHT_MM).toBe(297);

    // Voucher dimensions: 85 x 54 mm
    expect(VOUCHER_WIDTH_MM).toBe(85);
    expect(VOUCHER_HEIGHT_MM).toBe(54);

    // 2 columns x 4 rows = 8 vouchers per page
    expect(COLS).toBe(2);
    expect(ROWS).toBe(4);
    expect(MAX_VOUCHERS).toBe(8);

    // Margin X locked at 10mm
    expect(MARGIN_X_MM).toBe(10);
  });

  it('calculates gapX and gapY within positive bounds on A4', () => {
    // 2 columns: width 85mm each = 170mm.
    // Margin X: 10mm each side = 20mm.
    // Gap X = 210 - 170 - 20 = 20mm.
    const totalVoucherW = COLS * VOUCHER_WIDTH_MM;
    const gapX = A4_WIDTH_MM - totalVoucherW - (MARGIN_X_MM * 2);
    expect(gapX).toBe(20);
    expect(gapX).toBeGreaterThanOrEqual(0);

    // 4 rows: height 54mm each = 216mm.
    // Margin Y default: 15mm each side = 30mm.
    // Available gap space = 297 - 216 - 30 = 51mm.
    // Gap Y across 3 gaps = 51 / 3 = 17mm.
    const totalVoucherH = ROWS * VOUCHER_HEIGHT_MM;
    const availableY = A4_HEIGHT_MM - totalVoucherH - (MARGIN_Y_MM * 2);
    const gapY = availableY / (ROWS - 1);
    expect(gapY).toBe(17);
    expect(gapY).toBeGreaterThanOrEqual(0);
  });

  it('generates calibration PDF with valid byte signature', async () => {
    const pdfBytes = await generateCalibrationPDF({ offsetX: 0, offsetY: 0 });
    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(1000);

    // PDF magic number header check: %PDF-
    const header = String.fromCharCode(...pdfBytes.slice(0, 5));
    expect(header).toBe('%PDF-');
  });
});
