/**
 * React Error Boundary
 * Sesuai Task 7.4 & DESIGN.md §6.4
 */

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  public handleReload = () => {
    window.location.reload();
  };

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 shadow-xl text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
                Terjadi Kesalahan Aplikasi
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Aplikasi mengalami kendala tak terduga saat memuat antarmuka.
              </p>
            </div>

            {this.state.error && (
              <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg text-left overflow-auto max-h-32 text-[11px] font-mono text-red-700 dark:text-red-400">
                {this.state.error.message}
              </div>
            )}

            <div className="flex items-center justify-center gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={this.handleReset}>
                Coba Lagi
              </Button>
              <Button size="sm" onClick={this.handleReload} className="bg-green-600 hover:bg-green-700 text-white gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" />
                Muat Ulang Halaman
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
