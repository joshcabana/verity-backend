import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Chat } from './Chat';
import { renderWithProviders } from '../test/testUtils';
import { HttpResponse, http, server } from '../test/setup';

const API_URL = 'http://localhost:3000';
const trackEventMock = vi.fn();

type SocketHandler = (payload: unknown) => void;

const socketHandlers = new Map<string, Set<SocketHandler>>();

const socketMock = {
  on: vi.fn((event: string, handler: SocketHandler) => {
    const existing = socketHandlers.get(event) ?? new Set<SocketHandler>();
    existing.add(handler);
    socketHandlers.set(event, existing);
    return socketMock;
  }),
  off: vi.fn((event: string, handler: SocketHandler) => {
    socketHandlers.get(event)?.delete(handler);
    return socketMock;
  }),
};

function emitSocket(event: string, payload: unknown) {
  const handlers = socketHandlers.get(event);
  if (!handlers) {
    return;
  }
  for (const handler of handlers) {
    handler(payload);
  }
}

vi.mock('../analytics/events', () => ({
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    token: 'token',
    userId: 'user-1',
  }),
}));

vi.mock('../hooks/useFlags', () => ({
  useFlags: () => ({
    flags: {
      onboardingVariant: 'control',
      sessionDurationSeconds: 45,
      reportDialogEnabled: false,
    },
  }),
}));

vi.mock('../hooks/useSocket', () => ({
  useSocket: () => socketMock,
}));

describe('Chat', () => {
  beforeEach(() => {
    trackEventMock.mockReset();
    socketMock.on.mockClear();
    socketMock.off.mockClear();
    socketHandlers.clear();

    server.use(
      http.get(`${API_URL}/matches/:matchId/reveal`, ({ params }) =>
        HttpResponse.json({
          matchId: String(params.matchId),
          partnerRevealVersion: 1,
          partnerReveal: {
            id: 'user-2',
            displayName: 'Alex',
            primaryPhotoUrl: 'https://example.com/alex.jpg',
            age: 28,
            bio: 'Coffee and coastlines.',
          },
          revealAcknowledged: true,
          revealAcknowledgedAt: '2025-01-01T00:00:00.000Z',
        }),
      ),
      http.post(`${API_URL}/matches/:matchId/reveal-ack`, ({ params }) =>
        HttpResponse.json({
          matchId: String(params.matchId),
          partnerRevealVersion: 1,
          partnerReveal: {
            id: 'user-2',
            displayName: 'Alex',
            primaryPhotoUrl: 'https://example.com/alex.jpg',
            age: 28,
            bio: 'Coffee and coastlines.',
          },
          revealAcknowledged: true,
          revealAcknowledgedAt: '2025-01-01T00:00:00.000Z',
        }),
      ),
      http.get(`${API_URL}/matches/:matchId/messages`, () =>
        HttpResponse.json([
          {
            id: 'msg-1',
            matchId: 'match-1',
            senderId: 'user-2',
            text: 'Hello there',
            createdAt: '2025-01-01T00:00:00.000Z',
          },
        ]),
      ),
      http.get(`${API_URL}/matches`, () =>
        HttpResponse.json([
          {
            matchId: 'match-1',
            partnerRevealVersion: 1,
            revealAcknowledged: true,
            revealAcknowledgedAt: '2025-01-01T00:00:00.000Z',
            partnerReveal: {
              id: 'user-2',
              displayName: 'Alex',
              primaryPhotoUrl: 'https://example.com/alex.jpg',
              age: 28,
              bio: 'Coffee and coastlines.',
            },
          },
        ]),
      ),
      http.post(
        `${API_URL}/matches/:matchId/messages`,
        async ({ request, params }) => {
          const body = (await request.json()) as { text: string };
          return HttpResponse.json({
            id: 'msg-2',
            matchId: String(params.matchId),
            senderId: 'user-1',
            text: body.text,
            createdAt: '2025-01-01T00:00:05.000Z',
          });
        },
      ),
      http.post(`${API_URL}/moderation/blocks`, () =>
        HttpResponse.json({ status: 'blocked' }),
      ),
    );
  });

  it('renders message history from the API', async () => {
    renderWithProviders(<Chat />, {
      route: '/chat/match-1',
      path: '/chat/:matchId',
    });

    await waitFor(() => {
      expect(screen.getByText('Hello there')).toBeInTheDocument();
    });
  });

  it('sends a message, applies optimistic UI, and clears the input', async () => {
    let releaseSend: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseSend = resolve;
    });

    server.use(
      http.post(
        `${API_URL}/matches/:matchId/messages`,
        async ({ request, params }) => {
          const body = (await request.json()) as { text: string };
          await gate;
          return HttpResponse.json({
            id: 'msg-2',
            matchId: String(params.matchId),
            senderId: 'user-1',
            text: body.text,
            createdAt: '2025-01-01T00:00:05.000Z',
          });
        },
      ),
    );

    renderWithProviders(<Chat />, {
      route: '/chat/match-1',
      path: '/chat/:matchId',
    });

    await screen.findByText('Hello there');

    const input = screen.getByPlaceholderText(/say something kind/i);
    fireEvent.change(input, { target: { value: 'Hey!' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('Hey!')).toBeInTheDocument();
    });

    releaseSend();

    await waitFor(() => {
      expect(trackEventMock).toHaveBeenCalledWith('message_sent', {
        matchId: 'match-1',
      });
    });

    expect(screen.getAllByText('Hey!')).toHaveLength(1);
  });

  it('adds incoming messages from the chat socket', async () => {
    server.use(
      http.get(`${API_URL}/matches/:matchId/messages`, () =>
        HttpResponse.json([]),
      ),
    );

    renderWithProviders(<Chat />, {
      route: '/chat/match-1',
      path: '/chat/:matchId',
    });

    await screen.findByText(/chat with alex/i);

    act(() => {
      emitSocket('message:new', {
        id: 'msg-3',
        matchId: 'match-1',
        senderId: 'user-2',
        text: 'Real-time hello',
        createdAt: '2025-01-01T00:00:10.000Z',
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Real-time hello')).toBeInTheDocument();
    });
  });

  it('keeps chat locked until reveal is acknowledged', async () => {
    let messagesRequested = false;

    server.use(
      http.get(`${API_URL}/matches/:matchId/reveal`, ({ params }) =>
        HttpResponse.json({
          matchId: String(params.matchId),
          partnerRevealVersion: 1,
          partnerReveal: {
            id: 'user-2',
            displayName: 'Alex',
            primaryPhotoUrl: 'https://example.com/alex.jpg',
            age: 28,
            bio: 'Coffee and coastlines.',
          },
          revealAcknowledged: false,
          revealAcknowledgedAt: null,
        }),
      ),
      http.get(`${API_URL}/matches/:matchId/messages`, () => {
        messagesRequested = true;
        return HttpResponse.json([
          {
            id: 'msg-1',
            matchId: 'match-1',
            senderId: 'user-2',
            text: 'Hello there',
            createdAt: '2025-01-01T00:00:00.000Z',
          },
        ]);
      }),
    );

    renderWithProviders(<Chat />, {
      route: '/chat/match-1',
      path: '/chat/:matchId',
    });

    await screen.findByText(/review profile to unlock chat/i);
    expect(messagesRequested).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /continue to chat/i }));

    await waitFor(() => {
      expect(screen.getByText('Hello there')).toBeInTheDocument();
    });
  });
});
