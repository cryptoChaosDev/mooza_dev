import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null; stack: string | null }
> {
  state = { error: null, stack: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    this.setState({ stack: info.componentStack ?? null });
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#f8fafc', fontFamily: 'sans-serif', padding: '2rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Что-то пошло не так</h1>
          <pre style={{ fontSize: '0.75rem', color: '#94a3b8', maxWidth: '700px', whiteSpace: 'pre-wrap', textAlign: 'left' }}>
            {(this.state.error as Error).message}
            {this.state.stack ? '\n\nComponent stack:' + this.state.stack : ''}
          </pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: '1.5rem', padding: '0.5rem 1.5rem', background: '#6366f1', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}>
            Перезагрузить
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
