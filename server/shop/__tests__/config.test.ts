// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { describeConfig, loadShopConfig, parseOrigins } from '../config.ts';

describe('parseOrigins', () => {
  it('menerima origin persis skema://host[:port]; membersihkan spasi, duplikat, dan garis miring akhir', () => {
    expect(parseOrigins(' http://hotspot.tkj , http://192.168.20.129 ,http://hotspot.tkj, http://wifi.net:8080/ ')).toEqual([
      'http://hotspot.tkj',
      'http://192.168.20.129',
      'http://wifi.net:8080',
    ]);
  });

  it('menolak yang bukan origin: ada path, skema aneh, wildcard, kosong, port bawaan', () => {
    expect(parseOrigins('*')).toEqual([]);
    expect(parseOrigins('hotspot.tkj')).toEqual([]);
    expect(parseOrigins('http://hotspot.tkj/beli')).toEqual([]);
    expect(parseOrigins('javascript:alert(1)')).toEqual([]);
    expect(parseOrigins('ftp://x')).toEqual([]);
    expect(parseOrigins('http://hotspot.tkj:80')).toEqual([]); // origin baku tanpa :80, jadi tidak akan pernah cocok
    expect(parseOrigins('')).toEqual([]);
    expect(parseOrigins(undefined)).toEqual([]);
  });
});

describe('loadShopConfig', () => {
  it('nilai bawaan aman: penjualan tidak terkonfigurasi, tanpa CORS, tanpa kredensial router', () => {
    const c = loadShopConfig({});
    expect(c.midtransServerKey).toBe('');
    expect(c.midtransIsProduction).toBe(false);
    expect(c.router).toBeNull();
    expect(c.shopAllowedOrigins).toEqual([]);
    expect(c.adminAllowedIps).toEqual([]);
    expect(c.retry.maxAttempts).toBe(30);
    expect(c.retentionDays).toBe(90);
  });

  it('membaca environment, termasuk kredensial router dan batas retry yang divalidasi', () => {
    const c = loadShopConfig({
      MIDTRANS_SERVER_KEY: ' SB-Mid-server-X ',
      MIDTRANS_IS_PRODUCTION: 'true',
      ROUTER_HOST: '192.168.88.1',
      ROUTER_USER: 'wifitkj-server',
      ROUTER_PASSWORD: 'rahasia',
      ROUTER_PORT: '8728',
      ROUTER_PROTOCOL: 'binary',
      ADMIN_ALLOWED_IPS: '10.0.0.2, 10.0.0.3',
      SHOP_ALLOWED_ORIGINS: 'http://hotspot.tkj',
      SHOP_RETRY_MAX_ATTEMPTS: '5',
      SHOP_RETRY_INTERVAL_MS: 'bukan-angka',
      SHOP_RETENTION_DAYS: '99999',
    });
    expect(c.midtransServerKey).toBe('SB-Mid-server-X');
    expect(c.midtransIsProduction).toBe(true);
    expect(c.router).toMatchObject({ host: '192.168.88.1', username: 'wifitkj-server', port: 8728, protocol: 'binary' });
    expect(c.adminAllowedIps).toEqual(['10.0.0.2', '10.0.0.3']);
    expect(c.shopAllowedOrigins).toEqual(['http://hotspot.tkj']);
    expect(c.retry.maxAttempts).toBe(5);
    expect(c.retry.intervalMs).toBe(30_000); // nilai tidak valid -> bawaan
    expect(c.retentionDays).toBe(90); // di luar batas -> bawaan
  });

  it('describeConfig tidak pernah memuat secret', () => {
    const c = loadShopConfig({ MIDTRANS_SERVER_KEY: 'SB-Mid-server-RAHASIA', ROUTER_HOST: 'r', ROUTER_USER: 'u', ROUTER_PASSWORD: 'pw-rahasia' });
    const text = JSON.stringify(describeConfig(c));
    expect(text).not.toContain('SB-Mid-server-RAHASIA');
    expect(text).not.toContain('pw-rahasia');
    expect(describeConfig(c)).toMatchObject({ providerConfigured: true, routerConfigured: true, routerHost: 'r' });
  });
});
