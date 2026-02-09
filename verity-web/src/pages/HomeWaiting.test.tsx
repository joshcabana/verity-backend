import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Home } from './Home';
import { Waiting } from './Waiting';
import { renderWithProviders } from '../test/testUtils';

const navigateMock = vi.fn();
const apiJsonMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>(
      'react-router-dom',
    );
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('../api/client', () => ({
  apiJson: (...args: unknown[]) => apiJsonMock(...args),
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    token: 'test-token',
  }),
}));

vi.mock('../hooks/useSocket', () => ({
  useSocket: () => null,
}));

describe('Home and Waiting queue flow', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    apiJsonMock.mockReset();
  });

  it('joins queue after balance load', async () => {
    apiJsonMock.mockImplementation(async (path: string) => {
      if (path === '/tokens/balance') {
        return { ok: true, status: 200, data: { tokenBalance: 2 } };
      }
      if (path === '/queue/join') {
        return { ok: true, status: 201, data: { queueKey: 'q1' } };
      }
      return { ok: false, status: 500, data: null };
    });

    renderWithProviders(<Home />, { route: '/home', path: '/home' });

    await screen.findByText('2 tokens');
    fireEvent.click(screen.getByRole('button', { name: /join queue/i }));

    await waitFor(() => {
      expect(apiJsonMock).toHaveBeenCalledWith('/queue/join', {
        method: 'POST',
        body: { city: 'canberra', preferences: {} },
      });
      expect(navigateMock).toHaveBeenCalledWith('/waiting');
    });
  });

  it('leaves queue from waiting screen', async () => {
    apiJsonMock.mockResolvedValue({ ok: true, status: 200, data: {} });

    renderWithProviders(<Waiting />, { route: '/waiting', path: '/waiting' });

    fireEvent.click(screen.getByRole('button', { name: /leave queue/i }));

    await waitFor(() => {
      expect(apiJsonMock).toHaveBeenCalledWith('/queue/leave', {
        method: 'DELETE',
      });
      expect(navigateMock).toHaveBeenCalledWith('/home');
    });
  });
});
