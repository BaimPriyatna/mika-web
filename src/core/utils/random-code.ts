/**
 * Voucher code generator dengan rejection sampling
 * Sesuai DEV-SPEC.md §6.5
 * Menghasilkan kode dengan huruf BESAR (A-Z tanpa I,L,O) dan angka (2-9)
 */

import { CODE_LENGTH, CHARSET, LETTERS, DIGITS } from '../constants';

/**
 * Generate random index tanpa modulo bias menggunakan rejection sampling
 */
function randomIndex(max: number): number {
  const limit = 256 - (256 % max);
  const buf = new Uint8Array(1);
  
  while (true) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) {
      return buf[0] % max;
    }
  }
}

/**
 * Generate kode voucher 6 karakter
 * - Charset: A-Z (tanpa I,L,O) + 2-9 (tanpa 0,1)
 * - Wajib minimal 1 huruf DAN 1 angka
 * - Menggunakan rejection sampling untuk distribusi uniform
 */
export function generateCode(): string {
  while (true) {
    let code = '';
    
    // Generate 6 karakter random
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CHARSET[randomIndex(CHARSET.length)];
    }
    
    // Validasi: harus ada minimal 1 huruf DAN 1 angka
    const hasLetter = LETTERS.split('').some(letter => code.includes(letter));
    const hasDigit = DIGITS.split('').some(digit => code.includes(digit));
    
    if (hasLetter && hasDigit) {
      return code;
    }
  }
}

/**
 * Generate pair username dan password
 * @param samePassword - Jika true, username = password
 */
export function generateCodePair(samePassword: boolean): { user: string; pass: string } {
  const user = generateCode();
  const pass = samePassword ? user : generateCode();
  return { user, pass };
}

/**
 * Cek apakah kode valid sesuai aturan
 */
export function isValidCode(code: string): boolean {
  // Panjang harus tepat 6
  if (code.length !== CODE_LENGTH) return false;
  
  // Semua karakter harus dari charset
  const allValid = code.split('').every(char => CHARSET.includes(char));
  if (!allValid) return false;
  
  // Harus ada minimal 1 huruf dan 1 angka
  const hasLetter = LETTERS.split('').some(letter => code.includes(letter));
  const hasDigit = DIGITS.split('').some(digit => code.includes(digit));
  
  return hasLetter && hasDigit;
}
