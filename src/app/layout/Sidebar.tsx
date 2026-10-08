import { NavLink } from 'react-router-dom';
import {
  Home,
  Ticket,
  Package,
  UserCog,
  Laptop,
  Wrench,
  Settings,
  ChevronLeft,
  ChevronRight,
  type LucideProps,
} from 'lucide-react';
import { strings } from '../../strings/id';

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<LucideProps>;
}

const navItems: NavItem[] = [
  { path: '/', label: strings.nav.dashboard, icon: Home },
  { path: '/voucher', label: strings.nav.voucher, icon: Ticket },
  { path: '/paket', label: strings.nav.paket, icon: Package },
  { path: '/profil', label: strings.nav.profil, icon: UserCog },
  { path: '/perangkat', label: strings.nav.perangkat, icon: Laptop },
  { path: '/setup', label: strings.nav.setupRouter, icon: Wrench },
  { path: '/pengaturan', label: strings.nav.pengaturan, icon: Settings },
];

interface SidebarProps {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({ isCollapsed = false, onToggleCollapse }: SidebarProps) {
  return (
    <aside
      className={`
        bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800
        transition-all duration-200 ease-in-out
        ${isCollapsed ? 'w-16' : 'w-58'}
      `}
    >
      <nav className="h-full flex flex-col">
        {/* Navigation items */}
        <div className="flex-1 py-6">
          <ul className="space-y-1 px-3">
            {navItems.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  end={item.path === '/'}
                  className={({ isActive }) => `
                    flex items-center gap-3 px-3 py-2.5 rounded-md
                    transition-colors duration-150
                    ${
                      isActive
                        ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 font-medium'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }
                    ${isCollapsed ? 'justify-center' : ''}
                  `}
                  title={isCollapsed ? item.label : undefined}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" strokeWidth={1.75} />
                  {!isCollapsed && <span className="text-sm">{item.label}</span>}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>

        {/* Collapse toggle button */}
        {onToggleCollapse && (
          <div className="p-3 border-t border-gray-200 dark:border-gray-800">
            <button
              onClick={onToggleCollapse}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-md
                text-gray-600 dark:text-gray-400
                hover:bg-gray-100 dark:hover:bg-gray-800
                transition-colors duration-150
                ${isCollapsed ? 'justify-center' : ''}
              `}
              aria-label={isCollapsed ? strings.sidebar.expand : strings.sidebar.collapse}
              title={isCollapsed ? strings.sidebar.expand : strings.sidebar.collapse}
            >
              {isCollapsed ? (
                <ChevronRight className="w-5 h-5" strokeWidth={1.75} />
              ) : (
                <>
                  <ChevronLeft className="w-5 h-5 flex-shrink-0" strokeWidth={1.75} />
                  <span className="text-sm">{strings.sidebar.collapse}</span>
                </>
              )}
            </button>
          </div>
        )}
      </nav>
    </aside>
  );
}
