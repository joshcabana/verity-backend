import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter
          initialEntries={['/home']}
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole('heading', { name: /real-time matches/i }),
    ).toBeInTheDocument();
  });
});
