import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Chat } from './Chat';
import { renderWithProviders } from '../test/testUtils';

const apiJsonMock = vi.fn();

vi.mock('../api/client', () => ({
  apiJson: (...args: unknown[]) => apiJsonMock(...args),
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    token: 'token',
    userId: 'user-1',
  }),
}));

vi.mock('../hooks/useSocket', () => ({
  useSocket: () => null,
}));

describe('Chat', () => {
  beforeEach(() => {
    apiJsonMock.mockReset();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('restores draft and shows error when send fails', async () => {
    apiJsonMock.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === '/matches/m1/messages' && (!options || options.method === undefined)) {
        return {
          ok: true,
          status: 200,
          data: [
            {
              id: 'msg-1',
              matchId: 'm1',
              senderId: 'user-2',
              text: 'Hi there',
              createdAt: '2026-02-06T00:00:00.000Z',
            },
          ],
        };
      }
      if (path === '/matches') {
        return {
          ok: true,
          status: 200,
          data: [{ id: 'm1', partner: { id: 'user-2', displayName: 'Alex' } }],
        };
      }
      if (path === '/matches/m1/messages' && options?.method === 'POST') {
        return { ok: false, status: 500, data: null };
      }
      if (path === '/moderation/blocks' && options?.method === 'POST') {
        return { ok: true, status: 201, data: { status: 'blocked' } };
      }
      return { ok: false, status: 404, data: null };
    });

    renderWithProviders(<Chat />, { route: '/chat/m1', path: '/chat/:matchId' });

    await screen.findByText(/chat with alex/i);
    const input = screen.getByPlaceholderText(/say something kind/i);
    fireEvent.change(input, { target: { value: 'Hello world' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('Hello world')).toBeInTheDocument();
    });
    expect(
      screen.getByText(/unable to send message. try again/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /block/i }));
    await waitFor(() => {
      expect(
        screen.getByText(/chat is unavailable because one of you has blocked the other/i),
      ).toBeInTheDocument();
    });
  });
});
