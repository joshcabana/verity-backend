import { onCLS, onINP, onLCP, type Metric } from 'web-vitals';

const VITALS_ENDPOINT = import.meta.env.VITE_WEB_VITALS_ENDPOINT as
  | string
  | undefined;

function publish(metric: Metric) {
  if (!VITALS_ENDPOINT) {
    if (import.meta.env.DEV) {
      console.info('[web-vitals]', metric.name, metric.value);
    }
    return;
  }

  void fetch(VITALS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: metric.name,
      value: metric.value,
      id: metric.id,
      rating: metric.rating,
      timestamp: Date.now(),
      path: window.location.pathname,
    }),
    keepalive: true,
  }).catch(() => undefined);
}

export function startWebVitals() {
  onCLS(publish);
  onINP(publish);
  onLCP(publish);
}
