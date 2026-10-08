/**
 * Generator dan sanitizer script RouterOS
 * Sesuai KEPUTUSAN TERBARU §4, §5, §6
 * Kompatibel dengan RouterOS v6 dan v7
 * Semua objek berawalan "vm-"
 */

import { sanitizeForRouterOS } from '../../core/utils/validation';

export interface OperationalHours {
  openTime: string;  // Format "HH:MM", default "07:30"
  closeTime: string; // Format "HH:MM", default "14:30"
}

export const DEFAULT_OPERATIONAL_HOURS: OperationalHours = {
  openTime: '07:30',
  closeTime: '14:30',
};

/**
 * Script on-login di profil hotspot
 * Hanya menandai login pertama di comment user (|u=0)
 * TANPA membuat scheduler per user.
 * Login berikutnya tidak akan mereset waktu karena |u= sudah ada.
 */
export function buildOnLoginScript(): string {
  return `:local u $user;
:local c [/ip hotspot user get [find name=$u] comment];
:if ([:typeof [:find $c "vm|"]] != "nil" && [:typeof [:find $c "|u="]] = "nil") do={
  /ip hotspot user set [find name=$u] comment=($c . "|u=0");
}`.trim();
}

/**
 * Parse jam & menit dari string "HH:MM"
 */
function parseTimeMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Script vm-cleaner (berjalan tiap 5 menit):
 * 1. Guard NTP: jam harus valid (tahun >= 2024). Jika jam belum sinkron, TIDAK menghapus apa pun.
 * 2. Cek jam operasional (buka .. tutup): di luar jam operasional, timer berhenti.
 * 3. Tambah menit terpakai (+5) di comment user yang sudah login (|u=).
 * 4. Jika waktu terpakai >= masa berlaku (|v=): kick sesi aktif dan hapus user.
 * 5. Voucher yang belum pernah login (tanpa |u=) TIDAK disentuh.
 */
export function buildVmCleanerScript(hours: OperationalHours = DEFAULT_OPERATIONAL_HOURS): string {
  const openM = parseTimeMinutes(hours.openTime);
  const closeM = parseTimeMinutes(hours.closeTime);

  return `# vm-cleaner: Pembersih voucher otomatis tiap 5 menit
# Cek 1: Guard NTP / Validitas Jam Router
:local d [/system clock get date];
:local yr 0;
:if ([:typeof [:find $d "-"]] != "nil") do={
  :set yr [:tonum [:pick $d 0 4]];
} else={
  :set yr [:tonum [:pick $d ([:len $d] - 4) [:len $d]]];
}
:if ($yr < 2024) do={
  # Jam belum sinkron dengan NTP, jangan hapus apa pun
  :error "NTP belum sinkron";
}

# Cek 2: Jendela Jam Operasional
:local t [/system clock get time];
:local curH [:tonum [:pick $t 0 2]];
:local curM [:tonum [:pick $t 3 5]];
:local curTot ($curH * 60 + $curM);

:if ($curTot >= ${openM} && $curTot < ${closeM}) do={
  # Loop user hotspot yang memiliki comment vm| dan |u=
  :foreach u in=[/ip hotspot user find] do={
    :local c [/ip hotspot user get $u comment];
    :local posU [:find $c "|u="];
    :local posV [:find $c "|v="];
    :if ([:typeof $posU] != "nil" && [:typeof $posV] != "nil") do={
      :local endV [:find $c "|" ($posV + 3)];
      :if ([:typeof $endV] = "nil") do={ :set endV [:len $c]; }
      :local valM [:tonum [:pick $c ($posV + 3) $endV]];

      :local endU [:find $c "|" ($posU + 3)];
      :if ([:typeof $endU] = "nil") do={ :set endU [:len $c]; }
      :local usedM [:tonum [:pick $c ($posU + 3) $endU]];
      :local newUsed ($usedM + 5);

      :if ($newUsed >= $valM) do={
        :local uname [/ip hotspot user get $u name];
        :do { /ip hotspot active remove [find user=$uname]; } on-error={};
        /ip hotspot user remove $u;
      } else={
        :local pfx [:pick $c 0 ($posU + 3)];
        :local sfx [:pick $c $endU [:len $c]];
        /ip hotspot user set $u comment=($pfx . $newUsed . $sfx);
      }
    }
  }
}`.trim();
}

/**
 * Script vm-open (jam 07:30):
 * Hapus voucher yang sudah pernah login dari hari sebelumnya,
 * lalu aktifkan hotspot server.
 */
export function buildVmOpenScript(): string {
  return `# vm-open: Buka hotspot dan bersihkan sisa voucher kemarin
:foreach u in=[/ip hotspot user find] do={
  :local c [/ip hotspot user get $u comment];
  :if ([:typeof [:find $c "vm|"]] != "nil" && [:typeof [:find $c "|u="]] != "nil") do={
    /ip hotspot user remove $u;
  }
}
:do {
  /ip hotspot set [find disabled=yes] disabled=no;
} on-error={};`.trim();
}

/**
 * Script vm-close (jam 14:30):
 * Kick semua sesi aktif, hapus voucher yang sudah pernah login hari ini,
 * lalu nonaktifkan hotspot server.
 */
export function buildVmCloseScript(): string {
  return `# vm-close: Tutup hotspot dan kick semua sesi aktif
:do {
  /ip hotspot active remove [/ip hotspot active find];
} on-error={};
:foreach u in=[/ip hotspot user find] do={
  :local c [/ip hotspot user get $u comment];
  :if ([:typeof [:find $c "vm|"]] != "nil" && [:typeof [:find $c "|u="]] != "nil") do={
    /ip hotspot user remove $u;
  }
}
:do {
  /ip hotspot set [find disabled=no] disabled=yes;
} on-error={};`.trim();
}

/**
 * Sanitasi string sebelum dimasukkan ke perintah script RouterOS
 */
export function escapeRouterOsScript(script: string): string {
  return sanitizeForRouterOS(script);
}

/**
 * Normalisasi comment user voucher
 * Format standar: vm|b=<batchId>|p=<price>[|v=<validityMinutes>]
 */
export function buildVoucherComment(
  batchId: string,
  price: number,
  validityMinutes: number | null
): string {
  // Tanpa |v= (profil tanpa masa berlaku) voucher tidak dihitung vm-cleaner dan
  // hanya dibersihkan oleh vm-open / vm-close.
  const base = `vm|b=${batchId}|p=${price}`;
  return validityMinutes && validityMinutes > 0 ? `${base}|v=${validityMinutes}` : base;
}

/**
 * Parse metadata dari comment user voucher
 */
export function parseVoucherComment(comment: string | undefined): {
  isVoucher: boolean;
  batchId?: string;
  price?: number;
  validityMinutes?: number;
  usedMinutes?: number;
  hasStarted: boolean;
} {
  if (!comment || !comment.startsWith('vm|')) {
    return { isVoucher: false, hasStarted: false };
  }

  const parts = comment.split('|').slice(1);
  let batchId: string | undefined;
  let price: number | undefined;
  let validityMinutes: number | undefined;
  let usedMinutes: number | undefined;

  for (const part of parts) {
    if (part.startsWith('b=')) batchId = part.substring(2);
    else if (part.startsWith('p=')) price = Number(part.substring(2)) || 0;
    else if (part.startsWith('v=')) validityMinutes = Number(part.substring(2)) || 0;
    else if (part.startsWith('u=')) usedMinutes = Number(part.substring(2)) || 0;
  }

  return {
    isVoucher: true,
    batchId,
    price,
    validityMinutes,
    usedMinutes,
    hasStarted: usedMinutes !== undefined,
  };
}
