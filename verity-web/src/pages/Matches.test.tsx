import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Matches } from './Matches';
import { HttpResponse, http, server } from '../test/setup';

const API_URL = 'http://localhost:3000';

function ChatRouteProbe() {
  const { matchId } = useParams();
  return <div>chat route: {matchId}</div>;
}

function renderMatches() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={['/matches']}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Routes>
          <Route path="/matches" element={<Matches />} />
          <Route path="/chat/:matchId" element={<ChatRouteProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Matches page', () => {
  it('renders placeholder content when reveal is not acknowledged', async () => {
    server.use(
      http.get(`${API_URL}/matches`, () =>
        HttpResponse.json([
          {
            matchId: 'match-1',
            partnerRevealVersion: 1,
            revealAcknowledged: false,
            revealAcknowledgedAt: null,
            partnerReveal: null,
          },
        ]),
      ),
    );

    renderMatches();

    expect(await screen.findByText('New match')).toBeInTheDocument();
    expect(
      screen.getByText('Open this match to view the profile reveal.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open chat' }));
    expect(await screen.findByText('chat route: match-1')).toBeInTheDocument();
  });

  it('renders reveal details when acknowledged', async () => {
    server.use(
      http.get(`${API_URL}/matches`, () =>
        HttpResponse.json([
          {
            matchId: 'match-2',
            partnerRevealVersion: 1,
            revealAcknowledged: true,
            revealAcknowledgedAt: '2025-01-01T00:00:00.000Z',
            partnerReveal: {
              id: 'user-2',
              displayName: 'Alex',
              primaryPhotoUrl: 'https://example.com/alex.jpg',
              age: 28,
              bio: 'Coffee and coastlines.',
            },
          },
        ]),
      ),
    );

    renderMatches();

    expect(await screen.findByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('Coffee and coastlines.')).toBeInTheDocument();
    expect(screen.getByText('Reveal complete')).toBeInTheDocument();
  });
});
