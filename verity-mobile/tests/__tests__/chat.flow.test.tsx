import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { fireEvent, render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ChatScreen from '../../src/screens/chat/ChatScreen';

const mockMutateAsync = jest.fn().mockResolvedValue({});

jest.mock('../../src/queries/useChatQuery', () => ({
  useChatQuery: () => ({
    data: [
      {
        id: 'msg-1',
        matchId: 'match-1',
        senderId: 'user-1',
        text: 'Hello there',
        createdAt: new Date().toISOString(),
      },
    ],
    isFetching: false,
  }),
  useMatchRevealQuery: () => ({
    data: {
      matchId: 'match-1',
      partnerRevealVersion: 1,
      partnerReveal: {
        id: 'user-2',
        displayName: 'Avery',
        primaryPhotoUrl: 'https://example.com/photo.jpg',
        age: 26,
        bio: 'Coffee and coastlines.',
      },
      revealAcknowledged: true,
      revealAcknowledgedAt: '2025-01-01T00:00:00.000Z',
    },
    isLoading: false,
    isError: false,
  }),
  useSendMessageMutation: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
  }),
}));

jest.mock('../../src/hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    lastMessage: null,
  }),
}));

jest.mock('../../src/theme/ThemeProvider', () => ({
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

const Stack = createNativeStackNavigator();

function TestNavigator() {
  const client = new QueryClient();
  return (
    <QueryClientProvider client={client}>
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen
            name="Chat"
            component={ChatScreen}
            initialParams={{ matchId: 'match-1' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </QueryClientProvider>
  );
}

describe('Chat flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders message history', () => {
    const { getByText } = render(<TestNavigator />);
    expect(getByText('Hello there')).toBeTruthy();
  });

  it('sends a message', () => {
    const { getByPlaceholderText, getByText } = render(<TestNavigator />);
    fireEvent.changeText(getByPlaceholderText('Type a message'), 'Hey!');
    fireEvent.press(getByText('Send'));
    expect(mockMutateAsync).toHaveBeenCalledWith('Hey!');
  });
});
