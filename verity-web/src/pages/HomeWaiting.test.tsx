import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Home } from './Home';
import { Waiting } from './Waiting';
import { renderWithProviders } from '../test/testUtils';

const navigateMock = vi.fn();
const apiJsonMock = vi.fn();
const trackEventMock = vi.fn();
const socketHandlers = new Map<string, Array<(payload: any) => void>>();

const socketMock = {
  on: vi.fn((event: string, handler: (payload: any) => void) => {
    const handlers = socketHandlers.get(event) ?? [];
    handlers.push(handler);
    socketHandlers.set(event, handlers);
  }),
  off: vi.fn((event: string, handler?: (payload: any) => void) => {
    if (!socketHandlers.has(event)) {
      return;
    }
    if (!handler) {
      socketHandlers.delete(event);
      return;
    }
    const next = (socketHandlers.get(event) ?? []).filter(
      (fn) => fn !== handler,
    );
    if (next.length > 0) {
      socketHandlers.set(event, next);
      return;
    }
    socketHandlers.delete(event);
  }),
};

const emitSocket = (event: string, payload: unknown) => {
  for (const handler of socketHandlers.get(event) ?? []) {
    handler(payload);
  }
};

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
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  apiJson: (...args: unknown[]) => apiJsonMock(...args),
}));

vi.mock('../analytics/events', () => ({
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    token: 'test-token',
  }),
}));

vi.mock('../hooks/useSocket', () => ({
  useSocket: () => socketMock,
}));

describe('Home and Waiting queue flow', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    apiJsonMock.mockReset();
    trackEventMock.mockReset();
    socketHandlers.clear();
    socketMock.on.mockClear();
    socketMock.off.mockClear();
  });

  it('joins queue after balance load', async () => {
    apiJsonMock.mockImplementation(async (path: string) => {
      await Promise.resolve();
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
    fireEvent.click(screen.getAllByRole('button', { name: /go live now/i })[0]);

    await waitFor(() => {
      expect(apiJsonMock).toHaveBeenCalledWith('/queue/join', {
        method: 'POST',
        body: { city: 'canberra', preferences: {} },
      });
      expect(navigateMock).toHaveBeenCalledWith('/waiting', {
        state: { queueKey: 'q1' },
      });
    });
  });

  it('leaves queue from waiting screen', async () => {
    apiJsonMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { refunded: true },
    });

    renderWithProviders(<Waiting />, { route: '/waiting', path: '/waiting' });

    fireEvent.click(screen.getByRole('button', { name: /leave queue/i }));

    await waitFor(() => {
      expect(apiJsonMock).toHaveBeenCalledWith('/queue/leave', {
        method: 'DELETE',
      });
      expect(navigateMock).toHaveBeenCalledWith('/home');
    });
  });

  it('shows live queue status from queue:status events', async () => {
    renderWithProviders(<Waiting />, { route: '/waiting', path: '/waiting' });

    expect(
      screen.getByText(/hang tight - matching fast\./i),
    ).toBeInTheDocument();

    await waitFor(() =>
      expect(socketMock.on).toHaveBeenCalledWith(
        'queue:status',
        expect.any(Function),
      ),
    );

    emitSocket('queue:status', { usersSearching: 11 });

    await waitFor(() =>
      expect(screen.getByText(/11 users currently searching/i)).toBeTruthy(),
    );
  });

  it('shows queue estimate copy when queue:estimate payload arrives', async () => {
    renderWithProviders(<Waiting />, { route: '/waiting', path: '/waiting' });

    await waitFor(() =>
      expect(socketMock.on).toHaveBeenCalledWith(
        'queue:estimate',
        expect.any(Function),
      ),
    );

    emitSocket('queue:estimate', { estimatedSeconds: 18 });

    await waitFor(() =>
      expect(screen.getByText(/estimated wait: 18s/i)).toBeTruthy(),
    );
  });

  it('navigates once for duplicate match events on the same session', async () => {
    renderWithProviders(<Waiting />, { route: '/waiting', path: '/waiting' });

    await waitFor(() =>
      expect(socketMock.on).toHaveBeenCalledWith('match', expect.any(Function)),
    );

    const payload = {
      sessionId: 'session-1',
      partnerId: 'partner-1',
      queueKey: 'queue-1',
      matchedAt: new Date().toISOString(),
    };

    emitSocket('match', payload);
    emitSocket('match', payload);

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/session/session-1', {
        state: payload,
      }),
    );
    expect(
      navigateMock.mock.calls.filter((call) => call[0] === '/session/session-1')
        .length,
    ).toBe(1);
    expect(trackEventMock).toHaveBeenCalledTimes(1);
  });

  it('shows timeout prompt after threshold and tracks timeout_shown', async () => {
    vi.useFakeTimers();
    try {
      renderWithProviders(<Waiting />, { route: '/waiting', path: '/waiting' });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(46_000);
      });

      expect(screen.getByText(/no one nearby yet/i)).toBeInTheDocument();
      expect(trackEventMock).toHaveBeenCalledWith(
        'queue_timeout_shown',
        expect.objectContaining({
          queueKey: '',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          elapsedSeconds: expect.any(Number),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('tracks timeout continue and hides prompt', async () => {
    vi.useFakeTimers();
    try {
      renderWithProviders(<Waiting />, { route: '/waiting', path: '/waiting' });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(46_000);
      });

      fireEvent.click(screen.getByRole('button', { name: /keep searching/i }));

      expect(trackEventMock).toHaveBeenCalledWith(
        'queue_timeout_continue',
        expect.objectContaining({
          queueKey: '',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          elapsedSeconds: expect.any(Number),
        }),
      );
      expect(screen.queryByText(/no one nearby yet/i)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('tracks timeout leave outcome and navigates home', async () => {
    vi.useFakeTimers();
    try {
      apiJsonMock.mockResolvedValue({
        ok: true,
        status: 200,
        data: { refunded: true, queueKey: 'queue-1' },
      });

      renderWithProviders(<Waiting />, { route: '/waiting', path: '/waiting' });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(46_000);
      });
      fireEvent.click(
        screen.getAllByRole('button', { name: /leave queue/i })[0],
      );

      await Promise.resolve();
      await Promise.resolve();

      expect(trackEventMock).toHaveBeenCalledWith(
        'queue_timeout_leave',
        expect.objectContaining({
          queueKey: 'queue-1',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          elapsedSeconds: expect.any(Number),
          refunded: true,
        }),
      );
      expect(navigateMock).toHaveBeenCalledWith('/home');
    } finally {
      vi.useRealTimers();
    }
  });
});
