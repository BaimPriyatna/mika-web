/**
 * Router global state dengan Zustand
 * Terintegrasi dengan backend MikroTik (MNDP scan, Binary API, REST v7)
 */

import { create } from 'zustand';
import { RouterClient } from '../core/router/client';
import type { RouterConfig, SystemResource, ConnectionStatus } from '../core/router/types';
import {
  scanRouters,
  connectRouter,
  disconnectRouter,
  getRouterStatus,
  getRouterOverview,
  type DiscoveredDevice,
  type ConnectRequest,
  type RouterOverview,
} from '../features/connection/api';

const LAST_CONFIG_KEY = 'mika_last_router_config';

function loadSavedConfig(): Partial<ConnectRequest> | null {
  try {
    const raw = localStorage.getItem(LAST_CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveConfig(config: ConnectRequest) {
  try {
    const { password, ...safeConfig } = config;
    localStorage.setItem(LAST_CONFIG_KEY, JSON.stringify(safeConfig));
  } catch {}
}

interface RouterStore {
  // State
  client: RouterClient | null;
  config: RouterConfig | null;
  connectionStatus: ConnectionStatus;
  systemResource: SystemResource | null;
  overview: RouterOverview | null;
  discoveredDevices: DiscoveredDevice[];
  isScanning: boolean;
  error: string | null;
  isModalOpen: boolean;

  // Actions
  scan: (timeout?: number) => Promise<DiscoveredDevice[]>;
  connect: (config: RouterConfig) => Promise<void>;
  disconnect: () => Promise<void>;
  checkStatus: () => Promise<void>;
  fetchOverview: () => Promise<void>;
  setModalOpen: (open: boolean) => void;
  setStatus: (status: ConnectionStatus) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

export const useRouterStore = create<RouterStore>((set, get) => ({
  client: null,
  config: null,
  connectionStatus: 'not-connected',
  systemResource: null,
  overview: null,
  discoveredDevices: [],
  isScanning: false,
  error: null,
  isModalOpen: false,

  setModalOpen: (open: boolean) => {
    set({ isModalOpen: open });
  },

  scan: async (timeout = 3500) => {
    try {
      set({ isScanning: true, error: null });
      const devices = await scanRouters(timeout);
      set({ discoveredDevices: devices, isScanning: false });
      return devices;
    } catch (err: any) {
      set({ isScanning: false, error: err.message || 'Gagal memindai router' });
      return [];
    }
  },

  connect: async (config: RouterConfig) => {
    try {
      set({ connectionStatus: 'connecting', error: null });

      const connectReq: ConnectRequest = {
        name: config.name,
        host: config.host,
        port: config.port,
        scheme: config.scheme,
        username: config.username,
        password: config.password,
        protocol: 'auto',
      };

      const result = await connectRouter(connectReq);
      saveConfig(connectReq);

      const sysRes: SystemResource = {
        version: result.resource.version,
        boardName: result.resource.boardName,
        platform: result.resource.platform,
        cpuLoad: result.resource.cpuLoad,
        freeMemory: result.resource.freeMemory,
        totalMemory: result.resource.totalMemory,
        uptime: result.resource.uptime,
        architecture: result.resource.architecture,
      };

      const client = new RouterClient();

      set({
        client,
        config,
        connectionStatus: 'connected',
        systemResource: sysRes,
        error: null,
      });

      // Fetch initial overview
      get().fetchOverview();
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'Connection failed';
      set({
        client: null,
        connectionStatus: 'error',
        systemResource: null,
        overview: null,
        error: errorMessage,
      });
      throw error;
    }
  },

  disconnect: async () => {
    try {
      await disconnectRouter();
    } catch (err) {
      console.warn('Disconnect error:', err);
    }

    set({
      client: null,
      config: null,
      connectionStatus: 'not-connected',
      systemResource: null,
      overview: null,
      error: null,
    });
  },

  checkStatus: async () => {
    try {
      const status = await getRouterStatus();
      if (status.connected && status.resource) {
        const sysRes: SystemResource = {
          version: status.resource.version,
          boardName: status.resource.boardName,
          platform: status.resource.platform,
          cpuLoad: status.resource.cpuLoad,
          freeMemory: status.resource.freeMemory,
          totalMemory: status.resource.totalMemory,
          uptime: status.resource.uptime,
          architecture: status.resource.architecture,
        };

        set({
          connectionStatus: 'connected',
          systemResource: sysRes,
        });

        get().fetchOverview();
      } else {
        set({ connectionStatus: 'not-connected' });
      }
    } catch {
      set({ connectionStatus: 'not-connected' });
    }
  },

  fetchOverview: async () => {
    try {
      const overview = await getRouterOverview();
      set({ overview });
      if (overview.connected && overview.resource) {
        set({
          systemResource: {
            version: overview.resource.version,
            boardName: overview.resource.boardName,
            platform: overview.resource.platform,
            cpuLoad: overview.resource.cpuLoad,
            freeMemory: overview.resource.freeMemory,
            totalMemory: overview.resource.totalMemory,
            uptime: overview.resource.uptime,
            architecture: overview.resource.architecture,
          },
        });
      }
    } catch (err: any) {
      console.warn('Failed to fetch overview:', err);
    }
  },

  setStatus: (status: ConnectionStatus) => {
    set({ connectionStatus: status });
  },

  setError: (error: string | null) => {
    set({ error });
  },

  clearError: () => {
    set({ error: null });
  },
}));

export function useRouterClient(): RouterClient {
  const client = useRouterStore((state) => state.client);
  if (!client) {
    throw new Error('Router not connected. Please connect first.');
  }
  return client;
}

export function useIsConnected(): boolean {
  return useRouterStore((state) => state.connectionStatus === 'connected');
}

export function useConnectionStatus(): ConnectionStatus {
  return useRouterStore((state) => state.connectionStatus);
}

export { loadSavedConfig };
