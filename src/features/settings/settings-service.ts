/**
 * Settings Service
 * Mengelola konfigurasi lokal aplikasi melalui Dexie (db.settings)
 * Sesuai DESIGN.md §4.6, §4.9 & KEPUTUSAN TERBARU §5
 */

import { db } from '../../core/db/schema';

export interface MikaAppSettings {
  brandName: string;
  loginUrl: string;
  footnote: string;
  marginY: number;
  offsetX: number;
  offsetY: number;
  inkSaver: boolean;
  showCutLines: boolean;
  openTime: string; // '07:30'
  closeTime: string; // '14:30'
}

export const DEFAULT_APP_SETTINGS: MikaAppSettings = {
  brandName: 'WIFI TKJ',
  loginUrl: 'http://hotspot.local/login',
  footnote: '1 akun untuk 1 perangkat',
  marginY: 15,
  offsetX: 0.0,
  offsetY: 0.0,
  inkSaver: false,
  showCutLines: true,
  openTime: '07:30',
  closeTime: '14:30',
};

/**
 * Ambil semua pengaturan aplikasi dari Dexie
 */
export async function getAppSettings(): Promise<MikaAppSettings> {
  const records = await db.settings.toArray();
  const map = new Map<string, string>();
  for (const r of records) {
    map.set(r.key, r.value);
  }

  return {
    brandName: map.get('brandName') || DEFAULT_APP_SETTINGS.brandName,
    loginUrl: map.get('loginUrl') || DEFAULT_APP_SETTINGS.loginUrl,
    footnote: map.get('footnote') || DEFAULT_APP_SETTINGS.footnote,
    marginY: map.has('marginY') ? parseFloat(map.get('marginY')!) : DEFAULT_APP_SETTINGS.marginY,
    offsetX: map.has('offsetX') ? parseFloat(map.get('offsetX')!) : DEFAULT_APP_SETTINGS.offsetX,
    offsetY: map.has('offsetY') ? parseFloat(map.get('offsetY')!) : DEFAULT_APP_SETTINGS.offsetY,
    inkSaver: map.get('inkSaver') === 'true',
    showCutLines: map.has('showCutLines') ? map.get('showCutLines') === 'true' : DEFAULT_APP_SETTINGS.showCutLines,
    openTime: map.get('openTime') || DEFAULT_APP_SETTINGS.openTime,
    closeTime: map.get('closeTime') || DEFAULT_APP_SETTINGS.closeTime,
  };
}

/**
 * Simpan sebagian atau semua pengaturan aplikasi
 */
export async function saveAppSettings(settings: Partial<MikaAppSettings>): Promise<void> {
  const entries = Object.entries(settings);
  for (const [key, val] of entries) {
    if (val !== undefined) {
      await db.settings.put({
        key,
        value: String(val),
      });
    }
  }
}
