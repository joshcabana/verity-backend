import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor, act } from '@testing-library/react-native';
import DecisionScreen from '../DecisionScreen';
import TokenShopScreen from '../TokenShopScreen';
import { openCheckoutSession } from '../../services/stripe';
import { useAuth } from '../../hooks/useAuth';
import { server, rest } from '../../../setupTests';

const mockReset = jest.fn();

let routeParams: Record<string, unknown> | undefined = {
  sessionId: 'session-1',
};

const mockSubmitChoice = jest.fn();
const mockStartAutoPass = jest.fn();

type DecisionState = {
  status: 'idle' | 'submitting' | 'waiting' | 'resolved';
  result: null | { outcome: 'mutual' | 'rejected'; matchId?: string };
  submitChoice: typeof mockSubmitChoice;
  startAutoPass: typeof mockStartAutoPass;
};

let decisionState: DecisionState = {
  status: 'idle',
  result: null,
  submitChoice: mockSubmitChoice,
  startAutoPass: mockStartAutoPass,
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    reset: mockReset,
  }),
  useRoute: () => ({ params: routeParams }),
}));

jest.mock('../../hooks/useDecision', () => ({
  useDecision: () => decisionState,
}));

jest.mock('../../services/stripe', () => {
  const actual = jest.requireActual('../../services/stripe');
  return {
    ...actual,
    openCheckoutSession: jest.fn(),
    useStripeRedirectHandler: jest.fn(),
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

describe('DecisionScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    routeParams = { sessionId: 'session-1' };
    decisionState = {
      status: 'idle',
      result: null,
      submitChoice: mockSubmitChoice,
      startAutoPass: mockStartAutoPass,
    };
  });

  it('matches the default snapshot', () => {
    const tree = render(<DecisionScreen />).toJSON();
    expect(tree).toMatchSnapshot();
  });

  it('renders and submits match or pass choices', () => {
    const { getByText } = render(<DecisionScreen />);

    expect(mockStartAutoPass).toHaveBeenCalled();

    fireEvent.press(getByText('Match'));
    fireEvent.press(getByText('Pass'));

    expect(mockSubmitChoice).toHaveBeenCalledWith('MATCH');
    expect(mockSubmitChoice).toHaveBeenCalledWith('PASS');
  });

  it('navigates to chat on a mutual match result', async () => {
    decisionState = {
      status: 'resolved',
      result: { outcome: 'mutual', matchId: 'match-1' },
      submitChoice: mockSubmitChoice,
      startAutoPass: mockStartAutoPass,
    };

    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());

    render(<DecisionScreen />);

    await waitFor(() =>
      expect(mockReset).toHaveBeenCalledWith({
        index: 0,
        routes: [{ name: 'Chat', params: { matchId: 'match-1' } }],
      }),
    );
  });

  it('shows a fallback when the session is missing', () => {
    routeParams = undefined;

    const { getByText } = render(<DecisionScreen />);

    expect(getByText('Session unavailable')).toBeTruthy();
    fireEvent.press(getByText('Back to Home'));
    expect(mockReset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'Main', params: { screen: 'Home' } }],
    });
  });
});

describe('TokenShopScreen', () => {
  const API_URL = 'http://localhost:3000';

  beforeEach(() => {
    jest.clearAllMocks();
    routeParams = {};
    useAuth.setState((state) => ({
      ...state,
      token: 'token',
      user: { id: 'user-1', tokenBalance: 2 },
    }));

    server.use(
      rest.get(`${API_URL}/tokens/balance`, (_req: any, res: any, ctx: any) =>
        res(ctx.status(200), ctx.json({ tokenBalance: 2 })),
      ),
      rest.post(`${API_URL}/tokens/purchase`, (_req: any, res: any, ctx: any) =>
        res(
          ctx.status(200),
          ctx.json({ checkoutUrl: 'https://checkout.example.com', sessionId: 'sess-1' }),
        ),
      ),
    );
  });

  it('starts checkout when a token pack is purchased', async () => {
    const { getByTestId, getByText } = render(<TokenShopScreen />);

    await waitFor(() => expect(getByText('Token balance')).toBeTruthy());

    fireEvent.press(getByTestId('token-pack-buy-starter'));

    await waitFor(() =>
      expect(openCheckoutSession).toHaveBeenCalledWith('https://checkout.example.com'),
    );
    await waitFor(() =>
      expect(getByText('Waiting for payment confirmation...')).toBeTruthy(),
    );
  });

  it('stops polling once the balance increases', async () => {
    jest.useFakeTimers();

    server.use(
      rest.get(`${API_URL}/tokens/balance`, (_req: any, res: any, ctx: any) =>
        res(ctx.status(200), ctx.json({ tokenBalance: 5 })),
      ),
    );

    const { getByTestId } = render(<TokenShopScreen />);

    fireEvent.press(getByTestId('token-pack-buy-starter'));

    await waitFor(() =>
      expect(openCheckoutSession).toHaveBeenCalledWith('https://checkout.example.com'),
    );

    act(() => {
      jest.advanceTimersByTime(3000);
    });

    jest.useRealTimers();
  });
});
