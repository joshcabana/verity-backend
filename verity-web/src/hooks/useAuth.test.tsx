import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './useAuth';

const apiJsonMock = vi.fn();
let accessTokenState: string | null = null;

const localStorageData = new Map<string, string>();
const localStorageMock: Storage = {
  getItem: (key: string) => localStorageData.get(key) ?? null,
  setItem: (key: string, value: string) => {
    localStorageData.set(key, String(value));
  },
  removeItem: (key: string) => {
    localStorageData.delete(key);
  },
  clear: () => {
    localStorageData.clear();
  },
  key: (index: number) => Array.from(localStorageData.keys())[index] ?? null,
  get length() {
    return localStorageData.size;
  },
};

vi.mock('../api/client', () => ({
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  apiJson: (...args: unknown[]) => apiJsonMock(...args),
  decodeToken: (token: string) => {
    try {
      const payload = token.split('.')[1];
      if (!payload) {
        return {};
      }
      return JSON.parse(atob(payload)) as { sub?: string };
    } catch {
      return {};
    }
  },
  getAccessToken: () => accessTokenState,
  setAccessToken: (token: string | null) => {
    accessTokenState = token;
    if (token) {
      localStorageMock.setItem('verity_access_token', token);
    } else {
      localStorageMock.removeItem('verity_access_token');
    }
  },
}));

function authToken(userId: string) {
  const payload = btoa(JSON.stringify({ sub: userId }));
  return `x.${payload}.y`;
}

const Probe: React.FC = () => {
  const { signOut, userId } = useAuth();
  return (
    <div>
      <button onClick={signOut}>Sign out</button>
      <span data-testid="user-id">{userId}</span>
    </div>
  );
};

describe('useAuth', () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: localStorageMock,
    });
  });

  beforeEach(() => {
    localStorage.clear();
    accessTokenState = null;
    apiJsonMock.mockReset();
    apiJsonMock.mockResolvedValue({ ok: true, status: 200, data: {} });
  });

  it('registers web push token when authenticated', async () => {
    const token = authToken('user-1');
    localStorage.setItem('verity_access_token', token);
    accessTokenState = token;
    localStorage.setItem('verity_web_push_token', 'web-token-123456');

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(apiJsonMock).toHaveBeenCalledWith('/notifications/tokens', {
        method: 'POST',
        body: {
          token: 'web-token-123456',
          platform: 'WEB',
          deviceId: expect.any(String),
        },
      });
    });
  });

  it('logs out server session, revokes token, and clears access token', async () => {
    const token = authToken('user-1');
    localStorage.setItem('verity_access_token', token);
    accessTokenState = token;
    localStorage.setItem('verity_web_push_token', 'web-token-654321');

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));

    await waitFor(() => {
      expect(apiJsonMock).toHaveBeenCalledWith('/auth/logout-all', {
        method: 'POST',
      });
      expect(apiJsonMock).toHaveBeenCalledWith('/notifications/tokens', {
        method: 'DELETE',
        body: { token: 'web-token-654321' },
      });
    });
    expect(localStorage.getItem('verity_access_token')).toBeNull();
  });
});
