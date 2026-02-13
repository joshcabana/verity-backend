import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ReportDialog } from './ReportDialog';

const apiJsonMock = vi.fn();

vi.mock('../api/client', () => ({
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  apiJson: (...args: unknown[]) => apiJsonMock(...args),
}));

describe('ReportDialog', () => {
  beforeEach(() => {
    apiJsonMock.mockReset();
  });

  it('submits a report successfully', async () => {
    apiJsonMock.mockResolvedValue({ ok: true, status: 201, data: {} });
    render(<ReportDialog reportedUserId="user-2" />);

    fireEvent.click(screen.getByRole('button', { name: /report user/i }));
    fireEvent.change(screen.getByLabelText(/details/i), {
      target: { value: 'Unsafe behavior' },
    });
    fireEvent.click(screen.getByRole('button', { name: /submit report/i }));

    await waitFor(() => {
      expect(apiJsonMock).toHaveBeenCalledWith('/moderation/reports', {
        method: 'POST',
        body: {
          reportedUserId: 'user-2',
          reason: 'Harassment or hate speech',
          details: 'Unsafe behavior',
        },
      });
    });
    expect(
      await screen.findByText(
        /report submitted. thank you for helping keep verity safe/i,
      ),
    ).toBeInTheDocument();
  });

  it('shows an error when submission fails', async () => {
    apiJsonMock.mockResolvedValue({ ok: false, status: 500, data: null });
    render(<ReportDialog reportedUserId="user-2" />);

    fireEvent.click(screen.getByRole('button', { name: /report user/i }));
    fireEvent.click(screen.getByRole('button', { name: /submit report/i }));

    expect(
      await screen.findByText(
        /we could not submit the report. please try again/i,
      ),
    ).toBeInTheDocument();
  });

  it('focuses reason field on open and closes on escape', async () => {
    render(<ReportDialog reportedUserId="user-2" />);

    const trigger = screen.getByRole('button', { name: /report user/i });
    fireEvent.click(trigger);

    const reason = screen.getByLabelText(/reason/i);
    expect(reason).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(trigger).toHaveFocus();
  });

  it('closes when clicking the modal backdrop', async () => {
    render(<ReportDialog reportedUserId="user-2" />);

    fireEvent.click(screen.getByRole('button', { name: /report user/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.mouseDown(dialog);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
