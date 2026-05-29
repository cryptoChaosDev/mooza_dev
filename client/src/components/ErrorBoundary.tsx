import { Component, ErrorInfo, ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4 text-center">
          <div className="text-5xl mb-4">😕</div>
          <h1 className="text-xl font-bold text-white mb-2">Что-то пошло не так</h1>
          <p className="text-slate-400 text-sm mb-6">Обновите страницу или попробуйте позже</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-primary-600 hover:bg-primary-500 text-white rounded-2xl font-medium transition-colors"
          >
            Обновить страницу
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
