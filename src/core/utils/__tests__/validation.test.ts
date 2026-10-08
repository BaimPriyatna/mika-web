import { describe, it, expect } from 'vitest';
import {
  parseDurationToMinutes,
  isValidProfileDuration,
  isValidRateLimit,
  isValidProfileName,
  sanitizeForRouterOS,
} from '../validation';

describe('Validation Helpers & Duration Constraints (KEPUTUSAN TERBARU §4)', () => {
  it('parseDurationToMinutes parses minutes and hours accurately', () => {
    expect(parseDurationToMinutes('30m')).toBe(30);
    expect(parseDurationToMinutes('1h')).toBe(60);
    expect(parseDurationToMinutes('3h')).toBe(180);
    expect(parseDurationToMinutes('5h')).toBe(300);
    expect(parseDurationToMinutes('7h')).toBe(420);
    expect(parseDurationToMinutes('1h30m')).toBe(90);
    expect(parseDurationToMinutes('1d')).toBeNull(); // Days not supported in profile duration
    expect(parseDurationToMinutes('invalid')).toBeNull();
  });

  it('isValidProfileDuration enforces max 7 hours and minutes/hours only', () => {
    expect(isValidProfileDuration('30m')).toBe(true);
    expect(isValidProfileDuration('1h')).toBe(true);
    expect(isValidProfileDuration('3h')).toBe(true);
    expect(isValidProfileDuration('5h')).toBe(true);
    expect(isValidProfileDuration('7h')).toBe(true);

    // Exceeds 7 hours
    expect(isValidProfileDuration('8h')).toBe(false);
    expect(isValidProfileDuration('450m')).toBe(false);

    // Days or weeks are disallowed for profile validity
    expect(isValidProfileDuration('1d')).toBe(false);
    expect(isValidProfileDuration('1w')).toBe(false);

    // Empty/undefined is allowed (validity optional)
    expect(isValidProfileDuration('')).toBe(true);
  });

  it('isValidRateLimit validates rx/tx speeds with k and M units', () => {
    expect(isValidRateLimit('1M/2M')).toBe(true);
    expect(isValidRateLimit('512k/1M')).toBe(true);
    expect(isValidRateLimit('10M/10M')).toBe(true);
    expect(isValidRateLimit('2M')).toBe(false);
    expect(isValidRateLimit('invalid/2M')).toBe(false);
  });

  it('isValidProfileName validates alphanumeric and safe characters', () => {
    expect(isValidProfileName('1jam-2mbps')).toBe(true);
    expect(isValidProfileName('Paket Utama_01')).toBe(true);
    expect(isValidProfileName('')).toBe(false);
    expect(isValidProfileName('   ')).toBe(false);
  });

  it('sanitizeForRouterOS escapes dangerous characters to prevent injection', () => {
    const dangerous = 'test"with$var\nnewline\\slash';
    const sanitized = sanitizeForRouterOS(dangerous);
    expect(sanitized).toBe('test\\"with\\$var\\nnewline\\\\slash');
  });
});
