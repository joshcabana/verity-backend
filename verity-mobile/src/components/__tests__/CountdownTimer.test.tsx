import React from 'react';
import { act, render } from '@testing-library/react-native';
import CountdownTimer from '../CountdownTimer';

jest.useFakeTimers();

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

describe('CountdownTimer', () => {
  it('renders a snapshot', () => {
    const tree = render(
      <CountdownTimer durationSeconds={3} isActive={false} onComplete={jest.fn()} />,
    ).toJSON();

    expect(tree).toMatchSnapshot();
  });

  it('counts down and calls onComplete once', () => {
    const onComplete = jest.fn();
    const { getByText } = render(
      <CountdownTimer durationSeconds={3} isActive onComplete={onComplete} />,
    );

    expect(getByText('3s')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(getByText('2s')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('waits to start until activated', () => {
    const onComplete = jest.fn();
    const { getByText, rerender } = render(
      <CountdownTimer durationSeconds={2} isActive={false} onComplete={onComplete} />,
    );

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(getByText('2s')).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();

    rerender(<CountdownTimer durationSeconds={2} isActive onComplete={onComplete} />);

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
