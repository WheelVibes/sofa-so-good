import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CreditsModal } from './CreditsModal';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        furniture: [
          {
            id: 'a',
            name: 'Armchair',
            attribution: 'Kenney',
            sourceUrl: 'https://k.nl',
            license: 'CC0',
          },
        ],
        materials: [
          {
            id: 'm',
            name: 'Oak',
            attribution: 'Poly Haven',
            sourceUrl: 'https://p.com',
            license: 'CC0',
          },
        ],
      }),
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CreditsModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<CreditsModal open={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('fetches and displays credits when opened', async () => {
    render(<CreditsModal open={true} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Armchair/)).toBeInTheDocument());
    expect(screen.getByText(/Oak/)).toBeInTheDocument();
    expect(screen.getAllByText(/CC0/).length).toBeGreaterThan(0);
  });
});
