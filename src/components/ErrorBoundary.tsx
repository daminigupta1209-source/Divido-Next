import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Top-level safety net. If any child component throws during render, this
 * catches it and shows a friendly recovery screen instead of a blank white
 * page. Automatically recovers from chunk load errors caused by new deploys.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[Divido] Unhandled render error:', error, info);

    const msg = error?.message || '';
    const isChunkError =
      msg.includes('dynamically imported module') ||
      msg.includes('Loading chunk') ||
      msg.includes('Failed to fetch');

    if (isChunkError && typeof window !== 'undefined') {
      const reloaded = sessionStorage.getItem('divido_chunk_reloaded');
      if (!reloaded) {
        sessionStorage.setItem('divido_chunk_reloaded', '1');
        window.location.reload();
      }
    }
  }

  handleReload = () => {
    try {
      sessionStorage.removeItem('divido_chunk_reloaded');
    } catch {}
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          textAlign: 'center',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          color: '#1E293B',
          background: '#F8FAFC',
        }}
      >
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>😵‍💫</div>
        <h1 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 8px' }}>
          New Version Available
        </h1>
        <p style={{ fontSize: '14px', color: '#64748B', margin: '0 0 24px', maxWidth: '320px' }}>
          Divido was updated. Tap below to refresh and load the latest version.
        </p>
        <button
          onClick={this.handleReload}
          style={{
            background: '#10B981',
            color: '#fff',
            border: 'none',
            borderRadius: '12px',
            padding: '12px 28px',
            fontSize: '15px',
            fontWeight: 800,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
          }}
        >
          Update & Reload
        </button>
        {this.state.error?.message && (
          <p style={{ fontSize: '11px', color: '#94A3B8', marginTop: '20px', maxWidth: '320px', wordBreak: 'break-word' }}>
            {this.state.error.message}
          </p>
        )}
      </div>
    );
  }
}
