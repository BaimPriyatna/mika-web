// Berkas ini mengimpor kode dari src/ (aturan modul bundler), jadi dikecualikan dari tsconfig.node.json
// dan hanya dijalankan oleh Vitest.
import { describe, it, expect } from 'vitest';
import { CHARSET, CODE_LENGTH, DIGITS, LETTERS } from '../../../src/core/constants';
import { isValidVoucherCode, parseRouterDurationToMinutes as srcParse } from '../../../src/core/utils/validation';
import { buildVoucherComment, parseVoucherComment } from '../../../src/features/setup/router-scripts';
import { parseRouterDurationToMinutes as serverParse } from '../duration.ts';
import * as serverCode from '../voucher-code.ts';

/**
 * Server menyalin beberapa aturan kecil dari src/ (karena aturan modul tsconfig.node berbeda).
 * Tes ini memastikan salinan tidak menyimpang dari aplikasi admin.
 */
describe('paritas server dengan aplikasi admin', () => {
  it('aturan kode: panjang dan charset sama persis', () => {
    expect(serverCode.CODE_LENGTH).toBe(CODE_LENGTH);
    expect(serverCode.CHARSET).toBe(CHARSET);
    expect(serverCode.LETTERS).toBe(LETTERS);
    expect(serverCode.DIGITS).toBe(DIGITS);
  });

  it('semua kode hasil generate server valid menurut validator aplikasi admin', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 3000; i++) {
      const code = serverCode.generateCode();
      expect(isValidVoucherCode(code)).toBe(true);
      seen.add(code);
    }
    expect(seen.size).toBeGreaterThan(2990); // praktis tidak ada kembar
  });

  it('comment penjualan online = comment aplikasi + penanda, dan tetap bisa dibaca parseVoucherComment', () => {
    const online = serverCode.buildOnlineVoucherComment('WT-abc', 5000, 60, 'plan-1h');
    expect(online).toBe(buildVoucherComment('WT-abc', 5000, 60) + '|plan=plan-1h|sale=online');

    const meta = parseVoucherComment(online);
    expect(meta.validityMinutes).toBe(60);
    expect(meta.hasStarted).toBe(false);
    // setelah login pertama on-login menambah |u=0 di akhir; tetap terbaca
    expect(parseVoucherComment(online + '|u=15')).toMatchObject({ hasStarted: true, usedMinutes: 15, validityMinutes: 60 });

    expect(serverCode.buildOnlineVoucherComment('WT-abc', 5000, null, 'p')).toBe('vm|b=WT-abc|p=5000|plan=p|sale=online');
  });

  it.each(['1h', '45m', '1h30m', '7h', '1d', '01:00:00', '00:30:00', '1:02:00:00', '0s', 'none', '', 'abc', '12:30', undefined])(
    'parser durasi sama untuk %s',
    input => {
      expect(serverParse(input as string | undefined)).toBe(srcParse(input as string | undefined));
    }
  );
});
