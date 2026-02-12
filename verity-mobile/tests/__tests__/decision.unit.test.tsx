import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useDecision } from '../src/hooks/useDecision';
import { apiJson } from '../src/services/api';
import { Alert } from 'react-native';

jest.mock('../src/services/api', () => ({
  apiJson: jest.fn(),
}));

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: () => ({
    logout: jest.fn(),
  }),
}));

jest.mock('../src/hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    videoSocket: {
      on: jest.fn(),
      off: jest.fn(),
    },
  }),
}));

// Mock Alert to prevent it from showing during tests
jest.spyOn(Alert, 'alert').mockImplementation(() => {});

describe('useDecision unit test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('handles immediate resolved response from choice API (GAP-007)', async () => {
    const mockMatchId = 'match-123';
    (apiJson as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        status: 'resolved',
        outcome: 'mutual',
        matchId: mockMatchId,
      },
    });

    const { result } = renderHook(() => useDecision('session-1'));

    await act(async () => {
      await result.current.submitChoice('MATCH');
    });

    expect(result.current.status).toBe('resolved');
    expect(result.current.result?.outcome).toBe('mutual');
    expect(result.current.result?.matchId).toBe(mockMatchId);
    expect(apiJson).toHaveBeenCalledWith('/sessions/session-1/choice', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ choice: 'MATCH' }),
    }));
  });

  it('transitions to waiting state when API returns pending', async () => {
    (apiJson as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        status: 'pending',
      },
    });

    const { result } = renderHook(() => useDecision('session-1'));

    await act(async () => {
      await result.current.submitChoice('MATCH');
    });

    expect(result.current.status).toBe('waiting');
    expect(result.current.result).toBeNull();
  });

  it('handles API error gracefully', async () => {
    (apiJson as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useDecision('session-1'));

    await act(async () => {
      await result.current.submitChoice('MATCH');
    });

    expect(result.current.status).toBe('idle');
    expect(Alert.alert).toHaveBeenCalledWith('Submission failed', expect.any(String));
  });
});
