/**
 * Types untuk PDF generation
 */

export interface VoucherData {
  username: string;
  password: string;
  planLabel: string;
  price: number;
  duration: string; // "1 HARI", "3 JAM", dll
  validity: string; // "1 hari", "3 jam" untuk teks panjang
  speed: string; // "2 Mbps"
  loginUrl: string;
}

export interface PdfOptions {
  brandName: string;
  loginUrl: string;
  inkSaver: boolean;
  showCutLines: boolean;
  offsetX: number; // mm
  offsetY: number; // mm
}

export interface PdfSettings {
  brandName: string;
  loginUrl: string;
  marginY: number; // mm
  offsetX: number; // mm
  offsetY: number; // mm
}
