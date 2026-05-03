import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { EnvironmentMap } from './EnvironmentMap';

describe('EnvironmentMap', () => {
  it('returns null under vitest so happy-dom never sees the drei CDN fetch', () => {
    const { container } = render(<EnvironmentMap />);
    expect(container.firstChild).toBeNull();
  });
});
