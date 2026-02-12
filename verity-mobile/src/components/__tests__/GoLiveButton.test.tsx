import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import GoLiveButton from '../GoLiveButton';

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

describe('GoLiveButton', () => {
  it('fires onPress when enabled', () => {
    const onPress = jest.fn();
    const { getByRole } = render(<GoLiveButton onPress={onPress} />);

    fireEvent.press(getByRole('button', { name: 'Go Live Now' }));

    expect(onPress).toHaveBeenCalled();
  });

  it('disables the button when balance is low or loading', () => {
    const onPress = jest.fn();
    const { getByRole, rerender } = render(
      <GoLiveButton onPress={onPress} disabled />,
    );

    const disabledButton = getByRole('button', { name: 'Go Live Now' });
    expect(disabledButton.props.disabled).toBe(true);

    rerender(<GoLiveButton onPress={onPress} loading />);

    const loadingButton = getByRole('button', { name: 'Joining...' });
    expect(loadingButton.props.disabled).toBe(true);
  });
});
