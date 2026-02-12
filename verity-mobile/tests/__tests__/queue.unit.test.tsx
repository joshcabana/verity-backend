import { act } from '@testing-library/react-native';
import { useQueueStore } from '../../src/hooks/useQueue';
import { apiJson } from '../../src/services/api';

// Mock the API service
jest.mock('../../src/services/api', () => ({
  apiJson: jest.fn(),
}));

describe('useQueue (Unit)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset store state
    act(() => {
      useQueueStore.setState({
        status: 'idle',
        estimatedSeconds: null,
        match: null,
        tokenSpent: false,

      });
    });
  });

  describe('leaveQueue', () => {
    it('returns false if status is idle', async () => {
      useQueueStore.setState({ status: 'idle' });
      const result = await useQueueStore.getState().leaveQueue();
      expect(result).toBe(false);
      expect(apiJson).not.toHaveBeenCalled();
    });

    it('trusts backend refunded: true', async () => {
      useQueueStore.setState({ status: 'waiting', tokenSpent: false }); // local says false
      (apiJson as jest.Mock).mockResolvedValue({
        ok: true,
        data: { status: 'left', refunded: true },
      });

      const result = await useQueueStore.getState().leaveQueue();

      expect(apiJson).toHaveBeenCalledWith('/queue/leave', { method: 'DELETE' });
      expect(result).toBe(true);
      expect(useQueueStore.getState().status).toBe('idle');
    });

    it('trusts backend refunded: false', async () => {
      useQueueStore.setState({ status: 'waiting', tokenSpent: true }); // local says true
      (apiJson as jest.Mock).mockResolvedValue({
        ok: true,
        data: { status: 'left', refunded: false },
      });

      const result = await useQueueStore.getState().leaveQueue();

      expect(result).toBe(false);
      expect(useQueueStore.getState().status).toBe('idle');
    });

    it('falls back to local heuristic if refunded field is missing', async () => {
      useQueueStore.setState({ status: 'waiting', tokenSpent: true });
      (apiJson as jest.Mock).mockResolvedValue({
        ok: true,
        data: { status: 'left' }, // missing refunded
      });

      const result = await useQueueStore.getState().leaveQueue();

      expect(result).toBe(true); // true && true && status!=matched -> true
    });

    it('falls back to local heuristic: returns false if already matched', async () => {
      // If we leave while matched, typically we don't get a refund unless backend says so.
      // With fallback:
      useQueueStore.setState({ status: 'matched', tokenSpent: true });
      (apiJson as jest.Mock).mockResolvedValue({
        ok: true,
        data: { status: 'left' }, // missing refunded
      });

      const result = await useQueueStore.getState().leaveQueue();

      expect(result).toBe(false); // status matched prevents refund in fallback
    });

    it('handles API error gracefully', async () => {
      useQueueStore.setState({ status: 'waiting', tokenSpent: true });
      (apiJson as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        data: null,
      });

      const result = await useQueueStore.getState().leaveQueue();

      expect(result).toBe(false); // ok is false
      expect(useQueueStore.getState().status).toBe('idle'); // We still clear state locally
    });
  });
});
