/**
 * Toast Notification System
 * Sesuai DESIGN.md §6.2 & Task 7.4
 */

import { create } from 'zustand';
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastStore {
  toasts: ToastItem[];
  showToast: (toast: Omit<ToastItem, 'id'>) => string;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  showToast: (toast) => {
    const id = Math.random().toString(36).substring(2, 9);
    const duration = toast.duration ?? (toast.type === 'error' ? 5000 : 3000);

    set((state) => ({
      toasts: [...state.toasts, { ...toast, id, duration }],
    }));

    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, duration);
    }

    return id;
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));

export function showToast(toast: Omit<ToastItem, 'id'>): string {
  return useToastStore.getState().showToast(toast);
}

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => {
        const isError = t.type === 'error';
        const isSuccess = t.type === 'success';
        const isWarning = t.type === 'warning';

        return (
          <div
            key={t.id}
            role="status"
            aria-live="polite"
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border shadow-lg transition-all animate-in slide-in-from-bottom-2 ${
              isError
                ? 'bg-red-50 dark:bg-red-950/90 border-red-200 dark:border-red-900 text-red-900 dark:text-red-200'
                : isSuccess
                ? 'bg-green-50 dark:bg-green-950/90 border-green-200 dark:border-green-900 text-green-900 dark:text-green-200'
                : isWarning
                ? 'bg-amber-50 dark:bg-amber-950/90 border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200'
                : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100'
            }`}
          >
            <div className="mt-0.5 shrink-0">
              {isError && <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />}
              {isSuccess && <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />}
              {isWarning && <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
              {!isError && !isSuccess && !isWarning && <Info className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
            </div>

            <div className="flex-1 min-w-0 text-xs">
              <div className="font-semibold">{t.title}</div>
              {t.message && (
                <div className="mt-0.5 text-gray-600 dark:text-gray-400 leading-relaxed">
                  {t.message}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => removeToast(t.id)}
              className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-gray-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
