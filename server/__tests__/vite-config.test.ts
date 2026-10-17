// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ConfigEnv, UserConfig } from 'vite';
import config, { parseAllowedHosts } from '../../vite.config.ts';

async function resolveConfig(): Promise<UserConfig> {
  const fn = config as unknown as (env: ConfigEnv) => UserConfig | Promise<UserConfig>;
  return fn({ command: 'serve', mode: 'test', isSsrBuild: false, isPreview: false });
}

describe('vite.config', () => {
  it('middleware CORS bawaan Vite dimatikan (dev dan preview): CORS diatur backend hanya untuk /api/shop/*', async () => {
    const c = await resolveConfig();
    expect(c.server?.cors).toBe(false);
    expect(c.preview?.cors).toBe(false);
  });

  it('SHOP_ALLOWED_HOSTS dibaca sebagai daftar host', () => {
    expect(parseAllowedHosts('wifi.tkj, beli.contoh.com,,')).toEqual(['wifi.tkj', 'beli.contoh.com']);
    expect(parseAllowedHosts('')).toBeUndefined();
    expect(parseAllowedHosts(undefined)).toBeUndefined();
  });
});
