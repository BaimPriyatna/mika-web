/**
 * Konstanta layout dan dimensi voucher PDF
 * Sesuai DEV-SPEC.md §6.6 dan DESIGN.md §5 (Desain D "Harga Menonjol")
 */

export const MM_TO_PT = 72 / 25.4;

export function mmToPt(mm: number): number {
  return mm * MM_TO_PT;
}

export function ptToMm(pt: number): number {
  return pt / MM_TO_PT;
}

// Dimensi Halaman A4
export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;

// Dimensi Voucher
export const VOUCHER_WIDTH_MM = 85;
export const VOUCHER_HEIGHT_MM = 54;
export const VOUCHER_RADIUS_MM = 2.5;

// Grid 2x4
export const COLS = 2;
export const ROWS = 4;
export const MAX_VOUCHERS = 8;

// Margin
export const MARGIN_X_MM = 10; // Wajib tetap 10mm
export const MARGIN_Y_MM = 15; // Default 15mm

// Font minimum
export const MIN_FONT_PT = 6;

// Desain D "Harga Menonjol" layout properties
export const VOUCHER_LAYOUT = {
  // Border
  borderColor: '#E2E8F0',
  borderWidth: 0.6,
  radius: 2.5,

  // Header
  headerHeight: 17,

  // Brand
  brandX: 4,
  brandY: 5.5,
  brandSize: 6.5,
  brandColor: '#94A3B8',

  // Plan Label
  planLabelMarginRight: 4,
  planLabelY: 5.5,
  planLabelSize: 6.5,
  planLabelColor: '#94A3B8',

  // Price
  priceX: 4,
  priceY: 14,
  priceSize: 22,
  priceSizeLarge: 22,
  priceSmallSize: 18,
  priceColor: '#FFFFFF',

  // Duration
  durationMarginRight: 4,
  durationY: 14,
  durationSize: 14,
  durationColor: '#4ADE80',

  // Labels
  labelColor: '#64748B',
  labelY: 22,
  labelSize: 6,
  usernameX: 4,
  passwordX: 31,
  userLabelX: 4,
  userLabelY: 22,
  userLabelSize: 6,
  passLabelX: 31,
  passLabelY: 22,
  passLabelSize: 6,

  // Values (Username & Password)
  userNameX: 4,
  userNameY: 28,
  passWordX: 31,
  passWordY: 28,
  valueY: 28,
  valueSize: 14,
  codeSize: 14,
  codeColor: '#0F172A',

  // Separator / Divider
  separatorStart: 4,
  separatorEnd: 56,
  separatorY: 32,
  separatorWidth: 0.5,
  separatorColor: '#E2E8F0',
  dividerX1: 4,
  dividerX2: 56,
  dividerY: 32,
  dividerThickness: 0.5,
  dividerColor: '#E2E8F0',

  // Detail texts
  validityY: 37,
  speedY: 41.5,
  noteY: 50.5,
  detailSize: 6.5,
  detailColor: '#64748B',

  // QR
  qrX: 61,
  qrY: 22,
  qrSize: 20,
  qrQuietZone: 1.5,
  qrCaptionY: 45.5,
  qrCaptionSize: 6,
  qrCaptionColor: '#64748B',

  // Cut line
  cutLineColor: '#CBD5E1',
  cutLineDash: [2, 2] as number[],
  cutLineWidth: 0.3,
};

export const COLOR_MODE = {
  full: {
    headerBg: '#111827',
    headerText: '#FFFFFF',
    brandText: '#94A3B8',
    planText: '#94A3B8',
    durationText: '#4ADE80',
    durationColor: '#4ADE80',
    priceText: '#FFFFFF',
    labelText: '#64748B',
    valueText: '#0F172A',
    divider: '#E2E8F0',
    border: '#E2E8F0',
    qrCaption: '#64748B',
  },
  inkSaver: {
    headerBg: '#FFFFFF',
    headerText: '#000000',
    brandText: '#64748B',
    planText: '#64748B',
    durationText: '#000000',
    durationColor: '#000000',
    priceText: '#000000',
    labelText: '#64748B',
    valueText: '#000000',
    divider: '#E2E8F0',
    border: '#CBD5E1',
    qrCaption: '#64748B',
  },
};
