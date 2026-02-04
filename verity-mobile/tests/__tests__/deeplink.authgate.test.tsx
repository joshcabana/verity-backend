import React from 'react';
import { getStateFromPath } from '@react-navigation/native';
import { render, waitFor } from '@testing-library/react-native';
import AppNavigator, { buildLinkingConfig } from '../../src/navigation/AppNavigator';

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

const mockSetPendingRoute = jest.fn();

jest.mock('../../src/hooks/useAuth', () => ({
  PendingRoute: {},
  useAuth: () => ({
    token: null,
    user: null,
    hydrated: true,
    pendingRoute: null,
    hydrate: jest.fn(),
    logout: jest.fn(),
    setUser: jest.fn(),
    setToken: jest.fn(),
    setPendingRoute: mockSetPendingRoute,
    clearPendingRoute: jest.fn(),
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

jest.mock('../../src/hooks/useWebSocket', () => ({
  useWebSocket: () => ({ socket: null, connected: false }),
}));

describe('deep link auth gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects unauthenticated deep link to Onboarding and stores pending route', async () => {
    const linking = buildLinkingConfig('verity');
    const initialState = getStateFromPath('/settings/profile?source=deeplink', linking.config);

    const { getByText } = render(
      <AppNavigator initialState={initialState ?? undefined} linkingOverride={linking} />,
    );

    await waitFor(() =>
      expect(mockSetPendingRoute).toHaveBeenCalledWith({
        name: 'ProfileEdit',
        params: { source: 'deeplink' },
      }),
    );

    await waitFor(() => expect(getByText('Welcome to Verity')).toBeTruthy());
  });

  it('stores pending route for token shop deep link when unauthenticated', async () => {
    const linking = buildLinkingConfig('verity');
    const initialState = getStateFromPath('/tokens/success?session_id=sess_123', linking.config);

    const { getByText } = render(
      <AppNavigator initialState={initialState ?? undefined} linkingOverride={linking} />,
    );

    await waitFor(() =>
      expect(mockSetPendingRoute).toHaveBeenCalledWith({
        name: 'TokenShop',
        params: { status: 'success', session_id: 'sess_123' },
      }),
    );

    await waitFor(() => expect(getByText('Welcome to Verity')).toBeTruthy());
  });
});
