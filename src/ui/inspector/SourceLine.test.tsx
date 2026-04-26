import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SourceLine } from './SourceLine';

describe('SourceLine', () => {
  it('renders nothing when there is no attribution', () => {
    const { container } = render(<SourceLine />);
    expect(container.firstChild).toBeNull();
  });

  it('renders attribution and license', () => {
    render(<SourceLine attribution="Kenney" license="CC0" />);
    expect(screen.getByText(/Kenney/)).toBeInTheDocument();
    expect(screen.getByText(/CC0/)).toBeInTheDocument();
  });

  it('renders a link when sourceUrl is present', () => {
    render(<SourceLine attribution="Poly Haven" license="CC0" sourceUrl="https://polyhaven.com/x" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://polyhaven.com/x');
  });
});
