import { afterEach, describe, expect, it, vi } from 'vitest';
import { polyhaven } from './polyhaven';

const mockFetch = (handlers: Record<string, unknown>) =>
  vi.fn(async (url: string) => {
    for (const [pat, body] of Object.entries(handlers)) {
      if (url.includes(pat)) {
        return new Response(JSON.stringify(body), { status: 200 });
      }
    }
    return new Response('not found', { status: 404 });
  });

describe('polyhaven.fetchIndex', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns furniture and material entries', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        't=models': {
          modern_arm_chair_01: {
            name: 'Modern Arm Chair 01',
            categories: ['chair', 'seating'],
            authors: { Bob: 'modeller' },
          },
        },
        't=textures': {
          wood_floor_diff: {
            name: 'Wood Floor',
            categories: ['floor', 'wood'],
            authors: { Alice: 'photog' },
          },
        },
      }),
    );

    const entries = await polyhaven.fetchIndex();
    expect(entries.find((e) => e.kind === 'furniture')?.slug).toBe('modern_arm_chair_01');
    expect(entries.find((e) => e.kind === 'material')?.slug).toBe('wood_floor_diff');
    expect(entries[0].attribution).toContain('Poly Haven');
  });
});
