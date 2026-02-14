import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Chat } from './Chat';
import { renderWithProviders } from '../test/testUtils';

const trackEventMock = vi.fn();
const apiJsonMock = vi.fn();

type SocketHandler = (payload: unknown) => void;

type PartnerReveal = {
  id: string;
  displayName: string;
  primaryPhotoUrl: string;
  age: number;
  bio: string;
};

type ChatApiOptions = {
  revealAcknowledged?: boolean;
  messages?: Array<{
    id: string;
    matchId: string;
    senderId: string;
    text: string;
    createdAt: string;
  }>;
  onMessagesRequest?: () => void;
  onPostMessage?: (text: string) => Promise<unknown>;
};

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

const defaultPartnerReveal: PartnerReveal = {
  id: 'user-2',
  displayName: 'Alex',
  primaryPhotoUrl: 'https://example.com/alex.jpg',
  age: 28,
  bio: 'Coffee and coastlines.',
};

function mockChatApi({
  revealAcknowledged = true,
  messages = [
    {
      id: 'msg-1',
      matchId: 'match-1',
      senderId: 'user-2',
      text: 'Hello there',
      createdAt: '2025-01-01T00:00:00.000Z',
    },
  ],
  onMessagesRequest,
  onPostMessage,
}: ChatApiOptions = {}) {
  apiJsonMock.mockImplementation(
    async (
      path: string,
      options?: { method?: string; body?: { text?: string } },
    ) => {
      const method = options?.method ?? 'GET';

      if (path === '/matches/match-1/reveal' && method === 'GET') {
        return {
          ok: true,
          status: 200,
          data: {
            matchId: 'match-1',
            partnerRevealVersion: 1,
            partnerReveal: defaultPartnerReveal,
            revealAcknowledged,
            revealAcknowledgedAt: revealAcknowledged
              ? '2025-01-01T00:00:00.000Z'
              : null,
          },
        };
      }

      if (path === '/matches/match-1/reveal-ack' && method === 'POST') {
        return {
          ok: true,
          status: 200,
          data: {
            matchId: 'match-1',
            partnerRevealVersion: 1,
            partnerReveal: defaultPartnerReveal,
            revealAcknowledged: true,
            revealAcknowledgedAt: '2025-01-01T00:00:00.000Z',
          },
        };
      }

      if (path === '/matches/match-1/messages' && method === 'GET') {
        onMessagesRequest?.();
        return {
          ok: true,
          status: 200,
          data: messages,
        };
      }

      if (path === '/matches/match-1/messages' && method === 'POST') {
        const text = options?.body?.text ?? '';
        if (onPostMessage) {
          const data = await onPostMessage(text);
          return { ok: true, status: 200, data };
        }
        return {
          ok: true,
          status: 200,
          data: {
            id: 'msg-2',
            matchId: 'match-1',
            senderId: 'user-1',
            text,
            createdAt: '2025-01-01T00:00:05.000Z',
          },
        };
      }

      if (path === '/matches' && method === 'GET') {
        return {
          ok: true,
          status: 200,
          data: [
            {
              matchId: 'match-1',
              partnerRevealVersion: 1,
              revealAcknowledged: true,
              revealAcknowledgedAt: '2025-01-01T00:00:00.000Z',
              partnerReveal: defaultPartnerReveal,
            },
          ],
        };
      }

      if (path === '/moderation/blocks' && method === 'POST') {
        return { ok: true, status: 200, data: { status: 'blocked' } };
      }

      return { ok: false, status: 500, data: null };
    },
  );
}

vi.mock('../analytics/events', () => ({
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));

vi.mock('../api/client', () => ({
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  apiJson: (...args: unknown[]) => apiJsonMock(...args),
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
    apiJsonMock.mockReset();
    socketMock.on.mockClear();
    socketMock.off.mockClear();
    socketHandlers.clear();
    mockChatApi();
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

    mockChatApi({
      onPostMessage: async (text) => {
        await gate;
        return {
          id: 'msg-2',
          matchId: 'match-1',
          senderId: 'user-1',
          text,
          createdAt: '2025-01-01T00:00:05.000Z',
        };
      },
    });

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
    mockChatApi({ messages: [] });

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

    mockChatApi({
      revealAcknowledged: false,
      onMessagesRequest: () => {
        messagesRequested = true;
      },
    });

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
