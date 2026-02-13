import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Settings } from './Settings';
import { renderWithProviders } from '../test/testUtils';

const apiJsonMock = vi.fn();

vi.mock('../api/client', () => ({
  apiJson: (...args: unknown[]) => apiJsonMock(...args),
}));

const deleteAccountMock = vi.fn();
const signOutMock = vi.fn();

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    deleteAccount: deleteAccountMock,
    signOut: signOutMock,
  }),
}));

describe('Settings', () => {
  beforeEach(() => {
    apiJsonMock.mockReset();
    deleteAccountMock.mockReset();
    signOutMock.mockReset();
  });

  it('lists blocked users and unblocks one', async () => {
    apiJsonMock.mockImplementation(
      async (path: string, options?: { method?: string }) => {
        if (
          path === '/moderation/blocks' &&
          (!options || options.method === undefined)
        ) {
          return {
            ok: true,
            status: 200,
            data: [
              {
                id: 'block-1',
                blockedUserId: 'user-2',
                createdAt: '2026-02-06T00:00:00.000Z',
              },
            ],
          };
        }
        if (
          path === '/moderation/blocks/user-2' &&
          options?.method === 'DELETE'
        ) {
          return {
            ok: true,
            status: 200,
            data: { status: 'unblocked' },
          };
        }
        if (path === '/users/me/export') {
          return { ok: true, status: 200, data: { ok: true } };
        }
        return { ok: false, status: 404, data: null };
      },
    );

    renderWithProviders(<Settings />, {
      route: '/settings',
      path: '/settings',
    });

    await screen.findByText(/user-2/i);
    fireEvent.click(screen.getByRole('button', { name: /unblock/i }));

    await waitFor(() => {
      expect(apiJsonMock).toHaveBeenCalledWith('/moderation/blocks/user-2', {
        method: 'DELETE',
      });
    });
  });
});
