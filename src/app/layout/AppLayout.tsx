import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { ConnectionModal } from '../../features/connection/ConnectionModal';
import { useRouterStore } from '../../stores/router-store';

interface AppLayoutProps {
  routerName?: string;
  routerVersion?: string;
  connectionStatus?: 'connected' | 'connecting' | 'disconnected' | 'not-connected';
  onReconnect?: () => void;
}

export function AppLayout({
  routerName,
  routerVersion,
  connectionStatus,
  onReconnect,
}: AppLayoutProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const checkStatus = useRouterStore((s) => s.checkStatus);

  useEffect(() => {
    // Check router status on initial app load
    checkStatus();
  }, [checkStatus]);

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* Header */}
      <Header
        routerName={routerName}
        routerVersion={routerVersion}
        connectionStatus={connectionStatus}
        onReconnect={onReconnect}
      />

      {/* Main content area with sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        />

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-screen-xl mx-auto p-6">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Global Connection Modal */}
      <ConnectionModal />
    </div>
  );
}
