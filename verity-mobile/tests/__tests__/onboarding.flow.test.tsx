import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import OnboardingStack from '../../src/navigation/OnboardingStack';

const mockSetToken = jest.fn();
const mockSetUser = jest.fn();
const mockLogout = jest.fn();
const mockApiJson = jest.fn();

jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({
    setToken: mockSetToken,
    setUser: mockSetUser,
    logout: mockLogout,
  }),
}));

jest.mock('../../src/services/api', () => ({
  apiJson: (...args: unknown[]) =>
    mockApiJson(...args),
}));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  launchImageLibraryAsync: jest.fn().mockResolvedValue({ canceled: true }),
  MediaTypeOptions: { Images: 'Images' },
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

describe('Onboarding flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('walks through onboarding and submits profile', async () => {
    mockApiJson
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { user: { id: 'user-1' }, accessToken: 'token-123' },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { displayName: 'Alex', age: 29 },
      });

    const { getByText, getByPlaceholderText, getByTestId } = render(
      <NavigationContainer>
        <OnboardingStack />
      </NavigationContainer>,
    );

    fireEvent.press(getByText('Get Started'));
    fireEvent.press(getByText('Next'));
    fireEvent.press(getByText('Next'));

    fireEvent.changeText(getByPlaceholderText('Display name'), 'Alex');
    fireEvent.changeText(getByPlaceholderText('Age'), '29');

    fireEvent.press(getByTestId('onboarding-submit'));

    await waitFor(() => expect(mockApiJson).toHaveBeenCalledTimes(2));
    expect(mockApiJson).toHaveBeenNthCalledWith(
      1,
      '/auth/signup-anonymous',
      expect.anything(),
    );
    expect(mockApiJson).toHaveBeenNthCalledWith(
      2,
      '/users/me',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          displayName: 'Alex',
          age: 29,
          interests: [],
          photos: [],
        }),
      }),
    );
    await waitFor(() => expect(mockSetToken).toHaveBeenCalledWith('token-123'));
    await waitFor(() =>
      expect(mockSetUser).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user-1' }),
      ),
    );
  });
});
