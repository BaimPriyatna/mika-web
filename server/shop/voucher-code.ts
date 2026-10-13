import { randomInt } from 'node:crypto';

/**
 * Aturan kode akun: 6 karakter, huruf besar tanpa I/L/O + angka 2-9 (tanpa 0/1), wajib ada huruf dan angka.
 * Username = password. Duplikat dari src/core/constants.ts + src/core/utils/random-code.ts; kesamaan aturan
 * dijaga oleh server/shop/__tests__/parity.test.ts.
 */
export const CODE_LENGTH = 6;
export const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
export const DIGITS = '23456789';
export const CHARSET = LETTERS + DIGITS;

export function generateCode(): string {
  for (;;) {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CHARSET[randomInt(CHARSET.length)]; // crypto.randomInt: tanpa modulo bias
    }
    if (/[A-Z]/.test(code) && /[2-9]/.test(code)) return code;
  }
}

/** Sama dengan buildVoucherComment di src/features/setup/router-scripts.ts, ditambah penanda penjualan online */
export function buildOnlineVoucherComment(
  orderId: string,
  price: number,
  validityMinutes: number | null,
  packageId: string
): string {
  const base = `vm|b=${orderId}|p=${price}`;
  const withValidity = validityMinutes && validityMinutes > 0 ? `${base}|v=${validityMinutes}` : base;
  return `${withValidity}|plan=${packageId}|sale=online`;
}
