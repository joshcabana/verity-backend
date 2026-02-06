import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';

vi.mock('./hooks/useAuth', () => ({
  useAuth: () => ({
    token: null,
    signOut: vi.fn(),
  }),
}));

describe('App routing', () => {
  it('redirects unauthenticated users to onboarding', async () => {
    render(
      <MemoryRouter initialEntries={['/home']}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: /real-time matches, 45-second video, and instant decisions/i }),
    ).toBeInTheDocument();
  });
});
