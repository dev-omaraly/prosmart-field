import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { AuthProvider } from './auth';
import App from './App';
import { startOfflineSync } from './lib/offline';

class Boundary extends Component<{ children: ReactNode }, { e: Error | null }> {
  state = { e: null as Error | null };
  static getDerivedStateFromError(e: Error) {
    return { e };
  }
  render() {
    return this.state.e ? (
      <pre style={{ padding: 16, whiteSpace: 'pre-wrap', direction: 'ltr', color: '#ffb4b4' }}>
        {String(this.state.e.stack || this.state.e)}
      </pre>
    ) : (
      this.props.children
    );
  }
}

startOfflineSync();
const root = document.getElementById('root')!;
root.dataset.ok = '1';
createRoot(root).render(
  <StrictMode>
    <Boundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </Boundary>
  </StrictMode>,
);
