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
 * page. Without this, a single render error anywhere blanks the whole app.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // Keep a breadcrumb in the console for debugging a real crash.
    console.error('[Divido] Unhandled render error:', error, info);
  }

  handleReload = () => {
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
          Something went wrong
        </h1>
        <p style={{ fontSize: '14px', color: '#64748B', margin: '0 0 24px', maxWidth: '320px' }}>
          The app hit an unexpected error. Your data is safe — reloading usually fixes it.
        </p>
        <button
          onClick={this.handleReload}
          style={{
            background: '#6FC7A4',
            color: '#fff',
            border: 'none',
            borderRadius: '12px',
            padding: '12px 28px',
            fontSize: '15px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Reload App
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
