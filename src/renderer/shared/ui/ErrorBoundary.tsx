import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Reusable ErrorBoundary to prevent render-time exceptions in individual
 * panels or components from crashing and blanking the entire Electron application.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error(`[ErrorBoundary] Caught render error:`, error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-6 text-center bg-bg-app rounded-card border border-border-danger/40 my-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-danger/10 text-accent-danger mb-3">
            <span className="material-symbols-outlined text-2xl">error_outline</span>
          </div>
          <h3 className="text-sm font-semibold text-text-primary mb-1">
            {this.props.fallbackTitle ?? 'Something went wrong'}
          </h3>
          <p className="text-xs text-text-secondary max-w-sm mb-4 font-mono">
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="flex items-center gap-1.5 rounded-button bg-bg-selected px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-bg-hover transition-colors"
          >
            <span className="material-symbols-outlined text-sm">refresh</span>
            <span>Retry</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
