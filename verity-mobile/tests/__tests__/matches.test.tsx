import React from 'react';
import { render } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MatchesListScreen from '../../src/screens/matches/MatchesListScreen';

const mockInvalidateQueries = jest.fn();
const mockUseMatchesQuery = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

jest.mock('../../src/hooks/useWebSocket', () => ({
  useWebSocket: () => ({ socket: null, connected: false }),
}));

jest.mock('../../src/queries/useMatchesQuery', () => ({
  useMatchesQuery: () => mockUseMatchesQuery(),
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
        <Stack.Screen name="Matches" component={MatchesListScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

describe('Matches list', () => {
  beforeEach(() => {
    mockUseMatchesQuery.mockReset();
  });

  it('renders revealed match cards with profile data', () => {
    mockUseMatchesQuery.mockReturnValue({
      data: [
        {
          matchId: 'match-1',
          partnerRevealVersion: 1,
          revealAcknowledged: true,
          revealAcknowledgedAt: '2025-01-01T00:00:00.000Z',
          partnerReveal: {
            id: 'user-1',
            displayName: 'Avery',
            primaryPhotoUrl: 'https://example.com/photo1.jpg',
            age: 26,
            bio: 'Coffee and coastlines.',
          },
        },
      ],
      isFetching: false,
    });

    const { getByText } = render(<TestNavigator />);

    expect(getByText('Avery')).toBeTruthy();
    expect(getByText('Coffee and coastlines.')).toBeTruthy();
  });

  it('renders placeholder copy when reveal is not acknowledged', () => {
    mockUseMatchesQuery.mockReturnValue({
      data: [
        {
          matchId: 'match-1',
          partnerRevealVersion: 1,
          revealAcknowledged: false,
          revealAcknowledgedAt: null,
          partnerReveal: null,
        },
      ],
      isFetching: false,
    });

    const { getByText } = render(<TestNavigator />);

    expect(getByText('New match')).toBeTruthy();
    expect(getByText('Open this match to view the profile reveal.')).toBeTruthy();
  });
});
