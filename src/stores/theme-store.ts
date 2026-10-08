/**
 * Theme store dengan Zustand
 * Manage light/dark/system theme
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';

interface ThemeStore {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  getEffectiveTheme: () => 'light' | 'dark';
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      theme: 'system',

      setTheme: (theme: Theme) => {
        set({ theme });
        applyTheme(theme);
      },

      getEffectiveTheme: () => {
        const { theme } = get();
        
        if (theme === 'system') {
          return window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light';
        }
        
        return theme;
      },
    }),
    {
      name: 'theme-storage',
    }
  )
);

/**
 * Apply theme ke DOM
 */
function applyTheme(theme: Theme) {
  const root = window.document.documentElement;
  
  let effectiveTheme: 'light' | 'dark';
  
  if (theme === 'system') {
    effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  } else {
    effectiveTheme = theme;
  }

  root.classList.remove('light', 'dark');
  root.classList.add(effectiveTheme);
}

/**
 * Initialize theme on app start
 */
export function initializeTheme() {
  const theme = useThemeStore.getState().theme;
  applyTheme(theme);

  // Listen untuk system theme changes
  if (theme === 'system') {
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', () => {
        if (useThemeStore.getState().theme === 'system') {
          applyTheme('system');
        }
      });
  }
}
