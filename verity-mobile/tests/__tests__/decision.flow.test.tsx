import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { fireEvent, render } from '@testing-library/react-native';
import DecisionScreen from '../../src/screens/DecisionScreen';

const mockSubmitChoice = jest.fn();
const mockStartAutoPass = jest.fn();

jest.mock('../../src/hooks/useDecision', () => ({
  useDecision: () => ({
    status: 'idle',
    result: null,
    submitChoice: mockSubmitChoice,
    startAutoPass: mockStartAutoPass,
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

const Stack = createNativeStackNavigator();

function TestNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen
          name="Decision"
          component={DecisionScreen}
          initialParams={{ sessionId: 'session-1' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

describe('Decision flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('submits match choice', () => {
    const { getByText } = render(<TestNavigator />);

    fireEvent.press(getByText('Match'));

    expect(mockSubmitChoice).toHaveBeenCalledWith('MATCH');
  });

  it('submits pass choice', () => {
    const { getByText } = render(<TestNavigator />);

    fireEvent.press(getByText('Pass'));

    expect(mockSubmitChoice).toHaveBeenCalledWith('PASS');
  });
});
