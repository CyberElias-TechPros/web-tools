import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Changing this value resets the boundary — used to recover on navigation. */
  resetKey?: string;
}

interface State {
  error: Error | null;
  errorId: string;
}

/**
 * Catches render-time crashes so one broken tool cannot take down the whole app.
 * The stack is shown inline because there is no server to send it to — this is
 * a fully client-side app, and the user is the only one who can report it.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, errorId: '' };

  static getDerivedStateFromError(error: Error): State {
    return { error, errorId: Math.random().toString(36).slice(2, 10) };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // No telemetry by design; log locally so the user can copy it into an issue.
    console.error('[web-tools] Unhandled error', error, info.componentStack);
  }

  override componentDidUpdate(prev: Props): void {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null, errorId: '' });
    }
  }

  private reset = (): void => this.setState({ error: null, errorId: '' });

  override render(): ReactNode {
    const { error, errorId } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="card p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle size={22} style={{ color: 'var(--danger)' }} aria-hidden />
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-semibold">This tool hit an unexpected error</h1>
              <p className="muted mt-1 text-sm">
                Your data never left this browser, and nothing was sent anywhere. You can retry, or
                reload the page to start clean.
              </p>
              <pre className="surface-3 code-area mt-4 max-h-56 overflow-auto rounded-lg border p-3 text-xs whitespace-pre-wrap">
                {error.name}: {error.message}
                {error.stack ? `\n\n${error.stack.split('\n').slice(1, 8).join('\n')}` : ''}
              </pre>
              <p className="muted mt-2 font-mono text-xs">Error reference: {errorId}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary" onClick={this.reset}>
                  <RotateCcw size={15} aria-hidden />
                  Try again
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => window.location.reload()}
                >
                  Reload the page
                </button>
                <a className="btn" href="/">
                  Back to all tools
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
