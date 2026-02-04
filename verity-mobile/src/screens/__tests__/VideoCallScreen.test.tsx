import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import VideoCallScreen from '../VideoCallScreen';
import { setupAgoraEngine, leaveAgoraChannel } from '../../services/agora';

const mockReset = jest.fn();
const mockGoBack = jest.fn();

let routeParams: Record<string, unknown> | undefined = {
  sessionId: 'session-1',
  channelToken: 'token-1',
  agoraChannel: 'room-1',
};

const socketHandlers: Record<string, (payload?: { sessionId?: string }) => void> = {};

const socketMock = {
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
  useRoute: () => ({ params: routeParams }),
}));

jest.mock('../../hooks/useWebSocket', () => ({
  useWebSocket: () => ({ socket: socketMock }),
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
  return function MockCountdownTimer(props: { isActive: boolean; testID?: string }) {
    return (
      <Text testID={props.testID || 'countdown'}>
        {props.isActive ? 'active' : 'inactive'}
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
    routeParams = {
      sessionId: 'session-1',
      channelToken: 'token-1',
      agoraChannel: 'room-1',
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

  it('renders video views and activates the timer after join', async () => {
    const { getByTestId, getByText } = render(<VideoCallScreen />);

    expect(getByTestId('local-video')).toBeTruthy();
    expect(getByTestId('remote-video').props.children).toBe('remote-42');

    await waitFor(() => expect(getByText('Live now')).toBeTruthy());
    await waitFor(() =>
      expect(getByTestId('call-countdown').props.children).toBe('active'),
    );
  });

  it('toggles mute and flips camera', async () => {
    const { getByText } = render(<VideoCallScreen />);

    await waitFor(() => expect(getByText('Live now')).toBeTruthy());

    fireEvent.press(getByText('Mute'));
    expect(mockMuteLocalAudioStream).toHaveBeenCalledWith(true);
    expect(getByText('Unmute')).toBeTruthy();

    fireEvent.press(getByText('Rear cam'));
    expect(mockSwitchCamera).toHaveBeenCalled();
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

  it('shows a fallback when session params are missing', () => {
    routeParams = undefined;

    const { getByText } = render(<VideoCallScreen />);

    expect(getByText('Unable to start call')).toBeTruthy();
    fireEvent.press(getByText('Back to Home'));
    expect(mockGoBack).toHaveBeenCalled();
  });
});
