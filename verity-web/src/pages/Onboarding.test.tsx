import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Onboarding } from './Onboarding';

const navigateMock = vi.fn();
const signUpMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom',
  );
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    signUp: signUpMock,
    loading: false,
  }),
}));

describe('Onboarding', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    signUpMock.mockReset();
  });

  it('requires all consents before enabling start action', async () => {
    signUpMock.mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <Onboarding />
      </MemoryRouter>,
    );

    const startButton = screen.getByRole('button', {
      name: /start anonymously/i,
    });
    expect(startButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/date of birth/i), {
      target: { value: '2000-01-01' },
    });
    fireEvent.click(screen.getByLabelText(/i confirm i am 18 or older/i));
    fireEvent.click(
      screen.getByLabelText(/i consent to 45-second video calls/i),
    );
    fireEvent.click(
      screen.getByLabelText(/i consent to real-time ai moderation/i),
    );
    fireEvent.click(screen.getByLabelText(/i agree to the/i));

    expect(startButton).toBeEnabled();

    fireEvent.click(startButton);

    await waitFor(() => {
      expect(signUpMock).toHaveBeenCalledTimes(1);
      expect(navigateMock).toHaveBeenCalledWith('/home');
    });
  });
});
