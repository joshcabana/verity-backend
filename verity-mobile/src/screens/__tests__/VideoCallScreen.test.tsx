import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import VideoCallScreen from '../VideoCallScreen';
import { leaveAgoraChannel, setupAgoraEngine } from '../../services/agora';

const mockReset = jest.fn();
const mockGoBack = jest.fn();

type SessionStartPayload = {
  sessionId: string;
  channelName: string;
  rtc: { token: string; uid: number };
  rtm: { token: string; userId: string };
  startAt: string;
  endAt: string;
  expiresAt: string;
  durationSeconds: number;
};

let mockRouteParams: Record<string, unknown> | undefined = {
  sessionId: 'session-1',
};

let mockLastSessionStartPayload: SessionStartPayload | null = {
  sessionId: 'session-1',
  channelName: 'room-1',
  rtc: { token: 'token-1', uid: 777 },
  rtm: { token: 'rtm-token', userId: 'user-1' },
  startAt: new Date().toISOString(),
  endAt: new Date(Date.now() + 45_000).toISOString(),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  durationSeconds: 45,
};

const socketHandlers: Record<string, (payload?: { sessionId?: string }) => void> = {};

const mockSocket = {
  on: jest.fn((event: string, handler: (payload?: { sessionId?: string }) => void) => {
    socketHandlers[event] = handler;
  }),
  off: jest.fn((event: string) => {
    delete socketHandlers[event];
  }),
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    reset: mockReset,
    goBack: mockGoBack,
  }),
  useRoute: () => ({ params: mockRouteParams }),
}));

jest.mock('../../hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    videoSocket: mockSocket,
    socket: mockSocket,
    lastSessionStart: mockLastSessionStartPayload,
  }),
}));

const mockMuteLocalAudioStream = jest.fn();
const mockSwitchCamera = jest.fn();

jest.mock('../../services/agora', () => ({
  setupAgoraEngine: jest.fn(),
  leaveAgoraChannel: jest.fn(),
}));

jest.mock('../../components/CountdownTimer', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return function MockCountdownTimer(props: {
    isActive: boolean;
    testID?: string;
    durationSeconds: number;
  }) {
    return (
      <Text testID={props.testID || 'countdown'}>
        {props.isActive ? `active-${props.durationSeconds}` : `inactive-${props.durationSeconds}`}
      </Text>
    );
  };
});

jest.mock('../../components/LocalVideoView', () => {
  const React = require('react');
  const { View } = require('react-native');
  return function MockLocalVideoView() {
    return <View testID="local-video" />;
  };
});

jest.mock('../../components/RemoteVideoView', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return function MockRemoteVideoView({ uid }: { uid: number | null }) {
    return (
      <Text testID="remote-video">{uid ? `remote-${uid}` : 'remote-waiting'}</Text>
    );
  };
});

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

describe('VideoCallScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = { sessionId: 'session-1' };
    mockLastSessionStartPayload = {
      sessionId: 'session-1',
      channelName: 'room-1',
      rtc: { token: 'token-1', uid: 777 },
      rtm: { token: 'rtm-token', userId: 'user-1' },
      startAt: new Date().toISOString(),
      endAt: new Date(Date.now() + 45_000).toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      durationSeconds: 45,
    };
    Object.keys(socketHandlers).forEach((key) => delete socketHandlers[key]);

    (setupAgoraEngine as jest.Mock).mockImplementation((options?: {
      onJoinSuccess?: () => void;
      onUserJoined?: (uid: number) => void;
    }) => {
      if (options?.onJoinSuccess) {
        options.onJoinSuccess();
      }
      if (options?.onUserJoined) {
        options.onUserJoined(42);
      }
      return Promise.resolve({
        muteLocalAudioStream: mockMuteLocalAudioStream,
        switchCamera: mockSwitchCamera,
      });
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('bootstraps from session:start payload and activates the timer', async () => {
    const { getByTestId, getByText } = render(<VideoCallScreen />);

    expect(getByTestId('local-video')).toBeTruthy();
    expect(getByTestId('remote-video').props.children).toBe('remote-42');

    await waitFor(() => expect(getByText('Live now')).toBeTruthy());
    await waitFor(() =>
      expect(getByTestId('call-countdown').props.children).toBe('active-45'),
    );

    expect(setupAgoraEngine).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'room-1',
        token: 'token-1',
        uid: 777,
      }),
    );
  });

  it('toggles mute and flips camera', async () => {
    const { getByText } = render(<VideoCallScreen />);

    await waitFor(() => expect(getByText('Live now')).toBeTruthy());

    fireEvent.press(getByText('Mute'));
    await waitFor(() => expect(mockMuteLocalAudioStream).toHaveBeenCalledWith(true));
    expect(getByText('Unmute')).toBeTruthy();

    fireEvent.press(getByText('Rear cam'));
    await waitFor(() => expect(mockSwitchCamera).toHaveBeenCalled());
    expect(getByText('Front cam')).toBeTruthy();
  });

  it('ends the session from the hangup button', () => {
    const { getByText } = render(<VideoCallScreen />);

    fireEvent.press(getByText('End'));

    expect(leaveAgoraChannel).toHaveBeenCalled();
    expect(mockReset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'Decision', params: { sessionId: 'session-1' } }],
    });
  });

  it('ends the session when the server emits session:end', () => {
    render(<VideoCallScreen />);

    socketHandlers['session:end']?.({ sessionId: 'session-1' });

    expect(mockReset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'Decision', params: { sessionId: 'session-1' } }],
    });
  });

  it('falls back to legacy route params after the timeout gate', async () => {
    jest.useFakeTimers();
    mockRouteParams = {
      sessionId: 'session-1',
      channelToken: 'legacy-token',
      agoraChannel: 'legacy-room',
    };
    mockLastSessionStartPayload = null;

    render(<VideoCallScreen />);

    expect(setupAgoraEngine).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1_600);
    });

    await waitFor(() =>
      expect(setupAgoraEngine).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'legacy-room',
          token: 'legacy-token',
        }),
      ),
    );
  });

  it('shows a fallback when session params are missing', () => {
    mockRouteParams = undefined;
    mockLastSessionStartPayload = null;

    const { getByText } = render(<VideoCallScreen />);

    expect(getByText('Unable to start call')).toBeTruthy();
    fireEvent.press(getByText('Back to Home'));
    expect(mockGoBack).toHaveBeenCalled();
  });
});
