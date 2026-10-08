/**
 * RouterOS data mappers
 * Mengonversi string RouterOS ke tipe TypeScript
 * Sesuai DEV-SPEC.md §7
 */

import type { SystemResource } from './types';

/**
 * Konversi string "yes"/"no"/"true"/"false" ke boolean
 */
export function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  const lower = value.toLowerCase();
  return lower === 'yes' || lower === 'true';
}

/**
 * Konversi string angka ke number
 */
export function parseNumber(value: string | undefined): number {
  if (!value) return 0;
  const num = parseFloat(value);
  return isNaN(num) ? 0 : num;
}

/**
 * Konversi string bytes ke number (misal "1234567")
 */
export function parseBytes(value: string | undefined): number {
  return parseNumber(value);
}

/**
 * Konversi string persentase ke number (misal "45%")
 */
export function parsePercentage(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = value.replace('%', '');
  return parseNumber(cleaned);
}

/**
 * Map raw system resource dari RouterOS ke SystemResource
 */
export function mapSystemResource(raw: Record<string, string>): SystemResource {
  return {
    version: raw.version || '',
    boardName: raw['board-name'] || '',
    platform: raw.platform || raw['architecture-name'] || '',
    cpuLoad: parsePercentage(raw['cpu-load']),
    freeMemory: parseBytes(raw['free-memory']),
    totalMemory: parseBytes(raw['total-memory']),
    uptime: raw.uptime || '',
    architecture: raw['architecture-name'] || raw.platform || '',
  };
}

/**
 * Konversi kebab-case ke camelCase
 * Contoh: "mac-address" → "macAddress"
 */
export function kebabToCamel(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Konversi camelCase ke kebab-case
 * Contoh: "macAddress" → "mac-address"
 */
export function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * Konversi object dengan key camelCase ke kebab-case
 * Untuk payload ke RouterOS API
 */
export function toKebabCase(obj: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const kebabKey = camelToKebab(key);
    result[kebabKey] = String(value);
  }
  return result;
}

/**
 * Konversi object dengan key kebab-case ke camelCase
 * Untuk response dari RouterOS API
 */
export function toCamelCase(obj: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = kebabToCamel(key);
    result[camelKey] = value;
  }
  return result;
}

/**
 * Parse rate limit string dari RouterOS
 * Contoh: "2M/5M" → { rx: "2M", tx: "5M" }
 */
export function parseRateLimit(rateLimit: string | undefined): { rx: string; tx: string } | null {
  if (!rateLimit) return null;
  const parts = rateLimit.split('/');
  if (parts.length !== 2) return null;
  return { rx: parts[0], tx: parts[1] };
}

/**
 * Build rate limit string untuk RouterOS
 * Dari sudut pandang router: rx = upload user, tx = download user
 */
export function buildRateLimit(upload: string, download: string): string {
  return `${upload}/${download}`;
}

/**
 * Konversi duration string RouterOS ke detik
 * Contoh: "1h30m" → 5400
 */
export function parseDuration(duration: string | undefined): number | null {
  if (!duration) return null;
  
  const regex = /(\d+)([smhdw])/g;
  let totalSeconds = 0;
  let match;
  
  while ((match = regex.exec(duration)) !== null) {
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
      case 's': totalSeconds += value; break;
      case 'm': totalSeconds += value * 60; break;
      case 'h': totalSeconds += value * 3600; break;
      case 'd': totalSeconds += value * 86400; break;
      case 'w': totalSeconds += value * 604800; break;
    }
  }
  
  return totalSeconds > 0 ? totalSeconds : null;
}

/**
 * Format detik ke duration string RouterOS
 * Contoh: 5400 → "1h30m"
 */
export function formatDuration(seconds: number): string {
  if (seconds === 0) return '0s';
  
  const units = [
    { name: 'w', value: 604800 },
    { name: 'd', value: 86400 },
    { name: 'h', value: 3600 },
    { name: 'm', value: 60 },
    { name: 's', value: 1 },
  ];
  
  let remaining = seconds;
  const parts: string[] = [];
  
  for (const unit of units) {
    if (remaining >= unit.value) {
      const count = Math.floor(remaining / unit.value);
      parts.push(`${count}${unit.name}`);
      remaining -= count * unit.value;
    }
  }
  
  return parts.join('');
}
