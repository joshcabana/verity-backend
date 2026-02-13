import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './useAuth';

const apiJsonMock = vi.fn();

vi.mock('../api/client', async () => {
  const actual =
    await vi.importActual<typeof import('../api/client')>('../api/client');
  return {
    ...actual,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    apiJson: (...args: unknown[]) => apiJsonMock(...args),
  };
});

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
  beforeEach(() => {
    localStorage.clear();
    apiJsonMock.mockReset();
    apiJsonMock.mockResolvedValue({ ok: true, status: 200, data: {} });
  });

  it('registers web push token when authenticated', async () => {
    localStorage.setItem('verity_access_token', authToken('user-1'));
    localStorage.setItem('verity_web_push_token', 'web-token-123456');

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(apiJsonMock).toHaveBeenCalledWith('/notifications/tokens', {
        method: 'POST',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        body: expect.objectContaining({
          token: 'web-token-123456',
          platform: 'WEB',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          deviceId: expect.any(String),
        }),
      });
    });
  });

  it('logs out server session, revokes token, and clears access token', async () => {
    localStorage.setItem('verity_access_token', authToken('user-1'));
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
