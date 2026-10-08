import { describe, it, expect } from 'vitest';
import { parseMndpPacket } from '../mndp.ts';

describe('MNDP Protocol Parser', () => {
  it('should return null if buffer is too short', () => {
    const buf = Buffer.from([0, 1, 2]);
    expect(parseMndpPacket(buf)).toBeNull();
  });

  it('should return null if MAC address TLV is missing', () => {
    // 4 header bytes + identity TLV only (type 5, len 4, "test")
    const header = Buffer.from([0, 0, 0, 0]);
    const identityTlv = Buffer.from([0x00, 0x05, 0x00, 0x04, 0x74, 0x65, 0x73, 0x74]);
    const packet = Buffer.concat([header, identityTlv]);

    expect(parseMndpPacket(packet)).toBeNull();
  });

  it('should correctly parse full MNDP packet with MAC, IP, Identity, and Board', () => {
    const header = Buffer.from([0, 0, 0, 0]);

    // TLV 1: MAC (6 bytes): 48:8F:5A:12:34:56
    const macTlv = Buffer.from([0x00, 0x01, 0x00, 0x06, 0x48, 0x8f, 0x5a, 0x12, 0x34, 0x56]);

    // TLV 5: Identity (utf8: "Hotspot Utama")
    const idBytes = Buffer.from('Hotspot Utama', 'utf8');
    const idTlv = Buffer.concat([
      Buffer.from([0x00, 0x05, 0x00, idBytes.length]),
      idBytes,
    ]);

    // TLV 7: Version ("7.15.3")
    const verBytes = Buffer.from('7.15.3', 'utf8');
    const verTlv = Buffer.concat([
      Buffer.from([0x00, 0x07, 0x00, verBytes.length]),
      verBytes,
    ]);

    // TLV 12: Board ("RB750Gr3")
    const boardBytes = Buffer.from('RB750Gr3', 'utf8');
    const boardTlv = Buffer.concat([
      Buffer.from([0x00, 0x0c, 0x00, boardBytes.length]),
      boardBytes,
    ]);

    // TLV 15: IPv4 (4 bytes: 192.168.88.1)
    const ipTlv = Buffer.from([0x00, 0x0f, 0x00, 0x04, 192, 168, 88, 1]);

    // TLV 10: Uptime (4 bytes: 3600 seconds)
    const uptimeBuf = Buffer.alloc(4);
    uptimeBuf.writeUInt32BE(3600, 0);
    const uptimeTlv = Buffer.concat([
      Buffer.from([0x00, 0x0a, 0x00, 0x04]),
      uptimeBuf,
    ]);

    const packet = Buffer.concat([header, macTlv, idTlv, verTlv, boardTlv, ipTlv, uptimeTlv]);
    const device = parseMndpPacket(packet);

    expect(device).not.toBeNull();
    expect(device?.macAddress).toBe('48:8F:5A:12:34:56');
    expect(device?.identity).toBe('Hotspot Utama');
    expect(device?.version).toBe('7.15.3');
    expect(device?.board).toBe('RB750Gr3');
    expect(device?.ipAddress).toBe('192.168.88.1');
    expect(device?.uptimeSeconds).toBe(3600);
    expect(device?.displayHost).toBe('192.168.88.1');
  });
});
