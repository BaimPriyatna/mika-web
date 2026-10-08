import * as dgram from 'node:dgram';
import type { DiscoveredDevice } from './types.ts';

const MNDP_PORT = 5678;
const MNDP_BROADCAST = '255.255.255.255';
const MNDP_QUERY = Buffer.from([0x00, 0x00, 0x00, 0x00]);

const TLV_MAC = 1;
const TLV_IDENTITY = 5;
const TLV_VERSION = 7;
const TLV_PLATFORM = 8;
const TLV_UPTIME = 10;
const TLV_SOFTWARE_ID = 11;
const TLV_BOARD = 12;
const TLV_IP = 15;
const TLV_INTERFACE = 16;
const TLV_IPV6 = 17;

export function parseMndpPacket(data: Buffer): DiscoveredDevice | null {
  if (data.length < 4) {
    return null;
  }

  let offset = 4;
  const tlvs = new Map<number, Buffer>();

  try {
    while (offset + 4 <= data.length) {
      const tlvType = data.readUInt16BE(offset);
      const tlvLen = data.readUInt16BE(offset + 2);
      offset += 4;
      if (offset + tlvLen > data.length) {
        break;
      }
      tlvs.set(tlvType, data.subarray(offset, offset + tlvLen));
      offset += tlvLen;
    }
  } catch {
    return null;
  }

  if (!tlvs.has(TLV_MAC)) {
    return null;
  }

  const macBytes = tlvs.get(TLV_MAC)!;
  if (macBytes.length !== 6) {
    return null;
  }
  const macAddress = Array.from(macBytes)
    .map(b => b.toString(16).padStart(2, '0').toUpperCase())
    .join(':');

  const identity = tlvs.has(TLV_IDENTITY)
    ? tlvs.get(TLV_IDENTITY)!.toString('utf8')
    : macAddress;
  const version = tlvs.has(TLV_VERSION)
    ? tlvs.get(TLV_VERSION)!.toString('utf8')
    : '';
  const platform = tlvs.has(TLV_PLATFORM)
    ? tlvs.get(TLV_PLATFORM)!.toString('utf8')
    : 'MikroTik';
  const board = tlvs.has(TLV_BOARD)
    ? tlvs.get(TLV_BOARD)!.toString('utf8')
    : '';
  const softwareId = tlvs.has(TLV_SOFTWARE_ID)
    ? tlvs.get(TLV_SOFTWARE_ID)!.toString('utf8')
    : '';
  const interfaceName = tlvs.has(TLV_INTERFACE)
    ? tlvs.get(TLV_INTERFACE)!.toString('utf8')
    : null;

  let ipAddress: string | null = null;
  if (tlvs.has(TLV_IP) && tlvs.get(TLV_IP)!.length === 4) {
    const ipBuf = tlvs.get(TLV_IP)!;
    ipAddress = `${ipBuf[0]}.${ipBuf[1]}.${ipBuf[2]}.${ipBuf[3]}`;
  }

  let ipv6Address: string | null = null;
  if (tlvs.has(TLV_IPV6) && tlvs.get(TLV_IPV6)!.length === 16) {
    const v6Buf = tlvs.get(TLV_IPV6)!;
    const parts: string[] = [];
    for (let i = 0; i < 16; i += 2) {
      parts.push(v6Buf.readUInt16BE(i).toString(16));
    }
    ipv6Address = parts.join(':');
  }

  let uptimeSeconds = 0;
  if (tlvs.has(TLV_UPTIME) && tlvs.get(TLV_UPTIME)!.length === 4) {
    uptimeSeconds = tlvs.get(TLV_UPTIME)!.readUInt32BE(0);
  }

  const displayHost = ipAddress || (ipv6Address ? `[${ipv6Address}]` : macAddress);

  return {
    macAddress,
    identity,
    platform,
    version,
    board,
    ipAddress,
    ipv6Address,
    interfaceName,
    uptimeSeconds,
    softwareId,
    displayHost,
  };
}

export async function scanMndp(timeoutMs = 4000): Promise<DiscoveredDevice[]> {
  const devices = new Map<string, DiscoveredDevice>();

  return new Promise((resolve) => {
    let socket: dgram.Socket;
    try {
      socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    } catch {
      resolve([]);
      return;
    }

    let isClosed = false;
    const cleanup = () => {
      if (!isClosed) {
        isClosed = true;
        try {
          socket.close();
        } catch {
          // ignore
        }
        resolve(Array.from(devices.values()).sort((a, b) => a.identity.localeCompare(b.identity)));
      }
    };

    const timer = setTimeout(cleanup, timeoutMs);

    socket.on('error', (err) => {
      console.warn('[MNDP] Socket error:', err.message);
      clearTimeout(timer);
      cleanup();
    });

    socket.on('message', (msg) => {
      try {
        const device = parseMndpPacket(msg);
        if (device && !devices.has(device.macAddress)) {
          devices.set(device.macAddress, device);
        }
      } catch (err) {
        console.warn('[MNDP] Failed to parse message:', err);
      }
    });

    socket.bind(MNDP_PORT, () => {
      try {
        socket.setBroadcast(true);
        socket.send(MNDP_QUERY, MNDP_PORT, MNDP_BROADCAST, (err) => {
          if (err) {
            console.warn('[MNDP] Broadcast query failed:', err.message);
          }
        });
      } catch (err) {
        console.warn('[MNDP] Failed setting broadcast:', err);
      }
    });

    // Fallback if port 5678 binding fails (e.g. permission or in use by another app)
    socket.on('error', () => {
      // try binding random port
      try {
        const fallback = dgram.createSocket({ type: 'udp4' });
        fallback.on('message', (msg) => {
          const device = parseMndpPacket(msg);
          if (device && !devices.has(device.macAddress)) {
            devices.set(device.macAddress, device);
          }
        });
        fallback.bind(0, () => {
          fallback.setBroadcast(true);
          fallback.send(MNDP_QUERY, MNDP_PORT, MNDP_BROADCAST, () => {});
        });
        setTimeout(() => {
          try { fallback.close(); } catch {}
          cleanup();
        }, timeoutMs);
      } catch {
        cleanup();
      }
    });
  });
}
