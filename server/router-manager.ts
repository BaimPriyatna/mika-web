import { BinaryRouterClient } from './binary-client.ts';
import { RestRouterClient } from './rest-client.ts';
import type { ConnectRequest, RouterOverview, RouterSystemResource } from './types.ts';

export class RouterManager {
  private activeBinaryClient: BinaryRouterClient | null = null;
  private activeRestClient: RestRouterClient | null = null;
  private currentConfig: ConnectRequest | null = null;
  private activeProtocol: 'rest' | 'binary' | null = null;
  private cachedResource: RouterSystemResource | null = null;
  private lastError: string | null = null;

  isConnected(): boolean {
    return (this.activeBinaryClient !== null || this.activeRestClient !== null) && this.activeProtocol !== null;
  }

  getCurrentConfig(): ConnectRequest | null {
    return this.currentConfig;
  }

  getActiveProtocol(): 'rest' | 'binary' | null {
    return this.activeProtocol;
  }

  getCachedResource(): RouterSystemResource | null {
    return this.cachedResource;
  }

  disconnect() {
    if (this.activeBinaryClient) {
      try {
        this.activeBinaryClient.close();
      } catch {}
      this.activeBinaryClient = null;
    }
    this.activeRestClient = null;
    this.currentConfig = null;
    this.activeProtocol = null;
    this.cachedResource = null;
    this.lastError = null;
  }

  async connect(req: ConnectRequest): Promise<RouterSystemResource> {
    this.disconnect();
    this.currentConfig = req;

    const protocol = req.protocol || 'auto';
    const errors: string[] = [];

    // Helper: try Binary API
    const tryBinary = async (): Promise<RouterSystemResource> => {
      const port = req.port || (req.scheme === 'https' ? 8729 : 8728);
      const useSsl = req.scheme === 'https' || port === 8729;
      const client = new BinaryRouterClient({
        host: req.host,
        port,
        username: req.username,
        password: req.password,
        useSsl,
        timeoutMs: 6000,
      });

      await client.connect();
      const resList = await client.print('/system/resource');
      if (!resList || resList.length === 0) {
        throw new Error('Tidak ada data dari /system/resource');
      }

      let identity = req.name || '';
      try {
        const idList = await client.print('/system/identity');
        if (idList && idList[0]?.name) {
          identity = idList[0].name;
        }
      } catch {}

      const raw = resList[0];
      const parsedResource = this.parseResource(raw, identity || raw['board-name'] || 'MikroTik');
      this.activeBinaryClient = client;
      this.activeProtocol = 'binary';
      this.cachedResource = parsedResource;
      this.lastError = null;
      return parsedResource;
    };

    // Helper: try REST API
    const tryRest = async (): Promise<RouterSystemResource> => {
      const scheme = req.scheme || 'http';
      const port = req.port || (scheme === 'https' ? 443 : 80);
      const client = new RestRouterClient({
        host: req.host,
        port,
        scheme,
        username: req.username,
        password: req.password,
        timeoutMs: 6000,
      });

      const raw = await client.testConnection();
      let identity = req.name || '';
      try {
        const idList = await client.print('/system/identity');
        if (idList && idList[0]?.name) {
          identity = idList[0].name;
        }
      } catch {}

      const parsedResource = this.parseResource(raw, identity || raw['board-name'] || 'MikroTik');
      this.activeRestClient = client;
      this.activeProtocol = 'rest';
      this.cachedResource = parsedResource;
      this.lastError = null;
      return parsedResource;
    };

    // Strategy based on protocol choice
    if (protocol === 'binary') {
      try {
        return await tryBinary();
      } catch (err: any) {
        this.lastError = err.message;
        throw err;
      }
    } else if (protocol === 'rest') {
      try {
        return await tryRest();
      } catch (err: any) {
        this.lastError = err.message;
        throw err;
      }
    } else {
      // Auto: if explicit port 80/443, try REST first
      if (req.port === 80 || req.port === 443) {
        try {
          return await tryRest();
        } catch (err: any) {
          errors.push(`REST: ${err.message}`);
          try {
            return await tryBinary();
          } catch (binErr: any) {
            errors.push(`Binary API: ${binErr.message}`);
          }
        }
      } else {
        // Default: try Binary API first (v6 and v7 support it universally)
        try {
          return await tryBinary();
        } catch (err: any) {
          errors.push(`Binary API: ${err.message}`);
          try {
            return await tryRest();
          } catch (restErr: any) {
            errors.push(`REST: ${restErr.message}`);
          }
        }
      }

      const combinedError = errors.join(' | ');
      this.lastError = combinedError;
      throw new Error(`Gagal terhubung ke router: ${combinedError}`);
    }
  }

