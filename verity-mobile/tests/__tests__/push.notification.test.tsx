import { renderHook } from '@testing-library/react-native';
import { apiJson } from '../../src/services/api';

const mockNavigate = jest.fn();
let notificationCallback: (response: unknown) => void;

jest.mock('../../src/services/api', () => ({
  apiJson: jest.fn(),
}));

jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({
    token: 'test-jwt-token',
    logout: jest.fn(),
  }),
}));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({
    data: 'ExponentPushToken[test-device-token]',
  }),
  addNotificationResponseReceivedListener: jest.fn(
    (callback: (r: unknown) => void) => {
      notificationCallback = callback;
      return { remove: jest.fn() };
    },
  ),
}));

// Must import after mocks are declared
import { usePushNotifications } from '../../src/hooks/usePushNotifications';

const mockNavRef = {
  isReady: () => true,
  navigate: mockNavigate,
  current: null,
} as never;

describe('usePushNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (apiJson as jest.Mock).mockResolvedValue({ ok: true });
  });

  it('registers push token with POST /notifications/tokens', async () => {
    renderHook(() => usePushNotifications(mockNavRef));

    // Wait for async registration to complete
    await new Promise((r) => setTimeout(r, 50));

    expect(apiJson).toHaveBeenCalledWith('/notifications/tokens', {
      method: 'POST',
      body: JSON.stringify({
        token: 'ExponentPushToken[test-device-token]',
        platform: 'IOS',
      }),
    });
  });

  it('navigates to Chat when deepLinkTarget is "chat"', () => {
    renderHook(() => usePushNotifications(mockNavRef));

    notificationCallback({
      notification: {
        request: {
          content: {
            data: {
              deepLinkTarget: 'chat',
              matchId: 'match-abc',
            },
          },
        },
      },
    });

    expect(mockNavigate).toHaveBeenCalledWith('Chat', { matchId: 'match-abc' });
  });

  it('navigates to MatchProfile when deepLinkTarget is "reveal"', () => {
    renderHook(() => usePushNotifications(mockNavRef));

    notificationCallback({
      notification: {
        request: {
          content: {
            data: {
              deepLinkTarget: 'reveal',
              matchId: 'match-xyz',
            },
          },
        },
      },
    });

    expect(mockNavigate).toHaveBeenCalledWith('MatchProfile', {
      matchId: 'match-xyz',
    });
  });

  it('does not navigate when deepLinkTarget is missing', () => {
    renderHook(() => usePushNotifications(mockNavRef));

    notificationCallback({
      notification: {
        request: {
          content: {
            data: { matchId: 'match-abc' },
          },
        },
      },
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not navigate when matchId is missing', () => {
    renderHook(() => usePushNotifications(mockNavRef));

    notificationCallback({
      notification: {
        request: {
          content: {
            data: { deepLinkTarget: 'chat' },
          },
        },
      },
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
