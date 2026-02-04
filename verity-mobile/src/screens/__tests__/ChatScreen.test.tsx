import React from 'react';
import { fireEvent, render, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ChatScreen from '../chat/ChatScreen';
import { useAuth } from '../../hooks/useAuth';
import { server, rest } from '../../../setupTests';

let lastMessage: {
  id: string;
  matchId: string;
  senderId: string;
  text: string;
  createdAt: string;
  receivedAt: number;
} | null = null;

let routeParams: Record<string, unknown> | undefined = { matchId: 'match-1' };

jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: routeParams }),
}));

jest.mock('../../hooks/useWebSocket', () => ({
  useWebSocket: () => ({ lastMessage }),
}));

jest.mock('../../theme/ThemeProvider', () => ({
  useTheme: () => ({
    mode: 'dark',
    colors: {
      background: '#0B0B10',
      card: '#16161D',
      text: '#FFFFFF',
      muted: '#9A9AB2',
      border: '#232332',
      primary: '#5A5AF2',
      danger: '#FF4D4D',
      dangerSoft: '#FFB3B3',
    },
    toggleMode: jest.fn(),
    setMode: jest.fn(),
  }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const API_URL = 'http://localhost:3000';

function renderChat() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const utils = render(
    <QueryClientProvider client={client}>
      <ChatScreen />
    </QueryClientProvider>,
  );

  return { ...utils, client };
}

describe('ChatScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lastMessage = null;
    routeParams = { matchId: 'match-1' };
    useAuth.setState((state) => ({
      ...state,
      token: 'token',
      user: { id: 'user-1' },
    }));

    server.use(
      rest.get(`${API_URL}/matches/:matchId/messages`, (_req, res, ctx) =>
        res(
          ctx.status(200),
          ctx.json([
            {
              id: 'msg-1',
              matchId: 'match-1',
              senderId: 'user-2',
              text: 'Hello there',
              createdAt: '2025-01-01T00:00:00.000Z',
            },
          ]),
        ),
      ),
      rest.post(`${API_URL}/matches/:matchId/messages`, (_req, res, ctx) =>
        res(
          ctx.status(200),
          ctx.json({
            id: 'msg-2',
            matchId: 'match-1',
            senderId: 'user-1',
            text: 'Hey!',
            createdAt: '2025-01-01T00:00:05.000Z',
          }),
        ),
      ),
    );
  });

  it('renders message history from the API', async () => {
    const { getByText } = renderChat();

    await waitFor(() => expect(getByText('Hello there')).toBeTruthy());
  });

  it('sends a message and clears the input', async () => {
    const { getByPlaceholderText, getByText } = renderChat();

    fireEvent.changeText(getByPlaceholderText('Type a message'), 'Hey!');
    fireEvent.press(getByText('Send'));

    await waitFor(() => expect(getByText('Hey!')).toBeTruthy());

    await waitFor(() =>
      expect(getByPlaceholderText('Type a message').props.value).toBe(''),
    );
  });

  it('adds incoming messages from the WebSocket event store', async () => {
    server.use(
      rest.get(`${API_URL}/matches/:matchId/messages`, (_req, res, ctx) =>
        res(ctx.status(200), ctx.json([])),
      ),
    );

    const { rerender, getByText, client } = renderChat();

    lastMessage = {
      id: 'msg-3',
      matchId: 'match-1',
      senderId: 'user-2',
      text: 'Real-time hello',
      createdAt: '2025-01-01T00:00:10.000Z',
      receivedAt: Date.now(),
    };

    act(() => {
      rerender(
        <QueryClientProvider client={client}>
          <ChatScreen />
        </QueryClientProvider>,
      );
    });

    await waitFor(() => expect(getByText('Real-time hello')).toBeTruthy());
  });
});