  async print(path: string, query?: Record<string, string>): Promise<Record<string, string>[]> {
    if (this.activeBinaryClient) {
      return this.activeBinaryClient.print(path, query);
    }
    if (this.activeRestClient) {
      return this.activeRestClient.print(path, query);
    }
    throw new Error('Router belum terhubung');
  }

  async add(path: string, body: Record<string, string>): Promise<string> {
    if (this.activeBinaryClient) {
      return this.activeBinaryClient.add(path, body);
    }
    if (this.activeRestClient) {
      return this.activeRestClient.add(path, body);
    }
    throw new Error('Router belum terhubung');
  }

  async set(path: string, id: string, body: Record<string, string>): Promise<void> {
    if (this.activeBinaryClient) {
      return this.activeBinaryClient.set(path, id, body);
    }
    if (this.activeRestClient) {
      return this.activeRestClient.set(path, id, body);
    }
    throw new Error('Router belum terhubung');
  }

  async remove(path: string, id: string): Promise<void> {
    if (this.activeBinaryClient) {
      return this.activeBinaryClient.remove(path, id);
    }
    if (this.activeRestClient) {
      return this.activeRestClient.remove(path, id);
    }
    throw new Error('Router belum terhubung');
  }

  async getOverview(): Promise<RouterOverview> {
    if (!this.isConnected()) {
      return {
        connected: false,
        config: null,
        resource: null,
        interfacesCount: 0,
        activeHotspotUsersCount: 0,
        totalHotspotUsersCount: 0,
        dhcpLeasesCount: 0,
        hotspotServersCount: 0,
        error: this.lastError,
      };
    }

    try {
      const [resources, ifaces, hsActive, hsUsers, dhcpLeases, hsServers] = await Promise.allSettled([
        this.print('/system/resource'),
        this.print('/interface'),
        this.print('/ip/hotspot/active'),
        this.print('/ip/hotspot/user'),
        this.print('/ip/dhcp-server/lease'),
        this.print('/ip/hotspot'),
      ]);

      let resObj = this.cachedResource;
      if (resources.status === 'fulfilled' && resources.value.length > 0) {
        const raw = resources.value[0];
        resObj = this.parseResource(raw, this.cachedResource?.identity || 'MikroTik');
        this.cachedResource = resObj;
      }

      return {
        connected: true,
        config: this.currentConfig
          ? {
              host: this.currentConfig.host,
              port: this.currentConfig.port || (this.activeProtocol === 'rest' ? 80 : 8728),
              username: this.currentConfig.username,
              protocol: this.activeProtocol!,
            }
          : null,
        resource: resObj,
        interfacesCount: ifaces.status === 'fulfilled' ? ifaces.value.length : 0,
        activeHotspotUsersCount: hsActive.status === 'fulfilled' ? hsActive.value.length : 0,
        totalHotspotUsersCount: hsUsers.status === 'fulfilled' ? hsUsers.value.length : 0,
        dhcpLeasesCount: dhcpLeases.status === 'fulfilled' ? dhcpLeases.value.length : 0,
        hotspotServersCount: hsServers.status === 'fulfilled' ? hsServers.value.length : 0,
        error: null,
      };
    } catch (err: any) {
      return {
        connected: true,
        config: null,
        resource: this.cachedResource,
        interfacesCount: 0,
        activeHotspotUsersCount: 0,
        totalHotspotUsersCount: 0,
        dhcpLeasesCount: 0,
        hotspotServersCount: 0,
        error: err.message,
      };
    }
  }

  private parseResource(raw: Record<string, string>, identity: string): RouterSystemResource {
    const parseNum = (v?: string) => (v ? parseInt(v.replace(/[^0-9]/g, ''), 10) || 0 : 0);

    return {
      version: raw['version'] || 'unknown',
      boardName: raw['board-name'] || raw['platform'] || 'MikroTik',
      platform: raw['platform'] || 'MikroTik',
      cpu: raw['cpu'] || '',
      cpuCount: parseNum(raw['cpu-count']) || 1,
      cpuFrequency: parseNum(raw['cpu-frequency']),
      cpuLoad: parseNum(raw['cpu-load']),
      freeMemory: parseNum(raw['free-memory']),
      totalMemory: parseNum(raw['total-memory']),
      freeHddSpace: parseNum(raw['free-hdd-space']),
      totalHddSpace: parseNum(raw['total-hdd-space']),
      uptime: raw['uptime'] || '0s',
      architecture: raw['architecture-name'] || 'unknown',
      identity,
    };
  }
}

export const globalRouterManager = new RouterManager();
