import React from 'react';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Legal } from './Legal';
import { renderWithProviders } from '../test/testUtils';
import { legalDocs } from '../legal/generated';

describe('Legal', () => {
  it('renders generated legal content for selected document', () => {
    renderWithProviders(<Legal />, {
      route: '/legal/privacy',
      path: '/legal/:doc',
    });

    expect(
      screen.getByRole('heading', { name: legalDocs.privacy.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(legalDocs.privacy.sections[0].heading)).toBeInTheDocument();
  });
});
