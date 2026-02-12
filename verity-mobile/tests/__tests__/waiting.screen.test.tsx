import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import WaitingScreen from '../../src/screens/WaitingScreen';

const mockReset = jest.fn();
const mockGoBack = jest.fn();
const mockSetUser = jest.fn();
const mockTrackEvent = jest.fn();

type QueueStateMock = {
  status: 'idle' | 'joining' | 'waiting' | 'matched';
  estimatedSeconds: number | null;
  usersSearching: number | null;
  queueKey: string | null;
  match: Record<string, unknown> | null;
  leaveQueue: jest.Mock<Promise<boolean>, []>;
};

let mockQueueState: QueueStateMock;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    reset: mockReset,
    goBack: mockGoBack,
  }),
}));

jest.mock('../../src/hooks/useQueue', () => ({
  useQueue: () => mockQueueState,
}));

jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', tokenBalance: 2 },
    setUser: mockSetUser,
  }),
}));

jest.mock('../../src/services/analytics', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
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

describe('WaitingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueueState = {
      status: 'idle',
      estimatedSeconds: null,
      usersSearching: null,
      queueKey: 'queue-1',
      match: null,
      leaveQueue: jest.fn().mockResolvedValue(false),
    };
  });

  it('prioritizes users searching over estimated seconds', () => {
    mockQueueState.status = 'waiting';
    mockQueueState.usersSearching = 9;
    mockQueueState.estimatedSeconds = 24;

    const { getByText } = render(<WaitingScreen />);

    expect(getByText('9 users currently searching')).toBeTruthy();
  });

  it('falls back to estimated seconds when users searching is unavailable', () => {
    mockQueueState.status = 'waiting';
    mockQueueState.usersSearching = null;
    mockQueueState.estimatedSeconds = 24;

    const { getByText } = render(<WaitingScreen />);

    expect(getByText('Estimated wait: 24s')).toBeTruthy();
  });

  it('falls back to estimated seconds when usersSearching is undefined', () => {
    mockQueueState.status = 'waiting';
    mockQueueState.usersSearching = undefined as unknown as number | null;
    mockQueueState.estimatedSeconds = 15;

    const { getByText } = render(<WaitingScreen />);

    expect(getByText('Estimated wait: 15s')).toBeTruthy();
  });

  it('applies refund behavior from leaveQueue result on cancel', async () => {
    mockQueueState.status = 'waiting';
    mockQueueState.leaveQueue.mockResolvedValue(true);

    const { getByText } = render(<WaitingScreen />);
    fireEvent.press(getByText('Leave queue'));

    await waitFor(() => expect(mockQueueState.leaveQueue).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(mockSetUser).toHaveBeenCalledWith(
        expect.objectContaining({ tokenBalance: 3 }),
      ),
    );
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('navigates to video only once for repeated match payloads with same session', () => {
    mockQueueState.status = 'matched';
    mockQueueState.match = { sessionId: 'session-1', partnerId: 'partner-1' };

    const { rerender } = render(<WaitingScreen />);
    expect(mockReset).toHaveBeenCalledTimes(1);

    mockQueueState.match = { sessionId: 'session-1', partnerId: 'partner-2' };
    rerender(<WaitingScreen />);

    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it('shows timeout prompt and tracks timeout shown once', () => {
    jest.useFakeTimers();
    try {
      mockQueueState.status = 'waiting';
      const { getByText } = render(<WaitingScreen />);

      act(() => {
        jest.advanceTimersByTime(46_000);
      });

      expect(getByText('No one nearby yet.')).toBeTruthy();
      expect(mockTrackEvent).toHaveBeenCalledWith(
        'queue_timeout_shown',
        expect.objectContaining({
          queueKey: 'queue-1',
          elapsedSeconds: expect.any(Number),
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('tracks timeout continue and hides prompt', () => {
    jest.useFakeTimers();
    try {
      mockQueueState.status = 'waiting';
      const { getByText, queryByText } = render(<WaitingScreen />);

      act(() => {
        jest.advanceTimersByTime(46_000);
      });
      fireEvent.press(getByText('Keep searching'));

      expect(mockTrackEvent).toHaveBeenCalledWith(
        'queue_timeout_continue',
        expect.objectContaining({
          queueKey: 'queue-1',
          elapsedSeconds: expect.any(Number),
        }),
      );
      expect(queryByText('No one nearby yet.')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('tracks timeout leave event with refund outcome', async () => {
    jest.useFakeTimers();
    try {
      mockQueueState.status = 'waiting';
      mockQueueState.leaveQueue.mockResolvedValue(true);
      const { getAllByText } = render(<WaitingScreen />);

      act(() => {
        jest.advanceTimersByTime(46_000);
      });
      fireEvent.press(getAllByText('Leave queue')[0]);

      await waitFor(() =>
        expect(mockTrackEvent).toHaveBeenCalledWith(
          'queue_timeout_leave',
          expect.objectContaining({
            queueKey: 'queue-1',
            elapsedSeconds: expect.any(Number),
            refunded: true,
          }),
        ),
      );
    } finally {
      jest.useRealTimers();
    }
  });
});
