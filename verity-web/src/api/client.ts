const API_URL =
  import.meta.env.VITE_API_URL ??
  (import.meta.env.DEV
    ? 'http://localhost:3000'
    : typeof window !== 'undefined'
      ? window.location.origin
      : 'http://localhost:3000');
const WS_URL = import.meta.env.VITE_WS_URL ?? API_URL;

const TOKEN_KEY = 'verity_access_token';

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function refreshAccessToken(): Promise<string | null> {
  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) {
    return null;
  }
  const data = (await response.json()) as { accessToken?: string };
  if (!data.accessToken) {
    return null;
  }
  setAccessToken(data.accessToken);
  return data.accessToken;
}

export async function apiFetch(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<Response> {
  const token = getAccessToken();
  const headers = new Headers(options.headers ?? undefined);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (response.status === 401 && retry) {
    const nextToken = await refreshAccessToken();
    if (nextToken) {
      return apiFetch(path, options, false);
    }
  }

  return response;
}

type ApiJsonOptions = Omit<RequestInit, 'body'> & {
  body?: BodyInit | Record<string, unknown> | null;
};

export async function apiJson<T>(
  path: string,
  options: ApiJsonOptions = {},
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const headers = new Headers(options.headers ?? undefined);
  let body: BodyInit | null | undefined;

  if (
    options.body &&
    typeof options.body !== 'string' &&
    !(options.body instanceof Blob) &&
    !(options.body instanceof FormData) &&
    !(options.body instanceof URLSearchParams)
  ) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.body);
  } else {
    body = options.body as BodyInit | null | undefined;
  }

  const response = await apiFetch(path, { ...options, headers, body });
  let data: T | null = null;
  try {
    data = (await response.json()) as T;
  } catch {
    data = null;
  }
  return { ok: response.ok, status: response.status, data };
}

export function getAdminKey(): string | null {
  return localStorage.getItem('verity_admin_key');
}

export function setAdminKey(value: string | null) {
  if (value && value.trim().length > 0) {
    localStorage.setItem('verity_admin_key', value.trim());
  } else {
    localStorage.removeItem('verity_admin_key');
  }
}

export function decodeToken(token: string): { sub?: string } {
  try {
    const payload = token.split('.')[1];
    if (!payload) {
      return {};
    }
    const decoded = JSON.parse(atob(payload)) as { sub?: string };
    return decoded;
  } catch {
    return {};
  }
}

export function socketUrl(namespace: string) {
  return `${WS_URL}${namespace}`;
}

export { API_URL, WS_URL };
