import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Linking } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import TokenShopScreen from '../../src/screens/TokenShopScreen';
import type { RootStackParamList } from '../../src/navigation/AppNavigator';

const mockSetUser = jest.fn();
const mockLogout = jest.fn();
const mockUser = { id: 'user-1', tokenBalance: 2 };

jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({
    token: 'token',
    user: mockUser,
    setUser: mockSetUser,
    logout: mockLogout,
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

const mockApiJson = jest.fn();
jest.mock('../../src/services/api', () => ({
  apiJson: (...args: unknown[]) => mockApiJson(...args),
}));

const Stack = createNativeStackNavigator<RootStackParamList>();

function TestNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="TokenShop" component={TokenShopScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

describe('Token purchase flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as any);
  });

  it('starts checkout for a selected token pack', async () => {
    mockApiJson.mockImplementation((path: string) => {
      if (path === '/tokens/balance') {
        return Promise.resolve({
          ok: true,
          status: 200,
          data: { tokenBalance: 2 },
        });
      }
      if (path === '/tokens/purchase') {
        return Promise.resolve({
          ok: true,
          status: 200,
          data: { checkoutUrl: 'https://checkout.example.com' },
        });
      }
      return Promise.resolve({ ok: true, status: 200, data: {} });
    });

    const { getByTestId } = render(<TestNavigator />);

    fireEvent.press(getByTestId('token-pack-buy-starter'));

    await waitFor(() =>
      expect(mockApiJson).toHaveBeenCalledWith(
        '/tokens/purchase',
        expect.objectContaining({ method: 'POST' }),
      ),
    );

    await waitFor(() =>
      expect(Linking.openURL).toHaveBeenCalledWith('https://checkout.example.com'),
    );
  });

  it('refreshes balance on demand', async () => {
    mockApiJson.mockResolvedValue({
      ok: true,
      status: 200,
      data: { tokenBalance: 5 },
    });

    const { getByTestId } = render(<TestNavigator />);

    await waitFor(() =>
      expect(mockApiJson).toHaveBeenCalledWith(
        '/tokens/balance',
        expect.objectContaining({ method: 'GET' }),
      ),
    );

    await waitFor(() => expect(getByTestId('token-balance-refresh')).toBeTruthy());

    fireEvent.press(getByTestId('token-balance-refresh'));

    await waitFor(() => expect(mockApiJson).toHaveBeenCalledTimes(2));
  });
});
