import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import HomeScreen from '../../src/screens/HomeScreen';
import WaitingScreen from '../../src/screens/WaitingScreen';

const mockJoinQueue = jest.fn().mockResolvedValue(undefined);
const mockLeaveQueue = jest.fn().mockResolvedValue(false);
const mockMarkTokenSpent = jest.fn();
const mockSetUser = jest.fn();

jest.mock('../../src/hooks/useQueue', () => ({
  useQueue: () => ({
    status: 'idle',
    estimatedSeconds: 12,
    usersSearching: null,
    queueKey: null,
    match: null,
    joinQueue: mockJoinQueue,
    leaveQueue: mockLeaveQueue,
    markTokenSpent: mockMarkTokenSpent,
  }),
}));

jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', tokenBalance: 2 },
    setUser: mockSetUser,
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
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Waiting" component={WaitingScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

describe('Queue flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('joins the queue and navigates to waiting', async () => {
    const { getByText, getAllByText } = render(<TestNavigator />);

    fireEvent.press(getAllByText('Go Live Now')[0]);

    await waitFor(() => expect(mockJoinQueue).toHaveBeenCalledWith('au'));
    await waitFor(() => expect(mockSetUser).toHaveBeenCalled());
    await waitFor(() => expect(getByText('Finding match...')).toBeTruthy());
  });
});
