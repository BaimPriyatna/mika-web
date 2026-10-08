import { Moon, Sun, Wifi, Settings, RefreshCw } from 'lucide-react';
import { strings } from '../../strings/id';
import { useRouterStore } from '../../stores/router-store';
import { useThemeStore } from '../../stores/theme-store';

interface HeaderProps {
  routerName?: string;
  routerVersion?: string;
  connectionStatus?: 'connected' | 'connecting' | 'disconnected' | 'not-connected';
  onReconnect?: () => void;
}

export function Header(props: HeaderProps) {
  const store = useRouterStore();
  const setTheme = useThemeStore((s) => s.setTheme);
  const getEffectiveTheme = useThemeStore((s) => s.getEffectiveTheme);

  const connectionStatus = props.connectionStatus || store.connectionStatus;
  const routerName =
    props.routerName ||
    store.overview?.resource?.identity ||
    store.systemResource?.boardName ||
    store.config?.name;
  const routerVersion =
    props.routerVersion ||
    store.systemResource?.version;

  const getStatusConfig = () => {
    switch (connectionStatus) {
      case 'connected':
        return {
          text: strings.connection.connected,
          color: 'text-green-600 dark:text-green-400',
          dotColor: 'bg-green-600 dark:bg-green-400',
          badgeBg: 'bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800',
        };
      case 'connecting':
        return {
          text: strings.connection.connecting,
          color: 'text-amber-600 dark:text-amber-400',
          dotColor: 'bg-amber-600 dark:bg-amber-400',
          badgeBg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800',
        };
      case 'disconnected':
      case 'error':
        return {
          text: strings.connection.disconnected,
          color: 'text-red-600 dark:text-red-400',
          dotColor: 'bg-red-600 dark:bg-red-400',
          badgeBg: 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800',
        };
      default:
        return {
          text: strings.connection.notConnected,
          color: 'text-gray-500 dark:text-gray-400',
          dotColor: 'bg-gray-400 dark:bg-gray-500',
          badgeBg: 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700',
        };
    }
  };

  const statusConfig = getStatusConfig();
  const effectiveTheme = getEffectiveTheme();

  const toggleTheme = () => {
    setTheme(effectiveTheme === 'dark' ? 'light' : 'dark');
  };

  return (
    <header className="h-16 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 sticky top-0 z-30">
      <div className="h-full px-6 flex items-center justify-between">
        {/* Left: App name and router info */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-green-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
              M
            </div>
            <h1 className="text-base font-bold text-gray-900 dark:text-gray-100 tracking-tight">
              {strings.appShortName}
            </h1>
          </div>

          {routerName && (
            <>
              <div className="h-5 w-px bg-gray-200 dark:bg-gray-800" />
              <div className="flex items-center gap-2 text-sm bg-gray-50 dark:bg-gray-900/60 px-2.5 py-1 rounded-md border border-gray-200 dark:border-gray-800">
                <span className="font-medium text-gray-800 dark:text-gray-200">{routerName}</span>
                {routerVersion && (
                  <>
                    <span className="text-gray-300 dark:text-gray-700">·</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">v{routerVersion}</span>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right: Connection status, Connect button, and theme toggle */}
        <div className="flex items-center gap-3">
          {/* Connection status badge */}
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-medium ${statusConfig.badgeBg}`}>
            <span className="relative flex h-2 w-2">
              {connectionStatus === 'connected' && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              )}
              {connectionStatus === 'connecting' && (
                <span className="animate-spin inline-block h-2 w-2 border border-current border-t-transparent rounded-full text-amber-500"></span>
              )}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${statusConfig.dotColor}`}></span>
            </span>
            <span className={statusConfig.color}>{statusConfig.text}</span>
          </div>

          {/* Connect / Change Router button */}
          <button
            onClick={() => store.setModalOpen(true)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
              connectionStatus === 'connected'
                ? 'text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 border-gray-200 dark:border-gray-700'
                : 'text-white bg-green-600 hover:bg-green-700 border-transparent shadow-xs'
            }`}
          >
            {connectionStatus === 'connected' ? (
              <>
                <Settings className="w-3.5 h-3.5" />
                <span>Ganti Router</span>
              </>
            ) : (
              <>
                <Wifi className="w-3.5 h-3.5" />
                <span>Hubungkan Router</span>
              </>
            )}
          </button>

          {/* Quick Refresh if connected */}
          {connectionStatus === 'connected' && (
            <button
              onClick={() => store.fetchOverview()}
              title="Perbarui Data Router"
              className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label={strings.theme.toggle}
            title={strings.theme.toggle}
          >
            {effectiveTheme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
