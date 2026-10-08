import { useState, useEffect } from 'react';
import {
  Wifi,
  Search,
  Server,
  RefreshCw,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  X,
  Radio,
  Sliders,
  Unplug,
} from 'lucide-react';
import { useRouterStore, loadSavedConfig } from '../../stores/router-store';
import type { DiscoveredDevice } from './api';

export function ConnectionModal() {
  const {
    isModalOpen,
    setModalOpen,
    connectionStatus,
    systemResource,
    overview,
    discoveredDevices,
    isScanning,
    error,
    scan,
    connect,
    disconnect,
    clearError,
  } = useRouterStore();

  const [mode, setMode] = useState<'scan' | 'manual'>('scan');
  const [selectedDevice, setSelectedDevice] = useState<DiscoveredDevice | null>(null);

  const [name, setName] = useState('');
  const [host, setHost] = useState('192.168.88.1');
  const [port, setPort] = useState('8728');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [protocol, setProtocol] = useState<'auto' | 'binary' | 'rest'>('auto');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pre-fill from saved config if available
  useEffect(() => {
    const saved = loadSavedConfig();
    if (saved) {
      if (saved.host) setHost(saved.host);
      if (saved.username) setUsername(saved.username);
      if (saved.name) setName(saved.name);
      if (saved.port) setPort(String(saved.port));
    }
  }, []);

  // Auto scan once when opening modal if devices list is empty
  useEffect(() => {
    if (isModalOpen && discoveredDevices.length === 0 && !isScanning) {
      scan();
    }
  }, [isModalOpen]);

  if (!isModalOpen) return null;

  const handleSelectDevice = (device: DiscoveredDevice) => {
    setSelectedDevice(device);
    if (device.ipAddress) {
      setHost(device.ipAddress);
    }
    if (device.identity) {
      setName(device.identity);
    }
    clearError();
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setIsSubmitting(true);

    try {
      const portNum = parseInt(port, 10) || 8728;
      await connect({
        name: name || (selectedDevice ? selectedDevice.identity : 'MikroTik'),
        host: host.trim(),
        port: portNum,
        scheme: portNum === 443 || portNum === 8729 ? 'https' : 'http',
        username: username.trim(),
        password,
      });
      // Close modal on success after brief pause
      setTimeout(() => {
        setModalOpen(false);
      }, 500);
    } catch {
      // Error handled by store
    } finally {
      setIsSubmitting(false);
    }
  };

  const isConnected = connectionStatus === 'connected';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-950/60 rounded-lg text-green-700 dark:text-green-400">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Koneksi Router MikroTik
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Pindai jaringan lokal secara otomatis (MNDP) atau isi konfigurasi manual
              </p>
            </div>
          </div>
          <button
            onClick={() => setModalOpen(false)}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Active status pill if connected */}
          {isConnected && systemResource && (
            <div className="p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-green-900 dark:text-green-200">
                    Terhubung ke {overview?.resource?.identity || systemResource.boardName}
                  </p>
                  <p className="text-xs text-green-700 dark:text-green-400">
                    RouterOS {systemResource.version} · Uptime: {systemResource.uptime}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => disconnect()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-md border border-red-200 dark:border-red-900 transition-colors"
              >
                <Unplug className="w-3.5 h-3.5" />
                Putuskan
              </button>
            </div>
          )}

          {/* Error notice */}
          {error && (
            <div className="p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2.5 text-red-700 dark:text-red-300 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0 text-red-500 mt-0.5" />
              <div>
                <span className="font-semibold">Koneksi Gagal:</span> {error}
              </div>
            </div>
          )}

          {/* Mode Switcher */}
          <div className="flex p-1 bg-gray-100 dark:bg-gray-900 rounded-lg">
            <button
              type="button"
              onClick={() => setMode('scan')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-md transition-all ${
                mode === 'scan'
                  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-xs'
                  : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              <Search className="w-4 h-4" />
              Pindai Otomatis (MNDP)
              {discoveredDevices.length > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-full">
                  {discoveredDevices.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setMode('manual')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-md transition-all ${
                mode === 'manual'
                  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-xs'
                  : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              <Sliders className="w-4 h-4" />
              Input Manual
            </button>
          </div>

          {/* Mode 1: MNDP Scan */}
          {mode === 'scan' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Daftar Router MikroTik Terdeteksi
                </span>
                <button
                  type="button"
                  onClick={() => scan()}
                  disabled={isScanning}
                  className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40 hover:bg-green-100 dark:hover:bg-green-900/60 rounded-md border border-green-200 dark:border-green-800 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                  {isScanning ? 'Memindai...' : 'Pindai Ulang'}
                </button>
              </div>

              {/* Device cards */}
              {isScanning && discoveredDevices.length === 0 ? (
                <div className="py-10 text-center border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl space-y-2">
                  <RefreshCw className="w-8 h-8 text-green-600 animate-spin mx-auto" />
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Memindai broadcast MNDP di jaringan lokal...
                  </p>
                  <p className="text-xs text-gray-400">Mencari port UDP 5678</p>
                </div>
              ) : discoveredDevices.length > 0 ? (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {discoveredDevices.map((dev) => {
                    const isSelected = selectedDevice?.macAddress === dev.macAddress || host === dev.ipAddress;
                    return (
                      <div
                        key={dev.macAddress}
                        onClick={() => handleSelectDevice(dev)}
                        className={`p-3.5 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${
                          isSelected
                            ? 'border-green-600 bg-green-50/50 dark:bg-green-950/20 dark:border-green-500 ring-1 ring-green-600/30'
                            : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 bg-white dark:bg-gray-900'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-md ${isSelected ? 'bg-green-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>
                            <Server className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                {dev.identity}
                              </span>
                              {dev.version && (
                                <span className="px-1.5 py-0.2 text-[10px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded">
                                  v{dev.version}
                                </span>
                              )}
                              {dev.board && (
                                <span className="text-xs text-gray-400">
                                  ({dev.board})
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              <span>IP: <strong className="text-gray-700 dark:text-gray-300">{dev.ipAddress || '—'}</strong></span>
                              <span>MAC: {dev.macAddress}</span>
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0">
                          <input
                            type="radio"
                            name="selectedDevice"
                            checked={isSelected}
                            onChange={() => handleSelectDevice(dev)}
                            className="text-green-600 focus:ring-green-500 h-4 w-4"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl space-y-2 p-4">
                  <Wifi className="w-8 h-8 text-gray-400 mx-auto" />
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Tidak ada router MikroTik terdeteksi via MNDP
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                    Pastikan komputer tersambung di jaringan yang sama dengan router MikroTik, atau beralih ke <strong>Input Manual</strong> untuk memasukkan IP secara langsung.
                  </p>
                  <button
                    type="button"
                    onClick={() => setMode('manual')}
                    className="mt-2 text-xs font-semibold text-green-600 dark:text-green-400 hover:underline"
                  >
                    Buka Input Manual →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Form Fields for Connection */}
          <form id="connection-form" onSubmit={handleConnect} className="space-y-3.5 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Nama Label Router
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Hotspot Utama"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Host / Alamat IP Router <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="192.168.88.1"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Port
                </label>
                <input
                  type="text"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="8728 (API) / 80 (REST)"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Protokol API
                </label>
                <select
                  value={protocol}
                  onChange={(e) => {
                    const p = e.target.value as 'auto' | 'binary' | 'rest';
                    setProtocol(p);
                    if (p === 'rest' && port === '8728') setPort('80');
                    if (p === 'binary' && port === '80') setPort('8728');
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                >
                  <option value="auto">Otomatis (Coba API & REST)</option>
                  <option value="binary">API Binary (Port 8728/8729 - v6 & v7)</option>
                  <option value="rest">REST API (Port 80/443 - RouterOS v7)</option>
                </select>
              </div>
            </div>

            {/* Credentials */}
            <div className="p-3.5 bg-gray-50 dark:bg-gray-900/40 rounded-lg border border-gray-200 dark:border-gray-800 space-y-3">
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 block">
                Kredensial Login RouterOS
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Username <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="admin"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-950 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Masukkan password"
                      className="w-full px-3 py-2 pr-9 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-950 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setModalOpen(false)}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
          >
            Tutup
          </button>

          <button
            type="submit"
            form="connection-form"
            disabled={isSubmitting || connectionStatus === 'connecting'}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md shadow-xs disabled:opacity-50 transition-colors"
          >
            {isSubmitting || connectionStatus === 'connecting' ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Menghubungkan...
              </>
            ) : (
              <>
                <Wifi className="w-4 h-4" />
                {isConnected ? 'Sambungkan Ulang' : 'Hubungkan Router'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
