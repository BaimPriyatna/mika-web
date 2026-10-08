import { describe, it, expect, vi } from 'vitest';
import {
  formatBytes,
  formatMinutesToDuration,
  listHotspotActive,
  kickActiveUser,
} from '../lease-service';
import type { RouterClient } from '../../../core/router/client';

describe('Lease Service (DESIGN.md §4.7 & KEPUTUSAN TERBARU §5, §6)', () => {
  it('formats bytes into human readable format correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(1048576 * 5)).toBe('5.0 MB');
    expect(formatBytes(1073741824 * 2.5)).toBe('2.50 GB');
  });

  it('formats minutes into duration string correctly', () => {
    expect(formatMinutesToDuration(0)).toBe('Habis');
    expect(formatMinutesToDuration(-5)).toBe('Habis');
    expect(formatMinutesToDuration(45)).toBe('45m');
    expect(formatMinutesToDuration(60)).toBe('1j');
    expect(formatMinutesToDuration(134)).toBe('2j 14m');
  });

  it('calculates remaining validity and sets severity levels properly', async () => {
    const mockClient = {
      print: vi.fn().mockImplementation(async (path: string) => {
        if (path === '/ip/hotspot/active') {
          return [
            { '.id': '*1', user: 'user1', address: '192.168.100.10', uptime: '15m' },
            { '.id': '*2', user: 'user2', address: '192.168.100.11', uptime: '55m' },
            { '.id': '*3', user: 'user3', address: '192.168.100.12', uptime: '5m' },
          ];
        }
        if (path === '/ip/hotspot/user') {
          return [
            { '.id': '*u1', name: 'user1', profile: 'prof1', comment: 'vm|b=b1|p=p1|u=55' }, // 60 - 55 = 5m (critical)
            { '.id': '*u2', name: 'user2', profile: 'prof1', comment: 'vm|b=b1|p=p1|u=20' }, // 60 - 20 = 40m (warning)
            { '.id': '*u3', name: 'user3', profile: 'prof2', comment: 'vm|b=b1|p=p2|u=10' }, // 180 - 10 = 170m (normal)
          ];
        }
        if (path === '/ip/hotspot/user/profile') {
          return [
            { '.id': '*p1', name: 'prof1', 'session-timeout': '1h' }, // 60m
            { '.id': '*p2', name: 'prof2', 'session-timeout': '3h' }, // 180m
          ];
        }
        return [];
      }),
    } as unknown as RouterClient;

    const result = await listHotspotActive(mockClient);
    expect(result).toHaveLength(3);

    // user1: remaining 5m -> critical
    expect(result[0].remainingMinutes).toBe(5);
    expect(result[0].formattedRemaining).toBe('5m');
    expect(result[0].validityLevel).toBe('critical');

    // user2: remaining 40m -> warning (< 60m)
    expect(result[1].remainingMinutes).toBe(40);
    expect(result[1].formattedRemaining).toBe('40m');
    expect(result[1].validityLevel).toBe('warning');

    // user3: remaining 170m -> normal (> 60m)
    expect(result[2].remainingMinutes).toBe(170);
    expect(result[2].formattedRemaining).toBe('2j 50m');
    expect(result[2].validityLevel).toBe('normal');
  });

  it('calls kickActiveUser with active ID', async () => {
    const mockRemove = vi.fn().mockResolvedValue(undefined);
    const mockClient = {
      remove: mockRemove,
    } as unknown as RouterClient;

    await kickActiveUser(mockClient, '*active1');
    expect(mockRemove).toHaveBeenCalledWith('/ip/hotspot/active', '*active1');
  });
});
