import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './hooks/useAuth';
import { App } from './App';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

function startTelemetry() {
  const boot = () => {
    void Promise.all([
      import('./monitoring/errors'),
      import('./monitoring/webVitals'),
    ]).then(([errorsModule, vitalsModule]) => {
      errorsModule.startGlobalErrorTracking();
      vitalsModule.startWebVitals();
    });
  };

  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    const requestIdle = window.requestIdleCallback as (
      callback: IdleRequestCallback,
      options?: IdleRequestOptions,
    ) => number;
    requestIdle(() => boot(), { timeout: 2000 });
    return;
  }

  globalThis.setTimeout(boot, 0);
}

const container = document.getElementById('root');
if (container) {
  startTelemetry();
  createRoot(container).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter
            future={{
              v7_startTransition: true,
              v7_relativeSplatPath: true,
            }}
          >
            <App />
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}
