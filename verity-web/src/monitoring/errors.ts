const ERROR_ENDPOINT = import.meta.env.VITE_FRONTEND_ERROR_ENDPOINT as
  | string
  | undefined;

function report(payload: Record<string, unknown>) {
  if (!ERROR_ENDPOINT) {
    console.error('[frontend-error]', payload);
    return;
  }

  void fetch(ERROR_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => undefined);
}

export function startGlobalErrorTracking() {
  window.addEventListener('error', (event) => {
    report({
      type: 'error',
      message: event.message,
      source: event.filename,
      line: event.lineno,
      column: event.colno,
      stack: event.error instanceof Error ? event.error.stack : undefined,
      path: window.location.pathname,
      timestamp: Date.now(),
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    report({
      type: 'unhandledrejection',
      reason:
        event.reason instanceof Error
          ? event.reason.message
          : String(event.reason),
      stack: event.reason instanceof Error ? event.reason.stack : undefined,
      path: window.location.pathname,
      timestamp: Date.now(),
    });
  });
}
