import React from 'react';
import { Alert } from 'react-native';
import {
  fireEvent,
  render,
  waitFor,
} from '@testing-library/react-native';
import { apiJson } from '../../src/services/api';

jest.mock('../../src/services/api', () => ({
  apiJson: jest.fn(),
}));

jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({
    token: 'test-jwt',
    logout: jest.fn(),
  }),
}));

const mockGoBack = jest.fn();
const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: mockGoBack,
    navigate: mockNavigate,
  }),
  useFocusEffect: (cb: () => void) => {
    const { useEffect } = require('react');
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      cb();
    }, [cb]);
  },
}));

jest.mock('../../src/theme/ThemeProvider', () => ({
  useTheme: () => ({
    mode: 'dark',
    colors: {
      primary: '#7C4DFF',
      background: '#111',
      card: '#1a1a2e',
      text: '#fff',
      muted: '#888',
      border: '#333',
      danger: '#e53935',
      success: '#4caf50',
    },
  }),
}));

jest.mock('../../src/components/ThemedButton', () => {
  const { TouchableOpacity, Text } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: ({
      label,
      onPress,
      testID,
    }: {
      label: string;
      onPress?: () => void;
      testID?: string;
    }) => (
      <TouchableOpacity onPress={onPress} testID={testID}>
        <Text>{label}</Text>
      </TouchableOpacity>
    ),
  };
});

jest.mock('../../src/components/ThemedCard', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: ({
      children,
      style,
    }: {
      children: React.ReactNode;
      style?: object;
    }) => <View style={style}>{children}</View>,
  };
});

jest.mock('../../src/components/themedStyles', () => ({
  createThemedInputStyles: () => ({
    input: { borderWidth: 1, padding: 8 },
  }),
}));

import ReportScreen from '../../src/screens/settings/ReportScreen';
import BlockListScreen from '../../src/screens/settings/BlockListScreen';

describe('ReportScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert');
  });

  it('requires user ID and reason before submitting', () => {
    const { getByTestId } = render(<ReportScreen />);

    fireEvent.press(getByTestId('report-submit'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'User ID required',
      expect.any(String),
    );
    expect(apiJson).not.toHaveBeenCalled();
  });

  it('submits a report to POST /moderation/reports', async () => {
    (apiJson as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
    });

    const { getByTestId } = render(<ReportScreen />);

    fireEvent.changeText(
      getByTestId('report-user-id'),
      'user-to-report',
    );
    fireEvent.press(
      getByTestId('reason-inappropriate-behaviour'),
    );
    fireEvent.changeText(
      getByTestId('report-details'),
      'Was rude during call',
    );
    fireEvent.press(getByTestId('report-submit'));

    await waitFor(() => {
      expect(apiJson).toHaveBeenCalledWith(
        '/moderation/reports',
        {
          method: 'POST',
          body: JSON.stringify({
            reportedUserId: 'user-to-report',
            reason: 'Inappropriate behaviour',
            details: 'Was rude during call',
          }),
        },
      );
    });
  });
});

describe('BlockListScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert');
  });

  it('fetches blocked users on mount', async () => {
    (apiJson as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      data: [
        {
          id: 'block-1',
          blockedUserId: 'user-abc',
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
    });

    const { getByText } = render(<BlockListScreen />);

    await waitFor(() => {
      expect(getByText('user-abc')).toBeTruthy();
    });

    expect(apiJson).toHaveBeenCalledWith('/moderation/blocks');
  });

  it('shows empty state when no blocks exist', async () => {
    (apiJson as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      data: [],
    });

    const { getByText } = render(<BlockListScreen />);

    await waitFor(() => {
      expect(getByText('No blocked users.')).toBeTruthy();
    });
  });
});
