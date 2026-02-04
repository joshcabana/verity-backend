import React from 'react';
import { getStateFromPath } from '@react-navigation/native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import AppNavigator, { buildLinkingConfig } from '../../src/navigation/AppNavigator';

const mockLogout = jest.fn();
const mockSetUser = jest.fn();
const mockHydrate = jest.fn();
const mockSetPendingRoute = jest.fn();
const mockClearPendingRoute = jest.fn();

jest.mock('react-native-agora', () => ({
  createAgoraRtcEngine: () => ({
    initialize: jest.fn(),
    setChannelProfile: jest.fn(),
    setClientRole: jest.fn(),
    enableVideo: jest.fn(),
    startPreview: jest.fn(),
    registerEventHandler: jest.fn(),
    joinChannel: jest.fn(),
    leaveChannel: jest.fn(),
    stopPreview: jest.fn(),
    muteLocalAudioStream: jest.fn(),
    switchCamera: jest.fn(),
  }),
  ChannelProfileType: { ChannelProfileLiveBroadcasting: 1 },
  ClientRoleType: { ClientRoleBroadcaster: 1 },
  RtcSurfaceView: () => null,
}));

jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: View,
    Svg: View,
    Circle: View,
  };
});

const themeColors = {
  background: '#0B0B10',
  card: '#16161D',
  text: '#FFFFFF',
  muted: '#9A9AB2',
  border: '#232332',
  primary: '#5A5AF2',
  danger: '#FF4D4D',
  dangerSoft: '#FFB3B3',
};

jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', displayName: 'Alex', tokenBalance: 3 },
    token: 'token',
    logout: mockLogout,
    setUser: mockSetUser,
    hydrated: true,
    hydrate: mockHydrate,
    pendingRoute: null,
    setPendingRoute: mockSetPendingRoute,
    clearPendingRoute: mockClearPendingRoute,
  }),
}));

jest.mock('../../src/theme/ThemeProvider', () => ({
  useTheme: () => ({
    mode: 'dark',
    colors: themeColors,
    toggleMode: jest.fn(),
    setMode: jest.fn(),
  }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../../src/hooks/useWebSocket', () => ({
  useWebSocket: () => ({ socket: null, connected: false }),
}));

describe('SettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockImplementation((input: RequestInfo) => {
      const url = String(input);
      if (url.endsWith('/tokens/balance')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ tokenBalance: 3 }),
        }) as any;
      }
      if (url.endsWith('/auth/verify-email')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ id: 'user-1', email: 'alex@example.com' }),
        }) as any;
      }
      if (url.endsWith('/auth/verify-phone')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ id: 'user-1', phone: '+15551234567' }),
        }) as any;
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({}),
      }) as any;
    }) as any;
  });

  it('navigates to settings tab and logs out', () => {
    const linking = buildLinkingConfig('verity');
    const initialState = getStateFromPath('/settings', linking.config);
    const { getByText, queryByText } = render(
      <AppNavigator initialState={initialState ?? undefined} linkingOverride={linking} />,
    );

    expect(queryByText('Loading Verity...')).toBeNull();

    fireEvent.press(getByText('Settings'));

    expect(getByText('Token Balance')).toBeTruthy();

    const logoutButton = getByText('Log out');
    fireEvent.press(logoutButton);
    expect(mockLogout).toHaveBeenCalled();
  });

  it('opens the profile edit screen from settings', () => {
    const linking = buildLinkingConfig('verity');
    const initialState = getStateFromPath('/settings', linking.config);
    const { getByText, queryByText } = render(
      <AppNavigator initialState={initialState ?? undefined} linkingOverride={linking} />,
    );

    expect(queryByText('Loading Verity...')).toBeNull();

    fireEvent.press(getByText('Settings'));
    fireEvent.press(getByText('Edit Profile'));

    expect(getByText('Save Changes')).toBeTruthy();
  });

  it('opens the delete account confirmation screen', () => {
    const linking = buildLinkingConfig('verity');
    const initialState = getStateFromPath('/settings', linking.config);
    const { getByText } = render(
      <AppNavigator initialState={initialState ?? undefined} linkingOverride={linking} />,
    );
    fireEvent.press(getByText('Settings'));
    fireEvent.press(getByText('Delete Account'));

    expect(getByText('Type DELETE to confirm')).toBeTruthy();
  });

  it('confirms delete account and calls the API', async () => {
    const linking = buildLinkingConfig('verity');
    const initialState = getStateFromPath('/settings', linking.config);
    const { getByText, getByTestId } = render(
      <AppNavigator initialState={initialState ?? undefined} linkingOverride={linking} />,
    );
    fireEvent.press(getByText('Settings'));
    fireEvent.press(getByText('Delete Account'));

    fireEvent.changeText(getByTestId('delete-account-input'), 'DELETE');
    fireEvent.press(getByTestId('confirm-delete-button'));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/users/me'),
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );

    await waitFor(() => expect(mockLogout).toHaveBeenCalled());
  });

  it('submits verification requests for email and phone', async () => {
    const linking = buildLinkingConfig('verity');
    const initialState = getStateFromPath('/settings', linking.config);
    const { getByText, getByPlaceholderText } = render(
      <AppNavigator initialState={initialState ?? undefined} linkingOverride={linking} />,
    );

    fireEvent.press(getByText('Settings'));

    const emailInput = getByPlaceholderText('you@email.com');
    fireEvent.changeText(emailInput, 'alex@example.com');

    fireEvent.press(getByText('Verify Email'));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/verify-email'),
        expect.objectContaining({ method: 'POST' }),
      ),
    );

    await waitFor(() =>
      expect(mockSetUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'alex@example.com' }),
      ),
    );

    const phoneInput = getByPlaceholderText('+1 555 555 5555');
    fireEvent.changeText(phoneInput, '+15551234567');

    fireEvent.press(getByText('Verify Phone'));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/verify-phone'),
        expect.objectContaining({ method: 'POST' }),
      ),
    );

    await waitFor(() =>
      expect(mockSetUser).toHaveBeenCalledWith(
        expect.objectContaining({ phone: '+15551234567' }),
      ),
    );
  });
});
