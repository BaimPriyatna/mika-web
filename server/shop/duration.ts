/**
 * Duplikat kecil dari src/core/utils/validation.ts (parseRouterDurationToMinutes). Server tidak mengimpor
 * langsung dari src/ karena aturan resolusi modul tsconfig.node berbeda. Kesamaan perilaku dijaga oleh
 * tes paritas (server/shop/__tests__/parity.test.ts).
 */
export function parseRouterDurationToMinutes(duration: string | undefined): number | null {
  if (!duration) return null;
  const text = duration.trim();
  if (!text || text === 'none' || text === '0s') return null;

  let seconds = 0;
  if (/^\d+(:\d+){2,3}$/.test(text)) {
    const parts = text.split(':').map(Number);
    if (parts.length === 3) {
      seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else {
      seconds = parts[0] * 86400 + parts[1] * 3600 + parts[2] * 60 + parts[3];
    }
  } else if (/^(\d+[wdhms])+$/.test(text)) {
    const unit: Record<string, number> = { w: 604800, d: 86400, h: 3600, m: 60, s: 1 };
    for (const m of text.matchAll(/(\d+)([wdhms])/g)) {
      seconds += Number(m[1]) * unit[m[2]];
    }
  } else {
    return null;
  }
  return seconds > 0 ? Math.ceil(seconds / 60) : null;
}

/** Label durasi untuk halaman pembelian: "45 menit", "1 jam", "1 jam 30 menit" */
export function formatDurationId(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} menit`;
  if (m === 0) return `${h} jam`;
  return `${h} jam ${m} menit`;
}

export function formatRupiah(amount: number): string {
  return 'Rp ' + Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
